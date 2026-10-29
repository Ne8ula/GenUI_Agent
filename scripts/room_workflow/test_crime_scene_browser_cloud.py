import asyncio
import hashlib
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('crime_scene_browser_cloud.py')


def load():
    if not MODULE.exists():
        raise AssertionError('Bounded cloud browser adapter is not implemented')
    spec = importlib.util.spec_from_file_location('crime_scene_browser_cloud', MODULE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class CloudBrowserTests(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec('modal'), 'Use the existing Modal client environment')
    def test_real_sdk_constructs_generator_without_submitting(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            app, function = m.create(Path(tmp), {'playwright': '1.56.1'})
            self.assertIsNone(app.app_id)
            self.assertIsNotNone(function)
            fallback_app, fallback = m.create(Path(tmp), {'playwright': '1.56.1'}, gpu=['L4', 'A10G', 'T4'])
            self.assertIsNone(fallback_app.app_id)
            self.assertIsNotNone(fallback)

    def test_cli_normalizes_redirected_windows_output(self):
        import subprocess
        code = """
import runpy, sys
sys.stdout.reconfigure(encoding='cp1252')
sys.stderr.reconfigure(encoding='cp1252')
sys.argv = [sys.argv[1], '--help']
try:
    runpy.run_path(sys.argv[0], run_name='__main__')
except SystemExit as error:
    assert error.code == 0
assert sys.stdout.encoding == sys.stderr.encoding == 'utf-8'
print(chr(0x2713))
"""
        result = subprocess.run([sys.executable, '-I', '-c', code, str(MODULE)], capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8', errors='replace'))
        self.assertIn('✓'.encode('utf-8'), result.stdout)

    def test_module_imports_at_container_root(self):
        source = MODULE.read_text(encoding='utf-8')
        exec(compile(source, '/root/crime_scene_browser_cloud.py', 'exec'),
             {'__file__': '/root/crime_scene_browser_cloud.py', '__name__': 'cloud_import'})

    def test_upload_scope_is_explicit_and_excludes_private_stores(self):
        m = load()
        names = m.source_files()
        self.assertIn('week4/app/src/crime-scene/CrimeSceneApp.tsx', names)
        self.assertIn('scripts/room_workflow/broker.mjs', names)
        self.assertIn('scripts/room_workflow/idealized-room.schema.json', names)
        self.assertIn('ajv', m.PACKAGES)
        self.assertIn('.local/reconstruction/ffs-th0028-scene-v2/scene.ply', names)
        self.assertEqual(len([n for n in names if n.endswith('.jpg') and 'media-v1' in n]), 13)
        self.assertNotEqual(m.OUTPUT.name, 'crime-scene-browser-v1', 'Never reuse the failed attempt folder')
        self.assertEqual(m.OUTPUT.name, 'crime-scene-browser-v10', 'v1-v9 retain earlier plans and receipts')
        self.assertEqual(m.CAPTURES, 'docs/design/revisions/crime-scene-eva-v1/implementation/after')
        for name in ['scripts/room_workflow/eva-investigator.mjs', 'scripts/room_workflow/scene-review.mjs',
                     'scripts/room_workflow/eva-investigation.schema.json', 'scripts/room_workflow/eva-research.json',
                     'week4/app/tests/crime-scene-investigation.test.ts', 'week4/app/tests/crime-scene-figures.test.ts',
                     '.local/reconstruction/figure-ual-v1/extracted/ual-standard.glb', '.local/reconstruction/ffs-th0028-review-v1/review.md']:
            self.assertIn(name, names)
        self.assertIn('.local/reconstruction/ffs-th0028-objects-v2/returned/', m.ASSETS, 'Generated models are in scope once catalogued')
        self.assertFalse(any('.env' in n or 'node_modules' in n or 'notebook' in n.lower() for n in names if not n.endswith('Notebook.tsx')))
        self.assertLess(sum((m.ROOT / n).stat().st_size for n in names), m.UPLOAD_LIMIT)
        self.assertEqual(m.RESOURCES['gpu'], 'L4')
        self.assertEqual(m.RESOURCES['timeout'], 600)
        self.assertEqual(m.RESOURCES['retries'], 0)

    def test_panorama_snapshot_is_separate_and_excludes_paused_assets(self):
        import json
        m = load()
        names = m.source_files(panorama=True)
        self.assertIn('week4/app/scripts/panorama-quality.mjs', names)
        self.assertIn('.local/reconstruction/ffs-th0028-realsee-v2/scene.glb', names)
        self.assertIn('.local/reconstruction/ffs-th0028-realsee-v2/report.json', names)
        self.assertFalse(any('objects-v2' in n or 'figure-ual-v1' in n or 'depth-v1' in n for n in names))
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'new-plan'
            plan = m.prepare(output, panorama=True)
            snapshot = output / 'snapshot'
            self.assertIn("from './crime-scene/PanoramaApp.tsx'", (snapshot / 'week4/app/src/main.tsx').read_text())
            self.assertTrue(json.loads((snapshot / 'capture-mode.json').read_text())['panorama'])
            catalog = json.loads((snapshot / 'scripts/room_workflow/ffs-resources.json').read_text())
            self.assertIn('realsee/scene.glb', catalog)
            self.assertNotIn('models/tag-18.glb', catalog)
            for name, expected in plan['files'].items():
                self.assertEqual(m.sha((snapshot / name).read_bytes()), expected)
            self.assertFalse(plan['execution_authorized'])

    def test_inspection_snapshot_keeps_baseline_and_final_separate(self):
        import json
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            for phase in ('before', 'after'):
                output = Path(tmp) / phase
                plan = m.prepare(output, panorama=True, inspection=phase)
                mode = json.loads((output / 'snapshot/capture-mode.json').read_text())
                self.assertEqual(mode, {'panorama': True, 'inspection': phase})
                self.assertIn('week4/app/scripts/crime-scene-inspection-capture.mjs', plan['files'])
                self.assertEqual(plan['evidence_limit_bytes'], 512 * 1024**2)
                self.assertEqual(plan['resources']['retries'], 0)
            with self.assertRaises(ValueError):
                m.prepare(Path(tmp) / 'invalid', panorama=True, inspection='../other')

    def test_expanded_evidence_budget_remains_explicit(self):
        m = load()
        data = b'x'
        async def stream():
            yield ('file', 'capture.webm', 65 * 1024**2, 'a' * 64)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'Incomplete evidence stream'):
                asyncio.run(m.receive(stream(), Path(tmp), limit=512 * 1024**2))
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'Invalid evidence file'):
                asyncio.run(m.receive(stream(), Path(tmp)))

    def test_worker_acknowledges_entry_before_filesystem_or_gpu_work(self):
        stream = load().worker()
        try:
            self.assertEqual(next(stream), ('worker-started',))
        finally:
            stream.close()

    def test_worker_start_deadline_cancels_silent_stream_without_retry(self):
        m = load()
        self.assertTrue(hasattr(m, 'wait_for_worker'), 'Worker-start deadline is missing')
        entered, cancelled = [], []
        async def stalled():
            entered.append(True)
            try:
                await asyncio.Event().wait()
                yield ('worker-started',)
            finally:
                cancelled.append(True)
        async def check():
            with self.assertRaisesRegex(TimeoutError, 'Worker start not acknowledged'):
                await m.wait_for_worker(stalled(), timeout=.01)
        asyncio.run(check())
        self.assertEqual(entered, [True])
        self.assertEqual(cancelled, [True])

    def test_worker_acknowledgement_preserves_validated_evidence(self):
        m = load()
        self.assertTrue(hasattr(m, 'wait_for_worker'), 'Worker-start deadline is missing')
        data = b'{"status":"passed"}'
        async def stream():
            yield ('worker-started',)
            yield ('file', 'result.json', len(data), hashlib.sha256(data).hexdigest())
            yield ('chunk', data)
            yield ('end',)
        async def check(out):
            records = stream()
            await m.wait_for_worker(records, timeout=1)
            await m.receive(records, out)
        with tempfile.TemporaryDirectory() as tmp:
            asyncio.run(check(Path(tmp)))
            self.assertEqual((Path(tmp) / 'result.json').read_bytes(), data)

    def test_worker_start_rejects_missing_or_invalid_acknowledgement(self):
        m = load()
        self.assertTrue(hasattr(m, 'wait_for_worker'), 'Worker-start deadline is missing')
        async def stream(rows):
            for row in rows:
                yield row
        for rows in [[], [('file', 'result.json', 0, 'a' * 64)], [('worker-started', 'extra')]]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                asyncio.run(m.wait_for_worker(stream(rows), timeout=1))

    def test_worker_records_step_durations(self):
        import inspect
        source = inspect.getsource(load().worker)
        self.assertIn("durations = result['durations'] = {}", source)
        for step in ["durations[name]", "durations['vite']", "durations['smoke']"]:
            self.assertIn(step, source)

    def test_walkthrough_video_is_returned_without_relaxing_other_bounds(self):
        m = load()
        self.assertIn('week4/app/scripts/crime-scene-walkthrough.mjs', m.source_files())
        async def stream(name, data):
            yield ('file', name, len(data), hashlib.sha256(data).hexdigest())
            yield ('chunk', data)
            yield ('end',)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            data = b'bounded video fixture'
            asyncio.run(m.receive(stream('walkthrough.webm', data), out))
            self.assertEqual((out / 'walkthrough.webm').read_bytes(), data)
            with self.assertRaises(FileExistsError):
                asyncio.run(m.receive(stream('walkthrough.webm', data), out))
            for name in ['../walkthrough.webm', 'walkthrough.mp4', 'walkthrough.html']:
                with self.assertRaises(ValueError):
                    asyncio.run(m.receive(stream(name, data), out))

    def test_media_overflow_preserves_result_and_logs(self):
        m = load()
        self.assertTrue(hasattr(m, 'evidence_records'), 'Bounded evidence sender is missing')
        async def stream(out):
            for row in m.evidence_records(out):
                yield row
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'capture'; out.mkdir()
            returned = Path(tmp) / 'returned'; returned.mkdir()
            (out / 'result.json').write_bytes(b'{"status":"passed"}')
            (out / 'walkthrough.log').write_bytes(b'capture completed')
            with (out / 'original-scan.png').open('wb') as file:
                file.truncate(65 * 1024**2)
            with self.assertRaisesRegex(ValueError, 'exceeds 64 MiB'):
                asyncio.run(m.receive(stream(out), returned))
            self.assertEqual((returned / 'result.json').read_bytes(), b'{"status":"passed"}')
            self.assertEqual((returned / 'walkthrough.log').read_bytes(), b'capture completed')
            self.assertFalse((returned / 'original-scan.png').exists())

    def test_failure_capture_name_is_accepted(self):
        m = load()
        async def stream(records):
            for row in records:
                yield row
        data = b'png'
        with tempfile.TemporaryDirectory() as tmp:
            asyncio.run(m.receive(stream([('file', 'failure.png', len(data), hashlib.sha256(data).hexdigest()), ('chunk', data), ('end',)]), Path(tmp)))
            self.assertEqual((Path(tmp) / 'failure.png').read_bytes(), data)

    def test_returned_files_are_hashed_bounded_and_never_overwritten(self):
        m = load()
        async def stream(records):
            for row in records:
                yield row
        data = b'bounded log'
        rows = [('file', 'smoke.log', len(data), hashlib.sha256(data).hexdigest()), ('chunk', data), ('end',)]
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            asyncio.run(m.receive(stream(rows), out))
            self.assertEqual((out / 'smoke.log').read_bytes(), data)
            with self.assertRaises(FileExistsError):
                asyncio.run(m.receive(stream(rows), out))
            for records in [
                [('file', '../escape.log', 1, 'a' * 64)],
                [('file', 'secret.env', 1, 'a' * 64)],
                [('file', 'big.log', 65 * 1024**2, 'a' * 64)],
                [('file', 'truncated.log', 1, 'a' * 64)],
                [('file', 'wrong.log', 1, 'a' * 64), ('chunk', b'x'), ('end',)],
            ]:
                with self.assertRaises(ValueError):
                    asyncio.run(m.receive(stream(records), out))


if __name__ == '__main__':
    unittest.main()
