"""Synthetic test fixtures only; never a production inventory fallback."""
import copy
import json
import numpy as np

from geometry import add_room_shell
from idealized_contract import digest, seal_artifact


def accepted_inventory(layout='standard'):
    if layout == 'no-desk':
        return []
    return [{'id': 'table-1', 'category': 'table', 'origin': 'idealized-procedural',
             'observation_ids': ['mask-0', 'mask-1'], 'predecessor_ids': [],
             'dimensions': [1, .8, .7], 'translation': [1, 1, 0], 'yaw': 0,
             'color_srgb': [0, 0, 0], 'design_priors': {
                 'policy': 'idealized-templates-v1', 'dimension_origin': 'visible-support-and-prior',
                 'pose_origin': 'fitted', 'color_origin': 'masked-source',
                 'source_note': 'Synthetic support, not a photographed room'},
             'omitted': False, 'review_reasons': ['dimensions-unconfirmed'], 'generator': None}]


def packet(layout='standard'):
    if layout not in ('standard', 'no-desk', 'concave'):
        raise ValueError('Unknown synthetic layout')
    identity = np.eye(4).tolist()
    frame = {'id': 'synthetic-room', 'up': 'Z', 'source_to_candidate': identity,
             'candidate_to_source': copy.deepcopy(identity)}
    originals = [{'id': f'photo-{i}', 'sha256': digest(f'synthetic-{i}')} for i in range(5)]
    bindings = {'originals': originals, 'estimator_id': 'WorldMirror-2.0',
                'analysis_binding': {k: digest(k) for k in
                                     ('analysis_geometry_sha256', 'model_config_sha256', 'original_inputs_sha256')},
                'estimator_artifact_sha256': digest('synthetic-estimator'),
                'registration_sha256': digest('synthetic-registration'), 'frame_sha256': digest(frame),
                'observations': [{'id': f'mask-{i}', 'image_id': f'photo-{i}', 'mask_sha256': digest(f'mask-{i}')}
                                 for i in range(2)]}
    polygon = [[0, 0], [4, 0], [4, 4], [0, 4]]
    if layout == 'concave':
        polygon = [[0, 0], [4, 0], [4, 1.5], [2, 1.5], [2, 4], [0, 4]]
    return {'job_id': 'synthetic-job', 'candidate_id': 'synthetic-candidate', 'bindings': bindings,
            'frame': frame, 'boundary': {'polygon': polygon, 'floor': 0, 'ceiling': 3},
            'openings': [], 'inventory': accepted_inventory(layout), 'observations': [],
            'cameras': [], 'masks': [], 'shell_color_srgb': [.6, .5, .4]}


def artifact(layout='standard'):
    source = packet(layout)
    mesh = {'positions': [], 'colors': [], 'indices': [], 'provenance': [], 'source_view_indices': []}
    add_room_shell(mesh, source['boundary'], [])
    geometry = {k: mesh[k] for k in ('positions', 'colors', 'indices', 'provenance')}
    components = [{'id': 'shell', 'object_id': None, 'origin': 'authored-room-shell', 'first_face': 0,
                   'face_count': len(mesh['indices'])//3, 'source_reference_ids': ['photo-0']}]
    if source['inventory']:
        base = len(geometry['positions'])//3
        first = len(geometry['indices'])//3
        points = [[.5,.6,0],[1.5,.6,0],[1.5,1.4,0],[.5,1.4,0],
                  [.5,.6,.7],[1.5,.6,.7],[1.5,1.4,.7],[.5,1.4,.7]]
        faces = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],
                 [1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
        geometry['positions'] += np.asarray(points).ravel().tolist()
        geometry['colors'] += [0]*24
        geometry['indices'] += (np.asarray(faces)+base).ravel().tolist()
        geometry['provenance'] += ['idealized-procedural']*12
        components.append({'id': 'table-body', 'object_id': 'table-1', 'origin': 'idealized-procedural',
                           'first_face': first, 'face_count': 12, 'source_reference_ids': ['mask-0', 'mask-1']})
    result = {k: source[k] for k in ('job_id', 'candidate_id', 'bindings', 'frame', 'boundary', 'openings', 'inventory')}
    result.update(version=1, kind='eva-idealized-room-v1', parent_revision=None, revision='0'*64,
                  units='relative', mode='idealized', geometry=geometry, components=components,
                  diagnostics=[], omissions=[], implementation_sha256=digest('synthetic-code'),
                  geometry_sha256='0'*64, limitations=['Synthetic admission fixture; no reconstruction or review claim.'])
    return seal_artifact(result)


def expected(value):
    return copy.deepcopy({k: value[k] for k in ('job_id', 'bindings', 'parent_revision', 'boundary', 'openings', 'inventory')})


if __name__ == '__main__':
    print(json.dumps(artifact(), ensure_ascii=False, separators=(',', ':')))
