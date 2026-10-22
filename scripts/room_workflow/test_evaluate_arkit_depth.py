import unittest
import json
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from evaluate_arkit_depth import REVISION, compare_depths, evaluate, prepare_reference
from prediction_fields import pack


class ReferenceDepthTests(unittest.TestCase):
    def test_clockwise_rotation_and_missing_values_stay_aligned(self):
        source = np.array([[1000, 0, 3000], [4000, 5000, 6000]], np.uint16)
        preprocessing = {"source_size": [2, 3], "resized_size": [2, 3],
                         "padding_left_top": [1, 0], "model_size": [4, 3]}
        depth, domain = prepare_reference(source, 90, preprocessing)
        np.testing.assert_array_equal(depth[:, 1:3], [[4, 1], [5, 0], [6, 3]])
        self.assertEqual(domain.sum(), 6)
        self.assertEqual(np.count_nonzero(depth), 5)
        self.assertTrue(np.all(depth[:, [0, 3]] == 0))

    def test_nearest_resampling_does_not_interpolate_across_invalid_reference(self):
        source = np.array([[1000, 0]], np.uint16)
        preprocessing = {"source_size": [2, 1], "resized_size": [4, 2],
                         "padding_left_top": [0, 0], "model_size": [4, 2]}
        depth, _ = prepare_reference(source, 0, preprocessing)
        np.testing.assert_array_equal(depth, [[1, 1, 0, 0], [1, 1, 0, 0]])

    def test_one_global_scale_does_not_hide_inconsistent_view_scales(self):
        prediction = np.array([[[1., 2.]], [[2., 4.]]])
        reference = np.array([[[2., 4.]], [[2., 4.]]])
        domain = np.ones(prediction.shape, bool)
        report = compare_depths(prediction, reference, domain, domain, ["a", "b"])
        self.assertEqual(report["global_posthoc_scale_m_per_relative_unit"], 1.5)
        self.assertFalse(report["separate_per_view_scale_applied"])
        self.assertEqual(report["all_valid_prediction_errors"]["mean_abs_relative_error"], .375)
        self.assertEqual([v["reference_over_raw_prediction"]["median"] for v in report["views"]], [2., 1.])

    def test_missing_predictions_references_and_empty_views_are_retained(self):
        prediction = np.array([[[1., 0., np.nan, 10.]], [[1., 1., 1., 1.]]])
        reference = np.array([[[2., 3., 4., 0.]], [[0., 0., 0., 0.]]])
        domain = np.ones(prediction.shape, bool)
        domain[0, 0, 3] = False
        report = compare_depths(prediction, reference, domain, domain, ["a", "b"])
        self.assertEqual(report["views_attempted"], 2)
        self.assertEqual(report["views_with_overlap"], 1)
        self.assertEqual(report["image_domain_pixels"], 7)
        self.assertEqual(report["valid_reference_pixels"], 3)
        self.assertEqual(report["missing_reference_pixels"], 4)
        self.assertEqual(report["invalid_prediction_at_valid_reference_pixels"], 2)
        self.assertEqual(report["views"][1]["status"], "no-valid-reference")
        self.assertIsNone(report["views"][1]["all_valid_prediction_errors"])

    def test_selection_does_not_change_scale_fit_and_empty_coverage_is_explicit(self):
        prediction = np.ones((2, 1, 2))
        reference = np.array([[[2., 2.]], [[8., 8.]]])
        domain = np.ones(prediction.shape, bool)
        selected = domain.copy()
        selected[1] = False
        report = compare_depths(prediction, reference, domain, selected, ["a", "b"])
        self.assertEqual(report["global_posthoc_scale_m_per_relative_unit"], 5)
        self.assertEqual(report["scale_fit_pixels"], 4)
        self.assertEqual(report["selected_overlap_pixels"], 2)
        empty = compare_depths(prediction, reference*0, domain, selected, ["a", "b"])
        self.assertIsNone(empty["global_posthoc_scale_m_per_relative_unit"])
        self.assertEqual(empty["views_attempted"], 2)
        self.assertIsNone(empty["all_valid_prediction_errors"])

    def test_wrong_shape_rotation_and_selected_padding_reject(self):
        preprocessing = {"source_size": [2, 1], "resized_size": [2, 1],
                         "padding_left_top": [0, 0], "model_size": [2, 1]}
        with self.assertRaises(ValueError):
            prepare_reference(np.zeros((1, 2), np.uint16), 45, preprocessing)
        with self.assertRaises(ValueError):
            prepare_reference(np.zeros((2, 1), np.uint16), 0, preprocessing)
        fields = np.ones((1, 1, 2))
        with self.assertRaises(ValueError):
            compare_depths(fields, fields, np.zeros(fields.shape), fields, ["a"])

    def test_frozen_input_bindings_and_missing_files_survive_full_evaluation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ids = [f"photo-{i}" for i in range(5)]
            shape = (5, 518, 518)
            valid = np.zeros(shape, bool)
            valid[:, :14, :14] = True
            fields = pack({"depth": np.ones(shape, np.float32), "confidence": np.ones(shape, np.float32),
                           "rgb": np.zeros((*shape, 3), np.float32), "image_valid": valid, "valid": valid}, ids)
            originals = [{"id": name, "sha256": str(index)*64, "source_filename": f"{name}.png",
                          "source_width": 3, "source_height": 2,
                          "normalization": {"rotate_clockwise_degrees": 90}}
                         for index, name in enumerate(ids)]
            manifest = {"dataset": "ARKitScenes", "video_id": "42445021", "source_revision": REVISION, "originals": originals}
            preprocessing = {"source_size": [2, 3], "resized_size": [14, 14],
                             "padding_left_top": [0, 0], "model_size": [518, 518]}
            result = {"prediction_fields": fields, "preprocessing": [preprocessing]*5, "analysis_binding": {},
                      "original_input_hashes": [{"id": row["id"], "sha256": row["sha256"]} for row in originals]}
            for name in ids[:4]:
                Image.fromarray(np.full((2, 3), 2000, np.uint16)).save(root / f"{name}.png")
            result_path, manifest_path = root / "result.json", root / "manifest.json"
            result_path.write_text(json.dumps(result))
            manifest_path.write_text(json.dumps(manifest))
            report = evaluate(result_path, manifest_path, root)
            self.assertEqual(report["views_attempted"], 5)
            self.assertEqual(report["views_with_overlap"], 4)
            self.assertEqual(report["missing_reference_pixels"], 196)
            self.assertEqual(report["global_posthoc_scale_m_per_relative_unit"], 2)
            self.assertEqual(report["reference_files"][-1]["status"], "missing-reference-file")
            self.assertFalse(report["reference_used_to_modify_geometry"])
            result["original_input_hashes"][0]["sha256"] = "f"*64
            result_path.write_text(json.dumps(result))
            with self.assertRaisesRegex(ValueError, "identities"):
                evaluate(result_path, manifest_path, root)


if __name__ == "__main__":
    unittest.main()
