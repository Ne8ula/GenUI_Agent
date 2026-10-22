"""CPU probe contracts; paid boundaries are replaced, validation/receipts are real."""
import asyncio
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import worldmirror_transfer_probe as probe

PAYLOAD = bytes(range(256)) * 16384
APP_ID = 'ap-' + 'a' * 22


def records():
    # Independent fixture: exactly four 1 MiB chunks and a completion marker.
    return [dict(kind='start', size=4194304, sha256=hashlib.sha256(PAYLOAD).hexdigest()),
            *[dict(kind='chunk', index=i, data=PAYLOAD[i*1048576:(i+1)*1048576]) for i in range(4)],
            dict(kind='complete')]


async def stream(items):
    for item in items:
        yield item


class TransferTests(unittest.IsolatedAsyncioTestCase):
    async def test_worker_protocol_and_byte_exact_reassembly(self):
        worker = probe.transfer(PAYLOAD)
        actual = [next(worker) for _ in range(6)]
        worker.close()  # Do not exercise the deliberate cloud cancellation wait locally.
        self.assertEqual(actual, records())
        result = await probe.receive(stream(actual), PAYLOAD)
        self.assertEqual(result['output_bytes'], 4194304)
        self.assertEqual(result['output_sha256'], hashlib.sha256(PAYLOAD).hexdigest())
        for invalid in (b'', PAYLOAD[:-1], 'not bytes'):
            with self.assertRaises(ValueError):
                next(probe.transfer(invalid))

    async def test_rejects_partial_corrupt_reordered_and_authority_bearing_records(self):
        cases = [records()[:-1], records()[1:], records()[:3] + records()[4:]]
        for position, key, value in [(0, 'size', True), (0, 'sha256', '0'*64),
                                     (1, 'index', False), (1, 'index', 1),
                                     (1, 'data', PAYLOAD), (1, 'data', b'z'*1048576),
                                     (1, 'call_id', 'fc-unrelated'), (5, 'app_id', 'ap-unrelated')]:
            altered = copy.deepcopy(records()); altered[position][key] = value
            cases.append(altered)
        cases.append(records()[:2] + [dict(kind='complete')])
        for items in cases:
            with self.subTest(items=len(items)), self.assertRaises(ValueError):
                await probe.receive(stream(items), PAYLOAD)

    async def run_case(self, make_stream, error=None, stop_error=None):
        events, receipt, saved = [], {}, []
        class App:
            app_id = APP_ID
            def __init__(self):
                self.run = SimpleNamespace(aio=self.context)
            def context(self, detach):
                self_detach = detach
                self_test.assertFalse(self_detach)
                return self
            async def __aenter__(self):
                events.append('enter'); return self
            async def __aexit__(self, *args):
                events.append('exit')
        self_test = self
        def invoke(payload):
            self.assertEqual(payload, PAYLOAD)
            events.append('submit')
            return make_stream(events)
        def stop(app_id):
            events.append(('stop', app_id))
            if stop_error:
                raise stop_error
            return {'app_id': app_id, 'state': 'stopped', 'tasks': 0}
        fn = SimpleNamespace(remote_gen=SimpleNamespace(aio=invoke))
        with patch.object(probe, 'stop_app', stop), patch.object(probe, 'CLIENT_TIMEOUT', 0.02):
            if error:
                with self.assertRaises(error):
                    await probe.run(App(), fn, PAYLOAD, receipt, lambda: saved.append(copy.deepcopy(receipt)))
            else:
                await probe.run(App(), fn, PAYLOAD, receipt, lambda: saved.append(copy.deepcopy(receipt)))
        self.assertEqual(events.count('submit'), 1)
        self.assertEqual([x for x in events if isinstance(x, tuple)], [('stop', APP_ID)])
        self.assertLess(events.index(('stop', APP_ID)), events.index('exit'))
        self.assertTrue(any(row.get('app_id') == APP_ID for row in saved))
        return receipt, events

    async def test_success_stops_owned_app_before_stream_close_and_context_exit(self):
        async def source(events):
            try:
                async for item in stream(records()):
                    yield item
                await asyncio.Event().wait()
            finally:
                events.append('close')
        receipt, events = await self.run_case(source)
        self.assertEqual(receipt['status'], 'verified-round-trip-and-stopped')
        self.assertEqual(receipt['cleanup']['state'], 'stopped')
        self.assertLess(events.index(('stop', APP_ID)), events.index('close'))

    async def test_timeout_before_first_record_stops_owned_app(self):
        async def source(events):
            await asyncio.Event().wait()
            yield None
        receipt, _ = await self.run_case(source, TimeoutError)
        self.assertEqual(receipt['status'], 'failed-or-uncertain')
        self.assertEqual(receipt['error_type'], 'TimeoutError')
        self.assertEqual(receipt['cleanup']['tasks'], 0)

    async def test_midstream_timeout_and_interruption_stop_owned_app(self):
        for failure in (None, asyncio.CancelledError()):
            async def source(events):
                yield records()[0]
                if failure:
                    raise failure
                await asyncio.Event().wait()
            receipt, _ = await self.run_case(source, type(failure) if failure else TimeoutError)
            self.assertEqual(receipt['status'], 'failed-or-uncertain')
            self.assertEqual(receipt['cleanup']['state'], 'stopped')

    async def test_untrusted_ids_cannot_select_cancellation_target(self):
        async def source(events):
            yield {'kind': 'start', 'app_id': 'ap-' + 'b'*22, 'call_id': 'fc-other'}
        receipt, _ = await self.run_case(source, ValueError)
        self.assertEqual(receipt['app_id'], APP_ID)

    async def test_cleanup_failure_is_not_reported_as_success(self):
        async def source(events):
            async for item in stream(records()):
                yield item
        receipt, _ = await self.run_case(source, RuntimeError, RuntimeError('synthetic stop failure'))
        self.assertEqual(receipt['status'], 'failed-or-uncertain')
        self.assertEqual(receipt['cleanup']['state'], 'unconfirmed')
        self.assertEqual(receipt['output_bytes'], 4194304)

    async def test_cleanup_failure_preserves_original_timeout(self):
        async def source(events):
            await asyncio.Event().wait()
            yield None
        receipt, _ = await self.run_case(source, TimeoutError, RuntimeError('synthetic stop failure'))
        self.assertEqual(receipt['error_type'], 'TimeoutError')
        self.assertEqual(receipt['cleanup']['state'], 'unconfirmed')


