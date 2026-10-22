"""Placement checks operate on complete parts, not overlapping object boxes."""
import copy
import unittest
import numpy as np

from idealized_fixture import accepted_inventory, packet
from idealized_templates import make_object
from idealized_fit import check_layout, fit_object


def furniture(oid, category='table', dimensions=None, translation=None, yaw=0):
    spec = accepted_inventory()[0]
    spec.update(id=oid, category=category, dimensions=dimensions or [1,.8,.7],
                translation=translation or [1,1,0], yaw=yaw)
    return make_object(spec)


def codes(result, field='hard_errors'):
    return {d['code'] for d in result[field]}


class LayoutTests(unittest.TestCase):
    def test_chair_under_table_is_not_object_box_collision(self):
        objects = [furniture('table', dimensions=[2,2,2]),
                   furniture('chair', 'chair', dimensions=[.5,.5,1])]
        before = copy.deepcopy(objects)
        result = check_layout(objects, packet()['boundary'], [])
        self.assertFalse(result['hard_errors'])
        self.assertEqual(objects, before)
        self.assertEqual({d['object_ids'][0] for d in result['contacts']}, {'table','chair'})

    def test_interpenetrating_seats_reject_but_touching_parts_do_not(self):
        a = furniture('a', 'cabinet', [1,1,1], [1,1,0])
        b = furniture('b', 'cabinet', [1,1,1], [1.5,1,0])
        self.assertIn('interpenetration', codes(check_layout([a,b], packet()['boundary'], [])))
        b = furniture('b', 'cabinet', [1,1,1], [2,1,0])
        self.assertNotIn('interpenetration', codes(check_layout([a,b], packet()['boundary'], [])))

    def test_whole_faces_crossing_concave_notch_reject(self):
        boundary = {'polygon': [[0,0],[4,0],[4,4],[2.1,4],[2.1,2],[1.9,2],[1.9,4],[0,4]],
                    'floor': 0, 'ceiling': 3}
        obj = furniture('crossing', 'cabinet', [2,.5,1], [2,3,0])
        self.assertIn('outside-room', codes(check_layout([obj], boundary, [])))

    def test_floor_gap_below_floor_and_ceiling(self):
        for z, code in ((.1,'floor-gap'), (-.1,'outside-room'), (3,'outside-room')):
            with self.subTest(z=z):
                obj = furniture('a', translation=[1,1,z])
                self.assertIn(code, codes(check_layout([obj], packet()['boundary'], [])))

    def test_door_approach_is_review_not_silently_repositioned(self):
        opening = {'id':'door', 'edge_index':0, 't0':.1, 't1':.4, 'bottom':0, 'top':2, 'kind':'door'}
        obj = furniture('a', 'cabinet', [.6,.2,1], [1,.11,0])
        result = check_layout([obj], packet()['boundary'], [opening])
        self.assertIn('door-approach', codes(result, 'review_reasons'))


