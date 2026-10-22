"""Pure scan inventory and assembly; every input here is synthetic."""
import copy
import importlib.util
import unittest

from idealized_contract import digest
from scan_fixture import source
import scan_objects


def inputs():
    src = source()
    src['assets'].append({'id': 'annotation', 'role': 'annotation', 'path': 'annotation.json',
                          'bytes': 1, 'sha256': digest('synthetic-annotation')})
    src['revision'] = digest({k: v for k, v in src.items() if k != 'revision'})
    observations = [
        {'id': 'cabinet-a', 'parent_id': None, 'source_refs': ['mesh', 'rgb'],
         'evidence': 'mask-association', 'face_indices': [0]},
        {'id': 'cabinet-b', 'parent_id': 'cabinet-a', 'source_refs': ['mesh', 'rgb'],
         'evidence': 'mask-association', 'face_indices': [1]},
        {'id': 'small-item', 'parent_id': None, 'source_refs': ['annotation'],
         'evidence': 'annotation-box', 'face_indices': []}]
    decisions = [{'object_id': 'cabinet-a', 'action': 'retain', 'reason': 'Keep observed geometry'},
                 {'object_id': 'cabinet-b', 'action': 'omit', 'reason': 'Explicit synthetic omission'},
                 {'object_id': 'small-item', 'action': 'unresolved', 'reason': 'Only a box, no separated surface'}]
    objects = {'mesh_asset_id': 'mesh', 'boundary': {'polygon': [[-1, -1], [3, -1], [3, 3], [-1, 3]],
                                                   'floor': 0, 'ceiling': 3},
               'geometry': {'positions': [0, 0, 1, 1, 0, 1, 0, 1, 1,
                                         1, 0, 1, 2, 0, 1, 2, 1, 1,
                                         0, 1, 1, 2, 1, 1, 0, 2, 1],
                            'colors': [0.5]*27, 'indices': list(range(9))}}
    return src, observations, decisions, objects


class ScanInventoryTests(unittest.TestCase):
    def draft(self, src, observations):
        self.assertTrue(callable(getattr(scan_objects, 'draft_scan_objects', None)), 'Missing inventory draft')
        return scan_objects.draft_scan_objects(src, observations)

    def resolve(self, draft, revision, decisions):
        self.assertTrue(callable(getattr(scan_objects, 'resolve_scan_objects', None)), 'Missing inventory resolver')
        return scan_objects.resolve_scan_objects(draft, revision, decisions)

    def test_review_preserves_every_item_and_never_mutates_inputs(self):
        src, observations, decisions, _ = inputs()
        before = copy.deepcopy((src, observations, decisions))
        draft = self.draft(src, observations)
        review = self.resolve(draft, draft['revision'], decisions)
        self.assertEqual(review['draft'], draft)
        self.assertEqual(review['decisions'], decisions)
        self.assertNotIn('ready', review)
        self.assertEqual((src, observations, decisions), before)
        self.assertEqual(review['revision'], digest({k: v for k, v in review.items() if k != 'revision'}))

    def test_review_requires_exact_revision_coverage_and_explicit_reasons(self):
        src, observations, decisions, _ = inputs()
        draft = self.draft(src, observations)
        for change in ('stale', 'missing', 'duplicate', 'unknown', 'authority', 'blank', 'retain-box', 'replace'):
            bad, revision = copy.deepcopy(decisions), draft['revision']
            if change == 'stale': revision = '0'*64
            elif change == 'missing': bad.pop()
            elif change == 'duplicate': bad[1] = copy.deepcopy(bad[0])
            elif change == 'unknown': bad[0]['object_id'] = 'foreign'
            elif change == 'authority': bad[0]['ready'] = True
            elif change == 'blank': bad[1]['reason'] = ' '
            elif change == 'retain-box': bad[2]['action'] = 'retain'
            else: bad[0]['action'] = 'replace'
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.resolve(draft, revision, bad)

    def test_boxes_cannot_claim_faces_and_lineage_cannot_duplicate_source(self):
        src, observations, _, _ = inputs()
        for change in ('box-faces', 'shared-face', 'bad-ref', 'cycle', 'authority'):
            bad = copy.deepcopy(observations)
            if change == 'box-faces': bad[2]['face_indices'] = [2]
            elif change == 'shared-face': bad[1]['face_indices'] = [0]
            elif change == 'bad-ref': bad[0]['source_refs'] = ['foreign']
            elif change == 'cycle': bad[0]['parent_id'] = 'cabinet-b'
            else: bad[0]['approved'] = True
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.draft(src, bad)


