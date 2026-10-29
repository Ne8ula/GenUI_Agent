"""Synthetic object evaluation; no model downloads or inference."""

import json
import unittest

import numpy as np

from ffs_trellis import evaluate_object
from test_ffs_fit import l_mesh, surface_points


class ObjectEvaluationTests(unittest.TestCase):
    def test_good_observed_fit_does_not_accept_hidden_geometry_or_contact(self):
        vertices, faces = l_mesh()
        segment = .37 * np.vstack([vertices, surface_points(vertices, faces, 200, 42)])
        original = [value.copy() for value in (vertices, faces, segment)]
        result = evaluate_object(vertices, faces, segment, 0)
        self.assertEqual(result['status'], 'needs-review')
        self.assertGreater(result['observed_fit']['coverage'], .9)
        self.assertLess(result['observed_fit']['mean_cm'], 1)
        self.assertEqual(result['geometry'], {
            'vertices': 12, 'referenced_vertices': 12, 'faces': 20,
            'vertex_connected_components': 1, 'boundary_edges': 0,
            'nonmanifold_edges': 0, 'degenerate_faces': 0,
        })
        self.assertEqual(result['review'], {
            'silhouette': 'pending', 'contact': 'pending', 'completeness': 'pending',
        })
        self.assertEqual(result['placement'], 'fit-to-observed-segment')
        json.dumps(result, allow_nan=False)
        for actual, expected in zip((vertices, faces, segment), original):
            np.testing.assert_array_equal(actual, expected)

    def test_disconnected_parts_and_unused_vertices_are_reported_separately(self):
        vertices, faces = l_mesh()
        vertices = np.vstack([vertices, vertices + [2, 0, 0]])
        faces = np.vstack([faces, faces + 12])
        segment = np.vstack([vertices, surface_points(vertices, faces, 100, 42)])
        vertices = np.vstack([vertices, [100, 100, 100]])
        result = evaluate_object(vertices, faces, segment, 0)
        self.assertEqual(result['geometry']['vertex_connected_components'], 2)
        self.assertEqual(result['geometry']['referenced_vertices'], 24)
        self.assertEqual(result['geometry']['vertices'], 25)
        self.assertEqual(result['status'], 'needs-review')

    def test_open_nonmanifold_and_degenerate_geometry_is_not_hidden(self):
        vertices, faces = l_mesh()
        segment = np.vstack([vertices, surface_points(vertices, faces, 100, 42)])
        faces = np.vstack([faces[1:], faces[1], [0, 0, 0]])
        result = evaluate_object(vertices, faces, segment, 0)
        self.assertEqual(result['geometry']['boundary_edges'], 2)
        self.assertEqual(result['geometry']['nonmanifold_edges'], 2)
        self.assertEqual(result['geometry']['degenerate_faces'], 1)
        self.assertEqual(result['review']['completeness'], 'pending')

    def test_rejects_invalid_or_oversized_geometry(self):
        vertices, faces = l_mesh()
        for changed_vertices, changed_faces in (
            (np.zeros((600001, 3)), faces),
            (vertices, np.tile(faces[:1], (200001, 1))),
            (vertices * np.nan, faces),
            (vertices, np.array([[0, 1, len(vertices)]])),
            (vertices, faces.astype(float)),
            (vertices, faces[:0]),
        ):
            with self.subTest(shape=np.shape(changed_vertices)):
                with self.assertRaises(ValueError):
                    evaluate_object(changed_vertices, changed_faces, vertices, 0)


if __name__ == '__main__':
    unittest.main()
