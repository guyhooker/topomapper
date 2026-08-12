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

## SVGnest acceptance fixtures

The `nesting` folder contains small, human-checkable SVGnest jobs using a
1200 x 600 mm stock sheet:

- `18-squares-190mm.svg`: all 18 squares fit on one sheet (six by three).
- `18-squares-210mm.svg`: the 18 squares have more total area than one sheet,
  so two sheets are required.
- `18-l-shapes-rotation.svg`: identical 260 x 190 mm L-parts can pair by 180°
  rotation and fit on one sheet. This checks that rotation and true polygon
  nesting are active rather than rectangular bounding-box packing.

In SVGnest, upload a fixture, click inside the pale-green rectangle to select
the stock bin, set spacing to `0`, and press **Start Nest**. For the L-parts,
use at least four rotations. These are nesting diagnostics only and must not be
used as cutting files or imported into a Topomapper landscape project.
