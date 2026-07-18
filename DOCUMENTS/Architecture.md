# topomapper Initial Architecture

## Recommendation

Build the first version as a local web application running entirely on the
MacBook:

- Browser interface for the map, selection tools, layer editor, and previews.
- Local Python service for downloading, caching, analysing, and contouring
  elevation rasters.
- No cloud account and no upload of project data.
- Package it as a normal Mac application after the workflow is proven.

This approach provides modern interactive mapping without forcing geospatial
processing into browser JavaScript or rebuilding mature raster tools in native
Swift.

## Proposed Components

### Interface

- TypeScript and a small web application framework.
- MapLibre GL JS for the interactive map, hillshade, and terrain preview.
- Terra Draw or an equivalent MapLibre control for rectangular and polygonal
  area selection.
- A layer-boundary editor with separate land and subsea lists.

### Processing Engine

- Python for the local service and workflow orchestration.
- GDAL/Rasterio for reading, mosaicking, reprojecting, clipping, resampling, and
  analysing elevation rasters.
- NumPy for minimum/maximum and band calculations.
- GDAL polygonal contour generation for arbitrary fixed layer levels.
- Shapely for clipping, cleaning, simplification, minimum-feature checks, and
  registration geometry.
- PyProj for coordinate-system transformations.

Stage 3 implements the first local processor as a localhost-only Python HTTP
service started by the same development command as the interface. Rasterio
provides GDAL-backed GeoTIFF access, window clipping, raster masks, and CRS
transformation. Large selected windows are scanned in bounded chunks. Uploaded
browser files are temporary and are deleted after each request.

Multiple manually supplied tiles are scanned independently for exact extrema
and reprojected onto a small common WGS84 preview grid. This avoids allocating a
full-resolution in-memory mosaic while still exposing remaining gaps and mixed
source metadata before later automatic dataset retrieval is attempted.

Stage 5 reprojects the selected tiles onto a bounded preview grid and polygonises
one cumulative mask for every chosen land boundary. A layer therefore contains
all terrain at or above its lower elevation, which produces nested shapes that
can be physically stacked rather than isolated contour lines. Raster polygon
rings retain holes and disconnected components. This grid is deliberately a
responsive 2D feasibility preview; later SVG export will generate fabrication
geometry at an explicitly chosen physical scale and simplification tolerance.

### Project and Export Formats

- A readable JSON project file for settings and provenance.
- Deterministic part IDs and a registration plan recording drill-through layers,
  local cap layers, peak-to-base vent columns, supplemental grid holes, and
  covered engraving eligibility.
- GeoTIFF cache for clipped elevation data.
- GeoPackage or GeoJSON for intermediate polygons.
- Finished-size SVG as the inspectable manufacturing-geometry source, with
  separate profile, drilling, and engraving groups.
- A non-destructive per-layer cleanup plan in physical millimetres. Original
  polygons remain available for comparison; cleaned polygons feed downstream
  previews and exports. Selection-boundary vertices stay locked so frame edges
  cannot be rounded.
- A sheet-layout document recording stock size, margins, clamp zones, part
  transforms, mirroring/face instructions, and nesting provenance.
- Multiple named layouts may reference the same terrain model and part library;
  production, test-cut, and replacement-part sheets must not require duplicate
  terrain processing.
- Design-rule violations are stored as reviewable warnings rather than silently
  moving geometry or blocking deliberate exceptions.
- Controller-specific G-code generated only from a validated manufacturing and
  sheet-layout plan; SVG remains the visual audit format.
- G-code only through a later, explicitly configured CAM/postprocessor stage.

## New Zealand Data Strategy

Use a source hierarchy rather than assuming one dataset is adequate everywhere:

1. LINZ National 1 m bare-earth DEM for land where available.
2. LINZ coastal DEM products where they include compatible land and seafloor
   elevations.
3. Higher-resolution regional bathymetry where available.
4. New Zealand 250 m bathymetry as a broad-area fallback, with a visible quality
   warning.

The system must inspect coverage and metadata before downloading large files.
Cloud Optimised GeoTIFF sources should be read by spatial window where possible,
so selecting Banks Peninsula does not require downloading a national raster.

## Coordinate and Datum Handling

- Perform New Zealand geometry and physical measurements in NZTM2000 rather
  than latitude/longitude.
- Retain each source's original vertical datum in metadata.
- Require an explicit, documented transformation or user acknowledgement before
  merging land elevation and seabed depth referenced to different zero levels.
- Make the chosen physical zero/sea-level plane visible in the project settings.

## Development Phases

### Phase 1 — Geometry proof

- Use a manually downloaded New Zealand DEM sample.
- Select or enter a rectangular area.
- Report minimum and maximum elevation.
- Accept arbitrary elevation boundaries.
- Generate and preview filled layer polygons.
- Export SVG layers.

### Phase 2 — Interactive map

- Add searchable MapLibre map.
- Draw and edit the selection.
- Manually select up to 24 appropriate LINZ elevation tiles.
- Add project save/open.

### Phase 3 — Coast and bathymetry

- Add high-resolution coastal data where available.
- Add NIWA/ESNZ bathymetry fallback.
- Add vertical-datum and resolution warnings.
- Preview land, glass sea-level plane, and subsea stack.

### Phase 4 — Fabrication preparation

- Add map scale, sheet thickness, vertical exaggeration, kerf allowance,
  simplification, minimum-piece checks, alignment holes, and layer labels.
- Add DXF export and validate output in existing CAM software.

### Phase 5 — CNC integration

- Specify the CNC controller, cutter, stock, feeds, speeds, tabs, safe height,
  origin, and postprocessor.
- Decide whether direct G-code adds value over a proven CAM workflow.

## Why Not the Alternatives Initially?

### Native Swift

Swift can produce an excellent Mac interface, but the elevation, projection,
raster, and contour pipeline would still depend on specialist native libraries.
It increases packaging effort before the product workflow is understood.

### QGIS Plugin

QGIS is excellent for validating datasets and generated geometry and should be
used during development. A plugin could implement the workflow, but it would
expose a large GIS application to users who need a focused fabrication tool.

### Browser-only Application

Map interaction belongs in the browser, but multi-gigabyte raster access,
coordinate transformations, contour polygon generation, and CNC export are more
reliable in the local Python/GDAL engine.
