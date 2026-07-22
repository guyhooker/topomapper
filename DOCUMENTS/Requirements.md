# topomapper Requirements

## Purpose

Create physical, layered relief maps from real locations on Earth. Each layer
will be cut from plywood or a similar sheet material on a CNC machine, painted,
and bonded into a wall hanging. A glass sheet may represent sea level.

Initial geographic scope is New Zealand. Example areas include Banks Peninsula
and Mount Taranaki. International support, such as central Paris, may follow.

## Core User Flow

1. Open an interactive map on a MacBook.
2. Search for or navigate to a location.
3. Select a rectangular or polygonal area.
4. Inspect the selected area's dimensions, highest elevation, lowest elevation,
   and data resolution.
5. Define independent, non-linear layer boundaries above and below sea level.
6. Preview the terrain, contour boundaries, and physical layer stack.
7. Set finished-map size, material thickness, and optional vertical
   exaggeration.
8. Review named parts, hidden alignment holes, and assembly orientation.
9. Export one labelled, cut-ready shape per physical layer.
10. Arrange physical parts onto standard material sheets manually or by
    automatic nesting.
11. Produce machine-specific CNC G-code without requiring external CAM
    software.

## Elevation Layers

Layer boundaries must be explicitly editable rather than restricted to a fixed
interval. An example set might be:

- Below sea level: minimum, -80 m, -20 m, 0 m.
- Above sea level: 0 m, 10 m, 20 m, 50 m, 100 m, 250 m, 500 m, maximum.

Land and seabed require separate controls because useful physical and visual
scales differ substantially. Sea level must always be available as a special
boundary.

## Project Management

- Treat each landscape as a named project rather than a collection of unrelated
  saved settings.
- Persist the output size and orientation, selected geographic rectangle,
  elevation metadata and processed geometry, log/linear layer plan and count,
  editable boundaries, material thickness, 3D settings, smoothing, assembly
  settings, sheet rules, sheet count, and every part transform.
- Autosave the active project after a short idle delay and save immediately when
  switching, closing, or explicitly choosing Save.
- Allow multiple projects to coexist locally and provide New, Open, Save, Close,
  project rename, portable export, and import.
- Give a new project a unique editable default name immediately.
- Keep original GeoTIFFs external because embedding them can make project files
  impractically large; retain their filenames and processed geometry so they are
  only required again when terrain is regenerated.

## Layer Geometry

- Generate filled polygons suitable for cutting, not contour lines alone.
- Preserve islands, holes, and disconnected pieces. Represent every retained
  lake, lagoon, or significant river polygon as a true hole in each physical
  layer through which that water feature passes.
- Apply the normal manufacturing smoothing and minimum-feature rules to water
  holes as well as terrain peaks and islands, so impractically tiny lakes may
  disappear without damaging significant water features.
- Make retained water holes suitable for separate blue-painted wood inserts;
  preserve any land islands enclosed by the water feature.
- Support cumulative/nested physical layers so the assembled model represents
  terrain correctly.
- Allow optional simplification appropriate to CNC tool diameter and finished
  map scale.
- Adjust cleanup independently per physical layer with immediate before/after
  counts for parts, holes, smallest part area, and smallest hole area.
- Preserve any edge coincident with the rectangular finished frame as a dead
  straight line while smoothing terrain-derived edges.
- Allow registration holes or alignment marks.
- Label every exported layer with its elevation range, sequence, and side.
- Preserve finished dimensions in millimetres and separate profile and drilling
  operations in every current manufacturing file. Keep engraving as a later,
  optional tool-change workflow.
- Warn about pieces smaller than the selected cutter or practical material
  limit.
- Before G-code export, compare every retained water channel and internal cut
  with the selected cutter diameter. Never silently emit an impossible offset
  toolpath: identify the affected river/part and offer to omit the feature,
  widen it deliberately, engrave a centreline where appropriate, or require a
  smaller cutter.

## Parts and Assembly

- Assign every disconnected component a stable bottom-up identifier such as
  L01A or L03B.
- Provide a layer-by-layer assembly sheet even when a piece is too small for
  machined text.
