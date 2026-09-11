"""Persist user-selected bathymetry rasters for later project sessions."""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path


class BathymetryCacheError(RuntimeError):
    """A bathymetry cache entry could not be stored or restored."""


def _cache_directory() -> Path:
    configured = os.environ.get("TOPOMAPPER_BATHYMETRY_CACHE_DIR")
    return Path(configured).expanduser() if configured else Path.home() / "Library" / "Caches" / "Topomapper" / "bathymetry"


def _safe_filename(filename: str) -> str:
    name = Path(filename).name
    if name != filename or Path(name).suffix.lower() not in {".tif", ".tiff"}:
        raise BathymetryCacheError("The saved bathymetry filename is not valid.")
    return name


def cache_bathymetry_file(source: Path, filename: str) -> Path:
    """Keep the most recently analysed raster under its project filename."""
    name = _safe_filename(filename)
    directory = _cache_directory()
    try:
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / name
        if destination.exists() and destination.stat().st_size == source.stat().st_size:
            return destination
        with tempfile.NamedTemporaryFile(prefix=f".{name}-", dir=directory, delete=False) as target:
            temporary = Path(target.name)
            with source.open("rb") as input_file:
                shutil.copyfileobj(input_file, target, length=1024 * 1024)
        temporary.replace(destination)
        return destination
    except OSError as error:
        raise BathymetryCacheError("The bathymetry raster could not be saved in Topomapper's local cache.") from error


def cached_bathymetry_file(filename: str) -> Path:
    """Resolve a cached raster, with a development-fixture migration fallback."""
    name = _safe_filename(filename)
    cached = _cache_directory() / name
    if cached.is_file():
        return cached
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / name
    if fixture.is_file():
        return fixture
    raise BathymetryCacheError(f"Reload {name} in Stage 3 once; Topomapper will retain it for future sessions.")
