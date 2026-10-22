"""CPU fixtures, not evidence of WorldMirror or SAM 3D execution."""
import unittest
import numpy as np

import worldmirror_adapter as adapter


class Coordinates(unittest.TestCase):
    def test_camera_translation_rotation_and_reprojection(self):
        pose = np.array([[0., -1, 0, 10], [1, 0, 0, 20], [0, 0, 1, 30], [0, 0, 0, 1]])
        points = np.array([[[8., 21, 34], [10, 20, 32]]])
        camera = adapter.world_to_camera(points, pose)
        np.testing.assert_allclose(camera, [[[1, 2, 4], [0, 0, 2]]])
        np.testing.assert_allclose(adapter.camera_to_world(camera, pose), points)
        pixels, valid = adapter.project(camera, [[100, 0, 50], [0, 80, 40], [0, 0, 1]])
        np.testing.assert_allclose(pixels, [[[75, 80], [50, 40]]])
        self.assertTrue(valid.all())

    def test_rejects_scaled_reflected_nonfinite_and_projective_poses(self):
        for row, column, value in [(0, 0, 2), (0, 0, -1), (0, 3, float('nan')), (3, 0, 1)]:
            pose = np.eye(4); pose[row, column] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                adapter.world_to_camera(np.zeros((2, 3)), pose)

    def test_behind_camera_is_not_visible(self):
        pixels, valid = adapter.project([[0, 0, -1], [0, 0, 0], [1, 1, 2]], np.eye(3))
        self.assertEqual(valid.tolist(), [False, False, True])
        self.assertTrue(np.isfinite(pixels).all())
        np.testing.assert_allclose(pixels[2], [.5, .5])

    def test_pixel_resize_crop_and_inverse_preserve_centers(self):
        transform = {"source_size": [8, 4], "resized_size": [4, 2],
                     "crop_left_top": [1, 0], "model_size": [2, 2]}
        affine = adapter.pixel_transform(transform)
        np.testing.assert_allclose(affine, [[.5, 0, -1.25], [0, .5, -.25], [0, 0, 1]])
        np.testing.assert_allclose(affine @ [2.5, .5, 1], [0, 0, 1])
        np.testing.assert_allclose(np.linalg.inv(affine) @ [0, 0, 1], [2.5, .5, 1])
        mask = np.zeros((4, 8), dtype=bool); mask[:, 2:4] = True
        np.testing.assert_array_equal(adapter.preprocess_mask(mask, transform), [[True, False], [True, False]])
        with self.assertRaises(ValueError):
            adapter.preprocess_mask(mask.T, transform)
        with self.assertRaises(ValueError):
            adapter.pixel_transform({**transform, 'crop_left_top': [3, 0]})

    def test_sam_axes_and_decoded_object_pose_are_reversible(self):
        pose = np.eye(4); pose[:3, 3] = [10, 20, 30]
        np.testing.assert_allclose(adapter.world_to_sam([[[11, 22, 34]]], pose), [[[-1, -2, 4]]])
        np.testing.assert_allclose(adapter.sam_to_world([[[-1, -2, 4]]], pose), [[[11, 22, 34]]])
        decoded = {'rotation': [2**-.5, 0, 0, 2**-.5], 'translation': [1, 2, 3], 'scale': [2, 2, 2]}
        vertices = [[1, 2, 3], [-1, 0, 2]]
        world = adapter.object_to_world(vertices, decoded, pose)
        np.testing.assert_allclose(world, [[5, 20, 39], [9, 16, 37]], atol=1e-7)
        np.testing.assert_allclose(adapter.world_to_object(world, decoded, pose), vertices, atol=1e-7)
        with self.assertRaises(ValueError):
            adapter.object_to_world(vertices, {**decoded, 'scale': [-2, -2, -2]}, pose)
        with self.assertRaises(ValueError):
            adapter.object_to_world(vertices, {**decoded, 'rotation': [1, 1, 1, 1]}, pose)

    def test_dense_map_must_match_image_grid_and_reprojection(self):
        points = np.array([[[0., 0, 2], [2, 0, 2]], [[0, 2, 2], [2, 2, 2]]])
        pointmap = adapter.external_pointmap(points, np.eye(4), np.eye(3), [2, 2])
        np.testing.assert_allclose(pointmap, [[[0, 0, 2], [-2, 0, 2]], [[0, -2, 2], [-2, -2, 2]]])
        self.assertEqual(pointmap.dtype, np.float32)
        for value, size in [(points, [3, 2]), (points+[2, 0, 0], [2, 2]), (-points, [2, 2])]:
            with self.subTest(size=size), self.assertRaises(ValueError):
                adapter.external_pointmap(value, np.eye(4), np.eye(3), size)

    def test_rejects_nonfinite_points_and_bad_intrinsics(self):
        with self.assertRaises(ValueError):
            adapter.world_to_camera([[0, float('inf'), 1]], np.eye(4))
        with self.assertRaises(ValueError):
            adapter.project([[0, 0, 1]], [[0, 0, 0], [0, 1, 0], [0, 0, 1]])


if __name__ == '__main__':
    unittest.main()
