"""Offline candidate evaluation; observed fit does not establish complete geometry."""

import numpy as np

from ffs_fit import fit


def evaluate_object(vertices, faces, segment, floor_z):
    """Report observed-segment fit and indexed topology, never candidate approval."""
    vertices = np.asarray(vertices)
    if vertices.ndim != 2 or len(vertices) > 600000:
        raise ValueError('vertices must be (N, 3) with at most 600000 entries')
    observed_fit = fit(vertices, faces, segment, floor_z)
    vertices = vertices.astype(float, copy=False)
    faces = np.asarray(faces)
    referenced = np.unique(faces)
    triangles = vertices[faces]
    area = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                   triangles[:, 2] - triangles[:, 0]), axis=1)
    surface_faces = faces[area > 0]
    edges = np.concatenate([surface_faces[:, [0, 1]], surface_faces[:, [1, 2]],
                            surface_faces[:, [2, 0]]])
    edges, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    parent = np.arange(len(vertices))
    sizes = np.ones(len(vertices), dtype=np.intp)

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    components = len(referenced)
    for a, b in edges:
        a, b = root(a), root(b)
        if a != b:
            if sizes[a] < sizes[b]:
                a, b = b, a
            parent[b] = a
            sizes[a] += sizes[b]
            components -= 1

    # Index seams can split components; these counts do not prove watertightness.
    return {
        'status': 'needs-review',
        'placement': 'fit-to-observed-segment',
        'observed_fit': observed_fit,
        'geometry': {
            'vertices': len(vertices), 'referenced_vertices': len(referenced),
            'faces': len(faces), 'vertex_connected_components': components,
            'boundary_edges': int(np.count_nonzero(counts == 1)),
            'nonmanifold_edges': int(np.count_nonzero(counts > 2)),
            'degenerate_faces': int(np.count_nonzero(area == 0)),
        },
        'review': {'silhouette': 'pending', 'contact': 'pending', 'completeness': 'pending'},
    }
