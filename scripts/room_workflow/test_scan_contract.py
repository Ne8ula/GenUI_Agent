"""Scan-assisted evidence cannot pass as an RGB-only result or host authority."""
import copy
import unittest

from idealized_contract import digest, validate_artifact
import scan_contract as scan
from scan_fixture import source, candidate, expected


class ScanContractTests(unittest.TestCase):
    def test_valid_closed_source_and_candidate(self):
        src, value = source(), candidate()
        self.assertIs(scan.validate_scan_source(src), src)
        self.assertIs(scan.validate_scan_candidate(value, expected(value)), value)
        self.assertEqual(src['capture_id'], '45261631')
        self.assertEqual(value['mode'], 'scan-assisted')

    def test_scan_contract_rejects_rgb_only_relabel(self):
        value = candidate()
        with self.assertRaises(ValueError):
            validate_artifact(value, {})
        for key, item in [('mode', 'rgb-only'), ('capture_id', '42445021'), ('ready', True), ('approved', True)]:
            bad = copy.deepcopy(value); bad[key] = item
            with self.subTest(key=key), self.assertRaises(ValueError):
                scan.validate_scan_candidate(bad, expected(value))
        bad = source(); bad['approved'] = True
        with self.assertRaises(ValueError):
            scan.validate_scan_source(bad)

    def test_revision_binds_uv_provenance_and_texture_hashes(self):
        value = candidate()
        for change in ('uv', 'origin', 'texture'):
            bad = copy.deepcopy(value)
            if change == 'uv':
                bad['geometry']['uvs'][0] = .2
            elif change == 'origin':
                bad['geometry']['provenance'][0] = 'generated-completion'
            else:
                bad['textures'][0]['sha256'] = 'e'*64
            with self.subTest(change=change), self.assertRaises(ValueError):
                scan.validate_scan_candidate(bad, expected(value))
            scan.seal_scan(bad)
            with self.assertRaises(ValueError):
                scan.validate_scan_candidate(bad, expected(value))

    def test_geometry_and_asset_semantics_cannot_be_resealed_away(self):
        for change in ('index', 'degenerate', 'uv', 'owner', 'material', 'path', 'dimensions', 'origin', 'nonfinite'):
            bad = candidate()
            if change == 'index': bad['geometry']['indices'][0] = 3
            elif change == 'degenerate': bad['geometry']['indices'][0] = 1
            elif change == 'uv': bad['geometry']['uvs'].pop()
            elif change == 'owner': bad['geometry']['face_object_ids'][0] = 'unknown'
            elif change == 'material': bad['geometry']['face_material_indices'][0] = 1
            elif change == 'path': bad['textures'][0]['path'] = '../texture.png'
            elif change == 'dimensions': bad['textures'][0]['width'] = 2049
            elif change == 'origin': bad['geometry']['provenance'][0] = 'photo-estimated'
            else: bad['geometry']['positions'][0] = float('nan')
            with self.subTest(change=change), self.assertRaises(ValueError):
                scan.seal_scan(bad)
                scan.validate_scan_candidate(bad, expected(bad))

    def test_frame_and_source_references_are_exact(self):
        for change in ('inverse', 'reference', 'duplicate', 'capture', 'conditioning'):
            bad = source()
            if change == 'inverse': bad['frame']['candidate_to_source'][0][3] = 5
            elif change == 'reference': bad['views'][0]['rgb'] = 'missing'
            elif change == 'duplicate': bad['assets'].append(copy.deepcopy(bad['assets'][0]))
            elif change == 'capture': bad['capture_id'] = '42445021'
            else: bad['views'] = [dict(bad['views'][0], id=f'view-{i}') for i in range(25)]
            bad['revision'] = digest({k: v for k, v in bad.items() if k != 'revision'})
            with self.subTest(change=change), self.assertRaises(ValueError):
                scan.validate_scan_source(bad)

    def test_evaluation_cannot_reuse_conditioning_sensor_bytes(self):
        for reused in ('rgb', 'depth', 'confidence', None):
            value = source()
            value['assets'] = [a for a in value['assets'] if a['role'] != 'mesh']
            view = dict(value['views'][0], id='heldout', role='evaluation')
            for role in ('rgb', 'depth', 'confidence'):
                asset = dict(next(a for a in value['assets'] if a['id'] == role),
                             id='heldout-'+role, path='heldout-'+role+'.bin',
                             sha256=digest('heldout-'+role))
                if role == reused:
                    asset['sha256'] = next(a['sha256'] for a in value['assets'] if a['id'] == role)
                value['assets'].append(asset)
                view[role] = asset['id']
            value['views'].append(view)
            value['registration_policy']['evaluation_independent'] = True
            value['revision'] = digest({k: v for k, v in value.items() if k != 'revision'})
            with self.subTest(reused=reused):
                if reused is None:
                    scan.validate_scan_source(value)
                else:
                    with self.assertRaises(ValueError):
                        scan.validate_scan_source(value)

    def test_component_and_owner_origins_require_honest_references(self):
        for origin, refs in [('dataset-reconstruction', []), ('rgbd-fused', []),
                             ('owner-authored-addition', ['mesh'])]:
            value = candidate()
            value['components'][0].update(origin=origin, source_refs=refs)
            value['geometry']['provenance'][0] = origin
            scan.seal_scan(value)
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                scan.validate_scan_candidate(value, expected(value))

    def test_owner_added_object_cannot_claim_scan_evidence(self):
        value = candidate()
        value['objects'] = [{'id': 'addition', 'source_refs': ['mesh'], 'parent_id': None,
                             'transform': value['frame']['source_to_candidate'],
                             'origin': 'owner-authored-addition', 'unresolved_reasons': []}]
        scan.seal_scan(value)
        with self.assertRaises(ValueError):
            scan.validate_scan_candidate(value, expected(value))

    def test_budget_boundaries_and_local_catalog(self):
        for width in (2048, 2049):
            value = candidate(); value['textures'][0]['width'] = width
            scan.seal_scan(value)
            if width == 2048:
                scan.validate_scan_candidate(value, expected(value))
            else:
                with self.assertRaises(ValueError):
                    scan.validate_scan_candidate(value, expected(value))
        for path in ('https://example.org/a.png', '/texture.png', 'C:/a.png', 'a\\b.png', 'CON.png', 'a/../b.png'):
            value = candidate(); value['textures'][0]['path'] = path
            scan.seal_scan(value)
            with self.subTest(path=path), self.assertRaises(ValueError):
                scan.validate_scan_candidate(value, expected(value))


if __name__ == '__main__':
    unittest.main()
