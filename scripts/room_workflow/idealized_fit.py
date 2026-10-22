"""Relative-coordinate placement policy idealized-fit-v1, not physical stability."""
import copy
import math
from itertools import product

import numpy as np

from geometry import add_room_shell, filter_boundary, validate_boundary
from idealized_templates import make_object


def rotation(yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    return np.array([[c,-s,0],[s,c,0],[0,0,1]])


def world_vertices(obj):
    spec = obj['object']
    return np.asarray(obj['geometry']['positions']).reshape(-1,3) @ rotation(spec['yaw']).T + spec['translation']


def diagnostic(code, ids, residual, reason):
    return {'code': code, 'object_ids': ids, 'view_ids': [], 'residual': residual, 'reason': reason}


def _boxes(obj):
    spec = obj['object']
    r = rotation(spec['yaw'])
    return [(r @ part['translation'] + spec['translation'],
             np.asarray(part['dimensions'])/2, r @ rotation(part['yaw'])) for part in obj['parts']]


def _penetration(a, b):
    # All M1 parts rotate about Z only; four planar axes plus Z are the full SAT.
    ca, ha, ra = a
    cb, hb, rb = b
    axes = [ra[:,0], ra[:,1], rb[:,0], rb[:,1], ra[:,2]]
    depths = [float(np.abs(axis @ ra) @ ha + np.abs(axis @ rb) @ hb - abs(axis @ (cb-ca)))
              for axis in axes]
    return min(depths)


def _support_distance(points, obj):
    distances = []
    for center, half, axes in _boxes(obj):
        q = np.abs((points-center) @ axes)-half
        signed = np.linalg.norm(np.maximum(q,0), axis=1) + np.minimum(q.max(1),0)
        distances.append(np.abs(signed))
    return float(np.min(distances, axis=0).mean())


def _fitting_views(observations):
    from geometry import unproject

    views = {}
    for observation in observations:
        view = observation.get('view')
        if view is None:
            continue
        mask = np.asarray(view['mask'])
        if mask.ndim != 2 or mask.dtype != bool or min(mask.shape) < 1 or max(mask.shape) > 1024:
            raise ValueError('Invalid source silhouette')
        camera = view['camera']
        unproject(np.ones((1,1)), camera['intrinsics'], camera['world_to_camera'])
        nearer = np.asarray(view['occluder_depth'])
        if (nearer.shape != mask.shape or nearer.dtype.kind not in 'iuf'
                or np.isnan(nearer).any() or (nearer <= 0).any()):
            raise ValueError('Invalid estimated occluder depths')
        valid = np.asarray(view.get('valid_mask', np.ones(mask.shape, bool)))
        if valid.shape != mask.shape or valid.dtype != bool or (mask & ~valid).any():
            raise ValueError('Invalid source silhouette crop')
        image_id = observation['image_id']
        if image_id in views:
            previous = views[image_id]
            union = previous['mask'] | mask
            if (previous['camera'] != camera or not np.array_equal(previous['valid_mask'], valid)
                    or not np.array_equal(previous['occluder_depth'][~union], nearer[~union])):
                raise ValueError('Conflicting fitting views for one source image')
            previous['mask'] = union
            previous['occluder_depth'][union] = np.inf
        else:
            views[image_id] = {'camera': camera, 'mask': mask.copy(), 'valid_mask': valid,
                               'occluder_depth': nearer.copy()}
    return views


def _view_diagnostics(obj, views, diagonal):
    from review_result import make_scene, render

    if not views:
        return []
    vertices = world_vertices(obj)
    faces = np.asarray(obj['geometry']['indices']).reshape(-1,3)
    colors = np.asarray(obj['geometry']['colors']).reshape(-1,3)
    scene = make_scene(vertices, faces)
    diagnostics = []
    for image_id, view in views.items():
        camera, mask, nearer = view['camera'], view['mask'], view['occluder_depth']
        _, depth = render(scene, vertices, colors, faces, camera, (mask.shape[1],mask.shape[0]))
        predicted = np.isfinite(depth) & (depth > 0)
        occluded = predicted & (nearer < depth-max(1e-9,1e-7*diagonal))
        visible = view['valid_mask'] & ~occluded
        union = (predicted | mask) & visible
        residual = None if not union.any() else 1-float(((predicted & mask) & visible).sum()/union.sum())
        reason = ('Fully occluded or no comparable silhouette; agreement unknown' if residual is None else
                  'Visible mask IoU disagreement; unknown occluder coverage is not proof of visibility')
        item = diagnostic('silhouette-disagreement', [obj['object']['id']], residual, reason)
        item['view_ids'] = [image_id]
        diagnostics.append(item)
        a, b = np.argwhere(predicted & visible), np.argwhere(mask & visible)
        center = float(np.linalg.norm(a.mean(0)-b.mean(0))/np.linalg.norm(mask.shape)) if len(a) and len(b) else None
        item = diagnostic('silhouette-center', [obj['object']['id']], center,
                          'Center distance / image diagonal' if center is not None else 'No comparable visible centers')
        item['view_ids'] = [image_id]
        diagnostics.append(item)
    return diagnostics


def fit_object(spec, observations, boundary):
    make_object(spec)
    if (spec['design_priors']['dimension_origin'] != 'owner'
            and 'first-room-fit-review' in spec['review_reasons']):
        raise ValueError('Already fitted dimensions require owner confirmation before refitting')
    p, floor, ceiling = validate_boundary(boundary)
    if not isinstance(observations, list) or len(observations) > 512:
        raise ValueError('Invalid fitting observation budget')
    if any(not isinstance(o, dict) or not isinstance(o.get('id'), str)
           or type(o.get('held_out', False)) is not bool for o in observations):
        raise ValueError('Invalid fitting observation identity/held-out flag')
    if len({o['id'] for o in observations}) != len(observations):
        raise ValueError('Duplicate fitting observations')
    observations = [o for o in observations if o.get('held_out') is not True]
    observations = [o for o in observations if o['id'] in spec['observation_ids']]
    samples = []
    for observation in observations:
        support = observation.get('support')
        if support is None:
            continue
        points = support.get('points')
        if not isinstance(points, list) or len(points) > 512:
            raise ValueError('Invalid fitting support budget')
        if not points:
            continue
        points = np.asarray(points)
        if points.ndim != 2 or points.shape[1] != 3 or points.dtype.kind not in 'iuf' or not np.isfinite(points).all():
            raise ValueError('Invalid fitting support')
        samples.append(points)
    reasons = ['first-room-fit-review']
    if any(o.get('view') is None for o in observations) or not observations:
        reasons.append('silhouette-unavailable')
    if not samples or sum(map(len,samples)) < 12:
        reasons.append('insufficient-support')
        if spec['design_priors']['pose_origin'] != 'owner':
            reasons.append('pose-unfitted')
        if spec['design_priors']['dimension_origin'] != 'owner':
            reasons.append('dimensions-unfitted')
        unresolved = copy.deepcopy(spec)
        unresolved['review_reasons'] = sorted(set(unresolved['review_reasons']+reasons))
        return {'object': unresolved, 'diagnostics': [diagnostic(
            'support-distance', [spec['id']], None, 'Insufficient source support')], 'review_reasons': reasons}
    points = np.concatenate(samples)
    diagonal = float(np.linalg.norm(np.r_[np.ptp(p,axis=0), ceiling-floor]))
    initial = copy.deepcopy(spec)
    if initial['design_priors']['pose_origin'] != 'owner':
        initial['translation'] = [*np.median(points[:,:2], axis=0).tolist(), floor]
    if initial['design_priors']['dimension_origin'] != 'owner':
        reasons.append('dimensions-unconfirmed')
    if np.linalg.matrix_rank(points-points.mean(0), tol=1e-7*diagonal) < 3:
        reasons.append('incomplete-visible-support')
    yaws = [initial['yaw']] if initial['design_priors']['pose_origin'] == 'owner' else (np.arange(24)-12)*math.pi/12
    scales = [(1,1)] if initial['design_priors']['dimension_origin'] == 'owner' else product((1,1.15,1.30), repeat=2)
    views = _fitting_views(observations)
    candidates = []
    for sx, sy in scales:
        for yaw in yaws:
            candidate = copy.deepcopy(initial)
            candidate['yaw'] = float(yaw)
            candidate['dimensions'] = [initial['dimensions'][0]*sx, initial['dimensions'][1]*sy, initial['dimensions'][2]]
            if max(candidate['dimensions']) > 10000:
                continue
            obj = make_object(candidate)
            support_score = min(1., _support_distance(points, obj)/diagonal)
            diagnostics = _view_diagnostics(obj, views, diagonal)
            silhouettes = [d['residual'] if d['residual'] is not None else 1. for d in diagnostics
                           if d['code'] == 'silhouette-disagreement']
            score = .5*(support_score+float(np.mean(silhouettes))) if silhouettes else support_score
            candidates.append((score,candidate,support_score,diagnostics))
    candidates.sort(key=lambda pair: pair[0])
    best, fitted, support_score, diagnostics = candidates[0]
    tied = {round(item['yaw'],9) for score,item,_,_ in candidates if score-best <= max(1e-9,.01*best)}
    if len(tied) > 1:
        reasons.append('ambiguous-yaw')
    for item in diagnostics:
        if item['residual'] is None:
            reasons.append('silhouette-unavailable')
        elif ((item['code'] == 'silhouette-disagreement' and item['residual'] > .5)
              or (item['code'] == 'silhouette-center' and item['residual'] > .1)):
            reasons.append(item['code'])
    reasons = sorted(set(reasons))
    fitted['review_reasons'] = sorted(set(fitted['review_reasons']+reasons))
    diagnostics.insert(0, diagnostic('support-distance', [spec['id']], support_score,
                       'Visible support distance / room diagonal; not reconstruction accuracy'))
    return {'object': fitted, 'diagnostics': diagnostics, 'review_reasons': reasons}


def check_layout(objects, boundary, openings):
    if not isinstance(objects, list) or len(objects) > 64:
        raise ValueError('Invalid layout object budget')
    p, floor, ceiling = validate_boundary(boundary)
    add_room_shell({key: [] for key in ('positions','colors','indices','provenance','source_view_indices')},
                   boundary, openings)
    diagonal = float(np.linalg.norm(np.r_[np.ptp(p, axis=0), ceiling-floor]))
    epsilon, contact = max(1e-9, 1e-7*diagonal), .002*diagonal
    hard, review, contacts, placed = [], [], [], []
    ids = [obj['object']['id'] for obj in objects]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate layout object')
    for obj in objects:
        oid = obj['object']['id']
        vertices = world_vertices(obj)
        faces = np.asarray(obj['geometry']['indices']).reshape(-1,3)
        if not filter_boundary(vertices, faces, boundary).all():
            hard.append(diagnostic('outside-room', [oid], None, 'Whole object must fit; no clipping permitted'))
        gap = float(vertices[:,2].min()-floor)
        if gap > .005*diagonal:
            hard.append(diagnostic('floor-gap', [oid], gap/diagonal, 'Object is above the floor contact band'))
        elif abs(gap) <= contact:
            contacts.append(diagnostic('floor-contact', [oid], abs(gap)/diagonal, 'Contact only; not a stability claim'))
        boxes = _boxes(obj)
        placed.append((oid, vertices.min(0), vertices.max(0), boxes))
        for opening in openings:
            if opening['kind'] != 'door':
                continue
            a, b = p[opening['edge_index']], p[(opening['edge_index']+1) % len(p)]
            tangent = (b-a)/np.linalg.norm(b-a)
            ccw = sum(np.linalg.det(np.stack((x,y))) for x,y in zip(p,np.roll(p,-1,axis=0))) > 0
            inward = np.array([-tangent[1],tangent[0]])*(1 if ccw else -1)
            depth = .05*diagonal
            center = a+(b-a)*(opening['t0']+opening['t1'])/2+inward*depth/2
            axes = np.eye(3); axes[:2,0] = tangent; axes[:2,1] = inward
            zone = (np.r_[center, (opening['bottom']+opening['top'])/2],
                    np.array([np.linalg.norm(b-a)*(opening['t1']-opening['t0'])/2,
                              depth/2, (opening['top']-opening['bottom'])/2]), axes)
            if any(_penetration(box, zone) > epsilon for box in boxes):
                review.append(diagnostic('door-approach', [oid], None, 'Intersects authored door approach: '+opening['id']))
    for i, (aid, alo, ahi, aboxes) in enumerate(placed):
        for bid, blo, bhi, bboxes in placed[i+1:]:
            if (np.minimum(ahi,bhi)-np.maximum(alo,blo) <= contact).any():
                continue
            penetration = max(_penetration(a,b) for a in aboxes for b in bboxes)
            if penetration > contact:
                hard.append(diagnostic('interpenetration', [aid,bid], penetration/diagonal,
                                       'Complete parts overlap beyond the contact tolerance'))
    return {'hard_errors': hard, 'review_reasons': review, 'contacts': contacts}
