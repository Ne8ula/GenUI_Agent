"""Bounded synthetic CPU streaming/cancellation probe; never runs either model."""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time

SIZE = 4 * 1024**2
CHUNK = 1024**2
CLIENT_TIMEOUT = 150
RESOURCES = {'cpu_limit': 1, 'memory_limit_mib': 512, 'timeout_seconds': 60,
             'startup_timeout_seconds': 120, 'max_containers': 1, 'retries': 0,
             'region': 'us-east', 'block_network': True, 'restrict_modal_access': True,
             'restrict_output': True, 'single_use_containers': True}


def transfer(payload):
    import time
    if type(payload) is not bytes or len(payload) != SIZE:
        raise ValueError('Expected exactly 4 MiB of synthetic bytes')
    yield {'kind': 'start', 'size': SIZE, 'sha256': hashlib.sha256(payload).hexdigest()}
    for index, offset in enumerate(range(0, SIZE, CHUNK)):
        yield {'kind': 'chunk', 'index': index, 'data': payload[offset:offset + CHUNK]}
    yield {'kind': 'complete'}
    # Keep this one CPU worker alive so the probe exercises actual cancellation.
    time.sleep(45)


def create():
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed SDK version changed')
    import modal
    app = modal.App('eva-worldmirror-stream-check')
    fn = app.function(image=modal.Image.debian_slim(python_version='3.11.15'),
        cpu=(1, 1), memory=(512, 512), timeout=60, startup_timeout=120,
        max_containers=1, scaledown_window=2, region='us-east',
        block_network=True, restrict_modal_access=True,
        _experimental_restrict_output=True, single_use_containers=True,
        secrets=[], name='transfer')(transfer)
    return app, fn


async def receive(stream, payload):
    digest = hashlib.sha256(payload).hexdigest()
    started, index = False, 0
    async for record in stream:
        if type(record) is not dict:
            raise ValueError('Expected a bounded record')
        if not started:
            if (set(record) != {'kind', 'size', 'sha256'} or record['kind'] != 'start'
                    or type(record['size']) is not int or record['size'] != SIZE
                    or record['sha256'] != digest):
                raise ValueError('Invalid start record')
            started = True
        elif record == {'kind': 'complete'}:
            if index != SIZE // CHUNK:
                raise ValueError('Incomplete payload')
            return {'output_bytes': SIZE, 'output_sha256': digest}
        else:
            offset = index * CHUNK
            if (set(record) != {'kind', 'index', 'data'} or record['kind'] != 'chunk'
                    or type(record['index']) is not int or record['index'] != index
                    or index >= SIZE // CHUNK or type(record['data']) is not bytes
                    or len(record['data']) != CHUNK or record['data'] != payload[offset:offset + CHUNK]):
                raise ValueError('Invalid, reordered, oversized or corrupt chunk')
            index += 1
    raise ValueError('Stream ended without completion')


