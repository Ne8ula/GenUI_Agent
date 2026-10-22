"""Synthetic face association, not actual bedroom segmentation or host admission."""
import base64
import copy
import hashlib
import io
import unittest

import numpy as np
from PIL import Image

from idealized_contract import digest
from scan_fixture import source


def mask_record(mask):
    buffer = io.BytesIO()
    Image.fromarray(mask.astype(np.uint8)*255).save(buffer, format='PNG')
    data = buffer.getvalue()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'data_base64': base64.b64encode(data).decode('ascii')}


def fixture():
    src = source()
    first = src['views'][0]
    second = dict(first, id='view-1')
    for role in ('rgb', 'depth', 'confidence'):
        asset = dict(next(a for a in src['assets'] if a['id'] == role),
                     id=role+'-1', path=role+'-1.bin', sha256=digest(role+'-1'))
        src['assets'].append(asset)
        second[role] = asset['id']
    src['views'].append(second)
    src['revision'] = digest({k: v for k, v in src.items() if k != 'revision'})
    left = np.zeros((12, 12), bool); left[:10, :6] = True
    right = np.zeros((12, 12), bool); right[:10, 6:] = True
    views = [{'id': v['id'], 'intrinsics': np.eye(3), 'camera_to_world': np.eye(4),
              'depth_m': np.ones((12, 12)),
              'masks': {'cabinet-a': mask_record(left), 'cabinet-b': mask_record(right)}} for v in src['views']]
    vertices = np.array([[1, 1, 1], [3, 1, 1], [1, 3, 1],
                         [7, 1, 1], [9, 1, 1], [9, 3, 1],
                         [3, 5, 1], [7, 5, 1], [3, 7, 1],
                         [1, 10, 1], [3, 10, 1], [1, 11, 1]], float)
    return src, vertices, np.arange(12).reshape(4, 3), views


class ScanObjectTests(unittest.TestCase):
    def assign(self, src, vertices, faces, views):
        import importlib.util
        self.assertIsNotNone(importlib.util.find_spec('scan_objects'), 'Missing scan face association')
        from scan_objects import assign_scan_faces
        return assign_scan_faces(src, vertices, faces, views)

    def test_mixed_identity_faces_stay_unresolved_without_mutating_raw_arrays(self):
        src, vertices, faces, views = fixture()
        original = vertices.copy(), faces.copy(), copy.deepcopy(src)
        result = self.assign(src, vertices, faces, views)
        self.assertEqual(result['face_object_ids'], ['cabinet-a', 'cabinet-b', None, None])
        self.assertEqual(result['unresolved_reasons'], [None, None, 'conflicting-evidence', 'unobserved'])
        self.assertEqual(result['support_view_bits'][:2], [3, 3])
        self.assertEqual(result['source_sha256'], src['revision'])
        np.testing.assert_array_equal(vertices, original[0])
        np.testing.assert_array_equal(faces, original[1])
        self.assertEqual(src, original[2])

    def test_one_view_or_occluded_support_cannot_assign_a_face(self):
        src, vertices, faces, views = fixture()
        result = self.assign(src, vertices, faces, views[:1])
        self.assertEqual(result['face_object_ids'], [None]*4)
        self.assertEqual(result['unresolved_reasons'][0], 'single-view')
        views[1]['depth_m'][:] = .5
        result = self.assign(src, vertices, faces, views)
        self.assertEqual(result['face_object_ids'], [None]*4)

    def test_conflicting_views_and_overlapping_masks_do_not_vote_away_conflict(self):
        for conflict in ('swapped', 'overlap'):
            src, vertices, faces, views = fixture()
            masks = views[1]['masks']
            if conflict == 'swapped':
                masks['cabinet-a'], masks['cabinet-b'] = masks['cabinet-b'], masks['cabinet-a']
            else:
                masks['cabinet-b'] = copy.deepcopy(masks['cabinet-a'])
            result = self.assign(src, vertices, faces, views)
            self.assertIsNone(result['face_object_ids'][0])
            self.assertEqual(result['unresolved_reasons'][0], 'conflicting-evidence')

    def test_missing_centroid_support_cannot_bridge_objects(self):
        src, vertices, faces, views = fixture()
        left = np.zeros((12, 12), bool); left[:10, :6] = True
        left[2, 2] = False
        for view in views:
            view['masks']['cabinet-a'] = mask_record(left)
        result = self.assign(src, vertices, faces, views)
        self.assertIsNone(result['face_object_ids'][0])

    def test_integer_coordinates_do_not_overflow_geometry_checks(self):
        src, _, _, views = fixture()
        for view in views:
            view['intrinsics'] = np.diag([.25, .25, 1.])
        vertices = np.array([[0, 0, 1], [16, 0, 1], [0, 16, 1]], dtype=np.uint8)
        result = self.assign(src, vertices, [[0, 1, 2]], views)
        self.assertEqual(result['face_object_ids'], ['cabinet-a'])

    def test_minimum_integer_cannot_bypass_coordinate_bound(self):
        src, vertices, faces, views = fixture()
        vertices = np.vstack((vertices.astype(np.int64), [np.iinfo(np.int64).min, 0, 0]))
        with self.assertRaises(ValueError):
            self.assign(src, vertices, faces, views)

    def test_rejects_unbound_views_boxes_and_misaligned_masks(self):
        for change in ('unknown-view', 'duplicate-view', 'boxes', 'mask-size', 'raw-mm', 'bad-index'):
            src, vertices, faces, views = fixture()
            if change == 'unknown-view': views[1]['id'] = 'not-in-source'
            elif change == 'duplicate-view': views[1]['id'] = views[0]['id']
            elif change == 'boxes': views[0]['boxes'] = [[0, 0, 6, 10]]
            elif change == 'mask-size': views[0]['depth_m'] = np.ones((10, 12))
            elif change == 'raw-mm': views[0]['depth_m'] = np.ones((12, 12), np.uint16)
            else: faces[0, 0] = len(vertices)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.assign(src, vertices, faces, views)


if __name__ == '__main__':
    unittest.main()
