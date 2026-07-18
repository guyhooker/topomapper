"""GeoTIFF clipping, elevation analysis, and mosaic previews for topomapper."""

from __future__ import annotations

import base64
import math
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError, WindowError
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds as output_transform
from rasterio.warp import reproject, transform, transform_bounds
from rasterio.windows import Window, from_bounds


WGS84 = "EPSG:4326"
ANALYSIS_TILE_SIZE = 1024
PREVIEW_MAX_SIZE = 720


class AnalysisError(Exception):
    """A problem that can be explained directly in the interface."""


class NoOverlapError(AnalysisError):
    """A source raster does not intersect the selected area."""


class NoDataError(AnalysisError):
    """An intersecting source contains no valid elevation cells."""


class Bounds:
    def __init__(self, west: float, south: float, east: float, north: float):
        self.west = float(west)
        self.south = float(south)
        self.east = float(east)
        self.north = float(north)

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "Bounds":
        try:
            bounds = cls(*(value[name] for name in ("west", "south", "east", "north")))
        except (KeyError, TypeError, ValueError) as error:
            raise AnalysisError("The selected map bounds are incomplete.") from error
        if not all(math.isfinite(number) for number in bounds.as_tuple()):
            raise AnalysisError("The selected map bounds contain an invalid coordinate.")
        if bounds.west >= bounds.east or bounds.south >= bounds.north:
            raise AnalysisError("The selected map area has no usable width or height.")
        return bounds

    def as_tuple(self) -> tuple[float, float, float, float]:
        return self.west, self.south, self.east, self.north

    def as_dict(self) -> dict[str, float]:
        return {
            "west": self.west,
            "south": self.south,
            "east": self.east,
            "north": self.north,
        }

    def overlaps(self, other: "Bounds") -> bool:
        return self.west < other.east and self.east > other.west and self.south < other.north and self.north > other.south


def _source_bounds(dataset: rasterio.io.DatasetReader) -> Bounds:
    if dataset.crs is None:
        raise AnalysisError("A GeoTIFF has no coordinate reference system.")
    return Bounds(*transform_bounds(dataset.crs, WGS84, *dataset.bounds, densify_pts=21))


def _clip_window(dataset: rasterio.io.DatasetReader, selection: Bounds) -> Window:
    if dataset.crs is None:
        raise AnalysisError("A GeoTIFF has no coordinate reference system.")
    try:
        projected = transform_bounds(WGS84, dataset.crs, *selection.as_tuple(), densify_pts=21)
        requested = from_bounds(*projected, transform=dataset.transform)
        clipped = requested.intersection(Window(0, 0, dataset.width, dataset.height))
    except (ValueError, WindowError) as error:
        raise NoOverlapError("The GeoTIFF does not overlap the selected map area.") from error

    col_start = max(0, math.floor(clipped.col_off))
    row_start = max(0, math.floor(clipped.row_off))
    col_stop = min(dataset.width, math.ceil(clipped.col_off + clipped.width))
    row_stop = min(dataset.height, math.ceil(clipped.row_off + clipped.height))
    if col_stop <= col_start or row_stop <= row_start:
        raise NoOverlapError("The GeoTIFF does not overlap the selected map area.")
    return Window(col_start, row_start, col_stop - col_start, row_stop - row_start)


def _extrema(dataset: rasterio.io.DatasetReader, window: Window, filename: str) -> dict[str, Any]:
    minimum = math.inf
    maximum = -math.inf
    minimum_cell: tuple[int, int] | None = None
    maximum_cell: tuple[int, int] | None = None
    valid_pixels = 0

    row_start = int(window.row_off)
    col_start = int(window.col_off)
    row_stop = row_start + int(window.height)
    col_stop = col_start + int(window.width)

    for row in range(row_start, row_stop, ANALYSIS_TILE_SIZE):
        height = min(ANALYSIS_TILE_SIZE, row_stop - row)
        for col in range(col_start, col_stop, ANALYSIS_TILE_SIZE):
            width = min(ANALYSIS_TILE_SIZE, col_stop - col)
            values = dataset.read(1, window=Window(col, row, width, height), masked=True)
            valid = values.compressed()
            if not valid.size:
                continue
            valid_pixels += int(valid.size)
            tile_minimum = float(valid.min())
            tile_maximum = float(valid.max())
            if tile_minimum < minimum:
                local_row, local_col = np.unravel_index(int(np.argmin(values.filled(np.inf))), values.shape)
                minimum = tile_minimum
                minimum_cell = row + int(local_row), col + int(local_col)
            if tile_maximum > maximum:
                local_row, local_col = np.unravel_index(int(np.argmax(values.filled(-np.inf))), values.shape)
                maximum = tile_maximum
                maximum_cell = row + int(local_row), col + int(local_col)

    if not valid_pixels or minimum_cell is None or maximum_cell is None:
        raise NoDataError(f"{filename} contains only missing data inside the selected area.")

    def point(cell: tuple[int, int]) -> dict[str, float | str]:
        x, y = dataset.xy(*cell, offset="center")
        longitude, latitude = transform(dataset.crs, WGS84, [x], [y])
        return {"longitude": longitude[0], "latitude": latitude[0], "source_filename": filename}

    return {
        "minimum": {"elevation": minimum, **point(minimum_cell)},
        "maximum": {"elevation": maximum, **point(maximum_cell)},
        "valid_pixels": valid_pixels,
    }


