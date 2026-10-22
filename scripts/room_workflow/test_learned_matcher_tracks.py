import unittest
from unittest.mock import patch
import numpy as np

from learned_matcher_tracks import analysis_points, associate, pair_gate, spatial_support


class LearnedTrackTests(unittest.TestCase):
    def test_anisotropic_resize_pad_roundtrip_uses_pixel_centers(self):
        original = {"original_size": [1440, 1920]}
        transform = {"source_size": [1440, 1920], "resized_size": [392, 518],
                     "padding_left_top": [63, 0], "model_size": [518, 518],
                     "pixel_center_convention": "integer"}
        points = np.array([[0., 0.], [719.5, 959.5], [1439., 1919.]])
        mapped = analysis_points(points, original, transform)
        recovered = (mapped-transform["padding_left_top"]+.5)/(np.array([392, 518])/[1440, 1920])-.5
        np.testing.assert_allclose(recovered, points, atol=1e-12)
        transform["source_size"] = [1, 1]
        with self.assertRaises(ValueError):
            analysis_points(points, original, transform)

    def test_localized_matches_do_not_create_room_support(self):
        points = [[100+x, 100+y] for x in range(6) for y in range(6)]
        self.assertFalse(spatial_support(points, [640, 480])["passed"])

    def test_distributed_points_pass_spatial_gate(self):
        points = [[x, y] for x in (20, 200, 400, 620) for y in (20, 160, 320, 460)]
        self.assertTrue(spatial_support(points, [640, 480])["passed"])

    def test_ambiguous_nearby_features_are_not_merged(self):
        points = [np.array([0., 0.]), np.array([1.5, 0.])]
        self.assertIsNone(associate(points, np.array([.75, 0.])))
        self.assertEqual(len(points), 2)

    def test_unique_association_reuses_and_new_point_appends(self):
        points = [np.array([0., 0.])]
        self.assertEqual(associate(points, np.array([.5, 0.])), 0)
        self.assertEqual(associate(points, np.array([3., 0.])), 1)

    def test_binned_association_checks_adjacent_cells(self):
        points, bins = [], {}
        self.assertEqual(associate(points, np.array([.9, .9]), bins=bins), 0)
        self.assertEqual(associate(points, np.array([1.1, 1.1]), bins=bins), 0)
        self.assertEqual(associate(points, np.array([2.4, .9]), bins=bins), 1)
        self.assertIsNone(associate(points, np.array([1.65, .9]), bins=bins))

    def test_association_preflight_does_not_leave_orphan(self):
        points, bins = [], {}
        self.assertEqual(associate(points, np.array([1., 2.]), bins=bins, commit=False), 0)
        self.assertEqual(points, [])
        self.assertEqual(bins, {})

    def test_empty_pair_remains_failure(self):
        mask, report = pair_gate([], [], [[640, 480]]*2)
        self.assertEqual(report["status"], "insufficient-matches")
        self.assertEqual(len(mask), 0)

    def test_epipolar_inliers_without_spread_fail(self):
        points = np.array([[100+x, 100+y] for x in range(6) for y in range(6)], float)
        with patch("learned_matcher_tracks.cv2.findFundamentalMat",
                   return_value=(np.eye(3), np.ones((len(points), 1), np.uint8))):
            mask, report = pair_gate(points, points+1, [[640, 480]]*2)
        self.assertFalse(mask.any())
        self.assertEqual(report["status"], "insufficient-distributed-epipolar-support")

    def test_planar_dominance_does_not_authorize_pose_refinement(self):
        points = np.array([[x, y] for x in np.linspace(20, 620, 8) for y in np.linspace(20, 460, 5)])
        ones = np.ones((len(points), 1), np.uint8)
        with patch("learned_matcher_tracks.cv2.findFundamentalMat", return_value=(np.eye(3), ones)), \
                patch("learned_matcher_tracks.cv2.findHomography", return_value=(np.eye(3), ones)):
            mask, report = pair_gate(points, points+1, [[640, 480]]*2)
        self.assertFalse(mask.any())
        self.assertEqual(report["status"], "planar-or-rotation-dominant-pair")


if __name__ == "__main__":
    unittest.main()
