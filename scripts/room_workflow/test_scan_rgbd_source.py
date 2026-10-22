"""Frozen RGB-D acquisition against synthetic streams only; never extract ZIPs."""
import copy
from email.message import Message
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import scan_source

rgbd = None
if importlib.util.find_spec('scan_rgbd_source'):
    import scan_rgbd_source as rgbd

REPO = Path(__file__).resolve().parents[2]
FROZEN = REPO/'docs/design/acceptance/teal-bedroom-rgbd-v1.plan.json'


class Stream:
    def __init__(self, asset, fail=None):
        self.asset, self.count, self.fail = asset, 0, fail
        self.status = 200
        self.headers = Message()
        self.headers['Content-Length'] = str(asset['bytes'])
        self.headers['ETag'] = asset['etag']

    def geturl(self):
        return self.asset['url']

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, size=-1):
        if self.fail and self.count:
            if self.fail == 'truncated':
                return b''
            raise self.fail
        assert 0 < size <= min(1024**2, self.asset['bytes']-self.count)
        count = min(size, 7) if self.fail else size
        self.count += count
        return b'x'*count


class RGBDAcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(rgbd, 'Frozen RGB-D acquisition is not implemented')
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.plan_bytes = FROZEN.read_bytes()
        self.plan = json.loads(self.plan_bytes)
        self.plan_path = self.root/'plan.json'
        self.plan_path.write_bytes(self.plan_bytes)
        for record in [self.plan['header_receipt'], *self.plan['retained_inputs_for_later_separate_admission']]:
            target = self.root/record['path']
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((REPO/record['path']).read_bytes())
        self.output = self.root/self.plan['output_root']
        self.module_path = str(self.root/'scripts/room_workflow/scan_rgbd_source.py')
        self.requests = []

    def response(self, request, **kwargs):
        self.requests.append(request.full_url)
        asset = next(a for a in self.plan['assets'] if a['url'] == request.full_url)
        self.assertEqual(request.get_header('If-match'), asset['etag'])
        self.assertIsNone(request.get_header('Range'))
        role_root = self.output/asset['role']
        self.assertEqual(list(role_root.iterdir()), [])
        rows = self.journal()
        self.assertEqual(rows[-1]['event'], 'asset-started')
        return Stream(asset)

    def journal(self):
        return [json.loads(row) for row in (self.output/'acquisition.jsonl').read_bytes().splitlines()]

    def acquire(self):
        with patch.object(rgbd, '__file__', self.module_path):
            return rgbd.acquire_rgbd(self.plan_path, self.output)

    def test_full_stream_is_hashed_isolated_bound_and_cannot_replay(self):
        with patch('arkit_fetch._opener.open', side_effect=self.response):
            path = self.acquire()
            before = path.read_bytes()
            with self.assertRaises((FileExistsError, ValueError)):
                self.acquire()
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(path.read_bytes(), before)
        result = json.loads(before)
        self.assertEqual(result['kind'], 'eva-rgbd-acquisition-receipt-v1')
        self.assertEqual(result['plan'], self.plan)
        self.assertEqual(len(result['assets']), 2)
        for asset in result['assets']:
            target = self.output/asset['path']
            self.assertEqual(target.stat().st_size, asset['bytes'])
            with target.open('rb') as handle:
                self.assertEqual(hashlib.file_digest(handle, 'sha256').hexdigest(), asset['sha256'])
            self.assertEqual(list(target.parent.iterdir()), [target])
        self.assertEqual(self.journal()[0]['plan_file_sha256'],
                         'ddc5df0ab9dd2b85049fe6d5050da1bd622cf0361cb3b17d36125ce91745f951')
        self.assertEqual(self.journal()[-1]['bytes'], 144833824)
        self.assertLess(sum(p.stat().st_size for p in self.output.rglob('*') if p.is_file()), 167772160)
        with self.assertRaises(ValueError):
            scan_source._validate_plan(self.plan)

    def test_altered_scope_encoding_or_destination_never_contacts_source(self):
        variants = []
        for key, value in [('capture_id', '42445021'), ('approval', 'approved')]:
            plan = copy.deepcopy(self.plan); plan[key] = value
            variants.append(json.dumps(plan).encode())
        for key, value in [('url', 'https://example.test/replacement'), ('path', '../escape'),
                           ('bytes', 1), ('etag', '"changed"')]:
            plan = copy.deepcopy(self.plan); plan['assets'][0][key] = value
            variants.append(json.dumps(plan).encode())
        variants.append(self.plan_bytes+b' ')
        for data in variants:
            self.plan_path.write_bytes(data)
            with patch('arkit_fetch._opener.open', side_effect=self.response), self.assertRaises(ValueError):
                self.acquire()
            self.assertFalse(self.output.exists())
        self.plan_path.write_bytes(self.plan_bytes)
        for output in [self.output.with_name('retry'), self.output.parent/'..'/'scan-rgbd-source-v1']:
            with patch.object(rgbd, '__file__', self.module_path), \
                    patch('arkit_fetch._opener.open', side_effect=self.response), self.assertRaises(ValueError):
                rgbd.acquire_rgbd(self.plan_path, output)
        self.assertEqual(self.requests, [])

    def test_changed_retained_binding_rejects_before_network(self):
        for record in [self.plan['header_receipt'], *self.plan['retained_inputs_for_later_separate_admission']]:
            path = self.root/record['path']
            original = path.read_bytes()
            path.write_bytes(original+b' ')
            with patch('arkit_fetch._opener.open', side_effect=self.response), self.assertRaises(ValueError):
                self.acquire()
            path.write_bytes(original)
        self.assertEqual(self.requests, [])
        self.assertFalse(self.output.exists())

    def test_existing_attempt_root_is_never_reused(self):
        self.output.mkdir(parents=True)
        (self.output/'acquisition.jsonl').write_text('retained interruption')
        with patch('arkit_fetch._opener.open', side_effect=self.response), self.assertRaises((ValueError, FileExistsError)):
            self.acquire()
        self.assertEqual(self.requests, [])
        self.assertEqual((self.output/'acquisition.jsonl').read_text(), 'retained interruption')

    def test_header_failure_stops_before_second_asset_and_records_rejection(self):
        def changed(request, **kwargs):
            result = self.response(request, **kwargs)
            result.headers.replace_header('ETag', '"changed"')
            return result
        with patch('arkit_fetch._opener.open', side_effect=changed), self.assertRaises(ValueError):
            self.acquire()
        self.assertEqual(len(self.requests), 1)
        self.assertFalse((self.output/'manifest.json').exists())
        self.assertFalse((self.output/'confidence').exists())
        self.assertIn('changed', self.journal()[-1]['message'])

    def test_truncation_or_cancellation_retains_partial_and_blocks_replay(self):
        for failure in ['truncated', OSError('connection failed'), KeyboardInterrupt()]:
            with self.subTest(failure=str(failure)):
                # Each subcase owns a different synthetic repository, never a live retry directory.
                self.setUp()
                def interrupted(request, **kwargs):
                    result = self.response(request, **kwargs)
                    result.fail = failure
                    return result
                with patch('arkit_fetch._opener.open', side_effect=interrupted), \
                        self.assertRaises((ValueError, OSError, KeyboardInterrupt)):
                    self.acquire()
                self.assertEqual(len(self.requests), 1)
                self.assertEqual((self.output/'depth/lowres_depth.zip.part').read_bytes(), b'x'*7)
                self.assertEqual(self.journal()[-1]['partial_bytes'], 7)
                self.assertFalse((self.output/'manifest.json').exists())
                with self.assertRaises((ValueError, FileExistsError)):
                    self.acquire()

    def test_low_disk_preserves_failure_without_network(self):
        with patch('shutil.disk_usage', return_value=type('Disk', (), {'free': 1})()), \
                patch('arkit_fetch._opener.open', side_effect=self.response), self.assertRaises(ValueError):
            self.acquire()
        self.assertEqual(self.requests, [])
        self.assertFalse((self.output/'manifest.json').exists())
        self.assertEqual(self.journal()[-1]['event'], 'failed')


if __name__ == '__main__':
    unittest.main()
