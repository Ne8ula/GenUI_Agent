"""One approved $10 L4 attempt: reviewed FFS crops -> SAM 2 -> textured TripoSR GLBs -> scan fits.
Generated completion, not measured geometry. Default invocation only prepares an offline plan.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import io
import json
import math
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent.parent
# v1 retains the failed preflight receipt and build log; a new approval needs a fresh folder.
OUTPUT = ROOT / '.local/reconstruction/ffs-th0028-objects-v2'
CATALOG = ROOT / 'scripts/room_workflow/ffs-resources.json'
CORE = Path(__file__).with_name('ffs_fit.py')
ARTIFACTS = Path(__file__).with_name('ffs_artifacts.py')
TARGETS = (17, 69, 12, 22, 13, 18, 32)
MODEL = 'stabilityai/TripoSR'
CODE_REVISION = '107cefdc244c39106fa830359024f6a2f1c78871'
WEIGHTS_REVISION = '5b521936b01fbe1890f6f9baed0254ab6351c04a'
SAM_CODE = '2b90b9f5ceec907a1c18123530e92e794ad901a4'
SAM_MODEL = 'facebook/sam2.1-hiera-tiny'
SAM_REVISION = 'de431c4043854a71d8101e17995dfe596bf101a5'
DINO_REVISION = 'f205d5d8e640a89a2b8ef0369670dfc37cc07fc2'
MCUBES_REVISION = 'bc36b08c62c5931e1dfc666581b3a8589278647f'
PACKAGES = ('numpy==1.26.4', 'pillow==10.4.0', 'omegaconf==2.3.0', 'einops==0.7.0',
            'transformers==4.35.0', 'huggingface-hub==0.17.3', 'trimesh==4.6.8',
            'rembg==2.0.61', 'onnxruntime==1.20.1', 'opencv-python-headless==4.10.0.84',
            'scipy==1.14.1', 'numba==0.60.0', 'imageio==2.36.1', 'xatlas==0.0.9',
            'moderngl==5.10.0', 'glcontext==2.5.0', 'fast-simplification==0.1.7',
            'hydra-core==1.3.2', 'iopath==0.1.10', 'tqdm==4.67.1')
RESOURCES = {'gpu': 'L4', 'cpu': 4, 'memory_mib': 16384, 'timeout': 1800, 'startup_timeout': 600,
             'client_timeout': 6000, 'max_containers': 1, 'operational_allowance_usd': 10,
             'provider_enforced_dollar_cap': False}
MAX_GLB_BYTES = 2_000_000
MAX_FACES = 40000
MAX_POINTS = 50000
CHUNK = 512 * 1024  # Payload bytes; serialization adds overhead below Modal's blob-upload threshold.
VERTICES = 712312
HEADER = ('ply\nformat binary_little_endian 1.0\nelement vertex {}\nproperty float x\nproperty float y\n'
          'property float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n')
PHOTO = re.compile(r'IMG_20240306_\d{6}\.jpg')
SETTINGS = {'seed': 0, 'marching_cubes_resolution': 256, 'texture_resolution': 512,
            'renderer_chunk_size': 8192, 'foreground_ratio': .85, 'max_faces': MAX_FACES,
            'max_segment_points': MAX_POINTS, 'max_glb_bytes': MAX_GLB_BYTES,
            'display_z_offset': 349.2, 'segment_sampling': 'sorted-index evenly spaced',
            'sam_prompt': 'owner crop box in EXIF-transposed pixels, translated into crop frame'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2, allow_nan=False) + '\n').encode()


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def verified(catalog, key, limit):
    meta = catalog.get(key)
    if not isinstance(meta, dict):
        raise ValueError('Missing catalogued input: ' + key)
    relative = Path(meta['path'])
    path = ROOT / relative
    if (relative.is_absolute() or '..' in relative.parts or not path.resolve().is_relative_to(ROOT.resolve())
            or any(p.is_symlink() for p in (path, *path.parents)) or path.stat().st_size > limit):
        raise ValueError('Unsafe or oversized catalogued input: ' + key)
    data = path.read_bytes()
    if len(data) != meta['bytes'] or sha(data) != meta['sha256']:
        raise ValueError('Catalogued input changed: ' + key)
    return data


def crop_photo(data, box):
    from PIL import Image, ImageOps
    if (not isinstance(box, list) or len(box) != 4 or not all(finite(v) and 0 <= v <= 1 for v in box)
            or box[0] >= box[2] or box[1] >= box[3]):
        raise ValueError('Invalid normalized owner crop')
    with Image.open(io.BytesIO(data)) as source:
        if source.width * source.height > 40_000_000:
            raise ValueError('Photo pixel limit exceeded')
        image = ImageOps.exif_transpose(source).convert('RGB')
        w, h = image.size
        pixels = [math.floor(box[0] * w), math.floor(box[1] * h), math.ceil(box[2] * w), math.ceil(box[3] * h)]
        if pixels[2] - pixels[0] < 2 or pixels[3] - pixels[1] < 2:
            raise ValueError('Crop is too small')
        buffer = io.BytesIO()
        image.crop(pixels).save(buffer, 'PNG')
    return buffer.getvalue(), pixels


def subsample(points):
    import numpy as np
    return points if len(points) <= MAX_POINTS else points[np.linspace(0, len(points) - 1, MAX_POINTS, dtype=int)]


def prepare():
    import numpy as np
    if OUTPUT.exists():
        raise FileExistsError('Each new approval requires a new output folder; retained attempts are immutable')
    catalog = json.loads(CATALOG.read_text())
    sources = {}
    def read(key, limit=1024 * 1024):
        data = verified(catalog, key, limit)
        sources[key] = sha(data)
        return data
    review_raw = read('review.md', 64 * 1024).decode('utf-8')
    match = re.search(r'```json\n([\s\S]*?)\n```\s*$', review_raw)
    if not match:
        raise ValueError('Expected the scene-review Markdown JSON record')
    review = json.loads(match[1])
    if (set(review) != {'segments', 'crops', 'models', 'coverage_threshold'}
            or not all(isinstance(review[k], dict) for k in ('segments', 'crops', 'models'))
            or not finite(review['coverage_threshold']) or not 0 <= review['coverage_threshold'] <= 1
            or any(v not in ('approved', 'rejected') for v in review['segments'].values())):
        raise ValueError('Invalid owner review')
    tags = json.loads(read('tags.json'))
    markers = tags['markers']
    targets, skipped = [], []
    for tag in TARGETS:
        found = [m for m in markers if m.get('tag') == tag]
        if len(found) > 1:
            raise ValueError('Duplicate target tag')
        marker = found[0] if found else None
        photos = marker.get('photos', []) if marker else []
        if not marker or review['segments'].get(marker['id']) != 'approved':
            skipped.append({'tag': tag, 'reason': 'segment not approved'}); continue
        if len(photos) != 1 or not PHOTO.fullmatch(photos[0]) or photos[0] not in review['crops']:
            skipped.append({'tag': tag, 'reason': 'owner crop missing'}); continue
        if not re.fullmatch(r'marker-\d\d', marker['id']):
            raise ValueError('Invalid marker id')
        targets.append({'tag': tag, 'marker': marker['id'], 'photo': photos[0], 'crop': review['crops'][photos[0]]})
    if not targets:
        raise ValueError('No targets have both an approved segment and an owner crop')
    summary = json.loads(read('segments/summary.json'))
    raw = read('scene.ply', 12 * 1024**2)
    header = HEADER.format(VERTICES).encode()
    if not raw.startswith(header) or len(raw) != len(header) + VERTICES * 15:
        raise ValueError('Unexpected binary little-endian XYZ/RGB PLY layout')
    scan = np.frombuffer(raw, dtype=[('xyz', '<f4', 3), ('rgb', 'u1', 3)], offset=len(header))['xyz']
    rotation = tags['crop']['rotation_z']
    params = summary.get('params', {})
    if (not isinstance(params, dict) or params.get('rotation_z') != rotation
            or params.get('display_z_offset') != SETTINGS['display_z_offset']):
        raise ValueError('Segment summary/display coordinate mismatch')
    normal = np.asarray(summary['floor']['normal'], dtype=float)
    offset = summary['floor']['offset']
    if not finite(rotation) or normal.shape != (3,) or not np.isfinite(normal).all() or abs(normal[2]) < .9 or not finite(offset):
        raise ValueError('Invalid display rotation or display-space floor plane')
    c, s = math.cos(rotation), math.sin(rotation)
    payloads = {}
    for target in targets:
        tag, marker, photo = target['tag'], target['marker'], target['photo']
        meta = summary['markers'][marker]
        indices_raw = read('segments/' + marker + '.u32', VERTICES * 4)
        if len(indices_raw) % 4:
            raise ValueError('Invalid segment indices')
        indices = np.frombuffer(indices_raw, dtype='<u4')
        if (meta['tag'] != tag or not len(indices) or len(indices) != meta['count'] or indices.max() >= VERTICES
                or len(np.unique(indices)) != len(indices)):
            raise ValueError('Segment summary/index mismatch')
        points = scan[np.sort(indices)].astype(float)
        if not np.isfinite(points).all():
            raise ValueError('Invalid segment coordinates')
        points[:, :2] = points[:, :2] @ np.array([[c, s], [-s, c]])
        points[:, 2] -= SETTINGS['display_z_offset']
        center = (points.min(axis=0) + points.max(axis=0)) / 2
        base_above_floor = meta.get('base_above_floor')
        if not finite(base_above_floor):
            raise ValueError('Missing or invalid segment base_above_floor')
        target['contact'] = 'support' if base_above_floor > .03 else 'floor'
        # Resting contact may be a table/sofa; preserve the minimum before subsampling.
        target['floor_z'] = (float(points[:, 2].min()) if target['contact'] == 'support' else
            float(-(normal[0] * center[0] + normal[1] * center[1] + offset) / normal[2]))
        target['segment_points'] = len(points)
        points = subsample(points)
        target['fit_points'] = len(points)
        buffer = io.BytesIO(); np.save(buffer, points, allow_pickle=False)
        payloads[f'tag-{tag}.npy'] = buffer.getvalue()
        crop, pixels = crop_photo(read('photos/' + photo, 32 * 1024**2), target['crop'])
        payloads[f'tag-{tag}.png'] = crop
        target.update(crop_sha256=sha(crop), pixel_box=pixels)
    payloads['job.json'] = encoded({'targets': targets, 'settings': SETTINGS})
    plan = {'kind': 'eva-ffs-objects-v1', 'created_at': datetime.now(timezone.utc).isoformat(),
            'model': MODEL, 'code_revision': CODE_REVISION, 'weights_revision': WEIGHTS_REVISION,
            'sam': {'model': SAM_MODEL, 'code_revision': SAM_CODE, 'weights_revision': SAM_REVISION},
            'dino_config_revision': DINO_REVISION, 'torchmcubes_revision': MCUBES_REVISION,
            'packages': list(PACKAGES), 'resources': RESOURCES, 'settings': SETTINGS,
            'targets': targets, 'skipped': skipped, 'sources': sources,
            'inputs': {name: sha(data) for name, data in sorted(payloads.items())},
            'adapter_sha256': sha(Path(__file__).read_bytes()), 'core_sha256': sha(CORE.read_bytes()),
            'artifacts_sha256': sha(ARTIFACTS.read_bytes()),
            'approval': 'Owner approved one Modal GPU object-generation run, $10 operational allowance, no retries',
            'scope': 'Only reviewed public CC BY-NC-SA FFS crops and segment points; generated hidden sides are not evidence'}
    OUTPUT.mkdir(parents=True, exist_ok=False)
    folder = OUTPUT / 'inputs'; folder.mkdir()
    for name, data in payloads.items():
        (folder / name).write_bytes(data)
    (OUTPUT / 'plan.json').write_bytes(encoded(plan))
    return plan


def records(name, data):
    for start in range(0, len(data), CHUNK):
        yield (name, start, len(data), data[start:start + CHUNK])


def textured_mesh(mesh, model, scene_code):
    """Reuse upstream atlas/rasterizer; fix its CPU positions vs CUDA scene-code mismatch."""
    import numpy as np
    import torch
    import trimesh
    from PIL import Image
    from tsr.bake_texture import make_atlas, rasterize_position_atlas
    if len(mesh.faces) > int(MAX_FACES * .95):
        mesh = mesh.simplify_quadric_decimation(face_count=int(MAX_FACES * .95))
    if not 0 < len(mesh.faces) <= MAX_FACES:
        raise ValueError('Mesh decimation failed')
    size = SETTINGS['texture_resolution']
    atlas = make_atlas(mesh, size, 2)
    positions = rasterize_position_atlas(mesh, atlas['vmapping'], atlas['indices'], atlas['uvs'], size, 2)
    with torch.no_grad():
        rgb = model.renderer.query_triplane(model.decoder,
            torch.as_tensor(positions[..., :3].reshape(-1, 3).copy(), device=scene_code.device), scene_code)['color']
    colors = rgb.detach().cpu().numpy().reshape(size, size, 3)
    image = Image.fromarray((colors.clip(0, 1) * 255).astype(np.uint8)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    material = trimesh.visual.material.PBRMaterial(baseColorTexture=image, metallicFactor=0, roughnessFactor=1)
    result = trimesh.Trimesh(vertices=mesh.vertices[atlas['vmapping']], faces=atlas['indices'], process=False,
        visual=trimesh.visual.TextureVisuals(uv=atlas['uvs'], material=material))
    # A bounded encoding reduction, not another inference attempt. Never destroy UVs by decimating after baking.
    data = result.export(file_type='glb')
    for resolution in (256, 128):
        if len(data) <= MAX_GLB_BYTES:
            break
        material.baseColorTexture = image.resize((resolution, resolution), Image.Resampling.LANCZOS)
        data = result.export(file_type='glb')
    validate_glb(data)
    return result, data


def worker(folder='/inputs'):
    import gc
    from functools import partial
    import numpy as np
    import torch
    import moderngl
    from PIL import Image
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    from tsr.system import TSR
    from tsr.utils import resize_foreground
    from ffs_fit import fit
    torch.manual_seed(SETTINGS['seed'])
    torch.set_num_threads(RESOURCES['cpu'])
    # Upstream defaults to X11; Modal has no display. Mesa EGL is baked into the image.
    moderngl.create_context = partial(moderngl.create_context, backend='egl')
    folder = Path(folder)
    job = json.loads((folder / 'job.json').read_text())
    predictor = SAM2ImagePredictor(build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml',
        '/weights/sam2/sam2.1_hiera_tiny.pt', device='cuda'))
    masked, failed = [], []
    for target in job['targets']:
        try:
            image = Image.open(folder / f"tag-{target['tag']}.png").convert('RGB')
            w, h = image.size
            with torch.inference_mode():
                predictor.set_image(np.asarray(image))
                masks, scores, _ = predictor.predict(box=np.array([0, 0, w, h], dtype=np.float32), multimask_output=False)
            mask = masks[0].astype(bool)
            if np.count_nonzero(mask) < 4:
                raise ValueError('SAM 2 returned an empty/tiny foreground')
            rgba = np.concatenate([np.asarray(image), (mask * 255).astype(np.uint8)[..., None]], axis=-1)
            rgba = np.asarray(resize_foreground(Image.fromarray(rgba), SETTINGS['foreground_ratio'])).astype(np.float32) / 255
            rgb = rgba[..., :3] * rgba[..., 3:] + .5 * (1 - rgba[..., 3:])
            target['mask_sha256'] = sha(mask.tobytes())
            target['sam_score'] = float(scores[0])
            masked.append((target, Image.fromarray((rgb * 255).astype(np.uint8))))
        except Exception as error:
            failed.append({'tag': target['tag'], 'stage': 'mask', 'error': str(error)[:300]})
    del predictor
    gc.collect(); torch.cuda.empty_cache()
    if masked:
        model = TSR.from_pretrained('/weights/triposr', config_name='config.yaml', weight_name='model.ckpt').to('cuda').eval()
        model.renderer.set_chunk_size(SETTINGS['renderer_chunk_size'])
    files, fits, details = {}, {}, []
    for target, image in masked:
        tag, stage = target['tag'], 'inference'
        code = mesh = exported = None
        try:
            with torch.no_grad():
                code = model([image], device='cuda')
                stage = 'mesh'
                mesh = model.extract_mesh(code, False, resolution=SETTINGS['marching_cubes_resolution'])[0]
                stage = 'texture'
                mesh, data = textured_mesh(mesh, model, code[0])
            stage = 'fit'
            # Fit exactly the float32 mesh encoded in GLB, not a higher-precision pre-export variant.
            import trimesh
            exported = trimesh.load(io.BytesIO(data), file_type='glb', force='mesh', process=False)
            fitted = fit(exported.vertices, exported.faces, np.load(folder / f'tag-{tag}.npy', allow_pickle=False), target['floor_z'])
            result = {k: fitted[k] for k in ('matrix', 'coverage', 'mean_cm')}
            result.update(model=MODEL, revision=WEIGHTS_REVISION, crop_sha256=target['crop_sha256'],
                          contact=target['contact'], floor_z=target['floor_z'])
            validate_fit(result, target)
            detail = {**target, 'faces': len(exported.faces), 'rotation_index': fitted['rotation_index']}
            fits[str(tag)] = result
            name = f'models/tag-{tag}.glb'
            files[name] = {'bytes': len(data), 'sha256': sha(data)}
            details.append(detail)
        except Exception as error:
            failed.append({'tag': tag, 'stage': stage, 'error': str(error)[:300]})
            continue
        finally:
            code = mesh = exported = None
            gc.collect(); torch.cuda.empty_cache()
        # Transport interruption must abort the stream, not relabel partially yielded geometry as a failed target.
        yield from records(name, data)
    data = encoded(fits)
    files['models/fits.json'] = {'bytes': len(data), 'sha256': sha(data)}
    yield from records('models/fits.json', data)
    report = {'files': files, 'failed': failed, 'model': MODEL, 'revision': WEIGHTS_REVISION, 'code_revision': CODE_REVISION,
              'sam_code': SAM_CODE, 'sam_revision': SAM_REVISION, 'settings': SETTINGS, 'targets': details,
              'gpu': torch.cuda.get_device_name(0), 'peak_vram_bytes': torch.cuda.max_memory_allocated(),
              'installed_packages': json.loads(Path('/weights/packages.json').read_text())}
    yield from records('report.json', encoded(report))


def validate_glb(data):
    """Keep the legacy producer's byte/face caps and one 512px atlas budget."""
    from ffs_artifacts import validate_glb as admit_glb
    return admit_glb(data, {'max_bytes': MAX_GLB_BYTES, 'max_faces': MAX_FACES,
        'max_vertices': MAX_FACES * 3,
        'max_decoded_texture_bytes': SETTINGS['texture_resolution'] ** 2 * 4})


