"""Model-independent admission of static, embedded-texture GLBs and provenance-bound fits.

Limits are caller-owned policy, never inferred from a candidate. Texture accounting is
aggregate decoded RGBA8 bytes including repeated texture references, not a claim
about total renderer/process memory (e.g. mipmaps and decoder scratch space).
"""
import io
import json
import math
import struct


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def _index(items, index):
    if not isinstance(items, list) or type(index) is not int or not 0 <= index < len(items):
        raise ValueError('Invalid GLB reference')
    return items[index]


def _integer(value, minimum=0):
    return type(value) is int and value >= minimum


def _texture_size(data, mime):
    """Inspect dimensions/encoding before a pixel decoder can allocate."""
    from PIL import Image
    if mime == 'image/png':
        if (len(data) < 33 or data[:8] != b'\x89PNG\r\n\x1a\n'
                or data[8:16] != b'\0\0\0\rIHDR'):
            raise ValueError('Invalid PNG header')
        width, height, depth, color, compression, filtering, interlace = struct.unpack_from('>IIBBBBB', data, 16)
        if (depth != 8 or color not in (0, 2, 3, 4, 6) or compression or filtering or interlace not in (0, 1)):
            raise ValueError('Expected bounded 8-bit PNG')
        offset = 8
        while offset < len(data):
            if offset + 12 > len(data):
                raise ValueError('Truncated PNG chunk')
            size, kind = struct.unpack_from('>I4s', data, offset)
            if kind == b'IHDR' and offset != 8:
                raise ValueError('Duplicate PNG dimensions')
            # Compressed metadata and animated images require separate allocation policies.
            if kind in (b'iCCP', b'zTXt', b'iTXt', b'acTL', b'fcTL', b'fdAT'):
                raise ValueError('Compressed metadata/animated PNG not admitted')
            offset += size + 12
            if offset > len(data):
                raise ValueError('PNG chunk out of bounds')
        return width, height, 'PNG'
    if mime == 'image/jpeg':
        try:
            with Image.open(io.BytesIO(data), formats=['JPEG']) as image:
                return image.width, image.height, 'JPEG'
        except Image.DecompressionBombError as error:
            raise ValueError('JPEG decoded texture limit exceeded') from error
    raise ValueError('Expected embedded PNG or JPEG texture')


