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
- Added the first automatic LINZ acquisition path. A selected rectangle creates
  a cropped NZ 8m DEM export and WFS requests for Topo50 lakes, lagoons and river
  polygons. Results are cached outside projects and passed into the existing
  analysis and layer-generation paths as ordinary GeoTIFF and GeoJSON files.
- The LINZ data-access key is entered once and stored in macOS Application
  Support with owner-only permissions. Manual terrain and water file selection
  remains available, and downloaded elevation is analysed automatically.
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
- A saved project retains the analysed elevation statistics and its terrain
  preview between sessions. Stage 3 is only marked complete when that saved
  payload contains usable coverage for the project's current rectangle; an
  incomplete or mismatched legacy record is shown as incomplete instead.
- Automatic LINZ downloads are cached under macOS `~/Library/Caches/Topomapper/linz`.
  Repeating the exact same rectangle reuses that cache instead of requesting a
  new cropped export; changing any rectangle boundary creates a different cache key.
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

### Stage 4 — Layer Plan

- Implemented and accepted 18 July 2026.
- Added a calculated land-elevation plan after a successful raster analysis.
- Sea level is a named, fixed 0 m boundary and the analysed maximum is a fixed
  final boundary.
- Added logarithmic and linear spacing styles. The style and physical
  layer count are independent, so either distribution can be regenerated with
  between 5 and 30 layers using a numeric entry.
- Added a colour-coded elevation range showing every active boundary.
- Replaced individual boundary editing with a read-only list of every level,
  its assigned paint colour, and its calculated altitude band.
- Added sheet-thickness entry and explicit snow coverage controls. Snow is on
  by default and can cover between one and five top layers.
- The interface reports the resulting physical elevation-band count.
- Valid working layer plans are saved locally and restored when the analysed
  maximum matches.
- Subsea boundaries remain deferred until the coastal and bathymetry stage.
- Production build passes successfully.
- After acceptance, the spacing buttons were relabelled Log and Linear. Either
  distribution can still be regenerated with the independent 5–30 layer count.

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
- Changed the incremental nesting preference from minimum height to minimum
  used width, so a new trial fills the stock from the left edge toward the
  right rather than forming a shallow band across the top.
- Split the persistent completed-attempt verdict from the live per-part progress
  line. Starting the next background attempt no longer erases the explanation
  of why the previous trial was accepted or retained.
- Added a clearance-safe gravity shakedown after every complete nesting trial.
  Parts settle toward the left in 10 mm, 2 mm, then 0.5 mm increments, ordered
  from the existing left-hand structure outward, before the full-resolution DRC
  and compactness comparison decide whether to publish the trial.
- Live progress identifies the shakedown phase, and the completed-attempt result
  reports the number of settled parts and their combined leftward movement.
- Frontend production build and Python syntax checks pass successfully.

### Stage 12 — Paint Colour Planning

- Enabled the previously visible Colour Chart workspace after terrain layers
  have been generated.
- Added a six-colour Molotow Premium buying palette from the supplied local art
  shop chart: moss green, evil olive, nature green middle, cocoa middle, stone
  grey middle, and optional signal white snow.
- Assigns the five terrain colours evenly by physical layer order. Snow can be
  enabled or disabled and can assign signal white to the highest one through
  five physical layers.
- Uses the same assignment in the map overlay, 3D stack, assembly preview,
  layer list, and printable chart.
- The buying cards list manufacturer, product number, paint name, layer numbers,
  and elevation span. Editable alternative shop or brand names autosave inside
  the named `.topomapper` project.
- Added an A4 print layout with exact background-colour printing, a complete
  layer-by-layer paint schedule, and a reminder to test physical paint on the
  intended primed material.
- Added a direct PDF download containing the paint buying cards and complete
  layer schedule, independent of browser print settings.
- Removed the floating Find a Location panel from the Colour Chart workspace so
  it cannot obscure the chart or its controls.
- Existing version-1 project files remain compatible and receive automatic
  colour defaults when opened.
- Frontend production build passes successfully.

### Water-feature manufacturing decision

- A retained lake, lagoon, or significant river is a true hole through every
  terrain layer in which it appears, intended to receive a separately cut and
  blue-painted insert.
