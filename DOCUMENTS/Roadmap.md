# topomapper Staged Development Roadmap

## Development Principle

Every stage must end with a visible, testable improvement. A stage may add one
part of the interface, one processing capability, or one toolchain component,
but should not depend on several unfinished future stages to demonstrate value.

Do not begin the next stage until the current stage's acceptance test passes.
Save representative inputs and outputs from each stage as regression examples.

Mount Taranaki is the recommended first test location because it proves land
elevation and fabrication geometry without introducing coastal datum and
bathymetry problems. Banks Peninsula is the later coast-and-seabed test case.

## Stage 1 — Application Shell and Map

**Status: Complete — 17 July 2026**

### Adds

- Local application launcher.
- MapLibre map centred on New Zealand.
- Pan, zoom, and basic place search.
- Simple topomapper title bar and status area.

### Acceptance Test

The application opens on the MacBook, finds Mount Taranaki by name, and allows
smooth navigation around New Zealand.

## Stage 2 — Area Selection

**Status: Complete — accepted 17 July 2026**

### Adds

- Rectangle selection tool.
- Editable selection handles.
- Display of latitude/longitude bounds, ground width, ground height, and area.
- Clear and reset controls.

Polygon selection can follow later if a rectangle proves sufficient initially.

### Acceptance Test

The user can select and adjust an area around Mount Taranaki and recover the
same numerical bounds after reopening a saved example.

## Stage 3 — First Elevation Dataset and Analysis

**Status: Complete — accepted 18 July 2026**

### Adds

- Local Python processing service.
- GDAL/Rasterio toolchain.
- Import of one or more manually downloaded LINZ GeoTIFF tiles.
- Clip elevation data to the selected rectangle.
- Display minimum and maximum elevation and their map locations.
- Hillshade or coloured elevation preview.

### Acceptance Test

For the Mount Taranaki selection, topomapper combines adjoining tiles, reports
plausible minimum and maximum elevations, marks their locations, and
distinguishes missing raster data from real elevation values.

## Stage 4 — Layer Boundary Editor

**Status: Complete — accepted 18 July 2026**

### Adds

- Elevation range or histogram display.
- Editable ordered list of layer boundaries.
- Add, remove, and reorder boundary controls.
- Named sea-level boundary at 0 m, although subsea processing is not yet active.
- Log-style and Linear spacing with an independently adjustable layer count.

### Acceptance Test

The user can select Log or Linear spacing, adjust the number of layers, edit
individual boundaries, and the application rejects duplicates or out-of-order
values clearly.

## Stage 5 — Filled Layer Generation and 2D Preview

**Status: Complete — accepted 18 July 2026**

### Adds

- Polygonal contour generation at the chosen boundaries.
- Correct filled/cumulative layer shapes rather than line contours only.
- Land colour palette.
- Layer visibility toggles and elevation labels.
- Handling of holes, disconnected pieces, and nested summits.

### Acceptance Test

The coloured 2D layer preview resembles Mount Taranaki, changing a boundary
changes the expected shapes, and all generated polygons are geometrically valid.

This is the first major feasibility gate. Do not invest in automatic downloads
or CNC integration until this stage produces convincing geometry.

## Stage 6 — Physical Format and 3D Stack Preview

**Status: Complete — accepted 18 July 2026**

### Adds

- Consistent numbered workflow on the right; location search remains a map tool
  on the left rather than appearing to be a separate production stage.
- Early format choice: 8 × 12 inch, A2, square, custom millimetres, or free.
- Portrait/landscape orientation and ground-crop aspect-ratio locking during
  both drawing and corner adjustment.
- Equal-thickness material setting and finished stack-height calculation.
- Rotatable 3D, direct side, and top views of the generated cumulative layers.
- Full-screen 2D Map / 3D Model workspace switch after filled geometry exists;
  free dragging changes both rotation and viewing angle.
- Optional true-elevation reference for judging vertical exaggeration caused by
  the chosen physical sheet stack.

### Acceptance Test

An A2, 8 × 12 inch, square, or custom selection retains its ground aspect ratio
without stretching. Ten 6 mm layers report a 60 mm physical height, the side
view shows the complete stack, and the full-screen model can be freely rotated
and tilted to reveal plausible Mount Taranaki geometry.

## Stage 7 — Parts and Registration Planning

**Status: Implementation complete — acceptance test pending**

### Adds

- Stable bottom-up part names such as L01A, L01B, and L02A for every
  disconnected polygon piece.
- Layer-by-layer full-screen assembly and machining preview with explicit north
  orientation.
- Optional covered part-name and north-arrow engraving where a piece is large
  enough; small pieces remain identified on the assembly sheet.
- Configurable grid pitch, dowel diameter, finished hole diameter, and minimum
  edge clearance.
- Buried alignment-hole generation: each proposed hole passes through lower
  mating layers but is omitted from the local top/capping layer.
- Top-down peak-vent generation: each terminal summit branch descends to its
  highest safe 4 mm covered location, then drills that location through every
  supporting layer to the base.
- Supplemental buried grid holes and north marks to prevent rotated or mirrored
  assembly.
