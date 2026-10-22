"""Offline WorldMirror plan or one newly approved cloud attempt; no implicit retries."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile

if __name__ == '__main__' and sys.flags.isolated:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from pilot import encoded, load_json, sha
from worldmirror_transfer_probe import stop_app
from worldmirror_transport import receive_bundle

ROOT = Path(__file__).resolve().parent
RESOURCES = {'gpu': 'A100-40GB', 'cpu': 4, 'memory_mib': 32768, 'timeout_seconds': 600,
             'client_timeout_seconds': 630, 'retries': 0, 'max_containers': 1, 'scaledown_seconds': 2,
             'block_network': True, 'restrict_modal_access': True, 'single_use_containers': True, 'region': 'us-east', 'build_cpu': 2, 'build_memory_mib': 8192,
             'build_timeout_seconds': 900, 'operational_allowance_usd': 3,
             'provider_enforced_dollar_cap': False}
DEPENDENCIES = ['torch==2.7.1', 'torchvision==0.22.1', 'numpy==1.26.4', 'Pillow==11.3.0',
    'huggingface-hub==0.28.1', 'safetensors==0.5.3', 'opencv-python-headless==4.10.0.84',
    'omegaconf==2.3.0', 'tqdm==4.67.1', 'einops==0.8.1', 'scipy==1.14.1', 'matplotlib==3.10.3',
    'plyfile==1.1.2', 'trimesh==4.6.8', 'requests==2.32.3', 'gsplat==1.5.3', 'ninja==1.11.1.3',
    'jaxtyping==0.3.2', 'rich==13.9.4', 'setuptools==75.8.0', 'wheel==0.45.1']
FLASH_WHEEL = ('https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/'
    'flash_attn-2.8.3%2Bcu12torch2.7cxx11abiTRUE-cp311-cp311-linux_x86_64.whl'
    '#sha256=cd1a45ebfc1731a13e55ad68e0c9ad92390ddfffba306f9222be67c6d5a805af')
WORKER_FILES = ['worldmirror_worker.py', 'worldmirror_adapter.py', 'worldmirror_transport.py', 'inference.py', 'geometry.py']


def prepare(request_path):
    from worldmirror_worker import prepare as prepare_images, CHECKPOINT_REVISION, WORLDMIRROR_SOURCE_REVISION, MODEL_FILES
    request_path = Path(request_path).resolve()
    request, raw = load_json(request_path, 64*1024**2)
    with tempfile.TemporaryDirectory(prefix='eva-worldmirror-plan-') as temp:
        prepared = prepare_images(request, Path(temp))
    files = WORKER_FILES+['worldmirror_cloud.py', 'worldmirror_remote.py', 'worldmirror_candidate.py',
                          'complete_candidate.py', 'review_result.py', 'pilot.py', 'worldmirror_transfer_probe.py']
    return {'version': 1, 'kind': 'eva-worldmirror-cloud-plan-v1', 'execution_authorized': False,
            'request_path': str(request_path), 'request_sha256': sha(raw),
            'originals': [{k: image[k] for k in ('id', 'sha256')} for image in request['images']],
            'normalization': prepared['normalization'], 'preprocessing': prepared['preprocessing'],
            'source_revision': WORLDMIRROR_SOURCE_REVISION, 'checkpoint_revision': CHECKPOINT_REVISION,
            'checkpoint_files': {k: list(v) for k, v in MODEL_FILES.items()},
            'implementation_sha256': {name: sha((ROOT/name).read_bytes()) for name in files},
            'cloud_sdk': 'modal==1.6.1', 'python_version': '3.11.15', 'dependencies': DEPENDENCIES,
            'flash_attention_wheel': FLASH_WHEEL, 'resources': RESOURCES,
            'license_url': 'https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/'+WORLDMIRROR_SOURCE_REVISION+'/License.txt',
            'estimate': {'currency': 'USD', 'gpu_compute_window_base_rate': .424,
                         'cpu_build_window_base_rate': .040, 'region_multiplier_upper_assumption': 1.75,
                         'source': 'https://modal.com/pricing', 'checked_date': '2026-10-20'},
            'limitations': ['One attempt on this photo set only; no SAM 3D, second room or automatic retries.',
                'No local GPU, checkpoint download or cloud activity during plan preparation.',
                'Owner must separately accept the model license and eligibility restrictions before execution.',
                'Build and runtime compatibility unverified; an unsuccessful attempt may still be billed.',
                'Modal may restart a preempted GPU input despite no configured retries; one submission does not guarantee one inference execution.',
                'Results use bounded 1 MiB generator chunks and owned-app cancellation, verified by a 4 MiB CPU probe; actual GPU output remains unverified.',
                'Experimental CBOR results reduce pickle exposure; SDK startup exceptions may still deserialize pickle and require dependency trust.',
                'Approval flags are operator attestations, not identity authentication; explicit scoped owner approval is still required.',
                'Top-level packages and FlashAttention wheel are pinned; transitive resolution is recorded during build, not fully locked.',
                'CPU build and GPU function have timeouts; allowance is operational, not a provider-enforced dollar cap.',
                'US East selected; region premiums, startup and image infrastructure can add cost.',
                'Raw results are unscaled estimates; conversion or quality review may reject them.']}


def create_app(plan):
    import importlib.metadata
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    import modal
    from worldmirror_remote import build, capture
    image = modal.Image.debian_slim(python_version=plan['python_version']).env({
        'PYTHONDONTWRITEBYTECODE': '1', 'HF_HUB_DISABLE_TELEMETRY': '1', 'DO_NOT_TRACK': '1'})
    for name in WORKER_FILES:
        image = image.add_local_file(ROOT/name, '/opt/eva-worldmirror/'+name, copy=True)
    recipe = {k: plan[k] for k in ('source_revision', 'checkpoint_revision', 'dependencies', 'flash_attention_wheel')}
    recipe['build_timeout_seconds'] = RESOURCES['build_timeout_seconds']
    image = image.run_function(build, kwargs={'recipe': recipe}, cpu=RESOURCES['build_cpu'],
        memory=RESOURCES['build_memory_mib'], timeout=RESOURCES['build_timeout_seconds'], region=RESOURCES['region'])
    image = image.env({'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1'})
    app = modal.App('eva-worldmirror-pilot')
    app.function(name='capture', image=image, gpu=RESOURCES['gpu'], cpu=RESOURCES['cpu'], memory=RESOURCES['memory_mib'],
        timeout=RESOURCES['timeout_seconds'], max_containers=1, scaledown_window=2,
        block_network=True, restrict_modal_access=True, _experimental_restrict_output=True,
        single_use_containers=True, region=RESOURCES['region'], secrets=[])(capture)
    return app


async def run(app, request, output, receipt, save):
    async with app.run.aio(detach=False):
        owned_app_id = app.app_id
        receipt.update(status='app-running', modal_app_id=owned_app_id)
        stream, failure = None, None
        try:
            save()
            stream = app.registered_functions['capture'].remote_gen.aio(request)
            receipt['status'] = 'submitted'; save()
            await asyncio.wait_for(receive_bundle(stream, output, receipt, save), RESOURCES['client_timeout_seconds'])
        except BaseException as error:
            failure = error
            raise
        finally:
            # Stop only the local app, before iterator close/context exit, even on cancellation.
            try:
                receipt['cleanup'] = stop_app(owned_app_id)
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
            save()
            if failure is not None and sys.exception() is None:
                raise failure


def execute(plan_path, approved_plan_sha256, output, *, license_acknowledged=False, approved_dollars=None):
    if license_acknowledged is not True:
        raise ValueError('Explicit owner license acknowledgement is required')
    if type(approved_dollars) not in (int, float) or approved_dollars != RESOURCES['operational_allowance_usd']:
        raise ValueError('A fresh exact $3 operational budget approval is required')
    plan_path, output = Path(plan_path).resolve(), Path(output).resolve()
    plan, raw_plan = load_json(plan_path, 1024**2)
    receipt_path = Path(plan['request_path']).resolve().with_suffix('.worldmirror-receipt.json')
    if output.exists() or output.is_symlink() or receipt_path.exists() or output in (plan_path, receipt_path):
        raise ValueError('Existing output/attempt; inspect instead of retrying')
    if sha(raw_plan) != approved_plan_sha256 or plan != prepare(plan['request_path']):
        raise ValueError('Reviewed plan/request/code/config changed')
    request, raw = load_json(plan['request_path'], 64*1024**2)
    if sha(raw) != plan['request_sha256']:
        raise ValueError('Request changed during validation')
    receipt = {'version': 1, 'status': 'reserved-before-build', 'created_at': datetime.now(timezone.utc).isoformat(),
               'plan_sha256': sha(raw_plan), 'request_sha256': sha(raw), 'approved_dollars': approved_dollars,
               'license_acknowledged': True, 'modal_app_id': None, 'modal_call_id': None, 'retry_policy': 'none'}
    with receipt_path.open('xb') as file:
        file.write(encoded(receipt))

    def save():
        receipt_path.write_bytes(encoded(receipt))

    try:
        app = create_app(plan)
        asyncio.run(run(app, request, output, receipt, save))
        # Retain bounded paid evidence even if decoding/admission fails; never promote it implicitly.
        from worldmirror_candidate import _admit_raw
        _admit_raw(output, request)
        receipt.update(status='captured', artifact_status='admitted'); save()
        return receipt
    except BaseException as error:
        receipt.update(status='failed-or-uncertain', error_type=type(error).__name__); save()
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--approved-plan-sha256')
    parser.add_argument('--confirm-billable', action='store_true')
    parser.add_argument('--acknowledge-model-license', action='store_true')
    parser.add_argument('--approved-dollars', type=float)
    args = parser.parse_args()
    if args.confirm_billable:
        if args.request or not args.output or not args.approved_plan_sha256:
            parser.error('Execution requires reviewed plan hash and fresh output')
        result = execute(args.plan, args.approved_plan_sha256, args.output,
                         license_acknowledged=args.acknowledge_model_license, approved_dollars=args.approved_dollars)
        print(json.dumps({'status': result['status'], 'fields_sha256': result['fields_sha256']}))
    else:
        if not args.request or args.output or args.approved_plan_sha256 or args.acknowledge_model_license or args.approved_dollars is not None:
            parser.error('Offline planning accepts only request and fresh plan path')
        plan = prepare(args.request)
        with args.plan.open('xb') as file:
            file.write(encoded(plan))
        print(json.dumps({'status': 'offline-plan-only', 'plan_sha256': sha(args.plan.read_bytes())}))
