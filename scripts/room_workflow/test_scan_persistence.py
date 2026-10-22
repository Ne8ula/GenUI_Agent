"""Synthetic scan correction and immutable recipe-backed persistence only."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from idealized_contract import digest
from scan_contract import EXPECTED_KEYS, seal_scan
from scan_objects import draft_scan_objects, resolve_scan_objects
import scan_room
from test_scan_room import inputs


def prepared():
    src, observations, decisions, objects = inputs()
    # Shared vertices must split when only one object's placement changes.
    objects['geometry']['indices'] = [0, 1, 2, 1, 4, 5, 2, 5, 8]
    draft = draft_scan_objects(src, observations)
    review = resolve_scan_objects(draft, draft['revision'], decisions)
    recipe = {'source': src, 'review': review, 'objects': objects,
              'parent_revision': None, 'transforms': {}}
    return scan_room.assemble_scan(src, review, objects, None), recipe


def expected(candidate, recipe):
    return {**{key: candidate[key] for key in EXPECTED_KEYS}, 'recipe_sha256': digest(recipe)}


def encode(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')


class ScanPersistenceTests(unittest.TestCase):
    def require(self, name):
        self.assertTrue(callable(getattr(scan_room, name, None)), 'Missing '+name)
        return getattr(scan_room, name)

    def save(self, directory, candidate, recipe):
        return self.require('write_scan_candidate')(directory, candidate, recipe)

    def reopen(self, directory, binding):
        return self.require('read_scan_candidate')(directory, binding)

    def correct(self, candidate, recipe, correction, revision=None):
        return self.require('correct_scan_candidate')(
            candidate, correction, candidate['revision'] if revision is None else revision, recipe)

    def test_exclusive_roundtrip_and_exact_host_source_recipe_binding(self):
        candidate, recipe = prepared()
        before = copy.deepcopy((candidate, recipe))
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)/'first'
            self.save(root, candidate, recipe)
            original = {p.name: p.read_bytes() for p in root.iterdir()}
            self.assertEqual(set(original), {'candidate.json', 'recipe.json', 'manifest.json'})
            self.assertEqual(self.reopen(root, expected(candidate, recipe)), candidate)
            with self.assertRaises(FileExistsError):
                self.save(root, candidate, recipe)
            self.assertEqual({p.name: p.read_bytes() for p in root.iterdir()}, original)
            for field in (*EXPECTED_KEYS, 'recipe_sha256'):
                binding = expected(candidate, recipe)
                binding[field] = 'f'*64
                with self.subTest(field=field), self.assertRaises(ValueError):
                    self.reopen(root, binding)
        self.assertEqual((candidate, recipe), before)

    def test_self_resealed_geometry_is_rejected_by_regeneration(self):
        candidate, recipe = prepared()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)/'first'
            self.save(root, candidate, recipe)
            bad = copy.deepcopy(candidate)
            bad['geometry']['positions'][0] += .1
            seal_scan(bad)
            data = encode(bad)
            (root/'candidate.json').write_bytes(data)
            manifest = json.loads((root/'manifest.json').read_bytes())
            manifest.update(revision=bad['revision'], candidate_sha256=hashlib.sha256(data).hexdigest())
            (root/'manifest.json').write_bytes(encode(manifest))
            with self.assertRaises(ValueError):
                self.reopen(root, expected(bad, recipe))
            with self.assertRaises(ValueError):
                self.save(Path(temp)/'bad-write', bad, recipe)
            self.assertFalse((Path(temp)/'bad-write').exists())

    def test_changed_recipe_and_unknown_fields_do_not_gain_authority(self):
        candidate, recipe = prepared()
        for change in ('source', 'raw-geometry', 'authority', 'duplicate-json'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)/'first'
                self.save(root, candidate, recipe)
                changed = copy.deepcopy(recipe)
                if change == 'source': changed['source']['assets'][0]['sha256'] = 'f'*64
                elif change == 'raw-geometry': changed['objects']['geometry']['positions'][0] += .1
                elif change == 'authority': changed['ready'] = True
                data = encode(changed)
                if change == 'duplicate-json': data = b'{"transforms":{},'+data[1:]
                (root/'recipe.json').write_bytes(data)
                manifest = json.loads((root/'manifest.json').read_bytes())
                manifest['recipe_sha256'] = hashlib.sha256(data).hexdigest()
                (root/'manifest.json').write_bytes(encode(manifest))
                with self.assertRaises(ValueError):
                    self.reopen(root, expected(candidate, recipe))

    def test_interrupted_manifest_preserves_files_but_is_not_reopenable(self):
        candidate, recipe = prepared()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)/'interrupted'
            self.require('write_scan_candidate')
            with patch('scan_room.os.replace', side_effect=OSError('simulated interruption')):
                with self.assertRaises(OSError):
                    self.save(root, candidate, recipe)
            self.assertTrue((root/'candidate.json').is_file())
            self.assertTrue((root/'recipe.json').is_file())
            self.assertTrue((root/'manifest.json.part').is_file())
            self.assertFalse((root/'manifest.json').exists())
            with self.assertRaises((OSError, ValueError)):
                self.reopen(root, expected(candidate, recipe))
            with self.assertRaises(FileExistsError):
                self.save(root, candidate, recipe)

    def test_traversal_and_linked_parent_never_write(self):
        candidate, recipe = prepared()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(ValueError):
                self.save(root/'unused'/'..'/'escape', candidate, recipe)
            self.assertFalse((root/'escape').exists())
            # A junction needs no symlink privilege on Windows.
            if os.name == 'nt':
                (root/'target').mkdir()
                subprocess.run(['cmd', '/c', 'mklink', '/J', str(root/'link'), str(root/'target')],
                               check=True, capture_output=True)
            else:
                (root/'target').mkdir()
                (root/'link').symlink_to(root/'target', target_is_directory=True)
            try:
                with self.assertRaises(ValueError):
                    self.save(root/'link'/'escape', candidate, recipe)
                self.assertFalse((root/'target'/'escape').exists())
            finally:
                if os.name == 'nt': (root/'link').rmdir()
                else: (root/'link').unlink()

    def test_aggregate_persistence_budget_rejects_without_manifest(self):
        candidate, recipe = prepared()
        with tempfile.TemporaryDirectory() as temp:
            self.require('write_scan_candidate')
            with patch('scan_room.MAX_OUTPUT', len(encode(candidate))+len(encode(recipe))-1):
                with self.assertRaises(ValueError):
                    self.save(Path(temp)/'too-large', candidate, recipe)
            self.assertFalse((Path(temp)/'too-large'/'manifest.json').exists())

    def test_pose_correction_splits_shared_vertices_and_preserves_neighbors(self):
        candidate, recipe = prepared()
        before = copy.deepcopy((candidate, recipe))
        transform = [[1, 0, 0, .25], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
        corrected, updated = self.correct(candidate, recipe, {
            'action': 'transform', 'object_id': 'cabinet-a', 'transform': transform,
            'reason': 'Owner placement correction'})
        geometry = corrected['geometry']
        triangles = np.asarray(geometry['positions']).reshape(-1, 3)[np.asarray(geometry['indices']).reshape(-1, 3)]
        np.testing.assert_allclose(triangles, [[[.25, 0, 1], [1.25, 0, 1], [.25, 1, 1]],
                                             [[0, 1, 1], [2, 1, 1], [0, 2, 1]]])
        self.assertEqual(geometry['source_face_indices'], [0, 2])
        self.assertEqual(geometry['face_object_ids'], ['cabinet-a', None])
        self.assertEqual(corrected['parent_revision'], candidate['revision'])
        self.assertNotEqual(corrected['review_sha256'], candidate['review_sha256'])
        self.assertEqual(corrected['objects'][0]['transform'], transform)
        self.assertIn('Owner placement correction', ' '.join(corrected['diagnostics']))
        self.assertEqual((candidate, recipe), before)
        with tempfile.TemporaryDirectory() as temp:
            self.save(Path(temp)/'corrected', corrected, updated)
            self.assertEqual(self.reopen(Path(temp)/'corrected', expected(corrected, updated)), corrected)

    def test_omit_restore_and_reopen_previous_revision_preserve_source_identity(self):
        original, recipe = prepared()
        restored, restored_recipe = self.correct(original, recipe, {
            'action': 'restore', 'object_id': 'cabinet-b', 'reason': 'Restore source cabinet'})
        self.assertEqual(restored['geometry']['source_face_indices'], [0, 1, 2])
        self.assertEqual(restored['geometry']['face_object_ids'], ['cabinet-a', 'cabinet-b', None])
        omitted, omitted_recipe = self.correct(restored, restored_recipe, {
            'action': 'omit', 'object_id': 'cabinet-a', 'reason': 'Owner omission'})
        self.assertEqual(omitted['geometry']['source_face_indices'], [1, 2])
        self.assertEqual(omitted['geometry']['face_object_ids'], ['cabinet-b', None])
        with tempfile.TemporaryDirectory() as temp:
            self.save(Path(temp)/'before', original, recipe)
            self.save(Path(temp)/'after', omitted, omitted_recipe)
            # Undo reads the immutable earlier revision; it is not current host approval.
            self.assertEqual(self.reopen(Path(temp)/'before', expected(original, recipe)), original)
            with self.assertRaises(ValueError):
                self.reopen(Path(temp)/'before', expected(omitted, omitted_recipe))

    def test_corrections_reject_stale_unknown_unsafe_and_unbound_inputs(self):
        candidate, recipe = prepared()
        for change in ('stale', 'unknown', 'authority', 'blank', 'reflection', 'nonuniform',
                       'nonfinite', 'outside', 'box-restore', 'rebound-recipe', 'replace'):
            correction = {'action': 'transform', 'object_id': 'cabinet-a',
                          'transform': np.eye(4).tolist(), 'reason': 'Explicit owner correction'}
            r = copy.deepcopy(recipe)
            revision = candidate['revision']
            if change == 'stale': revision = 'f'*64
            elif change == 'unknown': correction['object_id'] = 'foreign'
            elif change == 'authority': correction['approved'] = True
            elif change == 'blank': correction['reason'] = ' '
            elif change == 'reflection': correction['transform'][0][0] = -1
            elif change == 'nonuniform': correction['transform'][0][0] = 2
            elif change == 'nonfinite': correction['transform'][0][0] = float('nan')
            elif change == 'outside': correction['transform'][0][3] = 100
            elif change == 'rebound-recipe': r['objects']['geometry']['positions'][0] += .1
            else:
                correction = {'action': 'restore' if change == 'box-restore' else 'replace',
                              'object_id': 'small-item', 'reason': 'Unsupported source'}
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.correct(candidate, r, correction, revision)

    def test_omit_and_unresolved_clear_placement_before_restore(self):
        original, recipe = prepared()
        placed, placed_recipe = self.correct(original, recipe, {
            'action': 'transform', 'object_id': 'cabinet-a',
            'transform': [[1, 0, 0, .25], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
            'reason': 'Original placement correction'})
        for action in ('omit', 'unresolved'):
            with self.subTest(action=action):
                inactive, inactive_recipe = self.correct(placed, placed_recipe, {
                    'action': action, 'object_id': 'cabinet-a', 'reason': 'Clear source assignment'})
                self.assertEqual(inactive_recipe['transforms'], {})
                self.assertEqual(inactive['objects'][0]['transform'], np.eye(4).tolist())
                self.assertNotIn('Original placement correction', ' '.join(inactive['diagnostics']))
                restored, _ = self.correct(inactive, inactive_recipe, {
                    'action': 'restore', 'object_id': 'cabinet-a', 'reason': 'Restore original source faces'})
                self.assertEqual(restored['geometry'], original['geometry'])
                self.assertEqual(placed_recipe['transforms']['cabinet-a']['transform'][0][3], .25)

    def test_cli_rejects_placement_for_nonretained_or_box_records(self):
        _, recipe = prepared()
        for oid in ('cabinet-b', 'small-item', 'cabinet-a'):
            with self.subTest(object_id=oid), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                changed = copy.deepcopy(recipe)
                if oid == 'cabinet-a':
                    decisions = changed['review']['decisions']
                    decisions[0]['action'] = 'unresolved'
                    draft = changed['review']['draft']
                    changed['review'] = resolve_scan_objects(draft, draft['revision'], decisions)
                changed['transforms'][oid] = {
                    'transform': [[1, 0, 0, .25], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
                    'reason': 'Placement cannot describe unowned faces'}
                (root/'input.json').write_bytes(encode(changed))
                result = subprocess.run([sys.executable, '-I', str(Path(scan_room.__file__).resolve()),
                                         '--input', str(root/'input.json'), '--output', str(root/'candidate')],
                                        cwd=root, capture_output=True, text=True, timeout=30)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((root/'candidate').exists())

    def test_isolated_cli_assembly_correction_and_verification(self):
        candidate, recipe = prepared()
        script = Path(scan_room.__file__).resolve()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            input_path = root/'input.json'
            input_path.write_bytes(encode(recipe))
            def run(*args):
                result = subprocess.run([sys.executable, '-I', '-X', 'utf8', str(script),
                                         '--input', str(input_path), *map(str, args)],
                                        cwd=root, capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                return json.loads(result.stdout)
            self.assertEqual(run('--output', root/'first'), {
                'status': 'needs-review', 'revision': candidate['revision'], 'objects': 1})
            input_path.write_bytes(encode(expected(candidate, recipe)))
            self.assertEqual(run('--verify', root/'first')['revision'], candidate['revision'])
            correction = {'action': 'restore', 'object_id': 'cabinet-b', 'reason': 'Restore source cabinet'}
            input_path.write_bytes(encode({'candidate': candidate, 'recipe': recipe,
                                          'correction': correction, 'expected_revision': candidate['revision']}))
            report = run('--correct', root/'second')
            self.assertEqual(report['objects'], 2)
            self.assertEqual(report['status'], 'needs-review')
            changed = json.loads((root/'second'/'candidate.json').read_bytes())
            updated = json.loads((root/'second'/'recipe.json').read_bytes())
            input_path.write_bytes(encode(expected(changed, updated)))
            self.assertEqual(run('--verify', root/'second')['revision'], report['revision'])
            input_path.write_bytes(encode({**recipe, 'ready': True}))
            rejected = subprocess.run([sys.executable, '-I', str(script), '--input', str(input_path),
                                       '--output', str(root/'rejected')],
                                      cwd=root, capture_output=True, text=True, timeout=30)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertFalse((root/'rejected').exists())

    def test_uniform_scale_rotation_are_absolute_not_accumulated(self):
        candidate, recipe = prepared()
        transform = [[0, -.5, 0, .5], [.5, 0, 0, 0], [0, 0, .5, .5], [0, 0, 0, 1]]
        correction = {'action': 'transform', 'object_id': 'cabinet-a', 'transform': transform,
                      'reason': 'Rotate and scale from immutable source geometry'}
        once, first_recipe = self.correct(candidate, recipe, correction)
        twice, _ = self.correct(once, first_recipe, correction)
        self.assertEqual(once['geometry'], twice['geometry'])
        geometry = once['geometry']
        triangle = np.asarray(geometry['positions']).reshape(-1, 3)[geometry['indices'][:3]]
        np.testing.assert_allclose(triangle, [[.5, 0, 1], [.5, .5, 1], [0, 0, 1]])


if __name__ == '__main__':
    unittest.main()
