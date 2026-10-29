"""Offline contracts only: no provider submission, installation or model downloads."""
import asyncio
from contextlib import asynccontextmanager, contextmanager, nullcontext
import importlib.util
import inspect
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
from PIL import Image

MODULE = Path(__file__).with_name('ffs_objects_cloud.py')


def load():
    spec = importlib.util.spec_from_file_location('ffs_objects_cloud', MODULE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


async def stream(rows):
    for row in rows:
        yield row


@contextmanager
def fixture(m):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        with patch.multiple(m, ROOT=root, OUTPUT=root / 'run', CATALOG=root / 'catalog.json',
                            CORE=root / 'ffs_fit.py', VERTICES=8), patch.dict(sys.modules,
                            {'worldmirror_transfer_probe': SimpleNamespace(stop_app=Mock(return_value={'state': 'stopped', 'tasks': 0}))}):
            m.CORE.write_text('def fit(*args): raise AssertionError("Never run fitting in a transport test")\n')
            catalog = {}
            def put(key, data):
                path = root / 'sources' / key
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                catalog[key] = {'path': path.relative_to(root).as_posix(), 'sha256': m.sha(data), 'bytes': len(data)}
                m.CATALOG.write_text(json.dumps(catalog))
            xyz = np.array([[x, y, z + 349.2] for x in (1., 2.) for y in (3., 4.) for z in (0., 1.)])
            rows = np.zeros(8, dtype=[('xyz', '<f4', 3), ('rgb', 'u1', 3)])
            rows['xyz'] = xyz
            put('scene.ply', m.HEADER.format(8).encode() + rows.tobytes())
            photo = 'IMG_20240306_133505.jpg'
            buf = io.BytesIO()
            Image.new('RGB', (40, 20), 'red').save(buf, 'JPEG', exif=Image.Exif())
            put('photos/' + photo, buf.getvalue())
            tags = {'crop': {'rotation_z': np.pi / 2}, 'markers': [
                {'id': f'marker-{i:02d}', 'tag': tag, 'photos': [photo]}
                for i, tag in enumerate(m.TARGETS, 1)]}
            put('tags.json', json.dumps(tags).encode())
            summary = {'floor': {'normal': [0., 0., 1.], 'offset': -.25}, 'markers': {},
                       'params': {'rotation_z': np.pi / 2, 'display_z_offset': 349.2}}
            for marker in tags['markers']:
                summary['markers'][marker['id']] = {'tag': marker['tag'], 'count': 8,
                    'bbox': [[-4., 1., 0.], [-3., 2., 1.]], 'height': 1., 'flags': [], 'seed_distance': 0., 'base_above_floor': .03}
                put('segments/' + marker['id'] + '.u32', np.arange(8, dtype='<u4').tobytes())
            put('segments/summary.json', json.dumps(summary).encode())
            review = {'segments': {'marker-01': 'approved'}, 'crops': {photo: [.1, .2, .9, .8]},
                      'models': {}, 'coverage_threshold': .7}
            def save_review():
                put('review.md', ('# Owner review\n\n```json\n' + json.dumps(review) + '\n```\n').encode())
            save_review()
            yield root, put, review, save_review


def glb():
    # A small embedded textured triangle, sufficient to exercise the actual GLB contract reader.
    png = io.BytesIO()
    Image.new('RGB', (1, 1), 'red').save(png, 'PNG')
    data = struct.pack('<9f6f3I', 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 2) + png.getvalue()
    doc = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(data)}],
           'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 36},
                           {'buffer': 0, 'byteOffset': 36, 'byteLength': 24},
                           {'buffer': 0, 'byteOffset': 60, 'byteLength': 12},
                           {'buffer': 0, 'byteOffset': 72, 'byteLength': len(png.getvalue())}],
           'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'},
                         {'bufferView': 1, 'componentType': 5126, 'count': 3, 'type': 'VEC2'},
                         {'bufferView': 2, 'componentType': 5125, 'count': 3, 'type': 'SCALAR'}],
           'images': [{'bufferView': 3, 'mimeType': 'image/png'}], 'textures': [{'source': 0}],
           'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}],
           'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'TEXCOORD_0': 1}, 'indices': 2, 'material': 0}]}],
           'nodes': [{'mesh': 0}], 'scenes': [{'nodes': [0]}], 'scene': 0}
    raw = json.dumps(doc).encode()
    raw += b' ' * (-len(raw) % 4)
    data += b'\0' * (-len(data) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(raw) + len(data)) +
            struct.pack('<I4s', len(raw), b'JSON') + raw + struct.pack('<I4s', len(data), b'BIN\0') + data)


