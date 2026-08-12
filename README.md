# topomapper

`topomapper` is a Mac application for turning real-world terrain and seabed
elevation data into layered shapes suitable for CNC-cut wall maps.

The user selects an area on an interactive map, analyses its elevation range,
chooses a calculated land-layer plan (with future separate subsea controls), previews the resulting stacked
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

The numbered inputs are arranged from source choices to fabrication outputs in
the left-hand Setup drawer. Move to its Setup handle or anywhere along the left
screen edge to open it; after the pointer leaves, the drawer waits 10 seconds
and then retreats gently.
Technical terrain-file controls are kept under Advanced so the normal workflow
shows preparation progress rather than GeoTIFF implementation detail.

Topomapper now works with named projects. Each project autosaves after roughly
1.5 seconds of inactivity and includes its area, physical output size, layer
plan, processed geometry, 3D view, smoothing, assembly settings, sheets, and
part placements. New/Open/Save/Close switch between projects stored on this Mac.
Project file downloads use the dedicated `.topomapper` extension and can be
imported later or moved to another Mac. Original GeoTIFF source files remain
external and are needed only when terrain layers must be regenerated.

## Current prototype

Stage 3 imports one or more local elevation GeoTIFF tiles, clips and mosaics
them to the editable model-area selection, reports the lowest and highest
elevations and their source tiles, and overlays a coloured terrain preview.
Missing data is reported separately from real zero elevation. See
[`DOCUMENTS/Elevation_Data.md`](DOCUMENTS/Elevation_Data.md) for suitable LINZ
sources and the included synthetic test fixture.

The recommended path downloads a cropped copy of the national LINZ 8 m DEM for
the selected rectangle and retrieves matching lake, lagoon and river polygons
automatically. A free LINZ data-access API key is saved privately on the Mac and
downloaded sources are cached outside project files. The original manual
GeoTIFF and water-file controls remain available as a fallback.

Stage 4 calculates a land-elevation plan between sea level and the analysed
maximum. A Log Layering switch and a 5–30 layer entry determine the altitude
bands; sheet thickness, optional snow coverage, and 1–5 white snow levels are
set alongside them. The resulting levels, colours, and altitude bands are shown
as a read-only list before geometry generation.

Stage 5 turns those boundaries into cumulative filled land polygons and draws a
colour-coded 2D stack over the shaded terrain map. Its drawer section is one
generation action followed by total and per-layer part counts. Reopened
projects restore the required terrain files from the local LINZ cache when that
action is pressed. Smoothing statistics and sheet dimensions follow in Sections
6 and 7.

Optional cropped LINZ lake, lagoon, and river polygons can be loaded as WGS84
GeoJSON or KML before Stage 5 generation. Topomapper cuts those polygons through
the affected terrain layers, producing holes for separately made water inserts.

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
feeds the 3D, Assembly, Manufacture, and SVG outputs. The setup slider now moves
immediately, displays a recalculation indicator, and applies the expensive
geometry work after a short pause; the full Smoothing view retains independent
cleanup settings for every layer. The preceding setup stage is named Layer Build.

Stage 10 adds PCB-style manual sheet layout. New projects start with 1200 × 600
mm stock, thickness inherited from Layer Build, a 15 mm material border, 3 mm
part spacing and 15° rotation steps. It provides configurable stock,
edge-zone and part-spacing rules; drag and fine rotation; multiple sheets;
live non-blocking DRC warnings; a reusable parts library; replacement copies;
and an editable first-fit Quick Placement. DRC uses actual transformed coastline
paths for part-to-part clearance.
Visible clearance halos turn red on collision, tiny parts retain a practical
screen hit target, and 1×–8× zoom, empty-sheet panning, library selection, and
Focus selected make small replacement pieces manageable.
Manual rotation is available in selectable 1°, 2°, 5°, 10°, or 15° steps (with
direct 1° nudges), Auto layout fills from left to right,
and selecting either a part or a DRC warning highlights its linked counterpart.
Precise coastline DRC pauses while a part is being dragged and recalculates on
release, keeping pointer movement responsive without weakening the final check.
Save layout retains the current plan in this browser; Backup file and Restore
file provide a portable JSON copy for resuming later.
Rotated sheet-edge checks and pointer selection follow the actual part outline,
not the empty corners of its enclosing rectangle. A Deselect control also makes
it possible to return directly to empty-sheet panning.
Each populated stock sheet can now be exported at finished size as SVG, or all
sheets can be downloaded in one ZIP. The current cutting SVG deliberately
contains only profile cuts, through-drilling, and a non-machining stock
reference; machine engraving has been deferred until the cutter/tool-change
workflow is settled.

