"""Closed scan metadata/geometry admission; asset bytes require separate host verification."""
import json
from pathlib import Path, PurePosixPath

import numpy as np
from jsonschema import Draft202012Validator

from complete_candidate import geometry_hash
from geometry import filter_boundary
from idealized_contract import MAX_METADATA, MAX_OUTPUT, _size, _unique, digest

SCHEMA = json.loads(Path(__file__).with_name('scan-room.schema.json').read_text(encoding='utf-8'))
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA)
EXPECTED_KEYS = {'source_sha256', 'frame_sha256', 'parent_revision', 'inventory_sha256', 'review_sha256', 'revision'}


def _schema(value, name):
    error = next(VALIDATOR.evolve(schema={'$ref': '#/$defs/'+name}).iter_errors(value), None)
    if error:
        raise ValueError('Invalid scan '+name+' at '+ '/'.join(map(str, error.absolute_path)))


def _revision(value):
    if digest({k: v for k, v in value.items() if k != 'revision'}) != value['revision']:
        raise ValueError('Scan revision changed')


def _frame(frame):
    forward, inverse = (np.asarray(frame[k], float) for k in ('source_to_candidate', 'candidate_to_source'))
    if (not np.isfinite(forward).all() or not np.isfinite(inverse).all()
            or not np.allclose(forward[3], [0, 0, 0, 1], atol=1e-9, rtol=0)
            or not np.allclose(inverse[3], [0, 0, 0, 1], atol=1e-9, rtol=0)
            or not np.allclose(forward[:3, :3].T @ forward[:3, :3], np.eye(3), atol=1e-6, rtol=0)
            or not np.isclose(np.linalg.det(forward[:3, :3]), 1, atol=1e-6, rtol=0)
            or not np.allclose(forward @ inverse, np.eye(4), atol=1e-6, rtol=0)):
        raise ValueError('Scan frame must be reversible and metric-rigid')


def _paths(assets):
    seen = set()
    reserved = {'con', 'prn', 'aux', 'nul'} | {f'{name}{i}' for name in ('com', 'lpt') for i in range(1, 10)}
    for asset in assets:
        name = asset['path']
        path = PurePosixPath(name)
        if (path.is_absolute() or path.as_posix() != name or name.casefold() in seen
                or any(p in ('.', '..') or p.endswith(('.', ' ')) or p.split('.')[0].casefold() in reserved
                       for p in path.parts)):
            raise ValueError('Unsafe or duplicate scan asset path')
        seen.add(name.casefold())


def validate_scan_source(value):
    _size(value, MAX_METADATA)
    _schema(value, 'source')
    assets = {a['id']: a for a in value['assets']}
    _unique(value['assets']); _unique(value['views']); _paths(value['assets'])
    if sum(v['role'] == 'conditioning' for v in value['views']) not in range(1, 25):
        raise ValueError('Scan conditioning view budget')
    sensor_roles = {role: {} for role in ('rgb', 'depth', 'confidence')}
    for view in value['views']:
        for role in ('rgb', 'depth', 'confidence', 'calibration', 'pose'):
            if view[role] not in assets or assets[view[role]]['role'] != role:
                raise ValueError('Scan view references wrong or missing source asset')
        for role, seen in sensor_roles.items():
            source_hash = assets[view[role]]['sha256']
            if source_hash in seen and (role == 'rgb' or (
                    seen[source_hash] != view['role'] and value['registration_policy']['evaluation_independent'])):
                raise ValueError('Repeated RGB or non-independent sensor evidence')
            seen[source_hash] = view['role']
    if (any(a['role'] == 'mesh' for a in assets.values())
            and value['registration_policy']['evaluation_independent']):
        raise ValueError('Whole-scene supplied mesh cannot certify withheld-view independence')
    _frame(value['frame']); _revision(value)
    return value


def seal_scan(value):
    """Integrity only, not authorization or byte-file validation."""
    value['geometry_sha256'] = geometry_hash(value['geometry'])
    value['inventory_sha256'] = digest(value['objects'])
    value['revision'] = digest({k: v for k, v in value.items() if k != 'revision'})
    return value


