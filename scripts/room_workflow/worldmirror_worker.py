"""Isolated RGB-only WorldMirror capture. No acquisition, deployment or CLI launch."""
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image

from inference import IDENTIFIER, SHA256, _blob, _decode_images, fingerprint
from worldmirror_adapter import WORLDMIRROR_SOURCE_REVISION, pixel_transform, project, world_to_camera

CHECKPOINT_REVISION = 'd78a16c91c7a56488894a1c8de4f5c7cc28aa8b0'
MODEL_FILES = {
    'config.json': (842, 'git-blob-sha1', 'ea1f6a963c9ab7a1fef594289c9dc6a95679d408'),
    'model.safetensors': (5053553272, 'sha256', '9fff06539d3d9e85338d7de1ffb5afffb7739fa5bf4d62b4b7c319b5ecdde54f'),
}
MAX_TARGET = 518


def verify_snapshot(snapshot):
    folder = Path(snapshot)/'HY-WorldMirror-2.0'
    if (folder/'config.yaml').exists():
        raise ValueError('An unexpected YAML config would override the pinned JSON config')
    for name, (size, algorithm, expected) in MODEL_FILES.items():
        path = folder/name
        if not path.is_file() or path.stat().st_size != size:
            raise ValueError('Pinned checkpoint files must already exist locally at the exact size')
        digest = hashlib.sha256() if algorithm == 'sha256' else hashlib.sha1(f'blob {size}\0'.encode())
        with path.open('rb') as file:
            for block in iter(lambda: file.read(1024*1024), b''):
                digest.update(block)
        if digest.hexdigest() != expected:
            raise ValueError('Pinned checkpoint file hash mismatch')


