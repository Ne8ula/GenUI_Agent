"""Offline plan or one explicitly approved object-suggestion cloud attempt.

No app is constructed on import. A receipt is reserved before any billable build.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile

from pilot import encoded, load_json, sha

ROOT = Path(__file__).parent
RESOURCES = {"gpu": "A100-40GB", "cpu": 4, "memory_mib": 16384,
             "timeout_seconds": 600, "client_timeout_seconds": 630,
             "retries": 0, "max_containers": 1, "scaledown_seconds": 2,
             "build_startup_dollar_cap": None}


def prepare(request_path):
    import object_suggestions as worker
    request_path = Path(request_path).resolve()
    request, raw = load_json(request_path, 150*1024**2)
    sources = worker.validate_request(request)
    # Fully decode before proposing a billable attempt.
    with tempfile.TemporaryDirectory(prefix="eva-object-preflight-") as directory:
        images, _, metadata = worker._decode_images(request["images"], Path(directory))
        pixel_hashes = [sha(encoded(list(image.shape))+image.tobytes()) for image in images]
        if len(set(pixel_hashes)) != len(images):
            raise ValueError("Duplicate normalized photo pixels")
    return {"version": 1, "kind": "eva-object-suggestions-plan-v1",
            "request_path": str(request_path), "request_sha256": sha(raw),
            "sources": sources, "normalization": metadata, "models": worker.MODELS,
            "policy": worker.POLICY, "model_config_sha256": worker.configuration_sha(),
            "resources": RESOURCES,
            "limitations": ["Visible regions only; no complete-object generation or room accuracy claim.",
                           "No automatic retry; build/startup cost is additional to the function limit.",
                           "SAM 3D weights are not acquired or used.",
                           "Operator CLI pilot; upload UI does not yet launch this stage."]}


def create_app():
    import modal
    from object_worker import remote_worker
    models = json.loads((ROOT/"object-models.json").read_text(encoding="utf-8-sig"))
    image = (modal.Image.debian_slim(python_version="3.11").apt_install("git")
             .pip_install_from_requirements(str(ROOT/"requirements-cloud.txt"))
             .pip_install_from_requirements(str(ROOT/"requirements-objects.txt"))
             .env({"SAM2_BUILD_CUDA": "0", "HF_HUB_DISABLE_TELEMETRY": "1"})
             .pip_install("git+https://github.com/facebookresearch/sam2.git@"+models["sam2_source_revision"],
                          extra_options="--no-deps --no-build-isolation")
             .add_local_dir(str(ROOT), remote_path="/opt/eva-objects"))
    app = modal.App("eva-object-suggestions-pilot")
    app.function(name="suggest", image=image, gpu=RESOURCES["gpu"], cpu=RESOURCES["cpu"],
                 memory=RESOURCES["memory_mib"], timeout=RESOURCES["timeout_seconds"],
                 retries=0, max_containers=1, scaledown_window=2)(remote_worker)
    return app


def execute(plan_path, approved_plan_sha256, output_path):
    import object_suggestions as worker
    plan_path, output_path = Path(plan_path).resolve(), Path(output_path).resolve()
    receipt_path = plan_path.with_suffix(".receipt.json")
    if output_path.exists() or receipt_path.exists() or output_path in (plan_path, receipt_path):
        raise ValueError("Existing output/attempt; inspect instead of retrying")
    plan, raw_plan = load_json(plan_path, 1024**2)
    if sha(raw_plan) != approved_plan_sha256 or plan != prepare(plan["request_path"]):
        raise ValueError("Reviewed plan/request/code/config changed")
    request, raw = load_json(plan["request_path"], 150*1024**2)
    if sha(raw) != plan["request_sha256"]:
        raise ValueError("Request changed during validation")
    receipt = {"version": 1, "status": "reserved-before-build",
               "created_at": datetime.now(timezone.utc).isoformat(),
               "plan_sha256": sha(raw_plan), "request_sha256": sha(raw),
               "modal_app_id": None, "modal_call_id": None, "retry_policy": "none"}
    with receipt_path.open("x", encoding="utf-8") as file:
        json.dump(receipt, file, indent=2)
    def save():
        receipt_path.write_bytes(encoded(receipt))
    call = None
    try:
        app = create_app()
        with app.run(detach=False):
            receipt.update(status="app-running", modal_app_id=app.app_id); save()
            call = app.registered_functions["suggest"].spawn(request)
            receipt.update(status="submitted", modal_call_id=call.object_id); save()
            try:
                result = call.get(timeout=RESOURCES["client_timeout_seconds"])
            except BaseException:
                try:
                    call.cancel(terminate_containers=True)
                    receipt["cancellation"] = "requested-before-context-exit"
                except Exception:
                    receipt["cancellation"] = "request-failed-inspect-provider"
                save()
                raise
            worker.validate_result(result, request)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with output_path.open("xb") as file:
                file.write(encoded(result))
            receipt.update(status="executed", result_sha256=sha(encoded(result))); save()
        receipt["cleanup"] = "ephemeral-context-exited"; save()
        return result
    except BaseException as error:
        if call is not None and "cancellation" not in receipt:
            try:
                call.cancel(terminate_containers=True)
                receipt["cancellation"] = "requested-inspect-provider"
            except Exception:
                receipt["cancellation"] = "request-failed-inspect-provider"
        receipt.update(status="failed-or-uncertain", error_type=type(error).__name__); save()
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--approved-plan-sha256")
    parser.add_argument("--confirm-billable", action="store_true")
    args = parser.parse_args()
    if args.confirm_billable:
        if args.request or not args.output or not args.approved_plan_sha256:
            parser.error("Execution requires reviewed plan hash and new output")
        execute(args.plan, args.approved_plan_sha256, args.output)
    else:
        if not args.request or args.output or args.approved_plan_sha256:
            parser.error("Offline plan accepts only request and new plan path")
        plan = prepare(args.request)
        args.plan.parent.mkdir(parents=True, exist_ok=True)
        with args.plan.open("xb") as file:
            file.write(encoded(plan))
        print(json.dumps({"status": "offline-plan-only", "plan_sha256": sha(args.plan.read_bytes())}))
