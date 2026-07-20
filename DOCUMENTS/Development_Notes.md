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
- Hotfix after the first real-model optimiser test: search candidates now use
  bounded preview coastlines, then pass the original full-resolution DRC before
  any result is published. This prevents fine-rotation searches from exhausting
  the browser while preserving exact final clearance and sheet-edge checks.
- A second real-model test showed that even bounded passes could monopolise and
  crash the page while running on the interface thread. Continuous nesting now
  runs in a dedicated background Web Worker. It sends at most one candidate at
  a time to the interface, waits for acknowledgement, and can be terminated
  immediately. The main application remains responsible for full-resolution
  DRC before accepting an improvement.
- A corrupted/invalid saved layout exposed two further usability problems: the
  optimiser could reject every approximate candidate without first repairing
  the visible arrangement, and progress was only reported after a whole pass.
  Attempt 1 now uses conservative rotated part envelopes to guarantee an
  on-sheet, non-overlapping recovery layout before tighter polygon searches.
  The worker also reports placed-part progress throughout every attempt.
- Replaced the later rectangular-anchor-only search with sampled polygon-contact
  candidates. Rotated coastline vertices are aligned to vertices and edge
  normals of already placed parts, then filtered by polygon clearance and the
  final full-resolution DRC. Randomised order and rotation genes explore new
  contact combinations on every pass, allowing concave gaps to be used rather
  than treating every part as a permanent rectangle.
- Renamed the action to Optimise irregular shapes and report the count and
  examples of non-zero rotations whenever an improved layout is accepted.
- A deterministic worker test with four concave L-shaped parts confirmed that
  the recovery pass selected a 90° rotation and subsequent contact passes used
  independent 180° and 270° rotations with non-rectangular placements.
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
  interaction. Fabrication-resolution generation remains a Stage 8 concern.
- Synthetic regression produced eight cumulative polygons and retained its
  deliberate enclosed NODATA hole.
- Four-tile Taranaki regression generated 10 Log-spaced layers on a 483 × 520
  grid: 23 polygon pieces, 34 rings, no structurally invalid geometry, and a
  compact 0.26 MB JSON result.
- Maximum-size regression also passed: 40 Log layers produced 98 valid polygon
  pieces in 0.22 seconds, while 40 Linear layers produced 84 in 0.18 seconds.
- Frontend production build and Python syntax checks pass successfully.

### Stage 6 — Physical Format and 3D Stack Preview

- Implemented and accepted 18 July 2026.
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
- Corrected the canvas latitude axis after the New Plymouth test revealed that
  the oblique model appeared back to front. North now starts at the top and east
  at the right exactly as on the 2D map; N/E/S/W labels and a North up reset make
  orientation explicit while rotating.
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

### Stage 7 — Parts and Registration Planning

- Implemented 18 July 2026; awaiting Guy's assembly-plan acceptance test.
- Added a third full-screen workspace mode, Assembly, beside 2D Map and 3D
  Model. It reviews one physical layer at a time from L01 upward.
- Every disconnected Stage 5 polygon receives a stable identifier. The largest
  component is A; remaining components are ordered geographically.
- The assembly drawing shows each part ID with a north arrow. Parts with at
  least 9 mm clearance on both the engraved layer and its solid covering layer,
  plus 300 mm² area, are eligible for covered machining text; exposed or smaller
  pieces are explicitly assigned to the assembly sheet.
- Added configurable grid pitch (100 mm default), nominal dowel diameter (4 mm),
  finished hole diameter (4.2 mm), and minimum edge clearance (6 mm).
- A proposed grid hole is accepted only if the location has at least two
  contiguous physical layers, retains clearance in every intersected part, and
  leaves the local uppermost layer solid as a cap.
- The initial scalene three-hole datum proved too restrictive on Banks
  Peninsula and could leave the model with virtually no useful alignment
  points. The planner now identifies every terminal summit branch, works down
  from its highest layer until a safe covered 4 mm location exists, and carries
  that peak vent through all supporting layers to the base.
- Grid holes remain as supplemental registration. Peak vents, grid holes, north
  orientation, part areas, per-part hole counts,
  machining-label eligibility, and warnings are visible before export.
- Assembly settings persist locally and changing them recalculates the plan
  without modifying the original terrain geometry.
- Frontend production build passes successfully.

## Next Steps

1. Open Assembly after generating the four-tile Taranaki layers.
2. Review part names and the layer-by-layer north orientation.
3. Confirm regular holes appear only on layers that have solid terrain above.
4. On Banks Peninsula, confirm orange vents appear beneath the separate volcano
   peaks and continue through every supporting layer to L01.
