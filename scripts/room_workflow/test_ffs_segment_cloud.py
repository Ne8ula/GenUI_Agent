import asyncio
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

MODULE = Path(__file__).with_name('ffs_segment_cloud.py')


def load(path=MODULE):
    spec = importlib.util.spec_from_file_location('ffs_segment_cloud', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


async def stream(rows):
    for row in rows:
        yield row


def results(count=3):
    markers = {f'marker-{i:02d}': {'tag': i, 'count': count, 'bbox': [[0, 0, 0], [1, 1, 1]], 'height': 1.0,
                                   'flags': [], 'seed_distance': 0.0} for i in range(1, 10)}
    rows = [(name + '.u32', np.arange(count, dtype='<u4').tobytes()) for name in markers]
    files = {name: hashlib.sha256(data).hexdigest() for name, data in rows}
    return rows + [('summary.json', json.dumps({'markers': markers, 'files': files}).encode())]


def synthetic_inputs(folder):
    """A floor with one 10 cm box under each of nine markers, in raw scanner coordinates."""
    grid = np.arange(-2, 2, 0.02)
    floor = [(x, y, 349.2) for x in grid for y in grid]
    centres = [(-1.5 + 0.375 * i, 0.5 * (-1) ** i) for i in range(9)]
    box = np.arange(0, 0.1, 0.01)
    boxes = [(cx + dx - 0.05, cy + dy - 0.05, 349.2 + dz) for cx, cy in centres for dx in box for dy in box for dz in box]
    rows = np.zeros(len(floor) + len(boxes), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'),
                                                     ('red', 'u1'), ('green', 'u1'), ('blue', 'u1')])
    xyz = np.array(floor + boxes)
    rows['x'], rows['y'], rows['z'] = xyz.T
    header = ('ply\nformat binary_little_endian 1.0\nelement vertex %d\nproperty float x\nproperty float y\n'
              'property float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n') % len(rows)
    (folder / 'scene.ply').write_bytes(header.encode() + rows.tobytes())
    markers = [{'id': f'marker-{i + 1:02d}', 'tag': None if i == 5 else i, 'centroid': [cx, cy, 349.3],
                'bounds_min': [cx - 0.01, cy - 0.01, 349.29], 'bounds_max': [cx + 0.01, cy + 0.01, 349.31]}
               for i, (cx, cy) in enumerate(centres)]
    (folder / 'tags.json').write_text(json.dumps({'crop': {'rotation_z': 0.23}, 'markers': markers}))
    return len(rows)


