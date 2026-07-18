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
- Extended the chooser and processor to combine up to 24 adjoining GeoTIFF
  tiles in one analysis. The files may use different supported coordinate
  systems and are reprojected into one transparent preview mosaic.
- Exact minimum and maximum scanning remains tile-based and uses the original
  raster values; the visual mosaic is downsampled separately for display.
- The results identify which source tile contains each extreme and report how
  many supplied tiles overlap the selection.
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
- Rasterio was installed successfully by the first normal Terminal start. The
  protected Codex environment could not download it independently, so later
  regression checks reused Topomapper's isolated project environment.
- Guy's first real-data test used BH29 alone over a larger national-park
  selection. Topomapper correctly reported 36% coverage, a 1 m minimum, and a
  997 m maximum part-way up the mountain rather than treating the absent summit
  as zero elevation.
- Processor regression with the real 8 m BJ29 and BH29 files together found a
  2510.3 m maximum at 174.06380 E, 39.29629 S in BJ29, a plausible raster-cell
  result beside the Mount Taranaki summit. The fixed Stage 2 reference rectangle
  has about 76% coverage from those two north/south tiles because it also extends
  beyond their shared east/west limits.
- Guy added BH28, BH29, BJ28, and BJ29 to cover the complete national-park
  selection. The real four-tile mosaic displayed correctly and reached 100%
  usable coverage.
- Independent regression over the fixed Stage 2 reference rectangle with those
  four real tiles reported a 41.2 m minimum in BH28, a 2510.3 m maximum in BJ29
  beside the summit, and 100% coverage.
- Stage 3 was accepted on 18 July 2026.

### Stage 4 — Layer Boundary Editor

- Implemented and accepted 18 July 2026.
- Added a land-elevation boundary editor after a successful raster analysis.
- Sea level is a named, fixed 0 m boundary and the analysed maximum is a fixed
  final boundary.
- Added logarithmic and linear spacing styles. The style and physical
  layer count are independent, so either distribution can be regenerated with
  between 2 and 40 layers using decrease/increase controls.
- Added a colour-coded elevation range showing every active boundary.
- Added controls to enter a new boundary, edit intermediate values, remove
  them, and move them up or down in the ordered list.
- Duplicate values, blank/invalid values, and descending/out-of-order values
  produce a clear validation message and suppress the ready summary.
- The interface reports the resulting physical elevation-band count.
- Valid working layer plans are saved locally and restored when the analysed
  maximum matches.
- Subsea boundaries remain deferred until the coastal and bathymetry stage.
- Production build passes successfully.
- After acceptance, the spacing buttons were relabelled Log and Linear. Either
  distribution can still be regenerated with the independent 2–40 layer count.

### Stage 5 — Filled Layer Generation and 2D Preview

- Implemented and accepted 18 July 2026.
- Added a local `/layers` processor operation using the same selected bounds,
  GeoTIFF mosaic, and validated elevation boundaries as the interface.
- Each physical layer is generated as a cumulative filled mask at its lower
  elevation, so the output nests correctly for plywood stacking rather than
  returning contour lines alone.
- Raster polygonisation preserves disconnected pieces, interior rings/holes,
  and nested summit shapes without adding another Python dependency.
- Added a coloured land-layer overlay to the main map, elevation-range labels,
  polygon-piece and hole counts, per-layer visibility toggles, and Show all / Hide
  all controls.
- Changing the area, source files, or boundaries invalidates the old geometry
  so stale polygons cannot be mistaken for the current design.
- The preview grid is capped at 520 pixels on its longest side for responsive
  interaction. Fabrication-resolution generation remains a Stage 7 concern.
- Synthetic regression produced eight cumulative polygons and retained its
  deliberate enclosed NODATA hole.
- Four-tile Taranaki regression generated 10 Log-spaced layers on a 483 × 520
  grid: 23 polygon pieces, 34 rings, no structurally invalid geometry, and a
  compact 0.26 MB JSON result.
- Maximum-size regression also passed: 40 Log layers produced 98 valid polygon
  pieces in 0.22 seconds, while 40 Linear layers produced 84 in 0.18 seconds.
- Frontend production build and Python syntax checks pass successfully.

### Stage 6 — Physical Format and 3D Stack Preview

- Implemented 18 July 2026; awaiting Guy's visual acceptance test.
- Reframed the left panel as a location-finding map tool. The right panel now
  presents one numbered model workflow: area/format, elevation data, layer plan,
  filled geometry, and physical stack.
- Added early 8 × 12 inch, A2, square, custom-millimetre, and free-format
  choices with portrait/landscape orientation.
- A chosen format constrains new rectangles and dragged corner handles using
  ground-distance proportions rather than raw longitude/latitude degrees.
- Existing selections can be fitted around their centre while approximately
  preserving selected ground area; terrain is cropped/expanded, never stretched.
- Output settings persist on the local Mac.
- Added a dependency-free canvas preview using the generated polygon rings,
  including holes and disconnected components.
- Added rotatable 3D, direct side, and top viewpoints. The 3D model uses one
  common material thickness for every physical layer and respects the Stage 5
  visibility toggles.
- After the initial Stage 6 test, replaced the small floating preview with a
  full-screen 2D Map / 3D Model switch in the header. The model now occupies the
  full workspace between the header and status bar.
- Two-axis pointer dragging rotates the model horizontally and tilts it from a
  direct side view through oblique angles to a top view. Named 3D, Side, and Top
  buttons remain as quick reset viewpoints.
- Added finished size, physical stack height, true scaled relief height, and
  vertical-exaggeration readouts. An optional dashed true-elevation reference
  makes Log/equal-sheet distortion visible.
- New Plymouth is the second geometry reference area after Mount Taranaki. Any
  later cleanup must retain Paritutu and genuine offshore islands by default.
- Automatic tile retrieval was removed from the roadmap. Manual projects are
  intentionally limited to 24 adjoining GeoTIFF files.
- Small-piece removal remains off by default and separate from border smoothing.
  Original geometry must remain reversible; any component can later be marked
  Protected, and cleanup must never silently delete a meaningful summit or island.
- Frontend production build passes successfully.

## Next Steps

1. Choose A2, 8 × 12 inch, and square formats and confirm drawing/corner edits
   retain the correct ground ratio.
2. Generate the four-tile Taranaki layers and inspect the 3D and side views.
3. Confirm ten 6 mm layers report a 60 mm physical stack.
4. Compare the physical stack against the true-elevation reference.
5. Mark Stage 6 complete only after the side profile looks convincing.
