# topomapper

`topomapper` is a Mac application for turning real-world terrain and seabed
elevation data into layered shapes suitable for CNC-cut wall maps.

The user selects an area on an interactive map, analyses its elevation range,
chooses custom land and subsea layer boundaries, previews the resulting stacked
model, and exports cut-ready geometry. Direct CNC G-code is a later goal after
the geometry workflow is proven.

Project decisions and progress are recorded in
[`DOCUMENTS/Development_Notes.md`](DOCUMENTS/Development_Notes.md).

Detailed requirements and the proposed technical foundation are in
[`DOCUMENTS/Requirements.md`](DOCUMENTS/Requirements.md) and
[`DOCUMENTS/Architecture.md`](DOCUMENTS/Architecture.md).

Development is divided into visible, testable increments in
[`DOCUMENTS/Roadmap.md`](DOCUMENTS/Roadmap.md).

## Local development

The application uses TypeScript, React, MapLibre GL JS, and Vite. Project
dependencies are pinned in `package.json` and `pnpm-lock.yaml`.

Install Node.js 24 LTS, then open this repository in Terminal and run:

For the existing Mac checkout, run `npm run dev`. The first Stage 3 start also
creates a private Python environment and installs Rasterio; this can take a few
minutes and requires an internet connection. Later starts reuse it. For a clean
checkout, enable Corepack and run `pnpm install` once before `pnpm run dev`.

Open `http://localhost:3000` and leave Terminal running while using the app.

## Current prototype

Stage 3 imports one or more local elevation GeoTIFF tiles, clips and mosaics
them to the editable model-area selection, reports the lowest and highest
elevations and their source tiles, and overlays a coloured terrain preview.
Missing data is reported separately from real zero elevation. See
[`DOCUMENTS/Elevation_Data.md`](DOCUMENTS/Elevation_Data.md) for suitable LINZ
sources and the included synthetic test fixture.

Stage 4 adds an editable land-elevation plan. Sea level and the analysed
maximum remain fixed; Log or Linear spacing can be combined
with an adjustable 2–40 layer count. Intermediate boundaries can also be added,
edited, removed, or reordered. Invalid duplicates and out-of-order boundaries
are shown before later geometry generation.

Stage 5 turns those boundaries into cumulative filled land polygons and draws a
colour-coded 2D stack over the map. Individual layers can be hidden or shown,
and the preview reports disconnected pieces and preserved holes.

Stage 6 adds an early finished-format choice with aspect-locked ground cropping,
then displays the geometry as an equal-thickness physical stack. The preview can
take over the workspace using the 2D Map / 3D Model switch, can be freely rotated
and tilted or viewed directly from the side or top, and compares physical height
with a true-elevation reference before SVG fabrication work begins in Stage 7.
Compass labels and a North up reset keep its orientation aligned with the map.

Stage 7 adds a full-screen Assembly workspace. It names every disconnected part
from the bottom upward, previews covered part-ID/north-arrow engraving, and
places configurable dowel holes only beneath a solid local terrain cap. For
each separate summit branch it searches downward for the highest safe cap, then
runs a peak-alignment "vent" through every supporting layer to the base. A
supplemental buried grid and north marks make orientation unambiguous. SVG
fabrication export follows in Stage 8.

Stage 8 adds a full-screen Manufacture workspace and exports finished-size SVG
geometry. Each physical layer separates red profile cuts, blue drill holes, and
green covered engraving into named operation groups. Parts too small to engrave
receive a nearby grey ID and leader in waste material. A single download package
contains every layer, a scale-preserving assembly overview, and manufacturing
notes. Cutter cleanup, sheet nesting, and direct G-code follow as explicit
stages rather than depending on subscription CAM software.

Stage 9 keeps the future fabrication workflow visible in the header and adds an
interactive per-layer Smoothing workspace. A physical cleanup size rounds raster
steps, removes smaller islands and holes, and reports before/after part and hole
statistics. Frame-contact edges remain locked straight, and cleaned geometry
feeds the 3D, Assembly, Manufacture, and SVG outputs.

Stage 10 adds PCB-style manual sheet layout. It provides configurable stock,
edge-zone and part-spacing rules; drag and 15-degree rotation; multiple sheets;
live non-blocking DRC warnings; a reusable parts library; replacement copies;
and an editable first-fit Auto layout. DRC uses actual transformed coastline
paths for part-to-part clearance.
Visible clearance halos turn red on collision, tiny parts retain a practical
screen hit target, and 1×–8× zoom, empty-sheet panning, library selection, and
Focus selected make small replacement pieces manageable.
Manual rotation is available in 15° steps, Auto layout fills from left to right,
and selecting either a part or a DRC warning highlights its linked counterpart.
Precise coastline DRC pauses while a part is being dragged and recalculates on
release, keeping pointer movement responsive without weakening the final check.
Save layout retains the current plan in this browser; Backup file and Restore
file provide a portable JSON copy for resuming later.
