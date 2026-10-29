"""Byte-level, synthetic CPU admission tests; no models or network."""
import copy
import io
import json
import struct
import unittest
import zlib
from unittest.mock import patch

from PIL import Image

from ffs_artifacts import validate_fit, validate_glb


def fixture():
    png = io.BytesIO()
    Image.new('RGB', (2, 2), 'red').save(png, 'PNG')
    binary = struct.pack('<9f6f3I', 0, 0, 0, 1, 0, 0, 0, 1, 0,
                         0, 0, 1, 0, 0, 1, 0, 1, 2) + png.getvalue()
    doc = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(binary)}],
           'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 36},
                           {'buffer': 0, 'byteOffset': 36, 'byteLength': 24},
                           {'buffer': 0, 'byteOffset': 60, 'byteLength': 12},
                           {'buffer': 0, 'byteOffset': 72, 'byteLength': len(png.getvalue())}],
           'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'},
                         {'bufferView': 1, 'componentType': 5126, 'count': 3, 'type': 'VEC2'},
                         {'bufferView': 2, 'componentType': 5125, 'count': 3, 'type': 'SCALAR'}],
           'images': [{'bufferView': 3, 'mimeType': 'image/png'}], 'textures': [{'source': 0}],
           'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}],
           'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'TEXCOORD_0': 1},
                                      'indices': 2, 'material': 0}]}],
           'nodes': [{'mesh': 0}], 'scenes': [{'nodes': [0]}], 'scene': 0}
    return doc, bytearray(binary)


def pack(doc, binary):
    raw = json.dumps(doc).encode()
    raw += b' ' * (-len(raw) % 4)
    binary = bytes(binary) + b'\0' * (-len(binary) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(raw) + len(binary)) +
            struct.pack('<I4s', len(raw), b'JSON') + raw +
            struct.pack('<I4s', len(binary), b'BIN\0') + binary)


LIMITS = {'max_bytes': 2_000_000, 'max_faces': 40_000,
          'max_vertices': 120_000, 'max_decoded_texture_bytes': 512 * 512 * 4}


