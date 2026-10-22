import base64
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import numpy as np
from PIL import Image

import object_suggestions as objects
import object_cloud as cloud
from object_proposals import lift, associate, inside_bounds, build
from pilot import encoded, sha


def request():
    records = []
    for i in range(5):
        image = Image.new("RGB", (64, 48), (20*i, 80, 100))
        output = io.BytesIO(); image.save(output, format="PNG"); data = output.getvalue()
        records.append({"id": f"p{i}", "sha256": sha(data), "data_base64": base64.b64encode(data).decode()})
    return {"version": 1, "operation": "analyze", "job_id": "room-test", "images": records}


def detect(image):
    return [{"label": "desk", "score": .9, "box": [4, 4, 40, 36]},
            {"label": "desk", "score": .8, "box": [5, 5, 39, 35]}]


def segment(image, boxes):
    result = []
    for _ in boxes:
        mask = np.zeros((image.height, image.width), bool); mask[4:36, 4:40] = True
        result.append((mask, .9))
    return result


class ObjectTests(unittest.TestCase):
    def test_automatic_boxes_prompt_masks_no_manual_region_required(self):
        req = request()
        before = copy.deepcopy(req)
        result = objects.execute(req, detect, segment)
        self.assertEqual(result["status"], "executed")
        self.assertEqual([len(v["detections"]) for v in result["views"]], [1]*5)
        self.assertEqual(result["views"][0]["detections"][0]["review_reasons"], [])
        self.assertEqual(req, before)
        self.assertEqual(objects.validate_result(result, req), result)

    def test_no_desk_and_empty_room_do_not_inherit_benchmark_furniture(self):
        for label in ("chair", None):
            detector = lambda image: [] if label is None else [{"label": label, "score": .8, "box": [4, 4, 40, 36]}]
            result = objects.execute(request(), detector, segment)
            labels = {o["label"] for v in result["views"] for o in v["detections"]}
            self.assertEqual(labels, set() if label is None else {"chair"})
            self.assertEqual(result["status"], "no-suggestions" if label is None else "executed")

    def test_unknown_authority_source_mask_and_model_changes_rejected(self):
        req = request()
        result = objects.execute(req, detect, segment)
        variants = []
        for key, value in (("authorized", True), ("job_id", "different"),
                           ("model_config_sha256", "0"*64), ("original_inputs_sha256", "0"*64)):
            variants.append({**result, key: value})
        damaged = copy.deepcopy(result); damaged["views"][0]["detections"][0]["mask"]["sha256"] = "0"*64
        variants.append(damaged)
        badsize = copy.deepcopy(result); badsize["views"][0]["mask_size"] = [1_000_000, 1]
        variants.append(badsize)
        outside = copy.deepcopy(result); outside["views"][0]["detections"][0]["box_xyxy"][2] = 1000
        variants.append(outside)
        for value in variants:
            with self.assertRaises(ValueError):
                objects.validate_result(value, req)
        for extra in ({"generated_images": []}, {"sam2_prompts": {}}, {"approved": True}):
            with self.assertRaises(ValueError):
                objects.validate_request({**req, **extra})

    def test_bounds_caps_and_review_flags(self):
        raw = [{"label": "desk", "score": .9, "box": [i*3, 0, i*3+2, 4]} for i in range(20)]
        selected, truncated = objects.select_boxes(raw, [100, 48])
        self.assertEqual(len(selected), 12); self.assertEqual(truncated, 8)
        with self.assertRaises(ValueError):
            objects.select_boxes(raw*50, [100, 48])
        mask = np.ones((48, 64), bool)
        self.assertEqual(objects.review_reasons(mask, .6), ["weak-mask-score", "cut-off-at-image-edge"])
        with self.assertRaises(ValueError):
            objects.decode_mask(objects.mask_record(np.zeros((48, 64), bool)), [64, 48])

    def test_offline_plan_and_changed_source_fail_before_cloud_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); path = root/"request.json"; path.write_bytes(encoded(request()))
            plan = cloud.prepare(path); plan_path = root/"plan.json"; plan_path.write_bytes(encoded(plan))
            self.assertEqual(plan["kind"], "eva-object-suggestions-plan-v1")
            with patch("object_cloud.create_app", side_effect=AssertionError("No cloud call allowed")):
                with self.assertRaises(ValueError):
                    cloud.execute(plan_path, "0"*64, root/"output.json")
                req = request(); req["job_id"] = "changed"; path.write_bytes(encoded(req))
                with self.assertRaises(ValueError):
                    cloud.execute(plan_path, sha(plan_path.read_bytes()), root/"output.json")
            self.assertFalse(plan_path.with_suffix(".receipt.json").exists())

    def test_duplicate_normalized_pixels_rejected_offline(self):
        req = request()
        # Different PNG encoding, identical decoded pixels.
        from PIL.PngImagePlugin import PngInfo
        output = io.BytesIO(); info = PngInfo(); info.add_text("comment", "same pixels")
        Image.new("RGB", (64, 48), (0, 80, 100)).save(output, format="PNG", pnginfo=info)
        req["images"][1].update(sha256=sha(output.getvalue()), data_base64=base64.b64encode(output.getvalue()).decode())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"request.json"; path.write_bytes(encoded(req))
            with self.assertRaisesRegex(ValueError, "Duplicate normalized"):
                cloud.prepare(path)

    def test_receipt_reserved_before_build_failure_and_no_repeat(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); path = root/"request.json"; path.write_bytes(encoded(request()))
            plan_path = root/"plan.json"; plan_path.write_bytes(encoded(cloud.prepare(path)))
            receipt = plan_path.with_suffix(".receipt.json")
            def fail():
                self.assertEqual(json.loads(receipt.read_text())["status"], "reserved-before-build")
                raise RuntimeError("synthetic build failure")
            with patch("object_cloud.create_app", side_effect=fail) as build:
                with self.assertRaises(RuntimeError):
                    cloud.execute(plan_path, sha(plan_path.read_bytes()), root/"output.json")
                with self.assertRaises(ValueError):
                    cloud.execute(plan_path, sha(plan_path.read_bytes()), root/"output.json")
                self.assertEqual(build.call_count, 1)
            self.assertEqual(json.loads(receipt.read_text())["status"], "failed-or-uncertain")

    def test_timeout_cancels_existing_call_before_context_exit_and_keeps_receipt(self):
        events = []
        class Call:
            object_id = "synthetic-call"
            def get(self, timeout):
                self_timeout = timeout
                events.append(("get", self_timeout))
                raise TimeoutError("synthetic")
            def cancel(self, terminate_containers):
                events.append(("cancel", terminate_containers))
        class Context:
            def __enter__(self):
                events.append("enter")
            def __exit__(self, *args):
                events.append("exit")
        app = SimpleNamespace(app_id="synthetic-app", run=lambda **kw: Context(),
                              registered_functions={"suggest": SimpleNamespace(spawn=lambda req: Call())})
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); path = root/"request.json"; path.write_bytes(encoded(request()))
            plan_path = root/"plan.json"; plan_path.write_bytes(encoded(cloud.prepare(path)))
            with patch("object_cloud.create_app", return_value=app):
                with self.assertRaises(TimeoutError):
                    cloud.execute(plan_path, sha(plan_path.read_bytes()), root/"output.json")
            self.assertEqual(events, ["enter", ("get", 630), ("cancel", True), "exit"])
            receipt = json.loads(plan_path.with_suffix(".receipt.json").read_text())
            self.assertEqual(receipt["modal_call_id"], "synthetic-call")
            self.assertEqual(receipt["status"], "failed-or-uncertain")
            self.assertFalse((root/"output.json").exists())

    def test_acquisition_hash_mismatch_rejected_before_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"weights"; path.write_bytes(b"bad")
            models = {"models": [{"repository": "test/model", "revision": "a"*40,
                                  "files": [{"name": "weights", "bytes": 3, "algorithm": "sha256",
                                             "hash": sha(b"yes")}]}]}
            module = SimpleNamespace(hf_hub_download=lambda *a, **kw: str(path))
            with patch.dict("sys.modules", {"huggingface_hub": module}), patch.object(objects, "MODELS", models):
                with self.assertRaisesRegex(ValueError, "hash"):
                    objects.acquire(directory)