def validate_scan_candidate(value, expected):
    if not isinstance(value, dict) or not isinstance(value.get('geometry'), dict):
        raise ValueError('Missing scan geometry')
    geometry = value['geometry']
    for key, cap in (('positions', 600000), ('colors', 600000), ('indices', 1200000), ('uvs', 400000),
                     ('provenance', 400000), ('face_object_ids', 400000), ('face_material_indices', 400000)):
        if not isinstance(geometry.get(key), list) or len(geometry[key]) > cap:
            raise ValueError('Scan geometry budget/shape')
    if 'source_face_indices' in geometry and (not isinstance(geometry['source_face_indices'], list)
            or len(geometry['source_face_indices']) > 400000):
        raise ValueError('Scan fragment mapping budget/shape')
    _size({k: v for k, v in value.items() if k != 'geometry'}, MAX_METADATA)
    _schema(value, 'candidate')
    if (not isinstance(expected, dict) or set(expected) != EXPECTED_KEYS
            or any(value[k] != expected[k] for k in expected)):
        raise ValueError('Scan differs from expected host binding')
    texture_bytes = sum(t['bytes'] for t in value['textures'])
    _size(value, MAX_OUTPUT-texture_bytes)
    if sum(t['width']*t['height']*4 for t in value['textures']) > 128*1024**2:
        raise ValueError('Decoded scan texture budget')
    textures = _unique(value['textures']); _paths(value['textures']); _unique(value['materials'])
    for texture in value['textures']:
        suffix = PurePosixPath(texture['path']).suffix.lower()
        if suffix not in (('.png',) if texture['format'] == 'image/png' else ('.jpg', '.jpeg')):
            raise ValueError('Texture format/path disagreement')
        if texture['origin'] == 'source-projected' and not texture['source_refs']:
            raise ValueError('Source texture requires evidence references')
    if any(m['texture_id'] not in textures for m in value['materials']):
        raise ValueError('Unknown texture reference')
    _frame(value['frame'])
    if digest(value['frame']) != value['frame_sha256'] or digest(value['objects']) != value['inventory_sha256']:
        raise ValueError('Changed scan frame/inventory binding')
    n, f = len(geometry['positions'])//3, len(geometry['indices'])//3
    if (len(geometry['positions']) % 3 or len(geometry['indices']) % 3
            or len(geometry['colors']) != n*3 or len(geometry['uvs']) != n*2
            or any(len(geometry[k]) != f for k in ('provenance', 'face_object_ids', 'face_material_indices'))
            or any(type(i) is not int or not 0 <= i < n for i in geometry['indices'])
            or any(type(i) is not int or not -1 <= i < len(value['materials']) for i in geometry['face_material_indices'])):
        raise ValueError('Invalid scan geometry cardinality/index')
    if 'source_face_indices' in geometry and (len(geometry['source_face_indices']) != f
            or any(type(i) is not int for i in geometry['source_face_indices'])):
        raise ValueError('Invalid scan source face mapping')
    vertices = np.asarray(geometry['positions'], float).reshape(-1, 3)
    faces = np.asarray(geometry['indices'], int).reshape(-1, 3)
    if not np.isfinite(vertices).all():
        raise ValueError('Nonfinite scan geometry')
    triangles = vertices[faces]
    if (np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]), axis=1) <= 1e-12).any():
        raise ValueError('Degenerate scan triangles')
    if not filter_boundary(vertices, faces, value['boundary']).all():
        raise ValueError('Scan faces cross the reviewed boundary')
    objects = {o['id']: o for o in value['objects']}
    _unique(value['objects']); _unique(value['components'])
    for obj in objects.values():
        parent, visited = obj['parent_id'], {obj['id']}
        while parent is not None:
            if parent not in objects or parent in visited:
                raise ValueError('Invalid scan parent lineage')
            visited.add(parent); parent = objects[parent]['parent_id']
        transform = np.asarray(obj['transform'], float)
        rotation = transform[:3, :3]
        scale2 = float(np.sum(rotation[:, 0]**2))
        if (not np.isfinite(transform).all() or not np.allclose(transform[3], [0, 0, 0, 1], atol=1e-9, rtol=0)
                or scale2 <= 1e-12 or np.linalg.det(rotation) <= 0
                or not np.allclose(rotation.T @ rotation, np.eye(3)*scale2, atol=1e-6, rtol=1e-6)):
            raise ValueError('Invalid scan object transform')
    for record in [*value['objects'], *value['components']]:
        source_required = record['origin'] != 'owner-authored-addition'
        if bool(record['source_refs']) != source_required:
            raise ValueError('Scan origin and source support disagree')
    offset = 0
    for component in value['components']:
        start, count, oid = (component[k] for k in ('first_face', 'face_count', 'object_id'))
        if type(start) is not int or type(count) is not int or start != offset or start+count > f:
            raise ValueError('Scan components must partition faces')
        if oid is not None and (oid not in objects or component['origin'] != objects[oid]['origin']):
            raise ValueError('Unknown or mismatched scan object')
        if (any(p != component['origin'] for p in geometry['provenance'][start:start+count])
                or any(o != oid for o in geometry['face_object_ids'][start:start+count])):
            raise ValueError('Scan face ownership/provenance disagrees')
        offset += count
    if offset != f:
        raise ValueError('Missing scan component')
    represented = set(geometry['face_object_ids'])
    for obj in objects.values():
        if 'disposition' in obj and (not obj['disposition_reason'].strip()
                or (obj['disposition'] == 'retain') != (obj['id'] in represented)):
            raise ValueError('Scan disposition contradicts represented geometry')
    if geometry_hash(geometry) != value['geometry_sha256']:
        raise ValueError('Scan geometry digest changed')
    _revision(value)
    return value
