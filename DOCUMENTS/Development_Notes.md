# topomapper Development Notes

## Project Information

- Project name: `topomapper`
- Project type: Mapping project
- Started: 17 July 2026
- Owner: Guy Hooker
- Status: Requirements and architecture definition

## Working Practice

- Keep this project separate from GlassTopClock and other projects.
- Record requirements, design decisions, experiments, results, and next steps
  in this document as the project develops.
- Keep source files and user-facing documentation suitable for version control
  and eventual publication through GitHub.
- Do not store passwords, API keys, private location data, or other secrets in
  the repository.

## Product Direction

- MacBook application for designing physical layered terrain maps.
- User selects a location and area on an interactive map.
- Application analyses maximum land elevation and minimum seabed elevation.
- User defines independent, non-linear land and subsea elevation bands.
- Layers are intended for plywood or similar material cut on a CNC machine,
  painted, aligned, and bonded into a wall hanging.
- A glass sheet may represent sea level.
- New Zealand is the initial geographic scope.
- SVG/DXF geometry export precedes direct G-code generation.
- Initial technical direction: local MapLibre web interface with a Python/GDAL
  processing engine.

## Development Log

### 17 July 2026

- Created the new `topomapper` project folder.
- Added the initial README and development-notes structure.
- Recorded the project as separate from GlassTopClock.
- Defined the product as a tool for producing CNC-cut layered terrain and
  bathymetry wall maps.
- Added `Requirements.md` with the product workflow, layer behaviour, export
  requirements, and quality constraints.
- Added `Architecture.md` recommending a local browser interface plus a local
  Python/GDAL processing engine.
- Identified LINZ elevation/coastal products as primary New Zealand sources and
  NIWA/ESNZ bathymetry as a fallback.
- Deferred direct G-code until the geometry, CNC machine, tooling, and CAM
  requirements are proven.
- Added `Roadmap.md`, dividing development into thirteen gated stages from the
  first interactive map through SVG/DXF fabrication and optional direct G-code.
- Chose Mount Taranaki for the land-only proof and Banks Peninsula for the later
  coastal/bathymetry proof.

### Stage 1 — Application Shell and Map

- Completed 17 July 2026.
- Added the local TypeScript/React application structure using Vite/vinext.
- Added a full-window MapLibre map centred on New Zealand.
- Uses the OpenFreeMap Positron map style with visible OpenStreetMap attribution.
- Added pan, zoom, metric scale, coordinates, zoom readout, and map-source
  status.
- Added submit-only New Zealand place search. Search results are cached locally
  and no autocomplete/background queries are issued.
- Added quick navigation to Mount Taranaki, Banks Peninsula, and Aoraki/Mount
  Cook.
- Added a responsive topomapper application shell and a visible indication that
  area selection belongs to Stage 2.
- Production build passes successfully.
- Stage 1 acceptance target is met: the application opens locally, presents a
  navigable New Zealand map, and can locate Mount Taranaki by name or quick
  location.
- Development uses Codex's bundled runtime; no system-wide Node installation is
  currently required.

### Stage 2 — Area Selection

- Completed and accepted 17 July 2026.
- Added a rectangle drawing mode directly on the MapLibre map.
- Added four draggable corner handles so the selected area can be refined after
  drawing.
- Added live north, south, east, and west latitude/longitude bounds using five
  decimal places.
- Added ground width, ground height, and spherical surface-area calculations in
  metric units.
- Added Clear and Reset Taranaki controls.
- Added a fixed Mount Taranaki reference rectangle for repeatable testing.
- Added Save example and Open saved controls using storage on the local Mac.
- The current working selection is also restored automatically when Topomapper
  is reopened.
- Saved selections contain numerical bounds only; no account or cloud storage
  is involved.
- Updated the responsive interface from Stage 1 Explore to Stage 2 Select.
- Production build passes successfully.
- Guy confirmed the area selection was clear and usable after a hotfix ensured
  draggable handles receive coordinates before being attached to MapLibre.

### Stage 3 — First Elevation Dataset and Analysis

- Implemented 17 July 2026; awaiting acceptance with a real LINZ GeoTIFF.
- Added an isolated Python processing environment under `.venv`; it is created
  automatically on the first Stage 3 start and is excluded from Git.
- Added a localhost-only elevation service using Rasterio and NumPy.
- The normal `npm run dev` command now starts both the map and the local
  elevation processor.
- Added a GeoTIFF chooser to the Stage 3 panel. Browser-selected files are sent
  only to the processor on the same Mac, copied to temporary storage for the
  analysis, and deleted immediately afterward.
- Added coordinate-system transformation from the map's WGS84 selection to the
  source raster CRS, including NZTM2000 / EPSG:2193.
- Clips processing to the selected area and scans large rasters in 1024-pixel
  chunks rather than loading an entire high-resolution DEM into memory.
- Reports minimum and maximum elevation with their map locations.
- Distinguishes GeoTIFF NODATA values and uncovered selection area from valid
  zero elevation, and reports usable coverage as a percentage.
- Reports source filename, horizontal CRS, cell size, NODATA marker, and any
  vertical datum recorded in the GeoTIFF. An unstated vertical datum remains
  visibly labelled rather than guessed.
- Generates a coloured, shaded PNG terrain preview and overlays it on MapLibre.
- Adds labelled lowest and highest point markers; the result cards navigate to
  those locations.
- Added a reproducible synthetic Taranaki-shaped GeoTIFF fixture with a known
  summit and explicit NODATA patch. It is clearly labelled as non-survey data
  and cannot be confused with LINZ elevation data.
- Linked the interface and documentation to LINZ's official elevation access
  guidance.
- Frontend production build and Python syntax checks pass successfully.
- Full raster runtime verification requires Rasterio installation during the
  first normal Terminal start because the protected Codex environment cannot
  download Python packages.

## Next Steps

1. Restart Topomapper so its private Rasterio environment is installed and the
   local elevation service starts.
2. Analyse the generated synthetic Taranaki fixture and confirm the preview,
   high/low markers, and missing-data percentage appear.
3. Download or crop one real LINZ bare-earth DEM GeoTIFF covering the selected
   Mount Taranaki area.
4. Confirm plausible minimum and maximum elevations and inspect the stated CRS,
   resolution, vertical datum, and coverage.
5. Mark Stage 3 complete only after the real LINZ acceptance test passes.
6. Do not begin Stage 4 layer boundaries until Stage 3 is accepted.
