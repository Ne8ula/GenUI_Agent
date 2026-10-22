"""Synthetic scan fixtures only; never substitute for the bedroom's actual assets."""
import copy

from idealized_contract import digest
from scan_contract import EXPECTED_KEYS, seal_scan


def frame():
    identity = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    return {'id': 'synthetic-scan', 'up': 'Z', 'units': 'm',
            'source_to_candidate': identity, 'candidate_to_source': copy.deepcopy(identity)}


def source():
    roles = ('mesh', 'rgb', 'depth', 'confidence', 'calibration', 'pose')
    value = {'kind': 'eva-scan-source-v1', 'version': 1, 'capture_id': '45261631', 'mode': 'scan-assisted',
             'assets': [{'id': role, 'role': role, 'path': role+'.bin', 'bytes': 1,
                         'sha256': digest('synthetic-'+role)} for role in roles],
             'views': [{'id': 'view-0', 'role': 'conditioning', **{r: r for r in roles[1:]}}],
             'frame': frame(), 'registration_policy': {'timestamp_max_ms': 5, 'reprojection_max_px': .5,
                 'visibility_absolute_m': .02, 'visibility_relative': .01, 'evaluation_independent': False}}
    value['revision'] = digest(value)
    return value


def candidate():
    src = source()
    value = {'kind': 'eva-scan-room-v1', 'version': 1, 'capture_id': '45261631', 'mode': 'scan-assisted',
             'units': 'm', 'source_sha256': src['revision'], 'frame_sha256': digest(src['frame']),
             'frame': src['frame'], 'parent_revision': None, 'review_sha256': digest('synthetic-review'),
             'geometry': {'positions': [0, 0, 0, 1, 0, 0, 0, 1, 0], 'colors': [0]*9,
                          'indices': [0, 1, 2], 'provenance': ['dataset-reconstruction'],
                          'uvs': [0, 0, 1, 0, 0, 1], 'face_object_ids': [None], 'face_material_indices': [0]},
             'objects': [],
             'textures': [{'id': 'atlas-0', 'path': 'atlas-0.png', 'bytes': 100, 'sha256': digest('synthetic-png'),
                           'width': 2, 'height': 2, 'format': 'image/png', 'origin': 'source-projected', 'source_refs': ['rgb']}],
             'materials': [{'id': 'material-0', 'texture_id': 'atlas-0'}],
             'components': [{'id': 'shell', 'object_id': None, 'origin': 'dataset-reconstruction',
                             'first_face': 0, 'face_count': 1, 'source_refs': ['mesh']}],
             'boundary': {'polygon': [[-1, -1], [2, -1], [2, 2], [-1, 2]], 'floor': 0, 'ceiling': 3},
             'diagnostics': ['Synthetic fixture, not an inspected room or actual texture file.'],
             'implementation_sha256': digest('synthetic-code')}
    return seal_scan(value)


def expected(value):
    return copy.deepcopy({k: value[k] for k in EXPECTED_KEYS})
