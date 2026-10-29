import asyncio
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('ffs_depth_cloud.py')


def load():
    spec = importlib.util.spec_from_file_location('ffs_depth_cloud', MODULE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


async def stream(rows):
    for row in rows:
        yield row


def results():
    rows, files = [], {}
    for stamp in range(133400, 133413):
        for name in (f'photo-IMG_20240306_{stamp}.jpg', f'depth-IMG_20240306_{stamp}.png'):
            data = name.encode()
            files[name] = {'sha256': hashlib.sha256(data).hexdigest()}
            rows.append((name, data))
    return rows + [('report.json', json.dumps({'files': files}).encode())]


class DepthCloudTests(unittest.TestCase):
    def test_catalogued_inputs_are_the_13_verified_photos(self):
        self.assertEqual(len(load().photos()), 13)

    @unittest.skipUnless(importlib.util.find_spec('modal'), 'Use the existing Modal client environment')
    def test_real_sdk_constructs_generator_without_submitting(self):
        with tempfile.TemporaryDirectory() as tmp:
            app, function = load().create(Path(tmp))
            self.assertIsNone(app.app_id)
            self.assertIsNotNone(function)

    def test_returned_files_are_named_complete_hashed_and_never_overwritten(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            self.assertEqual(len(asyncio.run(m.receive(stream(results()), out))['files']), 26)
            with self.assertRaises(FileExistsError):
                asyncio.run(m.receive(stream(results()), out))
        for rows in [[('../x.png', b'x')], [('depth-IMG_20240306_133442.png', b'')], results()[:-2] + results()[-1:],
                     [(n, b'tampered' if n.startswith('depth') else d) for n, d in results()]]:
            with tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
                asyncio.run(m.receive(stream(rows), Path(tmp)))


    def test_register_adds_hashed_catalogue_entries_without_replacing(self):
        m = load()
        with tempfile.TemporaryDirectory(dir=m.ROOT / '.local') as tmp:
            out, catalog = Path(tmp), Path(tmp) / 'catalog.json'
            catalog.write_text('{"tags.json": {}}')
            report = {'files': {'depth-IMG_20240306_133442.png': {'sha256': 'a' * 64, 'bytes': 3}}}
            m.register(out, report, catalog)
            entry = json.loads(catalog.read_text())['depth/depth-IMG_20240306_133442.png']
            self.assertEqual((entry['type'], entry['bytes']), ('image/png', 3))
            self.assertTrue(entry['path'].startswith('.local/'))
            with self.assertRaises(ValueError):
                m.register(out, report, catalog)


if __name__ == '__main__':
    unittest.main()
