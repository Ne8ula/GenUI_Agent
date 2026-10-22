"""Offline planning and no-spend rejection tests; no cloud/model calls."""
import asyncio
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import worldmirror_cloud as cloud
from test_worldmirror_worker import request
from pilot import encoded, sha


class WorldMirrorCloudTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.request = self.root/'request.json'
        self.request.write_bytes(encoded(request()))
        self.plan_path = self.root/'plan.json'
        self.events = []
        def stop(app_id):
            self.assertEqual(app_id, 'ap-'+'x'*22)
            self.events.append('stop')
            return {'app_id': app_id, 'state': 'stopped', 'tasks': 0}
        stopper = patch.object(cloud, 'stop_app', stop, create=True)
        stopper.start(); self.addCleanup(stopper.stop)

    def plan(self):
        plan = cloud.prepare(self.request)
        self.plan_path.write_bytes(encoded(plan))
        return plan, sha(self.plan_path.read_bytes())

    def test_plan_is_offline_bound_and_deterministic(self):
        plan, digest = self.plan()
        self.assertEqual(plan, cloud.prepare(self.request))
        self.assertEqual(plan['request_sha256'], sha(self.request.read_bytes()))
        self.assertEqual(plan['resources']['retries'], 0)
        self.assertTrue(plan['resources']['block_network'])
        self.assertEqual(plan['resources']['max_containers'], 1)
        self.assertEqual(plan['resources']['gpu'], 'A100-40GB')
        self.assertIn('worldmirror_worker.py', plan['implementation_sha256'])
        self.assertEqual(len(plan['checkpoint_files']), 2)
        self.assertFalse(plan['execution_authorized'])
        self.assertFalse(self.request.with_suffix('.worldmirror-receipt.json').exists())
        self.assertEqual(len(digest), 64)

    def test_refuses_missing_approval_changed_plan_or_request_before_cloud(self):
        plan, digest = self.plan()
        with patch.object(cloud, 'create_app', side_effect=AssertionError('No cloud construction allowed')):
            for license_ack, dollars, expected in [(False, 3, 'license'), (True, None, 'budget'), (True, 2, 'budget')]:
                with self.subTest(license=license_ack, dollars=dollars), self.assertRaisesRegex(ValueError, expected):
                    cloud.execute(self.plan_path, digest, self.root/'out', license_acknowledged=license_ack, approved_dollars=dollars)
            changed = copy.deepcopy(plan); changed['resources']['retries'] = 1
            self.plan_path.write_bytes(encoded(changed))
            with self.assertRaisesRegex(ValueError, 'changed'):
                cloud.execute(self.plan_path, sha(self.plan_path.read_bytes()), self.root/'out', license_acknowledged=True, approved_dollars=3)
            self.plan_path.write_bytes(encoded(plan))
            value = request(); value['job_id'] = 'other'; self.request.write_bytes(encoded(value))
            with self.assertRaisesRegex(ValueError, 'changed'):
                cloud.execute(self.plan_path, digest, self.root/'out', license_acknowledged=True, approved_dollars=3)
        self.assertFalse(self.request.with_suffix('.worldmirror-receipt.json').exists())

    def test_build_failure_retains_receipt_and_prevents_automatic_retry(self):
        _, digest = self.plan()
        with patch.object(cloud, 'create_app', side_effect=RuntimeError('synthetic build failure')):
            with self.assertRaisesRegex(RuntimeError, 'synthetic'):
                cloud.execute(self.plan_path, digest, self.root/'out', license_acknowledged=True, approved_dollars=3)
        receipt_path = self.request.with_suffix('.worldmirror-receipt.json')
        receipt = json.loads(receipt_path.read_text())
        self.assertEqual(receipt['status'], 'failed-or-uncertain')
        self.assertEqual(receipt['plan_sha256'], digest)
        self.assertEqual(receipt['retry_policy'], 'none')
        before = receipt_path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'Existing'):
            cloud.execute(self.plan_path, digest, self.root/'out', license_acknowledged=True, approved_dollars=3)
        self.assertEqual(receipt_path.read_bytes(), before)

    def test_wait_failure_stops_before_stream_close_and_context_exit(self):
        from test_worldmirror_transport import records
        for partial in (False, True):
            with self.subTest(partial=partial), patch.dict(cloud.RESOURCES, client_timeout_seconds=.01):
                # Separate inputs retain the request-bound one-attempt guard.
                self.request = self.root/f'request-{partial}.json'
                self.request.write_bytes(encoded(request()))
                _, digest = self.plan()
                self.events.clear()
                async def stalled():
                    try:
                        if partial:
                            for record in records()[:3]:
                                yield record
                        await asyncio.Event().wait()
                    finally:
                        self.events.append('receiver-cancelled')
                with patch.object(cloud, 'create_app', return_value=self.returned(source=stalled)), self.assertRaises(TimeoutError):
                    cloud.execute(self.plan_path, digest, self.root/f'out-{partial}', license_acknowledged=True, approved_dollars=3)
                self.assertEqual(self.events, ['receiver-cancelled', 'stop', 'close', 'exit'])
                receipt = json.loads(self.request.with_suffix('.worldmirror-receipt.json').read_text())
                self.assertIsNone(receipt['modal_call_id'])
                self.assertEqual(receipt['status'], 'failed-or-uncertain')
                self.assertEqual(receipt['cleanup']['state'], 'stopped')
                if partial:
                    self.assertEqual(receipt['received_bytes']['fields'], 1048576)
                    self.assertTrue((self.root/f'out-{partial}'/'raw-fields.npz.partial').exists())

    def test_unconfirmed_stop_preserves_artifacts_but_blocks_admission(self):
        from test_worldmirror_transport import bundle
        _, digest = self.plan()
        with patch.object(cloud, 'create_app', return_value=self.returned(bundle())), \
                patch.object(cloud, 'stop_app', side_effect=RuntimeError('unconfirmed stop')), \
                self.assertRaisesRegex(RuntimeError, 'unconfirmed stop'):
            cloud.execute(self.plan_path, digest, self.root/'out', license_acknowledged=True, approved_dollars=3)
        receipt = json.loads(self.request.with_suffix('.worldmirror-receipt.json').read_text())
        self.assertEqual(receipt['cleanup']['state'], 'unconfirmed')
        self.assertEqual(receipt['artifact_status'], 'returned-unadmitted')
        self.assertEqual(self.events, ['close', 'exit'])

    def test_sdk_definition_disallows_pickle_results(self):
        try:
            import modal
        except ImportError:
            self.skipTest('Run this check with the existing genrc-client Modal environment')
        plan, _ = self.plan()
        actual = modal.App.function
        options = []
        def register(app, *args, **kwargs):
            options.append(kwargs)
            return actual(app, *args, **kwargs)
        with patch.object(modal.App, 'function', register):
            cloud.create_app(plan)
        self.assertEqual(options[0]['name'], 'capture')
        self.assertTrue(options[0].get('_experimental_restrict_output'))
        self.assertTrue(options[0]['block_network'])
        self.assertTrue(options[0]['restrict_modal_access'])

    def test_copied_plan_cannot_reuse_an_attempt(self):
        _, digest = self.plan()
        copied = self.root/'copied-plan.json'; copied.write_bytes(self.plan_path.read_bytes())
        with patch.object(cloud, 'create_app', side_effect=RuntimeError('synthetic failure')):
            with self.assertRaises(RuntimeError):
                cloud.execute(self.plan_path, digest, self.root/'out', license_acknowledged=True, approved_dollars=3)
            with self.assertRaisesRegex(ValueError, 'Existing'):
                cloud.execute(copied, digest, self.root/'out2', license_acknowledged=True, approved_dollars=3)

    def returned(self, bundle=None, source=None):
        # Replace only the paid stream/context and stop boundary, not local admission.
        from test_worldmirror_transport import records, stream
        events = self.events
        class Stream:
            def __init__(self):
                self.inner = source() if source else stream(records(bundle))
            def __aiter__(self):
                return self
            async def __anext__(self):
                return await anext(self.inner)
            async def aclose(self):
                events.append('close')
                await self.inner.aclose()
        class Context:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                events.append('exit')
        return SimpleNamespace(app_id='ap-'+'x'*22,
            run=SimpleNamespace(aio=lambda **kwargs: Context()),
            registered_functions={'capture': SimpleNamespace(remote_gen=SimpleNamespace(aio=lambda request: Stream()))})

    def test_rejected_return_keeps_bounded_raw_evidence(self):
        _, digest = self.plan()
        bundle = {'manifest': b'not-json', 'fields': b'not-npz', 'device_name': 'synthetic',
                  'peak_cuda_bytes': 0, 'dependencies': 'synthetic-only'}
        output = self.root/'out'
        with patch.object(cloud, 'create_app', return_value=self.returned(bundle)), self.assertRaises(ValueError):
            cloud.execute(self.plan_path, digest, output, license_acknowledged=True, approved_dollars=3)
        self.assertEqual((output/'manifest.json').read_bytes(), b'not-json')
        self.assertEqual((output/'raw-fields.npz').read_bytes(), b'not-npz')
        receipt = json.loads(self.request.with_suffix('.worldmirror-receipt.json').read_text())
        self.assertEqual(receipt['status'], 'failed-or-uncertain')
        self.assertEqual(receipt['artifact_status'], 'returned-unadmitted')
        self.assertEqual(receipt['fields_sha256'], sha(b'not-npz'))

    def test_success_admits_real_synthetic_bundle_and_retains_hashes(self):
        from test_worldmirror_candidate import fixture
        fixture_root = self.root/'fixture'; fixture_root.mkdir()
        *_, paths = fixture(fixture_root)
        bundle = {'manifest': (paths[2]/'manifest.json').read_bytes(),
                  'fields': (paths[2]/'raw-fields.npz').read_bytes(), 'device_name': 'synthetic',
                  'peak_cuda_bytes': 0, 'dependencies': 'synthetic-only'}
        _, digest = self.plan()
        output = self.root/'out'
        with patch.object(cloud, 'create_app', return_value=self.returned(bundle)):
            receipt = cloud.execute(self.plan_path, digest, output, license_acknowledged=True, approved_dollars=3)
        self.assertEqual(receipt['status'], 'captured')
        self.assertEqual(receipt['artifact_status'], 'admitted')
        self.assertEqual(receipt['cleanup']['state'], 'stopped')
        self.assertEqual(receipt['cleanup']['tasks'], 0)
        self.assertEqual(self.events, ['stop', 'close', 'exit'])
        self.assertEqual(receipt['fields_sha256'], sha(bundle['fields']))
        self.assertEqual((output/'raw-fields.npz').read_bytes(), bundle['fields'])

    def test_oversized_return_is_rejected_before_disk_write(self):
        _, digest = self.plan()
        bundle = {'manifest': b'x'*(128*1024+1), 'fields': b'not-npz', 'device_name': 'synthetic',
                  'peak_cuda_bytes': 0, 'dependencies': 'synthetic-only'}
        output = self.root/'out'
        with patch.object(cloud, 'create_app', return_value=self.returned(bundle)), self.assertRaisesRegex(ValueError, 'resource contract'):
            cloud.execute(self.plan_path, digest, output, license_acknowledged=True, approved_dollars=3)
        self.assertFalse(output.exists())

    def test_existing_output_is_not_overwritten(self):
        _, digest = self.plan()
        output = self.root/'out'; output.mkdir(); (output/'keep').write_bytes(b'keep')
        with self.assertRaisesRegex(ValueError, 'Existing'):
            cloud.execute(self.plan_path, digest, output, license_acknowledged=True, approved_dollars=3)
        self.assertEqual((output/'keep').read_bytes(), b'keep')


if __name__ == '__main__':
    unittest.main()
