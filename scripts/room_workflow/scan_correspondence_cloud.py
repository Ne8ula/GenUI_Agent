"""Offline plan and separately approved, timestamp-only Modal diagnostic. No calibration retry."""
import argparse
import asyncio
from datetime import datetime, timezone
import importlib.metadata
import json
from pathlib import Path
import sys

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from pilot import encoded, load_json, sha
from scan_correspondence import capture
from worldmirror_transfer_probe import stop_app

ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT.parents[1]/'.local/reconstruction/arkitscenes/45261631'
# This investigation freezes its own packet; importing the calibration stack needs scientific packages.
MANIFESTS = {'scan-source-v1': 'fb7ff713a6e0c9310ae20f32c7397377c7ac62a123214179dc2262091bd37a2f'}
DIRECTORY_SHA256 = 'bbbd8c288774abaca779967f3aef3c5cd49016a38a8122fd2900fea275370cdd'
RESOURCES = {'gpu': None, 'cpu': 1, 'memory_mib': 512, 'timeout_seconds': 30,
    'startup_timeout_seconds': 120, 'client_timeout_seconds': 180, 'max_containers': 1,
    'retries': 0, 'region': 'us-east', 'operational_allowance_usd': 1,
    'provider_enforced_dollar_cap': False}
CODE = ('scan_correspondence.py', 'scan_correspondence_cloud.py', 'pilot.py', 'worldmirror_transfer_probe.py')


def _no_links(path):
    path = Path(path).absolute()
    if '..' in path.parts or any(p.is_symlink() or p.is_junction() for p in (path, *path.parents)):
        raise ValueError('Linked or traversing diagnostic path')
    return path


def _object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate diagnostic field')
        value[key] = item
    return value


def prepare():
    # Planning reads pinned manifests only, never trajectory, archive or image payloads.
    manifests = {}
    for folder, pin in {**MANIFESTS, 'scan-rgbd-directory-v1': DIRECTORY_SHA256}.items():
        value, raw = load_json(_no_links(DATA_ROOT/folder/'manifest.json'), 65536)
        if sha(raw) != pin:
            raise ValueError('Retained manifest changed')
        manifests[folder] = value
    trajectory = next(a for a in manifests['scan-source-v1']['assets'] if a['role'] == 'trajectory')
    return {'kind': 'eva-scan-correspondence-cloud-plan-v1', 'execution_authorized': False,
        'capture_id': '45261631', 'input_root': str(DATA_ROOT),
        'manifests': {**MANIFESTS, 'scan-rgbd-directory-v1': DIRECTORY_SHA256},
        'trajectory': {k: trajectory[k] for k in ('bytes', 'sha256')},
        'targets': [format(v['timestamp'], '.3f') for v in manifests['scan-rgbd-directory-v1']['views']],
        'implementation_sha256': {name: sha((ROOT/name).read_bytes()) for name in CODE},
        'sdk': 'modal==1.6.1', 'python_version': '3.12.12', 'resources': RESOURCES.copy(),
        'scope': 'One trajectory upload and timestamp diagnostic; no image/archive payloads or pose application.',
        'limitations': ['New explicit approval of this exact plan and $1 operational allowance required.',
            'No provider-enforced dollar cap; startup/image overhead can add charges.',
            'No GPU, models, third-party scientific packages, persistent volumes or runtime network.',
            'One submission; no configured retries. Provider infrastructure restarts are not an exactly-once guarantee.',
            'A returned diagnostic cannot establish synchronization, registration or source admission.']}


def create():
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    import modal
    image = modal.Image.debian_slim(python_version='3.12.12').add_local_python_source('scan_correspondence')
    app = modal.App('eva-teal-correspondence')
    fn = app.function(image=image, cpu=(1, 1), memory=(512, 512), timeout=30,
        startup_timeout=120, max_containers=1, scaledown_window=2, region='us-east',
        block_network=True, restrict_modal_access=True, _experimental_restrict_output=True,
        single_use_containers=True, secrets=[], name='timestamps')(capture)
    return app, fn


