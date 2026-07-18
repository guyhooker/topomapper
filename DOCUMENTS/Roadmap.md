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

**Status: Implementation complete — real LINZ GeoTIFF acceptance test pending**

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

### Adds

- Elevation range or histogram display.
- Editable ordered list of layer boundaries.
- Add, remove, and reorder boundary controls.
- Named sea-level boundary at 0 m, although subsea processing is not yet active.
- Presets such as equal interval and a manually chosen non-linear set.

### Acceptance Test

The user can enter a non-linear set such as 0, 50, 100, 200, 350, 500, 750,
1000, 1500, 2000, and maximum, and the application rejects duplicates or
out-of-order values clearly.

## Stage 5 — Filled Layer Generation and 2D Preview

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

## Stage 6 — Physical Dimensions and SVG Export

### Adds

- Finished map width and height in millimetres.
- Preserve-aspect-ratio option.
- One labelled SVG file per physical layer.
- Combined registration/overview SVG.
- Scale, source, layer order, and elevation metadata.

### Acceptance Test

The SVGs open at the requested physical dimensions in a vector editor and CAM
software. Printed paper outlines align when stacked.

## Stage 7 — Fabrication Geometry Controls

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

## Stage 8 — Stacked 3D Preview

### Adds

- Material thickness per sheet.
- Exploded and assembled layer views.
- Optional vertical exaggeration.
- Finished stack height and sheet count.
- Basic green, grey, and snow-level colour planning.

### Acceptance Test

The preview contains the same number and order of layers as the SVG export, and
its reported physical height equals the layer stack being fabricated.

## Stage 9 — Automatic LINZ Data Retrieval

### Adds

- Determine data coverage for the selected area.
- Download only the required spatial window where the source permits it.
- Local dataset cache and cache-management interface.
- Dataset source, resolution, date, licence, coordinate system, and vertical
  datum display.
- Clear fallback and missing-coverage behaviour.

### Acceptance Test

A fresh Mount Taranaki project can obtain its elevation data without manually
locating a GeoTIFF, and a repeated project reuses the local cache.

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
- **Prototype B — Cuttable land map:** Stages 5–7.
- **Prototype C — Full visual model:** Stage 8.
- **Prototype D — Convenient New Zealand workflow:** Stage 9.
- **Prototype E — Coastal model:** Stage 10.
- **Version 1.0 — Proven Mac fabrication tool:** Stages 11–12.
- **Optional CNC-native version:** Stage 13.
