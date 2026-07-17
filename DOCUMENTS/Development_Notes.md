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
- Added `Roadmap.md`, dividing development into thirteen gated stages from the
  first interactive map through SVG/DXF fabrication and optional direct G-code.
- Chose Mount Taranaki for the land-only proof and Banks Peninsula for the later
  coastal/bathymetry proof.

### Stage 1 — Application Shell and Map

- Completed 17 July 2026.
- Added the local TypeScript/React application structure using Vite/vinext.
- Added a full-window MapLibre map centred on New Zealand.
- Uses the OpenFreeMap Positron map style with visible OpenStreetMap attribution.
- Added pan, zoom, metric scale, coordinates, zoom readout, and map-source
  status.
- Added submit-only New Zealand place search. Search results are cached locally
  and no autocomplete/background queries are issued.
- Added quick navigation to Mount Taranaki, Banks Peninsula, and Aoraki/Mount
  Cook.
- Added a responsive topomapper application shell and a visible indication that
  area selection belongs to Stage 2.
- Production build passes successfully.
- Stage 1 acceptance target is met: the application opens locally, presents a
  navigable New Zealand map, and can locate Mount Taranaki by name or quick
  location.
- Development uses Codex's bundled runtime; no system-wide Node installation is
  currently required.

### Stage 2 — Area Selection

- Implemented 17 July 2026; awaiting Guy's acceptance test.
- Added a rectangle drawing mode directly on the MapLibre map.
- Added four draggable corner handles so the selected area can be refined after
  drawing.
- Added live north, south, east, and west latitude/longitude bounds using five
  decimal places.
- Added ground width, ground height, and spherical surface-area calculations in
  metric units.
- Added Clear and Reset Taranaki controls.
- Added a fixed Mount Taranaki reference rectangle for repeatable testing.
- Added Save example and Open saved controls using storage on the local Mac.
- The current working selection is also restored automatically when Topomapper
  is reopened.
- Saved selections contain numerical bounds only; no account or cloud storage
  is involved.
- Updated the responsive interface from Stage 1 Explore to Stage 2 Select.
- Production build passes successfully.
- Stage 2 acceptance remains for Guy to confirm: draw and adjust an area around
  Mount Taranaki, save it, reopen Topomapper, and confirm the bounds are
  unchanged.

## Next Steps

1. Let Guy complete the Stage 2 acceptance test on the MacBook.
2. Record any area-selection or measurement usability observations.
3. Mark Stage 2 complete only after the saved bounds are recovered unchanged.
4. Do not begin Stage 3 elevation processing until Stage 2 is accepted.