def expected_files(plan, failed=()):
    planned = {t['tag'] for t in plan['targets']}
    if not isinstance(failed, (list, tuple)) or len(failed) > len(planned):
        raise ValueError('Invalid failed target list')
    rejected = set()
    for entry in failed:
        if (not isinstance(entry, dict) or set(entry) != {'tag', 'stage', 'error'}
                or type(entry['tag']) is not int or entry['tag'] not in planned or entry['tag'] in rejected
                or entry['stage'] not in ('mask', 'inference', 'mesh', 'texture', 'fit')
                or not isinstance(entry['error'], str) or len(entry['error']) > 300):
            raise ValueError('Invalid failed target report')
        rejected.add(entry['tag'])
    return {f'models/tag-{tag}.glb' for tag in planned - rejected} | {'models/fits.json', 'report.json'}


def validate_fit(entry, target):
    from ffs_artifacts import validate_fit as admit_fit
    return admit_fit(entry, {**target, 'model': MODEL, 'revision': WEIGHTS_REVISION})


async def receive(stream, output, plan):
    allowed = expected_files(plan)
    positions, totals = {}, {}
    async for record in stream:
        if type(record) not in (tuple, list) or len(record) != 4:
            raise ValueError('Invalid returned record')
        name, offset, total, data = record
        limit = MAX_GLB_BYTES if isinstance(name, str) and name.endswith('.glb') else 64 * 1024
        if (not isinstance(name, str) or name not in allowed or type(offset) is not int or type(total) is not int
                or type(data) is not bytes or not 0 < len(data) <= CHUNK or not 0 < total <= limit
                or offset != positions.get(name, 0) or offset + len(data) > total or totals.get(name, total) != total):
            raise ValueError('Invalid returned record name, size or ordering')
        path = output / name
        if offset == 0:
            if name in positions:
                raise ValueError('Duplicate returned file')
            path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('xb' if offset == 0 else 'ab') as file:
            file.write(data)
        positions[name], totals[name] = offset + len(data), total
    if not {'report.json', 'models/fits.json'} <= set(positions) or positions != totals:
        raise ValueError('Incomplete object results; partial bytes retained')
    report = json.loads((output / 'report.json').read_text())
    allowed = expected_files(plan, report.get('failed'))
    if set(positions) != allowed:
        raise ValueError('Missing, unexpected or both returned-and-failed target')
    if (set(report['files']) != allowed - {'report.json'} or report['model'] != MODEL
            or report['revision'] != WEIGHTS_REVISION or report['code_revision'] != CODE_REVISION):
        raise ValueError('Object result provenance mismatch')
    for name, meta in report['files'].items():
        data = (output / name).read_bytes()
        if set(meta) != {'sha256', 'bytes'} or sha(data) != meta['sha256'] or len(data) != meta['bytes']:
            raise ValueError('Object result integrity failure')
        if name.endswith('.glb'): validate_glb(data)
    fits = json.loads((output / 'models/fits.json').read_text())
    successful = [t for t in plan['targets'] if f"models/tag-{t['tag']}.glb" in allowed]
    if set(fits) != {str(t['tag']) for t in successful}:
        raise ValueError('Unexpected fits target set')
    for target in successful:
        validate_fit(fits[str(target['tag'])], target)
    return report


