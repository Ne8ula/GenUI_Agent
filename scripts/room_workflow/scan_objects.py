"""Conservative scan face association; decoded calibration is not host admission."""
import copy
import re

import numpy as np

from idealized_contract import MAX_METADATA, _size, _unique, digest
from object_suggestions import decode_mask
from scan_contract import _schema, validate_scan_source
from scan_source import project_scan_points


def draft_scan_objects(source, observations):
    """Validate host-supplied observations, without certifying their pixel/face association."""
    validate_scan_source(source)
    _size(observations, MAX_METADATA)
    if not isinstance(observations, list) or len(observations) > 64:
        raise ValueError('Scan inventory budget')
    assets = {a['id']: a for a in source['assets']}
    evaluation = {v[k] for v in source['views'] if v['role'] == 'evaluation'
                  for k in ('rgb', 'depth', 'confidence')}
    claimed = set()
    for item in observations:
        _schema(item, 'inventory_item')
        refs, faces = set(item['source_refs']), item['face_indices']
        if not refs or not refs <= assets.keys() or refs & evaluation:
            raise ValueError('Inventory references unavailable or evaluation evidence')
        if item['evidence'] == 'annotation-box':
            if faces or not any(assets[r]['role'] == 'annotation' for r in refs):
                raise ValueError('Annotation boxes cannot claim surface ownership')
        elif not any(assets[r]['role'] == 'rgb' for r in refs):
            raise ValueError('Mask association requires an RGB reference')
        if (any(type(i) is not int for i in faces) or claimed.intersection(faces)
                or len(claimed)+len(faces) > 400000):
            raise ValueError('Duplicate or invalid source face ownership')
        claimed.update(faces)
    _unique(observations)
    items = {item['id']: item for item in observations}
    for item in observations:
        parent, visited = item['parent_id'], {item['id']}
        while parent is not None:
            if parent not in items or parent in visited:
                raise ValueError('Invalid scan inventory lineage')
            visited.add(parent)
            parent = items[parent]['parent_id']
    draft = {'kind': 'eva-scan-inventory-draft-v1', 'source': copy.deepcopy(source),
             'items': copy.deepcopy(observations)}
    draft['revision'] = digest(draft)
    _size(draft, MAX_METADATA)
    return draft


def resolve_scan_objects(draft, expected_revision, decisions):
    """Return exact inventory dispositions, never host readiness or replacement authority."""
    _size(draft, MAX_METADATA)
    _schema(draft, 'inventory_draft')
    rebuilt = draft_scan_objects(draft['source'], draft['items'])
    if draft != rebuilt or draft['revision'] != expected_revision:
        raise ValueError('Stale or changed scan inventory')
    _size(decisions, MAX_METADATA)
    if not isinstance(decisions, list) or len(decisions) != len(draft['items']):
        raise ValueError('Every scan inventory item needs one decision')
    items = {item['id']: item for item in draft['items']}
    decided = set()
    for decision in decisions:
        _schema(decision, 'inventory_decision')
        oid = decision['object_id']
        if oid not in items or oid in decided or not decision['reason'].strip():
            raise ValueError('Invalid scan inventory decision or reason')
        if decision['action'] == 'retain' and not items[oid]['face_indices']:
            raise ValueError('Retain requires separated source faces')
        decided.add(oid)
    review = {'kind': 'eva-scan-inventory-review-v1', 'draft': copy.deepcopy(draft),
              'decisions': copy.deepcopy(decisions)}
    review['revision'] = digest(review)
    _size(review, MAX_METADATA)
    return review


