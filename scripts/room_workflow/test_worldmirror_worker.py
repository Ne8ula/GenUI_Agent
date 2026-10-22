"""Offline admission/capture tests; the neural model is never loaded."""
import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from PIL import Image

import worldmirror_worker as worker


def request(sizes=None):
    images = []
    for i, size in enumerate(sizes or [(64, 48)]*5):
        stream = io.BytesIO()
        Image.new('RGB', size, (20*i, 80, 100)).save(stream, format='PNG')
        data = stream.getvalue()
        images.append({'id': f'p{i}', 'sha256': hashlib.sha256(data).hexdigest(),
                       'data_base64': base64.b64encode(data).decode()})
    return {'version': 1, 'operation': 'analyze', 'job_id': 'room-test', 'images': images}


def predictions(count=5, height=42, width=56):
    poses = np.broadcast_to(np.eye(4, dtype=np.float32), (1, count, 4, 4)).copy()
    intrinsics = np.broadcast_to(np.array([[56, 0, 28], [0, 56, 21], [0, 0, 1]],
                                         dtype=np.float32), (1, count, 3, 3)).copy()
    return {'depth': np.ones((1, count, height, width, 1), np.float32)*2,
            'pts3d': np.ones((1, count, height, width, 3), np.float32),
            'camera_poses': poses, 'camera_intrs': intrinsics}