def validate_glb(data, limits):
    """Return byte/triangle/vertex/decoded-texture totals, or raise ValueError.

    Supported subset: indexed static triangles, float attributes, embedded 8-bit
    PNG/JPEG textures; no sparse accessors, extensions, external URIs or motion.
    Faces/vertices count every primitive and repeated mesh instance conservatively.
    """
    required = {'max_bytes', 'max_faces', 'max_vertices', 'max_decoded_texture_bytes'}
    if (not isinstance(limits, dict) or set(limits) != required
            or not all(_integer(value, 1) for value in limits.values())):
        raise ValueError('Explicit positive integer GLB limits required')
    from PIL import Image
    try:
        if (type(data) is not bytes or not 28 <= len(data) <= limits['max_bytes']
                or struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data))):
            raise ValueError('Invalid GLB size/header')
        size, kind = struct.unpack_from('<I4s', data, 12)
        if kind != b'JSON' or size % 4 or 20 + size + 8 > len(data):
            raise ValueError('Invalid GLB JSON chunk')
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError('Duplicate GLB JSON key')
                result[key] = value
            return result
        doc = json.loads(data[20:20 + size], object_pairs_hook=unique)
        binary_size, kind = struct.unpack_from('<I4s', data, 20 + size)
        if kind != b'BIN\0' or binary_size % 4 or 28 + size + binary_size != len(data):
            raise ValueError('Invalid GLB binary chunk')
        def walk(value):
            if isinstance(value, dict):
                if any(k in value for k in ('uri', 'extensions', 'extensionsRequired', 'extensionsUsed',
                                            'sparse', 'animations', 'skins', 'skin', 'targets', 'weights')):
                    raise ValueError('External, extended or animated GLB resources are not admitted')
                for item in value.values(): walk(item)
            elif isinstance(value, list):
                for item in value: walk(item)
            elif type(value) in (int, float) and not finite(value):
                raise ValueError('Nonfinite GLB metadata')
        walk(doc)
        for name in ('buffers', 'bufferViews', 'accessors', 'meshes', 'materials', 'textures', 'images'):
            if not isinstance(doc[name], list) or not doc[name] or not all(isinstance(v, dict) for v in doc[name]):
                raise ValueError('Invalid GLB collection')
        if (doc['asset']['version'] != '2.0' or len(doc['buffers']) != 1
                or not _integer(doc['buffers'][0]['byteLength'], 1)
                or not 0 <= binary_size - doc['buffers'][0]['byteLength'] <= 3):
            raise ValueError('Invalid GLB buffers')
        for view in doc['bufferViews']:
            if (type(view['buffer']) is not int or view['buffer'] != 0
                    or not _integer(view.get('byteOffset', 0)) or not _integer(view['byteLength'], 1)
                    or view.get('byteOffset', 0) + view['byteLength'] > doc['buffers'][0]['byteLength']
                    or ('byteStride' in view and (not _integer(view['byteStride'], 4)
                        or view['byteStride'] > 252 or view['byteStride'] % 4))):
                raise ValueError('GLB buffer view out of bounds')
        import numpy as np
        binary = memoryview(data)[28 + size:]
        shapes = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
        types = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}
        def accessor(number, kind):
            spec = _index(doc['accessors'], number)
            view = _index(doc['bufferViews'], spec['bufferView'])
            component = spec['componentType']
            if (type(component) is not int or component not in types or spec['type'] != kind
                    or kind not in shapes or not _integer(spec['count'], 1)
                    or spec['count'] > (limits['max_faces'] * 3 if kind == 'SCALAR' else limits['max_vertices'])
                    or ('normalized' in spec and type(spec['normalized']) is not bool)
                    or (spec.get('normalized', False) and component in (5125, 5126))):
                raise ValueError('Invalid GLB accessor')
            dtype = np.dtype(types[component])
            components = shapes[kind]
            start = spec.get('byteOffset', 0)
            stride = view.get('byteStride', dtype.itemsize * components)
            extent = stride * (spec['count'] - 1) + dtype.itemsize * components
            if (not _integer(start) or start % dtype.itemsize
                    or (view.get('byteOffset', 0) + start) % dtype.itemsize
                    or stride < dtype.itemsize * components or stride % dtype.itemsize
                    or start + extent > view['byteLength']):
                raise ValueError('GLB accessor exceeds buffer view')
            values = np.ndarray((spec['count'], components), dtype=dtype, buffer=binary,
                offset=view.get('byteOffset', 0) + start, strides=(stride, dtype.itemsize))
            if not np.isfinite(values).all():
                raise ValueError('Nonfinite GLB geometry')
            return values, component
        for number, spec in enumerate(doc['accessors']):
            accessor(number, spec['type'])
        faces = vertices = 0
        mesh_counts = []
        for mesh in doc['meshes']:
            mesh_faces = mesh_vertices = 0
            if not isinstance(mesh['primitives'], list) or not mesh['primitives']:
                raise ValueError('Empty GLB mesh')
            for primitive in mesh['primitives']:
                attributes = primitive['attributes']
                if set(attributes) - {'POSITION', 'TEXCOORD_0', 'NORMAL', 'TANGENT', 'COLOR_0', 'TEXCOORD_1'}:
                    raise ValueError('Unsupported GLB vertex attribute')
                positions, position_type = accessor(attributes['POSITION'], 'VEC3')
                for name, number in attributes.items():
                    if name in ('POSITION', 'TEXCOORD_0'): continue
                    kind = ('VEC3' if name == 'NORMAL' else 'VEC4' if name == 'TANGENT' else
                            'VEC2' if name == 'TEXCOORD_1' else _index(doc['accessors'], number)['type'])
                    if name == 'COLOR_0' and kind not in ('VEC3', 'VEC4'):
                        raise ValueError('Invalid GLB vertex colors')
                    values, component = accessor(number, kind)
                    if len(values) != len(positions) or (name != 'COLOR_0' and component != 5126):
                        raise ValueError('Invalid additional GLB vertex attribute')
                    if name == 'COLOR_0' and (component not in (5126, 5121, 5123)
                            or (component != 5126 and _index(doc['accessors'], number).get('normalized') is not True)
                            or (component == 5126 and ((values < 0).any() or (values > 1).any()))):
                        raise ValueError('Invalid GLB vertex color encoding')
                uv, uv_type = accessor(attributes['TEXCOORD_0'], 'VEC2')
                indices, index_type = accessor(primitive['indices'], 'SCALAR')
                if (type(primitive.get('mode', 4)) is not int or primitive.get('mode', 4) != 4
                        or len(indices) % 3 or position_type != 5126 or uv_type != 5126
                        or len(uv) != len(positions) or index_type == 5126 or indices.max() >= len(positions)
                        or _index(doc['accessors'], primitive['indices']).get('normalized', False)):
                    raise ValueError('Expected bounded textured triangles')
                mesh_faces += len(indices) // 3
                mesh_vertices += len(positions)
                material = _index(doc['materials'], primitive['material'])
                texture = material['pbrMetallicRoughness']['baseColorTexture']['index']
                _index(doc['textures'], texture)
            mesh_counts.append((mesh_faces, mesh_vertices))
            faces += mesh_faces
            vertices += mesh_vertices
        # Bound repeated instances, and reject cycles/shared children before a scene loader recurses.
        nodes = doc.get('nodes', [])
        parents, instances = set(), [0] * len(mesh_counts)
        for node in nodes:
            if 'mesh' in node:
                _index(doc['meshes'], node['mesh'])
                instances[node['mesh']] += 1
            for child in node.get('children', []):
                _index(nodes, child)
                if child in parents: raise ValueError('Shared GLB node child')
                parents.add(child)
        visited = set()
        stack = [i for i in range(len(nodes)) if i not in parents]
        while stack:
            index = stack.pop()
            if index in visited: raise ValueError('Cyclic GLB nodes')
            visited.add(index)
            stack.extend(nodes[index].get('children', []))
        if len(visited) != len(nodes): raise ValueError('Cyclic GLB nodes')
        scenes = doc.get('scenes', [])
        if 'scene' in doc: _index(scenes, doc['scene'])
        for scene in scenes:
            roots = scene.get('nodes', [])
            seen = set()
            for root in roots:
                _index(nodes, root)
                if root in parents or root in seen:
                    raise ValueError('Invalid GLB scene root')
                seen.add(root)
        for count, (mesh_faces, mesh_vertices) in zip(instances, mesh_counts):
            faces += max(0, count - 1) * mesh_faces
            vertices += max(0, count - 1) * mesh_vertices
        if not 0 < faces <= limits['max_faces'] or not 0 < vertices <= limits['max_vertices']:
            raise ValueError('GLB face/vertex limit exceeded')
        for material in doc['materials']:
            for holder, names in ((material, ('normalTexture', 'occlusionTexture', 'emissiveTexture')),
                                  (material.get('pbrMetallicRoughness', {}), ('baseColorTexture', 'metallicRoughnessTexture'))):
                for name in names:
                    if name in holder:
                        _index(doc['textures'], holder[name]['index'])
        image_instances = [0] * len(doc['images'])
        for texture in doc['textures']:
            _index(doc['images'], texture['source'])
            image_instances[texture['source']] += 1
            if 'sampler' in texture: _index(doc.get('samplers', []), texture['sampler'])
        textures, decoded = [], 0
        for number, image in enumerate(doc['images']):
            view = _index(doc['bufferViews'], image['bufferView'])
            start = view.get('byteOffset', 0)
            payload = binary[start:start + view['byteLength']]
            width, height, format = _texture_size(payload, image['mimeType'])
            if width <= 0 or height <= 0:
                raise ValueError('Empty GLB texture')
            decoded += width * height * 4 * max(1, image_instances[number])
            if decoded > limits['max_decoded_texture_bytes']:
                raise ValueError('GLB decoded texture limit exceeded')
            textures.append((payload, format))
        for payload, format in textures:
            with Image.open(io.BytesIO(payload), formats=[format]) as image:
                image.verify()
            with Image.open(io.BytesIO(payload), formats=[format]) as image:
                image.load()
        return {'bytes': len(data), 'faces': faces, 'vertices': vertices, 'decoded_texture_bytes': decoded}
    except (KeyError, IndexError, TypeError, AttributeError, OverflowError, RecursionError,
            OSError, SyntaxError, struct.error, json.JSONDecodeError, UnicodeError, Image.DecompressionBombError) as error:
        raise ValueError('Invalid textured GLB') from error