def register(output, report, catalog_path=None):
    """Offline registration: stop catalogue-writing services first. Never replace an entry."""
    catalog_path = catalog_path or CATALOG
    before = catalog_path.read_bytes()
    catalog = json.loads(before)
    for name, meta in sorted(report['files'].items()):
        if not re.fullmatch(r'models/(tag-(17|69|12|22|13|18|32)\.glb|fits\.json)', name) or name in catalog:
            raise ValueError('Invalid or existing model catalogue entry')
        path = output / name
        data = path.read_bytes()
        if (set(meta) != {'sha256', 'bytes'} or path.is_symlink()
                or sha(data) != meta['sha256'] or len(data) != meta['bytes']):
            raise ValueError('Model changed before registration')
        if name.endswith('.glb'): validate_glb(data)
        catalog[name] = {'path': path.resolve().relative_to(ROOT.resolve()).as_posix(), **meta,
                         'type': 'model/gltf-binary' if name.endswith('.glb') else 'application/json'}
    temporary = catalog_path.with_name(catalog_path.name + '.objects-pending')
    with temporary.open('xb') as file:
        file.write(encoded(catalog))
    if catalog_path.read_bytes() != before:
        raise ValueError('Catalogue changed; pending registration retained for inspection')
    os.replace(temporary, catalog_path)