class SpatialTests(unittest.TestCase):
    def test_concave_boundary_rejects_observed_points_in_notch_or_below_floor(self):
        boundary = {"polygon": [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]],
                    "floor": 0, "ceiling": 3}
        support = {"visible_bounds": [[.1, .1, .5], [.9, 2.9, 2]],
                   "points": [[.1, .1, .5], [.9, 2.9, 2]]}
        self.assertTrue(inside_bounds(support, boundary))
        self.assertFalse(inside_bounds({"visible_bounds": [[.1, .1, .5], [2.9, 2.9, 2]],
                                       "points": [[.1, .1, .5], [2.9, 2.9, 2]]}, boundary))
        self.assertFalse(inside_bounds({**support, "visible_bounds": [[.1, .1, -.5], [.9, 2.9, 2]]}, boundary))

    def test_rotated_room_keeps_observed_points_even_when_empty_box_corners_are_outside(self):
        boundary = {"polygon": [[0, -3], [3, 0], [0, 3], [-3, 0]], "floor": 0, "ceiling": 3}
        support = {"visible_bounds": [[.9, .9, .5], [2, 2, 2]],
                   "points": [[.9, 2, .5], [2, .9, 2], [1.45, 1.45, 1]]}
        self.assertTrue(inside_bounds(support, boundary))

    def test_complete_bound_proposal_pipeline_and_stale_review_rejection(self):
        from test_complete_candidate import review_fixture
        from prediction_fields import pack
        req = request()
        suggestions = objects.execute(req, detect, segment)
        analysis, review = review_fixture()
        sources = objects.validate_request(req)
        analysis["job_id"] = req["job_id"]
        analysis["original_inputs_sha256"] = objects.fingerprint({"images": sources, "masks": {}})
        analysis["analysis_binding"]["original_inputs_sha256"] = analysis["original_inputs_sha256"]
        review["analysis_binding"] = copy.deepcopy(analysis["analysis_binding"])
        review["boundary"] = {"polygon": [[-3, -3], [3, -3], [3, 3], [-3, 3]], "floor": 0, "ceiling": 4}
        analysis["original_input_hashes"] = sources
        analysis["arms"]["A"]["cameras"] = [
            {"image_id": s["id"], "intrinsics": [[518, 0, 259], [0, 518, 259], [0, 0, 1]],
             "world_to_camera": [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]} for s in sources]
        analysis["preprocessing"] = [{"source_size": [64, 48], "resized_size": [518, 392],
                                     "padding_left_top": [0, 63], "model_size": [518, 518],
                                     "pixel_center_convention": "integer"} for _ in sources]
        shape = (5, 518, 518)
        analysis["prediction_fields"] = pack({"depth": np.ones(shape)*2, "confidence": np.ones(shape),
                                             "rgb": np.ones((*shape, 3))*.4,
                                             "image_valid": np.ones(shape, bool), "valid": np.ones(shape, bool)},
                                            [s["id"] for s in sources])
        before = copy.deepcopy(analysis)
        result = build(req, analysis, suggestions, review)
        self.assertEqual(len(result["objects"]), 1)
        self.assertEqual(result["objects"][0]["label"], "desk")
        self.assertEqual(len(result["objects"][0]["observation_ids"]), 5)
        self.assertFalse(result["objects"][0]["complete_shape"])
        self.assertEqual(analysis, before)
        review["analysis_binding"]["model_config_sha256"] = "0"*64
        with self.assertRaisesRegex(ValueError, "binding"):
            build(req, analysis, suggestions, review)

    def test_mask_padding_rotated_camera_and_missing_depth(self):
        transform = {"source_size": [100, 50], "resized_size": [518, 252],
                     "padding_left_top": [0, 133], "model_size": [518, 518],
                     "pixel_center_convention": "integer"}
        mask = np.ones((50, 100), bool)
        depth = np.ones((518, 518))*2; valid = np.ones_like(depth, bool)
        camera = {"intrinsics": [[518, 0, 259], [0, 518, 259], [0, 0, 1]],
                  "world_to_camera": [[0, -1, 0, 1], [1, 0, 0, 0], [0, 0, 1, 0]]}
        result = lift(mask, transform, camera, depth, valid, np.ones((518, 518, 3))*.4)
        points = np.asarray(result["points"])
        self.assertEqual(result["support_pixels"], 518*252)
        self.assertTrue(np.allclose(points[:, 2], 2))
        self.assertLess(np.max(np.abs(points[:, 0])), .5)
        self.assertGreater(points[:, 1].min(), 0)
        self.assertEqual(lift(mask, transform, camera, depth, valid*False, np.zeros((518, 518, 3))), None)

    def test_cross_view_identity_does_not_merge_same_photo_or_competing_objects(self):
        def observation(id, view, x=0, label="desk"):
            return {"id": id, "image_id": view, "label": label, "review_reasons": [],
                    "support": {"center": [x+.5, .5, 1],
                                "visible_bounds": [[x, 0, 1], [x+1, 1, 1]]}}
        a, b = observation("a", "p0"), observation("b", "p1", .01)
        self.assertEqual(len(associate([a, b])), 1)
        self.assertEqual(len(associate([a, observation("c", "p0", .01)])), 2)
        ambiguous = [observation("a", "p0"), observation("b", "p1", .01), observation("c", "p1", .02)]
        self.assertEqual(len(associate(ambiguous)), 3)
        self.assertIn("ambiguous-cross-view-identity", ambiguous[0]["review_reasons"])
        other_room = [observation("d", "q0", 20, "bed"), observation("e", "q1", 20.01, "bed")]
        self.assertEqual(associate(other_room)[0]["label"], "bed")
        self.assertFalse(associate(other_room)[0]["complete_shape"])
        other_room[0]["review_reasons"] = ["outside-reviewed-room"]
        self.assertEqual(associate(other_room)[0]["observation_ids"], ["e"])


if __name__ == "__main__":
    unittest.main()
