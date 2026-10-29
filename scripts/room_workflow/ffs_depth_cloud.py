"""One approved L4 run: Depth Anything V2 Small relative depth for the 13 catalogued th_0028 photos.
Returns downscaled photos and 8-bit depth PNGs (brighter = nearer). Estimated depth, not measurement."""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT = ROOT / '.local/reconstruction/ffs-th0028-depth-v1'
MODEL = 'depth-anything/Depth-Anything-V2-Small-hf'  # Apache-2.0
PACKAGES = ('torch==2.6.0', 'transformers==4.51.3', 'pillow==11.2.1', 'numpy==2.2.6')
RESOURCES = {'gpu': 'L4', 'cpu': 2, 'memory_mib': 8192, 'timeout': 600, 'startup_timeout': 600,
             'client_timeout': 1500, 'max_containers': 1, 'retries': 0,
             'operational_allowance_usd': 1, 'provider_enforced_dollar_cap': False}
LONG_SIDE = 640
NAME = re.compile(r'(photo-IMG_20240306_\d{6}\.jpg|depth-IMG_20240306_\d{6}\.png|report\.json)')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def photos():
    catalog = json.loads((ROOT / 'scripts/room_workflow/ffs-resources.json').read_text())
    found = {}
    for key, record in catalog.items():
        if not key.startswith('photos/'):
            continue
        path = ROOT / record['path']
        if path.is_symlink() or sha(path.read_bytes()) != record['sha256']:
            raise ValueError('Catalogued photo changed')
        found[key.removeprefix('photos/')] = path
    if len(found) != 13:
        raise ValueError('Expected the 13 catalogued photos')
    return found


def prepare():
    OUTPUT.mkdir(exist_ok=False)
    inputs = OUTPUT / 'inputs'
    inputs.mkdir()
    for name, path in photos().items():
        shutil.copyfile(path, inputs / name)
    plan = {'kind': 'eva-ffs-depth-v1', 'created_at': datetime.now(timezone.utc).isoformat(), 'model': MODEL,
            'packages': list(PACKAGES), 'resources': RESOURCES, 'long_side': LONG_SIDE,
            'inputs': {p.name: sha(p.read_bytes()) for p in sorted(inputs.iterdir())},
            'adapter_sha256': sha(Path(__file__).read_bytes()),
            'approval': 'Owner approved one L4 Depth Anything V2 Small run on the 13 photos, $1 operational allowance, no retries',
            'scope': 'Public CC BY-NC-SA FFS photos only; relative monocular depth for a display animation, not geometry'}
    (OUTPUT / 'plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
    return plan


def worker():
    import io
    import numpy as np
    from PIL import Image, ImageOps
    from transformers import pipeline
    estimate = pipeline('depth-estimation', model=MODEL, device=0)
    report = {'model': MODEL, 'revision': estimate.model.config._commit_hash, 'files': {}}
    for path in sorted(Path('/inputs').iterdir()):
        image = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
        image.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)
        depth = estimate(image)['predicted_depth'].squeeze().float().cpu().numpy()
        depth = (depth - depth.min()) / max(float(depth.max() - depth.min()), 1e-6)
        depth = Image.fromarray((depth * 255).round().astype(np.uint8)).resize(image.size, Image.BICUBIC)
        for name, picture, kind in [(f'photo-{path.stem}.jpg', image, 'JPEG'), (f'depth-{path.stem}.png', depth, 'PNG')]:
            buffer = io.BytesIO()
            picture.save(buffer, kind, **({'quality': 85} if kind == 'JPEG' else {}))
            data = buffer.getvalue()
            report['files'][name] = {'bytes': len(data), 'sha256': sha(data), 'size': list(image.size)}
            yield (name, data)
    yield ('report.json', json.dumps(report, indent=2).encode())


