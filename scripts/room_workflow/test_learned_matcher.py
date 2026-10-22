import base64
import io
import unittest
from unittest.mock import MagicMock, patch
import json
from pathlib import Path
import tempfile
import subprocess
import sys

import numpy as np
from PIL import Image

import learned_matcher as matcher
import learned_matcher_pilot as pilot


def request():
    images = []
    for i in range(5):
        output = io.BytesIO()
        Image.new("RGB", (32, 24), (i, 10, 20)).save(output, format="PNG")
        data = output.getvalue()
        images.append({"id": f"source_{i}", "sha256": matcher.digest(data),
                       "data_base64": base64.b64encode(data).decode()})
    return {"version": 1, "operation": "analyze", "job_id": "test", "images": images}


class LearnedMatcherTests(unittest.TestCase):
    def test_plan_is_pinned_and_nonexecuting(self):
        plan = matcher.proposal()
        self.assertEqual(plan["status"], "prepared-not-submitted")
        self.assertEqual(len(plan["pins"]["weights_revision"]), 40)
        self.assertEqual(len(plan["pins"]["weights_sha256"]), 64)
        self.assertEqual(plan["policy"]["retries"], 0)

    def test_rejects_authority_reference_and_runtime_overrides(self):
        for field in ("depth", "reference", "generated_images", "checkpoint_path", "authorize", "boundary"):
            value = request(); value[field] = True
            with self.subTest(field=field), self.assertRaises(ValueError):
                matcher.validate_request(value)

    def test_original_hash_and_image_count_enforced(self):
        value = request()
        self.assertEqual(len(matcher.validate_request(value)), 5)
        value["images"][0]["sha256"] = "0"*64
        with self.assertRaises(ValueError):
            matcher.validate_request(value)
        value = request(); value["images"] *= 2
        with self.assertRaises(ValueError):
            matcher.validate_request(value)

    def test_resize_tracks_exact_scales_and_pixel_centers(self):
        gray, transform = matcher.prepare_image(request()["images"][0])
        self.assertEqual(gray.shape, (24, 32))
        transforms = [{"resized_size": [16, 16], "scale_xy": [.5, .5]}]*2
        pair = matcher.pack_pair(0, 1, [[2, 3]], [[4, 5]], [.8], transforms)
        np.testing.assert_allclose(pair["points0"], [[4.5, 6.5]])

    def test_zero_matches_remain_explicit_pair(self):
        transform = {"resized_size": [16, 16], "scale_xy": [1, 1]}
        pair = matcher.pack_pair(0, 1, np.empty((0, 2)), np.empty((0, 2)), [], [transform]*2)
        self.assertEqual(pair["status"], "no-matches")
        self.assertEqual(pair["retained_match_count"], 0)

    def test_invalid_scores_and_coordinates_rejected(self):
        transforms = [{"resized_size": [16, 16], "scale_xy": [1, 1]}]*2
        for points, scores in (([[0, 0]], [float("nan")]), ([[0, 0]], [1.1]), ([[16, 0]], [.8])):
            with self.subTest(points=points, scores=scores), self.assertRaises(ValueError):
                matcher.pack_pair(0, 1, points, [[0, 0]], scores, transforms)

    def test_bounded_best_scores_and_threshold(self):
        transforms = [{"resized_size": [16, 16], "scale_xy": [1, 1]}]*2
        points = [[0, 0], [1, 1], [2, 2]]
        with patch.dict(matcher.POLICY, maximum_matches_per_pair=1):
            pair = matcher.pack_pair(0, 1, points, points, [.1, .9, .3], transforms)
        self.assertEqual(pair["points0"], [[1., 1.]])
        self.assertEqual(pair["scores"], [.9])

    def test_bad_checkpoint_stops_before_model_import(self):
        with patch.object(matcher, "verify_checkpoint", side_effect=ValueError("bad hash")):
            with self.assertRaisesRegex(ValueError, "bad hash"):
                matcher.execute(request(), "unused")

    def test_plan_preparation_has_no_model_or_modal_side_effects(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"request.json"
            path.write_text(json.dumps(request()))
            with patch.object(pilot, "create_app", side_effect=AssertionError("must not build")):
                plan = pilot.prepare(path)
            self.assertEqual(plan["resources"]["timeout_seconds"], 180)
            self.assertEqual(plan["resources"]["retries"], 0)
            self.assertEqual(plan["request_sha256"], matcher.digest(path.read_bytes()))

    def test_changed_request_rejected_before_billable_work(self):
        with tempfile.TemporaryDirectory() as directory:
            path, plan_path, output = [Path(directory)/x for x in ("request.json", "plan.json", "out.json")]
            path.write_text(json.dumps(request()))
            plan = pilot.prepare(path); plan_path.write_text(json.dumps(plan))
            path.write_text(path.read_text()+" ")
            with patch.object(pilot, "create_app") as build, self.assertRaises(ValueError):
                pilot.execute(plan_path, plan["request_sha256"], output)
            build.assert_not_called()
            self.assertFalse(plan_path.with_suffix(".receipt.json").exists())

    def test_failure_receipt_blocks_unreviewed_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            path, plan_path, output = [Path(directory)/x for x in ("request.json", "plan.json", "out.json")]
            path.write_text(json.dumps(request()))
            plan = pilot.prepare(path); plan_path.write_text(json.dumps(plan))
            with patch.object(pilot, "create_app", side_effect=RuntimeError("build failure")):
                with self.assertRaises(RuntimeError):
                    pilot.execute(plan_path, plan["request_sha256"], output)
            self.assertEqual(json.loads(plan_path.with_suffix(".receipt.json").read_text())["status"],
                             "failed-or-uncertain")
            with patch.object(pilot, "create_app") as build, self.assertRaises(ValueError):
                pilot.execute(plan_path, plan["request_sha256"], output)
            build.assert_not_called()

    def test_clean_worker_import_before_mounted_project_is_available(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = Path(directory)/"learned_matcher_worker.py"
            worker.write_bytes(Path(matcher.__file__).with_name(worker.name).read_bytes())
            code = """
import builtins, sys
sys.path.insert(0, sys.argv[1])
import learned_matcher_worker
assert learned_matcher_worker.remote_worker.__module__ == 'learned_matcher_worker'
assert not any(name in sys.modules for name in ('learned_matcher', 'learned_matcher_pilot', 'numpy', 'torch', 'modal'))
original_import = builtins.__import__
def checked_import(name, *args, **kwargs):
    if name == 'learned_matcher':
        assert sys.path[0] == '/opt/eva-matcher'
        raise ImportError('expected-project-import-after-mount-path')
    return original_import(name, *args, **kwargs)
builtins.__import__ = checked_import
try:
    learned_matcher_worker.remote_worker({})
except ImportError as error:
    assert str(error) == 'expected-project-import-after-mount-path'
else:
    raise AssertionError('Worker failed to import its project implementation at entry')
print('isolated-import-and-entry-order-passed')
"""
            result = subprocess.run([sys.executable, "-I", "-S", "-c", code, directory],
                                    capture_output=True, text=True, timeout=10, check=True)
            self.assertIn("isolated-import-and-entry-order-passed", result.stdout)

    def test_client_deadline_cancels_before_app_context_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            path, plan_path, output = [Path(directory)/x for x in ("request.json", "plan.json", "out.json")]
            path.write_text(json.dumps(request()))
            plan = pilot.prepare(path); plan_path.write_text(json.dumps(plan))
            app, call = MagicMock(), MagicMock()
            app.app_id = "test-app"; call.object_id = "test-call"
            app.registered_functions["match"].spawn.return_value = call
            call.get.side_effect = TimeoutError("simulated container hydration timeout")
            def on_exit(*_):
                call.cancel.assert_called_once_with(terminate_containers=True)
                return False
            app.run.return_value.__exit__.side_effect = on_exit
            with patch.object(pilot, "create_app", return_value=app), self.assertRaises(TimeoutError):
                pilot.execute(plan_path, plan["request_sha256"], output)
            call.get.assert_called_once_with(timeout=240)
            self.assertFalse(output.exists())
            receipt = json.loads(plan_path.with_suffix(".receipt.json").read_text())
            self.assertIn("before context exit", receipt["cancellation"])
            self.assertEqual(receipt["status"], "failed-or-uncertain")

    def test_modal_registers_import_safe_entry_with_startup_bound(self):
        modal = MagicMock()
        with patch.dict(sys.modules, {"modal": modal}):
            app = pilot.create_app()
        options = app.function.call_args.kwargs
        self.assertEqual(options["startup_timeout"], 60)
        self.assertEqual(options["timeout"], 180)
        self.assertEqual(options["retries"], 0)
        entry = app.function.return_value.call_args.args[0]
        self.assertEqual(entry.__module__, "learned_matcher_worker")

    def test_return_boundary_strips_library_version_subclasses(self):
        from learned_matcher_worker import json_boundary
        import pickle
        class LibraryVersion(str):
            pass
        value = {"artifact": {"diagnostics": {"torch": LibraryVersion("2.5.1+cu124")}},
                 "acquisition": {"seconds": 1.25}}
        normalized = json_boundary(value)
        self.assertIs(type(normalized["artifact"]["diagnostics"]["torch"]), str)
        self.assertEqual(pickle.loads(pickle.dumps(normalized)), normalized)

    def test_return_boundary_rejects_nonfinite_and_executable_objects(self):
        from learned_matcher_worker import json_boundary
        for value in ({"score": float("nan")}, {"not_data": object()}):
            with self.subTest(value=value), self.assertRaises((ValueError, TypeError)):
                json_boundary(value)


if __name__ == "__main__":
    unittest.main()
