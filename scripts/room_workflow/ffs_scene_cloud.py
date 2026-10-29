"""Offline plan and separately approved one-attempt Modal CPU reduction of FFS scene th_0028's colour scan."""
import argparse
import asyncio
from datetime import datetime, timezone
import importlib.metadata
import json
from pathlib import Path
import re
import sys
import zipfile

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from ffs_fetch import LICENSE, RECORDS, RangeFile, member_range
from pilot import encoded, load_json, sha
from scan_correspondence_cloud import _no_links, _object
from worldmirror_transfer_probe import stop_app

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parents[1]/'.local/reconstruction/ffs-th0028-scene-v2'
RECORD, MEMBER = '17164106', 'th_0021-0040/scan/th_0028/th_0028_coul.las'
MAX_POINTS = 2_000_000
MAX_PLY = MAX_POINTS*15 + 512
PACKAGES = ('numpy==2.2.6', 'laspy==2.7.0')
RESOURCES = {'gpu': None, 'cpu': 2, 'memory_mib': 16384, 'timeout_seconds': 900,
    'startup_timeout_seconds': 300, 'client_timeout_seconds': 1500, 'max_containers': 1,
    'retries': 0, 'region': 'us-east', 'operational_allowance_usd': 1,
    'provider_enforced_dollar_cap': False}
CODE = ('ffs_fetch.py', 'ffs_scene.py', 'ffs_scene_cloud.py', 'pilot.py', 'scan_correspondence_cloud.py',
        'worldmirror_transfer_probe.py')


def prepare():
    # Reads Zenodo metadata, the zip's central directory and one local header: kilobytes, no scan bytes.
    import urllib.request
    with urllib.request.urlopen(f'https://zenodo.org/api/records/{RECORD}', timeout=60) as response:
        meta = json.load(response)
    entry = next(f for f in meta['files'] if f['key'] == RECORDS[RECORD])
    if meta['metadata']['license']['id'] != LICENSE.lower():
        raise ValueError('Record licence changed; review before acquiring')
    url = f'https://zenodo.org/api/records/{RECORD}/files/{entry["key"]}/content'
    remote = RangeFile(url, entry['size'], budget=16*1024**2)
    with zipfile.ZipFile(remote) as archive:
        info = archive.getinfo(MEMBER)
        start, end = member_range(remote, info)
    member = {'name': MEMBER, 'url': url, 'archive_bytes': entry['size'], 'archive_md5': entry['checksum'],
        'start': start, 'end': end, 'bytes': info.file_size, 'crc32': info.CRC, 'max_points': MAX_POINTS}
    return {'kind': 'eva-ffs-scene-cloud-plan-v1', 'execution_authorized': False, 'scene': 'th_0028',
        'dataset': 'Fictional Forensic Scenes, doi:10.1016/j.dib.2026.112825', 'license': LICENSE,
        'record': RECORD, 'member': member, 'packages': list(PACKAGES),
        'implementation_sha256': {name: sha((ROOT/name).read_bytes()) for name in CODE},
        'sdk': 'modal==1.6.1', 'python_version': '3.12.12', 'resources': RESOURCES.copy(),
        'scope': 'One container streams one 1.14 GB scan member from Zenodo, voxel-averages it to at most '
                 f'{MAX_POINTS:,} points and returns one PLY plus a report. Nothing persists on Modal.',
        'limitations': ['New explicit approval of this exact plan and $1 operational allowance required.',
            'No provider-enforced dollar cap; image build/startup can add charges.',
            'Runtime network is required to reach Zenodo; no secrets, GPU, models or persistent volumes.',
            'One submission; no configured retries. Provider restarts are not an exactly-once guarantee.',
            'Display reduction only: no registration, cleaning, evidence detection or source admission.']}


def create():
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    import modal
    from ffs_scene import reduce_scene
    image = (modal.Image.debian_slim(python_version='3.12.12').pip_install(*PACKAGES)
             .add_local_python_source('ffs_fetch', 'ffs_scene'))
    app = modal.App('eva-ffs-scene')
    fn = app.function(image=image, cpu=(2, 2), memory=(16384, 16384), timeout=900,
        startup_timeout=300, max_containers=1, scaledown_window=2, region='us-east',
        restrict_modal_access=True, single_use_containers=True, secrets=[], name='reduce')(reduce_scene)
    return app, fn


async def receive(stream, plan, output):
    size, report = 0, None
    with (output/'scene.ply').open('xb') as handle:
        async for record in stream:
            if report is not None or type(record) not in (tuple, list) or len(record) != 2:
                raise ValueError('Unexpected record after the report')
            kind, payload = record
            if kind == 'chunk' and type(payload) is bytes and 0 < len(payload) and size + len(payload) <= MAX_PLY:
                handle.write(payload); size += len(payload)
            elif kind == 'report' and type(payload) is str and len(payload) <= 65536:
                (output/'returned-report.json').write_text(payload, encoding='utf-8')
                report = json.loads(payload, object_pairs_hook=_object)
            else:
                raise ValueError('Invalid or oversized returned record')
    if report is None:
        raise ValueError('Missing reduction report')
    json.dumps(report, allow_nan=False)
    ply = (output/'scene.ply').read_bytes()
    header = ply[:512].split(b'end_header\n', 1)[0].decode('ascii')
    declared = int(re.search(r'element vertex (\d+)', header).group(1))
    if (report.get('kind') != 'eva-ffs-scene-reduction-v1' or report.get('member') != plan['member']['name']
            or report.get('streamed_bytes') != plan['member']['bytes'] or report.get('ply_bytes') != size
            or report.get('ply_sha256') != sha(ply) or report.get('points') != declared
            or not 0 < declared <= MAX_POINTS or len(header) + 11 + declared*15 != size):
        raise ValueError('Returned scene does not match its report or the plan')
    return report


async def run(app, fn, plan, output, receipt, save):
    async with app.run.aio(detach=False):
        owned_id = app.app_id
        receipt.update(status='running', app_id=owned_id)
        stream, failure = None, None
        try:
            save()
            stream = fn.remote_gen.aio(plan['member'])
            receipt['status'] = 'submitted'; save()
            receipt['report'] = await asyncio.wait_for(receive(stream, plan, output), RESOURCES['client_timeout_seconds'])
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
            receipt['status'] = 'failed-or-uncertain' if failure else 'scene-returned-and-stopped'
            save()
            if failure is not None and sys.exception() is None:
                raise failure


def execute(plan_path, approved_sha256, approved_dollars):
    if type(approved_dollars) not in (int, float) or approved_dollars != 1:
        raise ValueError('Fresh exact $1 operational approval required')
    plan, raw = load_json(_no_links(plan_path), 65536)
    if sha(raw) != approved_sha256 or plan != prepare():
        raise ValueError('Approved plan/source/config changed')
    output = _no_links(OUTPUT)
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
        app, fn = create()
        asyncio.run(run(app, fn, plan, output, receipt, save))
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