- Water holes use the same scale-aware smoothing and minimum-feature controls as
  small peaks and islands. Tiny water features may therefore disappear, but
  significant features and land islands enclosed by them must be preserved.
- Importing and subtracting mapped water geometry is implemented as the first
  part of Stage 15 after inserting machining-ready SVG preparation ahead of
  direct G-code.

### Stage 15 — Inland water cutouts (partial)

- Added an optional Step 2 water-boundary chooser for cropped WGS84 GeoJSON and
  KML lake, lagoon, and significant-river polygon files.
- Linked directly to the LINZ Topo50 lake and river polygon datasets. River
  centrelines are deliberately rejected because they have no cuttable width.
- Rasterises imported water against the same bounded terrain grid and subtracts
  it from every cumulative physical layer before polygon generation. Enclosed
  water becomes a true hole; water reaching the frame edge becomes an open cut.
- Records water filenames and processed geometry in the named project. Source
  files are only needed again when layers are regenerated.
- Existing smoothing removes water holes below the selected practical feature
  size in the same manner as tiny terrain holes.
- Recorded a future CAM preflight rule for fine rivers: a cut-through water
  channel narrower than the selected cutter cannot silently become G-code. The
  user must omit or widen it, use a suitable centreline engraving treatment, or
  select a smaller cutter.
- Recorded an optional small-part handling feature. A sacrificial label tail is
  united with the part before nesting, extends toward geographic east, carries
  the stable ID/orientation, and rotates with the nested part. Automatic
  threshold selection and per-part overrides are required; tails participate
  in exact DRC and are removed before assembly.
- Moved Colour Chart output controls into a consistent top-bar Output menu. The
  same menu exposes existing Sheet Layout and Manufacture downloads and reserves
  a visible home for future 2D, 3D, and Assembly outputs.

### Stage 13 — Machining-ready sheet SVGs (planned)

- Inserted a controller-independent manufacturing stage between accepted sheet
  nesting and direct G-code.
- Side 1 will contain shallow text and orientation annotations. Side 2 will
  separate drilling/internal openings, full profiles down to material thickness
  minus remaining bridge thickness, and final full-depth release segments that
  stop at every configured bridge.
- Bridges require physical preview, configurable width/count/remaining
  thickness, automatic weak-feature avoidance and manual editing. Face files
  share an explicit flip diagram and datum so edge-stop repositioning can be
  checked before machining.
- Added the initial machining inputs to the planned stage: 1–12 mm stock
  thickness, cutting speed in mm/min, maximum depth per pass and remaining
  bridge height. The pass builder stops full profiles at the bridge floor and
  uses a final full-depth operation only on the segments between bridges.
- Recorded the 12 mm regression example: with 3 mm maximum passes and 1 mm
  bridges, full-outline depths are 3, 6, 9 and 11 mm, then the non-bridge
  release geometry reaches 12 mm.
- Added a cut-through allowance setting for uneven CNC beds, defaulting to
  0.2 mm. In the 12 mm example, internal cuts and non-bridge release segments
  finish at 12.2 mm while the retained bridge floor remains at 11 mm. Unbridged
  cuts use 3, 6, 9, 12 and 12.2 mm depths so the allowance is a final skim pass.

### Stage 11 — SVGnest interoperability

- Added three portable SVGnest acceptance fixtures under `fixtures/nesting`:
  a one-sheet square case, a provable two-sheet square case, and an L-shaped
  one-sheet case whose compact arrangement requires polygon rotation and
  interlocking. These separate SVGnest behaviour from coastline complexity and
  Topomapper project/import state while diagnosing the external round trip.
- The fixtures confirmed two upstream UI behaviours: SVGnest absolutely
  positions exactly two bin previews on top of one another even though its
  downloaded SVG separates them, and a rotation count of zero is ignored by
  configuration validation rather than disabling rotation.
- Replaced the fixed approximately-64-point SVGnest proxy with adaptive,
  tolerance-controlled simplification. The default 0.25 mm physical geometry
  tolerance is checked in both directions between the exact ring and proxy,
  including samples across simplified chords to catch concave-inlet shortcuts.
  The proxy download reports its measured maximum error and vertex count.