- Warnings when no peak vent can fit, no holes are safe, machining text is
  impractical, or the finished hole does not clear the chosen dowel.

### Acceptance Test

Every Taranaki polygon has a deterministic part name, ten layers can be reviewed
individually, all proposed holes remain capped by terrain, and each viable peak
branch has an orange alignment vent continuing through its supporting layers to
the base. Banks Peninsula is the multi-peak acceptance case.

## Stage 8 — Manufacturing SVG Geometry

**Status: Implementation complete — acceptance test pending**

### Adds

- Full-screen Manufacture workspace with a layer-by-layer geometry preview.
- One finished-size SVG file per physical layer.
- Named profile-cut, drill, and covered-engraving operation groups.
- Small-part IDs engraved in nearby waste with leaders that stop outside the
  profile cut; final positions will be recalculated after nesting.
- A single ZIP download containing all layer SVGs, a scale-preserving assembly
  overview, and manufacturing notes.
- Finished dimensions, material thickness, elevation sources, layer order, and
  elevation metadata.

### Acceptance Test

The SVGs open at the requested physical dimensions in a vector editor and CAM
software. The ZIP opens normally, every expected layer is present, and printed
paper outlines align when stacked.

## Stage 9 — Fabrication Geometry Controls

**Status: Initial implementation complete — acceptance test pending**

### Adds

- Cutter diameter and minimum practical feature size.
- Geometry simplification preview.
- Warnings for tiny islands, narrow bridges, and loose pieces.
- Optional registration holes and alignment marks.
- Choice to retain, enlarge, join, or omit impractical pieces.
- Per-layer physical cleanup slider, original/cleaned overlay, zoom, and live
  part/hole/minimum-area comparison.
- Locked rectangular frame edges and cleaned geometry propagated into 3D,
  assembly planning, manufacturing previews, and SVG files.

Kerf compensation should normally remain a CAM operation unless testing proves
that topomapper must own it.

### Acceptance Test

Topomapper identifies deliberately troublesome small features, frame edges stay
straight, increasing cleanup removes sub-limit islands and holes, and
registration holes align consistently across every exported layer.

## Stage 10 — Manual Sheet Layout

**Status: Initial implementation complete — acceptance test pending**

### Adds

- Configurable stock sheet, initially 1200 × 600 × 3 mm MDF.
- Actual-scale drag, rotate, snap, collision, spacing, margin, and clamp-zone
  controls.
- Per-part face/orientation instructions; rotation is unrestricted while
  mirroring is explicitly tracked.
- Sheet count, used area, and waste estimate.
- PCB-style live DRC with non-blocking sheet-edge and part-spacing warnings.
- Searchable reusable parts library with duplicate copies and dedicated
  replacement sheets.
- Editable conservative Auto layout for currently unplaced original parts.
- Visible clearance halos, enlarged tiny-part hit targets, 1×–8× zoom, panning,
  parts-library selection, and Focus selected.
- Coastline-shaped clearance DRC, selectable 1°–15° manual rotation, and two-way highlighting
  between placed parts and their rule warnings.
- Responsive drag preview with exact transformed-outline DRC on release.
- Explicit local save plus JSON backup and restore for multi-session layout.
- Exact rotated-outline sheet-edge checks and selection, with a dedicated
  Deselect control for reliable panning.
- Named project library with editable default names, 1.5-second autosave,
  New/Open/Save/Close, and portable `.topomapper` import/export. Project
  documents include processed geometry and all settings through sheet layout.
- Finished-size active-sheet SVG and all-sheets ZIP export. Named machining
  layers separate through-cuts and drilling from the non-machining reference;
  engraving is deferred.

### Acceptance Test

All retained model parts can be placed manually without overlap and the saved
layout retains identical positions and orientations. A selected part can be
duplicated onto a replacement sheet without disturbing the production sheets.
A saved project can be restored after restarting Topomapper with its processed
terrain and identical sheet positions. Source GeoTIFFs are only required when
the terrain must be regenerated.
Every populated sheet opens at the configured stock dimensions in a vector
editor, and its machining operations can be selected independently by layer.

## Stage 11 — Automatic Sheet Nesting

**Status: SVGnest export/import round trip implemented — acceptance test pending**

### Adds

- Polygon-aware nesting across as few stock sheets as practical.
- Multiple attempts and a visible comparison of sheet count and waste.
- Manual adjustment of the automatically generated result.
- Reproducible placement settings and seed.
- An anytime optimisation mode that reports an early editable result, continues
  searching for fewer sheets or lower waste, and retains every improvement for
  as long as the user permits.
- A left-to-right placement preference for readable machining order.
- Selectable 1°, 2°, 5°, 10°, or 15° rotation resolution with direct ±1°
  manual correction.
- A printable A4 PDF sheet guide with readable full IDs, transformed
  assembly-north arrows, and indexed stock rotations/positions, so parts can be
  labelled by hand after cutting.
- A prepared SVGnest proxy containing the usable stock bin and a non-overlapping
  bounded-point outer outline for every requested production/replacement part.
  Exact water cutouts, internal holes, and registration drilling remain in the
  project for restoration after nesting.
