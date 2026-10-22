"""Offline retained-source fitting for an explicit inventory; no model execution."""
import argparse
import copy
import json
from pathlib import Path

import numpy as np

from geometry import validate_boundary
from idealized_contract import MAX_METADATA, VALIDATOR, _size, digest, seal_artifact, validate_artifact
from idealized_fit import fit_object
from idealized_room import _inventory, assemble, write_candidate
from inference import SHA256
from worldmirror_candidate import _json, _read, _same, load_idealization_inputs


def fit_sources(result_path, request_path, raw_directory, candidate_directory,
                suggestions_path, review_path, inventory_path):
    selection = _json(_read(inventory_path, MAX_METADATA))
    keys = {'job_id','bindings','boundary','openings','inventory','parent_revision'}
    if set(selection) != keys:
        raise ValueError('Inventory selection requires exact source and review bindings')
    _inventory(selection['inventory'])
    parent = selection['parent_revision']
    if parent is not None and (not isinstance(parent, str) or not SHA256.fullmatch(parent)):
        raise ValueError('Invalid parent revision')
    packet = load_idealization_inputs(result_path, request_path, raw_directory, candidate_directory,
                                     suggestions_path, review_path, with_fitting_views=True)
    for key in ('job_id','bindings','boundary','openings'):
        _same(selection[key], packet[key], 'Inventory '+key)
    inventory, diagnostics = fit_inventory(packet, selection['inventory'])
    value = assemble(packet, inventory, parent)
    value['diagnostics'].extend(diagnostics)
    value['implementation_sha256'] = digest({
        'assembly': value['implementation_sha256'],
        'source_fit': {name: Path(__file__).with_name(name).read_text(encoding='utf-8') for name in
                       ('idealized_sources.py','worldmirror_candidate.py','object_proposals.py','review_result.py')}})
    seal_artifact(value)
    return validate_artifact(value, {key: value[key] for key in keys})


