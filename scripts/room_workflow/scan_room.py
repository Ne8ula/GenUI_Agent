"""Scan assembly/correction and recipe-backed storage; never source or host admission."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

import numpy as np

# Isolated execution imports only reviewed sibling code, never the input directory.
if __name__ == '__main__' and sys.flags.isolated:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from idealized_contract import MAX_METADATA, MAX_OUTPUT, _size, digest
from scan_contract import EXPECTED_KEYS, _schema, seal_scan, validate_scan_candidate, validate_scan_source
from scan_objects import resolve_scan_objects
from scan_source import _no_links
from worldmirror_candidate import _json, _read


def _assemble_recipe(recipe):
    """Replay host-decoded inputs, not file paths or instructions from an artifact."""
    _size(recipe, MAX_OUTPUT)
    if (not isinstance(recipe, dict) or set(recipe) != {
            'source', 'review', 'objects', 'parent_revision', 'transforms'}
            or not isinstance(recipe['transforms'], dict) or len(recipe['transforms']) > 64):
        raise ValueError('Invalid scan assembly recipe')
    candidate = assemble_scan(recipe['source'], recipe['review'], recipe['objects'], recipe['parent_revision'])
    transforms = recipe['transforms']
    if not transforms:
        return candidate
    records = {obj['id']: obj for obj in candidate['objects']}
    for oid, change in transforms.items():
        if (oid not in records or records[oid]['disposition'] != 'retain'
                or not isinstance(change, dict) or set(change) != {'transform', 'reason'}):
            raise ValueError('Invalid scan transform binding')
        _schema(change['reason'], 'text')
        if not change['reason'].strip():
            raise ValueError('Scan transform requires an explicit reason')
        records[oid]['transform'] = copy.deepcopy(change['transform'])
    seal_scan(candidate)
    # Reuse closed transform validation before applying any supplied matrix.
    validate_scan_candidate(candidate, {key: candidate[key] for key in EXPECTED_KEYS})
    geometry = candidate['geometry']
    faces = np.asarray(geometry['indices'], int).reshape(-1, 3)
    ids = sorted(transforms)
    tags = {oid: i+1 for i, oid in enumerate(ids)}
    face_tags = [tags.get(oid, 0) for oid in geometry['face_object_ids']]
    # A vertex shared with a neighbor must not move with the corrected object.
    pairs = np.column_stack((faces.reshape(-1), np.repeat(face_tags, 3)))
    unique, remapped = np.unique(pairs, axis=0, return_inverse=True)
    if len(unique) > 200000:
        raise ValueError('Scan correction vertex-split budget')
    vertices = np.asarray(geometry['positions']).reshape(-1, 3)[unique[:, 0]].copy()
    for i, oid in enumerate(ids):
        matrix = np.asarray(transforms[oid]['transform'], float)
        selected = unique[:, 1] == i+1
        vertices[selected] = vertices[selected] @ matrix[:3, :3].T + matrix[:3, 3]
        candidate['diagnostics'].append(f'Owner placement {oid}: {transforms[oid]["reason"]}')
    geometry.update(positions=vertices.reshape(-1).tolist(), indices=remapped.tolist(),
                    colors=np.asarray(geometry['colors']).reshape(-1, 3)[unique[:, 0]].reshape(-1).tolist(),
                    uvs=[0.]*(len(unique)*2))
    candidate['review_sha256'] = digest({'inventory_review': recipe['review']['revision'], 'transforms': transforms})
    seal_scan(candidate)
    return validate_scan_candidate(candidate, {key: candidate[key] for key in EXPECTED_KEYS})


def _verify_recipe(candidate, recipe):
    if not isinstance(candidate, dict) or not EXPECTED_KEYS <= candidate.keys():
        raise ValueError('Missing scan candidate bindings')
    validate_scan_candidate(candidate, {key: candidate[key] for key in EXPECTED_KEYS})
    if digest(candidate) != digest(_assemble_recipe(recipe)):
        raise ValueError('Scan candidate disagrees with regenerated recipe')


def correct_scan_candidate(candidate, correction, expected_revision, recipe):
    """Return (candidate, recipe); absolute candidate-frame placement, never readiness.

    Undo reopens an immutable earlier recipe under a separately supplied host binding.
    Source byte admission, replacement assets and split/merge are not implemented here.
    """
    _verify_recipe(candidate, recipe)
    if candidate['revision'] != expected_revision:
        raise ValueError('Stale scan correction')
    _size(correction, 65536)
    if not isinstance(correction, dict):
        raise ValueError('Invalid scan correction')
    action = correction.get('action')
    fields = {'action', 'object_id', 'reason'} | ({'transform'} if action == 'transform' else set())
    if action not in ('transform', 'omit', 'restore', 'unresolved') or set(correction) != fields:
        raise ValueError('Unknown scan correction action/fields')
    _schema(correction['object_id'], 'id')
    _schema(correction['reason'], 'text')
    if not correction['reason'].strip():
        raise ValueError('Scan correction requires an explicit reason')
    updated = copy.deepcopy(recipe)
    decisions = {d['object_id']: d for d in updated['review']['decisions']}
    oid = correction['object_id']
    if oid not in decisions:
        raise ValueError('Unknown scan correction object')
    if action == 'transform':
        if decisions[oid]['action'] != 'retain':
            raise ValueError('Placement requires retained source faces')
        updated['transforms'][oid] = {key: copy.deepcopy(correction[key]) for key in ('transform', 'reason')}
    else:
        decisions[oid].update(action='retain' if action == 'restore' else action, reason=correction['reason'])
        if action in ('omit', 'unresolved'):
            updated['transforms'].pop(oid, None)
        draft = updated['review']['draft']
        updated['review'] = resolve_scan_objects(draft, draft['revision'], list(decisions.values()))
    updated['parent_revision'] = candidate['revision']
    return _assemble_recipe(updated), updated


def write_scan_candidate(directory, candidate, recipe):
    """Exclusive derived artifact, with the commit manifest written last.

    The recipe adds storage overhead inside the same 64 MiB cap. Its raw decoded
    geometry is only a synthetic/offline input until a host verifies source bytes.
    """
    _verify_recipe(candidate, recipe)
    root = _no_links(directory)
    root.mkdir(exist_ok=False)
    remaining = MAX_OUTPUT-1024
    hashes = {}
    for name, value in (('candidate', candidate), ('recipe', recipe)):
        hasher = hashlib.sha256()
        with _no_links(root/(name+'.json')).open('xb') as handle:
            for token in json.JSONEncoder(ensure_ascii=False, allow_nan=False, separators=(',', ':')).iterencode(value):
                data = token.encode('utf-8')
                remaining -= len(data)
                if remaining < 0:
                    raise ValueError('Scan candidate plus recipe exceeds output budget')
                handle.write(data)
                hasher.update(data)
            handle.flush()
            os.fsync(handle.fileno())
        hashes[name+'_sha256'] = hasher.hexdigest()
    manifest = {'kind': 'eva-scan-saved-v1', 'version': 1, 'revision': candidate['revision'], **hashes}
    data = json.dumps(manifest, separators=(',', ':')).encode('utf-8')
    if len(data) > 1024:
        raise ValueError('Scan manifest budget')
    temporary = _no_links(root/'manifest.json.part')
    with temporary.open('xb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(_no_links(temporary), _no_links(root/'manifest.json'))
    return root/'candidate.json'


def read_scan_candidate(directory, expected):
    """Reopen against external bindings, then replay the exact saved recipe."""
    if not isinstance(expected, dict) or set(expected) != EXPECTED_KEYS | {'recipe_sha256'}:
        raise ValueError('Reopen needs exact host candidate and recipe bindings')
    _schema(expected['recipe_sha256'], 'hash')
    root = _no_links(directory)
    def read(name, limit):
        path = _no_links(root/name)
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError('Scan artifact must be an unlinked regular file')
        return _read(path, limit)
    manifest = _json(read('manifest.json', 1024))
    if (set(manifest) != {'kind', 'version', 'revision', 'candidate_sha256', 'recipe_sha256'}
            or manifest['kind'] != 'eva-scan-saved-v1' or type(manifest['version']) is not int
            or manifest['version'] != 1 or manifest['revision'] != expected['revision']):
        raise ValueError('Invalid scan commit manifest')
    values, remaining = {}, MAX_OUTPUT-1024
    for name in ('candidate', 'recipe'):
        data = read(name+'.json', remaining)
        remaining -= len(data)
        if hashlib.sha256(data).hexdigest() != manifest[name+'_sha256']:
            raise ValueError('Scan artifact bytes changed')
        values[name] = _json(data)
    if digest(values['recipe']) != expected['recipe_sha256']:
        raise ValueError('Scan recipe differs from host binding')
    candidate = validate_scan_candidate(values['candidate'], {key: expected[key] for key in EXPECTED_KEYS})
    _verify_recipe(candidate, values['recipe'])
    return candidate


def assemble_scan(source, review, objects, parent_revision):
    """objects is {mesh_asset_id, geometry, boundary}, not an unverified file path.

    The host must bind decoded geometry/observations to actual source bytes before use.
    This builds a needs-review value only; it does not write, promote or certify a room.
    """
    validate_scan_source(source)
    _size(review, MAX_METADATA)
    _schema(review, 'inventory_review')
    draft = review['draft']
    if (draft['source'] != source or review != resolve_scan_objects(
            draft, draft['revision'], review['decisions'])):
        raise ValueError('Scan review/source changed')
    _size(objects, MAX_OUTPUT)
    if (not isinstance(objects, dict) or set(objects) != {'mesh_asset_id', 'geometry', 'boundary'}
            or not isinstance(objects['geometry'], dict)
            or set(objects['geometry']) != {'positions', 'colors', 'indices'}):
        raise ValueError('Invalid scan assembly input')
    mesh_id = objects['mesh_asset_id']
    if not any(a['id'] == mesh_id and a['role'] == 'mesh' for a in source['assets']):
        raise ValueError('Assembly requires the bound source mesh')
    raw = objects['geometry']
    for key, cap in (('positions', 600000), ('colors', 600000), ('indices', 1200000)):
        if not isinstance(raw[key], list) or len(raw[key]) > cap:
            raise ValueError('Scan assembly geometry budget')
    n, f = len(raw['positions'])//3, len(raw['indices'])//3
    if len(raw['positions']) % 3 or len(raw['indices']) % 3:
        raise ValueError('Invalid scan assembly geometry shape')
    geometry = {**copy.deepcopy(raw), 'uvs': [0.]*(2*n), 'provenance': ['dataset-reconstruction']*f,
                'face_object_ids': [None]*f, 'face_material_indices': [-1]*f,
                'source_face_indices': list(range(f))}
    _schema(geometry, 'geometry')
    vertices = np.asarray(raw['positions'], float).reshape(-1, 3)
    frame = np.asarray(source['frame']['source_to_candidate'], float)
    vertices = vertices @ frame[:3, :3].T + frame[:3, 3]
    geometry['positions'] = vertices.reshape(-1).tolist()
    candidate = {'kind': 'eva-scan-room-v1', 'version': 1, 'capture_id': source['capture_id'],
                 'mode': 'scan-assisted', 'units': 'm', 'source_sha256': source['revision'],
                 'frame_sha256': digest(source['frame']), 'frame': copy.deepcopy(source['frame']),
                 'parent_revision': parent_revision, 'review_sha256': review['revision'],
                 'geometry': geometry, 'objects': [], 'textures': [], 'materials': [],
                 'components': [{'id': 'source-unassigned', 'object_id': None, 'origin': 'dataset-reconstruction',
                                 'first_face': 0, 'face_count': f, 'source_refs': [mesh_id]}],
                 'boundary': copy.deepcopy(objects['boundary']),
                 'diagnostics': ['Needs host review; supplied dataset geometry, not an EVA reconstruction.'],
                 'implementation_sha256': digest({name: Path(__file__).with_name(name).read_text(encoding='utf-8')
                                                 for name in ('scan_room.py', 'scan_objects.py', 'scan_contract.py',
                                                              'scan-room.schema.json')})}
    seal_scan(candidate)
    # Validate all source faces before omission can conceal malformed geometry.
    validate_scan_candidate(candidate, {key: candidate[key] for key in EXPECTED_KEYS})
    decisions = {d['object_id']: d for d in review['decisions']}
    keep = np.ones(f, dtype=bool)
    face_owners = [None]*f
    records = {}
    for item in draft['items']:
        decision = decisions[item['id']]
        action, reason = decision['action'], decision['reason']
        if any(i >= f for i in item['face_indices']):
            raise ValueError('Inventory references a missing source face')
        if action == 'omit':
            keep[item['face_indices']] = False
        elif action == 'retain':
            for i in item['face_indices']:
                face_owners[i] = item['id']
        record = {'id': item['id'], 'source_refs': copy.deepcopy(item['source_refs']),
                  'parent_id': item['parent_id'], 'transform': np.eye(4).tolist(),
                  'origin': 'dataset-reconstruction', 'disposition': action, 'disposition_reason': reason,
                  'unresolved_reasons': [reason] if action == 'unresolved' else []}
        records[item['id']] = record
    selected = np.flatnonzero(keep)
    if not len(selected):
        raise ValueError('Review removed every source face; no display candidate')
    faces = np.asarray(raw['indices'], int).reshape(-1, 3)[selected]
    used, remapped = np.unique(faces.reshape(-1), return_inverse=True)
    geometry.update(positions=vertices[used].reshape(-1).tolist(),
                    colors=np.asarray(raw['colors']).reshape(-1, 3)[used].reshape(-1).tolist(),
                    indices=remapped.tolist(), uvs=[0.]*(2*len(used)),
                    provenance=['dataset-reconstruction']*len(selected),
                    face_object_ids=[face_owners[i] for i in selected],
                    face_material_indices=[-1]*len(selected), source_face_indices=selected.tolist())
    components = []
    for i, oid in enumerate(geometry['face_object_ids']):
        if components and components[-1]['object_id'] == oid:
            components[-1]['face_count'] += 1
        else:
            components.append({'id': f'fragment-{i}', 'object_id': oid, 'origin': 'dataset-reconstruction',
                               'first_face': i, 'face_count': 1,
                               'source_refs': records[oid]['source_refs'] if oid is not None else [mesh_id]})
    candidate['components'] = components
    candidate['objects'] = list(records.values())
    unresolved = sum(r['disposition'] == 'unresolved' for r in records.values())
    omitted = sum(r['disposition'] == 'omit' for r in records.values())
    unassigned = sum(oid is None for oid in geometry['face_object_ids'])
    candidate['diagnostics'].append(f'{unresolved} unresolved items; {omitted} omitted items; {unassigned} unassigned source faces.')
    seal_scan(candidate)
    return validate_scan_candidate(candidate, {key: candidate[key] for key in EXPECTED_KEYS})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--output', type=Path, help='New candidate directory; input is the host-decoded recipe')
    modes.add_argument('--verify', type=Path, help='Saved candidate directory; input is the host expected binding')
    modes.add_argument('--correct', type=Path, help='New candidate directory; input binds candidate, recipe and correction')
    args = parser.parse_args()
    try:
        packet = _json(_read(_no_links(args.input), MAX_METADATA if args.verify is not None else MAX_OUTPUT))
        if args.verify is not None:
            candidate = read_scan_candidate(args.verify, packet)
        else:
            if args.correct is not None:
                if set(packet) != {'candidate', 'recipe', 'correction', 'expected_revision'}:
                    raise ValueError('Invalid scan correction packet')
                candidate, recipe = correct_scan_candidate(
                    packet['candidate'], packet['correction'], packet['expected_revision'], packet['recipe'])
            else:
                recipe = packet
                candidate = _assemble_recipe(recipe)
            write_scan_candidate(args.correct if args.correct is not None else args.output, candidate, recipe)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps({'status': 'needs-review', 'revision': candidate['revision'],
                      'objects': sum(obj['disposition'] == 'retain' for obj in candidate['objects'])}))


if __name__ == '__main__':
    main()