- Added persisted Cutter diameter (3 mm default) and Geometry tolerance (0.25
  mm default) sheet settings. Cutter-aware feature rejection and final arc
  fitting remain separate manufacturing-stage work; SVGnest still receives
  polygonal proxy paths because it polygonifies SVG curves internally.
- A real 139-part Taranaki proxy demonstrated that using the full 0.25 mm
  manufacturing tolerance increased the search from about 4,775 to 16,914
  vertices and stalled SVGnest; applying spacing could crash its offset/NFP
  preparation. Nesting now uses a separate automatic proxy tolerance no finer
  than cutter radius (1.5 mm for the default tool), while retaining the 0.25 mm
  manufacturing setting for exact restored output. Measured proxy error remains
  included twice in the safe SVGnest spacing.
- The handoff instructions now explicitly warn that SVGnest's default spacing
  of zero is not valid for a Topomapper proxy and state the exact value to enter.
- Added a temporary 20% diagnostic export for isolating SVGnest scaling and
  stability. It deterministically samples across parts ranked from largest to
  smallest, reports retained part/vertex counts and uses the same bin, tolerance
  and spacing rules as the full job. Diagnostic output is marked on the stock
  bin and explicitly rejected by Topomapper import.
- Fixed Sheet Layout retaining stale placement records after smoothing removed
  manufacturing parts. The layout now reconciles against the current part IDs,
  removes only obsolete placements, preserves surviving manual positions, clears
  stale selection/DRC focus and reports the change. New parts remain unplaced for
  an explicit Quick Placement pass.
- Diagnosed a 131-part coarse Taranaki round trip: SVGnest returned 130 paths
  because the 5 mm search simplifier collapsed `L03G` to two distinct points,
  which SVGnest silently discarded. Proxy simplification now falls back to the
  exact ring whenever fewer than three unique points or negligible area remain.
- SVGnest import now accepts useful partial multi-sheet results, clearly lists
  omitted part IDs and leaves those parts unplaced for recovery rather than
  rejecting the entire nest. Exact restored geometry still undergoes DRC.
- Direct measurement of that SVGnest result found 0 mm part clearance even
  though its proxy requested 20.492 mm. This establishes that SVGnest's spacing
  field remained at its default zero; instructions now explicitly require its
  separate Save Settings action before Start Nest.

- Added a recommended SVGnest handoff alongside the editable Topomapper quick
  optimiser. This is intentionally an honest external-tool workflow rather
  than presenting the earlier heuristic as SVGnest.
- The original exact input exposed 61 parts, 7,260 outline vertices, 309 closed
  sub-shapes, and—at a 2° editing step—180 SVGnest rotations. SVGnest remained
  at approximately 0% while preparing no-fit polygons; enlarging the bin could
  not reduce this geometric workload.
- Replaced that input with a nesting-only proxy. Each part's outer coastline is
  reduced using a measured-error line simplifier; water and registration holes remain in
  the Topomapper project rather than participating in SVGnest's search.
- Measures the maximum proxy deviation and adds twice that value plus a small
  tolerance to the requested spacing, protecting the later exact outlines.
- Added an independent SVGnest selector for 4, 8, 12, or 24 rotations, defaulting
  to 12. Fine Topomapper manual rotation remains available after nesting.
- The downloaded proxy and interface state plainly that it is not a cutting
  file. Exact geometry must be restored and DRC checked during result import.
- Before result import was added, the SVGnest result remained separate from the
  named project and its existing PDF guide described only the internal layout.
- Added MIT attribution for SVGnest. No SVGnest source is copied into the
  application at this stage.
- The initial two-sided proposal used two alignment pins and an end-to-end
  transform. This remains available as a future optional registration mode;
  when enabled, its keep-outs must participate in nesting and post-import DRC.
- Side 1 machining will be optional; its SVG can instead serve as the visual
  map for hand-written underside IDs. The PDF layout guide remains a useful but
  optional companion output.
- Added SVGnest result import using the real downloaded format. SVGnest retains
  Topomapper's instance and part IDs, places each stock sheet in a top-level SVG
  group, and records placement with nested translation/rotation transforms.
  Topomapper validates the original stock dimensions, rejects scaling,
  mirroring, unknown IDs, duplicates and missing project parts, then restores
  exact geometry and runs the existing full-resolution DRC.
