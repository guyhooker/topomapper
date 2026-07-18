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
8. Export one labelled, cut-ready shape per physical layer.
9. Eventually produce machine-specific CNC G-code.

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
- Allow registration holes or alignment marks.
- Label every exported layer with its elevation range, sequence, and side.
- Warn about pieces smaller than the selected cutter or practical material
  limit.

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