async def receive(stream, plan, output):
    received = False
    async for raw in stream:
        if received or type(raw) is not bytes or not 0 < len(raw) <= 65536:
            raise ValueError('Expected one bounded diagnostic record')
        with (output/'returned-report.json').open('xb') as handle:
            handle.write(raw)
        received = True
        report = json.loads(raw, object_pairs_hook=_object)
        # Re-encoding rejects nonfinite values anywhere, not just in inspected fields.
        json.dumps(report, allow_nan=False)
        if (type(report) is not dict or set(report) != {'kind', 'status', 'source_admitted',
                'trajectory_sha256', 'rows', 'first_timestamp', 'last_timestamp', 'views', 'limitations'}
                or report['kind'] != 'eva-scan-correspondence-v1' or report['status'] != 'diagnostic-only'
                or report['source_admitted'] is not False
                or report['trajectory_sha256'] != plan['trajectory']['sha256']
                or type(report['rows']) is not int or not 1 <= report['rows'] <= 100000
                or type(report['views']) is not list or len(report['views']) != 6):
            raise ValueError('Invalid diagnostic envelope')
        for view, target in zip(report['views'], plan['targets']):
            if (type(view) is not dict or set(view) != {'timestamp', 'before', 'after',
                    'bracket_span_seconds', 'nearest_timestamps', 'nearest_residual_seconds',
                    'within_existing_5ms_gate'} or view['timestamp'] != target
                    or type(view['within_existing_5ms_gate']) is not bool):
                raise ValueError('Changed targets or authority-bearing diagnostic fields')
    if not received:
        raise ValueError('Missing diagnostic result')


async def run(app, fn, data, plan, output, receipt, save):
    async with app.run.aio(detach=False):
        owned_id = app.app_id
        receipt.update(status='running', app_id=owned_id)
        stream, failure = None, None
        try:
            save()
            stream = fn.remote_gen.aio(data, plan['trajectory'], plan['targets'])
            receipt['status'] = 'submitted'; save()
            await asyncio.wait_for(receive(stream, plan, output), RESOURCES['client_timeout_seconds'])
        except BaseException as error:
            failure = error
            raise
        finally:
            try:
                receipt['cleanup'] = stop_app(owned_id)
            except Exception as error:
                receipt['cleanup'] = {'state': 'unconfirmed', 'error_type': type(error).__name__}
                if failure is None:
                    failure = error
            try:
                if stream is not None:
                    await asyncio.wait_for(stream.aclose(), 5)
            except Exception as error:
                receipt['stream_close_error_type'] = type(error).__name__
                if failure is None:
                    failure = error
            receipt['status'] = 'failed-or-uncertain' if failure else 'diagnostic-returned-and-stopped'
            save()
            if failure is not None and sys.exception() is None:
                raise failure


def execute(plan_path, approved_sha256, approved_dollars):
    if type(approved_dollars) not in (int, float) or approved_dollars != 1:
        raise ValueError('Fresh exact $1 operational approval required')
    plan, raw = load_json(_no_links(plan_path), 65536)
    if sha(raw) != approved_sha256 or plan != prepare():
        raise ValueError('Approved plan/source/config changed')
    path = _no_links(DATA_ROOT/'scan-source-v1/trajectory/lowres_wide.traj')
    with path.open('rb') as handle:
        data = handle.read(2*1024**2+1)
    if (len(data) != plan['trajectory']['bytes'] or len(data) > 2*1024**2
            or sha(data) != plan['trajectory']['sha256']):
        raise ValueError('Trajectory input changed')
    output = _no_links(DATA_ROOT/'scan-correspondence-modal-v1')
    output.mkdir(exist_ok=False)
    receipt = {'status': 'reserved-before-build', 'plan_sha256': sha(raw), 'approved_dollars': approved_dollars,
        'created_at': datetime.now(timezone.utc).isoformat(), 'app_id': None, 'source_admitted': False}
    def save():
        (output/'receipt.json').write_bytes(encoded(receipt))
    save()
    app = None
    try:
        with (output/'plan.json').open('xb') as handle:
            handle.write(raw)
        code = output/'code'
        code.mkdir()
        for name in CODE:
            source = (ROOT/name).read_bytes()
            if sha(source) != plan['implementation_sha256'][name]:
                raise ValueError('Implementation changed before submission')
            (code/name).write_bytes(source)
        app, fn = create()
        asyncio.run(run(app, fn, data, plan, output, receipt, save))
    except BaseException as error:
        receipt.update(status='failed-or-uncertain', error_type=type(error).__name__)
        if app is not None and 'cleanup' not in receipt:
            receipt['app_id'] = app.app_id
            try:
                receipt['cleanup'] = stop_app(app.app_id)
            except Exception as cleanup_error:
                receipt['cleanup'] = {'state': 'unconfirmed', 'error_type': type(cleanup_error).__name__}
        save()
        raise
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--approved-plan-sha256')
    parser.add_argument('--approved-dollars', type=float)
    parser.add_argument('--confirm-billable', action='store_true')
    args = parser.parse_args()
    if args.confirm_billable:
        if not args.approved_plan_sha256:
            parser.error('Exact reviewed plan SHA-256 required')
        print(json.dumps(execute(args.plan, args.approved_plan_sha256, args.approved_dollars)))
    else:
        if args.approved_plan_sha256 or args.approved_dollars is not None:
            parser.error('Offline planning takes only --plan')
        raw = encoded(prepare())
        with _no_links(args.plan).open('xb') as handle:
            handle.write(raw)
        print(json.dumps({'status': 'offline-plan-only', 'plan_sha256': sha(raw)}))
