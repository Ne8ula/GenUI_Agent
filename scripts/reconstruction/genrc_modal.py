"""Finite Modal jobs. Running smoke/generate is billable; import and --help are offline."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import uuid

from genrc_contract import GENRC_COMMIT, PYTORCH3D_COMMIT, ENCODER_COMMIT, MAX_BUNDLE_BYTES, write_json

HERE = Path(__file__).resolve().parent
MODEL_VOLUME = "eva-genrc-models-v1"
RESULT_VOLUME = "eva-genrc-results-v1"


def image_spec(modal):
    # Deliberately test the released legacy stack before attempting a port.
    # Source pins are immutable; CUDA registry tag/transitive wheels remain build inputs
    # whose resolved versions are captured by the smoke test and image build logs.
    return (modal.Image.from_registry("nvidia/cuda:11.7.1-devel-ubuntu22.04",add_python="3.10")
        .apt_install("git","build-essential","ninja-build","libgl1","libglib2.0-0","libgomp1","libegl1","libxrender1")
        .pip_install("numpy==1.24.2","setuptools==69.5.1","wheel==0.43.0")
        .pip_install("torch==1.13.1+cu117","torchvision==0.14.1+cu117",extra_index_url="https://download.pytorch.org/whl/cu117")
        .pip_install("fvcore==0.1.5.post20221221","iopath==0.1.10","ninja==1.11.1.1")
        .env({"FORCE_CUDA":"1","TORCH_CUDA_ARCH_LIST":"8.0", "MAX_JOBS":"4",
              "CC":"/usr/bin/gcc","CXX":"/usr/bin/g++","CUDAHOSTCXX":"/usr/bin/g++",
              "CUB_HOME":"/usr/local/cuda/include"})
        .run_commands("test -f /usr/local/cuda/include/cub/cub.cuh && /usr/bin/gcc --version && /usr/bin/g++ --version")
        .run_commands(f"git clone https://github.com/facebookresearch/pytorch3d.git /opt/pytorch3d && cd /opt/pytorch3d && git checkout {PYTORCH3D_COMMIT} && pip install --no-build-isolation --no-deps .")
        .add_local_file(HERE/"genrc-cloud-constraints.txt","/opt/genrc-cloud-constraints.txt",copy=True)
        .env({"PIP_CONSTRAINT":"/opt/genrc-cloud-constraints.txt"})
        .pip_install_from_requirements(str(HERE/"genrc-cloud-requirements-linux-py310.txt"),
            extra_index_url="https://download.pytorch.org/whl/cu117")
        .run_commands(f"git clone https://github.com/minfenli/GenRC.git /opt/GenRC && cd /opt/GenRC && git checkout {GENRC_COMMIT}",
            f"git clone https://github.com/rwightman/gen-efficientnet-pytorch.git /opt/efficientnet && cd /opt/efficientnet && git checkout {ENCODER_COMMIT}",
            "pip check",
            "python -c \"import importlib.metadata as m; assert m.version('torch') == '1.13.1+cu117'; assert m.version('pytorch3d') == '0.7.2'; assert m.version('pyequilib') == '0.5.8'\"")
        .env({"HF_HUB_OFFLINE":"1","TRANSFORMERS_OFFLINE":"1"})
        .add_local_file(HERE/"genrc_contract.py","/root/genrc_contract.py")
        .add_local_file(HERE/"genrc_geometry.py","/root/genrc_geometry.py")
        .add_local_file(HERE/"genrc_worker.py","/root/genrc_worker.py"))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("stage",choices=["smoke","generate","upload-models","download"])
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--input",type=Path)
    p.add_argument("--models",type=Path)
    p.add_argument("--model-key")
    p.add_argument("--run-id")
    p.add_argument("--confirm-billable",action="store_true")
    p.add_argument("--dry-run",action="store_true",help="Validate job definition locally; do not build or contact Modal")
    a = p.parse_args(argv)
    if a.output.exists():
        p.error("Use a fresh output directory; existing results are never overwritten")
    payload = None
    if a.dry_run and a.stage not in ("smoke","generate"):
        p.error("--dry-run is only supported for compute job definitions")
    if a.stage in ("smoke","generate") and not (a.confirm_billable or a.dry_run):
        p.error("Cloud execution requires --confirm-billable; build/load/compute incur charges")
    if a.stage == "generate":
        if not a.input or a.input.stat().st_size > MAX_BUNDLE_BYTES or not a.model_key or not re.fullmatch(r"[0-9a-f]{64}",a.model_key):
            p.error("A bounded input.zip and verified 64-character --model-key are required")
        import tempfile
        from genrc_contract import unpack_bundle
        payload = a.input.read_bytes()
        with tempfile.TemporaryDirectory() as temp:
            unpack_bundle(payload,Path(temp)/"input")
    if a.stage == "upload-models":
        from genrc_contract import verify_models, sha256
        if not a.models:
            p.error("--models must point to a complete cache with models.json")
        verify_models(a.models)
        key = sha256(a.models/"models.json")
    if a.stage == "download" and (not a.run_id or not re.fullmatch(r"[0-9a-f]{32}",a.run_id)):
        p.error("A recorded 32-character --run-id is required")
    import modal  # no client required for geometry/preparation/tests/help
    a.output.mkdir(parents=True,exist_ok=False)
    if a.stage == "upload-models":
        volume = modal.Volume.from_name(MODEL_VOLUME,create_if_missing=True)
        with volume.batch_upload() as upload:
            upload.put_directory(a.models,"/"+key)
        write_json(a.output/"upload.json",{"model_key":key,"volume":MODEL_VOLUME})
        print("Verified model cache uploaded:",key)
        return
    if a.stage == "download":
        volume = modal.Volume.from_name(RESULT_VOLUME)
        with (a.output/"artifacts.zip").open("xb") as handle:
            for chunk in volume.read_file(a.run_id+"/artifacts.zip"):
                handle.write(chunk)
        print("Downloaded artifacts.zip; inspect result.json/failure.json inside")
        return
    app = modal.App("eva-genrc-pilot")
    image = image_spec(modal)
    result_volume = modal.Volume.from_name(RESULT_VOLUME,create_if_missing=True)
    volumes = {"/results":result_volume}
    if a.stage == "generate":
        volumes["/models"] = modal.Volume.from_name(MODEL_VOLUME)
    stage, model_key = a.stage, a.model_key
    run_id = uuid.uuid4().hex
    write_json(a.output/"submission.json",{"run_id":run_id,"stage":stage,"genrc_commit":GENRC_COMMIT,
        "input_sha256":hashlib.sha256(payload).hexdigest() if payload else None,"model_key":model_key,
        "gpu":"A100-40GB","timeout_seconds":300 if stage=="smoke" else 1800,
        "status":"not-yet-submitted","results_volume":RESULT_VOLUME})

    from genrc_worker import execute
    remote = app.function(image=image,gpu="A100-40GB",cpu=4,memory=32768,
                  timeout=300 if stage=="smoke" else 1800,startup_timeout=300,
                  max_containers=1,retries=0,single_use_containers=True,block_network=True,volumes=volumes)(execute)
    if a.dry_run:
        write_json(a.output/"dry-run.json",{"status":"definition-valid-not-submitted","stage":stage,
            "genrc_commit":GENRC_COMMIT,"pytorch3d_commit":PYTORCH3D_COMMIT,"encoder_commit":ENCODER_COMMIT,
            "gpu":"A100-40GB","cpu":4,"memory_mib":32768,"network_blocked":True,"automatic_retries":0})
        print("Job definition validated locally; no image build, upload or cloud execution")
        return

    try:
        with modal.enable_output(), app.run():
            call = remote.spawn(run_id,payload,stage,model_key)
            write_json(a.output/"submitted.json",{"run_id":run_id,"call_id":call.object_id,"app_id":app.app_id})
            try:
                result = call.get()
            except KeyboardInterrupt:
                call.cancel(terminate_containers=True)
                write_json(a.output/"cancelled.json",{"run_id":run_id,"status":"cancellation-requested"})
                raise
            write_json(a.output/"summary.json",result)
            with (a.output/"artifacts.zip").open("xb") as handle:
                for chunk in result_volume.read_file(run_id+"/artifacts.zip"):
                    handle.write(chunk)
    except BaseException as error:
        write_json(a.output/"client-failure.json",{"run_id":run_id,"error_type":type(error).__name__,
            "message":str(error),"status":"client-or-build-failure","app_id":app.app_id})
        raise
    print(json.dumps(result,indent=2))
    if result["status"] == "failed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