Stage 11 begins an interruptible polygon-aware nesting search. It keeps the
best valid layout found so far, favours fewer sheets before a compact envelope,
and leaves every result manually editable. A separate A4 landscape PDF guide
maps every sheet, labels all parts, preserves assembly-north arrows after
arbitrary stock rotation, and includes a part/rotation index for hand labelling.
For production-quality irregular nesting, Sheet Layout can now create a
ready-to-upload SVGnest proxy. To avoid SVGnest stalling during no-fit-polygon
preparation, the proxy contains the usable stock boundary and a bounded-point
outer outline for each production or replacement part. Exact coastlines, water
holes, and registration drilling remain untouched in the project. Topomapper
renders the selectable stock bin as a pale green filled rectangle so clicking
inside it cannot accidentally select the tall white staging page. It adds a
conservative spacing allowance for proxy error and recommends 12 initial
rotations rather than converting a 1° or 2° editing step into hundreds of
SVGnest rotations. The downloaded SVGnest result can now be imported back into
Sheet Layout: Topomapper recovers the named instances, sheets, positions and
rotations, restores exact geometry, and reruns the full-resolution DRC.
The interface names the current background search Optimise I and keeps disabled
Optimise II/III positions visible for a later embedded SVGnest and deeper search,
without implying that the external round trip has already been automated.
Changing a sheet rule stops an active optimiser and defers full coastline DRC
until entry has paused, so the controls respond immediately even on large models.
Optimise I uses tighter proxy clearance and repeated upper-left settling, with
exact coastline DRC still required before an improved layout is displayed.
Later attempts also probe cross-boundary cavities and favour placements inside
the existing used envelope before extending it, trading speed for denser sheets.
Best-result ranking primarily minimises total occupied sheet length, preventing
a longer final offcut from being accepted merely because it is shallower.
Sheet Layout defines Cut-edge gap as the final edge-to-edge distance between
neighbouring exact parts. Each on-screen halo extends half that value outside
its cut outline. The SVGnest proxy bin is moved outward to compensate for
SVGnest's own half-spacing inset, preserving the requested stock-edge zone.
Future CAM preparation will warn when a retained river or internal slot is too
narrow for the selected cutter. It will also offer optional east-facing,
sacrificial label tails for small detached parts; these will be added before
nesting and removed before final assembly.
Before direct G-code, a separate machining-SVG stage will create a shallow
annotation file for Side 1 and a mirrored Side 2 file with independent layers
for internal machining, profiles to the bridge floor, and full-depth release
segments between the retained bridges.
Its initial settings are stock thickness (1–12 mm), cutting speed, maximum depth
per pass, remaining bridge height and cut-through allowance (default 0.2 mm).
The generated pass schedule is shown and checked before machining files can be
exported; full-depth operations extend below the stock by the allowance while
the bridge floor remains unchanged.
After that round trip is reliable, the planned manufacturing handoff offers an
optional Side 1 SVG for part IDs and assembly-north marks, followed by a
mirrored Side 2 exact cutting SVG after an end-to-end flip. Initially, accurately
sized stock is relocated against fixed machine edge stops; alignment-pin holes
remain an optional later method. Side 1 may be used only as a visual
hand-labelling map, and the printable PDF remains an optional workshop guide.
