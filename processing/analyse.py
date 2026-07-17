"""GeoTIFF clipping, elevation analysis, and preview generation for topomapper."""

from __future__ import annotations

import base64
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError, WindowError
from rasterio.io import MemoryFile
from rasterio.warp import transform, transform_bounds
from rasterio.windows import Window, bounds as window_bounds, from_bounds


WGS84 = "EPSG:4326"
ANALYSIS_TILE_SIZE = 1024
PREVIEW_MAX_SIZE = 720


class AnalysisError(Exception):
    """A problem that can be explained directly in the interface."""


@dataclass(frozen=True)
class Bounds:
    west: float
    south: float
    east: float
    north: float

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "Bounds":
        try:
            bounds = cls(*(float(value[name]) for name in ("west", "south", "east", "north")))
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


def _clip_window(dataset: rasterio.io.DatasetReader, selection: Bounds) -> Window:
    if dataset.crs is None:
        raise AnalysisError("This GeoTIFF has no coordinate reference system.")
    try:
        projected = transform_bounds(WGS84, dataset.crs, *selection.as_tuple(), densify_pts=21)
        requested = from_bounds(*projected, transform=dataset.transform)
        full = Window(0, 0, dataset.width, dataset.height)
        clipped = requested.intersection(full)
    except (ValueError, WindowError) as error:
        raise AnalysisError("The GeoTIFF does not overlap the selected map area.") from error

    col_start = max(0, math.floor(clipped.col_off))
    row_start = max(0, math.floor(clipped.row_off))
    col_stop = min(dataset.width, math.ceil(clipped.col_off + clipped.width))
    row_stop = min(dataset.height, math.ceil(clipped.row_off + clipped.height))
    if col_stop <= col_start or row_stop <= row_start:
        raise AnalysisError("The GeoTIFF does not overlap the selected map area.")
    return Window(col_start, row_start, col_stop - col_start, row_stop - row_start)