def assign_scan_faces(source, source_vertices, faces, calibrated_views):
    """Keep original face order; require two depth-visible views and no conflicting vote.

    Coordinates are in the supplied source frame, before source_to_candidate.
    The caller must verify calibration/depth bytes; this pure helper grants no readiness.
    """
    validate_scan_source(source)
    vertices, faces = np.asarray(source_vertices), np.asarray(faces)
    if (vertices.ndim != 2 or vertices.shape[1] != 3 or not 1 <= len(vertices) <= 200000
            or vertices.dtype.kind not in 'iuf' or not np.isfinite(vertices).all()
            or (vertices < -10000).any() or (vertices > 10000).any()
            or faces.ndim != 2 or faces.shape[1] != 3 or not 1 <= len(faces) <= 400000
            or faces.dtype.kind not in 'iu' or (faces < 0).any() or (faces >= len(vertices)).any()):
        raise ValueError('Invalid or oversized scan association geometry')
    vertices = vertices.astype(float)
    if not isinstance(calibrated_views, list) or not 1 <= len(calibrated_views) <= 24:
        raise ValueError('Scan association requires bounded conditioning views')
    source_views = {v['id'] for v in source['views'] if v['role'] == 'conditioning'}
    view_ids, object_ids = [], set()
    for view in calibrated_views:
        if (not isinstance(view, dict) or set(view) != {'id', 'intrinsics', 'camera_to_world', 'depth_m', 'masks'}
                or not isinstance(view['id'], str) or view['id'] not in source_views or view['id'] in view_ids
                or not isinstance(view['masks'], dict) or len(view['masks']) > 64
                or any(not isinstance(oid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', oid)
                       for oid in view['masks'])):
            raise ValueError('Unbound view or invalid scan masks')
        view_ids.append(view['id'])
        object_ids.update(view['masks'])
    if len(object_ids) > 64:
        raise ValueError('Scan object budget')
    object_ids = sorted(object_ids)
    owner = np.full(len(faces), -1, dtype=np.int16)
    support = np.zeros(len(faces), dtype=np.uint32)
    conflict = np.zeros(len(faces), dtype=bool)
    for view_index, view in enumerate(calibrated_views):
        depth = np.asarray(view['depth_m'])
        if (depth.ndim != 2 or not 0 < depth.size <= 640*480 or max(depth.shape) > 640
                or depth.dtype.kind != 'f'):
            raise ValueError('Expected bounded aligned meter depth')
        height, width = depth.shape
        labels = np.full(depth.shape, -1, dtype=np.int16)
        for oid, record in view['masks'].items():
            mask = decode_mask(record, [width, height])
            overlap = mask & (labels != -1)
            labels[mask & (labels == -1)] = object_ids.index(oid)
            labels[overlap] = -2
        for start in range(0, len(faces), 8192):
            stop = min(start+8192, len(faces))
            triangles = vertices[faces[start:stop]]
            if (np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]), axis=1) <= 1e-12).any():
                raise ValueError('Degenerate scan association face')
            samples = np.concatenate((triangles, triangles.mean(axis=1)[:, None, :]), axis=1)
            pixels, z, valid = project_scan_points(samples.reshape(-1, 3), view['intrinsics'], view['camera_to_world'])
            valid &= ((pixels[:, 0] >= 0) & (pixels[:, 0] <= width-1)
                      & (pixels[:, 1] >= 0) & (pixels[:, 1] <= height-1))
            xy = np.zeros(pixels.shape, dtype=np.int32)
            xy[valid] = np.rint(pixels[valid]).astype(np.int32)
            observed = depth[xy[:, 1], xy[:, 0]]
            valid &= (np.isfinite(observed) & (observed > 0) & (observed <= 65.535)
                      & (np.abs(z-observed) <= np.maximum(.02, .01*observed)))
            votes = labels[xy[:, 1], xy[:, 0]].reshape(-1, 4)
            visible = valid.reshape(-1, 4).all(axis=1)
            identity = votes[:, 0]
            agrees = (identity >= 0) & (votes == identity[:, None]).all(axis=1)
            contested = visible & ~agrees & (votes != -1).any(axis=1)
            accepted = visible & agrees
            previous = owner[start:stop]
            conflict[start:stop] |= contested | (accepted & (previous >= 0) & (previous != identity))
            new = accepted & (previous < 0)
            previous[new] = identity[new]
            support[start:stop][accepted] |= np.uint32(1 << view_index)
    reasons, assignments = [], []
    for oid, bits, disputed in zip(owner, support, conflict):
        count = int(bits).bit_count()
        reason = ('conflicting-evidence' if disputed else 'unobserved' if count == 0
                  else 'single-view' if count == 1 else None)
        reasons.append(reason)
        assignments.append(object_ids[int(oid)] if reason is None else None)
    return {'source_sha256': source['revision'], 'view_ids': view_ids,
            'face_object_ids': assignments, 'support_view_bits': support.tolist(),
            'unresolved_reasons': reasons}