def validate_fit(entry, target):
    """Validate metrics and bind producer/crop/contact to trusted target values.

    target must include model, revision, crop_sha256, contact and floor_z. It is
    caller-owned expected provenance, not copied from the returned fit entry.
    """
    try:
        if (not isinstance(entry, dict) or not isinstance(target, dict)
                or set(entry) != {'matrix', 'coverage', 'mean_cm', 'model', 'revision', 'crop_sha256', 'contact', 'floor_z'}
                or not all(isinstance(target[k], str) and target[k] for k in ('model', 'revision', 'crop_sha256'))
                or not isinstance(entry['matrix'], list) or len(entry['matrix']) != 16
                or not all(finite(v) for v in entry['matrix'])
                or [entry['matrix'][i] for i in (3, 7, 11, 15)] != [0, 0, 0, 1]
                or not finite(entry['coverage']) or not 0 <= entry['coverage'] <= 1
                or not finite(entry['mean_cm']) or entry['mean_cm'] < 0
                or any(entry[k] != target[k] for k in ('model', 'revision', 'crop_sha256', 'contact', 'floor_z'))
                or entry['contact'] not in ('floor', 'support') or not finite(entry['floor_z'])
                or not finite(target['floor_z'])):
            raise ValueError('Invalid fit, contact or crop provenance')
    except (KeyError, TypeError, OverflowError) as error:
        raise ValueError('Invalid fit, contact or crop provenance') from error
