"""Synthetic CPU conversion/hostile artifact tests, not neural model evidence."""
import copy
import hashlib
import io
import json
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import numpy as np
from PIL import Image

import worldmirror_candidate as converter
from complete_candidate import geometry_hash
from geometry import make_mesh, unproject
from inference import fingerprint
from test_worldmirror_worker import request
import worldmirror_worker as worker


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fixture(root):
    req = request()
    raw = root/'raw'; raw.mkdir()
    normalized = root/'normalized'; normalized.mkdir()
    prepared = worker.prepare(req, normalized)
    count = len(req['images']); width, height = prepared['preprocessing'][0]['model_size']
    poses = np.tile(np.eye(4, dtype=np.float32), (1, count, 1, 1))
    poses[0, :, 0, 3] = np.arange(count)*.025
    k = np.array([[56., 0, 27.5], [0, 56., 20.5], [0, 0, 1]], np.float32)
    intrinsics = np.tile(k, (1, count, 1, 1))
    depth = np.full((1, count, height, width, 1), .4, np.float32)
    points = []
    for pose in poses[0]:
        w2c = np.column_stack((pose[:3, :3].T, -pose[:3, :3].T@pose[:3, 3]))
        points.append(unproject(depth[0, 0, ..., 0], k, w2c))
    fields = {'depth': depth, 'pts3d': np.asarray(points, np.float32)[None],
              'camera_poses': poses, 'camera_intrs': intrinsics, 'rgb': prepared['rgb']}
    originals = [{key: image[key] for key in ('id', 'sha256')} for image in req['images']]
    manifest = {'version': 1, 'kind': 'eva-worldmirror-raw-v1', 'job_id': req['job_id'],
                'units': 'unverified-scale', 'candidate_promoted': False,
                'source_revision': worker.WORLDMIRROR_SOURCE_REVISION,
                'checkpoint_revision': worker.CHECKPOINT_REVISION,
                'original_input_hashes': originals, 'original_inputs_sha256': fingerprint(originals),
                'normalization': prepared['normalization'], 'preprocessing': prepared['preprocessing'],
                'target_size': prepared['target'], 'inference_seconds': 1.25,
                'camera_convention': 'OpenCV camera-to-world; depth is camera Z; pts3d is world-space',
                'fields_file': 'raw-fields.npz', 'fields_sha256': '',
                'field_shapes': {name: list(value.shape) for name, value in fields.items()},
                'implementation_sha256': {name: sha(Path(worker.__file__).with_name(name).read_bytes())
                    for name in ('worldmirror_worker.py', 'worldmirror_adapter.py', 'inference.py', 'geometry.py')},
                'limitations': ['Synthetic fixture only; no model execution.']}
    save_raw(raw, manifest, fields)
    angle = .21
    rotation = np.array([[np.cos(angle), -np.sin(angle), 0],
                         [np.sin(angle), np.cos(angle), 0], [0, 0, 1.]])
    scale, translation = 1.7, np.array([.12, -.06, .08])
    pixel = np.array([[518/56, 0, (518/56-1)/2],
                      [0, 392/42, (392/42-1)/2+63], [0, 0, 1]])
    cameras, target_points = [], []
    valid = np.zeros((count, 518, 518), bool); valid[:, 63:455] = True
    for i, pose in enumerate(poses[0]):
        center = scale*rotation@pose[:3, 3]+translation
        r = pose[:3, :3].T@rotation.T
        extrinsic = np.column_stack((r, -r@center))
        cameras.append({'image_id': originals[i]['id'], 'intrinsics': (pixel@k).tolist(),
                        'world_to_camera': extrinsic.tolist(), 'center': center.tolist(),
                        'depth_kind': 'OpenCV-z', 'units': 'relative'})
        target_points.append(unproject(np.full((518, 518), .4*scale), pixel@k, extrinsic))
    rgb = np.full((count, 518, 518, 3), .5)
    mesh = make_mesh(np.asarray(target_points), rgb, valid)
    transforms = [{'source_size': [64, 48], 'resized_size': [518, 392],
                   'padding_left_top': [0, 63], 'model_size': [518, 518],
                   'pixel_center_convention': 'integer'} for _ in originals]
    binding = {'analysis_geometry_sha256': geometry_hash(mesh), 'model_config_sha256': 'a'*64,
               'original_inputs_sha256': fingerprint({'images': originals, 'masks': {}})}
    baseline = {'version': 1, 'job_id': req['job_id'], 'status': 'complete', 'units': 'relative',
                'model_execution': 'executed', 'analysis_binding': binding, **binding,
                'original_input_hashes': originals, 'preprocessing': transforms,
                'arms': {'A': {'status': 'complete', 'geometry': mesh, 'cameras': cameras}}}
    result_path, request_path = root/'result.json', root/'request.json'
    result_path.write_text(json.dumps(baseline), encoding='utf-8')
    request_path.write_text(json.dumps(req), encoding='utf-8')
    frozen = {'version': 1, 'status': 'provisional-completion-candidate', 'units': 'relative',
              'boundary_confirmed': False, 'input_result_sha256': sha(result_path.read_bytes()),
              'input_request_sha256': sha(request_path.read_bytes()), 'source_analysis_binding': binding,
              'voxel_relative': .009, 'numerical_ml_fields': {'confidence_excluded_lower_percentile': 0},
              'original_to_candidate_rotation': rotation.tolist(),
              'boundary': {'polygon': [[-1, -1], [1, -1], [1, 1], [-1, 1]], 'floor': -1, 'ceiling': 1}}
    frozen_path = root/'frozen.json'
    frozen_path.write_text(json.dumps(frozen), encoding='utf-8')
    return req, manifest, fields, baseline, frozen, (result_path, request_path, raw, frozen_path)


