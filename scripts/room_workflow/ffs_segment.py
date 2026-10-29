"""Deterministic, seed-guided approximate regions; indices retain source order."""

from collections import deque
from itertools import product

import numpy as np


PLANE_BAND = 0.015
VOXEL_SIZE = 0.015
SEED_RADIUS = 0.06
MAX_REACH = 1.2
MAX_HEIGHT = 2.2
FLOOR_CONTACT_MIN = 0.0
FLOOR_CONTACT_MAX = 0.03
DISPLAY_Z_OFFSET = 349.2
RANSAC_ITERATIONS = 400
WALL_NORMAL_Z = 0.2
MIN_PLANE_SHARE = 0.05
MAX_WALLS = 4
FLOOR_SEED_MARGIN = 0.10
RAISED_SEED_HEIGHT = 0.15
SUPPORT_RADIUS = 0.30
SUPPORT_SEED_MARGIN = 0.03
SUPPORT_BELOW_MARKER = 0.05
SUPPORT_ABOVE_MARKER = 0.015
WIDENED_SEED_RADIUS = 0.20
FLOOR_HORIZONTAL_REACH = 0.7
FLOOR_MAX_HEIGHT = 1.0
RAISED_HORIZONTAL_REACH = 0.5
RAISED_HEIGHT_ABOVE_SUPPORT = 0.6
NO_SUPPORT_SEED_OFFSET = 0.05
MIN_STRUCTURE_SHARE = 0.005
MAX_STRUCTURE_PATCHES = 8
STRUCTURE_VERTICAL_SPAN = 1.2
STRUCTURE_FLOOR_REACH = 0.10
STRUCTURE_MIN_TOP = 1.3
STRUCTURE_XY_MARGIN = 0.05
NEIGHBOURS = tuple(key for key in product((-1, 0, 1), repeat=3) if key != (0, 0, 0))


def _points(points):
    points = np.asarray(points, dtype=np.float64)
    if points.ndim != 2 or points.shape[1] != 3 or not np.isfinite(points).all():
        raise ValueError('Expected finite points with shape (N, 3)')
    return points


def display(points: np.ndarray, rotation_z: float) -> np.ndarray:
    """Match displayPoint: rotate XY, then subtract 349.2 from Z."""
    points = _points(points)
    if not np.isfinite(rotation_z):
        raise ValueError('Expected a finite rotation')
    c, s = np.cos(rotation_z), np.sin(rotation_z)
    return np.column_stack((c * points[:, 0] - s * points[:, 1],
                            s * points[:, 0] + c * points[:, 1],
                            points[:, 2] - DISPLAY_Z_OFFSET))


def _least_squares(points):
    centre = points.mean(axis=0)
    _, _, axes = np.linalg.svd(points - centre, full_matrices=False)
    normal = axes[-1]
    if normal[np.argmax(np.abs(normal))] < 0:
        normal = -normal
    return normal, -float(normal @ centre)


def _refit(points, inliers, band):
    inlier_points = points[inliers]
    normal, offset = _least_squares(inlier_points)
    residuals = inlier_points @ normal + offset
    deviation = np.abs(residuals - np.median(residuals))
    core = deviation <= max(3 * np.median(deviation), 1e-12)
    # A single robust refit keeps wall feet/object rims from shifting a clean floor.
    if core.sum() >= 3:
        normal, offset = _least_squares(inlier_points[core])
    return normal, offset, np.abs(points @ normal + offset) <= band


