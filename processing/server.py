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

from analyse import AnalysisError, analyse_geotiffs, generate_filled_layers
from colour_guide import ColourGuideError, generate_colour_guide
from layout_guide import LayoutGuideError, generate_layout_guide


HOST = "127.0.0.1"
PORT = int(os.environ.get("TOPOMAPPER_PROCESSING_PORT", "8765"))
MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024
MAX_GUIDE_BYTES = 64 * 1024 * 1024


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

    def _send_bytes(self, status: int, contents: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(contents)))
        self.send_header("Access-Control-Allow-Origin", self._allowed_origin())
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(contents)

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
        request_path = urlparse(self.path).path
        if request_path not in {"/analyze", "/layers", "/layout-guide", "/colour-guide"}:
            self._send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if request_path == "/layout-guide":
            self._create_layout_guide(length)
            return
        if request_path == "/colour-guide":
            self._create_colour_guide(length)
            return
        if length <= 0:
            self._send_json(400, {"error": "No GeoTIFF was supplied."})
            return
        if length > MAX_UPLOAD_BYTES:
            self._send_json(413, {"error": "The GeoTIFF upload is larger than the 4 GB local processing limit."})
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
            boundaries = None
            water_inputs: list[tuple[bytes, str]] = []
            if request_path == "/layers":
                boundaries_field = form["boundaries"] if "boundaries" in form else None
                if boundaries_field is None:
                    raise AnalysisError("Choose valid elevation boundaries before generating layers.")
                boundaries = json.loads(boundaries_field.value)
                water_value = form["water"] if "water" in form else None
                water_uploads = water_value if isinstance(water_value, list) else [water_value] if water_value is not None else []
                if len(water_uploads) > 12:
                    raise AnalysisError("Choose no more than 12 cropped water files at once.")
                for upload in water_uploads:
                    if not getattr(upload, "file", None):
                        raise AnalysisError("A selected water boundary file could not be read.")
                    filename = Path(getattr(upload, "filename", "water.geojson") or "water.geojson").name
                    if Path(filename).suffix.lower() not in {".geojson", ".json", ".kml"}:
                        raise AnalysisError("Water boundaries must be GeoJSON, JSON, or KML polygon files.")
                    contents = upload.file.read(MAX_GUIDE_BYTES + 1)
                    if len(contents) > MAX_GUIDE_BYTES:
                        raise AnalysisError(f"{filename} is larger than the 64 MB water-file limit.")
                    water_inputs.append((contents, filename))
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
            result = (generate_filled_layers(inputs, bounds, boundaries, water_inputs)
                      if request_path == "/layers" else analyse_geotiffs(inputs, bounds))
            self._send_json(200, result)
        except AnalysisError as error:
            self._send_json(422, {"error": str(error)})
        except json.JSONDecodeError:
            self._send_json(400, {"error": "The selected map bounds or layer boundaries could not be read."})
        except Exception as error:
            self._send_json(500, {"error": f"The local processor failed: {error}"})
        finally:
            for temporary_path in temporary_paths:
                temporary_path.unlink(missing_ok=True)

    def _create_layout_guide(self, length: int) -> None:
        if length <= 0:
            self._send_json(400, {"error": "No layout was supplied."})
            return
        if length > MAX_GUIDE_BYTES:
            self._send_json(413, {"error": "The layout guide request is larger than the 64 MB local limit."})
            return
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            self._send_json(400, {"error": "The layout guide request must be JSON."})
            return
        try:
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise LayoutGuideError("The layout guide request is malformed.")
            self._send_bytes(200, generate_layout_guide(payload), "application/pdf")
        except LayoutGuideError as error:
            self._send_json(422, {"error": str(error)})
        except json.JSONDecodeError:
            self._send_json(400, {"error": "The layout guide request could not be read."})
        except Exception as error:
            self._send_json(500, {"error": f"The printable layout guide failed: {error}"})

    def _create_colour_guide(self, length: int) -> None:
        if length <= 0:
            self._send_json(400, {"error": "No colour plan was supplied."})
            return
        if length > MAX_GUIDE_BYTES:
            self._send_json(413, {"error": "The colour guide request is larger than the 64 MB local limit."})
            return
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            self._send_json(400, {"error": "The colour guide request must be JSON."})
            return
        try:
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ColourGuideError("The colour guide request is malformed.")
            self._send_bytes(200, generate_colour_guide(payload), "application/pdf")
        except ColourGuideError as error:
            self._send_json(422, {"error": str(error)})
        except json.JSONDecodeError:
            self._send_json(400, {"error": "The colour guide request could not be read."})
        except Exception as error:
            self._send_json(500, {"error": f"The printable colour guide failed: {error}"})


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