def save_raw(raw, manifest, fields=None, data=None):
    if fields is not None:
        stream = io.BytesIO(); np.savez_compressed(stream, **fields); data = stream.getvalue()
    if data is not None:
        (raw/'raw-fields.npz').write_bytes(data)
        manifest['fields_sha256'] = sha(data)
    (raw/'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')


class WorldMirrorCandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.req, self.manifest, self.fields, self.baseline, self.frozen, self.paths = fixture(self.root)

    def admit(self):
        return converter._admit_raw(self.paths[2], self.req)

    def run_candidate(self, output=None):
        # The JS executed-result boundary alone is replaced: all geometry and
        # registration/fusion below it execute real helpers on synthetic arrays.
        with patch.object(converter, 'validate_files', return_value=(copy.deepcopy(self.baseline), copy.deepcopy(self.req))) as validate:
            report = converter.run(*self.paths, output or self.root/'candidate')
            validate.assert_called_once_with(self.paths[0], self.paths[1])
            return report

    def test_admission_preserves_exact_original_bytes(self):
        manifest, arrays, manifest_bytes, fields_bytes = self.admit()
        self.assertEqual(manifest, self.manifest)
        self.assertEqual(manifest_bytes, (self.paths[2]/'manifest.json').read_bytes())
        self.assertEqual(fields_bytes, (self.paths[2]/'raw-fields.npz').read_bytes())
        for key in self.fields:
            np.testing.assert_array_equal(arrays[key], self.fields[key])

    def test_canvas_intrinsics_depth_rgb_and_padding(self):
        prediction = converter._prediction(self.fields, self.manifest, self.baseline)
        self.assertEqual(prediction['points'].shape, (5, 518, 518, 3))
        self.assertFalse(prediction['valid'][:, :63].any())
        self.assertTrue(prediction['valid'][:, 63:455].all())
        self.assertFalse(prediction['valid'][:, 455:].any())
        np.testing.assert_allclose(prediction['depth'][:, 63:455], .4)
        np.testing.assert_allclose(prediction['rgb'][2, 100, 100], [40/255, 80/255, 100/255])
        np.testing.assert_allclose(prediction['cameras'][0]['intrinsics'], self.baseline['arms']['A']['cameras'][0]['intrinsics'])
        np.testing.assert_allclose(prediction['points'][0, 259, 259],
                                   unproject(prediction['depth'][0], prediction['cameras'][0]['intrinsics'],
                                             prediction['cameras'][0]['world_to_camera'])[259, 259])

    def test_nontrivial_similarity_registration_and_cameras(self):
        prediction = converter._prediction(self.fields, self.manifest, self.baseline)
        report = converter._register(self.baseline, prediction)
        self.assertAlmostEqual(report['scale'], 1.7, places=5)
        self.assertLess(report['rms_relative_to_extent'], 1e-6)
        for actual, expected in zip(prediction['cameras'], self.baseline['arms']['A']['cameras']):
            self.assertEqual(actual['image_id'], expected['image_id'])
            np.testing.assert_allclose(actual['center'], expected['center'], atol=1e-6)
            np.testing.assert_allclose(actual['world_to_camera'], expected['world_to_camera'], atol=1e-6)
        np.testing.assert_allclose(prediction['depth'][:, 63:455], .68, atol=1e-6)

    def test_high_residual_is_rejected(self):
        prediction = converter._prediction(self.fields, self.manifest, self.baseline)
        prediction['points'] = np.random.default_rng(23).normal(size=prediction['points'].shape)
        with self.assertRaisesRegex(ValueError, 'residual'):
            converter._register(self.baseline, prediction)

    def test_full_conversion_report_and_coordinate_contract(self):
        output = self.root/'candidate'; report = self.run_candidate(output)
        self.assertEqual(set(p.name for p in output.iterdir()),
                         {'manifest.json', 'raw-fields.npz', 'raw.json', 'fused-bounded.json', 'candidate.json', 'report.json'})
        self.assertEqual(report['status'], 'provisional-completion-candidate')
        self.assertFalse(report['boundary_confirmed'])
        self.assertEqual(report['openings'], [])
        self.assertEqual(report['boundary'], self.frozen['boundary'])
        self.assertEqual(report['original_to_candidate_rotation'], self.frozen['original_to_candidate_rotation'])
        self.assertEqual(report['confidence_excluded_lower_percentile'], 0)
        self.assertEqual(report['voxel_relative'], .009)
        self.assertNotIn('numerical_ml_fields', report)
        self.assertEqual(report['frozen_report_sha256'], sha(self.paths[3].read_bytes()))
        for filename, key in [('raw.json', 'raw_geometry_sha256'), ('fused-bounded.json', 'fused_geometry_sha256'),
                              ('candidate.json', 'candidate_geometry_sha256')]:
            self.assertEqual(geometry_hash(json.loads((output/filename).read_text())), report[key])
        raw = json.loads((output/'raw.json').read_text())
        np.testing.assert_allclose(np.asarray(raw['positions']).reshape(-1, 3)[:, 2], .76, atol=1e-6)
        for actual, expected in zip(report['cameras'], self.baseline['arms']['A']['cameras']):
            np.testing.assert_allclose(actual['world_to_camera'], expected['world_to_camera'], atol=1e-6)
        candidate = json.loads((output/'candidate.json').read_text())
        self.assertIn('authored-room-shell', candidate['provenance'])
        self.assertNotIn('confirmed', candidate['completion']['origin'].replace('unconfirmed', ''))
        for name in ['manifest.json', 'raw-fields.npz']:
            self.assertEqual((output/name).read_bytes(), (self.paths[2]/name).read_bytes())
        self.assertEqual(json.loads((output/'report.json').read_text()), report)

    def test_real_validator_and_benchmark_consume_converter_outputs(self):
        baseline = copy.deepcopy(self.baseline)
        baseline['boundary_proposal'] = {'requires_user_confirmation': True, 'origin': 'Synthetic test only',
                                        'value': self.frozen['boundary']}
        result_path, request_path = self.root/'analysis-result.json', self.root/'analyze-request.json'
        result_path.write_text(json.dumps(baseline), encoding='utf-8')
        request_path.write_bytes(self.paths[1].read_bytes())
        frozen = {**self.frozen, 'input_result_sha256': sha(result_path.read_bytes())}
        self.paths[3].write_text(json.dumps(frozen), encoding='utf-8')
        output = self.root/'integrated'
        converted = subprocess.run([sys.executable, '-I', str(Path(converter.__file__)),
            '--result', str(result_path), '--request', str(request_path), '--raw-directory', str(self.paths[2]),
            '--frozen-report', str(self.paths[3]), '--output', str(output)],
            check=True, capture_output=True, text=True)
        report = json.loads(converted.stdout)
        code = """import {pathToFileURL} from 'node:url';
const {loadBenchmark}=await import(pathToFileURL(process.argv[1]));
const {payload}=await loadBenchmark(process.argv[2],process.argv[3],'worldmirror-v1',process.argv[4]);
if(payload.completion_error)throw Error(payload.completion_error);
console.log(JSON.stringify({model:payload.result.estimator.model,raw:payload.result.analysis_geometry_sha256,
  camera:payload.result.arms.A.cameras[0],variants:payload.completion.variants.map(v=>v.id)}));"""
        completed = subprocess.run(['node', '--input-type=module', '-e', code,
            str(Path(converter.__file__).with_name('benchmark.mjs')), str(self.root), str(output), str(self.paths[3])],
            check=True, capture_output=True, text=True)
        actual = json.loads(completed.stdout)
        self.assertEqual(actual['model'], 'WorldMirror 2.0')
        self.assertEqual(actual['raw'], report['raw_geometry_sha256'])
        self.assertEqual(actual['camera'], report['cameras'][0])
        self.assertEqual(actual['variants'], ['fused', 'completed'])

    def test_unknown_manifest_nested_fields_and_wrong_pins_rejected(self):
        changes = [lambda m: m.update(approved=True), lambda m: m.update(version=True),
                   lambda m: m.update(source_revision='0'*40), lambda m: m.update(checkpoint_revision='0'*40),
                   lambda m: m['implementation_sha256'].update(inference='0'*64),
                   lambda m: m['implementation_sha256'].update({'geometry.py': '0'*64}),
                   lambda m: m.update(fields_file='../raw-fields.npz'),
                   lambda m: m['normalization'][0].update(approved=True),
                   lambda m: m['preprocessing'][0].update(prior=True),
                   lambda m: m.update(candidate_promoted=True), lambda m: m.update(target_size=518)]
        for change in changes:
            m = copy.deepcopy(self.manifest); change(m); save_raw(self.paths[2], m)
            with self.subTest(manifest=m), self.assertRaises(ValueError):
                self.admit()

    def test_normalized_png_encoding_can_differ_but_rgb_must_match(self):
        for record in self.manifest['normalization']:
            with Image.open(self.root/'normalized'/(record['id']+'.png')) as image:
                encoded = io.BytesIO(); image.save(encoded, format='PNG', compress_level=0)
                with Image.open(io.BytesIO(encoded.getvalue())) as decoded:
                    np.testing.assert_array_equal(np.asarray(image), np.asarray(decoded))
            digest = sha(encoded.getvalue())
            self.assertNotEqual(record['normalized_sha256'], digest)
            record['normalized_sha256'] = digest
        save_raw(self.paths[2], self.manifest)
        before = [(self.paths[2]/name).read_bytes() for name in ('manifest.json', 'raw-fields.npz')]
        admitted, _, manifest_bytes, fields_bytes = self.admit()
        self.assertEqual(admitted['normalization'], self.manifest['normalization'])
        self.assertEqual([manifest_bytes, fields_bytes], before)
        self.assertEqual([(self.paths[2]/name).read_bytes() for name in ('manifest.json', 'raw-fields.npz')], before)
        changed = copy.deepcopy(self.fields); changed['rgb'][0, 0, 0, 0, 0] = .9
        save_raw(self.paths[2], self.manifest, changed)
        with self.assertRaisesRegex(ValueError, 'RGB'):
            self.admit()

    def test_order_normalization_preprocessing_and_shapes_rejected(self):
        changes = [lambda m: m['original_input_hashes'].reverse(),
                   lambda m: m['normalization'].reverse(),
                   lambda m: m.update(normalization=[]),
                   lambda m: m.update(normalization={}),
                   lambda m: m['normalization'].__setitem__(0, None),
                   lambda m: m['normalization'][0].pop('normalized_sha256'),
                   lambda m: m['normalization'][0].update(normalized_sha256='not-a-digest'),
                   lambda m: m['normalization'][0].update(normalized_sha256=True),
                   lambda m: m['normalization'][0].update(id='other'),
                   lambda m: m['normalization'][0].update(sha256='0'*64),
                   lambda m: m['normalization'][0].update(width=65),
                   lambda m: m['normalization'][0].update(height=49),
                   lambda m: m['normalization'][0].update(normalization='other'),
                   lambda m: m['preprocessing'][0].update(crop_left_top=[1, 0]),
                   lambda m: m['field_shapes'].update(depth=[1, 5, 1, 1, 1])]
        for change in changes:
            m = copy.deepcopy(self.manifest); change(m); save_raw(self.paths[2], m)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.admit()

    def test_tampered_npz_hash_and_rgb_rejected(self):
        original = (self.paths[2]/'raw-fields.npz').read_bytes()
        (self.paths[2]/'raw-fields.npz').write_bytes(original+b'tamper')
        with self.assertRaises(ValueError):
            self.admit()
        changed = copy.deepcopy(self.fields); changed['rgb'][0, 0, 0, 0, 0] = .9
        save_raw(self.paths[2], self.manifest, changed)
        with self.assertRaisesRegex(ValueError, 'RGB'):
            self.admit()

    def test_npz_unknown_keys_object_dtype_shapes_and_nonfinite_rejected(self):
        changes = [lambda f: f.update(unknown=np.ones(1)),
                   lambda f: f.update(depth=np.array([{'execute': 'forbidden'}], dtype=object)),
                   lambda f: f.update(depth=f['depth'].astype(np.float64)),
                   lambda f: f.update(depth=f['depth'][0]),
                   lambda f: f['depth'].fill(float('nan')), lambda f: f['depth'].fill(0),
                   lambda f: f['camera_poses'].__setitem__((0, 0, 0, 0), 2),
                   lambda f: f['camera_intrs'].__setitem__((0, 0, 0, 1), .2)]
        for change in changes:
            fields = copy.deepcopy(self.fields); change(fields)
            save_raw(self.paths[2], self.manifest, fields)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.admit()

    def test_duplicate_zip_entries_and_forged_allocation_header_rejected(self):
        original = (self.paths[2]/'raw-fields.npz').read_bytes()
        for duplicate in (False, True):
            stream = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(original)) as source, zipfile.ZipFile(stream, 'w') as archive:
                for info in source.infolist():
                    data = source.read(info)
                    if info.filename == 'depth.npy' and not duplicate:
                        header = io.BytesIO()
                        np.lib.format.write_array_header_1_0(header, {'descr': '<f4', 'fortran_order': False,
                                                                     'shape': (1, 5, 2**40, 518, 1)})
                        data = header.getvalue()
                    archive.writestr(info.filename, data)
                if duplicate:
                    with self.assertWarns(UserWarning):
                        archive.writestr('depth.npy', source.read('depth.npy'))
            save_raw(self.paths[2], self.manifest, data=stream.getvalue())
            with self.subTest(duplicate=duplicate), self.assertRaises(ValueError):
                self.admit()

    def test_archive_directory_and_native_fusion_resource_caps(self):
        original = (self.paths[2]/'raw-fields.npz').read_bytes()
        # A legal ZIP comment is not emitted by the pinned raw worker.
        stream = io.BytesIO(original)
        with zipfile.ZipFile(stream, 'a') as archive:
            archive.comment = b'unexpected directory trailer'
        save_raw(self.paths[2], self.manifest, data=stream.getvalue())
        with self.assertRaisesRegex(ValueError, 'directory'):
            self.admit()
        prediction = converter._prediction(self.fields, self.manifest, self.baseline)
        prediction['points'] *= 1e4
        with self.assertRaisesRegex(ValueError, 'fusion'):
            converter._fusion_budget(prediction)
        # Very long, thin geometry must not evade an area-only memory limit.
        prediction = converter._prediction(self.fields, self.manifest, self.baseline)
        prediction['points'][..., 0] *= 1e5
        prediction['points'][..., 1] *= 1e-5
        with self.assertRaisesRegex(ValueError, 'fusion'):
            converter._fusion_budget(prediction)

    def test_duplicate_json_keys_and_nonfinite_json_rejected(self):
        path = self.paths[2]/'manifest.json'
        for text in ['{"version":1,"version":1}', '{"inference_seconds":NaN}']:
            path.write_text(text)
            with self.assertRaises(ValueError):
                self.admit()

    def test_frozen_hash_binding_confirmation_and_settings_fail_closed(self):
        changes = [('input_result_sha256', '0'*64), ('input_request_sha256', '0'*64),
                   ('source_analysis_binding', {}), ('boundary_confirmed', True),
                   ('voxel_relative', .01), ('original_to_candidate_rotation', np.diag([1, 1, -1]).tolist()),
                   ('numerical_ml_fields', {'confidence_excluded_lower_percentile': 5}),
                   ('confidence_excluded_lower_percentile', 10), ('openings', [{'approved': True}])]
        for key, value in changes:
            frozen = {**self.frozen, key: value}
            self.paths[3].write_text(json.dumps(frozen))
            with self.subTest(key=key), self.assertRaises((ValueError, KeyError)):
                self.run_candidate()
            self.assertFalse((self.root/'candidate').exists())

    def test_baseline_preprocessing_or_source_order_change_rejected(self):
        for key in ['preprocessing', 'cameras', 'sources']:
            baseline = copy.deepcopy(self.baseline)
            if key == 'preprocessing':
                self.baseline['preprocessing'][0]['padding_left_top'] = [0, 62]
            elif key == 'cameras':
                self.baseline['arms']['A']['cameras'].reverse()
            else:
                self.baseline['original_input_hashes'].reverse()
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.run_candidate()
            self.baseline = baseline

    def test_existing_output_and_failed_write_preserve_inputs_without_report(self):
        output = self.root/'candidate'; output.mkdir(); sentinel = output/'keep'; sentinel.write_bytes(b'keep')
        with self.assertRaises((ValueError, FileExistsError)):
            self.run_candidate(output)
        self.assertEqual(sentinel.read_bytes(), b'keep')
        before = {p: p.read_bytes() for p in [*self.paths[:2], self.paths[3], self.paths[2]/'raw-fields.npz', self.paths[2]/'manifest.json']}
        real_open = Path.open
        def fail_candidate(path, *args, **kwargs):
            if path.name == 'candidate.json' and args and args[0] == 'x':
                raise OSError('synthetic write interruption')
            return real_open(path, *args, **kwargs)
        with patch.object(Path, 'open', fail_candidate), self.assertRaisesRegex(OSError, 'interruption'):
            self.run_candidate(self.root/'interrupted')
        self.assertFalse((self.root/'interrupted'/'report.json').exists())
        for path, data in before.items():
            self.assertEqual(path.read_bytes(), data)


if __name__ == '__main__':
    unittest.main()
