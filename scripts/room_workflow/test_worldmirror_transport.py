"""Bounded artifact transport; no model, credentials or cloud execution."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import worldmirror_transport as transport

FIELDS = b'field-bytes-' * 100000


def bundle():
    return {'manifest': b'not-json', 'fields': FIELDS, 'device_name': 'synthetic',
            'peak_cuda_bytes': 0, 'dependencies': 'synthetic-only'}


def records(value=None):
    value = bundle() if value is None else value
    header = {'kind': 'start', **{key: value[key] for key in ('device_name', 'peak_cuda_bytes', 'dependencies')}}
    for key in ('manifest', 'fields'):
        header[key] = {'bytes': len(value[key]), 'sha256': hashlib.sha256(value[key]).hexdigest()}
    result = [header]
    for key in ('manifest', 'fields'):
        for index, offset in enumerate(range(0, len(value[key]), 1048576)):
            result.append({'kind': 'chunk', 'name': key, 'index': index, 'data': value[key][offset:offset+1048576]})
    return result + [{'kind': 'complete'}]


async def stream(items):
    for item in items:
        yield item


class TransportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)/'out'
        self.receipt = {}

    async def receive(self, items):
        await transport.receive_bundle(stream(items), self.output, self.receipt, lambda: None)

    async def test_multichunk_round_trip_matches_independent_protocol_and_hashes(self):
        value = bundle()
        self.assertEqual(list(transport.stream_bundle(value)), records(value))
        await self.receive(records(value))
        self.assertEqual((self.output/'manifest.json').read_bytes(), b'not-json')
        self.assertEqual((self.output/'raw-fields.npz').read_bytes(), FIELDS)
        self.assertEqual(self.receipt['artifact_status'], 'returned-unadmitted')
        self.assertEqual(self.receipt['fields_sha256'], hashlib.sha256(FIELDS).hexdigest())
        self.assertEqual(sorted(path.name for path in self.output.iterdir()), ['manifest.json', 'raw-fields.npz'])

    async def test_rejected_header_creates_no_output(self):
        for change in ('oversized', 'authority', 'boolean', 'negative', 'digest', 'device', 'dependencies'):
            header = records()[0]
            if change == 'oversized': header['fields']['bytes'] = 64*1024**2+1
            if change == 'authority': header['app_id'] = 'ap-unrelated'
            if change == 'boolean': header['manifest']['bytes'] = True
            if change == 'negative': header['peak_cuda_bytes'] = -1
            if change == 'digest': header['fields']['sha256'] = 'not-a-digest'
            if change == 'device': header['device_name'] = 'x'*201
            if change == 'dependencies': header['dependencies'] = 'x'*65537
            with self.subTest(change=change), self.assertRaises(ValueError):
                await self.receive([header])
            self.assertFalse(self.output.exists())

    async def test_corruption_retains_bytes_without_promoting_manifest(self):
        data = records(); data[2]['data'] = b'z'*1048576
        with self.assertRaisesRegex(ValueError, 'digest'):
            await self.receive(data)
        self.assertEqual((self.output/'raw-fields.npz.partial').read_bytes()[:1048576], b'z'*1048576)
        self.assertFalse((self.output/'manifest.json').exists())
        self.assertEqual(self.receipt['artifact_status'], 'partial-unadmitted')

    async def test_missing_reordered_extra_or_oversized_chunks_never_promote(self):
        cases = [records()[:-1], records() + [{'kind': 'complete'}], records()[:2] + records()[3:]]
        for change in ('order', 'oversized', 'authority', 'boolean', 'name'):
            data = records()
            if change == 'order': data[2]['index'] = 1
            if change == 'oversized': data[2]['data'] = b'x'*(1048576+1)
            if change == 'authority': data[2]['call_id'] = 'fc-other'
            if change == 'boolean': data[2]['index'] = False
            if change == 'name': data[2]['name'] = '../../outside'
            cases.append(data)
        for index, data in enumerate(cases):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as folder:
                output = Path(folder)/'out'
                with self.assertRaises(ValueError):
                    await transport.receive_bundle(stream(data), output, {}, lambda: None)
                self.assertFalse((output/'manifest.json').exists())

    async def test_interrupted_stream_retains_partial_bytes_and_counts(self):
        async def interrupted():
            for record in records()[:3]:
                yield record
            raise TimeoutError('synthetic remote interruption')
        with self.assertRaises(TimeoutError):
            await transport.receive_bundle(interrupted(), self.output, self.receipt, lambda: None)
        self.assertEqual((self.output/'raw-fields.npz.partial').stat().st_size, 1048576)
        self.assertEqual(self.receipt['received_bytes']['fields'], 1048576)
        self.assertFalse((self.output/'manifest.json').exists())

    async def test_existing_output_is_never_overwritten(self):
        self.output.mkdir(); keep = self.output/'manifest.json'; keep.write_bytes(b'keep')
        with self.assertRaises(FileExistsError):
            await self.receive(records())
        self.assertEqual(keep.read_bytes(), b'keep')

    def test_serialized_records_fit_verified_inline_size(self):
        try:
            from modal._serialization import serialize_data_format
            from modal_proto import api_pb2
        except ImportError:
            self.skipTest('Requires existing Modal client environment')
        for record in transport.stream_bundle(bundle()):
            self.assertLess(len(serialize_data_format(record, api_pb2.DATA_FORMAT_CBOR)), 2*1024**2)

    def test_actual_remote_capture_uses_chunked_protocol_without_model_execution(self):
        import worldmirror_remote as remote
        with tempfile.TemporaryDirectory() as folder:
            dependencies = Path(folder)/'dependencies.txt'; dependencies.write_text('synthetic-only')
            def execute(request, source, checkpoint, output):
                output.mkdir()
                (output/'manifest.json').write_bytes(b'not-json')
                (output/'raw-fields.npz').write_bytes(FIELDS)
            cuda = SimpleNamespace(is_available=lambda: True, reset_peak_memory_stats=lambda: None,
                                   get_device_name=lambda: 'synthetic', max_memory_allocated=lambda: 0)
            def path(value):
                return dependencies if str(value) == '/opt/worldmirror-dependencies.txt' else Path(value)
            # Only model/device and the image-only dependency path are replaced.
            with patch.dict('sys.modules', {'torch': SimpleNamespace(cuda=cuda)}), \
                    patch('worldmirror_worker.execute', execute), patch.object(remote, 'Path', path), \
                    patch.object(remote.sys, 'path', list(remote.sys.path)):
                self.assertEqual(list(remote.capture({})), records())


if __name__ == '__main__':
    unittest.main()