def draft_inventory(packet, source_sha256):
    """Preview admitted source proposals without fitting, assembly or review authority."""
    if not isinstance(source_sha256, str) or not SHA256.fullmatch(source_sha256):
        raise ValueError('Invalid inventory draft source hash')
    for key in ('bindings', 'frame'):
        if next(VALIDATOR.evolve(schema={'$ref': '#/$defs/'+key}).iter_errors(packet[key]), None):
            raise ValueError('Invalid inventory draft '+key)
    if digest(packet['frame']) != packet['bindings']['frame_sha256']:
        raise ValueError('Inventory draft frame changed')
    polygon, floor, ceiling = validate_boundary(packet['boundary'])
    diagonal = float(np.linalg.norm(np.r_[np.ptp(polygon, axis=0), ceiling-floor]))
    observations, proposals = packet['observations'], packet['inventory_proposals']
    if (not isinstance(observations, list) or len(observations) > 512
            or not isinstance(proposals, list) or len(proposals) > 512):
        raise ValueError('Inventory draft observation/proposal budget exceeded')
    refs = [{key: o[key] for key in ('id', 'image_id', 'mask_sha256')} for o in observations]
    if refs != packet['bindings']['observations'] or len({o['id'] for o in observations}) != len(observations):
        raise ValueError('Inventory draft observations differ from source binding')
    by_id = {o['id']: o for o in observations}
    groups, claimed, proposal_ids = [], set(), set()
    for proposal in proposals:
        ids = proposal['observation_ids']
        if (not isinstance(ids, list) or not ids or any(not isinstance(i, str) for i in ids)
                or len(set(ids)) != len(ids) or not set(ids) <= by_id.keys()
                or claimed.intersection(ids) or proposal['id'] in proposal_ids):
            raise ValueError('Invalid or repeated inventory proposal association')
        if any(by_id[i]['label'] != proposal['label'] for i in ids):
            raise ValueError('Inventory proposal label differs from observations')
        groups.append((proposal['id'], sorted(ids), proposal['review_reasons']))
        claimed.update(ids); proposal_ids.add(proposal['id'])
    groups.extend((None, [o['id']], ['ungrouped-observation']) for o in observations if o['id'] not in claimed)
    inventory, drafts = [], []
    for proposal_id, ids, proposal_reasons in sorted(groups, key=lambda group: group[1]):
        members = [by_id[i] for i in ids]
        labels = sorted({o['label'] for o in members})
        category = 'table' if labels == ['desk'] else labels[0]
        reasons = set(proposal_reasons) | {r for o in members for r in o['review_reasons']}
        if category not in ('table', 'chair', 'sofa', 'cabinet', 'bed'):
            category = None
            reasons.add('unsupported-category')
        if len({o['image_id'] for o in members}) < 2:
            reasons.add('single-view-only')
        supports = [o['support'] for o in members if o['support'] is not None]
        if len(supports) != len(members):
            reasons.add('insufficient-estimated-depth')
        bounds, colors = [], []
        for support in supports:
            b, color = np.asarray(support['visible_bounds']), np.asarray(support['color'])
            if (b.shape != (2, 3) or b.dtype.kind not in 'iuf' or not np.isfinite(b).all()
                    or (b[1] < b[0]).any() or np.abs(b).max() > 10000
                    or color.shape != (3,) or color.dtype.kind not in 'iuf'
                    or not np.isfinite(color).all() or (color < 0).any() or (color > 1).any()):
                raise ValueError('Invalid inventory draft visible support')
            bounds.append(b); colors.append(color)
        if bounds:
            lo = np.min([b[0] for b in bounds], axis=0)
            hi = np.max([b[1] for b in bounds], axis=0)
            if ((hi-lo) <= max(1e-9, 1e-7*diagonal)).any() or hi[2] <= floor:
                reasons.add('missing-visible-size')
        else:
            reasons.add('missing-visible-size')
        blockers = {'unsupported-category', 'single-view-only', 'ambiguous-cross-view-identity',
                    'insufficient-estimated-depth', 'outside-reviewed-room', 'missing-visible-size',
                    'ungrouped-observation'}
        oid = None
        if not reasons.intersection(blockers):
            oid = 'object-'+digest(ids)[:24]
            inventory.append({
                'id': oid, 'category': category, 'origin': 'idealized-procedural',
                'observation_ids': ids, 'predecessor_ids': [],
                'dimensions': [float(hi[0]-lo[0]), float(hi[1]-lo[1]), float(hi[2]-floor)],
                'translation': [float((lo[0]+hi[0])/2), float((lo[1]+hi[1])/2), floor],
                'yaw': 0, 'color_srgb': np.median(colors, axis=0).tolist(),
                'design_priors': {'policy': 'idealized-templates-v1',
                    'dimension_origin': 'visible-support-and-prior', 'pose_origin': 'fitted',
                    'color_origin': 'masked-source',
                    'source_note': 'Visible support bounds seed size; floor-supported height and zero yaw are unfitted priors, not measured full extents.'},
                'omitted': False, 'review_reasons': sorted(reasons | {
                    'dimensions-unconfirmed', 'pose-unfitted', 'first-room-inventory-review'}), 'generator': None})
        drafts.append({'id': 'draft-'+digest(ids)[:24], 'proposal_id': proposal_id,
                       'observation_ids': ids, 'labels': labels, 'category': category,
                       'status': 'proposed' if oid else 'unresolved',
                       'reasons': sorted(reasons), 'inventory_id': oid})
    _inventory(inventory)
    result = {key: copy.deepcopy(packet[key]) for key in ('job_id', 'bindings', 'frame', 'boundary', 'openings')}
    result.update(version=1, kind='eva-idealized-inventory-draft-v1', source_sha256=source_sha256,
                  parent_revision=None, status='needs-review', inventory=inventory, drafts=drafts,
                  limitations=['Preview only: no fitting, placement admission, assembly or owner review.',
                               'Every unresolved draft requires a bound resolution or omission before promotion.'])
    result['revision'] = digest(result)
    _size(result, MAX_METADATA)
    return result


