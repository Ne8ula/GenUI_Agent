"""Synthetic mathematical/contract tests only; no model quality or cloud claims."""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import numpy as np

from geometry import (add_caps, add_room_shell, align_to_original, face_inside, filter_boundary, make_mesh,
                      normals, similarity, triangulate_polygon, unproject, validate_boundary)
from inference import execute, validate_config, validate_payload, _pad_masks, video_sample_indices, _arm


BOUNDARY = {"polygon": [[0, 0], [4, 0], [4, 4], [0, 4]], "floor": 0, "ceiling": 3}
NOTCHED = {"polygon": [[0, 0], [4, 0], [4, 4], [2.1, 4], [2.1, 1],
                       [1.9, 1], [1.9, 4], [0, 4]], "floor": 0, "ceiling": 3}


def record(i):
    data = ("synthetic bytes "+str(i)).encode()
    return {"id": "p"+str(i), "sha256": hashlib.sha256(data).hexdigest(),
            "data_base64": base64.b64encode(data).decode()}


def request():
    return {"version": 1, "operation": "analyze", "job_id": "test", "images": [record(i) for i in range(5)]}


class GeometryTests(unittest.TestCase):
    def test_boundary_rejects_self_intersection_repeated_holes_nonfinite(self):
        for polygon in ([[0, 0], [4, 4], [0, 4], [4, 0]],
                        [[0, 0], [4, 0], [4, 0], [0, 4]],
                        [[0, 0], [float("nan"), 0], [4, 4]]):
            with self.assertRaises(ValueError):
                validate_boundary({**BOUNDARY, "polygon": polygon})
        with self.assertRaises(ValueError):
            validate_boundary({**BOUNDARY, "holes": []})

    def test_concave_crossing_rejected_when_vertices_and_centroid_inside(self):
        # Narrow open notch intersects one edge, while centroid remains below its tip.
        tri = np.array([[.5, 1.2, 1], [3.5, 1.2, 1], [2, .1, 1]])
        self.assertFalse(face_inside(tri, NOTCHED))
        self.assertTrue(face_inside(np.array([[.1, .1, 1], [1, .1, 1], [.1, .8, 1]]), NOTCHED))

    def test_vertical_face_projection_and_floor_ceiling(self):
        triangle = np.array([[0, 0, 0], [0, 4, 0], [0, 4, 3]], dtype=float)
        self.assertTrue(face_inside(triangle, BOUNDARY))
        triangle[2, 2] = 3.1
        self.assertFalse(face_inside(triangle, BOUNDARY))

    def test_entire_triangle_exterior_with_boundary_contacts_rejected(self):
        self.assertFalse(face_inside(np.array([[1.9, 4, 1], [2.1, 4, 1], [2, 1.2, 1]]), NOTCHED))

    def test_boundary_batch_matches_single(self):
        vertices = np.array([[.2, .2, 1], [1, .2, 1], [.2, .8, 1], [5, 1, 1]])
        faces = np.array([[0, 1, 2], [0, 1, 3]])
        self.assertEqual(filter_boundary(vertices, faces, BOUNDARY).tolist(), [True, False])

    def test_vggt_integer_centers_and_z_depth(self):
        depth, K, pose = np.ones((2, 2))*2, np.eye(3), np.column_stack((np.eye(3), np.zeros(3)))
        points = unproject(depth, K, pose)
        np.testing.assert_allclose(points[0, 0], [0, 0, 2])
        np.testing.assert_allclose(points[1, 1], [2, 2, 2])

    def test_reflected_camera_rejected(self):
        with self.assertRaises(ValueError):
            unproject(np.ones((2, 2)), np.eye(3), np.column_stack((np.diag([-1, 1, 1]), np.zeros(3))))

    def test_similarity_and_robust_alignment_recover_known_transform(self):
        rng = np.random.default_rng(44)
        x = rng.normal(size=(200, 3))
        R = np.array([[0., -1, 0], [1, 0, 0], [0, 0, 1]])
        y = 2*x @ R.T+np.array([1, 2, 3])
        scale, rotation, translation, report = align_to_original(x, y)
        np.testing.assert_allclose(scale*x @ rotation.T+translation, y, atol=1e-8)
        self.assertLess(report["rms_relative_to_extent"], 1e-8)

    def test_collinear_alignment_rejected(self):
        x = np.column_stack((np.arange(100), np.zeros(100), np.zeros(100)))
        with self.assertRaises(ValueError):
            align_to_original(x, x)

    def test_incoherent_alignment_rejected(self):
        rng = np.random.default_rng(10)
        with self.assertRaises(ValueError):
            align_to_original(rng.normal(size=(100, 3)), rng.normal(size=(100, 3)))

    def test_mesh_finite_normals_and_source_provenance(self):
        y, x = np.indices((8, 8))
        points = np.stack((x/3, y/3, np.ones_like(x)), -1)[None].astype(float)
        mesh = make_mesh(points, np.ones_like(points)*.5, np.ones((1, 8, 8), bool), BOUNDARY, stride=1)
        self.assertEqual(len(mesh["provenance"]), len(mesh["indices"])//3)
        self.assertEqual(len(mesh["source_view_indices"]), len(mesh["indices"])//3)
        np.testing.assert_allclose(np.linalg.norm(np.asarray(mesh["normals"]).reshape(-1, 3), axis=1), 1)

    def test_empty_mask_fails_instead_of_fake_mesh(self):
        with self.assertRaises(ValueError):
            make_mesh(np.ones((1, 8, 8, 3)), np.ones((1, 8, 8, 3)), np.zeros((1, 8, 8), bool), stride=1)

    def test_cap_is_coplanar_authored_and_cannot_exceed_room(self):
        mesh = {"positions": [], "colors": [], "indices": [], "provenance": [], "source_view_indices": []}
        opening = {"id": "door", "edge_index": 0, "t0": .2, "t1": .5, "bottom": 0, "top": 2, "kind": "door"}
        add_caps(mesh, BOUNDARY, [opening])
        self.assertEqual(mesh["provenance"], ["authored-door-cap"]*2)
        self.assertTrue(np.all(np.asarray(mesh["positions"]).reshape(-1, 3)[:, 1] == 0))
        with self.assertRaises(ValueError):
            add_caps(mesh, BOUNDARY, [{**opening, "top": 5}])

    def test_pad_mask_excludes_padding_and_keeps_geometry_dimensions(self):
        images = [np.zeros((100, 200, 3), np.uint8)]
        valid, transforms = _pad_masks(images, [np.zeros((100, 200), bool)])
        self.assertEqual(valid.shape, (1, 518, 518))
        self.assertEqual(transforms[0]["resized_size"], [518, 252])
        self.assertEqual(int(valid.sum()), 518*252)

    def test_nonconvex_floor_shell_no_face_crosses_exterior(self):
        mesh = {"positions": [], "colors": [], "indices": [], "provenance": [], "source_view_indices": []}
        boundary = {"polygon": [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]], "floor": 0, "ceiling": 2}
        add_room_shell(mesh, boundary, [])
        v, f = np.asarray(mesh["positions"]).reshape(-1, 3), np.asarray(mesh["indices"]).reshape(-1, 3)
        self.assertTrue(filter_boundary(v, f, boundary).all())
        self.assertEqual(set(mesh["provenance"]), {"authored-room-shell"})
        floor = v[f][np.all(v[f][:, :, 2] == 0, axis=1)]
        areas = np.linalg.norm(np.cross(floor[:, 1]-floor[:, 0], floor[:, 2]-floor[:, 0]), axis=1)*.5
        self.assertAlmostEqual(areas.sum(), 5.)

    def test_wall_splits_at_portals_with_no_hidden_wall_faces(self):
        mesh = {"positions": [], "colors": [], "indices": [], "provenance": [], "source_view_indices": []}
        opening = {"id": "door", "edge_index": 0, "t0": .25, "t1": .5, "bottom": 0, "top": 2, "kind": "door"}
        add_room_shell(mesh, BOUNDARY, [opening])
        v, f = np.asarray(mesh["positions"]).reshape(-1, 3), np.asarray(mesh["indices"]).reshape(-1, 3)
        for face, category in zip(v[f], mesh["provenance"]):
            centroid = face.mean(0)
            if np.all(face[:, 1] == 0) and 1 < centroid[0] < 2 and 0 < centroid[2] < 2:
                self.assertEqual(category, "authored-door-cap")
        self.assertEqual(mesh["provenance"].count("authored-door-cap"), 2)

    def test_overlapping_portals_rejected(self):
        mesh = {"positions": [], "colors": [], "indices": [], "provenance": [], "source_view_indices": []}
        opening = {"id": "door", "edge_index": 0, "t0": .25, "t1": .5, "bottom": 0, "top": 2, "kind": "door"}
        with self.assertRaises(ValueError):
            add_room_shell(mesh, BOUNDARY, [opening, {**opening, "id": "window", "kind": "window"}])

    def test_arm_retains_raw_estimate_separately_from_authored_shell(self):
        y, x = np.indices((20, 20))
        points = np.stack((x/5, y/5, np.ones_like(x)), -1)[None].astype(float)
        prediction = {"points": points, "rgb": np.ones_like(points)*.5,
                      "valid": np.ones((1, 20, 20), bool), "cameras": [{}], "orientation": "fixture"}
        result = _arm(prediction, [{"id": "original"}], BOUNDARY)
        self.assertEqual(set(result["raw_geometry"]["provenance"]), {"photo-estimated"})
        self.assertIn("authored-room-shell", result["geometry"]["provenance"])
        self.assertIsNot(result["geometry"], result["raw_geometry"])


class ContractTests(unittest.TestCase):
    def test_video_sampling_is_deterministic_bounded_and_rejects_bad_duration(self):
        samples = video_sample_indices(900, 30)
        self.assertEqual(len(samples), 12)
        self.assertEqual((samples[0], samples[-1]), (0, 899))
        self.assertEqual(samples, video_sample_indices(900, 30))
        for count, fps in ((901, 30), (1801, 60), (10, 0), (10, float("nan")), (-1, 30)):
            with self.assertRaises(ValueError):
                video_sample_indices(count, fps)

    def test_video_requires_hash_and_excludes_frame_inputs(self):
        payload = request()
        payload.update({"operation": "reconstruct", "boundary": BOUNDARY,
                        "analysis_binding": {key: "0"*64 for key in
                            ("model_config_sha256", "original_inputs_sha256", "analysis_geometry_sha256")},
                        "generated_video": record(10)})
        validate_payload(payload)
        payload["generated_images"] = [record(11)]
        with self.assertRaises(ValueError):
            validate_payload(payload)
        payload.pop("generated_images")
        payload["generated_video"]["sha256"] = "0"*64
        with self.assertRaises(ValueError):
            validate_payload(payload)

    def test_huge_or_nonfinite_sam_prompts_fail_before_model_loading(self):
        for points in ([[0, 0]]*33, [[float("inf"), 0]]):
            payload = request()
            payload["sam2_prompts"] = {"p0": {"points": points, "labels": [1]*len(points)}}
            with self.assertRaises(ValueError):
                validate_payload(payload)

    def test_valid_and_invalid_input_counts(self):
        self.assertEqual(len(validate_payload(request())[0]), 5)
        invalid = request(); invalid["images"] = invalid["images"][:4]
        with self.assertRaises(ValueError):
            validate_payload(invalid)

    def test_reconstruct_requires_real_b_images_and_boundary(self):
        invalid = request(); invalid["operation"] = "reconstruct"; invalid["boundary"] = BOUNDARY
        with self.assertRaises(ValueError):
            validate_payload(invalid)
        invalid["generated_images"] = [record(8)]
        invalid["analysis_binding"] = {key: "0"*64 for key in
                                      ("model_config_sha256", "original_inputs_sha256", "analysis_geometry_sha256")}
        validate_payload(invalid)

    def test_duplicate_hash_tamper_unknown_authority_rejected(self):
        for change in ("duplicate", "hash", "authority"):
            invalid = request()
            if change == "duplicate":
                invalid["images"][1] = {**invalid["images"][0], "id": "distinct"}
            elif change == "hash":
                invalid["images"][0]["sha256"] = "0"*64
            else:
                invalid["allow_network"] = True
            with self.assertRaises(ValueError):
                validate_payload(invalid)

    def test_unpinned_config_rejected(self):
        for config in ({}, {"vggt_source_revision": "main", "vggt_checkpoint_revision": "latest"}):
            with self.assertRaises(ValueError):
                validate_config(config)

    def test_missing_configuration_returns_honest_not_run(self):
        result = execute(request(), {})
        self.assertEqual(result["model_execution"], "not-run")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["arms"], {})

    def test_client_rejects_submission_without_flag_before_import_modal(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, str(Path(__file__).with_name("cloud_client.py")),
                                     "--request", "absent.json", "--output", str(Path(directory)/"out.json")],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("--confirm-billable", result.stderr)
            self.assertFalse((Path(directory)/"out.json").exists())

    def test_client_alias_receipt_and_uncertain_spawn_prevent_replay(self):
        import cloud_client
        with tempfile.TemporaryDirectory() as directory:
            request_path, response_path = Path(directory)/"job.request.json", Path(directory)/"response.json"
            request_path.write_text(json.dumps(request()), encoding="utf-8")
            modal = Mock()
            modal.Function.from_name.return_value.spawn.side_effect = RuntimeError("uncertain network")
            args = ["--request", str(request_path), "--response", str(response_path), "--confirm-billable"]
            with patch.dict(sys.modules, {"modal": modal}):
                with self.assertRaises(RuntimeError):
                    cloud_client.main(args)
                receipt = json.loads(request_path.with_suffix(".receipt.json").read_text())
                self.assertEqual(receipt["status"], "submission-started")
                with self.assertRaises(SystemExit):
                    cloud_client.main(args)
            self.assertEqual(modal.Function.from_name.return_value.spawn.call_count, 1)

    def test_cancel_uses_receipted_remote_call_and_reports_request_only(self):
        import cloud_client
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory)/"job.receipt.json"
            receipt.write_text(json.dumps({"modal_call_id": "fc-test", "status": "submitted"}), encoding="utf-8")
            modal = Mock()
            with patch.dict(sys.modules, {"modal": modal}):
                self.assertEqual(cloud_client.main(["--cancel-receipt", str(receipt)]), 0)
            modal.FunctionCall.from_id.assert_called_once_with("fc-test")
            modal.FunctionCall.from_id.return_value.cancel.assert_called_once_with(terminate_containers=True)
            self.assertEqual(json.loads(receipt.read_text())["status"], "cancellation-requested")


if __name__ == "__main__":
    unittest.main()
