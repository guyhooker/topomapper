# Changelog

Topomapper uses semantic versioning while it develops toward the first proven
Mac fabrication release. Versions below 1.0 are working prototypes and may
still change their project or manufacturing formats.

## [Unreleased]

- Added an optional Lightweighting stage between Smoothing and Part ID. It
  insets areas covered by the next layer to preserve a contour glue margin,
  overlays a constant-pitch lattice, clips boundary openings to that inset,
  can omit the support lattice to expose the entire inset buried area, replaces
  separate alignment drilling, reports complete and clipped opening
  counts plus material-area reduction, and marks retained covered material as
  the bare/glue zone in Assembly.
- Fixed lattice cells being suppressed by obsolete peak/support reservations;
  contour glue rims and the lattice itself now provide the intended support.
- Preserved old volcanic cones and other retained islands by joining them to
  the nearest lattice rib, rather than rejecting their entire opening cell.
- Added configurable CNC holding tabs to sheet SVGs: closed profiles cut to tab
  height followed by open full-depth segments with evenly spaced bridges.
- Closed tidal gaps between the 8 m land DEM and coarse national bathymetry;
  water polygons now cut visible land while retaining blue subsea support.
- Fixed nationwide bathymetry rasters that cross the international date line
  being incorrectly rejected as outside a New Zealand selection.
- Made Undersea Layers selectable before bathymetry is loaded; enabling it now
  opens the Stage 3 manual-data controls and explains the required analysis.
- Added a strict design-to-manufacturing handover ZIP containing paired Side 1
  and Side 2 SVGs for every sheet, machining information, assembly-guide and
  painting-guide PDFs, and manifest.
- Added manual ESNZ/NIWA bathymetry analysis and an independent deep-base,
  −200/−100/−50/−20/−10/0 m subsea stack with blue paint assignments throughout
  the design and manufacturing workflow.
- Added independent 0–40 mm subsea smoothing without increasing the conservative
  0–12 mm land limit.

## [0.2.0] - 2026-08-14

### Manufacturing Layout Prototype

- Added named, autosaved `.topomapper` projects containing terrain, model,
  smoothing, part-identification and sheet-placement state.
- Automated cropped LINZ 8 m elevation acquisition and imported retained lake,
  lagoon and significant-river polygons as physical layer holes.
- Added cumulative layer generation, per-layer smoothing, 2D/3D previews,
  assembly planning, registration holes and peak-to-base alignment vents.
- Added cutter-aware part IDs, north-pointing flags and dotted underside marks
  such as `B.1`, including clearance from coastlines and drilled holes.
- Added PCB-style sheet DRC, manual layout, replacement sheets and the external
  multi-sheet SVGnest export/process/import workflow.
- Added finished-size sheet SVG and printable layout-guide exports, plus a
  mirrored Side 1 engraving overlay with explicit Side 1/Side 2 face captions.
- Added the Molotow-based terrain colour plan and printable colour chart.

### Still pending before 1.0

- Embedded automatic nesting without the external SVGnest handoff.
- Complete bridge/tab machining layers and direct, machine-profiled G-code.
- Bathymetry and separate subsea layer controls.
- Physical CNC test-model validation and a packaged macOS application.

## [0.1.0]

- Initial staged Topomapper prototype and interactive New Zealand map shell.
