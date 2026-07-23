# Stage 3 Elevation Data Guide

## Recommended source

Use a bare-earth Digital Elevation Model (DEM), not a rendered topographic map
and not a Digital Surface Model (DSM). A DEM represents the ground; a DSM also
contains trees, buildings, and other surface objects that are unsuitable for
the intended layered terrain model.

LINZ provides its national 1 metre DEM through the LINZ Data Service and as
Cloud Optimised GeoTIFFs in the New Zealand Elevation open-data collection:

- [LINZ elevation access guidance](https://www.linz.govt.nz/products-services/data/types-linz-data/elevation-data/access-elevation-data)
- [New Zealand Elevation on the AWS Registry of Open Data](https://registry.opendata.aws/nz-elevation/)
- [LINZ Data Service](https://data.linz.govt.nz/)
- [NZ 8m Digital Elevation Model (2012)](https://data.linz.govt.nz/layer/51768-nz-8m-digital-elevation-model-2012/)

Topomapper's recommended Stage 3 path automatically requests a cropped export
from the NZ 8m Digital Elevation Model for the selected rectangle. The user
creates a free LINZ data-access API key once; Topomapper stores it in the Mac
application-support folder with owner-only permissions, never in a project or
Git repository. Downloads are cached under `~/Library/Caches/Topomapper/linz`.

Manual `.tif` or `.tiff` selection remains available. The chooser accepts
several files at once: use Command-click in the macOS chooser to select
adjoining tiles such as BJ29 and BH29. Topomapper mosaics them and clearly
reports any part of the selection that remains uncovered.

## Lakes and significant rivers

Elevation files do not reliably identify water boundaries. Before generating
filled layers, optionally download cropped polygon data for the same selected
area from:

- [NZ Lake Polygons (Topo, 1:50k)](https://data.linz.govt.nz/layer/50293-nz-lake-polygons-topo-150k/)
- [NZ River Polygons (Topo, 1:50k)](https://data.linz.govt.nz/layer/50328-nz-river-polygons-topo-150k/)
- [NZ Lagoon Polygons (Topo, 1:50k)](https://data.linz.govt.nz/layer/50292-nz-lagoon-polygons-topo-150k/)

The automatic download uses LINZ WFS bounding-box queries to request only the
lake, lagoon and river polygons intersecting the current selection. Empty
datasets are omitted. Manual WGS84 GeoJSON or KML import remains available.
Topomapper accepts several files together and subtracts every imported polygon
from all affected physical layers. This produces cut-through lake and river
holes for later blue-painted inserts. Do not choose the river centrelines
dataset: a line has no width and cannot define a cuttable insert.

Smoothing treats imported water holes like other fine geometry. Small water
features may disappear as smoothing increases; substantial lakes and broad
rivers such as the Rakaia remain when their physical model width is practical.

## What Topomapper reads

- The first raster band of each selected file as elevation.
- The GeoTIFF coordinate reference system.
- Horizontal cell size.
- The GeoTIFF NODATA marker and mask.
- `VERTICAL_DATUM` or `VERT_DATUM` metadata when present.

Topomapper scans each tile at its original resolution to find extrema, then
reprojects a reduced preview from every overlapping tile onto one WGS84 display
grid. Transparent gaps are missing coverage, not zero elevation.

An absent vertical datum is reported as unknown. It is never silently assumed,
because later land and bathymetry datasets may use different height references.

## Synthetic regression fixture

The first Stage 3 start generates `fixtures/taranaki-stage3-synthetic.tif`.
This small raster proves the complete import and analysis path and deliberately
contains a NODATA patch. Its metadata identifies it as synthetic, and it must
not be used for fabrication or treated as LINZ survey data.

## Licensing and provenance

Keep the LINZ dataset title, download date, source link, resolution, horizontal
CRS, vertical datum, licensor, and licence with every eventual Topomapper
project. The automatic cache records the 8 m dataset, source, download time,
selection and CC BY 4.0 licence. The processed project continues to retain the
source filenames and GeoTIFF metadata required to detect obvious datum problems.