def build_checks():
    """Image-build-only CPU checks; never invoked locally or through the GPU function."""
    import torch
    import torchmcubes_module
    import moderngl
    import trimesh
    import numpy as np
    from PIL import Image
    from tsr.system import TSR
    from sam2.build_sam import build_sam2
    assert hasattr(torchmcubes_module, 'mcubes_cuda'), 'torchmcubes silently fell back to CPU'
    TSR.from_pretrained('/weights/triposr', config_name='config.yaml', weight_name='model.ckpt')
    build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml', '/weights/sam2/sam2.1_hiera_tiny.pt', device='cpu')
    context = moderngl.create_context(standalone=True, backend='egl')
    context.release()
    material = trimesh.visual.material.PBRMaterial(baseColorTexture=Image.new('RGB', (2, 2), 'red'),
                                                   metallicFactor=0, roughnessFactor=1)
    mesh = trimesh.Trimesh(vertices=[[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]], faces=[[0, 1, 2]],
        vertex_normals=[[0., 0., 1.]] * 3, process=False,
        visual=trimesh.visual.TextureVisuals(uv=np.array([[0., 0.], [1., 0.], [0., 1.]]), material=material))
    validate_glb(mesh.export(file_type='glb'))


def create(folder):
    import modal
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    image = (modal.Image.from_registry('nvidia/cuda:12.4.1-devel-ubuntu22.04', add_python='3.11')
        .apt_install('git', 'build-essential', 'libgl1-mesa-dri', 'libegl1-mesa', 'libglib2.0-0',
                     'libgl1', 'libegl1', 'libegl-mesa0')
        # Injected Python names clang++; setuptools selects its C++ linker independently of CXX.
        .env({'CC': 'gcc', 'CXX': 'g++', 'LDCXXSHARED': 'g++ -pthread -shared',
              'CUDA_HOME': '/usr/local/cuda', 'TORCH_CUDA_ARCH_LIST': '8.9', 'MAX_JOBS': '4',
              'SAM2_BUILD_CUDA': '0', 'PYTHONPATH': '/opt/TripoSR:/root', 'LIBGL_ALWAYS_SOFTWARE': '1',
              '__EGL_VENDOR_LIBRARY_FILENAMES': '/usr/share/glvnd/egl_vendor.d/50_mesa.json'})
        .pip_install('setuptools==75.8.0', 'wheel==0.45.1', 'ninja==1.11.1.3')
        .pip_install('torch==2.5.1', 'torchvision==0.20.1', index_url='https://download.pytorch.org/whl/cu124')
        .pip_install(*PACKAGES)
        .run_commands(
            f'git clone https://github.com/VAST-AI-Research/TripoSR.git /opt/TripoSR && git -C /opt/TripoSR checkout {CODE_REVISION}',
            f'pip install --no-build-isolation --no-deps git+https://github.com/tatsy/torchmcubes.git@{MCUBES_REVISION}',
            f'pip install --no-build-isolation --no-deps git+https://github.com/facebookresearch/sam2.git@{SAM_CODE}',
            'python -c "import torch, torchmcubes_module; assert hasattr(torchmcubes_module, \'mcubes_cuda\')"',
            'python -c "from huggingface_hub import snapshot_download, hf_hub_download; '
            f'snapshot_download(\'{MODEL}\', revision=\'{WEIGHTS_REVISION}\', allow_patterns=[\'config.yaml\',\'model.ckpt\'], local_dir=\'/weights/triposr\', local_dir_use_symlinks=False); '
            f'snapshot_download(\'{SAM_MODEL}\', revision=\'{SAM_REVISION}\', allow_patterns=[\'sam2.1_hiera_tiny.pt\'], local_dir=\'/weights/sam2\', local_dir_use_symlinks=False); '
            f'hf_hub_download(\'facebook/dino-vitb16\', \'config.json\', revision=\'{DINO_REVISION}\')"',
            # Upstream tokenizer requests main without a revision: bind that offline ref to the inspected config.
            f"python -c \"from pathlib import Path; p=Path.home()/'.cache/huggingface/hub/models--facebook--dino-vitb16/refs/main'; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('{DINO_REVISION}')\"",
            "python -c \"import importlib.metadata,json,pathlib; pathlib.Path('/weights/packages.json').write_text(json.dumps({d.metadata['Name']:d.version for d in importlib.metadata.distributions()}))\"")
        .env({'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1'})
        # One baked self-copy is required for build-time validation; no duplicate runtime self-mount.
        .add_local_file(Path(__file__), '/root/ffs_objects_cloud.py', copy=True)
        .add_local_file(ARTIFACTS, '/root/ffs_artifacts.py', copy=True)
        .run_commands('python -c "from ffs_objects_cloud import build_checks; build_checks()"')
        .add_local_dir(folder, '/inputs', copy=False)
        .add_local_file(CORE, '/root/ffs_fit.py', copy=False))
    app = modal.App('eva-ffs-objects')
    # Modal 1.6.1 generators reject even retries=0; omission means no configured retries.
    fn = app.function(image=image, gpu=RESOURCES['gpu'], cpu=(4, 4), memory=(16384, 16384), timeout=1800,
        startup_timeout=600, max_containers=1, scaledown_window=2, block_network=True,
        restrict_modal_access=True, single_use_containers=True, secrets=[], name='objects')(worker)
    return app, fn


