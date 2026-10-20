import unittest
import numpy as np
from material_completion import material_uv, bilinear, project_visible, texture_colors, load_material, MATERIAL_KEYS


class MaterialTests(unittest.TestCase):
    def test_uv_is_world_based_and_continuous_at_reflection(self):
        p = np.array([[-.00000001, .2, 0], [.00000001, .2, 0],
                      [.99999999, .2, 0], [1.00000001, .2, 0]])
        uv = material_uv(p, [0, 0], 1)
        np.testing.assert_allclose(uv[0], uv[1], atol=1e-7)
        np.testing.assert_allclose(uv[2], uv[3], atol=1e-7)
        np.testing.assert_array_equal(material_uv([[.25, .75, 0], [.25, .75, 4]], [0, 0], 1),
                                      [[.25, .75], [.25, .75]])

    def test_visibility_rejects_occluder_background_and_contaminated_neighbor(self):
        K = np.array([[10, 0, 5], [0, 10, 5], [0, 0, 1]])
        depth = np.ones((12, 12))
        p = np.array([[[0, 0, 1], [0, 0, 2], [0, 0, .5]]])
        uv, valid = project_visible(p, np.eye(4), K, depth)
        np.testing.assert_array_equal(valid, [[True, False, False]])
        np.testing.assert_array_equal(uv[0, 0], [5, 5])
        depth[4, 4] = .5
        self.assertFalse(project_visible(p[:, :1], np.eye(4), K, depth)[1].any())
        depth[4, 4] = np.nan
        self.assertFalse(project_visible(p[:, :1], np.eye(4), K, depth)[1].any())
        self.assertFalse(project_visible(np.array([[[-.5, 0, 1]]]), np.eye(4), K, depth)[1].any())

    def test_bilinear_is_pixel_center_consistent(self):
        image = np.array([[[0, 0, 0], [10, 20, 30]], [[20, 40, 60], [30, 60, 90]]], float)
        np.testing.assert_allclose(bilinear(image, np.array([[.5, .5]])), [[15, 30, 45]])
        np.testing.assert_allclose(bilinear(image, np.array([[0, 0], [1, 1]])), [image[0, 0], image[1, 1]])

    def test_overlap_and_boundary_colors_are_frozen(self):
        texture = np.full((64, 64, 3), 128, np.uint8)
        texture[::2] = 180
        base = np.full((4, 3), .4)
        points = np.array([[.2, .3, 0]]*4)
        pixels = np.array([0, 1, 2, 3])
        mask = np.array([[False, True], [True, True]])
        distances = np.array([[.2, 0], [.2, np.nan]])
        colors, _, weight = texture_colors(base, points, pixels, mask, distances, texture, [0, 0], .4)
        np.testing.assert_array_equal(colors[[0, 1, 3]], base[[0, 1, 3]])
        np.testing.assert_array_equal(weight[[0, 1, 3]], [0, 0, 0])
        self.assertTrue(np.any(colors[2] != base[2]))
        self.assertTrue((np.abs(colors-base) <= .12).all())

    def test_material_rejects_withheld_source_unknown_fields_and_tampering(self):
        import json
        import tempfile
        from pathlib import Path
        from PIL import Image
        from genrc_contract import sha256
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            Image.fromarray(np.full((64, 64, 3), 128, np.uint8)).save(p/"material.png")
            np.savez_compressed(p/"source-texels.npz", source_frame=5)
            meta = dict.fromkeys(MATERIAL_KEYS)
            meta.update(schema_version=1, kind="floor-material", origin="source-derived-training-tile",
                        conditioning_frames=[5], fully_depth_supported=True,
                        texture_sha256=sha256(p/"material.png"), source_texels_sha256=sha256(p/"source-texels.npz"),
                        meters_per_tile=.4, world_origin_xy_m=[0, 0])
            def write(value):
                (p/"material.json").write_text(json.dumps(value))
            write(meta)
            load_material(p)
            for change in ({"conditioning_frames": [37]}, {"allow_geometry_changes": True},
                           {"origin": "rejected-room-edit"}, {"meters_per_tile": -1},
                           {"texture_sha256": "0"*64}):
                write({**meta, **change})
                with self.assertRaises(ValueError):
                    load_material(p)


if __name__ == "__main__":
    unittest.main()
