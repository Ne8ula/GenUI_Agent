import unittest
import numpy as np
from refine_arkit_bundle import build_tracks, descendant_pids, project, solve_bundle, support_gate


class BundleSupportTests(unittest.TestCase):
    def test_resource_accounting_includes_redirector_descendants_only(self):
        self.assertEqual(descendant_pids(10, [(20, 10), (30, 20), (40, 5), (50, 40)]),
                         [10, 20, 30])

    def test_track_merging_rejects_duplicate_observation_in_same_camera(self):
        tracks = build_tracks([(1., (0, 1), (1, 2)), (2., (1, 2), (2, 3)),
                               (3., (2, 3), (0, 4))])
        self.assertEqual(tracks, [[(0, 1), (1, 2), (2, 3)]])

    def test_strong_pair_does_not_authorize_disconnected_room_bundle(self):
        tracks = [[(0, i), (1, i)] for i in range(150)]
        result = support_gate(tracks, 7)
        self.assertFalse(result["passed"])
        self.assertIn("disconnected-camera-graph", result["reasons"])
        self.assertIn("insufficient-per-camera-support", result["reasons"])

    def test_connected_but_weak_camera_is_rejected(self):
        tracks = [[(0, i), (1, i)] for i in range(150)]+[[(1, 200), (2, 200)]]
        self.assertIn("insufficient-per-camera-support", support_gate(tracks, 3)["reasons"])

    def test_sufficient_connected_tracks_pass_support_gate(self):
        tracks = [[(0, i), (1, i), (2, i)] for i in range(150)]
        self.assertTrue(support_gate(tracks, 3)["passed"])

    def test_projection_respects_camera_from_world(self):
        camera = {"world_to_camera": [[1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0]],
                  "intrinsics": [[100, 0, 50], [0, 100, 50], [0, 0, 1]]}
        xy, depth = project(np.array([[0., 0, 2]]), camera)
        np.testing.assert_allclose(xy, [[100, 50]])
        np.testing.assert_allclose(depth, [2])

    def test_sparse_solver_preserves_gauge_and_reduces_original_objective(self):
        rng = np.random.default_rng(12)
        points = rng.uniform([-1., -1., 3.], [1., 1., 5.], (110, 3))
        cameras, observations = [], []
        for i, translation in enumerate(([0, 0, 0], [-.3, 0, 0], [0, -.3, 0])):
            camera = {"world_to_camera": np.column_stack([np.eye(3), translation]).tolist(),
                      "intrinsics": [[500., 0, 259.], [0, 500., 259.], [0, 0, 1.]]}
            xy, _ = project(points, camera)
            observations.extend((i, p, xy[p].tolist()) for p in range(len(points)))
            cameras.append(camera)
        cameras[1]["world_to_camera"][0][3] += .015
        result = solve_bundle(cameras, points, observations)
        self.assertTrue(result["gauge_first_pose_unchanged"])
        self.assertTrue(result["gauge_first_anchor_depth_unchanged"])
        self.assertLess(result["final_objective"], result["initial_objective"])
        self.assertLessEqual(result["nfev"], 50)
        self.assertEqual(result["reserved_original_before"]["count"], 22)


if __name__ == "__main__":
    unittest.main()
