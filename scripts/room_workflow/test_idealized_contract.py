"""Admission of authored idealization must not confer reconstruction authority."""
import copy
import math
import unittest

from idealized_contract import validate_artifact, seal_artifact, digest
from idealized_fixture import artifact, expected


class IdealizedContractTests(unittest.TestCase):
    def rejected(self, change, message=None):
        value = artifact()
        trusted = expected(value)
        change(value)
        # Re-sign mutations so semantic checks, not just the checksum, must reject.
        if not message:
            seal_artifact(value)
        with self.assertRaises(ValueError):
            validate_artifact(value, trusted)

    def test_valid_black_furniture_is_not_mutated(self):
        value = artifact()
        before = copy.deepcopy(value)
        self.assertIs(validate_artifact(value, expected(value)), value)
        self.assertEqual(before, value)
        self.assertIn(0, value['geometry']['colors'])

    def test_layout_fixtures(self):
        for layout in ('standard', 'no-desk', 'concave'):
            value = artifact(layout)
            validate_artifact(value, expected(value))
        self.assertEqual(artifact('no-desk')['inventory'], [])

    def test_unknown_authority_and_nested_fields(self):
        for change in (lambda v: v.update(ready=True),
                       lambda v: v['inventory'][0].update(authorized=True),
                       lambda v: v['bindings'].update(remote_url='https://example.invalid'),
                       lambda v: v['frame'].update(depth_source='dataset')):
            with self.subTest(change=change):
                self.rejected(change)

    def test_component_ownership_and_provenance(self):
        for change in (lambda v: v['components'][1].update(first_face=0),
                       lambda v: v['components'][1].update(object_id='other-job'),
                       lambda v: v['components'][1].update(origin='authored-room-shell'),
                       lambda v: v['geometry']['provenance'].__setitem__(-1, 'photo-estimated'),
                       lambda v: v['inventory'][0].update(origin='generated-object'),
                       lambda v: v['inventory'][0].update(observation_ids=['unknown'])):
            with self.subTest(change=change):
                self.rejected(change)

    def test_integral_float_component_ranges_reject_cleanly(self):
        for key in ('first_face', 'face_count'):
            value = artifact()
            value['components'][0][key] = float(value['components'][0][key])
            seal_artifact(value)
            with self.subTest(key=key):
                try:
                    validate_artifact(value, expected(value))
                except ValueError:
                    pass
                except Exception as error:
                    self.fail('Invalid component range escaped as '+type(error).__name__)
                else:
                    self.fail('Non-integer component range was accepted')

    def test_source_parent_frame_and_digests(self):
        for change in (lambda v: v['bindings']['originals'].reverse(),
                       lambda v: v.update(parent_revision='b'*64),
                       lambda v: v.update(job_id='other'),
                       lambda v: v['frame']['candidate_to_source'][0].__setitem__(3, 1)):
            with self.subTest(change=change):
                self.rejected(change)
        self.rejected(lambda v: v.update(revision='0'*64), 'checksum')
        self.rejected(lambda v: v.update(geometry_sha256='0'*64), 'checksum')

    def test_lineage_and_owner_addition_semantics(self):
        for mutate in (lambda o: o.update(predecessor_ids=['missing']),
                       lambda o: o.update(origin='owner-authored-addition')):
            value = artifact()
            mutate(value['inventory'][0])
            value['components'][1]['origin'] = value['inventory'][0]['origin']
            start = value['components'][1]['first_face']
            value['geometry']['provenance'][start:] = [value['inventory'][0]['origin']]*(len(value['geometry']['provenance'])-start)
            seal_artifact(value)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                validate_artifact(value, expected(value))

    def test_reviewed_boundary_openings_and_inventory_are_host_bound(self):
        for change in (lambda v: v['boundary'].update(ceiling=4),
                       lambda v: v['openings'].append({'id':'door-1', 'kind':'door', 'edge_index':0,
                           't0':.1, 't1':.3, 'bottom':0, 'top':2}),
                       lambda v: v['inventory'][0]['dimensions'].__setitem__(0, 1.2)):
            with self.subTest(change=change):
                self.rejected(change)

    def test_invalid_numeric_and_geometry_values(self):
        for bad in (True, -1, .5, 999999):
            self.rejected(lambda v: v['geometry']['indices'].__setitem__(0, bad), 'index')
        for bad in (math.nan, math.inf, -math.inf):
            self.rejected(lambda v: v['geometry']['positions'].__setitem__(0, bad), 'finite')
        for bad in (0, -1, True):
            self.rejected(lambda v: v['inventory'][0]['dimensions'].__setitem__(0, bad))
        self.rejected(lambda v: v['geometry']['indices'].__setitem__(1, v['geometry']['indices'][0]))
        self.rejected(lambda v: v['geometry']['colors'].__setitem__(0, -.01))

    def test_limit_plus_one_rejected_before_large_validation(self):
        self.rejected(lambda v: v['geometry'].update(positions=[0]*600003), 'limit')
        self.rejected(lambda v: v['geometry'].update(indices=[0]*1200003), 'limit')
        self.rejected(lambda v: v.update(inventory=v['inventory']*65), 'limit')
        self.rejected(lambda v: v.update(limitations=['x'*16777217]), 'limit')
        self.rejected(lambda v: v['geometry'].update(provenance=['x'*67108865]), 'limit')

    def test_hashes_are_numeric_and_unicode_stable(self):
        self.assertEqual(digest({'x': 1, 'y': -0.0}), digest({'y': 0, 'x': 1.0}))
        self.assertNotEqual(digest({'text': '黑色 🪑', 'tiny': 1e-7}),
                            digest({'text': '黑色 🪑', 'tiny': '1e-7'}))


if __name__ == '__main__':
    unittest.main()
