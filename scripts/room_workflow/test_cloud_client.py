import contextlib
import base64
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import subprocess
import types
import unittest
from unittest.mock import Mock, patch

import cloud_client
import inference
from PIL import Image


class CloudClientDeadlineTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.request = Path(self.directory.name) / "request.json"
        self.output = Path(self.directory.name) / "output.json"
        self.receipt = self.request.with_suffix(".receipt.json")
        self.request.write_text(json.dumps({"job_id": "test"}))
        self.modal = Mock()
        self.call = self.modal.Function.from_name.return_value.spawn.return_value
        self.call.object_id = "fc-test"
        self.args = ["--request", str(self.request), "--output", str(self.output), "--confirm-billable"]

    def invoke(self):
        with patch.dict(sys.modules, {"modal": self.modal}), patch.object(inference, "validate_payload"), \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return cloud_client.main(self.args)

    def read_receipt(self):
        return json.loads(self.receipt.read_text())

    def test_timeout_cancels_once_and_preserves_uncertainty_without_retry(self):
        self.call.get.side_effect = TimeoutError("deadline")
        self.assertEqual(self.invoke(), 1)
        self.call.get.assert_called_once_with(timeout=630)
        self.call.cancel.assert_called_once_with(terminate_containers=True)
        receipt = self.read_receipt()
        self.assertEqual(receipt["status"], "result-unavailable")
        self.assertIn("termination unverified", receipt["cancellation"])
        self.assertFalse(self.output.exists())
        with self.assertRaises(SystemExit):
            self.invoke()
        self.assertEqual(self.modal.Function.from_name.return_value.spawn.call_count, 1)

    def test_sdk_specific_timeout_and_failed_cancel_remain_unknown(self):
        class SDKTimeout(Exception):
            pass
        self.call.get.side_effect = SDKTimeout("deadline")
        self.call.cancel.side_effect = RuntimeError("network")
        self.assertEqual(self.invoke(), 1)
        receipt = self.read_receipt()
        self.assertEqual(receipt["wait_error_type"], "SDKTimeout")
        self.assertEqual(receipt["cancellation_error_type"], "RuntimeError")
        self.assertIn("termination unknown", receipt["cancellation"])

    def test_keyboard_interrupt_requests_cancellation(self):
        self.call.get.side_effect = KeyboardInterrupt()
        self.assertEqual(self.invoke(), 130)
        self.call.cancel.assert_called_once_with(terminate_containers=True)
        self.assertEqual(self.read_receipt()["wait_error_type"], "KeyboardInterrupt")

    def test_late_artifact_is_preserved_but_not_claimed_as_success(self):
        self.call.get.side_effect = TimeoutError()
        self.call.cancel.side_effect = lambda **_: self.output.write_text('{"late":true}')
        self.assertEqual(self.invoke(), 1)
        self.assertEqual(self.output.read_text(), '{"late":true}')
        self.assertEqual(self.read_receipt()["status"], "result-unavailable")

    def test_recovered_completion_during_cancel_is_not_demoted(self):
        self.call.get.side_effect = TimeoutError()
        def recovered(**_):
            receipt = self.read_receipt()
            receipt.update(status="complete", result_sha256="a"*64)
            self.receipt.write_text(json.dumps(receipt))
        self.call.cancel.side_effect = recovered
        self.assertEqual(self.invoke(), 1)  # This waiter did not receive a result.
        self.assertEqual(self.read_receipt()["status"], "complete")
        self.assertNotIn("cancellation", self.read_receipt())

    def test_explicit_cancel_preserves_recorded_completion_without_sdk_call(self):
        self.receipt.write_text(json.dumps({"modal_call_id": "fc-test", "status": "complete"}))
        with patch.dict(sys.modules, {"modal": self.modal}), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cloud_client.main(["--cancel-receipt", str(self.receipt)]), 0)
        self.modal.FunctionCall.from_id.assert_not_called()
        self.assertEqual(self.read_receipt()["status"], "complete")

    def test_explicit_failed_cancel_is_not_reported_as_requested(self):
        self.receipt.write_text(json.dumps({"modal_call_id": "fc-test", "status": "submitted"}))
        self.modal.FunctionCall.from_id.return_value.cancel.side_effect = RuntimeError("network")
        with patch.dict(sys.modules, {"modal": self.modal}), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cloud_client.main(["--cancel-receipt", str(self.receipt)]), 1)
        self.assertEqual(self.read_receipt()["status"], "cancellation-request-failed")
        self.assertIn("termination unknown", self.read_receipt()["cancellation"])

    def test_definitive_complete_partial_and_failed_outputs_are_preserved(self):
        for status in ("complete", "partial", "failed"):
            with self.subTest(status=status):
                self.receipt.unlink(missing_ok=True)
                self.output.unlink(missing_ok=True)
                self.call.get.return_value = {"status": status, "model_execution": "executed"}
                self.assertEqual(self.invoke(), 1 if status == "failed" else 0)
                self.assertEqual(json.loads(self.output.read_text())["status"], status)
                self.assertEqual(self.read_receipt()["status"], status)
        self.call.cancel.assert_not_called()

    def test_existing_recovered_output_is_not_overwritten_after_wait(self):
        def finished(**_):
            self.output.write_text('{"recovered":true}')
            return {"status": "complete", "model_execution": "executed"}
        self.call.get.side_effect = finished
        with self.assertRaises(FileExistsError):
            self.invoke()
        self.assertEqual(self.output.read_text(), '{"recovered":true}')
        self.call.cancel.assert_not_called()


class CloudClientRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.request = Path(self.directory.name)/"request.json"
        self.receipt = Path(self.directory.name)/"request.receipt.json"
        self.output = Path(self.directory.name)/"recovery.json"
        images = []
        for index in range(5):
            handle = io.BytesIO()
            Image.new("RGB", (32, 32), (index, 5, 10)).save(handle, format="PNG")
            data = handle.getvalue()
            images.append({"id": f"photo-{index}", "sha256": cloud_client.hashlib.sha256(data).hexdigest(),
                           "data_base64": base64.b64encode(data).decode()})
        self.payload = {"version": 1, "operation": "analyze", "job_id": "fixture", "images": images}
        self.request.write_text(json.dumps(self.payload))
        self.saved = {"version": 1, "job_id": "fixture", "modal_call_id": "fc-test",
                      "request_sha256": cloud_client.hashlib.sha256(self.request.read_bytes()).hexdigest(),
                      "status": "result-unavailable", "retry_policy": "none"}
        self.receipt.write_text(json.dumps(self.saved))
        self.modal = Mock()
        class SDKTimeout(Exception):
            pass
        class FunctionTimeout(SDKTimeout):
            pass
        self.timeout, self.function_timeout = SDKTimeout, FunctionTimeout
        self.modal.exception = types.SimpleNamespace(TimeoutError=SDKTimeout)
        self.call = self.modal.FunctionCall.from_id.return_value
        self.result = {"version": 1, "job_id": "fixture", "status": "failed",
                       "model_execution": "not-run", "arms": {},
                       "error": {"type": "FixtureFailure", "message": "Synthetic offline failure"}}

    def recover(self):
        with patch.dict(sys.modules, {"modal": self.modal}), contextlib.redirect_stdout(io.StringIO()):
            return cloud_client.recover_existing(self.receipt, self.request, self.output)

    def test_existing_only_failure_result_is_validated_without_changing_evidence(self):
        receipt_before, request_before = self.receipt.read_bytes(), self.request.read_bytes()
        self.call.get.return_value = self.result
        envelope = self.recover()
        self.assertEqual(envelope["status"], "result-available")
        self.assertEqual(envelope["result"], self.result)
        self.modal.FunctionCall.from_id.assert_called_once_with("fc-test")
        self.call.get.assert_called_once_with(timeout=0)
        self.call.cancel.assert_not_called()
        self.modal.Function.from_name.assert_not_called()
        self.assertEqual(self.receipt.read_bytes(), receipt_before)
        self.assertEqual(self.request.read_bytes(), request_before)

    def test_exact_sdk_poll_timeout_is_pending_not_cancelled(self):
        self.call.get.side_effect = self.timeout()
        self.assertEqual(self.recover()["status"], "pending")
        self.call.cancel.assert_not_called()

    def test_function_timeout_transport_and_interrupt_are_unavailable_not_settled(self):
        for exception in (self.function_timeout(), TimeoutError(), RuntimeError(), KeyboardInterrupt()):
            with self.subTest(exception=type(exception).__name__):
                self.output.unlink(missing_ok=True)
                self.call.get.side_effect = exception
                result = self.recover()
                self.assertEqual(result["status"], "unavailable")
                self.assertIsNone(result["result"])
        self.call.cancel.assert_not_called()

    def test_binding_and_authority_mismatches_fail_before_sdk(self):
        variants = [{**self.saved, "job_id": "other"}, {**self.saved, "request_sha256": "0"*64},
                    {**self.saved, "modal_call_id": "https://other"}, {**self.saved, "version": True},
                    {**self.saved, "status": "permission-granted"}, {**self.saved, "authorize": True}]
        for value in variants:
            with self.subTest(value=value):
                self.receipt.write_text(json.dumps(value))
                with self.assertRaises(ValueError):
                    self.recover()
        self.modal.FunctionCall.from_id.assert_not_called()

    def test_existing_output_blocks_before_sdk_and_terminal_poll_is_idempotent(self):
        self.saved["status"] = "failed"
        self.receipt.write_text(json.dumps(self.saved))
        self.call.get.return_value = self.result
        first = self.recover()
        with self.assertRaises(ValueError):
            self.recover()
        self.assertEqual(self.call.get.call_count, 1)
        self.output = self.output.with_name("another-recovery.json")
        second = self.recover()
        self.assertEqual(first, second)
        self.assertEqual(json.loads(self.receipt.read_text())["status"], "failed")

    def test_cancelled_receipt_never_turns_retrieved_output_into_cancellation_success(self):
        self.saved.update(status="cancellation-requested", cancellation="requested; remote termination unverified")
        self.receipt.write_text(json.dumps(self.saved))
        self.call.get.return_value = self.result
        result = self.recover()
        self.assertTrue(result["cancellation_requested"])
        self.assertEqual(result["status"], "result-available")
        self.assertEqual(json.loads(self.receipt.read_text())["status"], "cancellation-requested")

    def test_wrong_job_and_forged_geometry_rejected_by_actual_result_contract(self):
        for result in ({**self.result, "job_id": "other"},
                       {**self.result, "status": "complete", "model_execution": "executed"}):
            self.call.get.return_value = result
            with self.assertRaisesRegex(ValueError, "validation"):
                self.recover()
            self.assertFalse(self.output.exists())

    def test_complete_source_hashes_checked_by_actual_contract(self):
        code = """import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const {makeSyntheticAnalysis}=await import(pathToFileURL(process.argv[1]));
process.stdout.write(JSON.stringify(makeSyntheticAnalysis(JSON.parse(fs.readFileSync(0,'utf8')))));"""
        completed = subprocess.run(["node", "--input-type=module", "-e", code,
                                    str(Path(cloud_client.__file__).with_name("test-fixtures.mjs"))],
                                   input=json.dumps(self.payload), capture_output=True, text=True, check=True)
        valid = json.loads(completed.stdout)
        self.saved["status"] = "complete"
        self.receipt.write_text(json.dumps(self.saved))
        self.call.get.return_value = valid
        self.assertEqual(self.recover()["result"]["status"], "complete")
        self.output = self.output.with_name("forged.json")
        invalid = copy.deepcopy(valid)
        invalid["original_input_hashes"][0]["sha256"] = "0"*64
        self.call.get.return_value = invalid
        with self.assertRaisesRegex(ValueError, "validation"):
            self.recover()
        self.assertFalse(self.output.exists())

    def test_definitive_receipt_cannot_be_downgraded_by_conflicting_result(self):
        self.saved["status"] = "complete"
        self.receipt.write_text(json.dumps(self.saved))
        self.call.get.return_value = self.result
        with self.assertRaisesRegex(ValueError, "contradicts"):
            self.recover()
        self.assertEqual(json.loads(self.receipt.read_text())["status"], "complete")
        self.assertFalse(self.output.exists())

    def test_changed_evidence_during_poll_rejected(self):
        def pending(**_):
            self.receipt.write_text(json.dumps({**self.saved, "status": "cancellation-requested"}))
            raise self.timeout()
        self.call.get.side_effect = pending
        with self.assertRaisesRegex(ValueError, "changed"):
            self.recover()
        self.assertFalse(self.output.exists())

    def test_result_budget_and_duplicate_json_reject(self):
        self.call.get.return_value = self.result
        with patch.object(cloud_client, "MAX_RESULT_BYTES", 10), self.assertRaisesRegex(ValueError, "budget"):
            self.recover()
        self.receipt.write_text('{"version":1,"version":1}')
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.recover()


if __name__ == "__main__":
    unittest.main()
