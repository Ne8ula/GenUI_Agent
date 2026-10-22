import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import completion_client as client


def envelope():
    return {"version": 1, "analysis": {}, "request": {"operation": "analyze"}, "review": {}}


class CompletionClientTests(unittest.TestCase):
    def test_exact_envelope_rejects_paths_and_runtime_overrides(self):
        for extra in ("analysis_path", "command", "voxel", "skip_validation", "authorize"):
            value = envelope(); value[extra] = True
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                client.validate_envelope(value)
        value = envelope(); value["request"]["operation"] = "reconstruct"
        with self.assertRaises(ValueError):
            client.validate_envelope(value)

    def test_reader_rejects_duplicate_and_nonfinite_json(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/"input.json"
            for content in ('{"version":1,"version":2}', '{"x":NaN}'):
                path.write_text(content)
                with self.assertRaises(ValueError):
                    client.load_bounded(path)

    def test_read_and_write_size_caps(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(client, "MAX_BYTES", 16):
            path = Path(temp)/"input.json"
            path.write_bytes(b"x"*17)
            with self.assertRaises(ValueError):
                client.load_bounded(path)
            with self.assertRaises(ValueError):
                client.write_exclusive(Path(temp)/"output", b"x"*17)
            self.assertFalse((Path(temp)/"output").exists())

    def test_existing_response_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            response = Path(temp)/"response.json"; response.write_bytes(b"keep")
            with self.assertRaises(FileExistsError):
                client.run(Path(temp)/"missing.json", response)
            self.assertEqual(response.read_bytes(), b"keep")

    def test_timeout_does_not_publish_response(self):
        with tempfile.TemporaryDirectory() as temp:
            request, response = Path(temp)/"input.json", Path(temp)/"output.json"
            request.write_text(json.dumps(envelope()))
            with patch.object(client.subprocess, "run", side_effect=subprocess.TimeoutExpired("worker", 10)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    client.run(request, response, 10)
            self.assertFalse(response.exists())

    def test_bad_deadline_rejected_before_execution(self):
        for timeout in (0, 181, True, float("inf")):
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                client.run("unused", "unused", timeout)

    def test_validation_failure_prevents_numeric_conversion(self):
        with tempfile.TemporaryDirectory() as temp:
            request, response = Path(temp)/"input.json", Path(temp)/"output.json"
            request.write_text(json.dumps(envelope()))
            with patch.object(client, "validate_contract", side_effect=ValueError("wrong source")), \
                    patch("complete_candidate.complete_from_fields") as convert:
                with self.assertRaises(ValueError):
                    client.worker(request, response)
                convert.assert_not_called()
            self.assertFalse(response.exists())


if __name__ == "__main__":
    unittest.main()
