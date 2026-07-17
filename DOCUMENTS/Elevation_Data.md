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

For Stage 3, manually download or crop one `.tif` or `.tiff` file that overlaps
the selected Mount Taranaki rectangle. Topomapper will clearly report partial
coverage if the file contains only part of the selection.

## What Topomapper reads

- The first raster band as elevation.
- The GeoTIFF coordinate reference system.
- Horizontal cell size.
- The GeoTIFF NODATA marker and mask.
- `VERTICAL_DATUM` or `VERT_DATUM` metadata when present.

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
project. Automatic provenance capture belongs to a later stage; Stage 3 exposes
the metadata required to detect obvious source or datum problems.
