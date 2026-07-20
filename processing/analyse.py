"""GeoTIFF clipping, elevation analysis, and mosaic previews for topomapper."""

from __future__ import annotations

import base64
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError, WindowError
from rasterio.features import rasterize, shapes
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds as output_transform
from rasterio.warp import reproject, transform, transform_bounds, transform_geom
from rasterio.windows import Window, from_bounds


WGS84 = "EPSG:4326"
ANALYSIS_TILE_SIZE = 1024
PREVIEW_MAX_SIZE = 720
LAYER_PREVIEW_MAX_SIZE = 520


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


def _layer_mosaic(
    inputs: Iterable[tuple[Path, str]],
    selection: Bounds,
) -> tuple[np.ndarray, np.ndarray, rasterio.Affine]:
    """Build a bounded WGS84 elevation grid suitable for interactive polygon previews."""
    natural_width, natural_height = _preview_shape(selection)
    scale = min(1.0, LAYER_PREVIEW_MAX_SIZE / max(natural_width, natural_height))
    width = max(2, round(natural_width * scale))
    height = max(2, round(natural_height * scale))
    destination_transform = output_transform(*selection.as_tuple(), width, height)
    mosaic = np.full((height, width), np.nan, dtype="float32")

    for path, _filename in inputs:
        with rasterio.open(path) as dataset:
            if not selection.overlaps(_source_bounds(dataset)):
                continue
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
        raise AnalysisError("The selected GeoTIFFs contain no usable elevation data for layer generation.")
    return mosaic, valid_mask, destination_transform


def _validate_boundaries(values: Iterable[object]) -> list[float]:
    try:
        boundaries = [float(value) for value in values]
    except (TypeError, ValueError) as error:
        raise AnalysisError("Every layer boundary must be a valid elevation.") from error
    if len(boundaries) < 2:
        raise AnalysisError("At least two elevation boundaries are required.")
    if len(boundaries) > 41:
        raise AnalysisError("The Stage 5 preview supports up to 40 physical layers.")
    if not all(math.isfinite(value) for value in boundaries):
        raise AnalysisError("Every layer boundary must be a finite elevation.")
    if abs(boundaries[0]) > 0.001:
        raise AnalysisError("The first land boundary must remain at sea level (0 m).")
    if any(current <= previous for previous, current in zip(boundaries, boundaries[1:])):
        raise AnalysisError("Layer boundaries must rise without duplicates.")
    return boundaries


def _geojson_crs(value: dict[str, Any]) -> str:
    crs = value.get("crs")
    if not isinstance(crs, dict):
        return WGS84
    properties = crs.get("properties")
    name = properties.get("name") if isinstance(properties, dict) else None
    if not isinstance(name, str) or not name.strip():
        return WGS84
    lowered = name.lower()
    if "2193" in lowered:
        return "EPSG:2193"
    if "4326" in lowered or "crs84" in lowered:
        return WGS84
    raise AnalysisError(f"The water GeoJSON coordinate system '{name}' is not supported. Export it as WGS84 / EPSG:4326.")


