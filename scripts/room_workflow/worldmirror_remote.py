"""Cloud-only functions. Imported safely; no model or network activity on import."""
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def build(recipe):
    """One bounded CPU build; no GPU, private inputs, credentials or license bypass."""
    deadline = time.monotonic()+recipe['build_timeout_seconds']-15

    def command(*args):
        subprocess.run(args, check=True, timeout=max(1, deadline-time.monotonic()))

    command('apt-get', 'update')
    command('apt-get', 'install', '-y', '--no-install-recommends', 'git', 'ca-certificates')
    command(sys.executable, '-m', 'pip', 'install', *recipe['dependencies'])
    import torch
    if not torch._C._GLIBCXX_USE_CXX11_ABI:
        raise ValueError('Pinned FlashAttention wheel requires the CXX11 ABI; no automatic substitution')
    command(sys.executable, '-m', 'pip', 'install', '--no-deps', recipe['flash_attention_wheel'])
    source = '/opt/worldmirror'
    command('git', 'init', source)
    command('git', '-C', source, 'remote', 'add', 'origin', 'https://github.com/Tencent-Hunyuan/HY-World-2.0.git')
    command('git', '-C', source, 'fetch', '--depth=1', 'origin', recipe['source_revision'])
    command('git', '-C', source, 'checkout', '--detach', 'FETCH_HEAD')
    sys.path[:0] = ['/opt/eva-worldmirror', source]
    # Fail import/ABI problems before acquiring weights or reserving a GPU.
    from hyworld2.worldrecon.pipeline import WorldMirrorPipeline
    from huggingface_hub import snapshot_download
    from worldmirror_worker import verify_snapshot
    snapshot_download('tencent/HY-World-2.0', revision=recipe['checkpoint_revision'],
        allow_patterns=['HY-WorldMirror-2.0/config.json', 'HY-WorldMirror-2.0/model.safetensors'],
        local_dir='/opt/worldmirror-checkpoint', token=False)
    verify_snapshot('/opt/worldmirror-checkpoint')
    command('git', '-C', source, 'diff', '--exit-code')
    # Keep dependency resolution evidence in the image; top-level versions are pinned by the plan.
    completed = subprocess.run([sys.executable, '-m', 'pip', 'freeze'], check=True, capture_output=True,
                               timeout=max(1, deadline-time.monotonic()))
    Path('/opt/worldmirror-dependencies.txt').write_bytes(completed.stdout)


def capture(request):
    sys.path.insert(0, '/opt/eva-worldmirror')
    import torch
    from worldmirror_worker import execute
    from worldmirror_transport import stream_bundle
    if not torch.cuda.is_available():
        raise ValueError('Approved cloud CUDA device unavailable')
    torch.cuda.reset_peak_memory_stats()
    with tempfile.TemporaryDirectory(prefix='eva-worldmirror-') as temp:
        output = Path(temp)/'raw'
        execute(request, '/opt/worldmirror', '/opt/worldmirror-checkpoint', output)
        paths = [output/'manifest.json', output/'raw-fields.npz']
        if paths[0].stat().st_size > 128*1024 or paths[1].stat().st_size > 64*1024**2:
            raise ValueError('Raw response exceeds transfer budget')
        yield from stream_bundle({'manifest': paths[0].read_bytes(), 'fields': paths[1].read_bytes(),
                'device_name': torch.cuda.get_device_name(), 'peak_cuda_bytes': torch.cuda.max_memory_allocated(),
                'dependencies': Path('/opt/worldmirror-dependencies.txt').read_text()})
