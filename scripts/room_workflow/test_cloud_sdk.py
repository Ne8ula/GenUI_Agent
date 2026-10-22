"""Offline actual-SDK definition test; no App.run, deployment or inference."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest import mock


class WorkerConfigurationTests(unittest.TestCase):
    def test_operator_configuration_is_separate_from_payload(self):
        import cloud
        config = {"operator": "test-only"}
        payload = {"config": "untrusted"}
        with mock.patch.dict("os.environ", {"EVA_ROOM_WORKER_CONFIG": json.dumps(config)}):
            with mock.patch("inference.execute", return_value={"status": "test-only"}) as execute:
                self.assertEqual(cloud.run_worker(payload), {"status": "test-only"})
                execute.assert_called_once_with(payload, config)

    def test_missing_operator_configuration_has_no_fallback(self):
        import cloud
        with mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(KeyError):
                cloud.run_worker({})


@unittest.skipUnless(importlib.util.find_spec("modal"), "Modal absent in this test environment")
class CloudDefinitionTests(unittest.TestCase):
    def test_worker_is_module_level_and_registered_under_client_name(self):
        from pilot import create_reviewed_app
        profile = json.loads((Path(__file__).parent / "research-profile.json").read_text())
        config = {key: profile[key] for key in
                  ("vggt_source_revision", "vggt_checkpoint_revision", "vggt_model")}
        app = create_reviewed_app(config)
        from cloud import run_worker
        self.assertNotIn("<locals>", run_worker.__qualname__)
        self.assertEqual(list(app.registered_functions), ["run"])
        self.assertIsNone(app.app_id, "Defining the worker must not start a remote app")


if __name__ == "__main__":
    unittest.main()