def _ransac(points, band, iterations, seed, orientation=None, level_bounds=None):
    rng = np.random.default_rng(seed)
    best = None
    best_count = 0
    floor_candidates = []
    if len(points) < 3:
        raise ValueError('At least three non-collinear points are required')
    for _ in range(iterations):
        a, b, c = points[rng.choice(len(points), 3, replace=False)]
        normal = np.cross(b - a, c - a)
        length = np.linalg.norm(normal)
        if length <= 1e-12:
            continue
        normal /= length
        if orientation in ('floor', 'support') and abs(normal[2]) < np.sqrt(1 - WALL_NORMAL_Z ** 2):
            continue
        if orientation == 'wall' and abs(normal[2]) >= WALL_NORMAL_Z:
            continue
        if normal[np.argmax(np.abs(normal))] < 0:
            normal = -normal
        offset = -float(normal @ a)
        inliers = np.abs(points @ normal + offset) <= band
        count = int(inliers.sum())
        if level_bounds is not None:
            level = float(np.median(points[inliers, 2]))
            if not level_bounds[0] <= level <= level_bounds[1]:
                continue
        if orientation == 'floor':
            if count >= MIN_PLANE_SHARE * len(points):
                level = float(np.median(points[inliers, 2]))
                floor_candidates.append((level, count, normal, offset))
        elif count > best_count:
            best = normal, offset, inliers
            best_count = count
    if floor_candidates:
        lowest = min(candidate[0] for candidate in floor_candidates)
        _, _, normal, offset = max((candidate for candidate in floor_candidates
                                     if candidate[0] <= lowest + band), key=lambda candidate: candidate[1])
        best = normal, offset, np.abs(points @ normal + offset) <= band
    if best is None:
        raise ValueError('No non-degenerate plane found')
    if orientation in ('floor', 'wall', 'support'):
        best = _refit(points, best[2], band)
        normal, _, inliers = best
        if ((orientation == 'wall' and abs(normal[2]) >= WALL_NORMAL_Z)
                or (orientation != 'wall' and abs(normal[2]) < np.sqrt(1 - WALL_NORMAL_Z ** 2))):
            raise ValueError('Refitted plane violates the orientation constraint')
        if level_bounds is not None and not level_bounds[0] <= np.median(points[inliers, 2]) <= level_bounds[1]:
            raise ValueError('Refitted support is outside the marker height bounds')
    return best


def fit_plane(points, band=PLANE_BAND, iterations=RANSAC_ITERATIONS, seed=0) -> tuple[np.ndarray, float, np.ndarray]:
    """Return unit normal, signed offset (n·p + offset = 0), and inlier mask."""
    points = _points(points)
    if not np.isfinite(band) or band <= 0:
        raise ValueError('Plane band must be positive and finite')
    if not isinstance(iterations, (int, np.integer)) or iterations < 1:
        raise ValueError('Iterations must be a positive integer')
    return _ransac(points, band, iterations, seed)


def _grow(voxels, keys, starts, allowed):
    starts = {tuple(key) for key in keys[starts]}
    queue = deque(sorted(starts))
    visited = set(starts)
    selected = np.zeros(len(keys), dtype=bool)
    oversized = False
    while queue:
        key = queue.popleft()
        indices = np.asarray(voxels[key])
        oversized |= bool(np.any(~allowed[indices]))
        indices = indices[allowed[indices]]
        if not len(indices):
            continue
        selected[indices] = True
        for dx, dy, dz in NEIGHBOURS:
            neighbour = (key[0] + dx, key[1] + dy, key[2] + dz)
            if neighbour in voxels and neighbour not in visited:
                visited.add(neighbour)
                queue.append(neighbour)
    return selected, oversized


def _vertical_structures(points, heights, foreground, seeds):
    candidates = foreground.copy()
    for seed in seeds.values():
        candidates &= np.linalg.norm(points - seed, axis=1) > SEED_RADIUS
    removed = np.zeros(len(points), dtype=bool)
    for _ in range(MAX_STRUCTURE_PATCHES):
        indices = np.flatnonzero(candidates)
        try:
            normal, offset, inliers = _ransac(points[indices], PLANE_BAND, RANSAC_ITERATIONS, 0, 'wall')
        except ValueError:
            break
        if inliers.sum() < MIN_STRUCTURE_SHARE * len(indices):
            break
        patch_indices = indices[inliers]
        # Peel rejected furniture from the search, but never from the returned region.
        candidates[patch_indices] = False
        high = points[patch_indices[heights[patch_indices] > STRUCTURE_MIN_TOP]]
        if len(high) < 3 or np.linalg.matrix_rank(high - high.mean(axis=0)) < 2:
            continue
        # Fit the tall structure itself, rather than its attached furniture face.
        normal, offset, _ = _refit(high, np.ones(len(high), dtype=bool), PLANE_BAND)
        if abs(normal[2]) >= WALL_NORMAL_Z:
            continue
        inliers = np.abs(points[indices] @ normal + offset) <= PLANE_BAND
        if inliers.sum() < MIN_STRUCTURE_SHARE * len(indices):
            continue
        indices = indices[inliers]
        patch = points[indices]
        if (np.ptp(patch[:, 2]) < STRUCTURE_VERTICAL_SPAN
                or heights[indices].min() > STRUCTURE_FLOOR_REACH
                or heights[indices].max() <= STRUCTURE_MIN_TOP):
            continue
        lower = patch[:, :2].min(axis=0) - STRUCTURE_XY_MARGIN
        upper = patch[:, :2].max(axis=0) + STRUCTURE_XY_MARGIN
        removed |= ((np.abs(points @ normal + offset) <= PLANE_BAND)
                    & (points[:, :2] >= lower).all(axis=1)
                    & (points[:, :2] <= upper).all(axis=1))
        candidates &= ~removed
    return removed


