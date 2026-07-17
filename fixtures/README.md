# Stage 3 elevation fixture

`processing/create_test_fixture.py` generates
`taranaki-stage3-synthetic.tif` here after the local Python tools are installed.

The raster resembles a broad Mount Taranaki-shaped peak, includes an explicit
NODATA patch, uses NZTM2000 coordinates, and labels its vertical datum as
synthetic. It is intended only to exercise Topomapper's import, clipping,
minimum/maximum, missing-data, and preview pipeline. It is not LINZ data and
must never be treated as an elevation source for fabrication.

The generated binary is ignored by Git because it is reproducible from the
script. A real LINZ GeoTIFF is still required for the Stage 3 acceptance test.