def verify_plan(approved_hash):
    raw = (OUTPUT / 'plan.json').read_bytes()
    plan = json.loads(raw)
    folder = OUTPUT / 'inputs'
    if (sha(raw) != approved_hash or plan['resources'] != RESOURCES or plan['settings'] != SETTINGS
            or plan['adapter_sha256'] != sha(Path(__file__).read_bytes()) or plan['core_sha256'] != sha(CORE.read_bytes())
            or plan.get('artifacts_sha256') != sha(ARTIFACTS.read_bytes())
            or any(p.is_symlink() or not p.is_file() for p in folder.iterdir())
            or {p.name: sha(p.read_bytes()) for p in sorted(folder.iterdir())} != plan['inputs']
            or json.loads((folder / 'job.json').read_text()) != {'targets': plan['targets'], 'settings': SETTINGS}):
        raise ValueError('Plan, implementation or packaged inputs changed')
    catalog = json.loads(CATALOG.read_text())
    for key, digest in plan['sources'].items():
        if sha(verified(catalog, key, 32 * 1024**2)) != digest:
            raise ValueError('Review or source changed since planning')
    return plan


def execute(approved_hash):
    return _execute(approved_hash, build_only=False)


def build_preflight(approved_hash):
    """Requires separate owner approval; builds the same image but invokes no function."""
    return _execute(approved_hash, build_only=True)


