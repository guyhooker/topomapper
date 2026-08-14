import unittest

from rasterio.io import MemoryFile
from rasterio.transform import from_bounds

from analyse import Bounds, _source_bounds


class SourceBoundsTests(unittest.TestCase):
    def test_nz_bathymetry_bounds_remain_continuous_across_date_line(self):
        raster_bounds = (4795705.6, -5915585.8, 7824705.6, -2067835.8)
        with MemoryFile() as memory:
            with memory.open(
                driver="GTiff",
                width=10,
                height=10,
                count=1,
                dtype="float32",
                crs="EPSG:3994",
                transform=from_bounds(*raster_bounds, 10, 10),
            ) as dataset:
                bounds = _source_bounds(dataset)

        self.assertGreater(bounds.east, 180)
        self.assertTrue(Bounds(173.8, -41.3, 174.4, -41.0).overlaps(bounds))


if __name__ == "__main__":
    unittest.main()
