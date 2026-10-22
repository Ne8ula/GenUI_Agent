"""Offline runner contract tests. Fake app only; never import Modal."""
import base64
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pilot


class FakeCall:
    object_id = "fc-offline-test"

    def __init__(self, result=None, error=None):
        self.result, self.error, self.cancelled = result, error, False

    def get(self):
        if self.error:
            raise self.error
        return self.result

    def cancel(self, terminate_containers=False):
        self.cancelled = terminate_containers


class FakeFunction:
    def __init__(self, call):
        self.call, self.payloads = call, []

    def spawn(self, payload):
        self.payloads.append(payload)
        return self.call


class FakeApp:
    app_id = "ap-offline-test"

    def __init__(self, call):
        self.registered_functions = {"run": FakeFunction(call)}
        self.entered, self.exited = False, False

    @contextmanager
    def run(self, detach=None):
        if detach is not False:
            raise AssertionError("Pilot must not detach")
        self.entered = True
        try:
            yield self
        finally:
            self.exited = True


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.request = self.directory / "request.json"
        self.plan_path = self.directory / "plan.json"
        self.output = self.directory / "result.json"
        self.receipt = self.directory / "plan.receipt.json"
        self.payload = {"version": 1, "operation": "analyze", "job_id": "offline-pilot",
                        "images": []}
        # Validation does not decode images. These bytes never enter real inference.
        for index in range(5):
            data = ("offline fixture " + str(index)).encode()
            self.payload["images"].append({
                "id": "photo" + str(index), "sha256": hashlib.sha256(data).hexdigest(),
                "data_base64": base64.b64encode(data).decode()})
        self.request.write_text(json.dumps(self.payload), encoding="utf-8")

    def plan(self):
        value = pilot.prepare(self.request)
        self.plan_path.write_text(json.dumps(value), encoding="utf-8")
        return value

    def result(self):
        return {"version": 1, "job_id": "offline-pilot", "status": "complete",
                "model_execution": "executed", "arms": {"A": {"status": "complete"}}}

    def test_prepare_never_imports_cloud_or_modal(self):
        original = __import__
        def guarded(name, *args, **kwargs):
            if name.split(".")[0] in ("modal", "cloud"):
                self.fail("Offline plan attempted a cloud import")
            return original(name, *args, **kwargs)
        with patch("builtins.__import__", side_effect=guarded):
            plan = pilot.prepare(self.request)
        self.assertEqual(plan["request_sha256"], pilot.sha(self.request.read_bytes()))
        self.assertEqual(len(plan["images"]), 5)
        self.assertEqual(plan["resources"]["function_timeout_seconds"], 600)
        self.assertIn("pilot.py", plan["source_sha256"])

    def test_plan_does_not_overwrite_existing_file(self):
        with patch("builtins.print"):
            self.assertEqual(pilot.main(["--request", str(self.request), "--plan", str(self.plan_path)]), 0)
        with self.assertRaises(FileExistsError):
            pilot.main(["--request", str(self.request), "--plan", str(self.plan_path)])

    def test_mask_or_reference_fields_rejected(self):
        self.payload["masks"] = {}
        self.request.write_text(json.dumps(self.payload), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "original RGB"):
            pilot.prepare(self.request)

    def test_wrong_hash_never_creates_receipt_or_app(self):
        self.plan()
        with patch.object(pilot, "create_reviewed_app") as create:
            with self.assertRaisesRegex(ValueError, "approved request hash"):
                pilot.execute(self.plan_path, "0" * 64, self.output)
            create.assert_not_called()
        self.assertFalse(self.receipt.exists())

    def test_changed_request_rejected_before_receipt(self):
        plan = self.plan()
        self.request.write_text(json.dumps(self.payload, indent=2), encoding="utf-8")
        with patch.object(pilot, "create_reviewed_app") as create:
            with self.assertRaisesRegex(ValueError, "changed"):
                pilot.execute(self.plan_path, plan["request_sha256"], self.output)
            create.assert_not_called()
        self.assertFalse(self.receipt.exists())

    def test_plan_config_override_rejected(self):
        plan = self.plan()
        plan["config"]["vggt_model"] = "facebook/VGGT-1B-Commercial"
        self.plan_path.write_text(json.dumps(plan), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "changed"):
            pilot.execute(self.plan_path, plan["request_sha256"], self.output)
        self.assertFalse(self.receipt.exists())

    def test_source_drift_rejected(self):
        plan = self.plan()
        plan["source_sha256"]["inference.py"] = "0" * 64
        self.plan_path.write_text(json.dumps(plan), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "changed"):
            pilot.execute(self.plan_path, plan["request_sha256"], self.output)
        self.assertFalse(self.receipt.exists())

    def test_profile_drift_rejected(self):
        plan = self.plan()
        plan["profile_sha256"] = "0" * 64
        self.plan_path.write_text(json.dumps(plan), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "changed"):
            pilot.execute(self.plan_path, plan["request_sha256"], self.output)

    def test_receipt_reserved_before_build_then_actual_result_saved(self):
        plan = self.plan()
        app = FakeApp(FakeCall(result=self.result()))
        def factory(config):
            receipt = json.loads(self.receipt.read_text())
            self.assertEqual(receipt["status"], "reserved-before-build")
            self.assertEqual(config, plan["config"])
            return app
        with patch.object(pilot, "create_reviewed_app", side_effect=factory):
            result = pilot.execute(self.plan_path, plan["request_sha256"], self.output)
        self.assertTrue(app.exited)
        self.assertEqual(json.loads(self.output.read_text()), result)
        receipt = json.loads(self.receipt.read_text())
        self.assertEqual(receipt["modal_app_id"], "ap-offline-test")
        self.assertEqual(receipt["modal_call_id"], "fc-offline-test")
        self.assertEqual(receipt["status"], "complete")
        self.assertEqual(receipt["result_sha256"], pilot.sha(self.output.read_bytes()))
        with patch.object(pilot, "create_reviewed_app") as create:
            with self.assertRaisesRegex(ValueError, "previous attempt"):
                pilot.execute(self.plan_path, plan["request_sha256"], self.output)
            create.assert_not_called()

    def test_failed_build_reserves_receipt_and_blocks_retry(self):
        plan = self.plan()
        with patch.object(pilot, "create_reviewed_app", side_effect=RuntimeError("fake build failure")):
            with self.assertRaises(RuntimeError):
                pilot.execute(self.plan_path, plan["request_sha256"], self.output)
        self.assertEqual(json.loads(self.receipt.read_text())["status"], "failed-or-uncertain")
        with self.assertRaisesRegex(ValueError, "previous attempt"):
            pilot.execute(self.plan_path, plan["request_sha256"], self.output)

    def test_interrupt_requests_cancel_and_exits_context(self):
        plan = self.plan()
        call = FakeCall(error=KeyboardInterrupt())
        app = FakeApp(call)
        with patch.object(pilot, "create_reviewed_app", return_value=app):
            with self.assertRaises(KeyboardInterrupt):
                pilot.execute(self.plan_path, plan["request_sha256"], self.output)
        self.assertTrue(call.cancelled)
        self.assertTrue(app.exited)
        receipt = json.loads(self.receipt.read_text())
        self.assertEqual(receipt["status"], "interrupted")
        self.assertIn("not independently verified", receipt["cancellation"])
        self.assertFalse(self.output.exists())

    def test_wrong_result_job_rejected(self):
        plan = self.plan()
        result = self.result()
        result["job_id"] = "different-job"
        call = FakeCall(result=result)
        with patch.object(pilot, "create_reviewed_app", return_value=FakeApp(call)):
            with self.assertRaisesRegex(ValueError, "invalid result"):
                pilot.execute(self.plan_path, plan["request_sha256"], self.output)
        self.assertTrue(call.cancelled)
        self.assertFalse(self.output.exists())

    def test_model_environment_isolated_and_restored(self):
        config = self.plan()["config"]
        contaminated = {"EVA_SAM2_SOURCE_REVISION": "a" * 40,
                        "EVA_SAM2_CHECKPOINT_REVISION": "b" * 40,
                        "EVA_VGGT_SOURCE_REVISION": "c" * 40,
                        "EVA_VGGT_MODEL": "facebook/VGGT-1B-Commercial"}
        with patch.dict(os.environ, contaminated):
            with pilot.isolated_model_environment(config) as set_pins:
                self.assertFalse(any(name in os.environ for name in pilot.ENV_NAMES))
                set_pins()
                self.assertNotIn("EVA_SAM2_SOURCE_REVISION", os.environ)
                self.assertEqual(os.environ["EVA_VGGT_MODEL"], config["vggt_model"])
            for name, value in contaminated.items():
                self.assertEqual(os.environ[name], value)

    def test_cli_requires_both_confirmation_and_exact_hash(self):
        self.plan()
        with patch.object(pilot, "execute") as execute:
            with self.assertRaises(SystemExit), patch("sys.stderr"):
                pilot.main(["--plan", str(self.plan_path), "--output", str(self.output)])
            with self.assertRaises(SystemExit), patch("sys.stderr"):
                pilot.main(["--plan", str(self.plan_path), "--output", str(self.output),
                            "--confirm-billable"])
            execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