5. Change grid pitch, hole diameter, and edge clearance and inspect the plan.
6. Mark Stage 7 complete only after the assembly scheme looks practical.

### Stage 8 — Manufacturing SVG Geometry

- Implemented 18 July 2026; awaiting Guy's finished-size export acceptance
  test.
- Added Manufacture as a fourth full-screen workspace beside 2D Map, 3D Model,
  and Assembly.
- Generates one SVG per physical layer at the exact selected millimetre width
  and height. North remains at the top.
- Separates red `CUT_OUTLINES`, blue `DRILL_HOLES`, and green `ENGRAVE` groups
  so the intended operations are inspectable and machine-readable.
- Exports only safe covered part labels and north arrows; small-part names
  are engraved in nearby waste with a short leader that never crosses the part
  outline. If no safe waste area exists, the name remains on the assembly
  sheet.
- Waste labels are provisional in Stage 8 and must be recalculated from the
  final waste geometry after manual or automatic sheet nesting.
- Offers a selected-layer download and a dependency-free ZIP containing every
  layer, a same-scale overview, and manufacturing notes.
- Records layer elevations, dimensions, material thickness, and source
  filenames in SVG metadata.
- Deliberately does not add cutter compensation, smoothing, tabs, nesting, or
  toolpaths. These remain visible fabrication stages before direct G-code.
- Frontend production build passes successfully.

## Revised Next Steps

1. Download the Stage 8 package for a known Taranaki or Banks Peninsula model.
2. Confirm the ZIP opens and contains every layer plus the overview and notes.
3. Open or print one layer without scaling and measure its physical dimensions.
4. Confirm red outlines, blue volcano vents/grid holes, and green covered
   engraving appear on the expected layer.
5. Begin Stage 9 cutter-scale cleanup only after the exported geometry is
   accepted.

### Stage 9 — Interactive Geometry Cleanup

- Implemented 18 July 2026; awaiting Guy's multi-layer smoothing acceptance
  test.
- The header now always shows the product workflow. Unavailable future tools
  remain visible as disabled buttons: Sheet Layout, G-code, Colour Chart, and
  BOM.
- Added a full-screen Smoothing workspace with independent 0–12 mm cleanup for
  every physical layer, Apply to all, reset, and 1×–8× inspection.
- The preview overlays the original raster-derived edge as a dotted red line
  and the cleaned manufacturing edge as a solid green line.
- Live statistics compare part count, smallest part area, hole count, and
  smallest hole area before and after cleanup.
- Cleanup is non-destructive. It smooths terrain edges, removes islands and
  holes below the chosen physical-size threshold, and locks selection-boundary
  vertices so rectangular frame edges remain straight.
- Cleaned geometry feeds the 3D view, volcano-vent plan, Manufacture view, and
  downloaded SVG package.
- Frontend production build passes successfully.

### Stage 10 — Manual Sheet Layout

- Implemented 18 July 2026; awaiting Guy's placement and DRC acceptance test.
- Enabled Sheet Layout in the always-visible product workflow.
- Added configurable sheet width, height, thickness, edge no-cut zone, and
  minimum part spacing, initially 1200 × 600 × 3 mm, 15 mm, and 8 mm.
- Added multiple material sheets, actual-dimension 100 mm reference grid,
  dragging snapped to 0.5 mm, 90-degree rotation, selection, and removal.
- Added PCB-style DRC warnings for edge-zone and inter-part clearance. Warnings
  colour affected parts red but never block placement.
- Replaced the initial rectangular collision approximation with transformed
  polygon-ring clearance. A bounding-box broad phase preserves interactivity;
  close candidates use segment intersection, containment, and minimum segment
  distance around actual coastlines and holes.
- Added a searchable parts library. Add can create duplicate replacement copies,
  and Replacement sheet creates a clean sheet without changing prior layouts.
- Added an editable first-fit Auto layout for unplaced original parts. It uses
  0/90-degree rotations, respects current rules where possible, adds sheets when
  needed, and leaves impossible fits as visible DRC exceptions.
- Reports sheet count, placed instances, and approximate material area use.
- Displays the conservative part-spacing rule as a half-spacing halo on each
  part. Two touching halos correspond to the full required clearance; affected
  halos and outlines turn red when DRC reports a clash.
- Tiny parts use a minimum 16-pixel invisible hit target. The sheet view now has
  1×, 2×, 4×, and 8× zoom, drag-to-pan on empty material, Fit, Focus selected,
  and selection through a placed part's library entry.
- Clearance halos now follow the actual coastline and show half the required
  spacing on each part, exactly like a PCB track halo. Violations remain red.
- Manual rotation now offers −15°, +15°, and +90°. The quick Auto layout retains
  its readable left-to-right row preference.