class FitTests(unittest.TestCase):
    def support(self):
        return [{'id':'mask-0', 'image_id':'photo-0', 'support': {
            'points': [[1+x,1+y,.7] for x in (-.4,-.2,0,.2,.4) for y in (-.4,-.2,0,.2,.4)]}}]

    def test_symmetric_flat_support_keeps_ambiguity_and_dimension_review(self):
        spec = accepted_inventory()[0]
        spec['dimensions'] = [1,1,.7]
        before = copy.deepcopy(spec)
        result = fit_object(spec, self.support(), packet()['boundary'])
        self.assertIn('ambiguous-yaw', result['review_reasons'])
        self.assertIn('dimensions-unconfirmed', result['review_reasons'])
        self.assertIn('silhouette-unavailable', result['review_reasons'])
        self.assertEqual(spec, before)

    def test_owner_parameters_survive_and_held_out_support_cannot_fit(self):
        spec = accepted_inventory()[0]
        spec['design_priors'].update(dimension_origin='owner', pose_origin='owner')
        spec['yaw'] = .23
        spec['translation'] = [1.2,1.3,0]
        result = fit_object(spec, self.support(), packet()['boundary'])
        held_out = {'id':'held-out', 'image_id':'unseen', 'held_out':True,
                    'support': {'points': [[500,500,500]]*20}}
        again = fit_object(spec, self.support()+[held_out], packet()['boundary'])
        self.assertEqual(result, again)
        for key in ('yaw','translation','dimensions'):
            self.assertEqual(result['object'][key], spec[key])

    def test_occluded_view_is_unknown_and_contradictory_mask_requires_review(self):
        spec = accepted_inventory()[0]
        spec.update(category='cabinet', dimensions=[1,1,1])
        spec['design_priors'].update(dimension_origin='owner', pose_origin='owner')
        observations = self.support()
        mask = np.zeros((16,16), bool); mask[3:14,3:14] = True
        observations[0]['view'] = {'camera': {'intrinsics': [[10,0,8],[0,10,8],[0,0,1]],
            'world_to_camera': [[1,0,0,-1],[0,1,0,-1],[0,0,1,1]]},
            'mask': mask, 'occluder_depth': np.full((16,16),.1)}
        result = fit_object(spec, observations, packet()['boundary'])
        view = next(d for d in result['diagnostics'] if d['code']=='silhouette-disagreement')
        self.assertIsNone(view['residual'])
        self.assertIn('occluded', view['reason'])
        observations[0]['view']['occluder_depth'] = np.full((16,16),np.inf)
        observations[0]['view']['mask'] = ~mask
        result = fit_object(spec, observations, packet()['boundary'])
        self.assertIn('silhouette-disagreement', result['review_reasons'])
        view = next(d for d in result['diagnostics'] if d['code']=='silhouette-disagreement')
        self.assertGreater(view['residual'], .5)

    def test_padding_does_not_count_as_silhouette_disagreement(self):
        spec = accepted_inventory()[0]
        spec.update(category='cabinet', dimensions=[1,1,1])
        spec['design_priors'].update(dimension_origin='owner', pose_origin='owner')
        observations = self.support()
        valid = np.zeros((16,16), bool); valid[6:11,6:11] = True
        observations[0]['view'] = {'camera': {'intrinsics': [[10,0,8],[0,10,8],[0,0,1]],
            'world_to_camera': [[1,0,0,-1],[0,1,0,-1],[0,0,1,1]]},
            'mask': valid.copy(), 'valid_mask': valid, 'occluder_depth': np.full((16,16),np.inf)}
        result = fit_object(spec, observations, packet()['boundary'])
        residuals = {d['code']:d['residual'] for d in result['diagnostics']}
        self.assertEqual(residuals['silhouette-disagreement'], 0.)
        self.assertEqual(residuals['silhouette-center'], 0.)
        observations[0]['view']['valid_mask'] = valid.astype(float)
        with self.assertRaises(ValueError):
            fit_object(spec, observations, packet()['boundary'])

    def test_same_image_masks_score_once_as_union_without_self_occlusion(self):
        spec = accepted_inventory()[0]
        spec.update(category='cabinet', dimensions=[1,1,1], observation_ids=['mask-0','mask-1'])
        spec['design_priors'].update(dimension_origin='owner', pose_origin='owner')
        valid = np.zeros((16,16), bool); valid[6:11,6:11] = True
        observations = []
        for i in range(2):
            observation = self.support()[0]
            observation['id'] = 'mask-'+str(i)
            mask = valid.copy(); mask[:,8:] = False
            if i == 1:
                mask = valid & ~mask
            observation['view'] = {'camera': {'intrinsics': [[10,0,8],[0,10,8],[0,0,1]],
                'world_to_camera': [[1,0,0,-1],[0,1,0,-1],[0,0,1,1]]},
                'mask': mask, 'valid_mask': valid, 'occluder_depth': np.where(mask,np.inf,.1)}
            observations.append(observation)
        result = fit_object(spec, observations, packet()['boundary'])
        views = [d for d in result['diagnostics'] if d['code']=='silhouette-disagreement']
        self.assertEqual(len(views), 1)
        self.assertEqual(views[0]['residual'], 0.)
        self.assertEqual(views[0]['view_ids'], ['photo-0'])
        self.assertEqual(int(observations[0]['view']['mask'].sum()), 10)
        observations[1]['view']['camera']['intrinsics'][0][0] = 20
        with self.assertRaises(ValueError):
            fit_object(spec, observations, packet()['boundary'])

    def test_held_out_flag_does_not_hide_duplicate_or_malformed_observations(self):
        spec = accepted_inventory()[0]
        duplicate = self.support()[0]
        duplicate['held_out'] = True
        with self.assertRaises(ValueError):
            fit_object(spec, self.support()+[duplicate], packet()['boundary'])
        for flag in ('false', 1, None):
            observations = self.support()
            observations[0]['held_out'] = flag
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                fit_object(spec, observations, packet()['boundary'])

    def test_previous_fit_cannot_compound_non_owner_dimensions(self):
        spec = accepted_inventory()[0]
        fitted = fit_object(spec, self.support(), packet()['boundary'])['object']
        with self.assertRaises(ValueError):
            fit_object(fitted, self.support(), packet()['boundary'])
        fitted['design_priors']['dimension_origin'] = 'owner'
        again = fit_object(fitted, self.support(), packet()['boundary'])
        self.assertEqual(again['object']['dimensions'], fitted['dimensions'])

    def test_insufficient_support_reasons_survive_in_saved_object(self):
        spec = accepted_inventory()[0]
        result = fit_object(spec, [], packet()['boundary'])
        self.assertTrue(set(result['review_reasons']) <= set(result['object']['review_reasons']))
        self.assertIn('dimensions-unconfirmed', result['object']['review_reasons'])
        self.assertIn('pose-unfitted', result['object']['review_reasons'])
        self.assertIn('dimensions-unfitted', result['object']['review_reasons'])

    def test_duplicate_or_nonfinite_support_rejects_and_empty_stays_unresolved(self):
        spec = accepted_inventory()[0]
        observations = self.support()
        with self.assertRaises(ValueError):
            fit_object(spec, observations*2, packet()['boundary'])
        observations[0]['support']['points'][0][0] = float('nan')
        with self.assertRaises(ValueError):
            fit_object(spec, observations, packet()['boundary'])
        result = fit_object(spec, [], packet()['boundary'])
        self.assertIn('insufficient-support', result['review_reasons'])
        self.assertIsNone(result['diagnostics'][0]['residual'])


if __name__ == '__main__':
    unittest.main()
