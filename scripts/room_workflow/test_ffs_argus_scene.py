import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

import numpy as np

MODULE = Path(__file__).with_name('ffs_argus_scene.py')


def load():
    spec = importlib.util.spec_from_file_location('ffs_argus_scene', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def admission():
    # Synthetic source/review only, never calibration evidence about the real panorama.
    record = {'kind': 'eva-ffs-argus-source-admission-v1', 'input_sha256': 'a' * 64,
        'argus_revision': 'a7333c0a6d1e370260ebf47ac0f8adce272f3083',
        'width': 560, 'height': 280, 'projection': 'equirectangular',
        'calibration': {'input_sha256': 'a' * 64, 'evidence_sha256': 'b' * 64,
            'pixel_origin': 'upper-left-edge', 'longitude_origin_degrees': -180,
            'latitude_origin_degrees': -90, 'horizontal_fov_degrees': 360,
            'vertical_fov_degrees': 180},
        'valid_region': {'kind': 'rectangle', 'x': 0, 'y': 0, 'width': 560, 'height': 280}}
    bind(record)
    return record


def bind(record):
    body = {key: value for key, value in record.items() if key != 'review'}
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(',', ':'),
                                      allow_nan=False).encode()).hexdigest()
    record['review'] = {'reviewer': 'owner', 'decision': 'approved', 'admission_sha256': digest}


def arrays():
    points = np.zeros((1, 196, 560, 3), dtype=np.float32)
    points[..., 0] = np.arange(560, dtype=np.float32) / 100
    points[..., 1] = np.arange(196, dtype=np.float32)[:, None] / 100
    points[..., 2] = 2
    confidence = np.full((1, 196, 560), 2, dtype=np.float32)
    cameras = np.eye(4, dtype=np.float32)[None, :3, :].copy()
    cameras[0, :, 3] = [3, 4, 5]
    return points, confidence, cameras


