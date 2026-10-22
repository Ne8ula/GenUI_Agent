"""Synthetic checks for the metadata-only Modal correspondence investigation."""
import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch

worker = None
if importlib.util.find_spec('scan_correspondence'):
    import scan_correspondence as worker


class CorrespondenceTests(unittest.TestCase):
    def inspect(self, data, targets=('56036.835',)):
        self.assertIsNotNone(worker, 'Missing timestamp-only diagnostic')
        return worker.inspect_timestamps(data, list(targets))

    def test_brackets_explain_rejection_without_selecting_or_interpolating_pose(self):
        data = b'56036.80143575 0 0 0 1 2 3\n56036.901 0 0 0 4 5 6\n'
        result = self.inspect(data)
        self.assertFalse(result['source_admitted'])
        self.assertEqual(result['status'], 'diagnostic-only')
        self.assertEqual(result['trajectory_sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(result['views'], [{'timestamp': '56036.835',
            'before': '56036.80143575', 'after': '56036.901',
            'bracket_span_seconds': '0.09956425',
            'nearest_timestamps': ['56036.80143575'], 'nearest_residual_seconds': '0.03356425',
            'within_existing_5ms_gate': False}])

    def test_exact_boundary_tie_and_missing_bracket_are_explicit(self):
        data = b'1.000 0 0 0 0 0 0\n1.010 0 0 0 0 0 0\n'
        result = self.inspect(data, ('0.995', '1.005', '1.010', '1.020'))
        views = result['views']
        self.assertEqual([v['within_existing_5ms_gate'] for v in views], [True, False, True, False])
        self.assertEqual(views[1]['nearest_timestamps'], ['1.000', '1.010'])
        self.assertIsNone(views[0]['before'])
        self.assertIsNone(views[0]['bracket_span_seconds'])
        self.assertIsNone(views[3]['after'])
        self.assertEqual(views[2]['before'], '1.010')
        self.assertEqual(views[2]['after'], '1.010')

    def test_unsorted_rows_preserve_exact_timestamp_spelling(self):
        result = self.inspect(b'1.01000000 0 0 0 0 0 0\n1.000 0 0 0 0 0 0\n', ('1.009',))
        self.assertEqual(result['views'][0]['nearest_timestamps'], ['1.01000000'])
        self.assertEqual(result['rows'], 2)

    def test_malformed_or_duplicate_trajectory_and_targets_reject(self):
        self.assertIsNotNone(worker, 'Missing timestamp-only diagnostic')
        cases = [b'', b'1 0 0 0 0 0\n', b'1 0 0 0 nan 0 0\n',
                 b'1 0 0 0 0 0 0\n1.0 0 0 0 0 0 0\n',
                 b'NaN 0 0 0 0 0 0\n', b'1 0 0 0 10001 0 0\n', b'\xff',
                 b'1e999999 0 0 0 0 0 0\n', b'1'*1025, b'x'*(2*1024**2+1)]
        for data in cases:
            with self.subTest(data=data[:60]), self.assertRaises(ValueError):
                worker.inspect_timestamps(data, ['1.000'])
        for targets in ([], ['1.000']*2, ['NaN'], ['1e9'], [1.0], ['1.000']*7):
            with self.subTest(targets=targets), self.assertRaises(ValueError):
                worker.inspect_timestamps(b'1 0 0 0 0 0 0\n', targets)


cloud = None
if importlib.util.find_spec('scan_correspondence_cloud'):
    import scan_correspondence_cloud as cloud


class CloudTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(cloud, 'Missing bounded Modal diagnostic route')
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.enterContext(patch.object(cloud, 'DATA_ROOT', self.root))
        self.data = b'1.000 0 0 0 0 0 0\n2.000 0 0 0 0 0 0\n'
        manifest = {'assets': [{'role': 'trajectory', 'path': 'lowres_wide.traj',
            'bytes': len(self.data), 'sha256': hashlib.sha256(self.data).hexdigest()}]}
        source = self.root/'scan-source-v1'
        (source/'trajectory').mkdir(parents=True)
        (source/'trajectory/lowres_wide.traj').write_bytes(self.data)
        raw = json.dumps(manifest).encode()
        (source/'manifest.json').write_bytes(raw)
        self.enterContext(patch.object(cloud, 'MANIFESTS', {'scan-source-v1': hashlib.sha256(raw).hexdigest()}))
        directory = self.root/'scan-rgbd-directory-v1'
        directory.mkdir()
        raw = json.dumps({'views': [{'timestamp': float(i+1)} for i in range(6)]}).encode()
        (directory/'manifest.json').write_bytes(raw)
        self.enterContext(patch.object(cloud, 'DIRECTORY_SHA256', hashlib.sha256(raw).hexdigest()))

    def plan_file(self):
        plan = cloud.prepare()
        path = self.root/'plan.json'
        raw = json.dumps(plan).encode()
        path.write_bytes(raw)
        return path, hashlib.sha256(raw).hexdigest()

    def test_planning_reads_only_pinned_metadata_not_trajectory(self):
        (self.root/'scan-source-v1/trajectory/lowres_wide.traj').unlink()
        plan = cloud.prepare()
        self.assertFalse(plan['execution_authorized'])
        self.assertEqual(plan['targets'], ['1.000', '2.000', '3.000', '4.000', '5.000', '6.000'])
        self.assertEqual(plan['trajectory']['sha256'], hashlib.sha256(self.data).hexdigest())
        self.assertEqual(plan['resources']['gpu'], None)
        self.assertEqual(plan['resources']['max_containers'], 1)

    def test_unapproved_changed_plan_or_input_reject_before_cloud(self):
        path, digest = self.plan_file()
        with patch.object(cloud, 'create', side_effect=AssertionError('cloud before approval')):
            for budget, fingerprint in [(None, digest), (2, digest), (1, '0'*64)]:
                with self.subTest(budget=budget), self.assertRaises(ValueError):
                    cloud.execute(path, fingerprint, budget)
            (self.root/'scan-source-v1/trajectory/lowres_wide.traj').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                cloud.execute(path, digest, 1)
        self.assertFalse((self.root/'scan-correspondence-modal-v1').exists())

    def test_build_failure_consumes_fixed_attempt_and_copied_plan_cannot_retry(self):
        path, digest = self.plan_file()
        with patch.object(cloud, 'create', side_effect=RuntimeError('build fixture')):
            with self.assertRaises(RuntimeError):
                cloud.execute(path, digest, 1)
        output = self.root/'scan-correspondence-modal-v1'
        self.assertEqual(json.loads((output/'receipt.json').read_bytes())['status'], 'failed-or-uncertain')
        copied = self.root/'copied.json'
        copied.write_bytes(path.read_bytes())
        with self.assertRaises(FileExistsError):
            cloud.execute(copied, digest, 1)

    def test_stream_failure_retains_evidence_and_stops_only_owned_app_before_exit(self):
        plan = cloud.prepare()
        raw = json.dumps(worker.inspect_timestamps(self.data, plan['targets'])).encode()
        for failure in ('none', 'extra', 'authority', 'timeout', 'stop'):
            with self.subTest(failure=failure):
                events = []
                output = self.root/failure
                output.mkdir()
                @asynccontextmanager
                async def running(**kwargs):
                    try:
                        yield
                    finally:
                        events.append('exit')
                async def stream(*args):
                    try:
                        if failure == 'timeout':
                            await asyncio.Event().wait()
                        value = raw
                        if failure == 'authority':
                            changed = json.loads(raw)
                            changed['source_admitted'] = True
                            value = json.dumps(changed).encode()
                        yield value
                        if failure == 'extra':
                            yield raw
                    finally:
                        events.append('closed')
                def stop(app_id):
                    events.append(('stop', app_id))
                    if failure == 'stop':
                        raise RuntimeError('unconfirmed')
                    return {'app_id': app_id, 'state': 'stopped', 'tasks': 0}
                app = SimpleNamespace(app_id='ap-'+'a'*22, run=SimpleNamespace(aio=running))
                fn = SimpleNamespace(remote_gen=SimpleNamespace(aio=stream))
                receipt = {}
                with patch.object(cloud, 'stop_app', side_effect=stop), \
                        patch.dict(cloud.RESOURCES, client_timeout_seconds=.01):
                    task = cloud.run(app, fn, self.data, plan, output, receipt, lambda: None)
                    if failure == 'none':
                        asyncio.run(task)
                        self.assertEqual(receipt['status'], 'diagnostic-returned-and-stopped')
                    else:
                        with self.assertRaises((ValueError, RuntimeError, TimeoutError)):
                            asyncio.run(task)
                        self.assertNotEqual(receipt.get('status'), 'diagnostic-returned-and-stopped')
                self.assertIn(('stop', app.app_id), events)
                self.assertLess(events.index(('stop', app.app_id)), events.index('exit'))
                self.assertEqual((output/'returned-report.json').exists(), failure != 'timeout')
                self.assertFalse((output/'manifest.json').exists())

    def test_remote_entry_imports_and_runs_with_only_shipped_worker_and_stdlib(self):
        directory = self.root/'image'
        directory.mkdir()
        module = cloud.capture.__module__
        for name in {module, 'scan_correspondence'}:
            (directory/(name+'.py')).write_bytes((cloud.ROOT/(name+'.py')).read_bytes())
        script = ('import sys,importlib,hashlib; sys.path.insert(0,sys.argv[1]); '
                  'm=importlib.import_module(sys.argv[2]); data=b"1.000 0 0 0 0 0 0\\n"; '
                  'print(list(m.capture(data,{"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()},["1.000"])))')
        result = subprocess.run([sys.executable, '-I', '-S', '-c', script, str(directory), module],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('diagnostic-only', result.stdout)

    def test_startup_failure_records_and_stops_owned_app(self):
        path, digest = self.plan_file()
        @asynccontextmanager
        async def startup(**kwargs):
            raise RuntimeError('startup fixture')
            yield
        app = SimpleNamespace(app_id='ap-'+'b'*22, run=SimpleNamespace(aio=startup))
        stopped = []
        def stop(app_id):
            stopped.append(app_id)
            return {'app_id': app_id, 'state': 'stopped', 'tasks': 0}
        with patch.object(cloud, 'create', return_value=(app, None)), patch.object(cloud, 'stop_app', side_effect=stop):
            with self.assertRaisesRegex(RuntimeError, 'startup fixture'):
                cloud.execute(path, digest, 1)
        receipt = json.loads((self.root/'scan-correspondence-modal-v1/receipt.json').read_bytes())
        self.assertEqual(stopped, [app.app_id])
        self.assertEqual(receipt['app_id'], app.app_id)
        self.assertEqual(receipt['cleanup']['state'], 'stopped')
        self.assertEqual(receipt['status'], 'failed-or-uncertain')

    def test_actual_sdk_definition_is_cpu_only_and_result_is_inline_cbor(self):
        if importlib.util.find_spec('modal') is None:
            self.skipTest('Requires retained Modal client environment')
        import modal
        from modal._serialization import serialize_data_format
        from modal_proto import api_pb2
        options = []
        register = modal.App.function
        def spy(app, *args, **kwargs):
            options.append(kwargs)
            return register(app, *args, **kwargs)
        with patch.object(modal.App, 'function', spy):
            app, fn = cloud.create()
        self.assertNotIn('gpu', options[0])
        self.assertNotIn('retries', options[0])
        for key in ('block_network', 'restrict_modal_access', '_experimental_restrict_output', 'single_use_containers'):
            self.assertTrue(options[0][key])
        self.assertEqual(options[0]['memory'], (512, 512))
        self.assertEqual(options[0]['timeout'], 30)
        plan = cloud.prepare()
        for record in cloud.capture(self.data, plan['trajectory'], plan['targets']):
            self.assertLess(len(serialize_data_format(record, api_pb2.DATA_FORMAT_CBOR)), 2*1024**2)
        self.assertTrue(callable(app.run.aio))
        unopened = fn.remote_gen.aio(self.data, plan['trajectory'], plan['targets'])
        asyncio.run(unopened.aclose())

    def test_capture_binds_bytes_and_returns_one_small_non_authoritative_report(self):
        plan = cloud.prepare()
        records = list(cloud.capture(self.data, plan['trajectory'], plan['targets']))
        self.assertEqual(len(records), 1)
        self.assertLessEqual(len(records[0]), 65536)
        report = json.loads(records[0])
        self.assertFalse(report['source_admitted'])
        self.assertEqual(report['status'], 'diagnostic-only')
        with self.assertRaises(ValueError):
            list(cloud.capture(self.data+b' ', plan['trajectory'], plan['targets']))


if __name__ == '__main__':
    unittest.main()
