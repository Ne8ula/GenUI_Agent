import unittest
import numpy as np
from evaluate_arkit_heldout import (aggregate, common_overlap_metrics, estimate_query_pose,
                                  measure_render, registration_failure_labels, source_path)


class HeldoutTests(unittest.TestCase):
    def test_insufficient_features_remain_registration_failure(self):
        pose, record = estimate_query_pose(np.zeros((5, 3)), np.zeros((5, 2)), np.zeros(5),
                                           np.eye(3), {"resized_size": [518, 518]})
        self.assertIsNone(pose)
        self.assertEqual(record["status"], "registration-failed")

    def test_single_source_support_is_not_accepted(self):
        rng = np.random.default_rng(3)
        points = rng.uniform([-1., -1., 3.], [1., 1., 5.], (100, 3))
        k = np.array([[500., 0, 259], [0, 500, 259], [0, 0, 1.]])
        xy = (points@k.T)[:, :2]/points[:, 2:]
        pose, record = estimate_query_pose(points, xy, np.zeros(100, int), k, {"resized_size": [518, 518]})
        self.assertIsNone(pose)
        self.assertIn("single-source-support", record["reasons"])
        pose, record = estimate_query_pose(points, xy, np.arange(100)%2, k, {"resized_size": [518, 518]})
        self.assertIsNotNone(pose)
        self.assertEqual(record["status"], "registered-estimated-query-pose")

    def test_failed_query_stays_in_coverage_denominator(self):
        domain = np.ones((2, 2), bool)
        good = measure_render(np.ones((2, 2)), np.zeros((2, 2, 3)), np.ones((2, 2))*2,
                              domain, np.zeros((2, 2, 3)), 2)
        failed = measure_render(np.full((2, 2), np.inf), np.zeros((2, 2, 3)), np.ones((2, 2))*2,
                                domain, np.zeros((2, 2, 3)), 2)
        views = [{"id": "a", "registration": {"status": "registered-estimated-query-pose"}, "variants": {"fused": good}},
                 {"id": "b", "registration": {"status": "registration-failed"}, "variants": {"fused": failed}}]
        report = aggregate(views, ["fused"])
        self.assertEqual(report["views_attempted"], 2)
        self.assertEqual(report["variants"]["fused"]["effective_registered_view_coverage"], .5)
        self.assertEqual(report["variants"]["fused"]["conditional_render_coverage_registered_queries"], 1.)
        self.assertEqual(report["variants"]["fused"]["missing_mesh_or_pose_at_reference_pixels"], 4)
        self.assertEqual(report["failed_registration_views"], ["b"])

    def test_registration_failure_is_not_a_mesh_failure(self):
        view = {"registration": {"status": "registration-failed"},
                "variants": {"raw": {"status": "no-mesh-hits", "ray_coverage": 0}}}
        registration_failure_labels(view)
        self.assertEqual(view["variants"]["raw"]["status"], "not-rendered-registration-failed")
        self.assertIsNone(view["variants"]["raw"]["ray_coverage"])

    def test_common_depth_comparison_ignores_extra_coverage(self):
        reference = np.array([[2., 2.]])
        depths = {"raw": np.array([[1., np.inf]]), "fused": np.array([[1., 8.]]),
                  "completed": np.array([[1., 20.]])}
        report = common_overlap_metrics(depths, reference, np.ones((1, 2), bool), 2)
        self.assertEqual(report["pixels"], 1)
        for metrics in report["variants"].values():
            self.assertEqual(metrics["mae_m_after_global_fit"], 0.)

    def test_reference_does_not_refit_scale_per_query(self):
        record = measure_render(np.ones((2, 2)), np.zeros((2, 2, 3)), np.ones((2, 2))*4,
                                np.ones((2, 2), bool), np.zeros((2, 2, 3)), 2)
        self.assertEqual(record["reference_depth_errors"]["mae_m_after_global_fit"], 2)

    def test_manifest_path_cannot_escape(self):
        with self.assertRaises(ValueError):
            source_path(".", "../outside.png")


if __name__ == "__main__":
    unittest.main()