def _geojson_polygons(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        return []
    geometry_type = value.get("type")
    if geometry_type == "FeatureCollection":
        return [geometry for feature in value.get("features", []) for geometry in _geojson_polygons(feature)]
    if geometry_type == "Feature":
        return _geojson_polygons(value.get("geometry"))
    if geometry_type == "GeometryCollection":
        return [geometry for child in value.get("geometries", []) for geometry in _geojson_polygons(child)]
    if geometry_type in {"Polygon", "MultiPolygon"} and isinstance(value.get("coordinates"), list):
        return [{"type": geometry_type, "coordinates": value["coordinates"]}]
    return []


def _kml_coordinates(value: str | None) -> list[list[float]]:
    result: list[list[float]] = []
    for token in (value or "").replace("\n", " ").split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        try:
            result.append([float(parts[0]), float(parts[1])])
        except ValueError as error:
            raise AnalysisError("A KML water boundary contains an invalid coordinate.") from error
    if len(result) >= 3 and result[0] != result[-1]:
        result.append(list(result[0]))
    return result


def _kml_polygons(contents: bytes) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(contents)
    except ET.ParseError as error:
        raise AnalysisError("A water KML file could not be read.") from error
    result: list[dict[str, Any]] = []
    for polygon in root.findall(".//{*}Polygon"):
        outer_node = polygon.find("./{*}outerBoundaryIs/{*}LinearRing/{*}coordinates")
        outer = _kml_coordinates(outer_node.text if outer_node is not None else None)
        if len(outer) < 4:
            continue
        rings = [outer]
        for inner_node in polygon.findall("./{*}innerBoundaryIs/{*}LinearRing/{*}coordinates"):
            inner = _kml_coordinates(inner_node.text)
            if len(inner) >= 4:
                rings.append(inner)
        result.append({"type": "Polygon", "coordinates": rings})
    return result


def _water_polygons(inputs: Iterable[tuple[bytes, str]]) -> tuple[list[dict[str, Any]], list[str]]:
    geometries: list[dict[str, Any]] = []
    filenames: list[str] = []
    for contents, filename in inputs:
        suffix = Path(filename).suffix.lower()
        if suffix == ".kml":
            source_geometries = _kml_polygons(contents)
            source_crs = WGS84
        else:
            try:
                payload = json.loads(contents.decode("utf-8-sig"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise AnalysisError(f"{filename} is not readable GeoJSON.") from error
            if not isinstance(payload, dict):
                raise AnalysisError(f"{filename} is not a GeoJSON object.")
            source_geometries = _geojson_polygons(payload)
            source_crs = _geojson_crs(payload)
        if not source_geometries:
            raise AnalysisError(f"{filename} contains no lake or river polygons. River centreline files cannot create cuttable water holes.")
        if len(geometries) + len(source_geometries) > 50_000:
            raise AnalysisError("The selected water files contain more than 50,000 polygons. Crop them to the model area in LINZ first.")
        for geometry in source_geometries:
            geometries.append(transform_geom(source_crs, WGS84, geometry, antimeridian_cutting=True, precision=9))
        filenames.append(filename)
    return geometries, filenames


def generate_filled_layers(
    inputs: Iterable[tuple[str | Path, str]],
    bounds_value: dict[str, Any],
    boundary_values: Iterable[object],
    water_inputs: Iterable[tuple[bytes, str]] = (),
) -> dict[str, Any]:
    """Polygonise cumulative land masks for a stackable 2D layer preview."""
    selection = Bounds.from_mapping(bounds_value)
    prepared = [(Path(path), filename) for path, filename in inputs]
    if not prepared:
        raise AnalysisError("Choose at least one GeoTIFF elevation file.")
    boundaries = _validate_boundaries(boundary_values)

    try:
        mosaic, valid_mask, transform_value = _layer_mosaic(prepared, selection)
        water_geometries, water_filenames = _water_polygons(water_inputs)
        water_mask = np.zeros(valid_mask.shape, dtype=bool)
        if water_geometries:
            water_mask = rasterize(
                ((geometry, 1) for geometry in water_geometries),
                out_shape=valid_mask.shape,
                transform=transform_value,
                fill=0,
                all_touched=True,
                dtype="uint8",
            ).astype(bool) & valid_mask
            if not water_mask.any():
                raise AnalysisError("The selected water polygons do not overlap usable elevation data in the model area.")
        features: list[dict[str, Any]] = []
        layers: list[dict[str, Any]] = []
        for index, (lower, upper) in enumerate(zip(boundaries, boundaries[1:])):
            cumulative_mask = valid_mask & (mosaic >= lower) & ~water_mask
            piece_count = 0
            hole_count = 0
            for geometry, raster_value in shapes(
                cumulative_mask.astype("uint8"),
                mask=cumulative_mask,
                transform=transform_value,
                connectivity=8,
            ):
                if int(raster_value) != 1:
                    continue
                coordinates = geometry.get("coordinates", [])
                piece_count += 1
                hole_count += max(0, len(coordinates) - 1)
                features.append({
                    "type": "Feature",
                    "properties": {
                        "layer_index": index,
                        "lower_elevation": lower,
                        "upper_elevation": upper,
                    },
                    "geometry": geometry,
                })
            layers.append({
                "index": index,
                "lower_elevation": lower,
                "upper_elevation": upper,
                "piece_count": piece_count,
                "hole_count": hole_count,
                "cell_count": int(cumulative_mask.sum()),
            })

        return {
            "selection": selection.as_dict(),
            "boundaries": boundaries,
            "grid": {"width": int(mosaic.shape[1]), "height": int(mosaic.shape[0])},
            "water": {
                "source_filenames": water_filenames,
                "polygon_count": len(water_geometries),
                "cell_count": int(water_mask.sum()),
            },
            "layers": layers,
            "feature_collection": {"type": "FeatureCollection", "features": features},
        }
    except AnalysisError:
        raise
    except RasterioIOError as error:
        raise AnalysisError("One of the selected files is not a readable GeoTIFF elevation raster.") from error
    except Exception as error:
        raise AnalysisError(f"The filled layer geometry could not be generated: {error}") from error


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