async def receive(stream, output):
    seen = set()
    async for record in stream:
        if (type(record) not in (tuple, list) or len(record) != 2 or not isinstance(record[0], str)
                or not NAME.fullmatch(record[0]) or record[0] in seen or type(record[1]) is not bytes
                or not 0 < len(record[1]) <= 1024**2 or len(seen) >= 27):
            raise ValueError('Invalid returned record')
        seen.add(record[0])
        with (output / record[0]).open('xb') as file:
            file.write(record[1])
    report = json.loads((output / 'report.json').read_text())
    if len(seen) != 27 or set(report['files']) != seen - {'report.json'}:
        raise ValueError('Incomplete depth results')
    for name, meta in report['files'].items():
        if sha((output / name).read_bytes()) != meta['sha256']:
            raise ValueError('Depth result integrity failure')
    return report


def register(output, report, catalog_path=ROOT / 'scripts/room_workflow/ffs-resources.json'):
    """Adds verified results to the broker's hash-checked catalogue; never replaces an entry."""
    catalog = json.loads(catalog_path.read_text())
    for name, meta in sorted(report['files'].items()):
        key = 'depth/' + name
        if key in catalog:
            raise ValueError('Depth catalogue entry already exists')
        catalog[key] = {'path': (output / name).relative_to(ROOT).as_posix(), 'sha256': meta['sha256'], 'bytes': meta['bytes'],
                        'type': 'image/jpeg' if name.endswith('.jpg') else 'image/png'}
    catalog_path.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')


def create(inputs):
    import modal
    image = (modal.Image.debian_slim(python_version='3.12').pip_install(*PACKAGES)
        .run_commands(f"python -c \"from transformers import pipeline; pipeline('depth-estimation', model='{MODEL}')\"")
        .add_local_dir(inputs, '/inputs', copy=False))
    app = modal.App('eva-ffs-depth')
    # Generator functions reject even retries=0; omission means no configured retries.
    fn = app.function(image=image, gpu='L4', cpu=(2, 2), memory=(8192, 8192), timeout=600, startup_timeout=600,
        max_containers=1, scaledown_window=2, block_network=True, restrict_modal_access=True,
        single_use_containers=True, secrets=[], name='depth')(worker)
    return app, fn


def execute(approved_hash):
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    raw = (OUTPUT / 'plan.json').read_bytes()
    plan = json.loads(raw)
    inputs = OUTPUT / 'inputs'
    if (sha(raw) != approved_hash or plan['resources'] != RESOURCES or plan['adapter_sha256'] != sha(Path(__file__).read_bytes())
            or {p.name: sha(p.read_bytes()) for p in sorted(inputs.iterdir())} != plan['inputs']):
        raise ValueError('Plan or implementation changed')
    receipt_path = OUTPUT / 'receipt.json'
    receipt = {'status': 'reserved', 'plan_sha256': approved_hash, 'app_id': None, 'approved_dollars': 1}
    with receipt_path.open('x', encoding='utf-8') as file:
        json.dump(receipt, file)
    save = lambda: receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    if str(Path(__file__).parent) not in sys.path:
        sys.path.insert(0, str(Path(__file__).parent))
    from worldmirror_transfer_probe import stop_app
    import modal
    app = None
    try:
        app, fn = create(inputs)
        async def run():
            async with app.run.aio(detach=False):
                receipt.update(status='submitted', app_id=app.app_id); save()
                output = OUTPUT / 'returned'; output.mkdir()
                try:
                    receipt['report'] = await receive(fn.remote_gen.aio(), output)
                    receipt['status'] = 'depth-returned'
                    register(output, receipt['report'])
                finally:
                    receipt['cleanup'] = stop_app(app.app_id); save()
        with modal.enable_output():
            asyncio.run(asyncio.wait_for(run(), timeout=RESOURCES['client_timeout']))
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


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-approved-plan-sha256')
    args = parser.parse_args()
    result = execute(args.execute_approved_plan_sha256) if args.execute_approved_plan_sha256 else prepare()
    print(json.dumps(result, indent=2))