class ArgusSceneTests(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.points, self.confidence, self.cameras = arrays()
        self.admission = admission()

    def convert(self, *, digest='a' * 64):
        return self.m.convert_scene(self.points, self.confidence, self.cameras,
                                    self.admission, input_sha256=digest)

    def test_model_world_values_and_raw_arrays_survive_without_second_scale_or_alignment(self):
        before = [array.copy() for array in (self.points, self.confidence, self.cameras)]
        record = copy.deepcopy(self.admission)
        scene = self.convert()
        np.testing.assert_array_equal(scene['points'], self.points.reshape(-1, 3))
        np.testing.assert_array_equal(scene['cameras'], self.cameras)
        np.testing.assert_array_equal(scene['raw']['points'], self.points)
        np.testing.assert_array_equal(scene['raw']['confidence'], self.confidence)
        self.assertEqual(scene['report']['status'], 'needs-review')
        self.assertEqual(scene['report']['classification'], 'inferred')
        self.assertIs(scene['report']['complete_surface'], False)
        self.assertIsNone(scene['report']['scan_alignment'])
        self.assertEqual(scene['report']['input_sha256'], 'a' * 64)
        self.assertEqual(scene['report']['admission_sha256'], record['review']['admission_sha256'])
        self.assertNotIn('faces', scene)
        self.assertNotIn('execution_authorized', scene)
        scene['points'][:] = 100
        scene['raw']['points'][:] = 101
        scene['raw']['confidence'][:] = 102
        scene['cameras'][:] = 103
        for original, expected in zip((self.points, self.confidence, self.cameras), before):
            np.testing.assert_array_equal(original, expected)
        self.assertEqual(self.admission, record)

    def test_fixed_linear_median_filter_preserves_source_pixel_indices(self):
        self.confidence.reshape(-1)[:54880] = 1
        self.confidence.reshape(-1)[54880:] = 3
        scene = self.convert()
        np.testing.assert_array_equal(scene['pixel_indices'], np.arange(54880, 109760, dtype=np.uint32))
        np.testing.assert_array_equal(scene['points'], self.points.reshape(-1, 3)[54880:])
        np.testing.assert_array_equal(scene['confidence'], self.confidence.reshape(-1)[54880:])
        self.assertEqual(scene['report']['confidence_filter'], {'percentile': 50, 'threshold': 2.0})
        self.assertEqual(scene['report']['rejected_points'], 54880)

    def test_median_ties_include_all_points_but_never_claim_complete_surface(self):
        self.confidence[:] = 1  # 1 + exp can round to exactly one.
        scene = self.convert()
        self.assertEqual(len(scene['points']), 109760)
        self.assertEqual(scene['pixel_indices'].dtype, np.dtype('uint32'))
        self.assertLessEqual(scene['points'].nbytes, 2 * 1024**2)
        self.assertIs(scene['report']['complete_surface'], False)
        self.assertEqual(scene['report']['unknown_grid_rows'], [[0, 42], [238, 280]])

    def test_shapes_dtypes_and_size_are_checked_before_copying_or_filtering(self):
        good = arrays()
        cases = [('points', np.zeros((0, 196, 560, 3), np.float32)),
                 ('points', np.zeros((2, 196, 560, 3), np.float32)),
                 ('points', np.zeros((1, 182, 560, 3), np.float32)),
                 ('points', np.zeros((1, 210, 560, 3), np.float32)),
                 ('points', np.zeros((1, 196, 561, 3), np.float32)),
                 ('points', np.zeros((1, 196, 560, 3), object)),
                 ('points', good[0].astype(np.float64)),
                 ('points', good[0].astype(np.complex64)),
                 ('confidence', good[1][0]), ('confidence', good[1].astype(np.int32)),
                 ('cameras', np.eye(4, dtype=np.float32)[None]),
                 ('cameras', [[[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]])]
        for name, value in cases:
            self.points, self.confidence, self.cameras = good
            setattr(self, name, value)
            with self.subTest(name=name, shape=getattr(value, 'shape', None)), self.assertRaises(ValueError):
                self.convert()

    def test_nonfinite_values_cannot_hide_behind_rejected_confidence(self):
        for name in ('points', 'confidence', 'cameras'):
            for value in (np.nan, np.inf, -np.inf):
                self.points, self.confidence, self.cameras = arrays()
                self.confidence.reshape(-1)[0] = 1
                getattr(self, name).reshape(-1)[0] = value
                with self.subTest(name=name, value=value), self.assertRaises(ValueError):
                    self.convert()
        self.points, self.confidence, self.cameras = arrays()
        self.confidence[0, 0, 0] = 0.99
        with self.assertRaises(ValueError):
            self.convert()

    def test_camera_rotation_must_be_proper_but_is_not_reinterpreted(self):
        for rotation in (np.diag([-1, 1, 1]), np.diag([2, 1, 1]), np.zeros((3, 3))):
            self.cameras[0, :, :3] = rotation
            with self.subTest(rotation=rotation), self.assertRaises(ValueError):
                self.convert()
        self.cameras[0, :, :3] = [[0, -1, 0], [1, 0, 0], [0, 0, 1]]
        scene = self.convert()
        np.testing.assert_array_equal(scene['cameras'], self.cameras)
        np.testing.assert_array_equal(scene['points'], self.points.reshape(-1, 3))

    def test_changed_source_partial_source_and_forged_authority_are_rejected(self):
        with self.assertRaises(ValueError):
            self.convert(digest='c' * 64)
        self.admission['valid_region']['height'] = 233
        bind(self.admission)
        with self.assertRaisesRegex(ValueError, 'partial valid region'):
            self.convert()
        self.admission = admission()
        self.admission['execution_authorized'] = True
        bind(self.admission)
        with self.assertRaises(ValueError):
            self.convert()
        self.admission = admission()
        self.admission['review']['decision'] = 'pending'
        with self.assertRaises(ValueError):
            self.convert()


if __name__ == '__main__':
    unittest.main()