def segment(points: np.ndarray, seeds: dict[str, np.ndarray],
            marker_bounds: dict[str, tuple[np.ndarray, np.ndarray]] | None = None) -> dict[str, dict]:
    """Grow bounded regions above a fitted floor; flag shared or clipped regions.

    Empty regions use zero bbox/height/seed_distance. Height is bbox Z extent.
    Seed distance excludes restored contacts, or is zero if no grown point remains.
    Shared points go to the nearest claiming seed; exact ties keep seed order.
    Floor candidates need 5% support; strongest consensus within one band of
    the lowest supported level is refitted before classification.
    """
    points = _points(points)
    seeds = {name: np.asarray(seed, dtype=np.float64) for name, seed in seeds.items()}
    if any(seed.shape != (3,) or not np.isfinite(seed).all() for seed in seeds.values()):
        raise ValueError('Expected finite seeds with shape (3,)')
    marker_bounds = {name: np.asarray(bounds, dtype=np.float64)
                     for name, bounds in (marker_bounds or {}).items()}
    for name, bounds in marker_bounds.items():
        if (name not in seeds or bounds.shape != (2, 3) or not np.isfinite(bounds).all()
                or np.any(bounds[0] > bounds[1])):
            raise ValueError('Expected finite ordered marker bounds (2, 3) for a known seed')
    results = {name: {'indices': np.empty(0, dtype=np.uint32),
                      'bbox': [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0]],
                      'height': 0.0, 'count': 0, 'seed_distance': 0.0,
                      'flags': ['empty', 'marker-only']} for name in seeds}
    if not len(points) or not seeds:
        return results

    floor_candidates = points[points[:, 2] < min(seed[2] for seed in seeds.values()) + FLOOR_SEED_MARGIN]
    normal, offset, _ = _ransac(floor_candidates, PLANE_BAND, RANSAC_ITERATIONS, 0, 'floor')
    heights = points @ normal + offset
    floor = np.abs(heights) <= PLANE_BAND
    walls = np.zeros(len(points), dtype=bool)
    architecture = ~floor & (heights >= FLOOR_CONTACT_MIN) & (heights <= MAX_HEIGHT)
    # Fit walls away from target regions so box faces cannot become the second wall.
    for seed in seeds.values():
        architecture &= np.linalg.norm(points - seed, axis=1) > MAX_REACH
    for _ in range(MAX_WALLS):
        candidates = points[architecture & ~walls]
        try:
            wall_normal, wall_offset, _ = _ransac(candidates, PLANE_BAND, RANSAC_ITERATIONS, 0, 'wall')
        except ValueError:
            break
        inliers = np.abs(points @ wall_normal + wall_offset) <= PLANE_BAND
        remaining = ~floor & ~walls
        if np.sum(inliers & remaining) < MIN_PLANE_SHARE * np.sum(remaining):
            break
        walls |= inliers

    keys = np.floor(points / VOXEL_SIZE).astype(np.int64)
    foreground = ~floor & (heights >= FLOOR_CONTACT_MIN) & ~walls
    walls |= _vertical_structures(points, heights, foreground, seeds)
    foreground &= ~walls
    grown = {}
    for name, seed in seeds.items():
        distances = np.linalg.norm(points - seed, axis=1)
        allowed = (distances <= MAX_REACH) & (heights >= FLOOR_CONTACT_MIN) & (heights <= MAX_HEIGHT)
        excluded = np.zeros(len(points), dtype=bool)
        if name in marker_bounds:
            lower, upper = marker_bounds[name]
            excluded = ((points >= lower - VOXEL_SIZE) & (points <= upper + VOXEL_SIZE)).all(axis=1)
        has_support = False
        raised = seed @ normal + offset > RAISED_SEED_HEIGHT
        if raised:
            local = points[foreground & ~excluded
                           & (np.linalg.norm(points[:, :2] - seed[:2], axis=1) <= SUPPORT_RADIUS)
                           & (points[:, 2] <= seed[2] + SUPPORT_SEED_MARGIN)]
            level_bounds = None
            if name in marker_bounds:
                base_z = marker_bounds[name][0, 2]
                level_bounds = (base_z - SUPPORT_BELOW_MARKER, base_z + SUPPORT_ABOVE_MARKER)
            try:
                support_normal, support_offset, support = _ransac(
                    local, PLANE_BAND, RANSAC_ITERATIONS, 0, 'support', level_bounds)
            except ValueError:
                pass
            else:
                support_xy = local[support, :2]
                # Support must lie beneath the seed, not just slice an object's sides.
                has_support = bool(np.all(seed[:2] > support_xy.min(axis=0))
                                   and np.all(seed[:2] < support_xy.max(axis=0)))
                if has_support:
                    excluded |= np.abs(points @ support_normal + support_offset) <= PLANE_BAND
        if raised:
            if has_support:
                anchor = -float(support_normal[:2] @ seed[:2] + support_offset) / support_normal[2]
            elif name in marker_bounds:
                anchor = marker_bounds[name][0, 2]
            else:
                anchor = seed[2] - NO_SUPPORT_SEED_OFFSET
            allowed &= ((np.linalg.norm(points[:, :2] - seed[:2], axis=1) <= RAISED_HORIZONTAL_REACH)
                        & (points[:, 2] <= anchor + RAISED_HEIGHT_ABOVE_SUPPORT))
        else:
            allowed &= ((np.linalg.norm(points[:, :2] - seed[:2], axis=1) <= FLOOR_HORIZONTAL_REACH)
                        & (heights <= FLOOR_MAX_HEIGHT))
        eligible = foreground & ~excluded
        voxels = {}
        for index in np.flatnonzero(eligible):
            voxels.setdefault(tuple(keys[index]), []).append(index)
        starts = eligible & (distances <= SEED_RADIUS)
        selected, oversized = _grow(voxels, keys, starts, allowed)
        flags = ['no-support'] if raised and not has_support else []
        if not selected.any():
            flags.append('widened-seed')
            starts = eligible & (distances <= WIDENED_SEED_RADIUS)
            selected, oversized = _grow(voxels, keys, starts, allowed)
        if oversized:
            flags.append('oversized')
        if not selected.any():
            results[name]['flags'] += flags
            continue
        grown[name] = np.flatnonzero(selected)

        region = points[selected]
        footprint = {tuple(key) for key in keys[selected, :2]}
        contact = (allowed & ~walls & ~excluded & (not has_support) & (heights <= FLOOR_CONTACT_MAX)
                   & (points[:, :2] >= region[:, :2].min(axis=0)).all(axis=1)
                   & (points[:, :2] <= region[:, :2].max(axis=0)).all(axis=1))
        for index in np.flatnonzero(contact):
            if tuple(keys[index, :2]) in footprint:
                selected[index] = True
        results[name]['indices'] = np.flatnonzero(selected).astype(np.uint32)
        results[name]['flags'] = flags

    names = list(results)
    owner = np.full(len(points), -1, dtype=np.int32)
    nearest = np.full(len(points), np.inf)
    for i, name in enumerate(names):
        indices = results[name]['indices']
        distances = np.linalg.norm(points[indices] - seeds[name], axis=1)
        closer = distances < nearest[indices]
        owner[indices[closer]] = i
        nearest[indices[closer]] = distances[closer]
        for other in names[i + 1:]:
            if np.intersect1d(indices, results[other]['indices']).size:
                results[name]['flags'].append('overlap:' + other)
                results[other]['flags'].append('overlap:' + name)
    for i, name in enumerate(names):
        result = results[name]
        indices = result['indices'][owner[result['indices']] == i]
        result['indices'], result['count'] = indices, len(indices)
        if not len(indices):
            for flag in ('empty', 'marker-only'):
                if flag not in result['flags']:
                    result['flags'].append(flag)
            continue
        lower, upper = points[indices].min(axis=0), points[indices].max(axis=0)
        result['bbox'], result['height'] = [lower.tolist(), upper.tolist()], float(upper[2] - lower[2])
        non_contact = np.intersect1d(indices, grown[name], assume_unique=True)
        if len(non_contact):
            result['seed_distance'] = float(np.linalg.norm(points[non_contact] - seeds[name], axis=1).min())
        else:
            result['flags'].append('marker-only')
    return results
