import unittest
import numpy as np
from analyze_arkit_overlap import mutual_ratio, compare, components, selection_report, summarize_model


class OverlapTests(unittest.TestCase):
    def test_mutual_ratio_rejects_ambiguity_and_missing_descriptors(self):
        a = np.float32([[0, 0], [5, 0], [10, 0]])
        self.assertEqual(mutual_ratio(a, a), [(0, 0), (1, 1), (2, 2)])
        self.assertEqual(mutual_ratio(a, np.float32([[0, 0], [0, 0]])), [])
        self.assertEqual(mutual_ratio(None, a), [])

    def test_geometric_translation_supported_without_3d_claim(self):
        rng = np.random.default_rng(10)
        a = rng.uniform(20, 900, (100, 2)).astype(np.float32)
        result, _ = compare(a, a + [10, 5], [(1000, 1000), (1000, 1000)])
        self.assertTrue(result["homography"]["accepted"])
        self.assertEqual(result["classification"], "planar-or-rotation-compatible")

    def test_localized_matches_reject_even_if_many(self):
        points = np.random.default_rng(2).uniform(10, 30, (100, 2)).astype(np.float32)
        result, _ = summarize_model(np.eye(3), np.ones((100, 1)), points, points,
                                    [(1000, 1000), (1000, 1000)])
        self.assertFalse(result["accepted"])
        self.assertIn("localized-hull", result["rejection_reasons"])

    def test_missing_correspondences_stay_failed(self):
        result, _ = compare([], [], [(1000, 1000), (1000, 1000)])
        self.assertFalse(result["accepted"])
        self.assertEqual(result["fundamental"]["inliers"], 0)

    def test_connected_selection_and_bridges_do_not_relabel_split(self):
        records = [dict(split="originals") for _ in range(3)] + [dict(split="heldout")]
        edges = [(0, 1), (1, 3), (2, 3)]
        pairs = [dict(a=a, b=b, accepted=True, fundamental=dict(inliers=40),
                      homography=dict(inliers=30)) for a, b in edges]
        result = selection_report(records, pairs, size=3)
        self.assertEqual(result["original_components"], [[0, 1], [2]])
        self.assertEqual(result["direct_bridge_frames"], [dict(index=3, original_components=[0, 1])])
        self.assertEqual(len(result["suggested_exploratory_seven"]), 3)
        self.assertEqual(records[-1]["split"], "heldout")
        self.assertEqual(components([0, 1, 2], edges), [[0, 1], [2]])


if __name__ == "__main__":
    unittest.main()