- Offer optional sacrificial label tails for small detached parts. Tails are
  added to exact part geometry before SVGnest export, extend toward geographic
  east, rotate with the part during nesting, and provide enough area for the
  stable part ID and north mark. Allow automatic selection below a configurable
  practical-size threshold plus manual per-part overrides.
- Size the tail neck and label pad from the selected cutter and material rules,
  include the complete tail in nesting and DRC, and mark where it should be
  snapped or trimmed after identification. The assembly outline and finished
  terrain geometry must exclude the sacrificial tail.
- Allow covered engraving of a part identifier and north arrow without marking
  the finished terrain surface.
- Generate alignment-dowel holes only through layers that have a solid local
  cap above them.
- Work downward from every separate summit branch until a safe hole position is
  covered, then carry that alignment vent through all supporting layers to the
  base.
- Use the naturally distributed peak vents, supplemental buried grid holes,
  and north marks so a layer cannot be fitted north/south, east/west, or
  face-reversed by mistake.
- Keep dowel diameter, machined-hole diameter, grid pitch, and edge clearance
  separately configurable for test-cut calibration.

## Sheet Layout and G-code

- Support a configurable stock sheet such as 1200 × 600 × 3 mm MDF, including
  usable margins and clamp exclusion areas.
- Provide manual placement before automatic polygon nesting is introduced.
- Permit rotation; permit mirroring only when the required physical flip and
  engraving face are explicitly recorded.
- Respect cutter diameter, part spacing, cut order, tabs, safe height, depth
  passes, feed rate, spindle control, and the chosen work origin.
- Preview and validate every toolpath before G-code can be downloaded.
- Require a named CNC/controller profile and a scrap-material test before
  treating generated G-code as production-ready.
- Treat sheet-layout rules like PCB design rules: violations remain visible and
  auditable but do not prevent intentional manual placement.
- Keep the parts library reusable so selected lost or broken parts can be
  duplicated onto a separate replacement sheet without rebuilding the full
  model layout.
- Keep Auto layout editable and preserve manual layout as a permanent workflow.
- Draw the active part-spacing rule as a visible halo around every placed part;
  pair colour and DRC text so collisions are not communicated by colour alone.
- Define part spacing as the final edge-to-edge distance between exact cut
  outlines. Draw half that distance outside each neighbouring outline so halos
  touch at the requested clearance and overlap only when the spacing rule is
  violated. Accept decimal values such as 3.5 mm for a 3 mm cutter.
- Keep tiny physical parts selectable with a minimum screen-space hit target,
  zoom/pan, library-based selection, and focus-on-selection.
- Measure part-spacing rules between the true rotated outlines and draw the
  corresponding coastline-shaped half-clearance halo around each part.
- Permit selectable 1-, 2-, 5-, 10-, or 15-degree rotation increments, retain
  direct 1-degree nudges, and cross-highlight a selected
  part with every DRC warning that references it.
- Prefer left-to-right rows for quick Auto layout, while allowing the later
  optimiser to keep searching and retain every improved result until stopped.
- Keep dragging responsive by deferring exact coastline DRC until pointer
  release, then check the same transformed outline and rotation shown on screen.
- Save sheet positions, rotations, stock rules, smoothing, and relevant model
  settings locally, with a downloadable/importable backup for work resumed on
  another day. The same terrain inputs must be regenerated before a restored
  layout can display its referenced parts.
- Apply sheet-edge rules and pointer hit-testing to the true rotated outline so
  empty corners of a part's bounding rectangle neither cause false warnings nor
  prevent deselection and empty-sheet panning. Retain an enlarged hit target for
  genuinely tiny parts.
- Export each populated stock sheet as a finished-size SVG with separate named
  layers for profile cutting, through-drilling, and non-machining sheet
  references. Do not mix deferred engraving into this cutting file.
- Export a printable A4 PDF layout guide with a scaled overview of each stock
  sheet, readable full part IDs, assembly-north arrows, and a part index listing
  stock rotation and position. The arrow must continue to identify assembly
  north after arbitrary nesting rotation.
- Keep the optimiser interruptible, publish only valid best-so-far layouts, and
  rank fewer stock sheets ahead of a compact used envelope. Every automatic result
  remains manually editable.
- Provide a standards-based SVG handoff to SVGnest with a selectable stock bin,
  non-overlapping bounded-complexity proxy parts, conservative proxy-aware
  spacing, and practical rotation-count guidance. Keep exact internal cutouts
  in the original named project and restore them after importing and validating
  the external nest.