def _terrain_colours(normalised: np.ndarray) -> np.ndarray:
    stops = np.array([0.0, 0.18, 0.42, 0.68, 0.86, 1.0])
    colours = np.array([
        [42, 105, 77],
        [91, 145, 85],
        [155, 170, 102],
        [157, 122, 82],
        [121, 105, 94],
        [245, 244, 237],
    ])
    return np.stack([np.interp(normalised, stops, colours[:, index]) for index in range(3)], axis=0)


def _preview_shape(selection: Bounds) -> tuple[int, int]:
    centre_latitude = math.radians((selection.south + selection.north) / 2)
    width = (selection.east - selection.west) * max(0.1, math.cos(centre_latitude))
    height = selection.north - selection.south
    if width >= height:
        return PREVIEW_MAX_SIZE, max(2, round(PREVIEW_MAX_SIZE * height / width))
    return max(2, round(PREVIEW_MAX_SIZE * width / height)), PREVIEW_MAX_SIZE


def _mark_rectangular_coverage(mask: np.ndarray, selection: Bounds, source: Bounds) -> None:
    clipped_west = max(selection.west, source.west)
    clipped_south = max(selection.south, source.south)
    clipped_east = min(selection.east, source.east)
    clipped_north = min(selection.north, source.north)
    if clipped_west >= clipped_east or clipped_south >= clipped_north:
        return
    height, width = mask.shape
    longitude_span = selection.east - selection.west
    latitude_span = selection.north - selection.south
    col_start = max(0, math.floor((clipped_west - selection.west) / longitude_span * width))
    col_stop = min(width, math.ceil((clipped_east - selection.west) / longitude_span * width))
    row_start = max(0, math.floor((selection.north - clipped_north) / latitude_span * height))
    row_stop = min(height, math.ceil((selection.north - clipped_south) / latitude_span * height))
    mask[row_start:row_stop, col_start:col_stop] = True