class SegmentCloudTests(unittest.TestCase):
    def test_plan_bounds(self):
        m = load()
        self.assertEqual({k: m.RESOURCES[k] for k in ('cpu', 'memory_mib', 'timeout', 'operational_allowance_usd')},
                         {'cpu': 2, 'memory_mib': 4096, 'timeout': 600, 'operational_allowance_usd': 1})
        self.assertNotIn('gpu', m.RESOURCES)
        self.assertEqual((m.RESOURCES['retries'], m.RESOURCES['provider_enforced_dollar_cap']), (0, False))
        self.assertEqual(m.OUTPUT.name, 'ffs-th0028-segments-v2')
        with tempfile.TemporaryDirectory() as tmp:
            m.OUTPUT = Path(tmp)
            with self.assertRaises(FileExistsError):
                m.prepare()
            m.OUTPUT = Path(tmp) / 'new'
            plan = m.prepare()
            self.assertEqual(set(plan['inputs']), {'scene.ply', 'tags.json', 'ffs_segment.py'})
            self.assertEqual(plan['core_sha256'], m.sha(m.CORE.read_bytes()))
            self.assertEqual(plan['inputs']['ffs_segment.py'], plan['core_sha256'])  # mounted core is pinned
            self.assertNotIn('gpu', plan['resources'])
            self.assertEqual(plan['approval'],
                             'Owner approved a second one-time CPU segmentation run after tightening ($1), no retries')

    @unittest.skipUnless(importlib.util.find_spec('modal'), 'Use the existing Modal client environment')
    def test_execute_rejects_changed_core_or_adapter_before_receipt(self):
        real = load()
        for changed in ('core', 'adapter'):
            with tempfile.TemporaryDirectory() as tmp:
                adapter, core = Path(tmp) / 'ffs_segment_cloud.py', Path(tmp) / 'ffs_segment.py'
                adapter.write_bytes(MODULE.read_bytes())
                core.write_bytes(real.CORE.read_bytes())
                m = load(adapter)
                m.ROOT, m.CORE, m.OUTPUT = real.ROOT, core, Path(tmp) / 'out'
                m.prepare()
                approved = m.sha((m.OUTPUT / 'plan.json').read_bytes())
                target = core if changed == 'core' else adapter
                target.write_bytes(target.read_bytes() + b'\n# changed\n')
                with self.assertRaisesRegex(ValueError, 'Plan or implementation changed'):
                    m.execute(approved)
                self.assertFalse((m.OUTPUT / 'receipt.json').exists())

    @unittest.skipUnless(importlib.util.find_spec('modal'), 'Use the existing Modal client environment')
    def test_real_sdk_construction(self):
        with tempfile.TemporaryDirectory() as tmp:
            app, function = load().create(Path(tmp))
            self.assertIsNone(app.app_id)
            self.assertIsNotNone(function)

    def test_receive_validation_no_overwrite(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            self.assertEqual(len(asyncio.run(m.receive(stream(results()), out))['files']), 10)
            with self.assertRaises(FileExistsError):
                asyncio.run(m.receive(stream(results()), out))
        too_big = [('marker-01.u32', b'\0' * (4 * 1024**2 + 4))]
        wrong_count = results()[:1] + [(n, d[:4]) for n, d in results()[1:2]] + results()[2:]
        out_of_range = [('marker-01.u32', np.array([0, 1, m.VERTICES], dtype='<u4').tobytes())] + results()[1:]
        tampered = [('marker-01.u32', np.array([2, 1, 0], dtype='<u4').tobytes())] + results()[1:]
        for rows in [[('../x.u32', b'x')], [('marker-1.u32', b'')], too_big, results()[1:], wrong_count, out_of_range,
                     results() + [('marker-01.u32', b'')], tampered]:
            with tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
                asyncio.run(m.receive(stream(rows), Path(tmp)))

    def test_register_adds_without_replacing(self):
        m = load()
        with tempfile.TemporaryDirectory(dir=m.ROOT / '.local') as tmp:
            out, catalog = Path(tmp), Path(tmp) / 'catalog.json'
            catalog.write_text('{"tags.json": {"path": "kept"}}')
            report = {'files': {'summary.json': {'sha256': 'a' * 64, 'bytes': 3},
                                'marker-01.u32': {'sha256': 'b' * 64, 'bytes': 4}}}
            m.register(out, report, catalog)
            entries = json.loads(catalog.read_text())
            self.assertEqual(entries['tags.json'], {'path': 'kept'})
            self.assertEqual(entries['segments/summary.json']['type'], 'application/json')
            self.assertEqual(entries['segments/marker-01.u32']['type'], 'application/octet-stream')
            self.assertTrue(entries['segments/marker-01.u32']['path'].startswith('.local/'))
            with self.assertRaises(ValueError):
                m.register(out, report, catalog)

    def test_register_supersedes_only_a_complete_v1_set_atomically(self):
        m = load()
        names = ['summary.json'] + [marker + '.u32' for marker in m.MARKERS]
        v1 = {'segments/' + name: {'path': m.V1_RETURNED + name, 'sha256': 'c' * 64, 'bytes': 4, 'type': 'x'} for name in names}
        report = {'files': {name: {'sha256': 'd' * 64, 'bytes': 8} for name in names}}
        with tempfile.TemporaryDirectory(dir=m.ROOT / '.local') as tmp:
            out, catalog = Path(tmp), Path(tmp) / 'catalog.json'
            catalog.write_text(json.dumps({'tags.json': {'path': 'kept'}, **v1}))
            m.register(out, report, catalog)
            entries = json.loads(catalog.read_text())
            self.assertEqual(entries['tags.json'], {'path': 'kept'})
            self.assertEqual({key: entries[key.replace('segments/', 'segments-v1/')] for key in v1}, v1)
            self.assertEqual({key for key in entries if key.startswith('segments/')}, set(v1))
            self.assertTrue(all(entries[key]['path'].startswith(out.relative_to(m.ROOT).as_posix()) for key in v1))
            self.assertEqual([p.name for p in out.iterdir()], ['catalog.json'])  # staged temp file replaced, not left

            partial = dict(list(v1.items())[1:])
            elsewhere = {**v1, 'segments/summary.json': {**v1['segments/summary.json'], 'path': '.local/other/summary.json'}}
            already = {**v1, 'segments-v1/summary.json': {}}
            for state, folder in [(partial, out), (elsewhere, out), (already, out), (v1, Path(tempfile.gettempdir()))]:
                # The last case passes the state check but fails mid-registration (output outside ROOT).
                catalog.write_text(json.dumps(state))
                before = catalog.read_bytes()
                with self.assertRaises(ValueError):
                    m.register(folder, report, catalog)
                self.assertEqual(catalog.read_bytes(), before)

    def test_worker_parses_ply_and_returns_receivable_segments(self):
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            inputs, out = Path(tmp) / 'in', Path(tmp) / 'out'
            inputs.mkdir(), out.mkdir()
            m.VERTICES = synthetic_inputs(inputs)
            asyncio.run(m.receive(stream(list(m.worker(inputs))), out))
            summary = json.loads((out / 'summary.json').read_text())
            self.assertEqual(sorted(summary['markers']), list(m.MARKERS))
            self.assertIsNone(summary['markers']['marker-06']['tag'])
            self.assertEqual(set(summary['revision']), {'adapter_sha256', 'core_sha256'})
            self.assertEqual(summary['files'], {f'{name}.u32': m.sha((out / f'{name}.u32').read_bytes()) for name in m.MARKERS})
            self.assertAlmostEqual(abs(summary['floor']['normal'][2]), 1.0, places=3)
            for record in summary['markers'].values():
                self.assertGreater(record['count'], 0)
                self.assertLess(record['height'], 0.15)
                self.assertLess(abs(record['base_above_floor']), 0.02)  # boxes rest on the floor
            (inputs / 'scene.ply').write_bytes((inputs / 'scene.ply').read_bytes()[:-1])
            with self.assertRaises(ValueError):
                list(m.worker(inputs))


if __name__ == '__main__':
    unittest.main()
