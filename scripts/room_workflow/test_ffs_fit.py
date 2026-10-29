"""Synthetic, z-up metre fixtures for mesh-to-segment fitting."""

import unittest

import numpy as np

from ffs_fit import ROTATIONS, fit


def l_mesh():
    outline = np.array([[0, 0], [.8, 0], [.8, .2], [.25, .2],
                        [.25, .5], [0, .5]])
    vertices = np.vstack([np.column_stack([outline, np.full(6, z)])
                          for z in (0., .3)])
    bottom = np.array([[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]])
    sides = [[i, (i + 1) % 6, i + 6] for i in range(6)]
    sides += [[(i + 1) % 6, (i + 1) % 6 + 6, i + 6] for i in range(6)]
    return vertices, np.vstack([bottom, bottom + 6, sides])


def subdivided_box(divisions):
    dimensions = np.sqrt([.5, .5, 2.])
    vertices, faces = [], []
    offset = 0
    for fixed in range(3):
        u, v = [axis for axis in range(3) if axis != fixed]
        nu, nv = divisions[u], divisions[v]
        grid_u, grid_v = np.meshgrid(np.linspace(0, dimensions[u], nu + 1),
                                     np.linspace(0, dimensions[v], nv + 1), indexing='ij')
        indices = np.arange((nu + 1) * (nv + 1)).reshape(nu + 1, nv + 1)
        a, b = indices[:-1, :-1].ravel(), indices[1:, :-1].ravel()
        c, d = indices[1:, 1:].ravel(), indices[:-1, 1:].ravel()
        for side in (0, dimensions[fixed]):
            points = np.zeros((indices.size, 3))
            points[:, fixed], points[:, u], points[:, v] = side, grid_u.ravel(), grid_v.ravel()
            vertices.append(points)
            faces.append(np.vstack([np.column_stack([a, b, c]),
                                    np.column_stack([a, c, d])]) + offset)
            offset += len(points)
    return np.vstack(vertices), np.vstack(faces)


def surface_points(vertices, faces, count, seed):
    """Independent reflected-barycentric sampler, not the fitter's sampler."""
    rng = np.random.default_rng(seed)
    triangles = vertices[faces]
    areas = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                    triangles[:, 2] - triangles[:, 0]), axis=1)
    chosen = triangles[rng.choice(len(faces), count, p=areas / areas.sum())]
    uv = rng.random((count, 2))
    uv[uv.sum(axis=1) > 1] = 1 - uv[uv.sum(axis=1) > 1]
    return (chosen[:, 0] + uv[:, :1] * (chosen[:, 1] - chosen[:, 0])
            + uv[:, 1:] * (chosen[:, 2] - chosen[:, 0]))


def matrix(result):
    return np.array(result['matrix']).reshape(4, 4, order='F')


