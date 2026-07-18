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
- Three non-collinear, unequally spaced keyed datum holes to prevent rotated or
  mirrored assembly.
- Warnings when the datum cannot fit, no holes are safe, machining text is
  impractical, or the finished hole does not clear the chosen dowel.

### Acceptance Test

Every Taranaki polygon has a deterministic part name, ten layers can be reviewed
individually, all proposed holes remain capped by terrain, and the three keyed
datum holes cannot be matched after flipping or rotating the stack.

## Stage 8 — SVG Export

### Adds

- One labelled SVG file per physical layer.
- Combined registration/overview SVG.
- Finished dimensions, scale, source, layer order, and elevation metadata.

### Acceptance Test

The SVGs open at the requested physical dimensions in a vector editor and CAM
software. Printed paper outlines align when stacked.

## Stage 9 — Fabrication Geometry Controls

### Adds

- Cutter diameter and minimum practical feature size.
- Geometry simplification preview.
- Warnings for tiny islands, narrow bridges, and loose pieces.
- Optional registration holes and alignment marks.
- Choice to retain, enlarge, join, or omit impractical pieces.

Kerf compensation should normally remain a CAM operation unless testing proves
that topomapper must own it.

### Acceptance Test

Topomapper identifies deliberately troublesome small features, and registration
holes align consistently across every exported layer.

## Stage 10 — Coast and Bathymetry

### Adds

- Separate land and subsea boundary editors.
- LINZ coastal elevation data where available.
- NIWA/ESNZ bathymetry fallback with resolution warnings.
- Explicit land/bathymetry vertical-datum comparison.
- Glass sea-level plane in the preview.
- Blue subsea palette and downward layer stack.

### Acceptance Test

A Banks Peninsula selection shows land, coastline, and seabed bands without a
gap or silent zero-level mismatch. Low-resolution offshore geometry is visibly
identified.

## Stage 11 — DXF and Physical Test Cut

### Adds

- DXF export.
- Layer naming compatible with the chosen CAM workflow.
- Fabrication report listing material, dimensions, order, and warnings.
- Regression comparison between SVG and DXF geometry.

### Acceptance Test

Produce a small plywood test map through existing CAM software and the CNC
machine. Record fit, loose-piece problems, useful simplification, tolerances,
paint allowance, and assembly experience.

## Stage 12 — Packaged Mac Application

### Adds

- Normal macOS application bundle.
- Bundled processing dependencies.
- Project Open/Save and recent-project list.
- Friendly error reporting and diagnostic log export.
- Installation and upgrade procedure.

### Acceptance Test

Install and run topomapper on a clean Mac user account without manually starting
Python, a terminal, or a development server.

## Stage 13 — Optional Direct G-code

Only undertake this stage if the SVG/DXF-to-CAM workflow is genuinely
inconvenient.

### Adds

- Explicit CNC machine/controller profile.
- Tool library, feeds, speeds, depth passes, tabs, safe height, work origin, and
  postprocessor.
- Toolpath preview and safety checks.

### Acceptance Test

G-code is independently reviewed, simulated, air-cut, and then tested on scrap
material before any project sheet is machined.

## Suggested Release Milestones

- **Prototype A — Terrain analyser:** Stages 1–4.
- **Prototype B — Visual land model:** Stages 5–6.
- **Prototype C — Cuttable land map:** Stages 7–9.
- **Prototype D — Coastal model:** Stage 10.
- **Version 1.0 — Proven Mac fabrication tool:** Stages 11–12.
- **Optional CNC-native version:** Stage 13.
