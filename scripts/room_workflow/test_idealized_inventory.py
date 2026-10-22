"""Automatic inventory preview is source-bound data, never readiness."""
import copy
import unittest

from idealized_fixture import packet
from object_proposals import associate
import idealized_sources


def observation(oid, image_id, label='desk', reasons=None, support=True):
    return {'id': oid, 'image_id': image_id, 'mask_sha256': 'b'*64,
            'label': label, 'review_reasons': reasons or [],
            'support': {'visible_bounds': [[1, 1, .2], [2, 1.5, .8]],
                        'center': [1.5, 1.25, .5], 'color': [0, 0, 0],
                        'support_pixels': 16,
                        'points': [[x, y, z] for x in (1, 1.3, 1.6, 2)
                                   for y in (1, 1.5) for z in (.2, .8)]} if support else None}


def source(observations):
    value = packet()
    value['observations'] = copy.deepcopy(observations)
    value['bindings']['observations'] = [{k: o[k] for k in ('id', 'image_id', 'mask_sha256')}
                                          for o in observations]
    value['inventory_proposals'] = associate(value['observations'])
    return value


class InventoryDraftTests(unittest.TestCase):
    def draft(self, value):
        return idealized_sources.draft_inventory(value, 'a'*64)

    def test_supported_association_proposes_source_driven_complete_spec_without_fit_or_authority(self):
        value = source([observation('a', 'photo-0'), observation('b', 'photo-1')])
        before = copy.deepcopy(value)
        draft = self.draft(value)
        self.assertEqual(value, before)
        self.assertEqual(draft['status'], 'needs-review')
        self.assertNotIn('geometry', draft)
        obj, = draft['inventory']
        self.assertEqual(obj['category'], 'table')
        self.assertEqual(obj['observation_ids'], ['a', 'b'])
        self.assertEqual(obj['dimensions'], [1, .5, .8])
        self.assertEqual(obj['translation'], [1.5, 1.25, 0])
        self.assertEqual(obj['color_srgb'], [0, 0, 0])
        self.assertEqual(obj['origin'], 'idealized-procedural')
        self.assertIn('pose-unfitted', obj['review_reasons'])
        item, = draft['drafts']
        self.assertEqual(item['labels'], ['desk'])
        self.assertEqual(item['inventory_id'], obj['id'])
        self.assertEqual(item['status'], 'proposed')
        self.assertEqual(self.draft(value), draft)

    def test_all_unresolved_observations_survive_without_fabricated_objects(self):
        observations = [observation('unsupported', 'photo-0', 'lamp'),
                        observation('missing', 'photo-1', support=False),
                        observation('outside', 'photo-2', reasons=['outside-reviewed-room']),
                        observation('single', 'photo-3', 'chair')]
        value = source(observations)
        draft = self.draft(value)
        self.assertEqual(draft['inventory'], [])
        entries = {item['observation_ids'][0]: item for item in draft['drafts']}
        self.assertEqual(set(entries), {'unsupported', 'missing', 'outside', 'single'})
        for item in entries.values():
            self.assertEqual(item['status'], 'unresolved')
            self.assertIsNone(item['inventory_id'])
        self.assertIn('unsupported-category', entries['unsupported']['reasons'])
        self.assertIn('insufficient-estimated-depth', entries['missing']['reasons'])
        self.assertIn('ungrouped-observation', entries['missing']['reasons'])
        self.assertIn('outside-reviewed-room', entries['outside']['reasons'])
        self.assertIn('single-view-only', entries['single']['reasons'])

    def test_ambiguous_and_flat_support_remain_unresolved(self):
        for reason in ('ambiguous-cross-view-identity', 'missing-visible-size'):
            value = source([observation('a', 'photo-0'), observation('b', 'photo-1')])
            if reason == 'ambiguous-cross-view-identity':
                value['inventory_proposals'][0]['review_reasons'].append(reason)
            else:
                for obs in value['observations']:
                    obs['support']['visible_bounds'][1][2] = .2
            draft = self.draft(value)
            self.assertEqual(draft['inventory'], [])
            self.assertIn(reason, draft['drafts'][0]['reasons'])

    def test_decisions_cover_exact_draft_revision_and_preserve_omissions(self):
        value = source([observation('a', 'photo-0'), observation('b', 'photo-1'),
                        observation('c', 'photo-2', 'lamp')])
        draft = self.draft(value)
        decisions = [{'draft_id': d['id'], 'action': 'accept'} if d['status'] == 'proposed' else
                     {'draft_id': d['id'], 'action': 'omit', 'reason': 'Misidentified fixture; keep raw evidence.'}
                     for d in draft['drafts']]
        inventory, review = idealized_sources.resolve_inventory(draft, draft['revision'], decisions)
        self.assertEqual(inventory, draft['inventory'])
        self.assertEqual(review['draft_revision'], draft['revision'])
        self.assertEqual(sorted(ref for d in review['decisions'] for ref in d['observation_ids']), ['a','b','c'])
        self.assertEqual(review['decisions'][1]['reason'], decisions[1]['reason'])
        for revision, selected in (("b"*64, decisions), (draft['revision'], decisions[:-1]),
                                   (draft['revision'], decisions+decisions[:1]),
                                   (draft['revision'], [{**decisions[0], 'ready': True}, decisions[1]]),
                                   (draft['revision'], [decisions[0], {'draft_id': draft['drafts'][1]['id'], 'action':'accept'}])):
            with self.subTest(selected=selected), self.assertRaises(ValueError):
                idealized_sources.resolve_inventory(draft, revision, selected)

    def test_resolve_requires_explicit_owner_interpretation_not_fallback_dimensions(self):
        draft = self.draft(source([observation('a', 'photo-0', 'lamp')]))
        decision = {'draft_id': draft['drafts'][0]['id'], 'action': 'resolve',
                    'object': {'category':'cabinet', 'dimensions':[.4,.3,.5], 'translation':[1.5,1.25,0],
                               'yaw':0, 'color_srgb':[0,0,0], 'source_note':'Owner interprets this region as a cabinet.'}}
        inventory, review = idealized_sources.resolve_inventory(draft, draft['revision'], [decision])
        self.assertEqual(inventory[0]['observation_ids'], ['a'])
        self.assertEqual(inventory[0]['design_priors']['dimension_origin'], 'owner')
        self.assertIn('owner-interpretation-review', inventory[0]['review_reasons'])
        self.assertEqual(review['decisions'][0]['object_id'], inventory[0]['id'])
        for field in ('dimensions', 'source_note'):
            bad = copy.deepcopy(decision); del bad['object'][field]
            with self.assertRaises(ValueError):
                idealized_sources.resolve_inventory(draft, draft['revision'], [bad])
        changed = copy.deepcopy(draft); changed['boundary']['ceiling'] += 1
        with self.assertRaises(ValueError):
            idealized_sources.resolve_inventory(changed, draft['revision'], [decision])

    def test_resolution_is_nonmutating_and_rejects_invalid_owner_values(self):
        draft = self.draft(source([observation('a', 'photo-0', 'lamp')]))
        decision = {'draft_id': draft['drafts'][0]['id'], 'action': 'resolve',
                    'object': {'category': 'cabinet', 'dimensions': [.4, .3, .5],
                               'translation': [1.5, 1.25, 0], 'yaw': 0,
                               'color_srgb': [0, 0, 0], 'source_note': 'Owner interpretation.'}}
        before = copy.deepcopy((draft, decision))
        inventory, review = idealized_sources.resolve_inventory(draft, draft['revision'], [decision])
        self.assertEqual((draft, decision), before)
        inventory[0]['observation_ids'].append('changed')
        review['decisions'][0]['observation_ids'].append('changed')
        self.assertEqual((draft, decision), before)
        for key, value in (('dimensions', [float('nan'), .3, .5]),
                           ('dimensions', [float('inf'), .3, .5]),
                           ('dimensions', [0, .3, .5]), ('source_note', 'x'*1001),
                           ('source_note', '   '), ('ready', True)):
            bad = copy.deepcopy(decision)
            bad['object'][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                idealized_sources.resolve_inventory(draft, draft['revision'], [bad])
        with self.assertRaises(ValueError):
            idealized_sources.resolve_inventory(draft, draft['revision'], [decision]*513)
        with self.assertRaises(ValueError):
            idealized_sources.resolve_inventory(draft, draft['revision'], [
                {'draft_id': decision['draft_id'], 'action': 'omit', 'reason': '   '}])

    def test_empty_input_never_supplies_fallback_furniture(self):
        draft = self.draft(source([]))
        self.assertEqual(draft['inventory'], [])
        self.assertEqual(draft['drafts'], [])
        self.assertEqual(draft['status'], 'needs-review')

    def test_source_room_and_evidence_changes_rebind_revision_not_object_identity(self):
        from idealized_contract import digest
        value = source([observation('a', 'photo-0'), observation('b', 'photo-1')])
        original = self.draft(value)
        variants = []
        room = copy.deepcopy(value); room['boundary']['ceiling'] = 4; variants.append(self.draft(room))
        changed = copy.deepcopy(value); changed['observations'][0]['support']['color'] = [1, 0, 0]
        variants.append(self.draft(changed))
        variants.append(idealized_sources.draft_inventory(value, 'c'*64))
        for draft in variants:
            self.assertNotEqual(draft['revision'], original['revision'])
            self.assertEqual(draft['drafts'][0]['id'], original['drafts'][0]['id'])
            self.assertEqual(draft['inventory'][0]['id'], original['inventory'][0]['id'])
            self.assertEqual(draft['revision'], digest({k: v for k, v in draft.items() if k != 'revision'}))

    def test_invalid_source_associations_and_resource_overflow_reject_instead_of_dropping(self):
        value = source([observation('a', 'photo-0'), observation('b', 'photo-1')])
        cases = []
        unknown = copy.deepcopy(value); unknown['inventory_proposals'][0]['observation_ids'].append('missing'); cases.append(unknown)
        duplicate = copy.deepcopy(value); duplicate['inventory_proposals'] *= 2; cases.append(duplicate)
        stale = copy.deepcopy(value); stale['bindings']['observations'][0]['mask_sha256'] = 'c'*64; cases.append(stale)
        malformed = copy.deepcopy(value); malformed['observations'][0]['support']['visible_bounds'][0][0] = float('nan'); cases.append(malformed)
        oversized = copy.deepcopy(value); oversized['observations'] *= 257; cases.append(oversized)
        for bad in cases:
            with self.subTest(case=len(bad['observations'])), self.assertRaises(ValueError):
                self.draft(bad)
        with self.assertRaises(ValueError):
            idealized_sources.draft_inventory(value, 'invalid')


if __name__ == '__main__':
    unittest.main()
