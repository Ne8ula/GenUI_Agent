"""One approved L4 browser verification; exact private snapshot, no provider keys or public server."""
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
# Earlier folders retain their plans and receipts; this recording needs fresh approval.
OUTPUT = ROOT / '.local/reconstruction/crime-scene-browser-v10'
CAPTURES = 'docs/design/revisions/crime-scene-eva-v1/implementation/after'
# Object models land under objects-v2 once generated; the catalogue may or may not list them yet.
ASSETS = ('.local/reconstruction/ffs-th0028-scene-v2/', '.local/reconstruction/ffs-th0028-media-v1/',
          '.local/reconstruction/ffs-th0028-depth-v1/returned/', '.local/reconstruction/ffs-th0028-segments-v1/returned/',
          '.local/reconstruction/ffs-th0028-segments-v2/returned/', '.local/reconstruction/ffs-th0028-review-v1/',
          '.local/reconstruction/figure-ual-v1/extracted/', '.local/reconstruction/ffs-th0028-objects-v2/returned/',
          '.local/reconstruction/ffs-th0028-realsee-v2/')
RESOURCES = {'gpu': 'L4', 'cpu': 4, 'memory_mib': 16384, 'timeout': 600,
             'startup_timeout': 300, 'client_timeout': 1200, 'max_containers': 1,
             'retries': 0, 'operational_allowance_usd': 2, 'provider_enforced_dollar_cap': False}
INSPECTION_RESOURCES = {**RESOURCES, 'gpu': ['L4', 'A10G', 'T4']}
# Scene, photos and the 6.4 MiB figure fill 40 MiB; up to seven 2 MB object models still fit.
UPLOAD_LIMIT = 64 * 1024**2
IMAGE = 'mcr.microsoft.com/playwright:v1.56.1-noble'
PACKAGES = ['playwright', 'vite', 'typescript', 'react', 'react-dom', 'three', 'ajv',
            '@fontsource/ibm-plex-sans', '@fontsource/ibm-plex-mono', '@fontsource/space-grotesk']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def catalog_records(panorama=False):
    records = json.loads((ROOT / 'scripts/room_workflow/ffs-resources.json').read_text())
    if panorama:
        records = {k: v for k, v in records.items() if k in ('scene.ply', 'tags.json') or k.startswith(('photos/', 'realsee/'))}
    return records


def source_files(panorama=False):
    files = {'week4/app/src/main.tsx', 'week4/app/src/style.css', 'week4/app/index.html',
             'week4/app/src/room/verified-mesh.ts', 'week4/app/src/room/matrix-style.ts', 'week4/app/scripts/crime-scene-smoke.mjs',
             'week4/app/scripts/crime-scene-demo.mjs', 'week4/app/scripts/crime-scene-kiosk.mjs',
             'week4/app/scripts/crime-scene-walkthrough.mjs', 'week4/app/scripts/panorama-quality.mjs',
             'scripts/room_workflow/idealized-room.schema.json',
             'week4/app/scripts/browser-options.mjs', 'scripts/room_workflow/ffs-resources.json'}
    files.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'week4/app/src/crime-scene').iterdir()
                 if p.suffix in ('.tsx', '.ts', '.css'))
    files.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'week4/app/tests').glob('crime-scene*.test.ts'))
    files.add('week4/app/tests/browser-options.test.ts')
    pending = ['scripts/room_workflow/broker.mjs']
    while pending:
        name = pending.pop()
        if name in files:
            continue
        files.add(name)
        # Sibling JSON read by path (schema, research digest, catalogue) is walked like an import.
        for link in re.findall(r"(?:from\s*|import\s*)['\"](\.[^'\"]+\.mjs)['\"]|new URL\(['\"](\./[^'\"/]+\.json)['\"]", (ROOT / name).read_text(encoding='utf-8')):
            link = ''.join(link)
            child = (ROOT / name).parent.joinpath(link).resolve().relative_to(ROOT).as_posix()
            pending.append(child)
    records = catalog_records(panorama)
    if panorama:
        files.add('week4/app/scripts/crime-scene-panorama-capture.mjs')
    for record in records.values():
        name = record['path']
        if not name.startswith(ASSETS):
            raise ValueError('Unexpected asset scope')
        if sha((ROOT / name).read_bytes()) != record['sha256'] or (ROOT / name).stat().st_size != record['bytes']:
            raise ValueError('Retained source asset changed')
        files.add(name)
    for name in files:
        path = ROOT / name
        path.resolve().relative_to(ROOT)
        if any(p.is_symlink() for p in [path, *path.parents]) or not path.is_file():
            raise ValueError('Snapshot requires regular files without links')
    if sum((ROOT / n).stat().st_size for n in files) > UPLOAD_LIMIT:
        raise ValueError(f'Upload exceeds {UPLOAD_LIMIT // 1024**2} MiB')
    return sorted(files)


