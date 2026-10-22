"""Deployment definition; no deployment, build or invocation happens on import.

Operator pins:
  EVA_VGGT_SOURCE_REVISION, EVA_VGGT_CHECKPOINT_REVISION (required 40 hex)
  EVA_SAM2_SOURCE_REVISION, EVA_SAM2_CHECKPOINT_REVISION (optional pair)
Optional EVA_VGGT_MODEL selects one of the two official checkpoint families.
Run `modal deploy scripts/room_workflow/cloud.py` only within approved scope.
Image build is billable activity and is not performed by tests.
"""
import os
import json
from pathlib import Path


def run_worker(payload):
    """Module-level worker avoids serializing client Python bytecode."""
    import sys
    sys.path.insert(0, "/opt/eva-room")
    from inference import execute
    # This image environment is operator configuration, never uploaded content.
    config = json.loads(os.environ["EVA_ROOM_WORKER_CONFIG"])
    return execute(payload, config)


def configuration():
    config = {key: os.environ[name] for key, name in (
        ("vggt_source_revision", "EVA_VGGT_SOURCE_REVISION"),
        ("vggt_checkpoint_revision", "EVA_VGGT_CHECKPOINT_REVISION"),
        ("vggt_model", "EVA_VGGT_MODEL"),
        ("sam2_source_revision", "EVA_SAM2_SOURCE_REVISION"),
        ("sam2_checkpoint_revision", "EVA_SAM2_CHECKPOINT_REVISION"),
    ) if name in os.environ}
    from inference import validate_config
    return validate_config(config)


def create_app():
    import modal
    config = configuration()
    root = Path(__file__).parent
    image = (modal.Image.debian_slim(python_version="3.11")
             .apt_install("git")
             .pip_install_from_requirements(str(root/"requirements-cloud.txt"))
             .pip_install("git+https://github.com/facebookresearch/vggt.git@"+config["vggt_source_revision"],
                          extra_options="--no-deps --no-build-isolation"))
    if "sam2_source_revision" in config:
        image = image.env({"SAM2_BUILD_CUDA": "0"}).pip_install(
            "git+https://github.com/facebookresearch/sam2.git@"+config["sam2_source_revision"],
            extra_options="--no-deps --no-build-isolation")
    image = image.env({"EVA_ROOM_WORKER_CONFIG": json.dumps(config, sort_keys=True)})
    image = image.add_local_dir(str(root), remote_path="/opt/eva-room")
    app = modal.App("eva-room-workflow")

    app.function(name="run", image=image, gpu="A100-40GB", cpu=4, memory=32768,
                 timeout=600, retries=0, max_containers=1, scaledown_window=60)(run_worker)
    return app


# Missing pins leave an importable, explicitly non-deployable module. Modal CLI
# needs both required variables; never substitute main/latest or a guessed hash.
app = create_app() if all(os.environ.get(name) for name in (
    "EVA_VGGT_SOURCE_REVISION", "EVA_VGGT_CHECKPOINT_REVISION")) else None


if __name__ == "__main__":
    configuration()
    raise SystemExit("Use Modal's deploy CLI after reviewing the pinned image and bounded allowance")