def prepare(request, directory):
    if (not isinstance(request, dict) or set(request) != {'version', 'operation', 'job_id', 'images'}
            or type(request['version']) is not int or request['version'] != 1 or request['operation'] != 'analyze'
            or not isinstance(request['job_id'], str) or not IDENTIFIER.fullmatch(request['job_id'])
            or not isinstance(request['images'], list) or not 5 <= len(request['images']) <= 7):
        raise ValueError('WorldMirror accepts only 5-7 bounded original photos, without priors or authority')
    ids, hashes, total = set(), set(), 0
    for record in request['images']:
        if (not isinstance(record, dict) or set(record) != {'id', 'sha256', 'data_base64'}
                or not isinstance(record['id'], str) or not IDENTIFIER.fullmatch(record['id'])
                or not isinstance(record['sha256'], str) or not SHA256.fullmatch(record['sha256'])
                or record['id'].casefold() in ids or record['sha256'] in hashes):
            raise ValueError('Invalid or duplicate original photo identity')
        ids.add(record['id'].casefold()); hashes.add(record['sha256'])
        total += len(_blob(record, 10*1024**2))
    if total > 40*1024**2:
        raise ValueError('Original photo set exceeds 40 MiB')
    images, paths, provenance = _decode_images(request['images'], Path(directory))
    if len({hashlib.sha256(rgb.tobytes()).hexdigest() for rgb in images}) != len(images):
        raise ValueError('Duplicate normalized RGB pixels')
    target = max(28, min(max(images[0].shape[:2]), MAX_TARGET)//14*14)
    transforms, rasters = [], []
    for rgb in images:
        height, width = rgb.shape[:2]
        resized = [target, round(height*target/width/14)*14] if width >= height else [round(width*target/height/14)*14, target]
        size = [min(n, target) for n in resized]
        crop = [max(0, (n-target)//2) for n in resized]
        transform = {'source_size': [width, height], 'resized_size': resized,
                     'crop_left_top': crop, 'model_size': size}
        pixel_transform(transform)
        raster = Image.fromarray(rgb).resize(tuple(resized), Image.Resampling.BICUBIC)
        raster = raster.crop((crop[0], crop[1], crop[0]+size[0], crop[1]+size[1]))
        rasters.append(np.asarray(raster, dtype=np.float32).transpose(2, 0, 1)/255)
        transforms.append(transform)
    # shortcut: mixed processed rasters reject; review a common-raster policy before general upload integration.
    if len({tuple(t['model_size']) for t in transforms}) != 1:
        raise ValueError('WorldMirror requires matching processed rasters; mixed aspect ratios are unsupported')
    return {'paths': paths, 'normalization': provenance, 'preprocessing': transforms,
            'target': target, 'rgb': np.stack(rasters)[None]}


def run_model(source, snapshot, paths, target):
    source, snapshot = Path(source).resolve(), Path(snapshot).resolve()
    revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    dirty = subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain', '--untracked-files=all'], text=True)
    if revision != WORLDMIRROR_SOURCE_REVISION or dirty:
        raise ValueError('WorldMirror source must be the clean pinned checkout')
    verify_snapshot(snapshot)
    sys.path.insert(0, str(source))
    try:
        module = importlib.import_module('hyworld2.worldrecon.pipeline')
        if Path(module.__file__).resolve() != source/'hyworld2/worldrecon/pipeline.py':
            raise ValueError('WorldMirror import resolved outside the pinned checkout')
        import torch
        if not torch.cuda.is_available():
            raise ValueError('This worker requires the separately approved cloud CUDA environment')
        torch.manual_seed(0)
        pipeline = module.WorldMirrorPipeline.from_pretrained(str(snapshot), subfolder='HY-WorldMirror-2.0')
        # The public wrapper applies no_grad; this private dense-output method does not.
        with torch.inference_mode():
            return pipeline._run_inference(paths, target, None, None)
    finally:
        sys.path.pop(0)


def _array(value, shape):
    if tuple(getattr(value, 'shape', ())) != shape:
        raise ValueError('WorldMirror raw field has an unexpected batch/view/raster shape')
    if isinstance(value, np.ndarray):
        if value.dtype not in (np.dtype('float16'), np.dtype('float32')):
            raise ValueError('Raw predictions require float16/bfloat16/float32')
        result = value.astype(np.float32, copy=False)
    else:
        if str(getattr(value, 'dtype', None)) not in ('torch.float16', 'torch.bfloat16', 'torch.float32'):
            raise ValueError('Raw predictions require float16/bfloat16/float32')
        result = value.detach().float().cpu().numpy()
    if not np.isfinite(result).all():
        raise ValueError('WorldMirror raw fields must be finite')
    return result


def execute(request, source, snapshot, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    inputs = output/'normalized-inputs'; inputs.mkdir()
    prepared = prepare(request, inputs)
    predictions, rgb, elapsed = run_model(source, snapshot, prepared['paths'], prepared['target'])
    if not isinstance(predictions, dict) or not np.isfinite(elapsed) or elapsed < 0:
        raise ValueError('Invalid WorldMirror inference result')
    count = len(request['images']); width, height = prepared['preprocessing'][0]['model_size']
    shapes = {'depth': (1, count, height, width, 1), 'pts3d': (1, count, height, width, 3),
              'camera_poses': (1, count, 4, 4), 'camera_intrs': (1, count, 3, 3)}
    arrays = {key: _array(predictions.get(key), shape) for key, shape in shapes.items()}
    if np.any(arrays['depth'] <= 0):
        raise ValueError('WorldMirror depth must be positive camera Z')
    for pose, intrinsics in zip(arrays['camera_poses'][0], arrays['camera_intrs'][0]):
        world_to_camera(np.zeros((1, 3)), pose)
        project(np.array([[0., 0., 1.]]), intrinsics)
    arrays['rgb'] = _array(rgb, (1, count, 3, height, width))
    if not np.allclose(arrays['rgb'], prepared['rgb'], rtol=0, atol=1e-6):
        raise ValueError('Processed RGB does not match recorded resize/crop and source order')
    fields_path = output/'raw-fields.npz'
    with fields_path.open('xb') as file:
        np.savez_compressed(file, **arrays)
    originals = [{key: image[key] for key in ('id', 'sha256')} for image in request['images']]
    result = {'version': 1, 'kind': 'eva-worldmirror-raw-v1', 'job_id': request['job_id'],
              'units': 'unverified-scale', 'candidate_promoted': False,
              'source_revision': WORLDMIRROR_SOURCE_REVISION, 'checkpoint_revision': CHECKPOINT_REVISION,
              'original_input_hashes': originals, 'original_inputs_sha256': fingerprint(originals),
              'normalization': prepared['normalization'], 'preprocessing': prepared['preprocessing'],
              'target_size': prepared['target'], 'inference_seconds': float(elapsed),
              'camera_convention': 'OpenCV camera-to-world; depth is camera Z; pts3d is world-space',
              'fields_file': fields_path.name, 'fields_sha256': hashlib.sha256(fields_path.read_bytes()).hexdigest(),
              'field_shapes': {key: list(array.shape) for key, array in arrays.items()},
              'implementation_sha256': {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                                        for name in ('worldmirror_worker.py', 'worldmirror_adapter.py', 'inference.py', 'geometry.py')},
              'limitations': ['Raw core prediction arrays only; no sky mask, filtering, mesh or Gaussian export.',
                              'No supplied depth/camera priors, object completion, room-boundary fit or metric claim.',
                              'Separate model/dependency and cloud resource validation remains required.']}
    with (output/'manifest.json').open('x', encoding='utf-8') as file:
        json.dump(result, file, sort_keys=True, allow_nan=False)
    return result
