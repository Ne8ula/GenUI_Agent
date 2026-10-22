"""Closed data admission for idealization; review authority stays with the host."""
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np
from jsonschema import Draft202012Validator

from complete_candidate import geometry_hash
from geometry import add_room_shell

MAX_METADATA = 16 * 1024**2
MAX_OUTPUT = 64 * 1024**2
SCHEMA = json.loads(Path(__file__).with_name('idealized-room.schema.json').read_text(encoding='utf-8'))
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA)


def _canonical(value):
    # Typed binary64 tokens avoid Python/JS differences in 1.0, exponents and -0.
    if type(value) in (int, float):
        if not math.isfinite(value):
            raise ValueError('Nonfinite number')
        yield '{"$f64le":"' + struct.pack('<d', 0 if value == 0 else value).hex() + '"}'
    elif isinstance(value, dict):
        yield '{'
        for i, key in enumerate(sorted(value)):
            if i:
                yield ','
            yield json.dumps(key, ensure_ascii=False) + ':'
            yield from _canonical(value[key])
        yield '}'
    elif isinstance(value, list):
        yield '['
        for i, item in enumerate(value):
            if i:
                yield ','
            yield from _canonical(item)
        yield ']'
    else:
        yield json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def digest(value):
    result = hashlib.sha256()
    for token in _canonical(value):
        result.update(token.encode('utf-8'))
    return result.hexdigest()


def seal_artifact(value):
    """Compute integrity, never readiness. Caller owns this mutable assembly."""
    value['geometry_sha256'] = geometry_hash(value['geometry'])
    value['revision'] = digest({k: v for k, v in value.items() if k != 'revision'})
    return value


def _size(value, maximum):
    size = 0
    for token in json.JSONEncoder(ensure_ascii=False, allow_nan=False, separators=(',', ':')).iterencode(value):
        size += len(token.encode('utf-8'))
        if size > maximum:
            raise ValueError('Idealization byte budget exceeded')


def _unique(records, key='id'):
    ids = [r[key] for r in records]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate idealization identity')
    return set(ids)


def validate_inventory_lineage(inventory):
    objects = {obj['id']: obj for obj in inventory}
    for obj in inventory:
        if obj['origin'] == 'owner-authored-addition' and (obj['observation_ids'] or any(
                obj['design_priors'][key] != 'owner' for key in ('dimension_origin','pose_origin','color_origin'))):
            raise ValueError('Owner addition cannot claim source-derived support')
        pending, visited = list(obj['predecessor_ids']), set()
        while pending:
            oid = pending.pop()
            if oid == obj['id'] or oid not in objects:
                raise ValueError('Invalid predecessor lineage')
            if oid in visited:
                continue
            visited.add(oid)
            if not obj['omitted'] and not objects[oid]['omitted']:
                raise ValueError('Active successor duplicates a predecessor')
            pending.extend(objects[oid]['predecessor_ids'])