- Clicking a DRC warning focuses and highlights its parts. Selecting a part
  highlights every visible warning involving that placement.
- Fixed an Auto layout browser crash found on the first full-model test. Trial
  positions now use a fast conservative rectangle test; precise coastline DRC
  runs once on the resulting editable layout and during manual adjustment,
  rather than for every rejected search candidate.
- Removed pointer lag by limiting placement updates to the display frame and
  pausing exact coastline DRC during a drag. Releasing the part immediately
  checks its rotated polygon using the same transform used to draw it.
- Added Save layout for browser-local persistence and Backup file/Restore file
  for a portable, versioned JSON copy. Positions, rotations, sheets, rules,
  smoothing, output size, and assembly settings are retained. Elevation source
  files are not embedded and must be loaded again to regenerate the same parts.
- Fixed false sheet-edge warnings on irregular rotated parts such as L02A. Edge
  DRC now measures the transformed coastline rather than the unused corners of
  its enclosing rotated rectangle.
- Replaced rectangular canvas hit-testing with exact rotated-outline selection,
  while preserving an enlarged target for genuinely tiny parts. Added an
  explicit Deselect button so empty-sheet panning is always accessible.
- Replaced the separate Save example and Save layout controls with a named
  project library. The active project includes output format, map rectangle,
  analysis metadata, processed layer geometry, distribution and boundaries,
  material and 3D settings, smoothing, assembly, sheets, and placements.
- Added editable default project names; New/Open/Save/Close; automatic saving
  1.5 seconds after the last change; and portable `.topomapper` JSON export and
  import. Switching and closing force an immediate save.
- Project records use IndexedDB rather than local storage so processed terrain
  geometry and multiple landscapes have practical storage capacity. Original
  GeoTIFFs remain external, with filenames retained for later regeneration.
- Existing selection, output, layer, assembly, and sheet-layout saves are
  migrated into a first recovered project when the library is initially empty.
- Added finished-size SVG export directly from Sheet Layout. The active sheet
  downloads individually; all populated sheets and manufacturing notes can be
  downloaded as one ZIP.
- Added named SVG layers for profile cuts, drilled holes, part IDs, north marks,
  waste labels, and non-machining stock references. Through operations carry
  material-depth metadata; engraving groups specify 0.5 mm depth.
- Abbreviated sheet IDs (`L04A` → `4A`) are generated as single-line vector
  strokes so CAM import does not depend on fonts. On-part IDs and north arrows
  use the existing covered-engraving safety decision and inherit every nesting
  rotation.
- Small parts receive a combined ID, north mark, and leader in available waste.
  Candidate positions avoid sheet margins, part bounds, prior labels, and
  blocked leader routes; any label that cannot fit is reported after export.
- Production build passes successfully.

### Stage 11 — Initial Automatic Nesting and Printable Guide

- Added selectable 1°, 2°, 5°, 10°, and 15° nesting rotation resolution plus
  direct ±1° manual rotation controls. The setting is stored in each named
  project.
- Added an interruptible polygon-aware optimisation search. It varies large-part
  ordering and rotation samples, uses actual transformed coastlines for spacing,
  favours fewer sheets before a compact used envelope, and continually publishes only the
  best valid editable result found so far.
- Retained the quick conservative Auto layout for immediate simple placement;
  the longer optimiser is an explicit separate action with a Stop control.
- Deferred machine engraving and simplified stock-sheet SVG/ZIP output to
  `CUT_OUTLINES`, `DRILL_HOLES`, and the non-machining `SHEET_REFERENCE`.
- Added a local ReportLab PDF endpoint and a Sheet Layout download control. The
  A4 landscape guide contains one scaled labelled overview per populated sheet,
  collision-aware leaders, true assembly-north arrows after arbitrary nesting
  rotation, and paginated part indexes with rotation, position, and size.
- Rendered and visually checked a two-page synthetic PDF; overview labels,
  arrows, margins, index table, page size, and print legibility are correct.
- Reproduced the optimiser against an exported real terrain project after valid
  layouts appeared motionless. The worker was rotating and relocating parts,
  but simplified coastlines omitted enough detail for every tighter trial to
  fail the final full-resolution clearance check.
- Each simplified search outline now records its maximum geometric deviation.
  Pairwise searches add both parts' measured deviations to the requested design
  rule, so fast background trials remain conservative when checked against the
  original coastlines.
- Optimiser status now distinguishes a failed full-resolution trial from a
  valid trial that is less compact than the saved layout, including its sheet
  count and number of rotated parts. A strong manual layout therefore remains
  unchanged for an explicit reason rather than appearing inactive.
- Frontend production build and Python syntax checks pass successfully.