- Compensate the SVGnest stock bin for SVGnest's half-spacing inward offset so
  the imported exact outlines retain the requested physical stock-edge zone;
  do not subtract the full part-spacing value from the edge-zone setting.
- Import a downloaded SVGnest result into the current named project. Recover
  every retained instance ID, part ID, sheet, translation and rotation; reject
  foreign, missing, duplicated, scaled or mirrored geometry; restore exact
  coastlines, water cutouts and drilling; and rerun full-resolution DRC before
  enabling manufacturing exports.
- After an SVGnest result has been imported and validated, support an optional
  registered two-sided workflow for each populated stock sheet. Side 1 engraves
  part IDs and assembly-north marks; Side 2 contains the mirrored exact profile,
  water-cutout, and drilling operations after the sheet is relocated accurately.
- Make the physical flip unambiguous with a diagram and an explicit coordinate
  transform. The initial convention is an end-to-end flip with accurately sized
  stock relocated against fixed machine edge stops. Keep this distinct from a
  long-axis flip, which would exchange the top and bottom edges.
- Allow Side 1 machining to be omitted. Its SVG must remain usable as a visual
  identification and orientation map for manually writing IDs on the underside
  of the parts. Keep the printable PDF guide as a convenient optional output,
  not a prerequisite for manufacture.
- Generate separate, plainly named outputs for Side 1 registration/annotation
  and Side 2 cutting. Never combine the two faces into one ambiguous machining
  layer or silently mirror a cutting file.
- Treat machining-ready SVG preparation as a separate stage before direct
  G-code. Side 1 contains shallow annotations. Side 2 separates drilling and
  internal openings, the complete outer profiles down to material thickness
  minus bridge thickness, and the final full-depth release segments with every
  bridge interval omitted.
- Store operation intent and target depth as named SVG layers and metadata, and
  offer split operation files for external CAM software. The same geometry and
  operation order must feed the later direct G-code generator.
- Make bridge width, remaining thickness and count configurable. Place bridges
  away from sharp corners, holes, narrow terrain, sacrificial label-tail necks
  and other weak features; display them at physical size and allow manual edits.
- Keep drilling and every internal opening ahead of external release cuts so a
  part cannot move before its interior machining is complete.
- Retain alignment-pin holes as an optional later registration method. Only when
  enabled should their visible no-part keep-outs participate in nesting and DRC;
  the initial edge-stop workflow must not reserve otherwise usable stock.

## Preview and Analysis

- Show a conventional map while choosing an area.
- Show terrain hillshade and optional 3D relief.
- Display minimum and maximum elevation and their locations.
- Colour subsea bands with blue shades.
- Colour land bands with green, grey, and white palettes.
- Assign every physical layer to a named purchasable paint, showing a display
  swatch, manufacturer code, colour name, and elevation range.
- Support an optional white top snow layer and retain alternative local-shop
  paint names in the project.
- Print an A4 paint-buying and layer-assignment chart while warning that monitor
  colours are not substitutes for a physical sample.
- Preview layer order and approximate finished thickness.
- Distinguish missing data from real zero elevation.

## Export

Initial exports should be SVG and DXF because they remain editable and can be
loaded into established CAM software. Direct G-code is deferred until cutter
diameter, toolpaths, feeds, speeds, origin, tabs, safe height, and the target CNC
controller/postprocessor are specified.

## Quality and Safety

- Record the source, date, resolution, horizontal coordinate system, vertical
  datum, and licence for every elevation dataset.
- Never silently combine incompatible land-height and bathymetric datums.
- Clearly mark interpolated or low-resolution seabed areas.
- Treat bathymetry as model-making data, not navigation data.
- Preserve a reproducible project file containing selection, datasets, layer
  boundaries, scale, and export settings.

## Initial Out of Scope

- Worldwide data coverage.
- Live navigation or marine navigation.
- Buildings and vegetation from surface models.
- Fully automatic toolpath and G-code generation.
- Automatic elevation-tile discovery or downloading. A project may manually
  select up to 24 adjoining GeoTIFF files.
- Cloud accounts or multi-user collaboration.
