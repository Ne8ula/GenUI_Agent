import copy
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np

from complete_candidate import (bound_fused_mesh, checked_fields, clip_rectangle, complete_from_fields,
                                field_mask, fit_envelope, geometry_hash, package,
                                validate_field_alignment, validate_reviewed_boundary)


def review_fixture():
    geometry = package(np.array([[.1, .1, .5], [.9, .1, .5], [.1, .9, .5]]),
                       np.ones((3, 3)), np.array([[0, 1, 2]]))
    binding = {"analysis_geometry_sha256": geometry_hash(geometry), "model_config_sha256": "a"*64,
               "original_inputs_sha256": "b"*64}
    analysis = {**binding, "analysis_binding": binding, "status": "complete", "units": "relative",
                "model_execution": "executed", "arms": {"A": {"status": "complete", "geometry": geometry,
                                                               "cameras": [{"image_id": "a", "unchanged": [1, 2, 3]}]}},
                "preprocessing": [], "estimator": {}}
    packet = {"version": 1, "coordinate_frame": "analysis", "analysis_binding": copy.deepcopy(binding),
              "boundary": {"polygon": [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]],
                           "floor": 0, "ceiling": 2}, "openings": []}
    return analysis, packet


class CompletionTests(unittest.TestCase):
    def test_concave_notch_is_not_filled_even_with_all_vertices_inside(self):
        _, packet = review_fixture()
        v = np.array([[.5, 2.5, .5], [2.5, .5, .5], [.5, .5, .5],
                      [.1, .1, .5], [.2, .1, .5], [.1, .2, .5]])
        bounded, _, keep = bound_fused_mesh(v, np.ones_like(v), np.array([[0, 1, 2], [3, 4, 5]]),
                                           packet["boundary"], [], minimum_faces=1)
        self.assertEqual(keep.tolist(), [False, True])
        self.assertEqual(len(bounded["indices"]), 3)

    def test_review_packet_rejects_bypass_malformed_and_mismatched_binding(self):
        analysis, packet = review_fixture()
        cases = []
        unknown = copy.deepcopy(packet); unknown["skip_boundary"] = True; cases.append(unknown)
        frame = copy.deepcopy(packet); frame["coordinate_frame"] = "auto"; cases.append(frame)
        binding = copy.deepcopy(packet); binding["analysis_binding"]["model_config_sha256"] = "c"*64; cases.append(binding)
        bowtie = copy.deepcopy(packet); bowtie["boundary"]["polygon"] = [[0, 0], [2, 2], [2, 0], [0, 2]]; cases.append(bowtie)
        malformed = copy.deepcopy(packet); malformed["boundary"]["floor"] = True; cases.append(malformed)
        for invalid in cases:
            with self.subTest(packet=invalid), self.assertRaises(ValueError):
                validate_reviewed_boundary(invalid, analysis)

    def test_openings_remain_explicitly_authored(self):
        analysis, packet = review_fixture()
        opening = {"id": "door", "kind": "door", "edge_index": 0, "t0": .3, "t1": .6,
                   "bottom": 0, "top": 1.5}
        packet["openings"] = [opening]
        boundary, openings = validate_reviewed_boundary(packet, analysis)
        v, c, f = (np.array(analysis["arms"]["A"]["geometry"][key]).reshape(-1, 3)
                   for key in ["positions", "colors", "indices"])
        _, candidate, _ = bound_fused_mesh(v, c, f, boundary, openings, minimum_faces=1)
        self.assertEqual(candidate["provenance"].count("authored-door-cap"), 2)
        self.assertIn("authored-room-shell", candidate["provenance"])
        packet["openings"][0]["top"] = 3
        with self.assertRaises(ValueError):
            validate_reviewed_boundary(packet, analysis)

    def test_pure_conversion_preserves_raw_cameras_frame_and_inputs(self):
        analysis, packet = review_fixture()
        before = copy.deepcopy(analysis)
        v = np.array([[.1, .1, .5], [.9, .1, .5], [.1, .9, .5]])
        mesh = SimpleNamespace(vertices=v, vertex_colors=np.ones_like(v), triangles=np.tile([[0, 1, 2]], (100, 1)))
        analysis["prediction_fields"] = {"sha256": "d"*64}
        before = copy.deepcopy(analysis)
        with patch("complete_candidate.checked_fields", return_value=({}, [{"id": "a", "sha256": "e"*64}])), \
                patch("complete_candidate.fuse", return_value=(mesh, [])), \
                patch("complete_candidate.fit_envelope", side_effect=AssertionError("Must not fit")):
            converted = complete_from_fields(analysis, analysis, packet)
        self.assertEqual(converted["cameras"], before["arms"]["A"]["cameras"])
        self.assertEqual(converted["raw_geometry"], before["arms"]["A"]["geometry"])
        self.assertEqual(converted["original_to_candidate_rotation"], np.eye(3).tolist())
        self.assertEqual(analysis, before)
        converted["raw_geometry"]["positions"][0] = 999
        self.assertEqual(analysis, before)

    def test_unsupported_prediction_field_keys_rejected(self):
        analysis, _ = review_fixture()
        analysis["prediction_fields"] = {"format": "eva-vggt-fields-npz-v1", "execute": "not allowed"}
        with self.assertRaisesRegex(ValueError, "unsupported fields"):
            checked_fields(analysis, analysis)

    def test_resource_cap_rejects_too_many_faces_before_packaging(self):
        with self.assertRaisesRegex(ValueError, "resource cap"):
            package(np.zeros((3, 3)), np.ones((3, 3)), np.zeros((400001, 3), dtype=int))

    def test_changed_cameras_reject_field_mix(self):
        import copy
        original = {"original_inputs_sha256": "a", "analysis_geometry_sha256": "b",
                    "arms": {"A": {"cameras": [{"center": [0, 0, 0]}]}},
                    "preprocessing": [], "estimator": {}}
        changed = copy.deepcopy(original)
        changed["arms"]["A"]["cameras"][0]["center"][0] = .01
        with self.assertRaisesRegex(ValueError, "cameras changed"):
            validate_field_alignment(original, changed)

    def test_confidence_expansion_keeps_padding_and_invalid_depth_excluded(self):
        fields = {"depth": np.ones((1, 20, 20)), "confidence": np.arange(400).reshape(1, 20, 20),
                  "image_valid": np.ones((1, 20, 20), np.uint8)}
        fields["image_valid"][0, 0] = 0
        fields["depth"][0, 1, 0] = -1
        mask, threshold = field_mask(fields, 0, 5)
        stricter, _ = field_mask(fields, 0, 25)
        self.assertFalse(mask[0].any())
        self.assertFalse(mask[1, 0])
        self.assertGreater(mask.sum(), stricter.sum())
        self.assertTrue((mask[stricter]).all())

    def test_crossing_triangle_does_not_expand_room(self):
        boundary = {"polygon": [[0, 0], [1, 0], [1, 1], [0, 1]], "floor": 0, "ceiling": 1}
        v = np.array([[.2, .2, .2], [.8, .2, .2], [.2, .8, .2], [1.01, .8, .2]])
        self.assertEqual(clip_rectangle(v, np.array([[0, 1, 2], [0, 1, 3]]), boundary).tolist(), [True, False])

    def test_multi_view_fusion_does_not_invent_single_view_attribution(self):
        mesh = package(np.array([[0., 0, 0], [1, 0, 0], [0, 1, 0]]),
                       np.ones((3, 3)), np.array([[0, 1, 2]]))
        self.assertEqual(mesh["provenance"], ["photo-estimated"])
        self.assertEqual(mesh["source_view_indices"], [-1])

    def test_fitted_floor_recovers_tilt_and_excludes_remote_extension(self):
        rng = np.random.default_rng(13)
        patches = []
        for axis, offset in [(2, -1.), (0, -1.), (0, 1.), (1, -1.), (1, 1.)]:
            p = rng.uniform(-1, 1, (1400, 3))
            p[:, axis] = offset
            patches.append(p)
        v = np.concatenate(patches)
        angle = .23
        rotation = np.array([[1, 0, 0], [0, np.cos(angle), -np.sin(angle)],
                             [0, np.sin(angle), np.cos(angle)]])
        basis, boundary, report = fit_envelope(v@rotation.T, np.array([[0., 0, 0]]))
        fitted_up = np.array(report["floor_normal_original"])
        self.assertGreater(abs(fitted_up@(rotation@np.array([0, 0, 1]))), .999)
        self.assertTrue(np.allclose(basis@basis.T, np.eye(3), atol=1e-6))
        self.assertLess(boundary["floor"], -.98)
        self.assertGreater(boundary["floor"], -1.05)

    def test_missing_floor_requires_review(self):
        with self.assertRaises(ValueError):
            fit_envelope(np.random.default_rng(1).uniform(-.1, .1, (1000, 3)), np.zeros((1, 3)))


if __name__ == "__main__":
    unittest.main()