- A conservative SVGnest spacing value that includes measured proxy deviation,
  plus a separate practical 4–24 rotation selector. Fine 1°/2° Topomapper
  editing no longer expands into an impractical 180–360 SVGnest rotations.
- A single physical clearance definition: Cut-edge gap is the final exact
  outline-to-outline distance, while each visible part halo occupies half that
  distance. Decimal cutter clearances are supported. The exported bin
  compensates for SVGnest's half-spacing inward offset at stock boundaries.
- SVGnest remains an explicit external nesting tool. Its downloaded result can
  be imported back into Topomapper, preserving IDs, sheets, translations and
  rotations while restoring exact geometry and rerunning DRC.
- Once the round trip is reliable, offer two manufacturing outputs per sheet:
  an optional Side 1 annotation SVG and a mirrored Side 2 exact cutting SVG.
  The first convention is an end-to-end flip with the accurately sized stock
  relocated against fixed machine edge stops. A diagram must show which ends
  exchange places after flipping. Alignment pins and their nesting keep-outs
  remain an optional later registration mode.
- The Side 1 SVG doubles as the layout-identification reference when the user
  elects to hand-write IDs instead of engraving. The existing printable PDF is
  retained as an optional workshop guide rather than a required extra file.

### Acceptance Test

After its result is imported, the SVGnest layout uses no more sheets than a
careful manual layout for the Taranaki regression model. Exact cut/drill
geometry is restored and inspected for collisions and boundary violations
before CAM.

## Stage 12 — Paint Colour Planning

**Status: Implemented — physical paint comparison pending**

### Adds

- Named Molotow Premium terrain palette with manufacturer numbers and display
  swatches.
- Automatic distribution of five land colours across any generated layer count.
- Optional white top layer, enabled automatically for models with 20 or more
  physical layers.
- Per-colour fields for alternative shop, brand, or paint names retained in the
  named project.
- Printable A4 buying chart and layer-by-layer elevation/paint schedule.
- Matching palette in the 2D map, 3D stack, assembly view, and colour chart.

### Acceptance Test

A 10-layer project uses five named terrain colours across two adjacent layers
each. A 20-layer project adds a white top layer in Automatic mode. Printing the
chart preserves readable swatches, product names, layer numbers, and elevations.

## Stage 13 — Toolpaths and Direct G-code

### Adds

- Explicit CNC machine/controller profile.
- Tool diameter, feeds, spindle control, depth passes, tabs, safe height, work
  origin, and postprocessor.
- Safe operation ordering: engraving, drilling, internal cuts, then tabbed
  external profiles.
- Toolpath preview, time estimate, safety checks, G-code download, and setup
  sheet.

### Acceptance Test

G-code is independently reviewed, simulated, air-cut, and tested on scrap MDF
before any project sheet is machined.

## Stage 14 — Coast and Bathymetry

**Status: In progress — inland water polygon cutouts implemented**

### Adds

- Separate land and subsea boundary editors.
- Import lakes, lagoons, and significant river polygons and subtract each
  retained feature from every affected physical layer as a true hole.
- Apply the same adjustable minimum-feature smoothing to water holes as to
  small terrain islands and peaks, while preserving islands inside lakes.
- Export matching water-insert geometry for separately cut, blue-painted parts.
- LINZ coastal elevation data where available.
- NIWA/ESNZ bathymetry fallback with resolution warnings.
- Explicit land/bathymetry vertical-datum comparison.
- Glass sea-level plane in the preview.
- Blue subsea palette and downward layer stack.

### Acceptance Test

A Banks Peninsula selection shows land, coastline, and seabed bands without a
gap or silent zero-level mismatch. Its significant coastal and inland lakes
appear as retained holes suitable for separate inserts. Low-resolution offshore
geometry is visibly identified.

## Stage 15 — Physical Test Model

### Adds

- Fabrication report listing material, dimensions, sheet order, and warnings.
- Small plywood or MDF model cut directly from Topomapper G-code.
- Recorded measurements for hole fit, tabs, paint allowance, and assembly.

### Acceptance Test

Produce a small test map on the CNC machine. Record fit, loose-piece problems,
useful simplification, tolerances, paint allowance, and assembly experience.

## Stage 16 — Packaged Mac Application

### Adds

- Normal macOS application bundle.
- Bundled processing dependencies.
- Native macOS document integration for the existing project library.
- Friendly error reporting and diagnostic log export.
- Installation and upgrade procedure.

### Acceptance Test

Install and run topomapper on a clean Mac user account without manually starting
Python, a terminal, or a development server.

## Suggested Release Milestones

- **Prototype A — Terrain analyser:** Stages 1–4.
- **Prototype B — Visual land model:** Stages 5–6.
- **Prototype C — Manufacturing geometry:** Stages 7–9.
- **Prototype D — Manually nested sheets:** Stage 10.
- **Prototype E — Automatically nested paint plan:** Stages 11–12.
- **Prototype F — Direct G-code:** Stage 13.
- **Prototype G — Coastal model:** Stage 14.
- **Version 1.0 — Proven Mac fabrication tool:** Stages 15–16.
