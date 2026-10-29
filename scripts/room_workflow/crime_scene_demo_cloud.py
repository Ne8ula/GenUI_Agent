"""One approved 15-minute interactive room demo: GPU Chromium streamed by noVNC.
The viewer's PC only decodes the stream; scene rendering stays on Modal."""
import argparse
import asyncio
from datetime import datetime, timezone
import importlib.metadata
import json
from pathlib import Path
import re
import sys

if str(Path(__file__).parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).parent))
import crime_scene_browser_cloud as browser

# Earlier session folders and receipts remain untouched.
OUTPUT = browser.ROOT / '.local/reconstruction/crime-scene-matrix-live-v3'
RESOURCES = {**browser.RESOURCES, 'gpu': ['T4', 'L4', 'A10G'], 'timeout': 900, 'client_timeout': 1200, 'operational_allowance_usd': 2}
APT = ('xvfb', 'x11vnc', 'novnc', 'websockify')
URL = re.compile(r'https://[a-z0-9.-]+\.modal\.host/vnc\.html\?autoconnect=1&resize=scale')


def session():
    yield ('worker-started',)
    import os
    import secrets
    import shutil
    import signal
    import subprocess
    import time
    import urllib.request
    import modal
    deadline = time.monotonic() + RESOURCES['timeout'] - 10
    root = Path('/work')
    shutil.copytree('/snapshot', root)
    os.symlink('/opt/eva/node_modules', root / 'node_modules')
    out = root / 'live-evidence'; out.mkdir()
    env = {**os.environ, 'DISPLAY': ':99', 'EVA_REQUIRE_NVIDIA': '1', 'EVA_BROWSER_CHANNEL': 'chromium'}
    for key in list(env):
        if any(word in key.upper() for word in ('API_KEY', 'ANTHROPIC', 'OPENAI')):
            env.pop(key)
    processes, logs = [], []
    def start(command, name):
        log = (out / (name + '.log')).open('wb'); logs.append(log)
        processes.append(subprocess.Popen(command, cwd=root, env=env, start_new_session=True, stdout=log, stderr=subprocess.STDOUT))
    def wait(check, seconds, what):
        until = min(deadline, time.monotonic() + seconds)
        while not check():
            if time.monotonic() > until or any(p.poll() is not None for p in processes):
                raise RuntimeError(what + ' did not start; no retry')
            time.sleep(.5)
    def serving():
        try:
            with urllib.request.urlopen('http://127.0.0.1:1440', timeout=1) as response:
                return response.status == 200
        except Exception:
            return False
    try:
        try:
            start(['Xvfb', ':99', '-screen', '0', '1600x900x24', '-nolisten', 'tcp'], 'display')
            start(['node', 'week4/app/scripts/crime-scene-demo.mjs'], 'server')
            wait(serving, 60, 'Dev server')
            start(['node', 'week4/app/scripts/crime-scene-kiosk.mjs', str(out)], 'browser')
            wait(lambda: (out / 'result.json').exists(), 120, 'GPU browser checks')
            report = json.loads((out / 'result.json').read_text())
        except Exception as error:
            report = {'status': 'failed', 'error': str(error)}
            (out / 'result.json').write_text(json.dumps(report))
        evidence = root / 'live-returned'
        shutil.copytree(out, evidence)
        yield from browser.evidence_records(evidence)
        yield ('evidence-complete',)
        if report['status'] != 'passed':
            yield ('error', report)
            return
        password = secrets.token_urlsafe(6)[:8]  # VNC authentication uses at most 8 characters.
        subprocess.run(['x11vnc', '-storepasswd', password, '/tmp/vncpass'], check=True, capture_output=True)
        start(['x11vnc', '-display', ':99', '-rfbauth', '/tmp/vncpass', '-forever', '-shared', '-localhost', '-rfbport', '5900', '-quiet'], 'vnc')
        start(['websockify', '--web', '/usr/share/novnc', '6080', 'localhost:5900'], 'tunnel')
        with modal.forward(6080) as tunnel:
            yield ('ready', tunnel.url + '/vnc.html?autoconnect=1&resize=scale', password, report['gpu'])
            while time.monotonic() < deadline:
                if any(p.poll() is not None for p in processes):
                    raise RuntimeError('Interactive process exited; no retry')
                time.sleep(min(2, max(0, deadline - time.monotonic())))
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        for log in logs:
            log.close()


async def receive_evidence(stream, output):
    async def records():
        async for record in stream:
            if record == ('evidence-complete',):
                return
            yield record
        raise ValueError('Live evidence ended without completion marker')
    await browser.receive(records(), output)


