"""Synthetic CPU tests for offline Realsee OBJ packaging; no website code or rendering."""
import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import hashlib

import numpy as np
from PIL import Image

from ffs_artifacts import validate_glb

MODULE = Path(__file__).with_name('ffs_realsee.py')
MTL = b'''newmtl material_0
Ka 0 0 0
Kd 1 1 1
Ks 0 0 0
d 1
illum 1
map_Kd texture_0.jpg

newmtl material_1
Ka 0 0 0
Kd 1 1 1
Ks 0 0 0
d 1
illum 1
map_Kd texture_1.jpg
'''
OBJ = b'''# Synthetic room corner, not source evidence
mtllib scene.mtl
o chunk_0
v 0 0 0
v 1 0 0
v 0 1 0
v 0 0 1
vt 0.1 0.2
vt 0.3 0.4
vt 0.5 0.6
vt 0.7 0.8
usemtl material_0
s off
f 1/1 2/2 3/3
o chunk_1
usemtl material_1
s off
f 1/4 3/3 4/2
'''


def textures():
    result = []
    for color in ('red', 'blue'):
        output = io.BytesIO()
        Image.new('RGB', (2, 2), color).save(output, 'JPEG')
        result.append(output.getvalue())
    return result


def unpack(data):
    size = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + size]), data[28 + size:]


def values(doc, binary, index):
    item = doc['accessors'][index]
    view = doc['bufferViews'][item['bufferView']]
    columns = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[item['type']]
    return np.frombuffer(binary, dtype='<f4' if item['componentType'] == 5126 else '<u4',
                         count=item['count'] * columns, offset=view['byteOffset']).reshape(-1, columns)


class RealseeTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('ffs_realsee', MODULE)
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)
        self.textures = textures()

    def convert(self, obj=OBJ, mtl=MTL, images=None):
        return self.m.convert_scene(obj, mtl, self.textures if images is None else images)

    def test_triangle_positions_uv_seams_materials_and_texture_bytes_survive(self):
        data, report = self.convert()
        doc, binary = unpack(data)
        primitives = doc['meshes'][0]['primitives']
        expected_positions = [[[0, 0, 0], [1, 0, 0], [0, 1, 0]],
                              [[0, 0, 0], [0, 1, 0], [0, 0, 1]]]
        expected_uvs = [[[.1, .8], [.3, .6], [.5, .4]], [[.7, .2], [.5, .4], [.3, .6]]]
        for index, primitive in enumerate(primitives):
            indices = values(doc, binary, primitive['indices']).ravel()
            np.testing.assert_array_equal(values(doc, binary, primitive['attributes']['POSITION'])[indices],
                                          expected_positions[index])
            np.testing.assert_allclose(values(doc, binary, primitive['attributes']['TEXCOORD_0'])[indices],
                                       expected_uvs[index], atol=1e-7)
            self.assertEqual(primitive['material'], index)
            self.assertNotIn('NORMAL', primitive['attributes'])
            view = doc['bufferViews'][doc['images'][index]['bufferView']]
            self.assertEqual(binary[view['byteOffset']:view['byteOffset'] + view['byteLength']], self.textures[index])
        self.assertEqual(report['source_vertices'], 4)
        self.assertEqual(report['triangles'], 2)
        self.assertEqual(report['bounds'], [[0, 0, 0], [1, 1, 1]])
        self.assertEqual(validate_glb(data, self.m.LIMITS)['faces'], 2)

    def test_no_authority_alignment_or_completion_is_manufactured(self):
        data, report = self.convert()
        doc, _ = unpack(data)
        self.assertEqual(report['status'], 'needs-review')
        self.assertEqual(report['classification'], 'inferred')
        self.assertEqual(report['producer'], 'Realsee website; exact model and pipeline unverified')
        self.assertEqual(report['bounds_frame'], 'source Z-up, before root transform')
        self.assertIsNone(report['scan_alignment'])
        self.assertIs(report['complete_surface'], False)
        self.assertIs(report['source_calibration_verified'], False)
        self.assertEqual(len(doc['nodes']), 1)
        self.assertNotIn('uri', json.dumps(doc))
        self.assertNotIn('approved', report)
        self.assertEqual(report['coordinate_transform'], 'root only: (x,y,z) -> (x,z,-y); no scale change')

    def test_texture_sampler_matches_sdk_clamp_and_linear_without_mipmaps(self):
        data, _ = self.convert()
        doc, _ = unpack(data)
        self.assertEqual(doc['samplers'], [{'magFilter': 9729, 'minFilter': 9729,
                                           'wrapS': 33071, 'wrapT': 33071}])
        self.assertTrue(all(texture['sampler'] == 0 for texture in doc['textures']))

    def test_sdk_z_up_to_gltf_y_up_is_one_proper_root_rotation(self):
        data, _ = self.convert()
        doc, _ = unpack(data)
        matrix = np.asarray(doc['nodes'][0]['matrix']).reshape(4, 4, order='F')
        np.testing.assert_array_equal(matrix @ [0, 0, 1, 0], [0, 1, 0, 0])
        np.testing.assert_array_equal(matrix @ [0, 1, 0, 0], [0, 0, -1, 0])
        self.assertEqual(np.linalg.det(matrix[:3, :3]), 1)
        np.testing.assert_array_equal(matrix[:3, :3].T @ matrix[:3, :3], np.eye(3))
        self.assertNotIn('rotation', doc['nodes'][0])
        self.assertNotIn('scale', doc['nodes'][0])

    def test_unexpected_obj_commands_indices_and_nonfinite_data_reject(self):
        cases = [OBJ.replace(b'scene.mtl', b'../scene.mtl'), OBJ + b'call helper.obj\n',
                 OBJ + b'vn 0 0 1\n', OBJ.replace(b's off', b's 1'),
                 OBJ.replace(b'material_1', b'other'), OBJ.replace(b'1/1 2/2 3/3', b'0/1 2/2 3/3'),
                 OBJ.replace(b'1/1 2/2 3/3', b'-1/1 2/2 3/3'),
                 OBJ.replace(b'1/1 2/2 3/3', b'1/99 2/2 3/3'),
                 OBJ.replace(b'1/1 2/2 3/3', b'1/1 2/2 9/3'),
                 OBJ.replace(b'1/1 2/2 3/3', b'1/1 2/2 3/3 4/4'),
                 OBJ.replace(b'v 1 0 0', b'v nan 0 0'), OBJ.replace(b'vt 0.1 0.2', b'vt inf 0.2'),
                 OBJ.replace(b'v 1 0 0', b'v 1e40 0 0'),
                 OBJ.replace(b'usemtl material_0\n', b''), b'', b'\xff',
                 OBJ + b'x' * (2 * 1024**2)]
        for case in cases:
            with self.subTest(case=case[:60]), self.assertRaises(ValueError):
                self.convert(obj=case)

    def test_mtl_cannot_load_remote_or_additional_maps(self):
        for mtl in (MTL.replace(b'texture_0.jpg', b'https://example.invalid/t.jpg'),
                    MTL.replace(b'texture_0.jpg', b'../texture_0.jpg'),
                    MTL + b'map_Bump bump.jpg\n', MTL.replace(b'd 1\n', b'd 0.5\n')):
            with self.subTest(mtl=mtl[:40]), self.assertRaises(ValueError):
                self.convert(mtl=mtl)

    def test_corrupt_missing_extra_and_oversized_textures_reject(self):
        for images in ([], self.textures[:1], self.textures * 2, [b'broken', self.textures[1]],
                       [b'x' * (2 * 1024**2 + 1), self.textures[1]]):
            with self.subTest(count=len(images)), self.assertRaises(ValueError):
                self.convert(images=images)

    def source_fixture(self, root):
        for name in self.m.SOURCE_FILES:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'synthetic provenance; not executed or trusted as authority')
        (root / 'obj/scene.obj').write_bytes(OBJ)
        (root / 'obj/scene.mtl').write_bytes(MTL)
        for i, data in enumerate(self.textures):
            (root / f'obj/texture_{i}.jpg').write_bytes(data)
        files = {name: (root / name).read_bytes() for name in self.m.SOURCE_FILES}
        entries = {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                   for name, data in files.items()}
        digest = hashlib.sha256(json.dumps(entries, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        return files, digest

    def test_prepare_binds_inputs_and_preserves_source_and_existing_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'output'
            original, digest = self.source_fixture(source)
            report = self.m.prepare(source, output, expected_sha256=digest)
            self.assertEqual(report['input_bundle_sha256'], digest)
            self.assertEqual(set(report['inputs']), set(original))
            self.assertEqual(report['glb_sha256'], hashlib.sha256((output / 'scene.glb').read_bytes()).hexdigest())
            self.assertEqual(json.loads((output / 'report.json').read_text()), report)
            self.assertEqual({name: (source / name).read_bytes() for name in original}, original)
            before = (output / 'scene.glb').read_bytes()
            with self.assertRaises(FileExistsError):
                self.m.prepare(source, output, expected_sha256=digest)
            self.assertEqual((output / 'scene.glb').read_bytes(), before)

    def test_prepare_rejects_changed_bundle_oversize_and_source_output(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'output'
            _, digest = self.source_fixture(source)
            with self.assertRaises(ValueError):
                self.m.prepare(source, source / 'generated', expected_sha256=digest)
            self.assertFalse((source / 'generated').exists())
            (source / 'obj/texture_0.jpg').write_bytes(self.textures[1])
            with self.assertRaises(ValueError):
                self.m.prepare(source, output, expected_sha256=digest)
            self.assertFalse(output.exists())
            with (source / 'obj/scene.obj').open('wb') as file:
                file.truncate(4 * 1024**2 + 1)
            with self.assertRaises(ValueError):
                self.m.prepare(source, output, expected_sha256=digest)
            self.assertFalse(output.exists())

    def test_prepare_rejects_symlinked_source_ancestors(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'output'
            _, digest = self.source_fixture(source)
            alias = Path(temp) / 'alias'
            try:
                alias.symlink_to(source, target_is_directory=True)
            except OSError:
                self.skipTest('Directory symlink creation unavailable')
            with self.assertRaises(ValueError):
                self.m.prepare(alias, output, expected_sha256=digest)
            self.assertFalse(output.exists())

    def test_degenerate_triangles_are_retained_and_reported_not_repaired(self):
        data, report = self.convert(obj=OBJ.replace(b'f 1/1 2/2 3/3', b'f 1/1 1/1 1/1'))
        self.assertEqual(report['degenerate_triangles'], 1)
        self.assertEqual(validate_glb(data, self.m.LIMITS)['faces'], 2)


if __name__ == '__main__':
    unittest.main()
