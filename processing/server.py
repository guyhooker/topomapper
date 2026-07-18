"""Small localhost-only HTTP service for topomapper elevation analysis."""

from __future__ import annotations

import cgi
import json
import os
import shutil
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from analyse import AnalysisError, analyse_geotiffs


HOST = "127.0.0.1"
PORT = int(os.environ.get("TOPOMAPPER_PROCESSING_PORT", "8765"))
MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "topomapper-processing/0.1"

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"[processing] {self.address_string()} {format_string % args}")

    def _allowed_origin(self) -> str:
        origin = self.headers.get("Origin", "")
        if origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:"):
            return origin
        return "http://localhost:3000"

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Access-Control-Allow-Origin", self._allowed_origin())
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self._allowed_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if urlparse(self.path).path == "/health":
            self._send_json(200, {"status": "ready", "service": "topomapper elevation processor"})
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/analyze":
            self._send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            self._send_json(400, {"error": "No GeoTIFF was supplied."})
            return
        if length > MAX_UPLOAD_BYTES:
            self._send_json(413, {"error": "The GeoTIFF is larger than the 4 GB Stage 3 limit."})
            return

        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            self._send_json(400, {"error": "The analysis request is not multipart form data."})
            return

        temporary_paths: list[Path] = []
        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": content_type,
                    "CONTENT_LENGTH": str(length),
                },
            )
            upload_value = form["geotiff"] if "geotiff" in form else None
            uploads = upload_value if isinstance(upload_value, list) else [upload_value] if upload_value is not None else []
            bounds_field = form["bounds"] if "bounds" in form else None
            if not uploads or any(not getattr(upload, "file", None) for upload in uploads):
                raise AnalysisError("Choose a GeoTIFF elevation file first.")
            if len(uploads) > 24:
                raise AnalysisError("Stage 3 can combine up to 24 GeoTIFF tiles at once.")
            if bounds_field is None:
                raise AnalysisError("Draw or reset a map area before analysing elevation.")
            bounds = json.loads(bounds_field.value)
            inputs: list[tuple[Path, str]] = []
            for upload in uploads:
                filename = Path(getattr(upload, "filename", "elevation.tif") or "elevation.tif").name
                if Path(filename).suffix.lower() not in {".tif", ".tiff"}:
                    raise AnalysisError("Choose only .tif or .tiff GeoTIFF elevation files.")
                with tempfile.NamedTemporaryFile(prefix="topomapper-", suffix=Path(filename).suffix, delete=False) as target:
                    temporary_path = Path(target.name)
                    temporary_paths.append(temporary_path)
                    shutil.copyfileobj(upload.file, target, length=1024 * 1024)
                inputs.append((temporary_path, filename))
            result = analyse_geotiffs(inputs, bounds)
            self._send_json(200, result)
        except AnalysisError as error:
            self._send_json(422, {"error": str(error)})
        except json.JSONDecodeError:
            self._send_json(400, {"error": "The selected map bounds could not be read."})
        except Exception as error:
            self._send_json(500, {"error": f"The local processor failed: {error}"})
        finally:
            for temporary_path in temporary_paths:
                temporary_path.unlink(missing_ok=True)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), RequestHandler)
    print(f"topomapper elevation processor ready at http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