def stop_app(app_id):
    # Only the caller's locally created app ID enters this privileged path.
    if type(app_id) is not str or re.fullmatch(r'ap-[a-zA-Z0-9]{22}', app_id) is None:
        raise ValueError('Expected an exact owned app ID, never an app name')
    command = [sys.executable, '-I', '-X', 'utf8', '-m', 'modal']
    subprocess.run(command + ['app', 'stop', app_id, '--yes'], timeout=30,
                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # A nonzero stop exit can mean already stopped; verify state rather than guessing.
    deadline = time.monotonic() + 30
    while (remaining := deadline - time.monotonic()) > 0:
        result = subprocess.run(command + ['app', 'list', '--json'], timeout=remaining,
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf-8')
        if result.returncode != 0:
            break
        rows = json.loads(result.stdout)
        row = next((item for item in rows if item.get('app_id') == app_id), None)
        if row is None:
            break
        if row.get('state') == 'stopped' and str(row.get('tasks')) == '0':
            return {'app_id': app_id, 'state': 'stopped', 'tasks': 0}
        time.sleep(min(1, remaining))
    raise RuntimeError('Owned app stop unconfirmed; inspect provider before any retry')


async def run(app, fn, payload, receipt, save):
    async with app.run.aio(detach=False):
        owned_app_id = app.app_id
        receipt.update(status='running', app_id=owned_app_id)
        stream, failure = None, None
        try:
            save()
            stream = fn.remote_gen.aio(payload)
            receipt['status'] = 'submitted'; save()
            result = await asyncio.wait_for(receive(stream, payload), CLIENT_TIMEOUT)
            receipt.update(result, status='verified-round-trip'); save()
        except BaseException as error:
            failure = error
            receipt.update(status='failed-or-uncertain', error_type=type(error).__name__)
            raise
        finally:
            # Synchronous bounded cleanup cannot be cancelled with the streaming task.
            # Stop before closing the iterator or exiting the ephemeral app context.
            try:
                receipt['cleanup'] = stop_app(owned_app_id)
            except Exception as error:
                receipt.update(status='failed-or-uncertain',
                               cleanup={'state': 'unconfirmed', 'error_type': type(error).__name__})
                if failure is None:
                    failure = error
            try:
                if stream is not None:
                    await asyncio.wait_for(stream.aclose(), 5)
            except Exception as error:
                receipt['stream_close_error_type'] = type(error).__name__
                if failure is None:
                    failure = error
            if failure is None:
                receipt['status'] = 'verified-round-trip-and-stopped'
            save()
            if failure is not None and sys.exception() is None:
                raise failure


def execute(root, attempt):
    if type(attempt) is not int or not 1 <= attempt <= 3:
        raise ValueError('This approval is bounded to at most three CPU attempts')
    root = Path(root)
    source = Path(__file__).read_bytes()
    source_hash = hashlib.sha256(source).hexdigest()
    previous_cleanup = None
    if attempt > 1:
        previous = root / f'worldmirror-stream-v1-attempt-{attempt - 1}.receipt.json'
        if not previous.is_file():
            raise ValueError('Previous attempt evidence is required')
        record = json.loads(previous.read_text(encoding='utf-8'))
        if (record.get('status') != 'failed-or-uncertain'
                or record.get('source_sha256') == source_hash):
            raise ValueError('Retry requires a corrected implementation after failure')
        previous_cleanup = stop_app(record.get('app_id'))
    path = root / f'worldmirror-stream-v1-attempt-{attempt}.receipt.json'
    payload = secrets.token_bytes(SIZE)
    receipt = {'version': 1, 'status': 'reserved', 'attempt': attempt, 'max_attempts': 3,
               'created_at': datetime.now(timezone.utc).isoformat(),
               'scope': 'Owner-approved synthetic CPU streaming and cancellation probe; no photos/models/GPU',
               'source_sha256': source_hash, 'sdk': 'modal==1.6.1', 'python_image': '3.11.15',
               'input_bytes': SIZE, 'input_sha256': hashlib.sha256(payload).hexdigest(),
               'resources': RESOURCES, 'app_id': None, 'automatic_retries': False,
               'previous_cleanup': previous_cleanup}
    with path.open('x', encoding='utf-8') as file:
        json.dump(receipt, file, sort_keys=True)

    def save():
        path.write_text(json.dumps(receipt, sort_keys=True), encoding='utf-8')

    try:
        with path.with_suffix('.py').open('xb') as file:
            file.write(source)
        app, fn = create()
        import modal
        with modal.enable_output():
            asyncio.run(run(app, fn, payload, receipt, save))
    except BaseException as error:
        receipt.update(status='failed-or-uncertain', error_type=type(error).__name__); save()
        raise
    print(json.dumps(receipt, sort_keys=True))
    return receipt


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-approved-check', action='store_true')
    parser.add_argument('--attempt', type=int, choices=(1, 2, 3), default=1)
    args = parser.parse_args()
    if args.execute_approved_check:
        root = Path(__file__).resolve().parents[2] / '.local/reconstruction/arkitscenes/42445021'
        execute(root, args.attempt)
    else:
        create()
        print(json.dumps({'execution_authorized_by_cli': False, 'resources': RESOURCES,
                          'input_bytes': SIZE, 'chunk_bytes': CHUNK, 'max_attempts': 3,
                          'client_deadline_seconds': CLIENT_TIMEOUT,
                          'cleanup': 'Stop only locally created app; require stopped and zero tasks',
                          'estimate': 'Below $0.01 requested CPU compute per attempt; excludes image/startup overhead; not a billing cap'}, sort_keys=True))


if __name__ == '__main__':
    main()
