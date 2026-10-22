import copy
import unittest

from idealized_contract import validate_artifact
from idealized_fixture import accepted_inventory, expected, packet
from idealized_room import assemble, apply_correction


class AssemblyTests(unittest.TestCase):
    def test_deterministic_assembly_is_separate_and_fully_admitted(self):
        source, inventory = packet(), accepted_inventory()
        before = copy.deepcopy((source, inventory))
        value = assemble(source, inventory, None)
        self.assertEqual(validate_artifact(value, expected(value)), value)
        self.assertEqual(value, assemble(source, inventory, None))
        self.assertEqual((source,inventory), before)
        self.assertNotIn('photo-estimated', value['geometry']['provenance'])
        self.assertEqual({c['object_id'] for c in value['components']}, {None,'table-1'})

    def test_empty_omitted_and_owner_added_inventory(self):
        empty = assemble(packet('no-desk'), [], None)
        self.assertEqual({c['object_id'] for c in empty['components']}, {None})
        omitted = apply_correction(accepted_inventory(), {'action':'omit','object_id':'table-1'})
        value = assemble(packet(), omitted, empty['revision'])
        self.assertEqual({c['object_id'] for c in value['components']}, {None})
        self.assertEqual(value['omissions'][0]['object_id'], 'table-1')
        added = apply_correction([], {'action':'add','category':'chair','dimensions':[.5,.5,1],
            'translation':[1,1,0], 'yaw':0, 'color_srgb':[0,0,0], 'source_note':'Owner-authored synthetic chair'})
        value = assemble(packet('no-desk'), added, None)
        self.assertIn('owner-authored-addition', value['geometry']['provenance'])
        self.assertFalse(value['inventory'][0]['observation_ids'])
        self.assertEqual(validate_artifact(value, expected(value)), value)

    def test_corrections_preserve_neighbors_and_lineage(self):
        inventory = accepted_inventory()
        neighbor = copy.deepcopy(inventory[0]); neighbor.update(id='neighbor', observation_ids=[], origin='owner-authored-addition')
        neighbor['design_priors'].update(dimension_origin='owner', pose_origin='owner', color_origin='owner')
        inventory.append(neighbor)
        before = copy.deepcopy(inventory)
        corrected = apply_correction(inventory, {'action':'set','object_id':'table-1','changes':{'yaw':.4}})
        self.assertEqual(inventory, before)
        self.assertEqual(corrected[1], before[1])
        self.assertEqual(corrected[0]['design_priors']['pose_origin'], 'owner')
        split = apply_correction(inventory[:1], {'action':'split','object_id':'table-1','partitions':[['mask-0'],['mask-1']]})
        active = [o for o in split if not o['omitted']]
        self.assertEqual(len(active),2)
        self.assertTrue(all(o['predecessor_ids']==['table-1'] for o in active))
        merged = apply_correction(split, {'action':'merge','object_ids':[o['id'] for o in active]})
        active_merged = [o for o in merged if not o['omitted']]
        self.assertEqual(len(active_merged),1)
        self.assertEqual(set(active_merged[0]['observation_ids']), {'mask-0','mask-1'})
        self.assertEqual(set(active_merged[0]['predecessor_ids']), {o['id'] for o in active})

    def test_restore_cannot_duplicate_a_live_successor(self):
        addition = {'action':'add','category':'chair','dimensions':[.5,.5,1],
                    'translation':[1,1,0], 'yaw':0, 'color_srgb':[0,0,0], 'source_note':'Owner chair'}
        inventory = apply_correction([], addition)
        inventory = apply_correction(inventory, addition)
        ids = [obj['id'] for obj in inventory]
        merged = apply_correction(inventory, {'action':'merge','object_ids':ids})
        with self.assertRaises(ValueError):
            apply_correction(merged, {'action':'restore','object_id':ids[1]})
        omitted = apply_correction(merged, {'action':'omit','object_id':merged[-1]['id']})
        restored = apply_correction(omitted, {'action':'restore','object_id':ids[1]})
        self.assertFalse(restored[1]['omitted'])

    def test_owner_addition_cannot_claim_source_evidence(self):
        for field in ('observation_ids', 'dimension_origin', 'pose_origin', 'color_origin'):
            inventory = apply_correction([], {'action':'add','category':'chair','dimensions':[.5,.5,1],
                'translation':[1,1,0], 'yaw':0, 'color_srgb':[0,0,0], 'source_note':'Owner chair'})
            if field == 'observation_ids':
                inventory[0][field] = ['mask-0']
            else:
                inventory[0]['design_priors'][field] = accepted_inventory()[0]['design_priors'][field]
            with self.subTest(field=field), self.assertRaises(ValueError):
                assemble(packet(), inventory, None)

    def test_split_and_merge_keep_unresolved_review_reasons(self):
        split = apply_correction(accepted_inventory(), {'action':'split','object_id':'table-1',
            'partitions':[['mask-0'],['mask-1']]})
        for obj in split:
            self.assertIn('dimensions-unconfirmed', obj['review_reasons'])
        active = [obj for obj in split if not obj['omitted']]
        merged = apply_correction(split, {'action':'merge','object_ids':[obj['id'] for obj in active]})
        self.assertIn('dimensions-unconfirmed', merged[-1]['review_reasons'])
        self.assertIn('split-placement-review', merged[-1]['review_reasons'])

    def test_malformed_correction_discriminators_reject_without_mutation(self):
        inventory = accepted_inventory()
        before = copy.deepcopy(inventory)
        for bad in (None, True, 0, [], {}):
            cases = [{'action':bad}, {'action':'omit','object_id':bad},
                     {'action':'set','object_id':bad,'changes':{'yaw':0}}]
            for correction in cases:
                with self.subTest(correction=correction):
                    try:
                        apply_correction(inventory, correction)
                    except ValueError:
                        pass
                    except Exception as error:
                        self.fail('Malformed correction escaped as '+type(error).__name__)
                    else:
                        self.fail('Malformed correction was accepted')
                    self.assertEqual(inventory, before)

    def test_invalid_corrections_and_unbounded_layout_reject(self):
        for correction in ({'action':'set','object_id':'table-1','changes':{'authorized':True}},
                           {'action':'set','object_id':'table-1','changes':{'dimensions':[0,1,1]}},
                           {'action':'omit','object_id':'missing'},
                           {'action':'restore-revision','path':'../other'},
                           {'action':'split','object_id':'table-1','partitions':[['mask-0'],['mask-0']]}):
            with self.subTest(correction=correction), self.assertRaises(ValueError):
                apply_correction(accepted_inventory(), correction)
        inventory = accepted_inventory(); inventory[0]['translation'] = [100,100,0]
        with self.assertRaises(ValueError):
            assemble(packet(), inventory, None)


if __name__ == '__main__':
    unittest.main()
