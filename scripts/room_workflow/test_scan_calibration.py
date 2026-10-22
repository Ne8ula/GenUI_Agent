"""Synthetic calibration only; not evidence of the bedroom's sensor alignment."""
import unittest
import numpy as np
import scan_source as scan


class ScanCalibrationTests(unittest.TestCase):
    def test_trajectory_parser_rejects_missing_ambiguous_or_unbounded_rows(self):
        self.assertTrue(callable(getattr(scan, 'parse_scan_trajectory', None)), 'Missing trajectory parser')
        poses = scan.parse_scan_trajectory(b'1.0 0 0 0 1 2 3\n1.010 0 0 0 2 3 4\n')
        self.assertEqual([p[0] for p in poses], [1., 1.01])
        np.testing.assert_array_equal(poses[0][1][:3, 3], [-1, -2, -3])
        for data in (b'', b'1 0 0 0 1 2\n', b'1 0 0 0 1 2 3 extra\n',
                     b'1 0 0 0 0 0 0\n1.0 0 0 0 0 0 0\n', b'nan 0 0 0 0 0 0\n',
                     b'1 0 0 0 inf 0 0\n', b'\xff', b' '*(2*1024**2+1)):
            with self.subTest(data=data[:40]), self.assertRaises(ValueError):
                scan.parse_scan_trajectory(data)

    def test_project_rotated_scan_grids_without_legacy_focal_assumptions(self):
        self.assertTrue(callable(getattr(scan, 'project_scan_points', None)), 'Missing scan projection')
        K = np.array([[4, 0, 1], [0, 5, .5], [0, 0, 1]])
        pose = scan.trajectory_camera_to_world([.1, .2, .3], [1, 2, 3])
        camera = np.array([[.5, .2, 2.], [0, 0, -1.]])
        world = camera @ pose[:3, :3].T + pose[:3, 3]
        for angle, expected in [(0, [2, 1]), (90, [0, 2]), (180, [0, 0]), (270, [1, 0])]:
            with self.subTest(angle=angle):
                rotated = scan.rotate_scan_intrinsics(K, 3, 2, angle)
                pixels, depth, valid = scan.project_scan_points(world, rotated, pose)
                np.testing.assert_allclose(pixels[0], expected, atol=1e-9)
                np.testing.assert_allclose(depth, [2, -1], atol=1e-9)
                np.testing.assert_array_equal(valid, [True, False])
                self.assertTrue(np.isnan(pixels[1]).all())
        for points in (np.zeros((1000001, 3)), np.array([[np.nan, 0, 2]]), [[1, 2]], [[True]*3]):
            with self.assertRaises(ValueError):
                scan.project_scan_points(points, K, pose)

    def test_axis_angle_world_to_camera_is_inverted_once(self):
        pose = scan.trajectory_camera_to_world([0, 0, np.pi/2], [1, 2, 3])
        rotation = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
        world = np.array([2, 3, 4])
        camera = rotation @ world + [1, 2, 3]
        np.testing.assert_allclose(pose[:3, :3] @ camera + pose[:3, 3], world, atol=1e-6)
        np.testing.assert_allclose(scan.trajectory_camera_to_world([0, 0, 0], [1, 2, 3])[:3, 3], [-1, -2, -3])
        for invalid in ([float('nan'), 0, 0], [0, 0], [True, False, True]):
            with self.assertRaises(ValueError):
                scan.trajectory_camera_to_world(invalid, [0, 0, 0])

    def test_rotated_rgb_calibration_round_trip(self):
        K = np.array([[4, 0, 1], [0, 5, .5], [0, 0, 1]])
        rotated = scan.rotate_scan_intrinsics(K, 3, 2, 90)
        original = np.array([2, 1, 1])
        upright = np.array([0, 2, 1])
        np.testing.assert_allclose(np.linalg.inv(K) @ original, np.linalg.inv(rotated) @ upright, atol=1e-9)
        pose = scan.trajectory_camera_to_world([.1, .2, .3], [1, 2, 3])
        points, valid = scan.unproject_scan_depth(np.full((3, 2), 2.), rotated, pose)
        recovered = np.linalg.inv(pose) @ np.r_[points[2, 0], 1]
        pixel = rotated @ recovered[:3]
        np.testing.assert_allclose(pixel[:2]/pixel[2], upright[:2], atol=.5)
        np.testing.assert_allclose(recovered[:3], np.linalg.inv(K) @ original * 2, atol=1e-6)
        self.assertTrue(valid.all())

    def test_millimeters_and_zero_depth(self):
        depth = scan.scan_depth_millimeters(np.array([[1000, 0], [2000, 3000]], dtype=np.uint16))
        points, valid = scan.unproject_scan_depth(depth, np.eye(3), np.eye(4))
        np.testing.assert_allclose(points[0, 0], [0, 0, 1])
        np.testing.assert_allclose(points[1, 0], [0, 2, 2])
        self.assertFalse(valid[0, 1])
        self.assertTrue(np.isnan(points[0, 1]).all())
        with self.assertRaises(ValueError):
            scan.scan_depth_millimeters(np.array([[1.2]]))
        with self.assertRaises(ValueError):
            scan.unproject_scan_depth(np.ones((1000, 1000)), np.eye(3), np.eye(4))

    def test_unprojection_rejects_unconverted_integer_depth(self):
        with self.assertRaises(ValueError):
            scan.unproject_scan_depth(np.array([[20, 1000]], dtype=np.uint16), np.eye(3), np.eye(4))

    def test_nearest_pose_five_ms_gate_and_ties(self):
        first, second = np.eye(4), np.eye(4); second[0, 3] = 1
        np.testing.assert_array_equal(scan.nearest_scan_pose(1.004, [(1., first), (1.1, second)]), first)
        for timestamp, poses in [(1.006, [(1., first)]), (1.005, [(1., first), (1.01, second)]),
                                 (1., [(1., first), (1., second)]), (1., [])]:
            with self.assertRaises(ValueError):
                scan.nearest_scan_pose(timestamp, poses)

    def test_unprojection_rejects_invalid_calibration(self):
        reflected = np.eye(4); reflected[0, 0] = -1
        for K, pose in [(np.zeros((3, 3)), np.eye(4)), (np.eye(3), reflected),
                        (np.eye(3)*float('nan'), np.eye(4))]:
            with self.assertRaises(ValueError):
                scan.unproject_scan_depth(np.ones((2, 2)), K, pose)
        with self.assertRaises(ValueError):
            scan.rotate_scan_intrinsics(np.eye(3), 640, 480, 45)


if __name__ == '__main__':
    unittest.main()