def _execute(approved_hash, *, build_only):
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    plan = verify_plan(approved_hash)
    if not build_only:
        preflight_path = OUTPUT / 'preflight-receipt.json'
        if not preflight_path.is_file() or preflight_path.is_symlink() or preflight_path.stat().st_size > 64 * 1024:
            raise ValueError('A built preflight for this plan is required before GPU execution')
        preflight = json.loads(preflight_path.read_text())
        if preflight.get('status') != 'built' or preflight.get('plan_sha256') != approved_hash:
            raise ValueError('A built preflight for this plan is required before GPU execution')
    # Dependency failures must not consume an approval/receipt before a provider attempt is possible.
    if str(Path(__file__).parent) not in sys.path:
        sys.path.insert(0, str(Path(__file__).parent))
    from worldmirror_transfer_probe import stop_app
    import modal
    receipt_path = OUTPUT / ('preflight-receipt.json' if build_only else 'receipt.json')
    receipt = {'status': 'reserved', 'plan_sha256': approved_hash, 'app_id': None,
               'kind': 'build-preflight' if build_only else 'gpu-generation'}
    if not build_only:
        receipt['approved_dollars'] = 10
    with receipt_path.open('xb') as file:
        file.write(encoded(receipt))
    def save(): receipt_path.write_bytes(encoded(receipt))
    app = None
    try:
        app, fn = create(OUTPUT / 'inputs')
        async def run():
            async with app.run.aio(detach=False):
                receipt.update(status='image-built' if build_only else 'submitted', app_id=app.app_id); save()
                try:
                    if build_only:
                        verify_plan(approved_hash)
                    else:
                        output = OUTPUT / 'returned'; output.mkdir()
                        receipt['report'] = await receive(fn.remote_gen.aio(), output, plan)
                        verify_plan(approved_hash)  # A review revocation during inference must block registration.
                        register(output, receipt['report'])
                        failed = receipt['report']['failed']
                        receipt['status'] = ('objects-failed' if len(failed) == len(plan['targets']) else
                            'objects-returned-with-failures' if failed else 'objects-returned-review-pending')
                finally:
                    receipt['cleanup'] = stop_app(app.app_id); save()
        with modal.enable_output():
            asyncio.run(asyncio.wait_for(run(), timeout=RESOURCES['client_timeout']))
        if build_only:
            receipt['status'] = 'built'
    except BaseException as error:
        receipt.update(status='failed-or-uncertain', error_type=type(error).__name__, error=str(error)[:1000])
        if app is not None and app.app_id and 'cleanup' not in receipt:
            try:
                receipt['cleanup'] = stop_app(app.app_id)
            except Exception as cleanup_error:
                receipt['cleanup'] = {'state': 'unconfirmed', 'error_type': type(cleanup_error).__name__}
        save()
        raise
    save()
    return receipt


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--execute-approved-plan-sha256')
    mode.add_argument('--build-preflight-approved-sha256')
    args = parser.parse_args(argv)
    if args.build_preflight_approved_sha256:
        result = build_preflight(args.build_preflight_approved_sha256)
    elif args.execute_approved_plan_sha256:
        result = execute(args.execute_approved_plan_sha256)
    else:
        result = prepare()
        print('plan_sha256=' + sha((OUTPUT / 'plan.json').read_bytes()))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