class OperatorTests(unittest.TestCase):
    def test_stop_uses_only_exact_id_and_requires_provider_confirmation(self):
        calls = []
        def command(args, **kwargs):
            calls.append((args, kwargs))
            if 'stop' in args:
                return subprocess.CompletedProcess(args, 0)
            return subprocess.CompletedProcess(args, 0, json.dumps([
                {'app_id': APP_ID, 'state': 'stopped', 'tasks': '0'},
                {'app_id': 'ap-other', 'state': 'deployed', 'tasks': '1'}]))
        with patch.object(probe.subprocess, 'run', command):
            self.assertEqual(probe.stop_app(APP_ID), {'app_id': APP_ID, 'state': 'stopped', 'tasks': 0})
            for invalid in ('eva-room-workflow', 'ap-short', APP_ID + '; anything'):
                with self.assertRaises(ValueError):
                    probe.stop_app(invalid)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0][-4:], ['app', 'stop', APP_ID, '--yes'])
        self.assertEqual(calls[0][1]['timeout'], 30)
        self.assertFalse(calls[0][1].get('shell', False))
        with patch.object(probe.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '[]')):
            with self.assertRaises(RuntimeError):
                probe.stop_app(APP_ID)

    def test_stop_waits_for_stopped_and_zero_tasks_without_repeating_stop(self):
        states = iter([('stopping', '1'), ('stopped', '1'), ('stopped', '0')])
        commands = []
        def command(args, **kwargs):
            commands.append(args)
            if 'stop' in args:
                return subprocess.CompletedProcess(args, 0)
            state, tasks = next(states)
            return subprocess.CompletedProcess(args, 0, json.dumps([
                {'app_id': APP_ID, 'state': state, 'tasks': tasks}]))
        with patch.object(probe.subprocess, 'run', command), patch('time.sleep'):
            self.assertEqual(probe.stop_app(APP_ID)['state'], 'stopped')
        self.assertEqual(sum('stop' in args for args in commands), 1)
        self.assertEqual(sum('list' in args for args in commands), 3)

    def test_stop_confirmation_has_a_deadline(self):
        commands = []
        def command(args, **kwargs):
            commands.append(args)
            return subprocess.CompletedProcess(args, 0, json.dumps([
                {'app_id': APP_ID, 'state': 'stopping', 'tasks': '1'}]))
        with patch.object(probe.subprocess, 'run', command), patch('time.sleep'), \
                patch('time.monotonic', side_effect=[0, 1, 31]):
            with self.assertRaises(RuntimeError):
                probe.stop_app(APP_ID)
        self.assertEqual(sum('stop' in args for args in commands), 1)
        self.assertEqual(sum('list' in args for args in commands), 1)

    def test_exclusive_receipt_is_reserved_before_definition_and_not_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            observed = []
            def fail():
                observed.extend(root.glob('*.receipt.json'))
                raise RuntimeError('synthetic definition failure')
            with patch.object(probe, 'create', fail):
                with self.assertRaises(RuntimeError):
                    probe.execute(root, 1)
                self.assertEqual(len(observed), 1)
                before = observed[0].read_bytes()
                with self.assertRaises(FileExistsError):
                    probe.execute(root, 1)
                self.assertEqual(observed[0].read_bytes(), before)
                for attempt in (0, 4):
                    with self.assertRaises(ValueError):
                        probe.execute(root, attempt)
                with self.assertRaises(ValueError):
                    probe.execute(root, 2)
            receipt = json.loads(before)
            self.assertEqual(receipt['status'], 'failed-or-uncertain')
            source = next(root.glob('*.py'))
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), receipt['source_sha256'])

    def test_corrected_retry_rechecks_prior_cleanup_without_rewriting_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            previous = root / 'worldmirror-stream-v1-attempt-1.receipt.json'
            previous.write_text(json.dumps({'app_id': APP_ID, 'status': 'failed-or-uncertain',
                'source_sha256': '0'*64, 'cleanup': {'state': 'unconfirmed'}}), encoding='utf-8')
            before = previous.read_bytes()
            events = []
            def stop(app_id):
                events.append(('stop', app_id))
                return {'app_id': app_id, 'state': 'stopped', 'tasks': 0}
            def fail():
                events.append('define')
                raise RuntimeError('offline definition failure')
            with patch.object(probe, 'stop_app', stop), patch.object(probe, 'create', fail):
                with self.assertRaisesRegex(RuntimeError, 'offline definition'):
                    probe.execute(root, 2)
            self.assertEqual(events, [('stop', APP_ID), 'define'])
            self.assertEqual(previous.read_bytes(), before)
            receipt = json.loads((root / 'worldmirror-stream-v1-attempt-2.receipt.json').read_text())
            self.assertEqual(receipt['previous_cleanup']['state'], 'stopped')

    def test_real_sdk_keeps_chunk_records_inline_and_security_flags_enabled(self):
        try:
            import modal
            from modal._serialization import serialize_data_format
            from modal_proto import api_pb2
        except ImportError:
            self.skipTest('Requires existing genrc-client environment')
        for record in records():
            self.assertLess(len(serialize_data_format(record, api_pb2.DATA_FORMAT_CBOR)), 2*1024**2)
        register = modal.App.function
        options = []
        def spy(app, *args, **kwargs):
            options.append(kwargs)
            return register(app, *args, **kwargs)
        with patch.object(modal.App, 'function', spy):
            app, fn = probe.create()
        self.assertTrue(options[0]['block_network'])
        self.assertTrue(options[0]['restrict_modal_access'])
        self.assertTrue(options[0]['_experimental_restrict_output'])
        self.assertIsNone(options[0].get('retries'))  # Generators reject even retries=0.
        self.assertNotIn('gpu', options[0])
        self.assertTrue(callable(fn.remote_gen.aio))
        self.assertTrue(callable(app.run.aio))
        unopened = fn.remote_gen.aio(PAYLOAD)
        self.assertTrue(callable(unopened.aclose))
        asyncio.run(unopened.aclose())  # No iteration/submission.


if __name__ == '__main__':
    unittest.main()
