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

## Next Steps

1. Choose the first proof-of-concept location and physical map dimensions.
2. Obtain a small elevation raster covering that location.
3. Prototype arbitrary elevation bands and filled SVG layer export.
4. Validate the generated layer geometry visually in QGIS and against a simple
   physical test cut.
