import unittest

import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds

from analyse import Bounds, _cumulative_layer_mask, _merge_land_and_bathymetry, _source_bounds


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


class ShorelineMergeTests(unittest.TestCase):
    def test_positive_coarse_bathymetry_is_capped_at_sea_level_outside_land(self):
        land = np.array([[12.0, np.nan]], dtype="float32")
        land_valid = np.array([[True, False]])
        bathymetry = np.array([[8.0, 3.5]], dtype="float32")
        bathymetry_valid = np.array([[True, True]])

        mosaic, valid, marine = _merge_land_and_bathymetry(land, land_valid, bathymetry, bathymetry_valid)

        self.assertEqual(float(mosaic[0, 0]), 12.0)
        self.assertEqual(float(mosaic[0, 1]), 0.0)
        self.assertTrue(valid.all())
        self.assertTrue(marine[0, 1])

    def test_water_holes_apply_to_land_but_keep_subsea_support(self):
        valid = np.array([[True, True]])
        mosaic = np.array([[15.0, 0.0]], dtype="float32")
        water = np.array([[False, True]])

        self.assertTrue(_cumulative_layer_mask(valid, mosaic, -10, water).all())
        self.assertEqual(_cumulative_layer_mask(valid, mosaic, 0, water).tolist(), [[True, False]])


if __name__ == "__main__":
    unittest.main()