def resolve_inventory(draft, expected_revision, decisions):
    """Resolve an exact host-held preview without fitting or granting readiness."""
    if (not isinstance(expected_revision, str) or not SHA256.fullmatch(expected_revision)
            or not isinstance(draft, dict) or draft.get('revision') != expected_revision):
        raise ValueError('Inventory draft revision changed')
    _size(draft, MAX_METADATA)
    if (draft.get('kind') != 'eva-idealized-inventory-draft-v1'
            or draft.get('status') != 'needs-review'
            or digest({k: v for k, v in draft.items() if k != 'revision'}) != expected_revision):
        raise ValueError('Inventory draft changed')
    items = draft.get('drafts')
    if (not isinstance(items, list) or len(items) > 512
            or not isinstance(decisions, list) or len(decisions) != len(items)):
        raise ValueError('Inventory decisions must cover every draft exactly once')
    _size(decisions, MAX_METADATA)
    _inventory(draft['inventory'])
    objects = {obj['id']: obj for obj in draft['inventory']}
    by_id = {item['id']: item for item in items}
    if len(by_id) != len(items):
        raise ValueError('Repeated inventory draft identity')
    selected = {}
    for decision in decisions:
        if not isinstance(decision, dict):
            raise ValueError('Invalid inventory decision')
        action, did = decision.get('action'), decision.get('draft_id')
        extra = {'accept': set(), 'resolve': {'object'}, 'omit': {'reason'}}
        if (not isinstance(action, str) or action not in extra
                or set(decision) != {'draft_id', 'action'} | extra[action]
                or not isinstance(did, str) or did not in by_id or did in selected):
            raise ValueError('Unknown, repeated or malformed inventory decision')
        selected[did] = decision
    inventory, reviewed = [], []
    for item in items:
        decision = selected[item['id']]
        action, obj = decision['action'], None
        record = {'draft_id': item['id'], 'action': action,
                  'observation_ids': copy.deepcopy(item['observation_ids'])}
        if action == 'accept':
            if item['status'] != 'proposed' or item['inventory_id'] not in objects:
                raise ValueError('Unresolved draft cannot be accepted')
            obj = copy.deepcopy(objects[item['inventory_id']])
            if obj['observation_ids'] != item['observation_ids']:
                raise ValueError('Draft object source references changed')
        elif action == 'omit':
            reason = decision['reason']
            if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
                raise ValueError('Omission requires a bounded reason')
            record['reason'] = reason
        else:
            values = decision['object']
            fields = {'category', 'dimensions', 'translation', 'yaw', 'color_srgb', 'source_note'}
            if not isinstance(values, dict) or set(values) != fields:
                raise ValueError('Resolution requires explicit owner object parameters')
            note = values['source_note']
            if not isinstance(note, str) or not note.strip():
                raise ValueError('Resolution requires an owner interpretation note')
            obj = {key: copy.deepcopy(values[key]) for key in fields - {'source_note'}}
            obj.update(id='object-'+digest(item['observation_ids'])[:24],
                       origin='idealized-procedural', observation_ids=copy.deepcopy(item['observation_ids']),
                       predecessor_ids=[], omitted=False, generator=None,
                       review_reasons=sorted(set(item['reasons']) | {'owner-interpretation-review'}),
                       design_priors={'policy': 'idealized-templates-v1', 'dimension_origin': 'owner',
                                      'pose_origin': 'owner', 'color_origin': 'owner', 'source_note': note})
        if obj is not None:
            inventory.append(obj)
            record['object_id'] = obj['id']
        reviewed.append(record)
    _inventory(inventory)
    review = {'draft_revision': expected_revision, 'decisions': reviewed}
    _size(review, MAX_METADATA)
    return inventory, review


def fit_inventory(packet, selection):
    _inventory(selection)
    observations = {o['id']: o for o in packet['observations']}
    if any(ref not in observations for obj in selection for ref in obj['observation_ids']):
        raise ValueError('Inventory refers to unknown source observations')
    inventory, diagnostics = copy.deepcopy(selection), []
    for i, obj in enumerate(inventory):
        if obj['omitted'] or obj['origin'] == 'owner-authored-addition':
            continue
        if obj['design_priors']['color_origin'] == 'masked-source':
            colors = [observations[ref]['support']['color'] for ref in obj['observation_ids']
                      if observations[ref]['support'] is not None]
            if not colors:
                raise ValueError('Masked-source palette requires visible support; supply an owner color instead')
            obj['color_srgb'] = np.median(colors, axis=0).tolist()
        reasons = {r for ref in obj['observation_ids'] for r in observations[ref]['review_reasons']}
        for proposal in packet['inventory_proposals']:
            if set(proposal['observation_ids']) & set(obj['observation_ids']):
                reasons.update(proposal['review_reasons'])
        obj['review_reasons'] = sorted(set(obj['review_reasons']) | reasons)
        fitted = fit_object(obj, packet['observations'], packet['boundary'])
        inventory[i] = fitted['object']
        diagnostics.extend(fitted['diagnostics'])
    return inventory, diagnostics


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('result','request','raw-directory','candidate-directory','suggestions','review','inventory','output'):
        parser.add_argument('--'+name, type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.output.exists() or args.output.is_symlink():
            raise ValueError('Output exists; preserve prior evidence and choose a fresh directory')
        value = fit_sources(args.result, args.request, args.raw_directory, args.candidate_directory,
                            args.suggestions, args.review, args.inventory)
        write_candidate(args.output, value)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps({'status':'needs-review', 'revision':value['revision'],
                      'objects':sum(not obj['omitted'] for obj in value['inventory'])}))