- The first two-sided registration method now uses accurately sized stock
  relocated against fixed machine edge stops, so SVGnest does not lose usable
  area to pin keep-outs. Alignment holes remain an optional later mode.
- Renamed the Sheet Layout control from Part spacing to Cut-edge gap and defined
  it as the final exact edge-to-edge clearance. Each canvas halo is a centred
  stroke whose visible exterior occupies half the configured gap; two halos
  therefore touch at the design-rule limit. Decimal values such as 3.5 mm are
  accepted.
- SVGnest offsets every part outward by half its spacing and its bin inward by
  half. The proxy bin now compensates outward for that behaviour and for the
  measured simplification error, so importing exact parts restores the requested
  physical stock-edge zone rather than adding an unintended extra border gap.
- Renamed Auto layout to Quick Placement and placed it first in the Sheet Layout
  setup sequence. The drawer now exposes sheet width, sheet height, inherited
  thickness, material border, part spacing and minimum rotation together. New
  projects default to 1200 × 600 mm, 15 mm, 3 mm and 15° respectively.
- Renamed the existing interruptible background search Optimise I. Disabled
  Optimise II and Optimise III controls reserve the intended progression toward
  embedded SVGnest and deeper multi-start searches without presenting unfinished
  actions as functional.
- Fixed a Sheet Layout lock-up found with a 135-part Taranaki project. Editing a
  stock or spacing rule now stops an active optimiser, updates the field
  immediately, waits briefly for entry to settle, and then runs the expensive
  exact-coastline DRC once with an explicit Rechecking sheet layout status.
  Quick Placement and Optimise I remain disabled until that rule check finishes.
- Tightened Optimise I after layouts showed clearances tens of millimetres above
  the requested rule. The worker now caps its simplified-outline steering
  allowance, while the unchanged exact-geometry DRC remains the authority before
  a result is published. Four repeated left-and-up settling passes replace the
  former one-way left shakedown so parts can close vertical gaps before moving
  left again.
- Added internal-gap backfilling to Optimise I. Later attempts combine sampled
  left/right boundaries with independently sampled top/bottom boundaries,
  allowing a part to test cavities defined by two different neighbours. Candidate
  scoring now strongly prefers positions that do not enlarge the sheet's current
  used envelope, so small pieces fill existing space before extending a row or
  opening another sheet. This is deliberately slower and remains interruptible.
- Corrected Optimise I's best-result ranking after a quick placement using two
  sheets plus 500 mm was replaced by a nominally better result using two sheets
  plus 620 mm. Total occupied sheet length now outranks envelope area, so a
  shallower but longer arrangement cannot be accepted as an improvement.
- Diagnosed an SVGnest import that reported no stock-sheet bins. The unfilled
  stock outline allowed a click inside it to select the white 1200 × 2439 mm
  staging page behind it, producing a convincing but invalid nest on one tall
  canvas. New proxies use a lightly filled, heavier-outlined stock rectangle;
  the instructions explicitly distinguish it from the white page, and importing
  a wrong-bin result now explains exactly how to repeat the nest.

### LINZ download authentication correction

- Corrected the Koordinates REST API authentication prefix from `Key` to the
  documented lowercase `key`. The LINZ export endpoint treats this prefix
  strictly and otherwise rejects a valid LDS key with HTTP 401.
- Added an offline regression check for the exact authorization header without
  recording or exposing a user's key.

### Workflow interface reorganisation

- Replaced the separate location-search card and fixed right-hand setup panel
  with one left-hand Setup drawer. It opens quickly on hover, focus or click,
  remains open while a control has focus, and retreats more slowly after a short
  period without interaction. Its handle remains available in every model view.
- Tuned the drawer after physical use: the entire 12 px left screen edge now
  activates it, opening takes 320 ms, it waits 10 seconds after pointer exit,
  and its deliberately gentle retreat takes 1.95 seconds.
- The protruding Setup handle is now a direct open/close toggle. Clicking it
  closes the drawer immediately when sheet tabs or other left-side content need
  to be uncovered; edge hover and the timed retreat remain available.
