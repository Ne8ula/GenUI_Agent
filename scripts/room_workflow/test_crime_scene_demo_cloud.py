import asyncio
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('crime_scene_demo_cloud.py')


def load():
    spec = importlib.util.spec_from_file_location('crime_scene_demo_cloud', MODULE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class DemoCloudTests(unittest.TestCase):
    def test_session_is_bounded_and_separate_from_the_check(self):
        m = load()
        self.assertEqual((m.RESOURCES['gpu'], m.RESOURCES['timeout'], m.RESOURCES['operational_allowance_usd']), (['T4', 'L4', 'A10G'], 900, 2))
        self.assertEqual(m.RESOURCES['client_timeout'], 1200)
        self.assertNotEqual(m.OUTPUT, m.browser.OUTPUT)
        self.assertEqual(m.OUTPUT.name, 'crime-scene-matrix-live-v3', 'Earlier session receipts remain untouched')
        self.assertIn('week4/app/scripts/crime-scene-kiosk.mjs', m.browser.source_files())

    def test_session_acknowledges_entry_before_display_or_network_setup(self):
        stream = load().session()
        try:
            self.assertEqual(next(stream), ('worker-started',))
        finally:
            stream.close()

    def test_only_modal_tunnel_viewer_urls_are_printed(self):
        m = load()
        self.assertTrue(m.URL.fullmatch('https://abc123.r42.modal.host/vnc.html?autoconnect=1&resize=scale'))
        for bad in ['http://abc.modal.host/vnc.html?autoconnect=1&resize=scale', 'https://evil.example/vnc.html?autoconnect=1&resize=scale',
                    'https://abc.modal.host/vnc.html?autoconnect=1&resize=scale&x=1']:
            self.assertIsNone(m.URL.fullmatch(bad))

    def test_evidence_finishes_before_viewer_handoff(self):
        m = load()
        async def check(output):
            payload = b'{"status":"passed"}'
            async def records():
                yield ('file', 'result.json', len(payload), m.browser.sha(payload))
                yield ('chunk', payload)
                yield ('end',)
                yield ('evidence-complete',)
                yield ('ready', 'viewer', 'secret', {})
            stream = records()
            await m.receive_evidence(stream, output)
            self.assertEqual(json.loads((output / 'result.json').read_text())['status'], 'passed')
            self.assertEqual((await anext(stream))[0], 'ready')
        with tempfile.TemporaryDirectory() as tmp:
            asyncio.run(check(Path(tmp)))

    def test_missing_evidence_completion_is_rejected(self):
        m = load()
        async def records():
            yield ('file', 'result.json', 0, m.browser.sha(b''))
            yield ('end',)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'completion marker'):
                asyncio.run(m.receive_evidence(records(), Path(tmp)))

    @unittest.skipUnless(importlib.util.find_spec('modal'), 'Use the existing Modal client environment')
    def test_real_sdk_constructs_session_without_submitting(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            app, function = m.browser.create(Path(tmp), {'playwright': '1.56.1'}, function=m.session, name='eva-crime-scene-demo',
                                             apt=m.APT, timeout=m.RESOURCES['timeout'], gpu=m.RESOURCES['gpu'], isolated=False, sources=('crime_scene_browser_cloud',))
            self.assertIsNone(app.app_id)
            self.assertIsNotNone(function)


if __name__ == '__main__':
    unittest.main()