class ArtifactTests(unittest.TestCase):
    def test_exact_limits_and_summary(self):
        doc, binary = fixture()
        data = pack(doc, binary)
        limits = {'max_bytes': len(data), 'max_faces': 1, 'max_vertices': 3,
                  'max_decoded_texture_bytes': 16}
        self.assertEqual(validate_glb(data, limits),
                         {'bytes': len(data), 'faces': 1, 'vertices': 3,
                          'decoded_texture_bytes': 16})
        for key in limits:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_glb(data, {**limits, key: limits[key] - 1})

    def test_limits_are_required_positive_integer_policy(self):
        data = pack(*fixture())
        for limits in (None, {}, {**LIMITS, 'extra': 1},
                       *({**LIMITS, key: value} for key in LIMITS
                         for value in (True, 0, -1, 1.5, float('inf')))):
            with self.subTest(limits=limits), self.assertRaises(ValueError):
                validate_glb(data, limits)

    def test_malformed_chunks(self):
        data = pack(*fixture())
        for changed in (b'', data[:-1], data + b'xxxx', b'bad!' + data[4:],
                        data[:16] + b'WRNG' + data[20:]):
            with self.subTest(size=len(changed)), self.assertRaises(ValueError):
                validate_glb(changed, LIMITS)

    def test_external_sparse_extensions_and_nonfinite_metadata(self):
        for field, value in (('uri', 'https://example.invalid/a'), ('uri', 'file:///secret'),
                             ('uri', 'data:image/png;base64,AAAA'), ('extensions', {}),
                             ('extensionsUsed', []), ('extensionsRequired', []),
                             ('sparse', {}), ('extras', {'number': float('nan')})):
            doc, binary = fixture()
            doc['accessors'][0][field] = value
            with self.subTest(field=field, value=value), patch('socket.socket') as network:
                with self.assertRaises(ValueError): validate_glb(pack(doc, binary), LIMITS)
                network.assert_not_called()

    def test_buffer_accessor_bounds_and_types(self):
        mutations = [('buffers', 'byteLength', -1), ('buffers', 'byteLength', True),
                     ('buffers', 'byteLength', 999999), ('bufferViews', 'buffer', True),
                     ('bufferViews', 'byteOffset', -1), ('bufferViews', 'byteLength', 999999),
                     ('bufferViews', 'byteStride', 1), ('bufferViews', 'byteStride', 256),
                     ('accessors', 'bufferView', -1), ('accessors', 'bufferView', True),
                     ('accessors', 'count', 120001), ('accessors', 'count', True),
                     ('accessors', 'byteOffset', 1), ('accessors', 'componentType', 5122),
                     ('accessors', 'type', 'MAT4'), ('accessors', 'normalized', True)]
        for section, key, value in mutations:
            doc, binary = fixture()
            doc[section][0][key] = value
            with self.subTest(section=section, key=key, value=value), self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), LIMITS)

    def test_unused_accessor_and_binary_nonfinite(self):
        for offset in (0, 36):
            doc, binary = fixture()
            struct.pack_into('<f', binary, offset, float('inf'))
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), LIMITS)
        doc, binary = fixture()
        doc['accessors'].append({**doc['accessors'][0], 'count': 120001})
        with self.assertRaises(ValueError): validate_glb(pack(doc, binary), LIMITS)

    def test_unused_vector_accessor_cannot_exceed_vertex_policy(self):
        doc, binary = fixture()
        binary.extend(b'\0' * (-len(binary) % 4))
        offset = len(binary)
        binary.extend(struct.pack('<12f', *([0.] * 12)))
        doc['buffers'][0]['byteLength'] = len(binary)
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': 48})
        doc['accessors'].append({'bufferView': 4, 'componentType': 5126, 'count': 4, 'type': 'VEC3'})
        with self.assertRaises(ValueError):
            validate_glb(pack(doc, binary), {**LIMITS, 'max_vertices': 3})

    def test_attribute_and_reference_rejections(self):
        for section, key in (('images', 'bufferView'), ('textures', 'source')):
            for value in (-1, True, 999):
                doc, binary = fixture()
                doc[section][0][key] = value
                with self.subTest(section=section, value=value), self.assertRaises(ValueError):
                    validate_glb(pack(doc, binary), LIMITS)
        for key, value in (('indices', -1), ('material', -1), ('mode', True),
                           ('targets', []), ('attributes', {'POSITION': 0, 'TEXCOORD_0': 1, 'COLOR_0': -1})):
            doc, binary = fixture()
            doc['meshes'][0]['primitives'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), LIMITS)

    def test_aggregate_faces_vertices_and_texture_budget(self):
        doc, binary = fixture()
        doc['meshes'][0]['primitives'] *= 2
        for key, bound in (('max_faces', 1), ('max_vertices', 5)):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), {**LIMITS, key: bound})
        doc, binary = fixture()
        doc['images'].append(copy.deepcopy(doc['images'][0]))
        with self.assertRaises(ValueError):
            validate_glb(pack(doc, binary), {**LIMITS, 'max_decoded_texture_bytes': 31})
        self.assertEqual(validate_glb(pack(doc, binary), LIMITS)['decoded_texture_bytes'], 32)
        doc, binary = fixture()
        doc['textures'] *= 2
        with self.assertRaises(ValueError):
            validate_glb(pack(doc, binary), {**LIMITS, 'max_decoded_texture_bytes': 31})
        self.assertEqual(validate_glb(pack(doc, binary), LIMITS)['decoded_texture_bytes'], 32)

    def test_texture_header_budget_before_pixel_decode(self):
        doc, binary = fixture()
        # PNG IHDR dimensions; deliberately enormous, tiny encoded payload.
        struct.pack_into('>II', binary, 72 + 16, 100000, 100000)
        with patch('PIL.Image.Image.load', side_effect=AssertionError('pixel decode forbidden')):
            with self.assertRaises(ValueError): validate_glb(pack(doc, binary), LIMITS)

    def test_duplicate_png_header_cannot_change_decode_allocation(self):
        doc, binary = fixture()
        header = b'IHDR' + struct.pack('>IIBBBBB', 1024, 1024, 8, 2, 0, 0, 0)
        chunk = struct.pack('>I', 13) + header + struct.pack('>I', zlib.crc32(header))
        binary[72 + 33:72 + 33] = chunk
        doc['buffers'][0]['byteLength'] = len(binary)
        doc['bufferViews'][3]['byteLength'] += len(chunk)
        with patch('PIL.Image.Image.load', side_effect=AssertionError('pixel decode forbidden')):
            with self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), {**LIMITS, 'max_decoded_texture_bytes': 16})

    def test_corrupt_and_mislabeled_textures(self):
        for change in ('mime', 'bytes', 'truncated', 'unused'):
            doc, binary = fixture()
            if change == 'mime': doc['images'][0]['mimeType'] = 'image/jpeg'
            if change == 'bytes': binary[72:] = b'X' * (len(binary) - 72)
            if change == 'truncated': doc['bufferViews'][3]['byteLength'] = 32
            if change == 'unused': doc['images'].append({'bufferView': 0, 'mimeType': 'image/png'})
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), LIMITS)

    def test_png_crc_failure_is_a_candidate_validation_error(self):
        doc, binary = fixture()
        offset = 72 + 8
        while binary[offset + 4:offset + 8] != b'IDAT':
            offset += struct.unpack_from('>I', binary, offset)[0] + 12
        crc = offset + 8 + struct.unpack_from('>I', binary, offset)[0]
        binary[crc] ^= 1
        with self.assertRaises(ValueError):
            validate_glb(pack(doc, binary), LIMITS)

    def test_jpeg_texture(self):
        doc, binary = fixture()
        image = io.BytesIO()
        Image.new('RGB', (2, 3)).save(image, 'JPEG')
        binary[72:] = image.getvalue()
        doc['buffers'][0]['byteLength'] = len(binary)
        doc['bufferViews'][3]['byteLength'] = len(image.getvalue())
        doc['images'][0]['mimeType'] = 'image/jpeg'
        self.assertEqual(validate_glb(pack(doc, binary), LIMITS)['decoded_texture_bytes'], 24)

    def test_additional_attributes_preserve_legacy_checks(self):
        for name, kind, count, component, normalized in (
                ('NORMAL', 'VEC3', 3, 5126, False), ('TANGENT', 'VEC4', 3, 5126, False),
                ('COLOR_0', 'VEC4', 3, 5121, True), ('COLOR_0', 'VEC3', 3, 5126, False),
                ('TEXCOORD_1', 'VEC2', 3, 5126, False)):
            doc, binary = fixture()
            binary.extend(b'\0' * (-len(binary) % 4))
            offset = len(binary)
            components = int(kind[-1])
            payload = (struct.pack('<' + 'f' * (components * count), *([.5] * (components * count)))
                       if component == 5126 else bytes([128] * (components * count)))
            binary.extend(payload)
            doc['buffers'][0]['byteLength'] = len(binary)
            doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload)})
            doc['accessors'].append({'bufferView': 4, 'componentType': component,
                                     'type': kind, 'count': count, 'normalized': normalized})
            doc['meshes'][0]['primitives'][0]['attributes'][name] = 3
            with self.subTest(name=name, component=component):
                self.assertEqual(validate_glb(pack(doc, binary), LIMITS)['vertices'], 3)
                changed = copy.deepcopy(doc)
                changed['accessors'][3]['count'] = 2
                with self.assertRaises(ValueError): validate_glb(pack(changed, binary), LIMITS)
                if component == 5126:
                    struct.pack_into('<f', binary, offset, float('nan'))
                    with self.assertRaises(ValueError): validate_glb(pack(doc, binary), LIMITS)
                else:
                    doc['accessors'][3]['normalized'] = False
                    with self.assertRaises(ValueError): validate_glb(pack(doc, binary), LIMITS)

    def test_node_cycles_and_instance_budgets(self):
        for nodes in ([{'mesh': 0, 'children': [0]}],
                      [{'children': [1]}, {'children': [0]}],
                      [{'children': [2]}, {'children': [2]}, {'mesh': 0}],
                      [{'mesh': -1}], [{'mesh': True}], [{'children': [99]}]):
            doc, binary = fixture()
            doc['nodes'] = nodes
            with self.subTest(nodes=nodes), self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), LIMITS)
        doc, binary = fixture()
        doc['nodes'] = [{'mesh': 0}, {'mesh': 0}]
        self.assertEqual(validate_glb(pack(doc, binary), LIMITS)['faces'], 2)
        with self.assertRaises(ValueError):
            validate_glb(pack(doc, binary), {**LIMITS, 'max_faces': 1})

    def test_invalid_scene_and_auxiliary_texture_references(self):
        for case in ('scene', 'root', 'repeated-root', 'nested-root', 'normal', 'metallic', 'sampler'):
            doc, binary = fixture()
            if case == 'scene': doc['scene'] = -1
            if case == 'root': doc['scenes'][0]['nodes'] = [True]
            if case == 'repeated-root': doc['scenes'][0]['nodes'] = [0, 0]
            if case == 'nested-root':
                doc['nodes'].append({'children': [0]})
                doc['scenes'][0]['nodes'] = [0, 1]
            if case == 'normal': doc['materials'][0]['normalTexture'] = {'index': -1}
            if case == 'metallic': doc['materials'][0]['pbrMetallicRoughness']['metallicRoughnessTexture'] = {'index': True}
            if case == 'sampler': doc['textures'][0]['sampler'] = -1
            with self.subTest(case=case), self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), LIMITS)

    def test_texture_budget_precedes_all_pixel_decodes(self):
        doc, binary = fixture()
        doc['images'] *= 2
        with patch('PIL.Image.Image.load', side_effect=AssertionError('pixel decode forbidden')):
            with self.assertRaises(ValueError):
                validate_glb(pack(doc, binary), {**LIMITS, 'max_decoded_texture_bytes': 31})

    def test_compressed_metadata_and_animation_rejected_before_decode(self):
        for chunk in (b'iCCP', b'zTXt', b'iTXt', b'acTL', b'fcTL', b'fdAT'):
            doc, binary = fixture()
            binary[72 + 37:72 + 41] = chunk
            with self.subTest(chunk=chunk), patch('PIL.Image.Image.load', side_effect=AssertionError('pixel decode forbidden')):
                with self.assertRaises(ValueError): validate_glb(pack(doc, binary), LIMITS)

    def test_fit_binds_expected_producer_and_rejects_unknown_fields(self):
        target = {'model': 'test-generator', 'revision': 'a' * 40, 'crop_sha256': 'b' * 64,
                  'contact': 'floor', 'floor_z': 0.0}
        entry = {**target, 'matrix': [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                 'coverage': .5, 'mean_cm': 1.2}
        self.assertIsNone(validate_fit(entry, target))
        changes = {'model': 'other', 'revision': 'c' * 40, 'crop_sha256': 'd' * 64,
                   'contact': 'support', 'floor_z': 1, 'coverage': 1.01, 'mean_cm': -1,
                   'matrix': [float('nan')] * 16, 'approved': True}
        for key, value in changes.items():
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_fit({**entry, key: value}, target)
        for value in (None, [], {}, {**target, 'model': ''}):
            with self.subTest(target=value), self.assertRaises(ValueError): validate_fit(entry, value)


if __name__ == '__main__':
    unittest.main()
