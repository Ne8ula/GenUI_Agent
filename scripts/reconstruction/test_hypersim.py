"""Analytic coordinate, integration and bounded-input regression checks."""
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import hypersim as h


class GeometryTests(unittest.TestCase):
    def setUp(self):
        self.matrix = np.diag([1/np.sqrt(3), 0.75/np.sqrt(3), -1.])
        self.unit = h.rays(self.matrix, 1024, 768)

    def test_frontoparallel_plane_from_radial_distances(self):
        depth = 3 / -self.unit[..., 2]
        points, valid = h.world_points(depth, self.unit, np.eye(3), np.zeros(3), 0.0254)
        self.assertTrue(valid.all())
        np.testing.assert_allclose(points[..., 2], -3, atol=1e-12)
        self.assertAlmostEqual(points[0, 0, 0], 3*self.matrix[0, 0]*(2*0.5/1024-1))
        self.assertGreater(points[0, 0, 1], 0)

    def test_translation_scale_and_nonsymmetric_rotation(self):
        rotation = np.array([[0., -1, 0], [1, 0, 0], [0, 0, 1]])
        ray = np.array([[[1., 0, 0]]])
        points, _ = h.world_points(np.array([[2.]]), ray, rotation, np.array([100., 0, 0]), 0.01)
        np.testing.assert_allclose(points[0, 0], [1, 2, 0])

    def test_cv_extrinsic_maps_world_point_to_positive_depth(self):
        rotation = np.array([[0., -1, 0], [1, 0, 0], [0, 0, 1]])
        extrinsic = h.camera_extrinsic(rotation, np.array([100., 200, 300]), 0.01)
        # Local Hypersim (1, 2, -4) -> world (-1, 3, -1).
        np.testing.assert_allclose(extrinsic @ [-1, 3, -1, 1], [1, -2, 4, 1])

    def test_bad_poses_rejected(self):
        for rotation in (np.eye(3)*2, np.diag([1, 1, -1]), np.full((3, 3), np.nan)):
            with self.assertRaises(ValueError):
                h.camera_extrinsic(rotation, np.zeros(3), 0.01)

    def test_invalid_depth_remains_unknown(self):
        depth = np.array([[np.nan, np.inf, 0, -1, 2]])
        with np.errstate(invalid="ignore"):
            points, valid = h.world_points(depth, np.tile([0., 0, -1], (1, 5, 1)), np.eye(3), np.zeros(3), 1)
        self.assertEqual(valid.tolist(), [[False, False, False, False, True]])
        self.assertTrue(np.isnan(points[~valid]).all())

    def test_unsupported_intrinsics_and_dimensions_rejected(self):
        shifted = self.matrix.copy()
        shifted[0, 2] = 0.1
        for matrix, width, height in ((shifted, 1024, 768), (self.matrix, 100000, 100000)):
            with self.assertRaises(ValueError):
                h.rays(matrix, width, height)

    def test_actual_tsdf_plane_at_known_metric_location(self):
        import open3d as o3d
        # A camera at world z=5 looking along -z observes a plane at world z=2.
        color = o3d.geometry.Image(np.full((64, 64, 3), 128, dtype=np.uint8))
        depth = o3d.geometry.Image(np.full((64, 64), 3, dtype=np.float32))
        rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(color, depth, depth_scale=1, depth_trunc=8, convert_rgb_to_intensity=False)
        volume = o3d.pipelines.integration.ScalableTSDFVolume(voxel_length=0.03, sdf_trunc=0.1,
                    color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8)
        volume.integrate(rgbd, o3d.camera.PinholeCameraIntrinsic(64, 64, 55, 55, 31.5, 31.5),
                         h.camera_extrinsic(np.eye(3), np.array([0., 0, 500]), 0.01))
        mesh = volume.extract_triangle_mesh()
        self.assertGreater(len(mesh.triangles), 100)
        np.testing.assert_allclose(np.asarray(mesh.vertices)[:, 2], 2, atol=0.005)


class InputTests(unittest.TestCase):
    def test_missing_reconstruction_stays_in_evaluation(self):
        record = h.score_depth(37, np.ones((2, 2)), np.full((2, 2), np.inf), np.ones((2, 2), dtype=bool))
        self.assertEqual(record['status'], 'no-mesh-hits')
        self.assertEqual(record['reference_valid_pixels'], 4)
        self.assertEqual(record['hit_coverage'], 0)
        self.assertEqual(record['within_5cm_fraction_of_all_valid'], 0)
        self.assertIsNone(record['mae_m_on_hits'])
        # Undefined values must remain valid JSON, not NaN or Infinity.
        json.dumps(record, allow_nan=False)

    def test_no_valid_reference_is_explicitly_unevaluable(self):
        record = h.score_depth(37, np.ones((2, 2)), np.ones((2, 2)), np.zeros((2, 2), dtype=bool))
        self.assertEqual(record['status'], 'no-valid-reference')
        self.assertIsNone(record['hit_coverage'])

    def test_fixture_disjointness(self):
        c = h.config()
        self.assertFalse(set(c['train_frames']) & set(c['evaluation_frames']))
        self.assertEqual(len(h.required_entries(c)), 55)

    def test_unsafe_paths_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            for name in ('../outside', 'C:\\outside', 'sub\\outside'):
                with self.assertRaises(ValueError):
                    h.destination(Path(folder), name)

    def test_budget_rejects_before_network(self):
        with patch('urllib.request.urlopen') as request:
            with self.assertRaises(ValueError):
                h.Budget(10).read('https://example.invalid', 11)
            request.assert_not_called()

    def test_server_ignoring_range_is_rejected(self):
        response = io.BytesIO(b'wrong')
        response.status, response.headers = 200, {}
        with patch('urllib.request.urlopen', return_value=response):
            with self.assertRaises(ValueError):
                h.Budget(100).read('https://example.invalid', 5, expected_range='bytes 0-4/10')

    def test_partial_manifest_is_not_reconstruction_input(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            h.save_json(data/'manifest.json', {'status': 'interrupted-or-failed'})
            with self.assertRaises(ValueError):
                h.verify_manifest(data, h.config())

    def test_cancelled_fetch_persists_incomplete_status(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            with patch.object(h.Budget, 'read', side_effect=KeyboardInterrupt):
                with self.assertRaises(KeyboardInterrupt):
                    h.fetch(data)
            manifest = json.loads((data/'manifest.json').read_text())
            self.assertEqual(manifest['status'], 'interrupted-or-failed')
            self.assertEqual(manifest['files'], {})
            self.assertEqual(manifest['network_bytes'], 0)

    def test_existing_run_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            marker = output/'owner-evidence.txt'
            marker.write_text('keep this')
            with patch.object(h, 'verify_manifest', return_value={}):
                with self.assertRaisesRegex(ValueError, 'Output already exists'):
                    h.reconstruct(Path('unused'), output)
            self.assertEqual(marker.read_text(), 'keep this')


if __name__ == '__main__':
    unittest.main()
