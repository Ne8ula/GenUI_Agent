"""Offline source admission: no model or real network execution."""
from email.message import Message
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch

import scan_source as scan


PLY = (b'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\n'
       b'property float z\nelement face 1\nproperty list uchar int vertex_indices\n'
       b'end_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n')


class Response(io.BytesIO):
    def __init__(self, url, data=b'', etag='"fixture-v1"'):
        super().__init__(data)
        self.url = url
        self.headers = Message()
        self.headers['Content-Length'] = str(len(data))
        self.headers['ETag'] = etag
        self.status = 200

    def geturl(self):
        return self.url


class ScanSourceTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)

    def response(self, request, **kwargs):
        return Response(request.full_url, PLY if request.full_url.endswith('.ply') else b'fixture')

    def plan(self):
        with patch('urllib.request.urlopen', side_effect=self.response):
            return scan.plan_source('45261631', 'Validation')

    def acquire(self):
        plan = self.plan()
        with patch('arkit_fetch._opener.open', side_effect=self.response):
            return scan.acquire_source(plan, self.root/'source')

    def test_source_acquisition_is_exclusive_and_bounded(self):
        plan = self.plan()
        self.assertEqual(plan['capture_id'], '45261631')
        self.assertEqual(plan['transfer_limit'], 128*1024**2)
        self.assertEqual(plan['attempts'], 1)
        self.assertFalse(any('depth.zip' in a['url'] or 'laser' in a['url'] for a in plan['assets']))
        with patch('arkit_fetch._opener.open', side_effect=self.response):
            manifest = scan.acquire_source(plan, self.root/'source')
            before = manifest.read_bytes()
            with self.assertRaises((ValueError, FileExistsError)):
                scan.acquire_source(plan, self.root/'source')
            self.assertEqual(manifest.read_bytes(), before)
        records = json.loads(before)['assets']
        self.assertEqual(next(a for a in records if a['role'] == 'mesh')['sha256'], hashlib.sha256(PLY).hexdigest())

    def test_cli_binds_exact_plan_bytes_and_one_attempt_directory(self):
        frozen = (Path(__file__).resolve().parents[2]/'docs/design/acceptance/teal-bedroom-acquisition-v1.plan.json').read_bytes()
        self.assertEqual(hashlib.sha256(frozen).hexdigest(), '367b183772cc894e2f6ba5f314ee9f111e379501327e7b539ceff2baf77ce4e0')
        altered = json.loads(frozen)
        altered['assets'][0]['etag'] = '"different-but-structurally-valid"'
        for name, data, output_name in [('etag', json.dumps(altered).encode(), 'scan-source-v1'),
                                         ('encoding', frozen+b' ', 'scan-source-v1'),
                                         ('retry', frozen, 'second-attempt')]:
            with self.subTest(name=name):
                base = self.root/name
                base.mkdir()
                plan_path = base/'plan.json'
                plan_path.write_bytes(data)
                approved = base/'.local/reconstruction/arkitscenes/45261631/scan-source-v1'
                if name == 'retry':
                    approved.mkdir(parents=True)
                    (approved/'acquisition.jsonl').write_text('retained failed attempt')
                output = approved.with_name(output_name)
                args = ['scan_source.py', 'fetch', '--plan', str(plan_path), '--output-dir', str(output)]
                requests = []
                def failed_request(request, **kwargs):
                    requests.append(request.full_url)
                    raise OSError('must not contact a source')
                with patch.object(scan, '__file__', str(base/'scripts/room_workflow/scan_source.py')), \
                        patch.object(sys, 'argv', args), patch('arkit_fetch._opener.open', side_effect=failed_request), \
                        self.assertRaises(SystemExit):
                    scan.main()
                self.assertEqual(requests, [])
                self.assertFalse(output.exists())
                if name == 'retry':
                    self.assertEqual((approved/'acquisition.jsonl').read_text(), 'retained failed attempt')

    def test_cli_acquisition_records_exact_plan_hash_and_cannot_replay(self):
        frozen = (Path(__file__).resolve().parents[2]/'docs/design/acceptance/teal-bedroom-acquisition-v1.plan.json').read_bytes()
        plan = json.loads(frozen)
        plan_path = self.root/'plan.json'
        plan_path.write_bytes(frozen)
        output = self.root/'.local/reconstruction/arkitscenes/45261631/scan-source-v1'
        requests = []
        def synthetic_response(request, **kwargs):
            asset = next(a for a in plan['assets'] if a['url'] == request.full_url)
            requests.append(request.full_url)
            self.assertEqual(request.get_header('If-match'), asset['etag'])
            return Response(request.full_url, b'x'*asset['bytes'], asset['etag'])
        args = ['scan_source.py', 'fetch', '--plan', str(plan_path), '--output-dir', str(output)]
        with patch.object(scan, '__file__', str(self.root/'scripts/room_workflow/scan_source.py')), \
                patch.object(sys, 'argv', args), patch('arkit_fetch._opener.open', side_effect=synthetic_response), \
                patch('sys.stdout', new=io.StringIO()):
            scan.main()
            before = (output/'acquisition.jsonl').read_bytes()
            with self.assertRaises(SystemExit):
                scan.main()
        self.assertEqual(len(requests), 7)
        self.assertEqual((output/'acquisition.jsonl').read_bytes(), before)
        rows = [json.loads(line) for line in before.splitlines()]
        self.assertEqual(rows[0]['plan_file_sha256'], '367b183772cc894e2f6ba5f314ee9f111e379501327e7b539ceff2baf77ce4e0')
        self.assertEqual(rows[-1]['event'], 'assets-complete')
        self.assertEqual(rows[-1]['bytes'], 26624267)
        self.assertEqual(json.loads((output/'manifest.json').read_bytes())['plan'], plan)

    def test_each_asset_has_a_separate_download_directory(self):
        manifest = self.acquire()
        saved = json.loads(manifest.read_bytes())
        self.assertEqual(saved['kind'], 'eva-scan-acquisition-receipt-v2')
        for asset in saved['assets']:
            folder = manifest.parent/asset['role']
            self.assertEqual([p.name for p in folder.iterdir()], [asset['path']])
            self.assertEqual(hashlib.sha256((folder/asset['path']).read_bytes()).hexdigest(), asset['sha256'])
        self.assertEqual(scan.inspect_source(manifest)['mesh']['faces'], 1)

    def test_incremental_receipt_precedes_network_and_preserves_completed_assets(self):
        plan = self.plan()
        output = self.root/'source'
        requests = []
        def fail_second(request, **kwargs):
            rows = [json.loads(line) for line in (output/'acquisition.jsonl').read_text().splitlines()]
            self.assertEqual(rows[0]['plan'], plan)
            self.assertEqual(rows[-1]['event'], 'asset-started')
            requests.append(request.full_url)
            if len(requests) == 2:
                raise OSError('fixture failure')
            return self.response(request)
        with patch('arkit_fetch._opener.open', side_effect=fail_second), self.assertRaisesRegex(OSError, 'fixture failure'):
            scan.acquire_source(plan, output)
        rows = [json.loads(line) for line in (output/'acquisition.jsonl').read_text().splitlines()]
        self.assertEqual([r['event'] for r in rows], ['started', 'asset-started', 'asset-complete', 'asset-started', 'failed'])
        self.assertEqual(rows[-1]['role'], 'metadata')
        self.assertEqual(rows[2]['sha256'], hashlib.sha256(b'fixture').hexdigest())
        self.assertEqual((output/'license'/'LICENSE.txt').read_bytes(), b'fixture')
        self.assertFalse((output/'manifest.json').exists())
        self.assertEqual(len(requests), 2)
        before = (output/'acquisition.jsonl').read_bytes()
        with self.assertRaises(FileExistsError):
            scan.acquire_source(plan, output)
        self.assertEqual((output/'acquisition.jsonl').read_bytes(), before)

    def test_legacy_flat_manifest_remains_inspectable(self):
        manifest = self.acquire()
        saved = json.loads(manifest.read_bytes())
        self.assertEqual(saved['kind'], 'eva-scan-acquisition-receipt-v2')
        for asset in saved['assets']:
            (manifest.parent/asset['role']/asset['path']).rename(manifest.parent/asset['path'])
        saved['kind'] = 'eva-scan-acquisition-receipt-v1'
        manifest.write_text(json.dumps(saved))
        self.assertEqual(scan.inspect_source(manifest)['mesh']['faces'], 1)

    def test_reject_foreign_catalog_and_authority_before_network(self):
        plan = self.plan()
        changes = [('capture_id', '42445021'), ('approved', True), ('transfer_limit', 128*1024**2+1)]
        for key, value in changes:
            bad = copy.deepcopy(plan); bad[key] = value
            with patch('arkit_fetch._opener.open') as fetch, self.assertRaises(ValueError):
                scan.acquire_source(bad, self.root/'bad')
            fetch.assert_not_called()
        for field, value in [('url', 'https://example.org/source.ply'), ('path', '../escape'),
                             ('bytes', 32*1024**2+1), ('etag', '')]:
            bad = copy.deepcopy(plan)
            mesh = next(a for a in bad['assets'] if a['role'] == 'mesh')
            mesh[field] = value
            with patch('arkit_fetch._opener.open') as fetch, self.assertRaises(ValueError):
                scan.acquire_source(bad, self.root/'bad')
            fetch.assert_not_called()
        with self.assertRaises(ValueError):
            scan.plan_source('42445021', 'Validation')

    def test_parent_traversal_rejected_before_acquisition(self):
        plan = self.plan()
        with patch('arkit_fetch._opener.open', side_effect=self.response), self.assertRaises(ValueError):
            scan.acquire_source(plan, self.root/'private'/'..'/'public')
        self.assertFalse((self.root/'public').exists())

    def test_inspection_uses_verified_mesh_snapshot(self):
        path = self.acquire()
        mesh_path = path.parent/'mesh'/'45261631_3dod_mesh.ply'
        original = scan.inspect_ply
        def swap_during_parse(mesh):
            mesh_path.write_bytes(PLY.replace(b'1 0 0', b'2 0 0'))
            try:
                return original(mesh)
            finally:
                mesh_path.write_bytes(PLY)
        with patch.object(scan, 'inspect_ply', side_effect=swap_during_parse):
            report = scan.inspect_source(path)
        self.assertEqual(report['mesh']['bounds'], [[0, 0, 0], [1, 1, 0]])

    def test_calibration_urls_match_previously_probed_dataset_routes(self):
        plan = self.plan()
        base = 'https://docs-assets.developer.apple.com/ml-research/datasets/arkitscenes/v1/raw/Validation/45261631/'
        for asset in plan['assets']:
            if asset['role'] in ('trajectory', 'depth-intrinsics', 'rgb-intrinsics'):
                self.assertEqual(asset['url'], base+asset['path'])

    def test_changed_etag_rejects_without_final_manifest(self):
        plan = self.plan()
        def changed(request, **kwargs):
            return Response(request.full_url, b'fixture', etag='"changed"')
        with patch('arkit_fetch._opener.open', side_effect=changed), self.assertRaises(ValueError):
            scan.acquire_source(plan, self.root/'source')
        self.assertFalse((self.root/'source'/'manifest.json').exists())
        rows = [json.loads(line) for line in (self.root/'source'/'acquisition.jsonl').read_text().splitlines()]
        self.assertEqual(rows[-1]['event'], 'failed')
        self.assertIn('Frozen download metadata changed', rows[-1]['message'])
        self.assertIn('changed', rows[-1]['message'])

    def test_interrupted_transfer_retains_part(self):
        plan = self.plan()
        class Interrupted(Response):
            def read(self, n=-1):
                if self.tell():
                    raise OSError('interrupted')
                return super().read(2)
        def interrupted(request, **kwargs):
            return Interrupted(request.full_url, b'fixture')
        with patch('arkit_fetch._opener.open', side_effect=interrupted), self.assertRaises(OSError):
            scan.acquire_source(plan, self.root/'source')
        self.assertEqual((self.root/'source'/'license'/'LICENSE.txt.part').read_bytes(), b'fi')
        rows = [json.loads(line) for line in (self.root/'source'/'acquisition.jsonl').read_text().splitlines()]
        self.assertEqual(rows[-1]['event'], 'failed')
        self.assertEqual(rows[-1]['partial_bytes'], 2)
        self.assertFalse((self.root/'source'/'manifest.json').exists())

    def test_inspect_reports_geometry_without_metric_admission(self):
        path = self.acquire()
        report = scan.inspect_source(path)
        self.assertEqual(report['capture_id'], '45261631')
        self.assertEqual(report['mesh']['vertices'], 3)
        self.assertEqual(report['mesh']['faces'], 1)
        self.assertEqual(report['mesh']['bounds'], [[0, 0, 0], [1, 1, 0]])
        self.assertEqual(report['status'], 'inspection-only')
        self.assertEqual(report['units'], 'unverified')
        self.assertNotIn('ready', report)

    def test_ply_header_caps_and_invalid_payload(self):
        for data in [PLY.replace(b'vertex 3', b'vertex 1000001'),
                     PLY.replace(b'face 1', b'face 2000001'),
                     PLY.replace(b'0 0 0', b'nan 0 0'),
                     PLY.replace(b'3 0 1 2', b'3 0 1 3'),
                     PLY.replace(b'3 0 1 2', b'3 0 0 2'),
                     PLY.replace(b'property float x', b'property list uchar float x'),
                     PLY + b'extra\n', b'ply\n'+b'x'*65536]:
            with self.subTest(data=data[:80]):
                with self.assertRaises(ValueError):
                    scan.inspect_ply(data)

    def test_changed_source_during_inspection_rejects(self):
        path = self.acquire()
        original = scan.inspect_ply
        def mutate(mesh):
            result = original(mesh)
            (path.parent/'mesh'/'45261631_3dod_mesh.ply').write_bytes(PLY.replace(b'1 0 0', b'2 0 0'))
            return result
        with patch.object(scan, 'inspect_ply', side_effect=mutate), self.assertRaises(ValueError):
            scan.inspect_source(path)


if __name__ == '__main__':
    unittest.main()