class FitTests(unittest.TestCase):
    def test_recovers_known_rotation_scale_translation(self):
        vertices, faces = l_mesh()
        rotation = np.array([[0, 0, -1], [1, 0, 0], [0, -1, 0]])
        truth = np.eye(4)
        truth[:3, :3] = .37 * rotation
        truth[:3, 3] = [1.2, -.4, .355]
        local = np.vstack([vertices, surface_points(vertices, faces, 650, 42)])
        segment = local @ truth[:3, :3].T + truth[:3, 3]
        originals = (vertices.copy(), faces.copy(), segment.copy())
        result = fit(vertices, faces, segment, floor_z=.17)
        self.assertGreater(result['coverage'], .95)
        self.assertLess(result['mean_cm'], .5)
        np.testing.assert_allclose(matrix(result), truth, atol=1e-2, rtol=0)
        np.testing.assert_array_equal(ROTATIONS[result['rotation_index']], rotation)
        unused = np.vstack([vertices, [100, 200, -300], [-400, -500, 600]])
        self.assertEqual(result, fit(unused, faces, segment, floor_z=.17))
        self.assertEqual(set(result), {'matrix', 'coverage', 'mean_cm', 'rotation_index'})
        self.assertEqual(len(result['matrix']), 16)
        self.assertIsInstance(result['coverage'], float)
        self.assertIsInstance(result['mean_cm'], float)
        self.assertIsInstance(result['rotation_index'], int)
        for actual, original in zip((vertices, faces, segment), originals):
            np.testing.assert_array_equal(actual, original)

    def test_large_surface_perfect_fit(self):
        vertices, faces = l_mesh()
        vertices *= 6
        triangles = .37 * vertices[faces]
        area = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                       triangles[:, 2] - triangles[:, 0]), axis=1).sum() / 2
        self.assertGreaterEqual(area, 5)
        segment = .37 * np.vstack([vertices, surface_points(vertices, faces, 650, 42)])
        result = fit(vertices, faces, segment, floor_z=0)
        self.assertGreater(result['coverage'], .95)
        self.assertLess(result['mean_cm'], .5)

    def test_finely_subdivided_surface_perfect_fit(self):
        vertices, faces = subdivided_box((100, 100, 200))
        triangles = vertices[faces]
        area = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                       triangles[:, 2] - triangles[:, 0]), axis=1).sum() / 2
        self.assertEqual(len(faces), 200000)
        # This 5 m² box reaches both limits exactly; allow only floating-point roundoff.
        self.assertAlmostEqual(area, 5, places=12)
        edges = triangles - np.roll(triangles, 1, axis=1)
        self.assertLessEqual(np.linalg.norm(edges, axis=2).max(), .01 + 1e-12)
        corners = np.unique(vertices[np.all((vertices == 0) | (vertices == vertices.max(axis=0)),
                                           axis=1)], axis=0)
        segment = np.vstack([corners, surface_points(vertices, faces, 400, 42)])
        result = fit(vertices, faces, segment, floor_z=0)
        self.assertGreater(result['coverage'], .95)
        self.assertLess(result['mean_cm'], .5)

    def test_recovers_fit_with_under_one_percent_outliers_per_tail(self):
        vertices, faces = l_mesh()
        inliers = .37 * np.vstack([vertices, surface_points(vertices, faces, 688, 42)])
        offset = np.array([1.2, -.4, .17])
        outliers = np.tile([5., 6., 7.], (14, 1))
        outliers[7:] *= -1
        segment = np.vstack([inliers, outliers]) + offset
        result = fit(vertices, faces, segment, floor_z=.17)
        truth = np.diag([.37, .37, .37, 1.])
        truth[:3, 3] = offset
        np.testing.assert_allclose(matrix(result), truth, atol=1e-2, rtol=0)
        self.assertGreater(result['coverage'], .95)
        # Full-segment mean must retain distant outliers, not hide their contribution.
        self.assertGreater(result['mean_cm'], 10)
        from ffs_fit import _triangle_distances
        transform = matrix(result)
        placed = vertices @ transform[:3, :3].T + transform[:3, 3]
        distances = _triangle_distances(segment, placed[faces][None]).min(axis=1)
        self.assertLess(distances[:len(inliers)].mean() * 100, .5)
        self.assertAlmostEqual(result['mean_cm'], distances.mean() * 100, places=8)
        self.assertEqual(result['coverage'], np.mean(distances <= .02))

    def test_exact_triangle_distances(self):
        from ffs_fit import _triangle_distances

        triangle = np.array([[[[0., 0, 0], [2, 0, 0], [0, 2, 0]]]])
        query = np.array([[.5, .5, 3], [1, 1, 0], [2, 2, 0], [-1, -1, 0],
                          [1, -2, 0], [0, 0, 0]])
        expected = [3, 0, np.sqrt(2), np.sqrt(2), 2, 0]
        np.testing.assert_allclose(_triangle_distances(query, triangle)[:, 0], expected)
        degenerate = np.array([[[[0., 0, 0], [0, 0, 0], [2, 0, 0]]]])
        np.testing.assert_allclose(_triangle_distances(np.array([[1., 1, 0]]), degenerate), [[1]])

    def test_ground_contact(self):
        vertices, faces = l_mesh()
        angle = .06
        rotation = np.array([[np.cos(angle), -np.sin(angle), 0],
                             [np.sin(angle), np.cos(angle), 0], [0, 0, 1]])
        local = np.vstack([vertices, surface_points(vertices, faces, 450, 17)])
        segment = .37 * local @ rotation.T + [-.3, .8, 1.23]
        result = fit(vertices, faces, segment, floor_z=1.2)
        transform = matrix(result)
        placed = vertices @ transform[:3, :3].T + transform[:3, 3]
        self.assertLess(abs(placed[:, 2].min() - 1.2), .003)

    def test_poor_match_low_coverage(self):
        latitude = np.linspace(0, np.pi, 17)
        longitude = np.linspace(0, 2 * np.pi, 32, endpoint=False)
        vertices = np.array([[np.sin(p) * np.cos(t), np.sin(p) * np.sin(t),
                              np.cos(p)] for p in latitude for t in longitude])
        faces = []
        for row in range(16):
            for col in range(32):
                a, b = row * 32 + col, row * 32 + (col + 1) % 32
                faces.extend([[a, b, a + 32], [b, b + 32, a + 32]])
        rng = np.random.default_rng(8)
        segment = rng.uniform(-.2, .2, (360, 3))
        segment[np.arange(360), np.arange(360) % 3] = np.tile([-.2, .2], 180)
        segment[:, 2] += .2
        result = fit(vertices, np.array(faces), segment, floor_z=0)
        self.assertLess(result['coverage'], .6)

    def test_rotations_are_the_24_proper_axis_rotations(self):
        self.assertEqual(len(ROTATIONS), 24)
        self.assertEqual(len({tuple(r.flat) for r in ROTATIONS}), 24)
        for rotation in ROTATIONS:
            np.testing.assert_array_equal(rotation.T @ rotation, np.eye(3))
            self.assertAlmostEqual(np.linalg.det(rotation), 1)
            self.assertTrue(np.isin(rotation, [-1, 0, 1]).all())

    def test_nearest_across_chunk_boundary(self):
        from ffs_fit import _nearest

        rng = np.random.default_rng(6)
        query = rng.normal(size=(513, 3)) + [1000, -2000, 3000]
        reference = rng.normal(size=(19, 3)) + [1000, -2000, 3000]
        expected = np.linalg.norm(query[:, None] - reference[None, :], axis=2)
        indices, distances = _nearest(query, reference)
        np.testing.assert_array_equal(indices, expected.argmin(axis=1))
        np.testing.assert_allclose(distances, expected.min(axis=1), atol=1e-12)
        indices, distances = _nearest(query, reference, k=12)
        np.testing.assert_allclose(np.sort(distances, axis=1), np.sort(expected, axis=1)[:, :12])
        np.testing.assert_allclose(distances, np.take_along_axis(expected, indices, axis=1))

    def test_rejects_invalid_geometry(self):
        vertices, faces = l_mesh()
        segment = vertices.copy()
        cases = [
            (vertices[:0], faces, segment, 0),
            (vertices, faces[:0], segment, 0),
            (vertices, np.tile(faces[:1], (200001, 1)), segment, 0),
            (vertices, faces, segment[:0], 0),
            (vertices[:, :2], faces, segment, 0),
            (vertices, faces[:, :2], segment, 0),
            (vertices, faces, segment[:, :2], 0),
            (vertices, faces.astype(float), segment, 0),
            (vertices, np.array([[-1, 0, 1]]), segment, 0),
            (vertices, np.array([[0, 1, len(vertices)]]), segment, 0),
            (vertices * np.nan, faces, segment, 0),
            (vertices, faces, np.full_like(segment, np.inf), 0),
            (vertices, faces, segment, np.nan),
            (vertices, faces, segment, [0]),
            (np.zeros_like(vertices), faces, segment, 0),
            (vertices, faces, np.zeros_like(segment), 0),
            (vertices, faces, np.zeros((50001, 3)), 0),
        ]
        for args in cases:
            with self.subTest(shapes=[np.shape(a) for a in args]):
                with self.assertRaises(ValueError):
                    fit(*args)


if __name__ == '__main__':
    unittest.main()