def _extrema(dataset: rasterio.io.DatasetReader, window: Window) -> dict[str, Any]:
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
            tile_window = Window(col, row, width, height)
            values = dataset.read(1, window=tile_window, masked=True)
            valid = values.compressed()
            if not valid.size:
                continue
            valid_pixels += int(valid.size)
            tile_minimum = float(valid.min())
            tile_maximum = float(valid.max())
            if tile_minimum < minimum:
                flat_index = int(np.argmin(values.filled(np.inf)))
                local_row, local_col = np.unravel_index(flat_index, values.shape)
                minimum = tile_minimum
                minimum_cell = row + int(local_row), col + int(local_col)
            if tile_maximum > maximum:
                flat_index = int(np.argmax(values.filled(-np.inf)))
                local_row, local_col = np.unravel_index(flat_index, values.shape)
                maximum = tile_maximum
                maximum_cell = row + int(local_row), col + int(local_col)

    if not valid_pixels or minimum_cell is None or maximum_cell is None:
        raise AnalysisError("The selected part of the GeoTIFF contains only missing data.")

    def point(cell: tuple[int, int]) -> dict[str, float]:
        x, y = dataset.xy(*cell, offset="center")
        longitude, latitude = transform(dataset.crs, WGS84, [x], [y])
        return {"longitude": longitude[0], "latitude": latitude[0]}

    return {
        "minimum": {"elevation": minimum, **point(minimum_cell)},
        "maximum": {"elevation": maximum, **point(maximum_cell)},
        "valid_pixels": valid_pixels,
        "window_pixels": int(window.width * window.height),
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
    channels = [np.interp(normalised, stops, colours[:, index]) for index in range(3)]
    return np.stack(channels, axis=0)


def _preview(dataset: rasterio.io.DatasetReader, window: Window, minimum: float, maximum: float) -> str:
    scale = min(1.0, PREVIEW_MAX_SIZE / max(window.width, window.height))
    output_width = max(2, int(round(window.width * scale)))
    output_height = max(2, int(round(window.height * scale)))
    values = dataset.read(
        1,
        window=window,
        out_shape=(output_height, output_width),
        masked=True,
        resampling=Resampling.bilinear,
    ).astype("float32")
    valid_mask = ~np.ma.getmaskarray(values)
    span = maximum - minimum
    normalised = np.clip((values.filled(minimum) - minimum) / (span if span else 1.0), 0, 1)
    colours = _terrain_colours(normalised)

    filled = values.filled(float(values.mean()) if values.count() else minimum)
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
        with memory.open(driver="PNG", width=output_width, height=output_height, count=4, dtype="uint8") as target:
            target.write(rgba)
        encoded = base64.b64encode(memory.read()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _coverage(selection: Bounds, dataset_bounds: Bounds, valid_pixels: int, window_pixels: int) -> dict[str, float]:
    overlap_west = max(selection.west, dataset_bounds.west)
    overlap_south = max(selection.south, dataset_bounds.south)
    overlap_east = min(selection.east, dataset_bounds.east)
    overlap_north = min(selection.north, dataset_bounds.north)
    if overlap_east <= overlap_west or overlap_north <= overlap_south:
        spatial_fraction = 0.0
    else:
        selected_area = (selection.east - selection.west) * (selection.north - selection.south)
        overlap_area = (overlap_east - overlap_west) * (overlap_north - overlap_south)
        spatial_fraction = min(1.0, overlap_area / selected_area)
    valid_fraction = valid_pixels / window_pixels if window_pixels else 0.0
    usable_fraction = spatial_fraction * valid_fraction
    return {
        "dataset_overlap_percent": round(spatial_fraction * 100, 2),
        "valid_data_percent": round(usable_fraction * 100, 2),
        "missing_data_percent": round((1 - usable_fraction) * 100, 2),
    }


def analyse_geotiff(path: str | Path, filename: str, bounds_value: dict[str, Any]) -> dict[str, Any]:
    selection = Bounds.from_mapping(bounds_value)
    try:
        with rasterio.open(path) as dataset:
            if dataset.count < 1:
                raise AnalysisError("This GeoTIFF does not contain an elevation band.")
            window = _clip_window(dataset, selection)
            extrema = _extrema(dataset, window)
            projected_preview_bounds = window_bounds(window, dataset.transform)
            preview_bounds_tuple = transform_bounds(dataset.crs, WGS84, *projected_preview_bounds, densify_pts=21)
            preview_bounds = Bounds(*preview_bounds_tuple)
            source_bounds = Bounds(*transform_bounds(dataset.crs, WGS84, *dataset.bounds, densify_pts=21))
            tags = dataset.tags()
            vertical_datum = tags.get("VERTICAL_DATUM") or tags.get("VERT_DATUM") or "Not stated in GeoTIFF"
            preview = _preview(
                dataset,
                window,
                extrema["minimum"]["elevation"],
                extrema["maximum"]["elevation"],
            )
            coverage = _coverage(
                selection,
                source_bounds,
                extrema["valid_pixels"],
                extrema["window_pixels"],
            )
            return {
                "selection": selection.as_dict(),
                "preview_bounds": preview_bounds.as_dict(),
                "preview_png": preview,
                "minimum": extrema["minimum"],
                "maximum": extrema["maximum"],
                "coverage": coverage,
                "dataset": {
                    "filename": filename,
                    "crs": dataset.crs.to_string(),
                    "width": dataset.width,
                    "height": dataset.height,
                    "resolution_x": abs(dataset.res[0]),
                    "resolution_y": abs(dataset.res[1]),
                    "nodata": dataset.nodata,
                    "vertical_datum": vertical_datum,
                    "bounds": source_bounds.as_dict(),
                },
            }
    except AnalysisError:
        raise
    except RasterioIOError as error:
        raise AnalysisError("The selected file is not a readable GeoTIFF elevation raster.") from error
    except Exception as error:
        raise AnalysisError(f"The GeoTIFF could not be analysed: {error}") from error
