"""CPU idealized assembly, separate from immutable reconstruction evidence."""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path

import numpy as np

from geometry import add_room_shell
from idealized_contract import digest, seal_artifact, validate_artifact, validate_inventory_lineage, _size, MAX_METADATA, MAX_OUTPUT
from idealized_templates import make_object, OBJECT_VALIDATOR
from idealized_fit import check_layout, world_vertices


def make_shell(boundary, openings, color_srgb):
    if (not isinstance(color_srgb, list) or len(color_srgb) != 3 or not all(
            type(v) in (int, float) and math.isfinite(v) and 0 <= v <= 1 for v in color_srgb)):
        raise ValueError('Shell needs an explicit finite source or owner palette')
    mesh = {key: [] for key in ('positions', 'colors', 'indices', 'provenance', 'source_view_indices')}
    add_room_shell(mesh, boundary, openings)
    geometry = {key: mesh[key] for key in ('positions', 'colors', 'indices', 'provenance')}
    geometry['colors'] = color_srgb*(len(geometry['positions'])//3)
    shell_faces = len(geometry['indices'])//3 - 2*len(openings)
    components = [{'id': 'shell', 'object_id': None, 'origin': 'authored-room-shell',
                   'first_face': 0, 'face_count': shell_faces, 'source_reference_ids': []}]
    for i, opening in enumerate(openings):
        components.append({'id': 'cap-'+opening['id'], 'object_id': None,
                           'origin': 'authored-'+opening['kind']+'-cap',
                           'first_face': shell_faces+2*i, 'face_count': 2, 'source_reference_ids': []})
    return {'boundary': copy.deepcopy(boundary), 'geometry': geometry, 'components': components}


def _inventory(inventory):
    if not isinstance(inventory, list) or len(inventory) > 64:
        raise ValueError('Invalid inventory budget')
    _size(inventory, MAX_METADATA)
    ids, refs = set(), set()
    for obj in inventory:
        if next(OBJECT_VALIDATOR.iter_errors(obj), None) is not None:
            raise ValueError('Invalid inventory object')
        if obj['id'] in ids:
            raise ValueError('Duplicate inventory identity')
        ids.add(obj['id'])
        if not obj['omitted']:
            if refs.intersection(obj['observation_ids']):
                raise ValueError('Active objects share observations')
            refs.update(obj['observation_ids'])
        digest(obj)
    validate_inventory_lineage(inventory)


def assemble(packet, inventory, parent_revision):
    _inventory(inventory)
    objects = [make_object(obj) for obj in inventory if not obj['omitted']]
    shell = make_shell(packet['boundary'], packet['openings'], packet['shell_color_srgb'])
    layout = check_layout(objects, packet['boundary'], packet['openings'])
    if layout['hard_errors']:
        raise ValueError('Invalid idealized layout: '+','.join(sorted({d['code'] for d in layout['hard_errors']})))
    geometry, components = shell['geometry'], shell['components']
    for component in components:
        component['source_reference_ids'] = [o['id'] for o in packet['bindings']['originals']]
    for obj in objects:
        spec, mesh = obj['object'], obj['geometry']
        first, base = len(geometry['indices'])//3, len(geometry['positions'])//3
        geometry['positions'].extend(world_vertices(obj).ravel().tolist())
        geometry['colors'].extend(mesh['colors'])
        geometry['indices'].extend((np.asarray(mesh['indices'])+base).tolist())
        geometry['provenance'].extend(mesh['provenance'])
        components.append({'id':'object-'+spec['id'], 'object_id':spec['id'], 'origin':spec['origin'],
                           'first_face':first, 'face_count':len(mesh['indices'])//3,
                           'source_reference_ids':list(spec['observation_ids'])})
    value = {key: copy.deepcopy(packet[key]) for key in
             ('job_id','candidate_id','bindings','frame','boundary','openings')}
    implementation = {name: Path(__file__).with_name(name).read_text(encoding='utf-8') for name in
                      ('idealized_room.py','idealized_templates.py','idealized_fit.py','idealized_contract.py',
                       'idealized-room.schema.json','geometry.py')}
    value.update(version=1, kind='eva-idealized-room-v1', parent_revision=parent_revision,
                 revision='0'*64, units='relative', mode='idealized', inventory=copy.deepcopy(inventory),
                 geometry=geometry, components=components,
                 diagnostics=layout['review_reasons']+layout['contacts']+copy.deepcopy(packet.get('fit_diagnostics', [])),
                 omissions=[{'object_id':obj['id'], 'reason':'Explicit inventory omission'} for obj in inventory if obj['omitted']],
                 implementation_sha256=digest(implementation), geometry_sha256='0'*64,
                 limitations=['Authored complete parts; hidden surfaces and proportions are not recovered evidence.',
                              'Relative units. Inventory, dimensions and room require host-owned review.',
                              'Placement policy idealized-fit-v1 checks contacts, not physical stability.'])
    seal_artifact(value)
    return validate_artifact(value, {key:value[key] for key in ('job_id','bindings','parent_revision','boundary','openings','inventory')})


def apply_correction(inventory, correction):
    _inventory(inventory)
    _size(correction, 65536)
    if not isinstance(correction, dict):
        raise ValueError('Invalid correction')
    action = correction.get('action')
    fields = {'set': {'action','object_id','changes'}, 'omit': {'action','object_id'},
              'restore': {'action','object_id'}, 'split': {'action','object_id','partitions'},
              'merge': {'action','object_ids'},
              'add': {'action','category','dimensions','translation','yaw','color_srgb','source_note'}}
    if not isinstance(action, str) or action not in fields or set(correction) != fields[action]:
        raise ValueError('Unknown correction action/fields')
    result = copy.deepcopy(inventory)
    by_id = {obj['id']:obj for obj in result}
    if 'object_id' in correction and (not isinstance(correction['object_id'], str)
                                      or correction['object_id'] not in by_id):
        raise ValueError('Unknown correction object')
    obj = by_id.get(correction.get('object_id'))
    if action == 'set':
        changes = correction['changes']
        if not isinstance(changes, dict) or not changes or not set(changes) <= {
                'category','dimensions','translation','yaw','color_srgb'}:
            raise ValueError('Unsupported object edit')
        obj.update(copy.deepcopy(changes))
        if 'dimensions' in changes:
            obj['design_priors']['dimension_origin'] = 'owner'
        if {'translation','yaw'} & set(changes):
            obj['design_priors']['pose_origin'] = 'owner'
        if 'color_srgb' in changes:
            obj['design_priors']['color_origin'] = 'owner'
        obj['review_reasons'] = sorted(set(obj['review_reasons']+['edited-inventory']))
    elif action in ('omit','restore'):
        obj['omitted'] = action == 'omit'
    elif action == 'add':
        note = correction['source_note']
        if not isinstance(note,str) or not note.strip() or len(note) > 1000:
            raise ValueError('Owner addition requires bounded source note')
        added = {key:copy.deepcopy(correction[key]) for key in ('category','dimensions','translation','yaw','color_srgb')}
        added.update(id='added-'+digest([inventory,correction])[:16], origin='owner-authored-addition',
                     observation_ids=[], predecessor_ids=[], omitted=False, generator=None,
                     review_reasons=['owner-addition-review'], design_priors={
                         'policy':'idealized-templates-v1', 'dimension_origin':'owner', 'pose_origin':'owner',
                         'color_origin':'owner', 'source_note':note})
        result.append(added)
    elif action == 'split':
        partitions = correction['partitions']
        if (obj['omitted'] or not isinstance(partitions,list) or not 2 <= len(partitions) <= 64
                or any(not isinstance(part,list) or not part or any(not isinstance(x,str) for x in part) for part in partitions)):
            raise ValueError('Invalid observation partitions')
        refs = [ref for part in partitions for ref in part]
        if len(set(refs)) != len(refs) or set(refs) != set(obj['observation_ids']):
            raise ValueError('Split must partition exact source observations')
        obj['omitted'] = True
        for i, refs in enumerate(partitions):
            child = copy.deepcopy(obj)
            child.update(id='split-'+digest([inventory,correction,i])[:16], observation_ids=refs,
                         predecessor_ids=[obj['id']], omitted=False,
                         review_reasons=sorted(set(obj['review_reasons']+['split-placement-review'])))
            result.append(child)
    else:
        ids = correction['object_ids']
        if (not isinstance(ids,list) or not 2 <= len(ids) <= 64 or any(not isinstance(x,str) for x in ids)
                or len(set(ids)) != len(ids) or any(oid not in by_id or by_id[oid]['omitted'] for oid in ids)):
            raise ValueError('Invalid merge predecessors')
        predecessors = [by_id[oid] for oid in ids]
        if len({obj['origin'] for obj in predecessors}) != 1:
            raise ValueError('Cannot merge different provenance origins')
        child = copy.deepcopy(predecessors[0])
        child.update(id='merged-'+digest([inventory,correction])[:16], predecessor_ids=ids,
                     observation_ids=sorted({ref for obj in predecessors for ref in obj['observation_ids']}),
                     review_reasons=sorted({reason for obj in predecessors for reason in obj['review_reasons']}
                                           | {'merge-shape-placement-review'}))
        for obj in predecessors:
            obj['omitted'] = True
        result.append(child)
    _inventory(result)
    return result


def _validate_generated_geometry(artifact):
    # Checksums are not authority: regenerate parts and placement from the admitted inventory.
    packet = dict(artifact, shell_color_srgb=artifact['geometry']['colors'][:3])
    rebuilt = assemble(packet, artifact['inventory'], artifact['parent_revision'])
    if any(artifact[key] != rebuilt[key] for key in ('geometry', 'components')):
        raise ValueError('Geometry/components disagree with authored shell or complete templates')
    if artifact['diagnostics'][:len(rebuilt['diagnostics'])] != rebuilt['diagnostics']:
        raise ValueError('Required layout diagnostics disagree with regenerated placement')
    if any(d['code'] not in ('support-distance', 'silhouette-disagreement', 'silhouette-center')
           for d in artifact['diagnostics'][len(rebuilt['diagnostics']):]):
        raise ValueError('Only source-fit diagnostics may follow regenerated placement')


def write_candidate(directory, artifact):
    validate_artifact(artifact, {key:artifact[key] for key in ('job_id','bindings','parent_revision','boundary','openings','inventory')})
    _validate_generated_geometry(artifact)
    directory = Path(directory)
    directory.mkdir(exist_ok=False)
    digest_bytes, size = hashlib.sha256(), 0
    with (directory/'candidate.json').open('xb') as file:
        for token in json.JSONEncoder(ensure_ascii=False, allow_nan=False, separators=(',',':')).iterencode(artifact):
            data = token.encode('utf-8')
            size += len(data)
            if size > MAX_OUTPUT-1024:
                raise ValueError('Candidate plus manifest exceeds output budget')
            file.write(data); digest_bytes.update(data)
        file.flush(); os.fsync(file.fileno())
    manifest = {'version':1, 'revision':artifact['revision'], 'candidate_sha256':digest_bytes.hexdigest()}
    temporary = directory/'manifest.json.part'
    with temporary.open('xb') as file:
        file.write(json.dumps(manifest, separators=(',',':')).encode('utf-8'))
        file.flush(); os.fsync(file.fileno())
    os.replace(temporary, directory/'manifest.json')
    return directory/'candidate.json'


def read_candidate(directory, expected):
    from worldmirror_candidate import _read, _json

    directory = Path(directory)
    if directory.is_symlink() or any((directory/name).is_symlink() for name in ('manifest.json','candidate.json')):
        raise ValueError('Candidate symlinks are not supported')
    manifest = _json(_read(directory/'manifest.json',1024))
    if set(manifest) != {'version','revision','candidate_sha256'} or type(manifest['version']) is not int or manifest['version'] != 1:
        raise ValueError('Invalid candidate manifest')
    data = _read(directory/'candidate.json',MAX_OUTPUT-1024)
    if hashlib.sha256(data).hexdigest() != manifest['candidate_sha256']:
        raise ValueError('Candidate bytes changed')
    value = validate_artifact(_json(data), expected)
    if value['revision'] != manifest['revision']:
        raise ValueError('Manifest revision changed')
    _validate_generated_geometry(value)
    return value


if __name__ == '__main__':
    from worldmirror_candidate import _read, _json

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--output',type=Path)
    modes.add_argument('--verify',type=Path,help='Reopen candidate; --input is the trusted expected binding')
    modes.add_argument('--correct',type=Path,help='Derive inventory only; --input contains inventory and correction')
    args = parser.parse_args()
    try:
        packet = _json(_read(args.input,MAX_METADATA))
        if args.correct is not None:
            if not isinstance(packet, dict) or set(packet) != {'inventory','correction'}:
                raise ValueError('Correction requires inventory and correction only')
            inventory = apply_correction(packet['inventory'], packet['correction'])
            data = json.dumps(inventory, ensure_ascii=False, allow_nan=False, separators=(',',':')).encode('utf-8')
            if len(data) > MAX_METADATA:
                raise ValueError('Corrected inventory exceeds metadata budget')
            with args.correct.open('xb') as file:
                file.write(data)
                file.flush(); os.fsync(file.fileno())
            value = {'inventory':inventory, 'revision':digest(inventory)}
        elif args.verify is not None:
            value = read_candidate(args.verify, packet)
        else:
            allowed = {'job_id','candidate_id','bindings','frame','boundary','openings','inventory',
                       'observations','inventory_proposals','cameras','masks','shell_color_srgb','parent_revision','fit_diagnostics'}
            if set(packet)-allowed:
                raise ValueError('Unsupported assembly packet fields')
            value = assemble(packet,packet['inventory'],packet.get('parent_revision'))
            write_candidate(args.output,value)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps({'status':'needs-review','revision':value['revision'],
                      'objects':sum(not obj['omitted'] for obj in value['inventory'])}))
