import unittest
import numpy as np
from recolor_candidate import bilinear, color_only_copy, eligible_vertices, original_pixels, rotated_camera, source_gate


class RecolorTests(unittest.TestCase):
    def test_anisotropic_resize_pad_inverse(self):
        transform = {"source_size": [1440, 1920], "resized_size": [392, 518],
                     "padding_left_top": [63, 0], "model_size": [518, 518], "pixel_center_convention": "integer"}
        points = np.array([[50., 70.], [400., 1500.]])
        canvas = (points+.5)*np.array([392/1440, 518/1920])-.5+[63, 0]
        np.testing.assert_allclose(original_pixels(canvas, transform), points)

    def test_rotated_camera_preserves_projection(self):
        rotation = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1.]])
        camera = {"world_to_camera": np.column_stack([np.eye(3), [1, 2, 3]]).tolist()}
        modified = rotated_camera(camera, rotation)
        points = np.array([[2, 3, 4.]])
        pose = np.asarray(modified["world_to_camera"])
        np.testing.assert_allclose((points@rotation.T)@pose[:, :3].T+pose[:, 3], points+[1, 2, 3])

    def test_bilinear_preserves_edge_and_mixed_colors(self):
        image = np.array([[[0, 0, 0], [255, 0, 0]], [[0, 255, 0], [255, 255, 255]]], float)
        np.testing.assert_allclose(bilinear(image, [[.5, .5], [1, 1]]), [[.5, .5, .25], [1, 1, 1]])
        with self.assertRaises(ValueError):
            bilinear(image, [[-1, 0]])

    def test_authored_or_shared_vertices_are_ineligible(self):
        mesh = {"positions": [0]*15, "indices": [0, 1, 2, 2, 3, 4],
                "provenance": ["photo-estimated", "authored-room-shell"]}
        np.testing.assert_array_equal(eligible_vertices(mesh), [True, True, False, False, False])

    def test_occlusion_depth_and_facing_fail_closed(self):
        good = source_gate(np.ones(5), np.array([1, 2, 1, 1, 1]),
                           np.array([1, 1, .5, 1, np.inf]), np.array([1, 1, 1, .1, 1]),
                           np.ones(5, bool), .009)
        np.testing.assert_array_equal(good, [True, False, False, False, False])

    def test_color_only_preserves_every_other_field(self):
        mesh = {"positions": [1, 2, 3], "colors": [.1, .2, .3], "indices": [0, 0, 0],
                "provenance": ["photo-estimated"], "normals": [0, 0, 1], "source_view_indices": [-1]}
        result = color_only_copy(mesh, [[.5, .6, .7]])
        self.assertEqual(mesh["colors"], [.1, .2, .3])
        for key in mesh:
            if key != "colors":
                self.assertEqual(result[key], mesh[key])


if __name__ == "__main__":
    unittest.main()