class WorldMirrorWorkerTests(unittest.TestCase):
    def test_capture_keeps_raw_fields_source_order_and_exact_processed_rgb(self):
        req = request(); before = copy.deepcopy(req); raw = predictions()
        def infer(source, snapshot, paths, target):
            self.assertEqual(target, 56)
            self.assertEqual([Path(p).name for p in paths], [f'p{i}.png' for i in range(5)])
            rgb = np.stack([np.asarray(Image.open(p).resize((56, 42), Image.Resampling.BICUBIC),
                                       dtype=np.float32).transpose(2, 0, 1)/255 for p in paths])[None]
            return raw, rgb, 1.25
        with tempfile.TemporaryDirectory() as directory, patch.object(worker, 'run_model', side_effect=infer):
            output = Path(directory)/'candidate'
            result = worker.execute(req, Path('source'), Path('snapshot'), output)
            self.assertEqual(result['kind'], 'eva-worldmirror-raw-v1')
            self.assertEqual(result['units'], 'unverified-scale')
            self.assertFalse(result['candidate_promoted'])
            self.assertEqual(result['preprocessing'][0], {'source_size': [64, 48], 'resized_size': [56, 42],
                                                        'crop_left_top': [0, 0], 'model_size': [56, 42]})
            self.assertEqual(result['original_input_hashes'], [{k: p[k] for k in ('id', 'sha256')} for p in req['images']])
            with np.load(output/'raw-fields.npz', allow_pickle=False) as saved:
                for name in raw:
                    np.testing.assert_array_equal(saved[name], raw[name])
                np.testing.assert_allclose(saved['rgb'][0, 3, :, 0, 0], np.array([60, 80, 100])/255)
            self.assertEqual(result['fields_sha256'], hashlib.sha256((output/'raw-fields.npz').read_bytes()).hexdigest())
            self.assertEqual(json.loads((output/'manifest.json').read_text()), result)
            with self.assertRaises(FileExistsError):
                worker.execute(req, Path('source'), Path('snapshot'), output)
        self.assertEqual(req, before)

    def test_priors_authority_paths_and_hash_changes_fail_before_model(self):
        req = request(); variants = [{**req, key: value} for key, value in
                                    [('depth', []), ('camera_poses', []), ('generated_images', []),
                                     ('approved', True), ('config', {})]]
        for key, value in [('id', '../p0'), ('sha256', '0'*64), ('camera', {})]:
            changed = copy.deepcopy(req); changed['images'][0][key] = value; variants.append(changed)
        changed = copy.deepcopy(req); changed['images'][1]['id'] = 'P0'; variants.append(changed)
        for value in variants:
            with self.subTest(value=list(value)), tempfile.TemporaryDirectory() as directory:
                with patch.object(worker, 'run_model', side_effect=AssertionError('No inference allowed')):
                    with self.assertRaises(ValueError):
                        worker.execute(value, Path('source'), Path('snapshot'), Path(directory)/'output')

    def test_mixed_rasters_and_duplicate_pixels_are_rejected_before_model(self):
        different = request([(64, 48)]*4+[(48, 64)])
        duplicate = request(); stream = io.BytesIO()
        Image.new('RGB', (64, 48), (0, 80, 100)).save(stream, format='PNG', compress_level=0)
        data = stream.getvalue(); duplicate['images'][1].update(
            sha256=hashlib.sha256(data).hexdigest(), data_base64=base64.b64encode(data).decode())
        for req in (different, duplicate):
            with tempfile.TemporaryDirectory() as directory, patch.object(worker, 'run_model', side_effect=AssertionError('No inference allowed')):
                with self.assertRaises(ValueError):
                    worker.execute(req, Path('source'), Path('snapshot'), Path(directory)/'output')

    def test_exif_orientation_is_applied_before_raster_metadata(self):
        req = request([(48, 64)]*5)
        stream = io.BytesIO(); exif = Image.Exif(); exif[274] = 6
        Image.new('RGB', (64, 48), (0, 80, 100)).save(stream, format='JPEG', exif=exif)
        data = stream.getvalue(); req['images'][0].update(sha256=hashlib.sha256(data).hexdigest(),
                                                        data_base64=base64.b64encode(data).decode())
        with tempfile.TemporaryDirectory() as directory:
            prepared = worker.prepare(req, Path(directory))
            self.assertEqual(prepared['preprocessing'][0]['source_size'], [48, 64])
            self.assertEqual(prepared['preprocessing'][0]['model_size'], [42, 56])
            with Image.open(prepared['paths'][0]) as normalized:
                self.assertEqual(normalized.size, (48, 64))

    def test_wrong_raw_shapes_nonfinite_depth_and_invalid_cameras_are_not_admitted(self):
        modifications = [lambda r: r.pop('pts3d'),
                         lambda r: r.update(depth=r['depth'][0]),
                         lambda r: r['depth'].fill(float('nan')),
                         lambda r: r['depth'].fill(0),
                         lambda r: r['camera_poses'].__setitem__((0, 0, 0, 0), 2),
                         lambda r: r['camera_intrs'].__setitem__((0, 0, 0, 0), -1)]
        for modify in modifications:
            raw = predictions(); modify(raw)
            with tempfile.TemporaryDirectory() as directory, patch.object(worker, 'run_model',
                    return_value=(raw, np.zeros((1, 5, 3, 42, 56), np.float32), 1.0)):
                output = Path(directory)/'output'
                with self.assertRaises(ValueError):
                    worker.execute(request(), Path('source'), Path('snapshot'), output)
                self.assertFalse((output/'manifest.json').exists())

    def test_processed_rgb_mismatch_is_not_admitted(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(worker, 'run_model',
                return_value=(predictions(), np.zeros((1, 5, 3, 42, 56), np.float32), 1.0)):
            with self.assertRaisesRegex(ValueError, 'RGB'):
                worker.execute(request(), Path('source'), Path('snapshot'), Path(directory)/'output')

    def test_loader_rejects_unpinned_or_dirty_source_before_import(self):
        for revision, dirty in [('other', ''), (worker.WORLDMIRROR_SOURCE_REVISION, ' M pipeline.py')]:
            with patch.object(worker.subprocess, 'check_output', side_effect=[revision, dirty]), patch.object(
                    worker.importlib, 'import_module', side_effect=AssertionError('No import allowed')):
                with self.assertRaises(ValueError):
                    worker.run_model(Path('source'), Path('snapshot'), [], 518)

    def test_loader_uses_local_snapshot_and_no_grad_rgb_only_private_route(self):
        active = False
        @contextmanager
        def inference_mode():
            nonlocal active
            active = True
            try:
                yield
            finally:
                active = False
        source, snapshot = Path('source').resolve(), Path('snapshot').resolve()
        def infer(paths, target, camera_prior, depth_prior):
            self.assertTrue(active)
            self.assertEqual((paths, target, camera_prior, depth_prior), (['p0.png'], 518, None, None))
            return 'dense-output'
        def load(path, **kwargs):
            self.assertEqual(path, str(snapshot))
            self.assertEqual(kwargs, {'subfolder': 'HY-WorldMirror-2.0'})
            return SimpleNamespace(_run_inference=infer)
        module = SimpleNamespace(__file__=str(source/'hyworld2/worldrecon/pipeline.py'),
                                 WorldMirrorPipeline=SimpleNamespace(from_pretrained=load))
        torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True),
                                manual_seed=lambda seed: None, inference_mode=inference_mode)
        with patch.object(worker.subprocess, 'check_output', side_effect=[worker.WORLDMIRROR_SOURCE_REVISION, '']), \
                patch.object(worker, 'verify_snapshot'), patch.object(worker.importlib, 'import_module', return_value=module), \
                patch.dict(worker.sys.modules, {'torch': torch}):
            self.assertEqual(worker.run_model(source, snapshot, ['p0.png'], 518), 'dense-output')
        self.assertFalse(active)

    def test_snapshot_verification_checks_bytes_and_rejects_yaml_override(self):
        config, weights = b'{}', b'synthetic-safetensors'
        pins = {'config.json': (len(config), 'git-blob-sha1', hashlib.sha1(b'blob 2\0'+config).hexdigest()),
                'model.safetensors': (len(weights), 'sha256', hashlib.sha256(weights).hexdigest())}
        with tempfile.TemporaryDirectory() as directory, patch.object(worker, 'MODEL_FILES', pins):
            folder = Path(directory)/'HY-WorldMirror-2.0'; folder.mkdir()
            (folder/'config.json').write_bytes(config); (folder/'model.safetensors').write_bytes(weights)
            worker.verify_snapshot(Path(directory))
            (folder/'config.yaml').write_text('override: true')
            with self.assertRaises(ValueError):
                worker.verify_snapshot(Path(directory))
            (folder/'config.yaml').unlink(); (folder/'model.safetensors').write_bytes(b'x'*len(weights))
            with self.assertRaises(ValueError):
                worker.verify_snapshot(Path(directory))


if __name__ == '__main__':
    unittest.main()
