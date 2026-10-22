import unittest
import numpy as np

from material_completion import apply_plane_colors, infer_materials, support, weighted_median


class MaterialCompletionTests(unittest.TestCase):
    def test_weighted_median_rejects_many_tiny_outliers(self):
        result = weighted_median(np.array([[.7, .7, .6], [0., 0., 0.], [1., 0., 0.]]),
                                 np.array([10., .1, .1]))
        np.testing.assert_array_equal(result, [.7, .7, .6])

    def test_localized_furniture_patch_does_not_establish_wall_color(self):
        points = np.tile([[.2, .7], [.21, .71]], (30, 1))
        self.assertFalse(support(points, np.ones(60)*.002, np.zeros(2), np.ones(2), True)["passed"])

    def test_distributed_support_can_establish_wall_color(self):
        points = np.array([[x, y] for x in np.linspace(.1, .9, 10) for y in np.linspace(.56, .94, 5)])
        self.assertTrue(support(points, np.ones(50)*.002, np.zeros(2), np.ones(2), True)["passed"])

    def test_shared_vertex_is_duplicated_without_changing_photo_face(self):
        mesh = {"positions": [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
                "colors": [.2, .3, .4]*4, "indices": [0, 1, 2, 0, 1, 3],
                "provenance": ["photo-estimated", "authored-room-shell"]}
        updated, count = apply_plane_colors(mesh, [
            {"status": "inferred", "face_indices": [1], "inferred_rgb": [.8, .8, .7]}])
        self.assertEqual(count, 2)
        self.assertEqual(updated["indices"][:3], mesh["indices"][:3])
        self.assertEqual(updated["colors"][:9], mesh["colors"][:9])
        np.testing.assert_array_equal(np.array(updated["positions"]).reshape(-1, 3)[np.array(updated["indices"]).reshape(-1, 3)],
                                      np.array(mesh["positions"]).reshape(-1, 3)[np.array(mesh["indices"]).reshape(-1, 3)])

    def test_no_observed_support_preserves_exact_fallback(self):
        mesh = {"positions": [0, 0, 0, 1, 0, 0, 0, 1, 0],
                "colors": [.52, .5, .46]*3, "indices": [0, 1, 2],
                "provenance": ["authored-room-shell"]}
        updated, plans, count = infer_materials(mesh, {"floor": 0., "ceiling": 1.})
        self.assertEqual(plans[0]["status"], "unknown-fallback")
        self.assertEqual(updated, mesh)
        self.assertEqual(count, 0)

    def test_photo_face_target_is_rejected(self):
        mesh = {"positions": [0, 0, 0, 1, 0, 0, 0, 1, 0], "colors": [.2]*9,
                "indices": [0, 1, 2], "provenance": ["photo-estimated"]}
        with self.assertRaises(ValueError):
            apply_plane_colors(mesh, [{"status": "inferred", "face_indices": [0], "inferred_rgb": [.8]*3}])


if __name__ == "__main__":
    unittest.main()