- Reordered the main views to follow the actual dependency chain: 2D Map, 3D
  Model, Smoothing, Assembly, Sheet Layout and Manufacture. Future machining,
  G-code and BOM controls remain visible but disabled until implemented.
- Moved snow appearance and material-per-layer inputs into the layer-planning
  section, before the generated geometry and 3D actions. Generated layers now
  offer explicit Show 3D model and Then review smoothing actions.
- Renamed setup Section 5 to Layer Build. Smoothing controls now update their
  visible value immediately, wait briefly for pointer input to settle, and show
  an explicit recalculation state while the expensive polygon cleanup runs. The
  detailed Smoothing workspace still supports a separate value for each layer.
- Simplified normal terrain preparation to one progress-reporting action.
  Manual terrain/water imports and source metadata remain available under
  clearly labelled Advanced and Technical disclosures for recovery and
  diagnostics, without making file formats part of the normal workflow.
- Split the former combined first stage into independently collapsible Frame
  and Area Selection stages. Their bold headers, red/green LEDs and text status
  remain visible when closed. Frame completes when positive width and height
  values are present; Area Selection completes when a rectangle exists.
- Reduced frame configuration to explicit width and height in millimetres,
  A5–A1 landscape/portrait presets, and Fit current area. Square and imperial
  frames are entered directly. Area Selection now contains one drawing action
  followed by unboxed 10-point ground-size, area and boundary statistics.
- Flattened Frame and Area Selection into the drawer surface: stage cards and
  input outlines were removed, each section ends with one divider, and both
  primary actions use a solid green fill with left-aligned labels.
- Applied the same persistent, collapsible progress header and flat treatment
  to Step 3 Elevation Data. Its LED remains red until terrain analysis exists,
  then turns green; processor availability remains visible inside the section.
- Reduced Step 3's normal controls to the masked LINZ API key plus compact Auto
  Download and Manual Download actions. Analysis output now uses plain rows for
  low/high points, coverage, sources, cell size, coordinates and vertical datum.
- Replaced Step 4's separate Log and Linear buttons with one accessible blue
  Logarithmic Vertical Spacing switch; switching it off selects linear spacing.
- Standardised Sections 4–7 on the same collapsible title, text status and
  red/green LED format as the earlier setup stages. A valid calculated layer
  plan turns Section 4 green; generated geometry turns Section 5 green; sheet
  layout completes only when every part is placed and full DRC is clear.
- Reduced Section 5 to its single Generate/Regenerate action. Section 6 now
  provides one 0–12 mm smoothing slider applied across all levels, the smallest
  resulting part dimension, and per-level before/after part counts. Section 7
  exposes the stock sheet width and length while retaining the full layout view
  for placement work.
- Restored saved terrain previews as visible shaded topographic colouring and
  increased their visibility beneath generated layer colours. A repaint is
  requested immediately after the saved image layer is attached.
- Fixed reopened projects silently ignoring Generate Filled Layers. Browser
  `File` objects do not survive a session, so the generation action now restores
  the exact terrain and water crop from Topomapper's Mac cache (or reacquires it
  if that cache was removed) and continues automatically from the same click.
- The filled-layer section now reports total parts and parts per layer after
  generation. The smoothing section reports the corresponding after-smoothing
  total, per-layer before/after counts, and the smallest resulting part width.
- Terrain overlay attachment now checks for Topomapper's base map layers rather
  than MapLibre's overly strict all-sources-loaded state. This prevents a saved
  terrain preview being skipped while ordinary background tiles are loading.

### SVGnest result import performance

- Confirmed a 131-part, two-sheet SVGnest result was structurally valid and
  contained every expected Topomapper part. The browser crash occurred after
  parsing, while the restored full-detail coastlines were being compared by the
  sheet design-rule checker.
- Replaced exhaustive all-ring segment comparisons with cached exterior rings,
  an initial part-bounds test and a local segment spatial index. Water and drill
  holes do not affect inter-part clearance while part-in-part nesting is
  disabled. This preserves exact exterior-coastline DRC without making tightly
  nested layouts exhaust the browser tab.
- Removed the duplicate synchronous DRC pass from the import handler; the normal
  layout-state refresh now performs the check once after import.