class ScanAssemblyTests(unittest.TestCase):
    draft = ScanInventoryTests.draft
    resolve = ScanInventoryTests.resolve

    def assemble(self, src, review, objects, parent=None):
        self.assertIsNotNone(importlib.util.find_spec('scan_room'), 'Missing scan assembler')
        from scan_room import assemble_scan
        return assemble_scan(src, review, objects, parent)

    def test_omission_removes_only_owned_faces_and_compacts_unused_vertices(self):
        src, observations, decisions, objects = inputs()
        draft = self.draft(src, observations)
        review = self.resolve(draft, draft['revision'], decisions)
        before = copy.deepcopy((src, review, objects))
        candidate = self.assemble(src, review, objects)
        self.assertEqual(candidate['geometry']['face_object_ids'], ['cabinet-a', None])
        self.assertEqual(candidate['geometry']['source_face_indices'], [0, 2])
        self.assertEqual(len(candidate['geometry']['positions']), 18)
        self.assertEqual(candidate['review_sha256'], review['revision'])
        self.assertEqual([o['disposition'] for o in candidate['objects']], ['retain', 'omit', 'unresolved'])
        self.assertEqual(candidate['textures'], [])
        self.assertEqual(candidate['geometry']['face_material_indices'], [-1, -1])
        self.assertEqual((src, review, objects), before)

    def test_contact_and_parent_child_ownership_are_not_bbox_rejections(self):
        src, observations, decisions, objects = inputs()
        decisions[1]['action'] = 'retain'
        draft = self.draft(src, observations)
        review = self.resolve(draft, draft['revision'], decisions)
        candidate = self.assemble(src, review, objects)
        self.assertEqual(candidate['geometry']['face_object_ids'], ['cabinet-a', 'cabinet-b', None])
        self.assertEqual(candidate['objects'][1]['parent_id'], 'cabinet-a')

    def test_unresolved_decision_preserves_raw_geometry_without_claiming_identity(self):
        src, observations, decisions, objects = inputs()
        decisions[0]['action'] = decisions[1]['action'] = 'unresolved'
        draft = self.draft(src, observations)
        review = self.resolve(draft, draft['revision'], decisions)
        candidate = self.assemble(src, review, objects)
        self.assertEqual(candidate['geometry']['face_object_ids'], [None]*3)
        self.assertEqual(candidate['geometry']['positions'], objects['geometry']['positions'])

    def test_resealed_fragment_map_or_disposition_cannot_contradict_geometry(self):
        from scan_contract import EXPECTED_KEYS, seal_scan, validate_scan_candidate
        src, observations, decisions, objects = inputs()
        draft = self.draft(src, observations)
        review = self.resolve(draft, draft['revision'], decisions)
        for change in ('short-map', 'float-index', 'omitted-owner', 'missing-retained', 'blank-reason'):
            candidate = self.assemble(src, review, objects)
            if change == 'short-map': candidate['geometry']['source_face_indices'] = [0]
            elif change == 'float-index': candidate['geometry']['source_face_indices'][0] = 0.0
            elif change == 'omitted-owner': candidate['objects'][0]['disposition'] = 'omit'
            elif change == 'missing-retained': candidate['objects'][1]['disposition'] = 'retain'
            else: candidate['objects'][0]['disposition_reason'] = ' '
            seal_scan(candidate)
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_scan_candidate(candidate, {k: candidate[k] for k in EXPECTED_KEYS})

    def test_assembly_rejects_rebound_source_review_and_invalid_omitted_geometry(self):
        src, observations, decisions, objects = inputs()
        draft = self.draft(src, observations)
        review = self.resolve(draft, draft['revision'], decisions)
        for change in ('source', 'review', 'face-range', 'omitted-index', 'wrong-mesh', 'authority'):
            s, r, o = copy.deepcopy((src, review, objects))
            if change == 'source':
                s['assets'][0]['sha256'] = '0'*64
                s['revision'] = digest({k: v for k, v in s.items() if k != 'revision'})
            elif change == 'review': r['decisions'][0]['action'] = 'omit'
            elif change == 'face-range':
                obs = copy.deepcopy(observations); obs[1]['face_indices'] = [20]
                d = self.draft(src, obs); r = self.resolve(d, d['revision'], decisions)
            elif change == 'omitted-index': o['geometry']['indices'][3] = 99
            elif change == 'wrong-mesh': o['mesh_asset_id'] = 'rgb'
            else: o['ready'] = True
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.assemble(s, r, o)


if __name__ == '__main__':
    unittest.main()