def execute(approved_hash):
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    raw = (OUTPUT / 'plan.json').read_bytes()
    plan = json.loads(raw)
    snapshot = OUTPUT / 'snapshot'
    actual = {p.relative_to(snapshot).as_posix(): browser.sha(p.read_bytes()) for p in snapshot.rglob('*') if p.is_file()}
    if (browser.sha(raw) != approved_hash or plan['resources'] != RESOURCES or actual != plan['files']
            or plan['image'] != browser.IMAGE or plan['upload_bytes'] > browser.UPLOAD_LIMIT
            or any(p.is_symlink() for p in snapshot.rglob('*'))
            or plan['adapter_sha256'] != browser.sha(Path(browser.__file__).read_bytes())
            or plan['cleanup_sha256'] != browser.sha(Path(__file__).with_name('worldmirror_transfer_probe.py').read_bytes())
            or plan['demo_sha256'] != browser.sha(Path(__file__).read_bytes())):
        raise ValueError('Plan or implementation changed')
    receipt_path = OUTPUT / 'receipt.json'
    receipt = {'status': 'reserved', 'plan_sha256': approved_hash, 'app_id': None, 'approved_dollars': 2}
    with receipt_path.open('x', encoding='utf-8') as file:
        json.dump(receipt, file)
    def save():
        receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    from worldmirror_transfer_probe import stop_app
    import modal
    app = None
    try:
        # The tunnel needs container network and Modal API access; no secrets are mounted.
        app, fn = browser.create(snapshot, plan['packages'], function=session, name='eva-crime-scene-matrix-live', apt=APT,
                                 timeout=RESOURCES['timeout'], gpu=RESOURCES['gpu'], isolated=False, sources=('crime_scene_browser_cloud',))
        async def run():
            async with app.run.aio(detach=False):
                receipt.update(status='submitted', app_id=app.app_id); save()
                try:
                    stream = fn.remote_gen.aio()
                    await browser.wait_for_worker(stream, timeout=RESOURCES['startup_timeout'])
                    receipt['worker_started_at'] = datetime.now(timezone.utc).isoformat(); save()
                    returned = OUTPUT / 'returned'; returned.mkdir()
                    await receive_evidence(stream, returned)
                    receipt['checks'] = json.loads((returned / 'result.json').read_text()); save()
                    async for record in stream:
                        if len(record) == 4 and record[0] == 'ready' and URL.fullmatch(record[1]) and receipt['checks']['status'] == 'passed':
                            receipt.update(status='streaming', gpu=record[3], ready_at=datetime.now(timezone.utc).isoformat()); save()
                            print(f'\nOpen: {record[1]}\nPassword: {record[2]}\nDrag to look; arrows move/turn. Detective Mode toggles Matrix. Play demo retains your viewpoint.\nSession ends within 15 minutes of worker start; Ctrl+C ends it earlier.\n', flush=True)
                        else:
                            raise RuntimeError('Live session checks failed; retained diagnostics, no retry')
                    receipt['status'] = 'ended'
                finally:
                    receipt['cleanup'] = stop_app(app.app_id); save()
        with modal.enable_output():
            asyncio.run(asyncio.wait_for(run(), timeout=RESOURCES['client_timeout']))
    except BaseException as error:
        receipt.update(status='ended' if isinstance(error, KeyboardInterrupt) and receipt['status'] == 'streaming' else 'failed-or-uncertain',
                       error_type=type(error).__name__, error=str(error)[:1000])
        if app is not None and app.app_id and 'cleanup' not in receipt:
            try:
                receipt['cleanup'] = stop_app(app.app_id)
            except Exception as cleanup_error:
                receipt['cleanup'] = {'state': 'unconfirmed', 'error_type': type(cleanup_error).__name__}
        save()
        if not isinstance(error, KeyboardInterrupt):
            raise
    save()
    return receipt


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-approved-plan-sha256')
    args = parser.parse_args()
    if args.execute_approved_plan_sha256:
        result = execute(args.execute_approved_plan_sha256)
    else:
        result = browser.prepare(OUTPUT, panorama=True, kind='eva-crime-scene-matrix-live-v3', resources=RESOURCES,
            demo_sha256=browser.sha(Path(__file__).read_bytes()),
            scope='Interactive inferred panorama room; live 1600x900 cloud display; Matrix treatment and separate source photo; no inference or registration',
            capture={'width': 1600, 'height': 900, 'device_scale_factor': 1, 'measured_fps': None},
            approval='Owner approved one T4/L4/A10G interactive session, 900s worker, 300s worker-start wait, 1200s client, $2 operational allowance, no retries',
            storage='Temporary internet-accessible viewer plus 8-character VNC password; no volumes or deployment; disposable notebook; provider disabled; provider cache retention unknown.')
    print(json.dumps({k: v for k, v in result.items() if k not in ('files', 'source_files')}, indent=2))