def results(m, plan):
    files, fits, payloads = {}, {}, {}
    for target in plan['targets']:
        tag = target['tag']
        name = f'models/tag-{tag}.glb'
        payloads[name] = glb()
        fits[str(tag)] = {'matrix': np.eye(4).ravel(order='F').tolist(), 'coverage': .75, 'mean_cm': 1.2,
                         'model': m.MODEL, 'revision': m.WEIGHTS_REVISION, 'crop_sha256': target['crop_sha256'],
                         'contact': target['contact'], 'floor_z': target['floor_z']}
    payloads['models/fits.json'] = json.dumps(fits).encode()
    for name, data in payloads.items():
        files[name] = {'bytes': len(data), 'sha256': m.sha(data)}
    payloads['report.json'] = json.dumps({'files': files, 'failed': [], 'model': m.MODEL,
        'revision': m.WEIGHTS_REVISION, 'code_revision': m.CODE_REVISION}).encode()
    return [row for name, data in payloads.items() for row in m.records(name, data)]


class ObjectsCloudTests(unittest.TestCase):
    def built_preflight(self, m, digest):
        (m.OUTPUT / 'preflight-receipt.json').write_text(json.dumps({'status': 'built', 'plan_sha256': digest}))

    def test_plan_bounds(self):
        m = load()
        self.assertEqual(m.VERTICES, 712312)
        self.assertEqual(m.OUTPUT, m.ROOT / '.local/reconstruction/ffs-th0028-objects-v2')
        with fixture(m) as (root, _, _, _):
            plan = m.prepare()
            self.assertEqual(m.TARGETS, (17, 69, 12, 22, 13, 18, 32))
            self.assertEqual(plan['resources']['operational_allowance_usd'], 10)
            self.assertIn(plan['resources']['gpu'], ('L4', 'A10G'))
            self.assertLessEqual(plan['resources']['timeout'], 1800)
            self.assertNotIn('retries', plan['resources'])
            self.assertEqual([t['tag'] for t in plan['targets']], [17])
            self.assertEqual(len(plan['skipped']), 6)
            points = np.load(m.OUTPUT / 'inputs' / 'tag-17.npy', allow_pickle=False)
            np.testing.assert_allclose(points[:, :2], [[-y, x] for x in (1., 2.) for y in (3., 4.) for _ in (0., 1.)], atol=1e-6)
            np.testing.assert_allclose(points[:, 2], [0, 1] * 4, atol=2e-5)
            self.assertEqual(plan['targets'][0]['floor_z'], .25)
            self.assertEqual(m.MAX_FACES, 40000)
            self.assertLessEqual(m.MAX_GLB_BYTES, 2000000)
            self.assertEqual(m.verify_plan(m.sha((m.OUTPUT / 'plan.json').read_bytes())), plan)
            with self.assertRaises(FileExistsError):
                m.prepare()
            # Reservation must survive a build error; a second call must not even construct an app.
            digest = m.sha((m.OUTPUT / 'plan.json').read_bytes())
            self.built_preflight(m, digest)
            with patch.object(m, 'create', side_effect=RuntimeError('synthetic build failure')) as create:
                with self.assertRaisesRegex(RuntimeError, 'synthetic build failure'):
                    m.execute(digest)
                saved = (m.OUTPUT / 'receipt.json').read_bytes()
                self.assertEqual(json.loads(saved)['status'], 'failed-or-uncertain')
                with self.assertRaises(FileExistsError):
                    m.execute(digest)
                self.assertEqual(create.call_count, 1)
                self.assertEqual((m.OUTPUT / 'receipt.json').read_bytes(), saved)
            (m.OUTPUT / 'inputs' / 'tag-17.npy').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                m.verify_plan(digest)

        # Fake lifecycle covers cancellation, late review revocation and cleanup without contacting Modal.
        for mode in ('success', 'interruption', 'revocation'):
            with self.subTest(lifecycle=mode), fixture(m) as (_, _, review, save_review):
                plan = m.prepare()
                digest = m.sha((m.OUTPUT / 'plan.json').read_bytes())
                self.built_preflight(m, digest)
                stop = Mock(return_value={'state': 'stopped', 'tasks': 0})
                @asynccontextmanager
                async def run_context(**kwargs):
                    yield
                async def remote():
                    for index, row in enumerate(results(m, plan)):
                        yield row
                        if mode == 'interruption' and index == 0:
                            raise asyncio.CancelledError('synthetic cancellation')
                    if mode == 'revocation':
                        review['segments']['marker-01'] = 'rejected'; save_review()
                app = SimpleNamespace(app_id='ap-synthetic', run=SimpleNamespace(aio=run_context))
                fn = SimpleNamespace(remote_gen=SimpleNamespace(aio=remote))
                fake_modal = SimpleNamespace(enable_output=nullcontext)
                with patch.object(m, 'create', return_value=(app, fn)), patch.dict(sys.modules,
                        {'worldmirror_transfer_probe': SimpleNamespace(stop_app=stop), 'modal': fake_modal}):
                    if mode == 'success':
                        self.assertEqual(m.execute(digest)['status'], 'objects-returned-review-pending')
                    else:
                        with self.assertRaises(asyncio.CancelledError if mode == 'interruption' else ValueError):
                            m.execute(digest)
                        self.assertNotIn('models/tag-17.glb', json.loads(m.CATALOG.read_text()))
                    stop.assert_called_once_with('ap-synthetic')
                    self.assertEqual(json.loads((m.OUTPUT / 'receipt.json').read_text())['cleanup']['state'], 'stopped')

    def test_contact_surface_and_coordinate_binding(self):
        m = load()
        with fixture(m):
            plan = m.prepare()
            self.assertEqual((plan['targets'][0]['contact'], plan['targets'][0]['floor_z']), ('floor', .25))
        with fixture(m) as (root, put, _, _):
            summary = json.loads((root / 'sources/segments/summary.json').read_text())
            summary['markers']['marker-01']['base_above_floor'] = .031
            put('segments/summary.json', json.dumps(summary).encode())
            header = m.HEADER.format(8).encode()
            rows = np.frombuffer((root / 'sources/scene.ply').read_bytes(),
                dtype=[('xyz', '<f4', 3), ('rgb', 'u1', 3)], offset=len(header)).copy()
            rows['xyz'][:, 2] += 1
            put('scene.ply', header + rows.tobytes())
            with patch.object(m, 'subsample', side_effect=lambda points: points[points[:, 2] > 1.5]):
                plan = m.prepare()
            target = plan['targets'][0]
            self.assertEqual(target['contact'], 'support')
            self.assertAlmostEqual(target['floor_z'], 1., places=4)
            self.assertGreater(np.load(m.OUTPUT / 'inputs/tag-17.npy')[:, 2].min(), 1.5)
            out = root / 'received'; out.mkdir()
            asyncio.run(m.receive(stream(results(m, plan)), out, plan))
            fit = json.loads((out / 'models/fits.json').read_text())['17']
            self.assertEqual((fit['contact'], fit['floor_z']), (target['contact'], target['floor_z']))
        for key in ('rotation_z', 'display_z_offset'):
            with self.subTest(coordinates=key), fixture(m) as (root, put, _, _):
                summary = json.loads((root / 'sources/segments/summary.json').read_text())
                summary['params'][key] += .1
                put('segments/summary.json', json.dumps(summary).encode())
                with self.assertRaisesRegex(ValueError, 'coordinate mismatch'): m.prepare()
                self.assertFalse(m.OUTPUT.exists())

    def test_build_preflight_and_gpu_gate(self):
        m = load()
        for status in (None, 'failed-or-uncertain', 'wrong-plan'):
            with self.subTest(preflight=status), fixture(m):
                m.prepare(); digest = m.sha((m.OUTPUT / 'plan.json').read_bytes())
                if status is not None:
                    (m.OUTPUT / 'preflight-receipt.json').write_text(json.dumps({
                        'status': 'built' if status == 'wrong-plan' else status,
                        'plan_sha256': '0' * 64 if status == 'wrong-plan' else digest}))
                with patch.object(m, 'create') as create, self.assertRaisesRegex(ValueError, 'built preflight'):
                    m.execute(digest)
                create.assert_not_called()
                self.assertFalse((m.OUTPUT / 'receipt.json').exists())
        with fixture(m):
            m.prepare(); digest = m.sha((m.OUTPUT / 'plan.json').read_bytes())
            @asynccontextmanager
            async def run_context(**kwargs):
                yield
            remote = Mock(side_effect=AssertionError('Preflight must never invoke the GPU function'))
            app = SimpleNamespace(app_id='ap-synthetic', run=SimpleNamespace(aio=run_context))
            fn = SimpleNamespace(remote_gen=SimpleNamespace(aio=remote))
            with patch.object(m, 'create', return_value=(app, fn)) as create, patch.dict(sys.modules,
                    {'modal': SimpleNamespace(enable_output=nullcontext)}):
                receipt = m.build_preflight(digest)
                self.assertEqual(receipt['status'], 'built')
                self.assertEqual(receipt['plan_sha256'], digest)
                self.assertEqual(receipt['cleanup']['state'], 'stopped')
                create.assert_called_once_with(m.OUTPUT / 'inputs')
                remote.assert_not_called()
                self.assertFalse((m.OUTPUT / 'receipt.json').exists())
                before = (m.OUTPUT / 'preflight-receipt.json').read_bytes()
                with self.assertRaises(FileExistsError): m.build_preflight(digest)
                self.assertEqual((m.OUTPUT / 'preflight-receipt.json').read_bytes(), before)
        with fixture(m):
            m.prepare(); digest = m.sha((m.OUTPUT / 'plan.json').read_bytes())
            with patch.object(m, 'create', side_effect=RuntimeError('build failed')):
                with self.assertRaisesRegex(RuntimeError, 'build failed'): m.build_preflight(digest)
            self.assertEqual(json.loads((m.OUTPUT / 'preflight-receipt.json').read_text())['status'], 'failed-or-uncertain')
            self.assertFalse((m.OUTPUT / 'receipt.json').exists())
        with fixture(m):
            m.prepare(); digest = m.sha((m.OUTPUT / 'plan.json').read_bytes())
            self.built_preflight(m, digest)
            with patch.dict(sys.modules, {'worldmirror_transfer_probe': None}), self.assertRaises(ModuleNotFoundError):
                m.execute(digest)
            self.assertFalse((m.OUTPUT / 'receipt.json').exists())
        with patch.object(m, 'build_preflight', return_value={'status': 'test-only'}) as preflight, patch('builtins.print'):
            m.main(['--build-preflight-approved-sha256', 'a' * 64])
            preflight.assert_called_once_with('a' * 64)

    def test_requires_review_crops_and_approved_segments(self):
        m = load()
        for change in ('no-crop', 'rejected', 'tampered-review', 'bad-box', 'bad-index', 'no-review'):
            with self.subTest(change=change), fixture(m) as (root, put, review, save_review):
                if change == 'no-crop': review['crops'] = {}; save_review()
                if change == 'rejected': review['segments']['marker-01'] = 'rejected'; save_review()
                if change == 'bad-box': review['crops'][next(iter(review['crops']))] = [0, 0, 2, 1]; save_review()
                if change == 'bad-index': put('segments/marker-01.u32', np.array([99] * 8, dtype='<u4').tobytes())
                if change == 'tampered-review': (root / 'sources/review.md').write_text('{}')
                if change == 'no-review':
                    catalog = json.loads(m.CATALOG.read_text()); del catalog['review.md']; m.CATALOG.write_text(json.dumps(catalog))
                with self.assertRaises(ValueError): m.prepare()
                self.assertFalse(m.OUTPUT.exists())
        with fixture(m) as (_, _, review, save_review):
            m.prepare()
            digest = m.sha((m.OUTPUT / 'plan.json').read_bytes())
            review['segments']['marker-01'] = 'rejected'; save_review()
            with self.assertRaises(ValueError): m.verify_plan(digest)
        # EXIF transpose precedes normalized crop conversion.
        image = Image.new('RGB', (40, 20), 'red'); exif = Image.Exif(); exif[274] = 6
        photo = io.BytesIO(); image.save(photo, 'JPEG', exif=exif)
        crop, box = m.crop_photo(photo.getvalue(), [0, 0, .5, 1])
        self.assertEqual(Image.open(io.BytesIO(crop)).size, (10, 40))
        self.assertEqual(box, [0, 0, 10, 40])
        points = np.arange(60001 * 3).reshape(-1, 3).astype(float)
        self.assertEqual(len(m.subsample(points)), 50000)
        np.testing.assert_equal(m.subsample(points), m.subsample(points))

    def test_receive_glb_size_and_names(self):
        m = load()
        with fixture(m) as (root, _, _, _):
            plan = m.prepare()
            rows = results(m, plan)
            out = root / 'received'; out.mkdir()
            report = asyncio.run(m.receive(stream(rows), out, plan))
            self.assertEqual(set(report['files']), {'models/tag-17.glb', 'models/fits.json'})
            with self.assertRaises(FileExistsError): asyncio.run(m.receive(stream(rows), out, plan))
            bad_rows = [[('../x.glb', 0, 1, b'x')], [('models/tag-21.glb', 0, 1, b'x')],
                        [('models/tag-17.glb', 0, m.MAX_GLB_BYTES + 1, b'x')],
                        [('models/tag-17.glb', 1, 1, b'x')], rows[:-1], rows + [rows[0]],
                        [('models/tag-17.glb', 0, 3, b'bad')] + rows[1:]]
            for i, bad in enumerate(bad_rows):
                folder = root / f'reject-{i}'; folder.mkdir()
                with self.subTest(i=i), self.assertRaises(ValueError):
                    asyncio.run(m.receive(stream(bad), folder, plan))
            # A self-consistent transport hash must not bypass fit or GLB semantic admission.
            original = {name: data for name, offset, total, data in rows}
            for case in ('bad-fit', 'wrong-crop', 'wrong-contact', 'wrong-floor', 'external-uri', 'nan-vertex',
                         'bad-accessor', 'bad-normal', 'bad-tangent', 'bad-color', 'bad-color-type',
                         'bad-color-normalization', 'unused-accessor', 'nan-normal'):
                payloads = dict(original)
                if case in ('bad-fit', 'wrong-crop', 'wrong-contact', 'wrong-floor'):
                    fits = json.loads(payloads['models/fits.json'])
                    field, value = {'bad-fit': ('coverage', -1), 'wrong-crop': ('crop_sha256', '0' * 64),
                                    'wrong-contact': ('contact', 'support'), 'wrong-floor': ('floor_z', .5)}[case]
                    fits['17'][field] = value
                    name = 'models/fits.json'; payloads[name] = json.dumps(fits).encode()
                else:
                    name = 'models/tag-17.glb'; data = payloads[name]
                    size = struct.unpack_from('<I', data, 12)[0]
                    doc = json.loads(data[20:20 + size]); binary = bytearray(data[28 + size:])
                    if case == 'external-uri': doc['images'][0]['uri'] = 'https://invalid.example/texture.png'
                    if case == 'bad-accessor': doc['accessors'][0]['count'] = 120001
                    if case == 'nan-vertex': struct.pack_into('<f', binary, 0, float('nan'))
                    attributes = doc['meshes'][0]['primitives'][0]['attributes']
                    if case in ('bad-normal', 'unused-accessor'):
                        doc['accessors'].append({**doc['accessors'][0], 'count': 120001})
                        if case == 'bad-normal': attributes['NORMAL'] = len(doc['accessors']) - 1
                    if case == 'bad-tangent': attributes['TANGENT'] = 0
                    if case == 'bad-color': attributes['COLOR_0'] = -1
                    if case in ('bad-color-type', 'bad-color-normalization'):
                        doc['accessors'].append({**doc['accessors'][0], 'componentType':
                            5125 if case == 'bad-color-type' else 5123})
                        attributes['COLOR_0'] = len(doc['accessors']) - 1
                    if case == 'nan-normal':
                        offset = len(binary); binary.extend(np.full((3, 3), np.nan, dtype='<f4').tobytes())
                        doc['buffers'][0]['byteLength'] = len(binary)
                        doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': 36})
                        doc['accessors'].append({'bufferView': len(doc['bufferViews']) - 1,
                            'componentType': 5126, 'count': 3, 'type': 'VEC3'})
                        attributes['NORMAL'] = len(doc['accessors']) - 1
                    raw = json.dumps(doc).encode(); raw += b' ' * (-len(raw) % 4)
                    payloads[name] = (struct.pack('<4sII', b'glTF', 2, 28 + len(raw) + len(binary)) +
                        struct.pack('<I4s', len(raw), b'JSON') + raw + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
                report = json.loads(payloads['report.json'])
                report['files'][name] = {'bytes': len(payloads[name]), 'sha256': m.sha(payloads[name])}
                payloads['report.json'] = json.dumps(report).encode()
                bad = [row for name, data in payloads.items() for row in m.records(name, data)]
                folder = root / case; folder.mkdir()
                with self.subTest(case=case), self.assertRaises(ValueError):
                    asyncio.run(m.receive(stream(bad), folder, plan))
            # The 2 MB transport splits into small records rather than triggering Modal blob uploads.
            chunks = list(m.records('models/tag-17.glb', b'a' * m.MAX_GLB_BYTES))
            self.assertTrue(all(len(row[3]) <= 512 * 1024 for row in chunks))
            self.assertEqual(sum(len(row[3]) for row in chunks), m.MAX_GLB_BYTES)

    def test_register_models(self):
        m = load()
        with fixture(m) as (root, _, _, _):
            plan = m.prepare()
            out = root / 'returned'; out.mkdir()
            report = asyncio.run(m.receive(stream(results(m, plan)), out, plan))
            m.register(out, report)
            catalog = json.loads(m.CATALOG.read_text())
            self.assertEqual(catalog['models/tag-17.glb']['type'], 'model/gltf-binary')
            self.assertEqual(catalog['models/fits.json']['type'], 'application/json')
            self.assertIn('scene.ply', catalog)
            before = m.CATALOG.read_bytes()
            with self.assertRaises(ValueError): m.register(out, report)
            self.assertEqual(m.CATALOG.read_bytes(), before)
        with fixture(m) as (root, _, _, _):
            plan = m.prepare(); out = root / 'returned'; out.mkdir()
            report = asyncio.run(m.receive(stream(results(m, plan)), out, plan))
            (out / 'models/tag-17.glb').write_bytes(b'tampered')
            before = m.CATALOG.read_bytes()
            with self.assertRaises(ValueError): m.register(out, report)
            self.assertEqual(m.CATALOG.read_bytes(), before)

    def test_worker_isolates_mid_run_failures(self):
        m = load()
        for failure_stage in ('mask', 'inference', 'mesh', 'texture', 'fit', 'all-mask'):
            with self.subTest(stage=failure_stage), fixture(m) as (root, _, review, save_review):
                review['segments'].update({'marker-02': 'approved', 'marker-03': 'approved'}); save_review()
                plan = m.prepare()
                class Predictor:
                    count = 0
                    def __init__(self, model): pass
                    def set_image(self, image): self.shape = image.shape[:2]
                    def predict(self, **kwargs):
                        self.count += 1
                        if failure_stage == 'all-mask' or (failure_stage == 'mask' and self.count == 2):
                            raise ValueError('x' * 400)
                        return np.ones((1, *self.shape), dtype=bool), [1.], None
                mesh = SimpleNamespace(vertices=np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]]), faces=np.array([[0, 1, 2]]))
                class Model:
                    count = 0
                    renderer = SimpleNamespace(set_chunk_size=lambda value: None)
                    def to(self, device): return self
                    def eval(self): return self
                    def __call__(self, images, **kwargs):
                        self.count += 1
                        if failure_stage == 'inference' and self.count == 2: raise ValueError('x' * 400)
                        return [self.count]
                    def extract_mesh(self, code, *args, **kwargs):
                        if failure_stage == 'mesh' and code[0] == 2: raise ValueError('x' * 400)
                        return [mesh]
                def texture(mesh, model, code):
                    if failure_stage == 'texture' and code == 2: raise ValueError('x' * 400)
                    return mesh, glb()
                fit_calls = []
                def fit(*args):
                    fit_calls.append(args[-1])
                    if failure_stage == 'fit' and len(fit_calls) == 2: raise ValueError('x' * 400)
                    return {'matrix': np.eye(4).ravel(order='F').tolist(), 'coverage': .5, 'mean_cm': 1., 'rotation_index': 0}
                torch = SimpleNamespace(manual_seed=lambda seed: None, set_num_threads=lambda count: None,
                    inference_mode=nullcontext, no_grad=nullcontext, cuda=SimpleNamespace(empty_cache=lambda: None,
                    get_device_name=lambda device: 'synthetic GPU', max_memory_allocated=lambda: 0))
                model_loader = Mock(return_value=Model())
                modules = {'torch': torch, 'moderngl': SimpleNamespace(create_context=Mock()),
                    'sam2.build_sam': SimpleNamespace(build_sam2=lambda *args, **kwargs: object()),
                    'sam2.sam2_image_predictor': SimpleNamespace(SAM2ImagePredictor=Predictor),
                    'tsr.system': SimpleNamespace(TSR=SimpleNamespace(from_pretrained=model_loader)),
                    'tsr.utils': SimpleNamespace(resize_foreground=lambda image, ratio: image),
                    'ffs_fit': SimpleNamespace(fit=fit), 'trimesh': SimpleNamespace(load=lambda *args, **kwargs: mesh)}
                read_text = Path.read_text
                def read(path, *args, **kwargs):
                    return '{}' if path.as_posix() == '/weights/packages.json' else read_text(path, *args, **kwargs)
                with patch.dict(sys.modules, modules), patch.object(m, 'textured_mesh', side_effect=texture), patch.object(Path, 'read_text', read):
                    rows = list(m.worker(m.OUTPUT / 'inputs'))
                out = root / 'received'; out.mkdir()
                report = asyncio.run(m.receive(stream(rows), out, plan))
                if failure_stage == 'all-mask':
                    model_loader.assert_not_called()
                    self.assertEqual(report['failed'], [{'tag': t['tag'], 'stage': 'mask', 'error': 'x' * 300} for t in plan['targets']])
                    self.assertEqual(set(report['files']), {'models/fits.json'})
                    self.assertEqual(json.loads((out / 'models/fits.json').read_text()), {})
                    continue
                self.assertEqual(report['failed'], [{'tag': 69, 'stage': failure_stage, 'error': 'x' * 300}])
                self.assertEqual(set(report['files']), {'models/tag-17.glb', 'models/tag-12.glb', 'models/fits.json'})
                m.register(out, report)
                self.assertNotIn('models/tag-69.glb', json.loads(m.CATALOG.read_text()))
                payloads = {name: data for name, offset, total, data in rows}
                for invalid in ([{'tag': 21, 'stage': 'fit', 'error': 'bad'}], report['failed'] * 2,
                                report['failed'] + [{'tag': 17, 'stage': 'fit', 'error': 'also returned'}],
                                [{'tag': 69, 'stage': 'fit', 'error': 'x' * 301}], []):
                    altered = {**report, 'failed': invalid}
                    changed = {**payloads, 'report.json': json.dumps(altered).encode()}
                    destination = root / f'rejected-{len(list(root.glob("rejected-*")))}'; destination.mkdir()
                    bad = [row for name, data in changed.items() for row in m.records(name, data)]
                    with self.assertRaises(ValueError): asyncio.run(m.receive(stream(bad), destination, plan))

    def test_build_recipe_contains_native_and_glb_guards(self):
        m = load()
        image = Mock()
        for name in ('apt_install', 'env', 'pip_install', 'run_commands', 'add_local_file', 'add_local_dir'):
            getattr(image, name).return_value = image
        app = Mock(); app.function.return_value = lambda worker: worker
        modal = SimpleNamespace(Image=SimpleNamespace(from_registry=Mock(return_value=image)), App=Mock(return_value=app))
        with fixture(m), patch.dict(sys.modules, {'modal': modal}):
            m.prepare(); m.create(m.OUTPUT / 'inputs')
        self.assertTrue({'libgl1', 'libegl1', 'libegl-mesa0'} <= set(image.apt_install.call_args.args))
        env = {key: value for call in image.env.call_args_list for key, value in call.args[0].items()}
        self.assertEqual(env['__EGL_VENDOR_LIBRARY_FILENAMES'], '/usr/share/glvnd/egl_vendor.d/50_mesa.json')
        compiler_env = image.env.call_args_list[0].args[0]
        self.assertEqual({key: compiler_env.get(key) for key in ('CC', 'CXX', 'LDCXXSHARED')},
                         {'CC': 'gcc', 'CXX': 'g++', 'LDCXXSHARED': 'g++ -pthread -shared'})
        calls = [call[0] for call in image.mock_calls]
        self.assertLess(calls.index('env'), calls.index('pip_install'))
        self.assertLess(calls.index('env'), calls.index('run_commands'))
        commands = '\n'.join(command for call in image.run_commands.call_args_list for command in call.args)
        self.assertIn(f'pip install --no-build-isolation --no-deps git+https://github.com/tatsy/torchmcubes.git@{m.MCUBES_REVISION}', commands)
        self.assertIn("import torch, torchmcubes_module; assert hasattr(torchmcubes_module, 'mcubes_cuda')", commands)
        self.assertIn('from ffs_objects_cloud import build_checks; build_checks()', commands)
        copies = [call for call in image.add_local_file.call_args_list if call.args[0] == MODULE]
        self.assertEqual(len(copies), 1)
        self.assertTrue(copies[0].kwargs['copy'])
        self.assertNotIn('retries', app.function.call_args.kwargs)
        self.assertTrue(app.function.call_args.kwargs['block_network'])
        self.assertEqual(m.RESOURCES['client_timeout'], 6000)
        self.assertEqual(app.function.call_args.kwargs['timeout'], 1800)
        self.assertIn("validate_glb(mesh.export(file_type='glb'))", inspect.getsource(m.build_checks))
        self.assertIn('PBRMaterial', inspect.getsource(m.build_checks))

    def test_shared_artifact_policy_and_plan_binding(self):
        m = load()
        self.assertEqual(m.validate_glb(glb())['faces'], 1)
        with fixture(m) as (root, _, _, _):
            helper = root / 'ffs_artifacts.py'
            helper.write_bytes(b'# synthetic policy revision\n')
            with patch.object(m, 'ARTIFACTS', helper, create=True):
                plan = m.prepare()
                self.assertEqual(plan.get('artifacts_sha256'), m.sha(helper.read_bytes()))
                digest = m.sha((m.OUTPUT / 'plan.json').read_bytes())
                m.verify_plan(digest)
                helper.write_bytes(b'# changed policy\n')
                with self.assertRaises(ValueError): m.verify_plan(digest)
        target = {'crop_sha256': 'a' * 64, 'contact': 'floor', 'floor_z': 0}
        entry = {**target, 'matrix': np.eye(4).ravel(order='F').tolist(), 'coverage': .5,
                 'mean_cm': 1., 'model': m.MODEL, 'revision': m.WEIGHTS_REVISION}
        m.validate_fit(entry, target)
        for key in ('model', 'revision'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.validate_fit({**entry, key: 'forged'}, {**target, key: 'forged'})
        with self.assertRaises(ValueError): m.validate_glb(b'x' * (m.MAX_GLB_BYTES + 1))

    def test_build_packages_shared_artifact_policy(self):
        m = load()
        image = Mock()
        for name in ('apt_install', 'env', 'pip_install', 'run_commands', 'add_local_file', 'add_local_dir'):
            getattr(image, name).return_value = image
        app = Mock(); app.function.return_value = lambda worker: worker
        modal = SimpleNamespace(Image=SimpleNamespace(from_registry=Mock(return_value=image)), App=Mock(return_value=app))
        with patch.dict(sys.modules, {'modal': modal}), patch.object(m.importlib.metadata, 'version', return_value='1.6.1'):
            m.create(Path('synthetic-inputs'))
        copies = [call for call in image.add_local_file.call_args_list
                  if call.args[0] == MODULE.with_name('ffs_artifacts.py')]
        self.assertEqual(len(copies), 1)
        self.assertEqual(copies[0].args[1], '/root/ffs_artifacts.py')
        self.assertTrue(copies[0].kwargs['copy'])
        calls = image.mock_calls
        helper_index = next(i for i, call in enumerate(calls) if call[0] == 'add_local_file'
                            and call.args[0] == MODULE.with_name('ffs_artifacts.py'))
        check_index = next(i for i, call in enumerate(calls) if call[0] == 'run_commands'
                           and 'build_checks' in str(call.args))
        self.assertLess(helper_index, check_index)

    def test_real_sdk_construction(self):
        m = load()
        self.assertEqual(m.importlib.metadata.version('modal'), '1.6.1')
        with fixture(m):
            m.prepare()
            app, fn = m.create(m.OUTPUT / 'inputs')
            self.assertIsNone(app.app_id)
            self.assertIsNotNone(fn)
            self.assertTrue(inspect.isgeneratorfunction(m.worker))


if __name__ == '__main__':
    unittest.main()
