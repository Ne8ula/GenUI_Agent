"""Fit mesh-local vertices to a z-up metre scan; matrix is column-major (Three.js Matrix4.fromArray)."""

from itertools import permutations, product

import numpy as np


ROTATIONS = []
for axes in permutations(range(3)):
    for signs in product((-1, 1), repeat=3):
        rotation = np.eye(3)[list(axes)] * np.array(signs)[:, None]
        if np.linalg.det(rotation) > 0:
            ROTATIONS.append(rotation)


def _points(value, name):
    if np.iscomplexobj(value):
        raise ValueError(f'{name} must contain real coordinates')
    points = np.asarray(value, dtype=float)
    if (points.ndim != 2 or points.shape[1] != 3 or not len(points)
            or not np.isfinite(points).all()):
        raise ValueError(f'{name} must be a nonempty finite (N, 3) array')
    return points


def _nearest(query, reference, k=1):
    indices = np.empty((len(query), k), dtype=np.intp)
    distances = np.empty((len(query), k))
    # Bound pairwise scratch memory as the centroid candidate set grows.
    chunk_size = min(256, max(1, 1280000 // len(reference)))
    for start in range(0, len(query), chunk_size):
        chunk = query[start:start + chunk_size]
        squared = (chunk[:, None, 0] - reference[None, :, 0]) ** 2
        squared += (chunk[:, None, 1] - reference[None, :, 1]) ** 2
        squared += (chunk[:, None, 2] - reference[None, :, 2]) ** 2
        nearest = (squared.argmin(axis=1)[:, None] if k == 1 else
                   np.argpartition(squared, k - 1, axis=1)[:, :k])
        indices[start:start + len(chunk)] = nearest
        distances[start:start + len(chunk)] = np.sqrt(np.take_along_axis(squared, nearest, axis=1))
    return (indices[:, 0], distances[:, 0]) if k == 1 else (indices, distances)


def _triangle_distances(points, triangles):
    """Exact distances to candidate triangles, including edge/vertex regions."""
    a, b, c = triangles[..., 0, :], triangles[..., 1, :], triangles[..., 2, :]
    normal = np.cross(b - a, c - a)
    normal_squared = np.sum(normal * normal, axis=-1)
    delta = points[:, None, :] - a
    height = np.sum(delta * normal, axis=-1)
    squared = np.divide(height * height, normal_squared,
                        out=np.full_like(height, np.inf), where=normal_squared > 0)
    inside = normal_squared > 0
    edge_squared = np.full_like(squared, np.inf)
    for start, end in ((a, b), (b, c), (c, a)):
        edge = end - start
        delta = points[:, None, :] - start
        length = np.sum(edge * edge, axis=-1)
        projection = np.sum(delta * edge, axis=-1)
        fraction = np.divide(projection, length, out=np.zeros_like(projection), where=length > 0)
        residual = delta - np.clip(fraction, 0, 1)[..., None] * edge
        edge_squared = np.minimum(edge_squared, np.sum(residual * residual, axis=-1))
        inside = inside & (np.sum(np.cross(edge, delta) * normal, axis=-1) >= 0)
    return np.sqrt(np.where(inside, squared, edge_squared))


def _surface_distances(points, samples, sample_faces, triangles):
    distances = np.empty(len(points))
    for start in range(0, len(points), 256):
        chunk = points[start:start + 256]
        nearest, _ = _nearest(chunk, samples, k=12)
        candidates = triangles[sample_faces[nearest]]
        distances[start:start + len(chunk)] = _triangle_distances(chunk, candidates).min(axis=1)
    return distances


def fit(vertices, faces, segment, floor_z):
    """Return a floor-contact similarity fit and segment-to-triangle metrics.

    rotation_index identifies the initial ROTATIONS entry, before 20 rigid ICP steps.
    """
    vertices = _points(vertices, 'vertices')
    segment = _points(segment, 'segment')
    faces = np.asarray(faces)
    if (faces.ndim != 2 or faces.shape[1] != 3 or not len(faces) or len(faces) > 200000
            or not np.issubdtype(faces.dtype, np.integer)
            or np.any(faces < 0) or np.any(faces >= len(vertices))):
        raise ValueError('faces must be (F, 3) integer vertex indices with 1 <= F <= 200000')
    if np.ndim(floor_z) != 0 or np.iscomplexobj(floor_z) or not np.isfinite(floor_z):
        raise ValueError('floor_z must be a finite scalar')
    if len(segment) > 50000:
        raise ValueError('segment must contain at most 50000 points')
    segment_min, segment_max = np.percentile(segment, [1, 99], axis=0)
    segment_diagonal = np.linalg.norm(segment_max - segment_min)
    if segment_diagonal == 0:
        raise ValueError('segment must have nonzero extent')
    # Keep gross outliers out of ICP as well as the initial scale/centre estimate.
    registration = segment[np.all((segment >= segment_min) & (segment <= segment_max), axis=1)]
    if not len(registration):
        raise ValueError('segment has no points within its percentile bounds')
    if len(registration) > 4000:
        registration = registration[np.linspace(0, len(registration) - 1, 4000, dtype=int)]
    referenced = vertices[np.unique(faces)]

    triangles = vertices[faces]
    areas = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                    triangles[:, 2] - triangles[:, 0]), axis=1)
    if not np.isfinite(areas).all() or areas.sum() <= 0:
        raise ValueError('mesh must have finite, nonzero surface area')
    rng = np.random.default_rng(0)
    sample_faces = rng.choice(len(faces), 5000, p=areas / areas.sum())
    chosen = triangles[sample_faces]
    u, v = rng.random((2, 5000))
    root = np.sqrt(u)[:, None]
    samples = ((1 - root) * chosen[:, 0] + root * (1 - v[:, None]) * chosen[:, 1]
               + root * v[:, None] * chosen[:, 2])

    best_score = np.inf
    for index, rotation in enumerate(ROTATIONS):
        rotated = referenced @ rotation.T
        low, high = rotated.min(axis=0), rotated.max(axis=0)
        scale = segment_diagonal / np.linalg.norm(high - low)
        linear = scale * rotation
        translation = (segment_min + segment_max - scale * (low + high)) / 2
        translation[2] = floor_z - scale * low[2]
        _, distances = _nearest(registration, samples @ linear.T + translation)
        score = distances.mean()
        if score < best_score:
            best_score = score
            best_linear, best_translation = linear, translation
            rotation_index = index

    linear, translation = best_linear, best_translation
    for _ in range(20):
        placed = samples @ linear.T + translation
        nearest, _ = _nearest(registration, placed)
        source = placed[nearest]
        source_center, target_center = source.mean(axis=0), registration.mean(axis=0)
        u, _, vt = np.linalg.svd((source - source_center).T @ (registration - target_center))
        correction = vt.T @ u.T
        if np.linalg.det(correction) < 0:
            vt[-1] *= -1
            correction = vt.T @ u.T
        linear = correction @ linear
        translation = correction @ (translation - source_center) + target_center
        translation[2] = floor_z - (referenced @ linear.T)[:, 2].min()

    metric_samples = np.vstack([triangles.mean(axis=1), samples])
    metric_faces = np.concatenate([np.arange(len(faces)), sample_faces])
    # shortcut: k=12 centroid/sample-linked faces; use a BVH for guaranteed global nearest faces.
    distances = _surface_distances(segment, metric_samples @ linear.T + translation, metric_faces,
                                   triangles @ linear.T + translation)
    matrix = np.eye(4)
    matrix[:3, :3], matrix[:3, 3] = linear, translation
    return {'matrix': matrix.ravel(order='F').tolist(),
            'coverage': float(np.mean(distances <= .02)),
            'mean_cm': float(distances.mean() * 100),
            'rotation_index': rotation_index}