def _encode_preview(
    values: np.ndarray,
    valid_mask: np.ndarray,
    minimum: float,
    maximum: float,
    transform_value: rasterio.Affine,
) -> str:
    span = maximum - minimum
    normalised = np.clip((np.where(valid_mask, values, minimum) - minimum) / (span if span else 1.0), 0, 1)
    colours = _terrain_colours(normalised)
    filled = np.where(valid_mask, values, float(values[valid_mask].mean()))
    gradient_y, gradient_x = np.gradient(filled)
    slope_strength = np.hypot(gradient_x, gradient_y)
    if float(slope_strength.max()) > 0:
        slope_strength /= float(slope_strength.max())
    directional = np.clip(0.58 + (gradient_x - gradient_y) * 0.018, 0.42, 1.0)
    shade = np.clip(directional - slope_strength * 0.12, 0.38, 1.0)
    colours = np.clip(colours * shade[np.newaxis, :, :], 0, 255).astype("uint8")
    alpha = np.where(valid_mask, 235, 0).astype("uint8")
    rgba = np.concatenate([colours, alpha[np.newaxis, :, :]], axis=0)
    with MemoryFile() as memory:
        with memory.open(
            driver="PNG",
            width=values.shape[1],
            height=values.shape[0],
            count=4,
            dtype="uint8",
            crs=WGS84,
            transform=transform_value,
        ) as target:
            target.write(rgba)
        encoded = base64.b64encode(memory.read()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _mosaic_preview(
    inputs: Iterable[tuple[Path, str]],
    selection: Bounds,
    minimum: float,
    maximum: float,
) -> tuple[str, dict[str, float]]:
    width, height = _preview_shape(selection)
    destination_transform = output_transform(*selection.as_tuple(), width, height)
    mosaic = np.full((height, width), np.nan, dtype="float32")
    dataset_coverage = np.zeros((height, width), dtype=bool)

    for path, _filename in inputs:
        with rasterio.open(path) as dataset:
            source_bounds = _source_bounds(dataset)
            if not selection.overlaps(source_bounds):
                continue
            _mark_rectangular_coverage(dataset_coverage, selection, source_bounds)
            tile = np.full((height, width), np.nan, dtype="float32")
            reproject(
                source=rasterio.band(dataset, 1),
                destination=tile,
                src_transform=dataset.transform,
                src_crs=dataset.crs,
                src_nodata=dataset.nodata,
                dst_transform=destination_transform,
                dst_crs=WGS84,
                dst_nodata=np.nan,
                resampling=Resampling.bilinear,
                init_dest_nodata=True,
            )
            valid = np.isfinite(tile)
            mosaic[valid] = tile[valid]

    valid_mask = np.isfinite(mosaic)
    if not valid_mask.any():
        raise AnalysisError("The selected GeoTIFFs contain no usable elevation data in this area.")
    total = valid_mask.size
    overlap_percent = float(dataset_coverage.sum()) / total * 100
    valid_percent = float(valid_mask.sum()) / total * 100
    coverage = {
        "dataset_overlap_percent": round(overlap_percent, 2),
        "valid_data_percent": round(valid_percent, 2),
        "missing_data_percent": round(100 - valid_percent, 2),
    }
    return _encode_preview(mosaic, valid_mask, minimum, maximum, destination_transform), coverage


def _dataset_metadata(dataset: rasterio.io.DatasetReader, filename: str, selection: Bounds) -> dict[str, Any]:
    tags = dataset.tags()
    source_bounds = _source_bounds(dataset)
    return {
        "filename": filename,
        "crs": dataset.crs.to_string(),
        "width": dataset.width,
        "height": dataset.height,
        "resolution_x": abs(dataset.res[0]),
        "resolution_y": abs(dataset.res[1]),
        "nodata": dataset.nodata,
        "vertical_datum": tags.get("VERTICAL_DATUM") or tags.get("VERT_DATUM") or "Not stated in GeoTIFF",
        "bounds": source_bounds.as_dict(),
        "overlaps_selection": selection.overlaps(source_bounds),
    }


def analyse_geotiffs(
    inputs: Iterable[tuple[str | Path, str]],
    bounds_value: dict[str, Any],
) -> dict[str, Any]:
    selection = Bounds.from_mapping(bounds_value)
    prepared = [(Path(path), filename) for path, filename in inputs]
    if not prepared:
        raise AnalysisError("Choose at least one GeoTIFF elevation file.")

    datasets: list[dict[str, Any]] = []
    extrema_results: list[dict[str, Any]] = []
    try:
        for path, filename in prepared:
            with rasterio.open(path) as dataset:
                if dataset.count < 1:
                    raise AnalysisError(f"{filename} does not contain an elevation band.")
                datasets.append(_dataset_metadata(dataset, filename, selection))
                try:
                    window = _clip_window(dataset, selection)
                    extrema_results.append(_extrema(dataset, window, filename))
                except (NoOverlapError, NoDataError):
                    continue

        if not extrema_results:
            raise AnalysisError("None of the selected GeoTIFFs contains usable elevation data in this area.")
        minimum = min((result["minimum"] for result in extrema_results), key=lambda point: point["elevation"])
        maximum = max((result["maximum"] for result in extrema_results), key=lambda point: point["elevation"])
        preview, coverage = _mosaic_preview(prepared, selection, minimum["elevation"], maximum["elevation"])
        return {
            "selection": selection.as_dict(),
            "preview_bounds": selection.as_dict(),
            "preview_png": preview,
            "minimum": minimum,
            "maximum": maximum,
            "coverage": coverage,
            "datasets": datasets,
        }
    except AnalysisError:
        raise
    except RasterioIOError as error:
        raise AnalysisError("One of the selected files is not a readable GeoTIFF elevation raster.") from error
    except Exception as error:
        raise AnalysisError(f"The GeoTIFF mosaic could not be analysed: {error}") from error


def analyse_geotiff(path: str | Path, filename: str, bounds_value: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible single-file entry point used by older tests."""
    return analyse_geotiffs([(path, filename)], bounds_value)
