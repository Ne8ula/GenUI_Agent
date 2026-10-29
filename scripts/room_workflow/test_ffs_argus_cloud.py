import asyncio
import copy
from contextlib import asynccontextmanager
from types import SimpleNamespace
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name('ffs_argus_cloud.py')


def load():
    spec = importlib.util.spec_from_file_location('ffs_argus_cloud', MODULE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


async def stream(rows):
    for row in rows:
        yield row


def results(m):
    from PIL import Image
    import io
    buffer = io.BytesIO()
    Image.new('RGB', (32, 16), (20, 40, 60)).save(buffer, 'JPEG')
    preview = buffer.getvalue()
    report = {'kind': 'eva-ffs-argus-preflight-result-v1', 'source': m.SOURCE,
        'input': {'width': 20288, 'height': 10144, 'sha256': 'a' * 64, 'bytes': 208807902,
                  'projection_verified': False,
                  'meaning': '2:1 raster only; spherical coverage and missing regions require review'},
        'preview': {'bytes': len(preview), 'sha256': hashlib.sha256(preview).hexdigest()},
        'source_admitted': False, 'inference_run': False}
    return [('preview.jpg', preview), ('report.json', json.dumps(report).encode())]


class ArgusCloudTests(unittest.TestCase):
    def test_plan_is_offline_source_bound_and_cannot_authorize_execution(self):
        m = load()
        with patch('urllib.request.urlopen', side_effect=AssertionError('No network while planning')):
            plan = m.prepare()
        self.assertFalse(plan['execution_authorized'])
        self.assertIsNone(plan['resources']['gpu'])
        self.assertEqual(plan['source']['bytes'], 208807902)
        self.assertEqual(plan['source']['end'] - plan['source']['start'], 208807902)
        self.assertEqual(plan['source']['name'], 'th_0021-0040/scan/th_0028/pano_th_0028_coul_full.png')
        self.assertEqual(plan['resources']['max_containers'], 1)
        self.assertEqual(plan['resources']['retries'], 0)
        self.assertFalse(plan['resources']['provider_enforced_dollar_cap'])
        plan['source']['url'] = 'https://invalid.example/'
        self.assertNotEqual(m.prepare()['source']['url'], plan['source']['url'])

    def test_modified_plans_or_missing_exact_approval_never_reach_cloud(self):
        m = load()
        plan = m.prepare()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'plan.json'
            for dollars, digest, mutate in [(0, None, False), (1, '0' * 64, False), (1, None, True)]:
                candidate = copy.deepcopy(plan)
                if mutate:
                    candidate['source']['url'] = 'https://invalid.example/'
                raw = json.dumps(candidate).encode()
                path.write_bytes(raw)
                approved = digest or hashlib.sha256(raw).hexdigest()
                with self.subTest(dollars=dollars, mutate=mutate), patch.object(m, 'OUTPUT', Path(tmp) / 'output'), patch.object(m, 'create', side_effect=AssertionError('No cloud')), self.assertRaises(ValueError):
                    m.execute(path, approved, dollars)
                self.assertFalse((Path(tmp) / 'output').exists())

    def test_verified_preview_is_retained_but_not_admitted_or_registered(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            report = asyncio.run(m.receive(stream(results(m)), output))
            self.assertFalse(report['source_admitted'])
            self.assertFalse(report['inference_run'])
            self.assertEqual({p.name for p in output.iterdir()}, {'preview.jpg', 'report.json'})
            with self.assertRaises(FileExistsError):
                asyncio.run(m.receive(stream(results(m)), output))

    def test_unsafe_incomplete_changed_or_oversized_results_are_rejected(self):
        m = load()
        good = results(m)
        cases = [[('../bad.jpg', b'x')], good[:1], [good[0], good[0]],
            [('preview.jpg', b'x'), good[1]], [('preview.jpg', b'x' * (1024**2 + 1))]]
        for key, value in [('source_admitted', True), ('inference_run', True), ('authority', 'approved')]:
            report = json.loads(good[1][1]); report[key] = value
            cases.append([good[0], ('report.json', json.dumps(report).encode())])
        for key, value in [('width', 10307), ('projection_verified', True), ('sha256', 'invalid')]:
            report = json.loads(good[1][1]); report['input'][key] = value
            cases.append([good[0], ('report.json', json.dumps(report).encode())])
        for rows in cases:
            with self.subTest(rows=[r[0] for r in rows]), tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
                asyncio.run(m.receive(stream(rows), Path(tmp)))

    def test_worker_module_imports_from_flat_container_layout(self):
        m = load()
        module = sys.modules[m.worker.__module__]
        source = Path(module.__file__).read_text(encoding='utf-8')
        namespace = {'__name__': module.__name__, '__file__': '/root/' + Path(module.__file__).name}
        with patch('urllib.request.urlopen', side_effect=AssertionError('No network')):
            try:
                exec(compile(source, namespace['__file__'], 'exec'), namespace)
            except IndexError as error:
                self.fail(f'Worker import depends on repository parent directories: {error}')
            with self.assertRaisesRegex(ValueError, 'Unreviewed source'):
                list(namespace['worker']({'url': 'https://invalid.example/'}))

    def test_worker_rejects_other_sources_before_acquisition(self):
        m = load()
        with patch('urllib.request.urlopen', side_effect=AssertionError('No network')), self.assertRaises(ValueError):
            list(m.worker({'url': 'https://invalid.example/'}))

    def test_truncated_preview_pixels_fail_even_with_matching_transport_hash(self):
        m = load()
        rows = results(m)
        damaged = rows[0][1][:-8]
        report = json.loads(rows[1][1])
        report['preview'] = {'bytes': len(damaged), 'sha256': hashlib.sha256(damaged).hexdigest()}
        with tempfile.TemporaryDirectory() as tmp, self.assertRaises((ValueError, OSError)):
            asyncio.run(m.receive(stream([('preview.jpg', damaged), ('report.json', json.dumps(report).encode())]), Path(tmp)))

    def test_failed_build_is_reserved_once_and_not_retried(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            path, output = Path(tmp) / 'plan.json', Path(tmp) / 'output'
            raw = json.dumps(m.prepare()).encode(); path.write_bytes(raw)
            with patch.object(m, 'OUTPUT', output), patch.object(m, 'create', side_effect=RuntimeError('Build failed')):
                with self.assertRaisesRegex(RuntimeError, 'Build failed'):
                    m.execute(path, hashlib.sha256(raw).hexdigest(), 1)
                receipt = json.loads((output / 'receipt.json').read_bytes())
                self.assertEqual(receipt['status'], 'failed-or-uncertain')
                self.assertFalse(receipt['source_admitted'])
                with self.assertRaises(FileExistsError):
                    m.execute(path, hashlib.sha256(raw).hexdigest(), 1)

    def test_cancellation_stops_only_owned_app_and_marks_uncertainty(self):
        m = load()
        @asynccontextmanager
        async def context(**kwargs):
            yield
        async def pending(source):
            await asyncio.Future()
            yield
        owned = 'ap-' + 'x' * 22
        app = SimpleNamespace(app_id=owned, run=SimpleNamespace(aio=context))
        fn = SimpleNamespace(remote_gen=SimpleNamespace(aio=pending))
        receipt = {}
        stopped = []
        def stop(app_id):
            stopped.append(app_id)
            return {'app_id': app_id, 'state': 'stopped', 'tasks': 0}
        with tempfile.TemporaryDirectory() as tmp, patch('worldmirror_transfer_probe.stop_app', side_effect=stop):
            with self.assertRaises(TimeoutError):
                asyncio.run(asyncio.wait_for(m.run(app, fn, Path(tmp), receipt, lambda: None), .01))
        self.assertEqual(stopped, [owned])
        self.assertEqual(receipt['cleanup']['state'], 'stopped')
        self.assertEqual(receipt['status'], 'failed-or-uncertain')

    def test_unconfirmed_cleanup_does_not_report_success(self):
        m = load()
        @asynccontextmanager
        async def context(**kwargs):
            yield
        app = SimpleNamespace(app_id='ap-' + 'x' * 22, run=SimpleNamespace(aio=context))
        fn = SimpleNamespace(remote_gen=SimpleNamespace(aio=lambda source: stream(results(m))))
        receipt = {}
        with tempfile.TemporaryDirectory() as tmp, patch('worldmirror_transfer_probe.stop_app', side_effect=RuntimeError('Unconfirmed stop')):
            with self.assertRaisesRegex(RuntimeError, 'Unconfirmed stop'):
                asyncio.run(m.run(app, fn, Path(tmp), receipt, lambda: None))
        self.assertEqual(receipt['status'], 'failed-or-uncertain')
        self.assertEqual(receipt['cleanup']['state'], 'unconfirmed')

    @unittest.skipUnless(importlib.util.find_spec('modal'), 'Use the existing Modal client environment')
    def test_real_sdk_constructs_without_submission(self):
        m = load()
        for regions in (False, True):
            with self.subTest(regions=regions):
                app, fn = m.create(regions=regions)
                self.assertIsNone(app.app_id)
                self.assertIsNotNone(fn)


def region_results(m):
    rows = results(m)
    report = json.loads(rows[1][1])
    report['kind'] = 'eva-ffs-argus-regions-result-v1'
    report['input']['sha256'] = m.SOURCE_SHA256
    report['input']['padding'] = {
        'width': 20288, 'height': 10144, 'row_convention': 'half-open native rows',
        'candidate_padding_rows': [8500, 10144], 'unclassified_rows': [0, 8500],
        'projection_verified': False, 'source_admitted': False,
        'unsupported_geometry': 'unknown; no geometry emitted',
    }
    return [rows[0], ('report.json', json.dumps(report).encode())]


class ArgusRegionCloudTests(unittest.TestCase):
    def test_region_plan_is_distinct_source_bound_offline_and_unapproved(self):
        m = load()
        with patch('urllib.request.urlopen', side_effect=AssertionError('No network')):
            plan = m.prepare(regions=True)
        self.assertEqual(plan['kind'], 'eva-ffs-argus-regions-plan-v1')
        self.assertEqual(plan['expected_input_sha256'],
                         '7729a11c25a7f72c56c1b88ad4071c848078474611f2778fa9acc8c3bc654708')
        self.assertFalse(plan['execution_authorized'])
        self.assertIsNone(plan['resources']['gpu'])
        self.assertNotEqual(m.OUTPUT, m.REGIONS_OUTPUT)
        self.assertEqual(plan['resources']['max_containers'], 1)
        self.assertEqual(plan['resources']['retries'], 0)

    def test_native_rows_are_retained_without_admission(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            report = asyncio.run(m.receive(stream(region_results(m)), Path(tmp), regions=True))
            self.assertEqual(report['input']['padding']['candidate_padding_rows'], [8500, 10144])
            self.assertFalse(report['source_admitted'])
            self.assertFalse(report['inference_run'])

    def test_no_band_and_all_white_reports_never_admit_source(self):
        m = load()
        for candidate, unclassified in [(None, [0, 10144]), ([0, 10144], None)]:
            rows = region_results(m)
            report = json.loads(rows[1][1])
            report['input']['padding'].update(candidate_padding_rows=candidate,
                                              unclassified_rows=unclassified)
            rows[1] = ('report.json', json.dumps(report).encode())
            with self.subTest(candidate=candidate), tempfile.TemporaryDirectory() as tmp:
                received = asyncio.run(m.receive(stream(rows), Path(tmp), regions=True))
                self.assertEqual(received['input']['padding'], report['input']['padding'])
                self.assertIs(received['source_admitted'], False)
                self.assertIs(received['inference_run'], False)

    def test_changed_hash_mixed_stage_or_unsafe_padding_is_rejected(self):
        m = load()
        good = region_results(m)
        bad = [results(m)]
        mutations = [('input', 'sha256', 'c' * 64),
                     ('padding', 'candidate_padding_rows', [8500, 10145]),
                     ('padding', 'candidate_padding_rows', [True, 10144]),
                     ('padding', 'candidate_padding_rows', 'missing'),
                     ('padding', 'candidate_padding_rows', [0, 10144]),
                     ('padding', 'unclassified_rows', [0, 8501]),
                     ('padding', 'unclassified_rows', [False, 8500]),
                     ('padding', 'height', 10144.0),
                     ('padding', 'source_admitted', True),
                     ('padding', 'source_admitted', 0),
                     ('padding', 'projection_verified', True),
                     ('padding', 'authority', 'approved')]
        for where, key, value in mutations:
            report = json.loads(good[1][1])
            target = report['input'] if where == 'input' else report['input']['padding']
            target[key] = value
            bad.append([good[0], ('report.json', json.dumps(report).encode())])
        for rows in bad:
            with self.subTest(report=rows[1][1]), tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(ValueError):
                    asyncio.run(m.receive(stream(rows), Path(tmp), regions=True))
        with tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
            asyncio.run(m.receive(stream(good), Path(tmp)))

    def test_old_approval_cannot_launch_region_inspection(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            path, output = Path(tmp) / 'plan.json', Path(tmp) / 'regions'
            raw = json.dumps(m.prepare()).encode()
            path.write_bytes(raw)
            with patch.object(m, 'REGIONS_OUTPUT', output), patch.object(m, 'create', side_effect=AssertionError('No cloud')):
                with self.assertRaises(ValueError):
                    m.execute(path, hashlib.sha256(raw).hexdigest(), 1, regions=True)
            self.assertFalse(output.exists())

    def test_region_build_failure_reserves_new_attempt_without_touching_old_output(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            path, old, output = Path(tmp) / 'plan.json', Path(tmp) / 'old', Path(tmp) / 'regions'
            old.mkdir()
            (old / 'receipt.json').write_bytes(b'preserved')
            raw = json.dumps(m.prepare(regions=True)).encode()
            path.write_bytes(raw)
            with patch.object(m, 'OUTPUT', old), patch.object(m, 'REGIONS_OUTPUT', output), patch.object(m, 'create', side_effect=RuntimeError('Build failed')):
                with self.assertRaisesRegex(RuntimeError, 'Build failed'):
                    m.execute(path, hashlib.sha256(raw).hexdigest(), 1, regions=True)
                self.assertEqual((old / 'receipt.json').read_bytes(), b'preserved')
                self.assertEqual(json.loads((output / 'receipt.json').read_bytes())['status'], 'failed-or-uncertain')
                with self.assertRaises(FileExistsError):
                    m.execute(path, hashlib.sha256(raw).hexdigest(), 1, regions=True)

    def test_worker_enforces_prior_source_hash_before_returning_regions(self):
        m = load()
        info = json.loads(results(m)[1][1])['input']
        with patch('ffs_fetch.stream_member', return_value=m.SOURCE['bytes']), patch('ffs_argus.inspect_panorama', return_value=(info, b'preview')):
            with self.assertRaisesRegex(ValueError, 'hash'):
                list(m.worker(m.SOURCE.copy(), regions=True))

    def test_region_run_passes_mode_and_stops_only_its_owned_app(self):
        m = load()
        @asynccontextmanager
        async def context(**kwargs):
            yield
        async def remote(source, *, regions):
            self.assertEqual(source, m.SOURCE)
            self.assertIs(regions, True)
            for row in region_results(m):
                yield row
        owned = 'ap-' + 'r' * 22
        app = SimpleNamespace(app_id=owned, run=SimpleNamespace(aio=context))
        fn = SimpleNamespace(remote_gen=SimpleNamespace(aio=remote))
        receipt = {}
        stopped = []
        def stop(app_id):
            stopped.append(app_id)
            return {'state': 'stopped', 'tasks': 0}
        with tempfile.TemporaryDirectory() as tmp, patch('worldmirror_transfer_probe.stop_app', side_effect=stop):
            asyncio.run(m.run(app, fn, Path(tmp), receipt, lambda: None, regions=True))
        self.assertEqual(stopped, [owned])
        self.assertEqual(receipt['status'], 'regions-returned-and-stopped-needs-review')
        self.assertFalse(receipt['report']['source_admitted'])


if __name__ == '__main__':
    unittest.main()
