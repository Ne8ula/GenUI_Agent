"""Offline packaging of the supplied Realsee OBJ subset; no inference, network or rendering."""
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

if __name__ == '__main__':
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from ffs_artifacts import validate_glb

SOURCE_FILES = (
    'source-manifest.json', 'obj/conversion.json', 'convert-obj.cjs', 'five-sdk.mjs', 'five-package.json',
    'model/9408d676decc4a2dfd638009ac657890/pano-jWDX6RX1v140xB9p.at3d',
    *(f'materials/9408d676decc4a2dfd638009ac657890/texture_{i}.jpg' for i in range(2)),
    *(f'images/cube_2048/0/b4784898d608160a363a3115f3eca953/0_{face}.jpg' for face in 'bdflru'),
    'obj/scene.obj', 'obj/scene.mtl', 'obj/texture_0.jpg', 'obj/texture_1.jpg',
)

LIMITS = {'max_bytes': 8 * 1024**2, 'max_faces': 20_000,
          'max_vertices': 60_000, 'max_decoded_texture_bytes': 32 * 1024**2}


def convert_scene(obj, mtl, textures):
    """Preserve source triangle coordinates/materials; package JPEGs without recompression.

    shortcut: only this two-material, positive-index, flat-shaded OBJ subset; extend
    with fixtures if another reviewed export needs normals, smoothing or polygons.
    """
    if (type(obj) is not bytes or not 0 < len(obj) <= 2 * 1024**2
            or type(mtl) is not bytes or not 0 < len(mtl) <= 4096
            or type(textures) is not list or len(textures) != 2
            or any(type(t) is not bytes or not 0 < len(t) <= 2 * 1024**2 for t in textures)):
        raise ValueError('OBJ, MTL or texture input exceeds the bounded subset')
    try:
        obj_text, mtl_text = obj.decode('ascii'), mtl.decode('ascii')
    except UnicodeError as error:
        raise ValueError('Expected ASCII OBJ/MTL') from error
    expected_mtl = []
    for index in range(2):
        expected_mtl.extend([f'newmtl material_{index}', 'Ka 0 0 0', 'Kd 1 1 1',
                             'Ks 0 0 0', 'd 1', 'illum 1', f'map_Kd texture_{index}.jpg'])
    if [' '.join(line.split()) for line in mtl_text.splitlines() if line.strip()] != expected_mtl:
        raise ValueError('Unexpected material fields or texture references')
    positions, uv, faces = [], [], [[], []]
    material, libraries, face_count = None, 0, 0
    for line in obj_text.splitlines():
        fields = line.split('#', 1)[0].split()
        if not fields:
            continue
        kind, *args = fields
        if kind in ('v', 'vt'):
            target, width = (positions, 3) if kind == 'v' else (uv, 2)
            if len(args) != width or len(target) >= 20_000:
                raise ValueError('Vertex or UV count/shape exceeded')
            values = [float(value) for value in args]
            if not all(np.isfinite(value) and abs(value) <= 10_000 for value in values):
                raise ValueError('Nonfinite or out-of-bounds vertex/UV')
            target.append(values)
        elif kind == 'mtllib' and args == ['scene.mtl']:
            libraries += 1
            if libraries != 1:
                raise ValueError('Duplicate material library')
        elif kind == 'usemtl' and args in (['material_0'], ['material_1']):
            material = int(args[0][-1])
        elif (kind == 'o' and len(args) == 1) or (kind == 's' and args == ['off']):
            continue
        elif kind == 'f':
            face_count += 1
            if material is None or len(args) != 3 or face_count > LIMITS['max_faces']:
                raise ValueError('Expected bounded material-bound triangles')
            corners = []
            for token in args:
                pair = token.split('/')
                if len(pair) != 2 or any(not item.isascii() or not item.isdecimal() for item in pair):
                    raise ValueError('Expected positive position/UV indices')
                vertex, texcoord = map(int, pair)
                if not 1 <= vertex <= len(positions) or not 1 <= texcoord <= len(uv):
                    raise ValueError('OBJ index out of bounds')
                corners.append((vertex - 1, texcoord - 1))
            faces[material].append(corners)
        else:
            raise ValueError('Unsupported OBJ directive')
    if libraries != 1 or not all(faces):
        raise ValueError('Expected one material library and both nonempty materials')

    doc = {'asset': {'version': '2.0', 'generator': 'EVA bounded Realsee packaging'},
           'buffers': [], 'bufferViews': [], 'accessors': [], 'images': [],
           'textures': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9729,
                                        'wrapS': 33071, 'wrapT': 33071}],
           'materials': [], 'meshes': [{'primitives': []}],
           # @realsee/five 6.8.8 AT3D loader's native Z-up to Y-up proper rotation.
           'nodes': [{'mesh': 0, 'matrix': [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]}],
           'scenes': [{'nodes': [0]}], 'scene': 0}
    binary = bytearray()

    def view(payload):
        binary.extend(b'\0' * (-len(binary) % 4))
        index = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload)})
        binary.extend(payload)
        return index

    def accessor(values, kind, component):
        index = len(doc['accessors'])
        item = {'bufferView': view(values.tobytes()), 'componentType': component,
                'count': len(values), 'type': kind}
        if kind == 'VEC3':
            item.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
        doc['accessors'].append(item)
        return index

    positions = np.asarray(positions, dtype='<f4')
    uv = np.asarray(uv, dtype='<f4')
    degenerate = 0
    for index, triangles in enumerate(faces):
        corners = np.asarray(triangles, dtype=np.int64).reshape(-1, 2)
        points = positions[corners[:, 0]]
        texcoords = uv[corners[:, 1]].copy()
        # OBJ uses bottom-origin V, glTF top-origin V; image bytes stay unchanged.
        texcoords[:, 1] = 1 - texcoords[:, 1]
        shape = points.reshape(-1, 3, 3).astype(np.float64)
        cross = np.cross(shape[:, 1] - shape[:, 0], shape[:, 2] - shape[:, 0])
        degenerate += int(np.count_nonzero(np.all(cross == 0, axis=1)))
        doc['meshes'][0]['primitives'].append({
            'attributes': {'POSITION': accessor(points, 'VEC3', 5126),
                           'TEXCOORD_0': accessor(texcoords, 'VEC2', 5126)},
            'indices': accessor(np.arange(len(points), dtype='<u4'), 'SCALAR', 5125),
            'material': index, 'mode': 4})
        doc['images'].append({'bufferView': view(textures[index]), 'mimeType': 'image/jpeg'})
        doc['textures'].append({'source': index, 'sampler': 0})
        doc['materials'].append({'name': f'material_{index}', 'pbrMetallicRoughness': {
            'baseColorTexture': {'index': index}, 'metallicFactor': 0, 'roughnessFactor': 1}})
    doc['buffers'] = [{'byteLength': len(binary)}]
    binary.extend(b'\0' * (-len(binary) % 4))
    raw = json.dumps(doc, separators=(',', ':'), allow_nan=False).encode()
    raw += b' ' * (-len(raw) % 4)
    data = (struct.pack('<4sII', b'glTF', 2, 28 + len(raw) + len(binary)) +
            struct.pack('<I4s', len(raw), b'JSON') + raw +
            struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    totals = validate_glb(data, LIMITS)
    return data, {
        'kind': 'eva-realsee-scene-candidate-v1', 'status': 'needs-review',
        'classification': 'inferred', 'producer': 'Realsee website; exact model and pipeline unverified',
        'source_vertices': len(positions),
        'triangles': face_count, 'degenerate_triangles': degenerate,
        'bounds_frame': 'source Z-up, before root transform',
        'bounds': [positions.min(axis=0).tolist(), positions.max(axis=0).tolist()],
        'coordinate_transform': 'root only: (x,y,z) -> (x,z,-y); no scale change',
        'source_calibration_verified': False, 'scan_alignment': None, 'complete_surface': False,
        'obj_sha256': hashlib.sha256(obj).hexdigest(),
        'glb_sha256': hashlib.sha256(data).hexdigest(), 'glb': totals,
        'limitations': ['Source units unverified; observer metadata not applied or registered to the mesh.',
                        'No hidden-surface filling, topology repair or dimensional calibration.',
                        'Normals absent; flat shading. PBR dielectric roughness 1 is an authored material approximation.',
                        'Byte-level packaging is not rendered quality, source admission or owner acceptance.'],
    }


def inspect_source(source):
    """Hash this fixed package only. Downloaded JS/HTML is never imported or executed."""
    root = Path(source).absolute()
    files, entries, total = {}, {}, 0
    for name in SOURCE_FILES:
        path = root / name
        if any(p.is_symlink() or p.is_junction() for p in (path, *path.parents)):
            raise ValueError('Source aliases are not admitted')
        if not path.is_file() or not 0 < path.stat().st_size <= 4 * 1024**2:
            raise ValueError('Source file exceeds the inspection bound')
        with path.open('rb') as stream:
            data = stream.read(4 * 1024**2 + 1)
        total += len(data)
        if not data or len(data) > 4 * 1024**2 or total > 16 * 1024**2:
            raise ValueError('Source bundle exceeds the inspection bound')
        files[name] = data
        entries[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    digest = hashlib.sha256(json.dumps(entries, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return files, entries, digest


def prepare(source, output, *, expected_sha256):
    """Write a new, non-live candidate only after binding every retained input byte."""
    source, output = Path(source).absolute(), Path(output).absolute()
    if output.resolve().is_relative_to(source.resolve()):
        raise ValueError('Output must not modify the supplied source directory')
    if any(p.is_symlink() or p.is_junction() for p in (output, *output.parents)):
        raise ValueError('Output aliases are not admitted')
    files, entries, digest = inspect_source(source)
    if type(expected_sha256) is not str or digest != expected_sha256:
        raise ValueError('Source bundle identity changed; inspect before packaging')
    data, report = convert_scene(files['obj/scene.obj'], files['obj/scene.mtl'],
                                  [files[f'obj/texture_{i}.jpg'] for i in range(2)])
    report.update(source_project='https://realsee.ai/Ae44j89x', input_bundle_sha256=digest,
                  inputs=entries, input_claims='Source metadata retained by hash, not accepted as authority.',
                  implementation_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  validator_sha256=hashlib.sha256(Path(__file__).with_name('ffs_artifacts.py').read_bytes()).hexdigest())
    output.mkdir(exist_ok=False)
    with (output / 'scene.glb').open('xb') as stream:
        stream.write(data)
    with (output / 'report.json').open('x', encoding='utf-8') as stream:
        json.dump(report, stream, indent=2, allow_nan=False)
        stream.write('\n')
    return report


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--expected-sha256')
    args = parser.parse_args()
    if args.output is None and args.expected_sha256 is None:
        _, entries, digest = inspect_source(args.source)
        print(json.dumps({'input_bundle_sha256': digest, 'inputs': entries}, indent=2))
    elif args.output is not None and args.expected_sha256 is not None:
        print(json.dumps(prepare(args.source, args.output, expected_sha256=args.expected_sha256), indent=2))
    else:
        parser.error('--output and --expected-sha256 must be supplied together')