def prepare(output=OUTPUT, panorama=False, inspection=None, **overrides):
    if inspection not in (None, 'before', 'after') or (inspection and not panorama):
        raise ValueError('Invalid inspection capture scope')
    names = source_files(panorama)
    if inspection:
        names.append('week4/app/scripts/crime-scene-inspection-capture.mjs')
    if sum((ROOT / n).stat().st_size for n in names) > UPLOAD_LIMIT:
        raise ValueError('Upload exceeds 64 MiB')
    lock = json.loads((ROOT / 'week4/package-lock.json').read_text())
    versions = {p: lock['packages']['node_modules/' + p]['version'] for p in PACKAGES}
    output.mkdir(exist_ok=False)
    snapshot = output / 'snapshot'
    for name in names:
        target = snapshot / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    # shortcut: isolated real scene entry; full multi-route shell remains a separate check.
    entry = snapshot / 'week4/app/src/main.tsx'
    text = entry.read_text(encoding='utf-8')
    old = "import { App } from './App.tsx';"
    if text.count(old) != 1:
        raise ValueError('Application entry changed')
    scene_import = "import { CrimeSceneEntry as App } from './crime-scene/PanoramaApp.tsx';" if panorama else "import { CrimeSceneApp as App } from './crime-scene/CrimeSceneApp.tsx';"
    entry.write_text(text.replace(old, scene_import), encoding='utf-8')
    if panorama:
        (snapshot / 'scripts/room_workflow/ffs-resources.json').write_text(json.dumps(catalog_records(True), indent=2), encoding='utf-8')
        (snapshot / 'capture-mode.json').write_text(json.dumps({'panorama': True, **({'inspection': inspection} if inspection else {})}), encoding='utf-8')
    (snapshot / 'package.json').write_text('{"type":"module"}', encoding='utf-8')
    (snapshot / 'week4/app/vite.config.mjs').write_text(
        "export default {esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:1440,strictPort:true,"
        "fs:{allow:['/work','/opt/eva/node_modules']},proxy:{'/api/room-workflow':'http://127.0.0.1:1442'}},build:{copyPublicDir:false}};\n", encoding='utf-8')
    files = {p.relative_to(snapshot).as_posix(): sha(p.read_bytes()) for p in sorted(snapshot.rglob('*')) if p.is_file()}
    plan = {'kind': 'eva-crime-scene-browser-v1', 'created_at': datetime.now(timezone.utc).isoformat(),
            'resources': RESOURCES, 'image': IMAGE, 'packages': versions, 'files': files,
            'source_files': {n: sha((ROOT / n).read_bytes()) for n in names},
            'adapter_sha256': sha(Path(__file__).read_bytes()),
            'cleanup_sha256': sha(Path(__file__).with_name('worldmirror_transfer_probe.py').read_bytes()),
            'upload_bytes': sum(p.stat().st_size for p in snapshot.rglob('*') if p.is_file()),
            'scope': 'Private isolated scene: real canned-backend walkthrough/video, then separate fixture-based smoke; no full-shell or forensic validation',
            'execution_authorized': False,
            'approval': 'Pending: one L4, 16 GiB, 10-minute verification/recording, $2 operational allowance, listed snapshot upload, no retries',
            'storage': 'No volumes or public endpoints; snapshot may remain in provider-managed upload/cache storage.'}
    if panorama:
        plan['scope'] = 'Real Realsee v2 scene in isolated EVA crime-scene route; native 2560x1440 viewport, original scan/photos separate, no inference/provider calls; full shell not checked'
        plan['capture'] = {'width': 2560, 'height': 1440, 'device_scale_factor': 1, 'target_fps': 60, 'measured_fps': None}
    if inspection:
        plan.update(inspection=inspection, evidence_limit_bytes=512 * 1024**2,
                    scope='Bounded scripted inspection demo: same supplied room, no inference or scan registration',
                    approval='Approved in session: baseline and final only, $2 each, no retries; cloud FFmpeg build and scoped source upload')
    plan.update(overrides)
    (output / 'plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
    return plan


def worker():
    yield ('worker-started',)
    import os
    import signal
    import subprocess
    import time
    import urllib.request
    root = Path('/work')
    shutil.copytree('/snapshot', root)
    mode = json.loads((root / 'capture-mode.json').read_text()) if (root / 'capture-mode.json').exists() else {}
    panorama, inspection = mode.get('panorama', False), mode.get('inspection')
    if inspection not in (None, 'before', 'after'):
        raise ValueError('Invalid inspection capture scope')
    out = root / (f'docs/design/revisions/crime-scene-inspection-demo-v1/implementation/{inspection}' if inspection else
                  'docs/design/revisions/crime-scene-realsee-v1/implementation/after' if panorama else CAPTURES)
    out.mkdir(parents=True)
    os.symlink('/opt/eva/node_modules', root / 'node_modules')
    env = {**os.environ, 'EVA_REQUIRE_NVIDIA': '1', 'EVA_BROWSER_CHANNEL': 'chromium'}
    if inspection:
        env['EVA_INSPECTION_PHASE'] = inspection
    for key in list(env):
        if any(word in key.upper() for word in ('API_KEY', 'ANTHROPIC', 'OPENAI')):
            env.pop(key)
    server = None
    result = {'status': 'failed', 'scope': 'isolated crime-scene entry; no provider calls'}
    durations = result['durations'] = {}  # seconds per step, so a slow step is visible after a timeout
    try:
        for name, command in [('gpu-device', ['nvidia-smi']), ('vulkan', ['vulkaninfo', '--summary']),
            ('unit', ['node', '--test', '--test-concurrency=1', *[str(p.relative_to(root)) for p in sorted((root / 'week4/app/tests').glob('*.test.ts'))]])]:
            started = time.monotonic()
            with (out / (name + '.log')).open('wb') as log:
                code = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=45).returncode
            result[name] = code
            durations[name] = round(time.monotonic() - started, 2)
            if name == 'gpu-device' and code:
                raise RuntimeError(name + ' failed')
        started = time.monotonic()
        with (out / 'vite.log').open('wb') as log:
            server = subprocess.Popen(['node', '/opt/eva/node_modules/vite/bin/vite.js'], cwd=root / 'week4/app',
                                      env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        deadline = time.monotonic() + 30
        while True:
            try:
                with urllib.request.urlopen('http://127.0.0.1:1440', timeout=1) as response:
                    if response.status == 200:
                        break
            except Exception:
                if server.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError('Dev server did not become ready')
                time.sleep(.2)
        durations['vite'] = round(time.monotonic() - started, 2)
        started = time.monotonic()
        with (out / 'walkthrough.log').open('wb') as log:
            script = 'crime-scene-inspection-capture.mjs' if inspection else 'crime-scene-panorama-capture.mjs' if panorama else 'crime-scene-walkthrough.mjs'
            result['walkthrough'] = subprocess.run(['node', 'week4/app/scripts/' + script], cwd=root,
                env=env, stdout=log, stderr=subprocess.STDOUT, timeout=330 if panorama else 90).returncode
        durations['walkthrough'] = round(time.monotonic() - started, 2)
        if result['walkthrough']:
            raise RuntimeError('Canned walkthrough failed; retain partial recording, do not retry')
        if not panorama:
            started = time.monotonic()
            with (out / 'smoke.log').open('wb') as log:
                result['smoke'] = subprocess.run(['node', 'week4/app/scripts/crime-scene-smoke.mjs'], cwd=root,
                    env=env, stdout=log, stderr=subprocess.STDOUT, timeout=330).returncode
            durations['smoke'] = round(time.monotonic() - started, 2)
        result['status'] = 'passed' if result.get('smoke', 0) == 0 and result['unit'] == 0 else 'failed'
    except Exception as error:
        result['error'] = str(error)
    finally:
        if server is not None and server.poll() is None:
            os.killpg(server.pid, signal.SIGTERM)
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(server.pid, signal.SIGKILL)
                server.wait(timeout=5)
        (out / 'result.json').write_text(json.dumps(result, indent=2))
    yield from evidence_records(out, limit=(512 if inspection else 64) * 1024**2)


def evidence_records(out, limit=64 * 1024**2):
    total = 0
    # Return diagnostics before media so an oversized recording cannot hide the result.
    for file in sorted(out.iterdir(), key=lambda file: (file.suffix in ('.png', '.webm'), file.name)):
        size = file.stat().st_size
        total += size
        if total > limit:
            raise ValueError(f'Returned evidence exceeds {limit // 1024**2} MiB')
        data = file.read_bytes()
        yield ('file', file.name, size, sha(data))
        for start in range(0, size, 1024**2):
            yield ('chunk', data[start:start + 1024**2])
        yield ('end',)


async def wait_for_worker(stream, timeout=300):
    # Modal's container startup timeout does not bound time waiting for GPU capacity.
    try:
        record = await asyncio.wait_for(anext(stream), timeout=timeout)
    except TimeoutError as error:
        raise TimeoutError(f'Worker start not acknowledged within {timeout}s; inspect Modal scheduling/startup logs. No retry submitted.') from error
    except StopAsyncIteration as error:
        raise ValueError('Worker stream ended without a start acknowledgement') from error
    if record != ('worker-started',):
        raise ValueError('Invalid worker start acknowledgement')


async def receive(stream, output, limit=64 * 1024**2):
    file = None
    remaining = total = count = 0
    try:
        async for record in stream:
            if not isinstance(record, (tuple, list)) or not record:
                raise ValueError('Invalid evidence record')
            if record[0] == 'file' and len(record) == 4 and file is None:
                _, name, size, expected = record
                if (not isinstance(name, str) or not re.fullmatch(r'[a-z0-9-]+\.(png|json|log|webm)', name)
                    or type(size) is not int or size < 0 or total + size > limit
                    or not isinstance(expected, str) or not re.fullmatch('[a-f0-9]{64}', expected) or count >= 40):
                    raise ValueError('Invalid evidence file')
                total += size; count += 1; remaining = size
                digest = hashlib.sha256()
                file = (output / name).open('xb')
            elif record[0] == 'chunk' and len(record) == 2 and file is not None:
                data = record[1]
                if type(data) is not bytes or not 0 < len(data) <= min(remaining, 1024**2):
                    raise ValueError('Invalid evidence chunk')
                file.write(data); digest.update(data); remaining -= len(data)
            elif record[0] == 'end' and len(record) == 1 and file is not None:
                file.close(); file = None
                if remaining or digest.hexdigest() != expected:
                    raise ValueError('Evidence integrity failure')
            else:
                raise ValueError('Unexpected evidence record')
        if file is not None or not count:
            raise ValueError('Incomplete evidence stream')
    finally:
        if file is not None:
            file.close()


def create(snapshot, versions, function=worker, name='eva-crime-scene-browser-check', apt=(), timeout=600, isolated=True, sources=(), gpu='L4'):
    import modal
    packages = ' '.join(f'{p}@{v}' for p, v in versions.items())
    image = (modal.Image.from_registry(IMAGE, add_python='3.12')
        .apt_install('vulkan-tools', 'libvulkan1', *apt)
        .run_commands('mkdir -p /opt/eva', f'cd /opt/eva && npm install --ignore-scripts --no-audit --no-fund {packages}')
        .env({'NVIDIA_DRIVER_CAPABILITIES': 'all', 'PLAYWRIGHT_BROWSERS_PATH': '/ms-playwright'})
        .add_local_dir(snapshot, '/snapshot', copy=False))
    if sources:
        image = image.add_local_python_source(*sources, copy=False)
    app = modal.App(name)
    # Generator functions reject even retries=0; omission means no configured retries.
    fn = app.function(image=image, gpu=gpu, cpu=(4, 4), memory=(16384, 16384), timeout=timeout,
        startup_timeout=300, max_containers=1, scaledown_window=2,
        block_network=isolated, restrict_modal_access=isolated, single_use_containers=True,
        secrets=[], name='verify')(function)
    return app, fn


def execute(approved_hash, output=OUTPUT):
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    raw = (output / 'plan.json').read_bytes()
    plan = json.loads(raw)
    allowed_resources = (RESOURCES, INSPECTION_RESOURCES) if plan.get('inspection') == 'after' else (RESOURCES,)
    if (sha(raw) != approved_hash or plan['resources'] not in allowed_resources or plan['image'] != IMAGE
        or plan['adapter_sha256'] != sha(Path(__file__).read_bytes())
        or plan['cleanup_sha256'] != sha(Path(__file__).with_name('worldmirror_transfer_probe.py').read_bytes())):
        raise ValueError('Plan or implementation changed')
    snapshot = output / 'snapshot'
    actual = {p.relative_to(snapshot).as_posix(): sha(p.read_bytes()) for p in snapshot.rglob('*') if p.is_file()}
    if actual != plan['files'] or any(p.is_symlink() for p in snapshot.rglob('*')):
        raise ValueError('Snapshot changed')
    # Exclusive reservation is before image build/upload; this allowance cannot resubmit.
    receipt_path = output / 'receipt.json'
    receipt = {'status': 'reserved', 'plan_sha256': approved_hash, 'app_id': None, 'approved_dollars': 2}
    with receipt_path.open('x', encoding='utf-8') as file:
        json.dump(receipt, file)
    def save():
        receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    if str(Path(__file__).parent) not in sys.path:
        sys.path.insert(0, str(Path(__file__).parent))
    from worldmirror_transfer_probe import stop_app
    import modal
    app = None
    try:
        inspection = plan.get('inspection')
        if inspection not in (None, 'before', 'after'):
            raise ValueError('Invalid inspection capture scope')
        limit = (512 if inspection else 64) * 1024**2
        if plan.get('evidence_limit_bytes', limit) != limit:
            raise ValueError('Evidence allowance changed')
        app, fn = create(snapshot, plan['packages'], apt=('ffmpeg',) if inspection else (), gpu=plan['resources']['gpu'])
        async def run():
            async with app.run.aio(detach=False):
                receipt.update(status='submitted', app_id=app.app_id); save()
                returned = output / 'returned'; returned.mkdir()
                try:
                    stream = fn.remote_gen.aio()
                    await wait_for_worker(stream)
                    receipt['worker_started_at'] = datetime.now(timezone.utc).isoformat(); save()
                    await receive(stream, returned, limit=limit)
                    receipt['result'] = json.loads((returned / 'result.json').read_text())
                    receipt['status'] = 'evidence-returned'
                finally:
                    receipt['cleanup'] = stop_app(app.app_id); save()
        with modal.enable_output():
            asyncio.run(asyncio.wait_for(run(), timeout=1200))
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
    # Modal's progress glyphs must survive redirected Windows consoles.
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-approved-plan-sha256')
    parser.add_argument('--panorama', action='store_true')
    args = parser.parse_args()
    output = ROOT / '.local/reconstruction/crime-scene-realsee-render-v1' if args.panorama else OUTPUT
    result = execute(args.execute_approved_plan_sha256, output) if args.execute_approved_plan_sha256 else prepare(output, panorama=args.panorama)
    print(json.dumps(result, indent=2))
