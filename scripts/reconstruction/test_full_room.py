import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
import numpy as np
import open3d as o3d
from full_room import topology
from export_full_room import write_compact_ply, provenance_ranges
from planar_completion import dense_filter
from adjacent_space import enclosure


class FullRoomTests(unittest.TestCase):
    def test_assumed_rooms_leave_the_three_portal_centerlines_open(self):
        mesh, _ = enclosure(spacing=.1)
        scene = o3d.t.geometry.RaycastingScene()
        scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(mesh))
        rays = np.array([[7.05,1.8,1.4,1,0,0], [.35,-2.15,1.3,-1,0,0],
                         [2.34,-3.65,1.3,0,-1,0]],dtype=np.float32)
        distances = scene.cast_rays(o3d.core.Tensor(rays))["t_hit"].numpy()
        np.testing.assert_allclose(distances,[3.15,.95,.95],atol=1e-5)

    def test_assumed_space_has_a_separate_provenance_range(self):
        mesh = o3d.geometry.TriangleMesh(
            o3d.utility.Vector3dVector(np.zeros((12,3))),
            o3d.utility.Vector3iVector([[0,1,2],[3,4,5],[6,7,8],[9,10,11]]))
        raw = {"mesh_sha256":"raw","topology":{"vertices":3,"triangles":1}}
        hybrid = {"mesh_sha256":"hybrid","topology":{"vertices":6,"triangles":2}}
        report = {"source_mesh_sha256":"raw","parent_mesh_sha256":"hybrid",
                  "assumed_space":{"base_vertices":9,"base_faces":3}}
        ranges = provenance_ranges(raw,hybrid,report,mesh)
        self.assertEqual(ranges["source_recovered"],[6,9])
        self.assertEqual(ranges["assumed_space"],[9,12])
        mesh.triangles = o3d.utility.Vector3iVector([[0,1,2],[3,4,5],[6,7,8],[8,10,11]])
        with self.assertRaisesRegex(ValueError,"crosses"):
            provenance_ranges(raw,hybrid,report,mesh)

    def test_structural_completion_preserves_invalid_background_and_far_free_space(self):
        points = np.array([[-.1,-.1,1], [.1,-.1,1], [0,.1,1]])
        faces = np.array([[0,1,2]])
        K = np.array([[500,0,512], [0,500,384], [0,0,1]])
        unit = np.zeros((768,1024,3)); unit[...,2] = -1
        for depth, extra in ((np.nan, {"protect_invalid":True}), (20., {"max_reference_depth":np.inf})):
            with patch("planar_completion.h.read_h5", return_value=np.full((768,1024),depth)):
                kept, _ = dense_filter(points, faces, Path("."), [0], {0:np.eye(4)}, K, unit, **extra)
                self.assertEqual(len(kept), 0)
                historical, _ = dense_filter(points, faces, Path("."), [0], {0:np.eye(4)}, K, unit)
                self.assertEqual(len(historical), 1)

    def test_provenance_rejects_wrong_parent_and_cross_category_faces(self):
        mesh = o3d.geometry.TriangleMesh(
            o3d.utility.Vector3dVector(np.zeros((9, 3))),
            o3d.utility.Vector3iVector([[0, 1, 2], [3, 4, 5], [6, 7, 8]]))
        raw = {"mesh_sha256": "raw", "topology": {"vertices": 3, "triangles": 1}}
        hybrid = {"mesh_sha256": "hybrid", "topology": {"vertices": 6, "triangles": 2}}
        report = {"source_mesh_sha256": "raw", "parent_mesh_sha256": "hybrid"}
        self.assertEqual(provenance_ranges(raw, hybrid, report, mesh)["inferred"], [3, 6])
        with self.assertRaisesRegex(ValueError, "lineage"):
            provenance_ranges(raw, hybrid, {**report, "parent_mesh_sha256": "wrong"}, mesh)
        mesh.triangles = o3d.utility.Vector3iVector([[0, 1, 2], [2, 4, 5], [6, 7, 8]])
        with self.assertRaisesRegex(ValueError, "crosses"):
            provenance_ranges(raw, hybrid, report, mesh)

    def test_open_boundary_is_not_reported_closed(self):
        mesh = o3d.geometry.TriangleMesh(
            o3d.utility.Vector3dVector([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]),
            o3d.utility.Vector3iVector([[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]))
        self.assertEqual(topology(mesh)["boundary_edges"], 0)
        mesh.triangles = o3d.utility.Vector3iVector(np.asarray(mesh.triangles)[:3])
        self.assertEqual(topology(mesh)["boundary_edges"], 3)

    def test_browser_encoding_keeps_faces_colors_and_metric_precision(self):
        mesh = o3d.geometry.TriangleMesh(
            o3d.utility.Vector3dVector([[.0123456789, -3.1234567, 2.6123456], [7.1234567, 1, 0], [2, 3, 1]]),
            o3d.utility.Vector3iVector([[0, 1, 2]]))
        mesh.vertex_colors = o3d.utility.Vector3dVector(np.array([[255, 90, 0], [42, 70, 80], [90, 200, 100]])/255)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"room.ply"
            error = write_compact_ply(path, mesh)
            loaded = o3d.io.read_triangle_mesh(str(path))
            self.assertLess(error, 1e-6)
            np.testing.assert_array_equal(loaded.triangles, mesh.triangles)
            np.testing.assert_array_equal(loaded.vertex_colors, mesh.vertex_colors)
            np.testing.assert_allclose(loaded.vertices, mesh.vertices, atol=1e-6)