def validate_artifact(value: dict, expected: dict) -> dict:
    if not isinstance(value, dict) or not isinstance(value.get('geometry'), dict):
        raise ValueError('Missing idealized artifact/geometry')
    geometry = value['geometry']
    # Cheap caps precede schema traversal, arrays and hash buffers.
    for key, maximum in (('positions', 600000), ('colors', 600000), ('indices', 1200000), ('provenance', 400000)):
        if not isinstance(geometry.get(key), list) or len(geometry[key]) > maximum:
            raise ValueError('Idealization geometry budget/shape')
    if not isinstance(value.get('inventory'), list) or len(value['inventory']) > 64:
        raise ValueError('Idealization inventory budget')
    error = next(VALIDATOR.iter_errors(value), None)
    if error is not None:
        raise ValueError('Invalid idealization schema at ' + '/'.join(map(str, error.absolute_path)))
    _size({k: v for k, v in value.items() if k != 'geometry'}, MAX_METADATA)
    _size(value, MAX_OUTPUT)
    if not isinstance(expected, dict) or set(expected) != {'job_id', 'bindings', 'parent_revision', 'boundary', 'openings', 'inventory'}:
        raise ValueError('Invalid expected binding')
    if any(value[k] != expected[k] for k in expected):
        raise ValueError('Idealization source/job/parent changed')
    originals = _unique(value['bindings']['originals'])
    observations = _unique(value['bindings']['observations'])
    if any(o['image_id'] not in originals for o in value['bindings']['observations']):
        raise ValueError('Observation belongs to another source')
    frame = value['frame']
    forward, inverse = (np.asarray(frame[k], float) for k in ('source_to_candidate', 'candidate_to_source'))
    if not np.isfinite(forward).all() or not np.isfinite(inverse).all():
        raise ValueError('Nonfinite frame')
    scale = np.linalg.norm(forward[:3, :3], axis=0)
    if (not np.allclose(forward[3], [0, 0, 0, 1], atol=1e-9, rtol=0)
            or not np.allclose(inverse[3], [0, 0, 0, 1], atol=1e-9, rtol=0)
            or scale.min() <= 1e-6 or np.linalg.det(forward[:3, :3]) <= 0
            or not np.allclose(forward[:3, :3].T @ forward[:3, :3], np.eye(3)*scale[0]**2, atol=1e-6, rtol=1e-6)
            or not np.allclose(forward @ inverse, np.eye(4), atol=1e-6, rtol=0)
            or digest(frame) != value['bindings']['frame_sha256']):
        raise ValueError('Nonreversible or changed candidate frame')
    probe = {'positions': [], 'colors': [], 'indices': [], 'provenance': [], 'source_view_indices': []}
    add_room_shell(probe, value['boundary'], value['openings'])
    positions, colors, indices = (geometry[k] for k in ('positions', 'colors', 'indices'))
    if len(positions) % 3 or len(colors) != len(positions) or len(indices) % 3:
        raise ValueError('Invalid geometry shape')
    if any(type(i) is not int or not 0 <= i < len(positions)//3 for i in indices):
        raise ValueError('Invalid geometry index')
    v = np.asarray(positions, float).reshape(-1, 3)
    f = np.asarray(indices, int).reshape(-1, 3)
    if not np.isfinite(v).all() or not np.isfinite(np.asarray(colors)).all():
        raise ValueError('Nonfinite geometry')
    triangles = v[f]
    area = np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]), axis=1)
    if (area <= 1e-12).any() or len(geometry['provenance']) != len(f):
        raise ValueError('Degenerate face or missing provenance')
    object_ids = _unique(value['inventory'])
    validate_inventory_lineage(value['inventory'])
    objects = {o['id']: o for o in value['inventory']}
    claimed = set()
    for obj in objects.values():
        refs = set(obj['observation_ids'])
        if not refs <= observations or obj['id'] in obj['predecessor_ids']:
            raise ValueError('Invalid object source/lineage')
        if obj['origin'] == 'idealized-procedural' and not refs:
            raise ValueError('Unsupported procedural inventory addition')
        if not obj['omitted']:
            if claimed & refs:
                raise ValueError('Duplicated observation across active objects')
            claimed |= refs
    _unique(value['components'])
    next_face, represented = 0, set()
    for component in value['components']:
        start, count, oid = component['first_face'], component['face_count'], component['object_id']
        refs = set(component['source_reference_ids'])
        if type(start) is not int or type(count) is not int or start != next_face or start + count > len(f):
            raise ValueError('Component ranges must partition faces')
        if any(p != component['origin'] for p in geometry['provenance'][start:start+count]):
            raise ValueError('Component provenance disagrees')
        if oid is None:
            if not component['origin'].startswith('authored-') or not refs <= originals:
                raise ValueError('Invalid architecture source/origin')
        elif (oid not in objects or objects[oid]['omitted'] or component['origin'] != objects[oid]['origin']
              or refs != set(objects[oid]['observation_ids'])):
            raise ValueError('Invalid component ownership/source')
        else:
            represented.add(oid)
        next_face += count
    if next_face != len(f) or represented != {o['id'] for o in objects.values() if not o['omitted']}:
        raise ValueError('Missing component or accepted object')
    omitted = _unique(value['omissions'], 'object_id')
    if omitted != {o['id'] for o in objects.values() if o['omitted']}:
        raise ValueError('Missing omission reason')
    for diagnostic in value['diagnostics']:
        if not set(diagnostic['object_ids']) <= object_ids or not set(diagnostic['view_ids']) <= originals:
            raise ValueError('Diagnostic references another source')
    if geometry_hash(geometry) != value['geometry_sha256']:
        raise ValueError('Geometry digest changed')
    if digest({k: v for k, v in value.items() if k != 'revision'}) != value['revision']:
        raise ValueError('Artifact revision changed')
    return value
