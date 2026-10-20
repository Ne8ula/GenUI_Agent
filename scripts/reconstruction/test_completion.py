import unittest
import numpy as np
from source_completion import project_samples, locked_composite
from planar_completion import plane_depth, image_gate, plane_cells, dense_filter
from unittest.mock import patch


class CompletionTests(unittest.TestCase):
    def test_projection_nearest_surface_and_pixel_centers(self):
        p = np.array([[1, 1, 2], [.5, .5, 1], [1.5, .5, 1], [0, 0, -1]])
        pixels, z, error, ids = project_samples(p, np.eye(3), np.eye(4), (2, 2))
        np.testing.assert_array_equal(pixels, [0, 1])
        np.testing.assert_array_equal(ids, [1, 2])
        np.testing.assert_array_equal(z, [1, 1])
        np.testing.assert_array_equal(error, [0, 0])

    def test_locked_composite_does_not_hide_raw_drift(self):
        a = np.zeros((4, 4, 3), np.uint8)
        b = np.full_like(a, 200)
        mask = np.zeros((4, 4), bool)
        mask[0, 0] = True
        out = locked_composite(a, b, mask)
        self.assertFalse(image_gate(a, b, mask)["accepted"])
        np.testing.assert_array_equal(out[~mask], a[~mask])
        np.testing.assert_array_equal(out[mask], b[mask])

    def test_registered_edit_passes(self):
        a = np.zeros((4, 4, 3), np.uint8)
        b = a.copy()
        b[0, 0] = 255
        mask = np.zeros((4, 4), bool)
        mask[0, 0] = True
        self.assertTrue(image_gate(a, b, mask)["accepted"])
        with self.assertRaises(ValueError):
            locked_composite(a, b, mask.astype(np.uint8))

    def test_plane_metric_depth_and_parallel_rejection(self):
        pose = np.eye(4)
        pose[:3, :3] = np.diag([1, -1, -1])
        pose[2, 3] = 2
        np.testing.assert_array_equal(plane_depth(np.eye(3), pose, 0, (2, 2)), np.full((2, 2), 2.))
        self.assertTrue(np.isnan(plane_depth(np.eye(3), np.eye(4), -1, (2, 2))).all())

    def test_pixel_cells_stay_in_plane_and_requested_footprint(self):
        pose = np.eye(4)
        pose[:3, :3] = np.diag([1, -1, -1])
        pose[2, 3] = 2
        mask = np.array([[True, False], [False, False]])
        points, faces, pixels = plane_cells(mask, np.eye(3), pose, 0)
        np.testing.assert_allclose(points[:, 2], 0)
        np.testing.assert_array_equal(pixels, [0, 0, 0, 0])
        self.assertEqual(faces.shape, (2, 3))
        cv = points @ pose[:3, :3] + (-pose[:3, :3].T @ pose[:3, 3])
        self.assertTrue(((cv[:, :2]/cv[:, 2:] >= 0) & (cv[:, :2]/cv[:, 2:] <= 1)).all())

    def test_dense_filter_rejects_free_space_but_retains_occluded(self):
        from pathlib import Path
        points = np.array([[.5, .5, 1], [.6, .5, 1], [.5, .6, 1],
                           [.5, .5, 3], [.6, .5, 3], [.5, .6, 3]])
        unit = np.zeros((768, 1024, 3))
        unit[..., 2] = -1
        with patch("planar_completion.h.read_h5", return_value=np.full((768, 1024), 2.)):
            faces, report = dense_filter(points, np.array([[0, 1, 2], [3, 4, 5]]),
                                         Path("."), [0], {0: np.eye(4)}, np.eye(3), unit)
        np.testing.assert_array_equal(faces, [[3, 4, 5]])
        self.assertEqual(report["rejected_triangles"], 1)

    def test_rejected_edit_never_writes_composite(self):
        import tempfile
        from pathlib import Path
        from PIL import Image
        from validate_image_edit import validate
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            a = np.zeros((4, 4, 3), np.uint8)
            mask = np.zeros((4, 4), np.uint8)
            mask[0, 0] = 255
            for name, image in (("original", a), ("raw", a+200), ("mask", mask)):
                Image.fromarray(image).save(root / (name+".png"))
            self.assertFalse(validate(root / "original.png", root / "raw.png", root / "mask.png", root / "rejected"))
            self.assertFalse((root / "rejected/candidate-rgb.png").exists())
            Image.fromarray(a).save(root / "raw.png")
            self.assertTrue(validate(root / "original.png", root / "raw.png", root / "mask.png", root / "passed"))
            self.assertTrue((root / "passed/candidate-rgb.png").exists())


if __name__ == "__main__":
    unittest.main()
