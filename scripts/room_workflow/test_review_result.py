"""Synthetic CPU math/rejection tests; not model-quality evidence."""
import unittest

import numpy as np

from review_result import camera_rays, crop_bounds, make_scene, render, require_executed, surface_samples


class ReviewTests(unittest.TestCase):
    def test_failed_not_run_partial_and_metric_results_rejected(self):
        good = {"status": "complete", "model_execution": "executed", "units": "relative",
                "arms": {"A": {"status": "complete"}}}
        require_executed(good)
        for key, value in (("status", "failed"), ("status", "partial"),
                           ("model_execution", "not-run"), ("units", "meters")):
            with self.assertRaises(ValueError):
                require_executed({**good, key: value})

    def test_integer_centers_and_rotated_camera(self):
        camera = {"intrinsics": [[2, 0, 1], [0, 2, 1], [0, 0, 1]],
                  "world_to_camera": [[0, -1, 0, 2], [1, 0, 0, -3], [0, 0, 1, -4]]}
        rays = camera_rays(camera, (3, 3))
        np.testing.assert_allclose(rays[1, 1], [3, 2, 4, 0, 0, 1])
        np.testing.assert_allclose(rays[0, 0, 3:], [-.5, .5, 1])

    def test_raycast_plane_z_depth_and_barycentric_color(self):
        vertices = np.array([[-4, -4, 2], [4, -4, 2], [0, 4, 2]], dtype=float)
        faces = np.array([[0, 1, 2]])
        colors = np.tile([.2, .4, .6], (3, 1))
        camera = {"intrinsics": [[2, 0, 1], [0, 2, 1], [0, 0, 1]],
                  "world_to_camera": np.column_stack([np.eye(3), np.zeros(3)]).tolist()}
        rgb, depth = render(make_scene(vertices, faces), vertices, colors, faces, camera, (3, 3))
        np.testing.assert_allclose(depth, 2)
        np.testing.assert_array_equal(rgb[1, 1], [51, 102, 153])

    def test_padding_crop_and_out_of_bounds_rejection(self):
        transform = {"model_size": [518, 518], "resized_size": [518, 392],
                     "padding_left_top": [0, 63], "pixel_center_convention": "integer"}
        self.assertEqual(crop_bounds(transform), (0, 63, 518, 455))
        with self.assertRaises(ValueError):
            crop_bounds({**transform, "padding_left_top": [0, 200]})

    def test_surface_sampling_stays_on_triangle_and_is_deterministic(self):
        vertices = np.array([[0, 0, 2], [1, 0, 2], [0, 1, 2]])
        colors = np.eye(3)
        faces = np.array([[0, 1, 2]])
        points, rgb = surface_samples(vertices, colors, faces, 1000)
        np.testing.assert_allclose(points[:, 2], 2)
        self.assertTrue((points[:, :2] >= 0).all())
        self.assertTrue((points[:, :2].sum(1) <= 1).all())
        np.testing.assert_allclose(rgb.sum(1), 1)
        np.testing.assert_array_equal(points, surface_samples(vertices, colors, faces, 1000)[0])


if __name__ == "__main__":
    unittest.main()
