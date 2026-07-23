"""Regression checks for the LINZ automatic-download boundary."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from linz_download import (
    LinzDownloadError,
    _extract_geotiffs,
    build_elevation_export,
    has_api_key,
    load_api_key,
    save_api_key,
    validate_bounds,
)


BOUNDS = {
    "west": 174.0,
    "south": -39.5,
    "east": 174.2,
    "north": -39.2,
}


class LinzDownloadTests(unittest.TestCase):
    def test_export_uses_8m_grid_and_wgs84_crop(self) -> None:
        payload = build_elevation_export(BOUNDS)
        self.assertEqual(payload["crs"], "EPSG:2193")
        self.assertEqual(payload["formats"], {"grid": "image/tiff;subtype=geotiff"})
        self.assertTrue(payload["items"][0]["item"].endswith("/layers/51768/"))
        ring = payload["extent"]["coordinates"][0]
        self.assertEqual(ring[0], [174.0, -39.5])
        self.assertEqual(ring[-1], ring[0])

    def test_invalid_bounds_are_rejected_before_network_access(self) -> None:
        with self.assertRaises(LinzDownloadError):
            validate_bounds({**BOUNDS, "east": 173.0})
        with self.assertRaises(LinzDownloadError):
            validate_bounds({"west": 174})

    def test_key_is_stored_outside_projects_with_private_permissions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"TOPOMAPPER_CONFIG_DIR": directory}):
                self.assertFalse(has_api_key())
                save_api_key("a" * 32)
                self.assertEqual(load_api_key(), "a" * 32)
                mode = (Path(directory) / "linz-api-key").stat().st_mode & 0o777
                self.assertEqual(mode, 0o600)

    def test_geotiff_archive_ignores_non_raster_and_nested_paths(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "download.zip"
            output = root / "output"
            output.mkdir()
            with zipfile.ZipFile(archive, "w") as target:
                target.writestr("../../notes.txt", "not extracted")
                target.writestr("nested/BJ29.tif", b"II*\x00fixture")
            extracted = _extract_geotiffs(archive, output)
            self.assertEqual([path.name for path in extracted], ["BJ29.tif"])
            self.assertFalse((root / "notes.txt").exists())

    def test_manifest_shape_is_json_serialisable(self) -> None:
        payload = build_elevation_export(BOUNDS)
        self.assertIn('"grid"', json.dumps(payload))


if __name__ == "__main__":
    unittest.main()
