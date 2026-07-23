"""Download a cropped LINZ 8 m DEM and matching Topo50 water polygons."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


LDS_API_ROOT = "https://data.linz.govt.nz/services/api/v1"
LDS_WFS_ROOT = "https://data.linz.govt.nz"
ELEVATION_LAYER_ID = 51768
WATER_LAYERS = {
    "lakes": 50293,
    "lagoons": 50292,
    "rivers": 50328,
}
MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024 * 1024
POLL_INTERVAL_SECONDS = 2
POLL_TIMEOUT_SECONDS = 10 * 60
API_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,200}$")


class LinzDownloadError(RuntimeError):
    """A LINZ request could not be completed safely."""


class _SafeRedirectHandler(HTTPRedirectHandler):
    """Do not forward the private LDS key to a different download host."""

    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> Request | None:
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and urlparse(req.full_url).hostname != urlparse(newurl).hostname:
            redirected.remove_header("Authorization")
        return redirected


OPENER = build_opener(_SafeRedirectHandler())


def _config_directory() -> Path:
    configured = os.environ.get("TOPOMAPPER_CONFIG_DIR")
    return Path(configured).expanduser() if configured else Path.home() / "Library" / "Application Support" / "Topomapper"


def _cache_directory() -> Path:
    configured = os.environ.get("TOPOMAPPER_CACHE_DIR")
    return Path(configured).expanduser() if configured else Path.home() / "Library" / "Caches" / "Topomapper" / "linz"


def _key_path() -> Path:
    return _config_directory() / "linz-api-key"


def has_api_key() -> bool:
    try:
        return bool(load_api_key())
    except LinzDownloadError:
        return False


def load_api_key() -> str:
    path = _key_path()
    if not path.exists():
        return ""
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise LinzDownloadError("The saved LINZ access key could not be read.") from error
    if value and not API_KEY_PATTERN.fullmatch(value):
        raise LinzDownloadError("The saved LINZ access key is not valid.")
    return value


def save_api_key(value: str) -> None:
    key = value.strip()
    if not API_KEY_PATTERN.fullmatch(key):
        raise LinzDownloadError("Enter the data-access API key from your LINZ account.")
    directory = _config_directory()
    try:
        directory.mkdir(parents=True, exist_ok=True)
        path = _key_path()
        path.write_text(f"{key}\n", encoding="utf-8")
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError as error:
        raise LinzDownloadError("The LINZ access key could not be saved on this Mac.") from error


def validate_bounds(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        raise LinzDownloadError("Draw a map rectangle before downloading LINZ data.")
    try:
        bounds = {name: float(value[name]) for name in ("west", "south", "east", "north")}
    except (KeyError, TypeError, ValueError) as error:
        raise LinzDownloadError("The selected map rectangle is not valid.") from error
    if not (-180 <= bounds["west"] < bounds["east"] <= 180):
        raise LinzDownloadError("The selected map rectangle has invalid east/west bounds.")
    if not (-90 <= bounds["south"] < bounds["north"] <= 90):
        raise LinzDownloadError("The selected map rectangle has invalid north/south bounds.")
    return bounds


def build_elevation_export(bounds_value: Any) -> dict[str, Any]:
    bounds = validate_bounds(bounds_value)
    west, south, east, north = (bounds[name] for name in ("west", "south", "east", "north"))
    return {
        "crs": "EPSG:2193",
        "formats": {"grid": "image/tiff;subtype=geotiff"},
        "items": [{
            "item": f"{LDS_API_ROOT}/layers/{ELEVATION_LAYER_ID}/",
            "raster_resolution_multiplier": 1,
        }],
        "name": "topomapper-nz-8m-dem",
        "extent": {
            "type": "Polygon",
            "coordinates": [[
                [west, south],
                [west, north],
                [east, north],
                [east, south],
                [west, south],
            ]],
        },
    }


def _authorised_request(url: str, api_key: str, *, payload: dict[str, Any] | None = None) -> Request:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Accept": "application/json",
        "User-Agent": "Topomapper/0.1",
    }
    if urlparse(url).hostname == "data.linz.govt.nz":
        # Koordinates' HeaderTokenAuthentication prefix is case-sensitive in
        # practice, and is documented as lowercase "key ".
        headers["Authorization"] = f"key {api_key}"
    if data is not None:
        headers["Content-Type"] = "application/json"
    return Request(url, data=data, headers=headers, method="POST" if data is not None else "GET")


def _response_error(error: HTTPError, action: str) -> LinzDownloadError:
    detail = ""
    try:
        payload = json.loads(error.read(64 * 1024).decode("utf-8", errors="replace"))
        if isinstance(payload, dict):
            raw_detail = payload.get("detail") or payload.get("error") or payload.get("invalid_reasons")
            if raw_detail:
                detail = f": {raw_detail}"
    except (json.JSONDecodeError, OSError):
        pass
    return LinzDownloadError(f"LINZ could not {action} (HTTP {error.code}){detail}")


def _request_json(request: Request, action: str) -> dict[str, Any]:
    try:
        with OPENER.open(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise _response_error(error, action) from error
    except (URLError, TimeoutError) as error:
        raise LinzDownloadError(f"LINZ could not {action}. Check the internet connection and try again.") from error
    except json.JSONDecodeError as error:
        raise LinzDownloadError(f"LINZ returned an unreadable response while trying to {action}.") from error
    if not isinstance(payload, dict):
        raise LinzDownloadError(f"LINZ returned an unexpected response while trying to {action}.")
    return payload


def _create_and_wait_for_export(bounds: dict[str, float], api_key: str) -> str:
    created = _request_json(
        _authorised_request(f"{LDS_API_ROOT}/exports/", api_key, payload=build_elevation_export(bounds)),
        "start the elevation export",
    )
    state = str(created.get("state", "processing"))
    status_url = created.get("url")
    deadline = time.monotonic() + POLL_TIMEOUT_SECONDS
    while state == "processing":
        if not isinstance(status_url, str) or not status_url.startswith("https://data.linz.govt.nz/"):
            raise LinzDownloadError("LINZ did not provide a valid elevation-export status address.")
        if time.monotonic() >= deadline:
            raise LinzDownloadError("The LINZ elevation export is still processing. Try again in a few minutes.")
        time.sleep(POLL_INTERVAL_SECONDS)
        created = _request_json(_authorised_request(status_url, api_key), "check the elevation export")
        state = str(created.get("state", ""))
    if state != "complete":
        raise LinzDownloadError(f"The LINZ elevation export ended with status '{state or 'unknown'}'.")
    download_url = created.get("download_url")
    if not isinstance(download_url, str) or not download_url.startswith("https://"):
        raise LinzDownloadError("LINZ completed the elevation export without a download address.")
    return download_url


def _stream_download(request: Request, destination: Path, action: str) -> None:
    try:
        with OPENER.open(request, timeout=120) as response, destination.open("wb") as target:
            expected = response.headers.get("Content-Length")
            if expected and int(expected) > MAX_DOWNLOAD_BYTES:
                raise LinzDownloadError("The LINZ download is larger than Topomapper's 4 GB safety limit.")
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_DOWNLOAD_BYTES:
                    raise LinzDownloadError("The LINZ download is larger than Topomapper's 4 GB safety limit.")
                target.write(chunk)
    except HTTPError as error:
        raise _response_error(error, action) from error
    except (URLError, TimeoutError, OSError, ValueError) as error:
        if isinstance(error, LinzDownloadError):
            raise
        raise LinzDownloadError(f"LINZ could not {action}. Check the internet connection and free disk space.") from error


def _extract_geotiffs(archive: Path, destination: Path) -> list[Path]:
    if not zipfile.is_zipfile(archive):
        with archive.open("rb") as source:
            signature = source.read(4)
        if signature in {b"II*\x00", b"MM\x00*"}:
            output = destination / "nz-8m-dem.tif"
            shutil.copyfile(archive, output)
            return [output]
        raise LinzDownloadError("The LINZ elevation export is not a readable GeoTIFF archive.")
    results: list[Path] = []
    extracted_bytes = 0
    with zipfile.ZipFile(archive) as source:
        for member in source.infolist():
            suffix = Path(member.filename).suffix.lower()
            if member.is_dir() or suffix not in {".tif", ".tiff"}:
                continue
            extracted_bytes += member.file_size
            if extracted_bytes > MAX_DOWNLOAD_BYTES:
                raise LinzDownloadError("The uncompressed LINZ elevation data exceeds the 4 GB safety limit.")
            raw_name = Path(member.filename).name
            name = re.sub(r"[^A-Za-z0-9._-]", "-", raw_name)
            if not name or name.startswith("."):
                name = f"nz-8m-dem-{len(results) + 1}{suffix}"
            output = destination / name
            counter = 2
            while output.exists():
                output = destination / f"{Path(name).stem}-{counter}{suffix}"
                counter += 1
            with source.open(member) as incoming, output.open("wb") as outgoing:
                shutil.copyfileobj(incoming, outgoing, length=1024 * 1024)
            results.append(output)
    if not results:
        raise LinzDownloadError("The LINZ elevation export contains no GeoTIFF files.")
    if len(results) > 24:
        raise LinzDownloadError("The selected area produced more than 24 elevation files. Choose a smaller area.")
    return results


def _download_water(bounds: dict[str, float], api_key: str, destination: Path) -> list[Path]:
    results: list[Path] = []
    bbox = f"{bounds['west']},{bounds['south']},{bounds['east']},{bounds['north']},EPSG:4326"
    for name, layer_id in WATER_LAYERS.items():
        query = urlencode({
            "service": "WFS",
            "version": "1.0.0",
            "request": "GetFeature",
            "typeName": f"layer-{layer_id}",
            "outputFormat": "json",
            "srsName": "EPSG:4326",
            "bbox": bbox,
        })
        url = f"{LDS_WFS_ROOT}/services;key={api_key}/wfs?{query}"
        output = destination / f"nz-topo50-{name}.geojson"
        _stream_download(Request(url, headers={"User-Agent": "Topomapper/0.1"}), output, f"download {name}")
        try:
            payload = json.loads(output.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise LinzDownloadError(f"LINZ returned unreadable {name} data.") from error
        if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
            raise LinzDownloadError(f"LINZ returned unexpected {name} data.")
        features = payload.get("features")
        if isinstance(features, list) and features:
            results.append(output)
        else:
            output.unlink(missing_ok=True)
    return results


def _manifest_files(directory: Path) -> dict[str, Any] | None:
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(manifest, dict):
        return None
    names = [*manifest.get("elevation", []), *manifest.get("water", [])]
    if not names or any(not (directory / str(name)).is_file() for name in names):
        return None
    return manifest


def download_linz_data(bounds_value: Any, supplied_key: str = "") -> dict[str, Any]:
    bounds = validate_bounds(bounds_value)
    if supplied_key.strip():
        save_api_key(supplied_key)
    api_key = load_api_key()
    if not api_key:
        raise LinzDownloadError("Enter and save a LINZ data-access API key first.")

    cache_key = hashlib.sha256(json.dumps(bounds, sort_keys=True).encode("utf-8")).hexdigest()[:20]
    root = _cache_directory()
    destination = root / cache_key
    cached = _manifest_files(destination)
    if cached is not None:
        return _public_manifest(cache_key, cached, cached=True)

    root.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{cache_key}-", dir=root))
    try:
        archive = temporary / "elevation-download"
        download_url = _create_and_wait_for_export(bounds, api_key)
        _stream_download(_authorised_request(download_url, api_key), archive, "download the 8 m elevation export")
        elevation = _extract_geotiffs(archive, temporary)
        archive.unlink(missing_ok=True)
        water = _download_water(bounds, api_key, temporary)
        manifest = {
            "dataset": "NZ 8m Digital Elevation Model (2012)",
            "source": f"https://data.linz.govt.nz/layer/{ELEVATION_LAYER_ID}/",
            "bounds": bounds,
            "elevation": [path.name for path in elevation],
            "water": [path.name for path in water],
            "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "license": "CC BY 4.0",
        }
        (temporary / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        if destination.exists():
            shutil.rmtree(temporary)
        else:
            temporary.rename(destination)
        return _public_manifest(cache_key, manifest, cached=False)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def _public_manifest(cache_key: str, manifest: dict[str, Any], *, cached: bool) -> dict[str, Any]:
    def entry(name: str) -> dict[str, str]:
        return {
            "name": name,
            "url": f"/linz/files/{cache_key}/{name}",
        }

    return {
        "cache_id": cache_key,
        "cached": cached,
        "dataset": manifest["dataset"],
        "source": manifest["source"],
        "downloaded_at": manifest["downloaded_at"],
        "license": manifest["license"],
        "elevation": [entry(name) for name in manifest["elevation"]],
        "water": [entry(name) for name in manifest["water"]],
    }


def cached_file(cache_key: str, filename: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{20}", cache_key) or Path(filename).name != filename:
        raise LinzDownloadError("The requested cached LINZ file is not valid.")
    path = _cache_directory() / cache_key / filename
    if not path.is_file():
        raise LinzDownloadError("The requested cached LINZ file is no longer available.")
    return path
