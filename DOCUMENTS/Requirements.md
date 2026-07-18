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

## Layer Geometry

- Generate filled polygons suitable for cutting, not contour lines alone.
- Preserve islands, lakes, holes, and disconnected pieces.
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
- Preserve finished dimensions in millimetres and separate profile, drilling,
  and engraving operations in every manufacturing file.
- When a part is too small for safe engraving, place its ID in nearby waste
  material with a leader that stops outside the part's cut edge. Recalculate
  these waste labels after sheet nesting.
- Warn about pieces smaller than the selected cutter or practical material
  limit.

## Parts and Assembly

- Assign every disconnected component a stable bottom-up identifier such as
  L01A or L03B.
- Provide a layer-by-layer assembly sheet even when a piece is too small for
  machined text.
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

## Preview and Analysis

- Show a conventional map while choosing an area.
- Show terrain hillshade and optional 3D relief.
- Display minimum and maximum elevation and their locations.
- Colour subsea bands with blue shades.
- Colour land bands with green, grey, and white palettes.
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
