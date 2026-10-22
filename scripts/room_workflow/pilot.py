"""Prepare or execute one reviewed, ephemeral RGB-only cloud analysis.

Planning is offline and never imports Modal/cloud or acquires weights.
Execution requires the saved plan, its exact request hash and explicit billable
confirmation. A receipt is reserved before image build; no retry is automatic.
"""
import argparse
from contextlib import contextmanager
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
PROFILE = ROOT / "research-profile.json"
SOURCE_NAMES = ("pilot.py", "cloud.py", "inference.py", "geometry.py", "prediction_fields.py", "requirements-cloud.txt")
ENV_NAMES = ("EVA_VGGT_SOURCE_REVISION", "EVA_VGGT_CHECKPOINT_REVISION",
             "EVA_VGGT_MODEL", "EVA_SAM2_SOURCE_REVISION", "EVA_SAM2_CHECKPOINT_REVISION")
RESOURCES = {"gpu": "A100-40GB", "cpu": 4, "memory_mib": 32768,
             "function_timeout_seconds": 600, "retries": 0, "max_containers": 1,
             "scaledown_window_seconds": 60, "deployment": "ephemeral-app-run",
             "build_startup_dollar_cap": None}
MAX_REQUEST = 150 * 1024**2
MAX_RESULT = 64 * 1024**2


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def load_json(path, limit):
    path = Path(path)
    if not path.is_file() or path.stat().st_size > limit:
        raise ValueError("Absent or oversized file: " + str(path))
    raw = path.read_bytes()
    if len(raw) > limit:
        raise ValueError("File exceeded its byte limit")
    def reject(value):
        raise ValueError("Nonfinite JSON constant: " + value)
    return json.loads(raw.decode("utf-8"), parse_constant=reject), raw


def prepare(request_path):
    """Read exact bytes and current code; no Modal import or network side effect."""
    from inference import validate_config, validate_payload
    request_path = Path(request_path).resolve()
    payload, request_bytes = load_json(request_path, MAX_REQUEST)
    validate_payload(payload)
    if payload["operation"] != "analyze":
        raise ValueError("This pilot supports RGB-only analyze, never comparison or generation")
    if set(payload) != {"version", "operation", "job_id", "images"}:
        raise ValueError("Pilot accepts original RGB images only; no masks, prompts or reference geometry")
    profile, profile_bytes = load_json(PROFILE, 65536)
    config = {key: profile[key] for key in
              ("vggt_source_revision", "vggt_checkpoint_revision", "vggt_model")}
    validate_config(config)
    return {
        "version": 1, "kind": "eva-room-rgb-only-pilot",
        "request_path": str(request_path), "request_sha256": sha(request_bytes),
        "job_id": payload["job_id"], "operation": "analyze",
        "images": [{"id": r["id"], "sha256": r["sha256"]} for r in payload["images"]],
        "config": config, "config_sha256": sha(encoded(config)),
        "profile_sha256": sha(profile_bytes),
        "source_sha256": {name: sha((ROOT / name).read_bytes()) for name in SOURCE_NAMES},
        "resources": dict(RESOURCES),
        "limitations": [
            "A-only estimated depth-grid geometry; Shado comparison remains pending.",
            "Boundary proposal is unconfirmed; no completed single-room claim.",
            "Weights download inside the 600-second call; cold acquisition can exhaust it.",
            "Build/startup and actual billed CPU/memory prevent a guaranteed dollar ceiling.",
            "No automatic retry; receipt must be inspected after an uncertain outcome.",
        ],
    }


@contextmanager
def isolated_model_environment(config):
    previous = {key: os.environ.get(key) for key in ENV_NAMES}
    try:
        for key in ENV_NAMES:
            os.environ.pop(key, None)
        # Import cloud with no pins so its module-level app remains None.
        yield lambda: os.environ.update({
            "EVA_VGGT_SOURCE_REVISION": config["vggt_source_revision"],
            "EVA_VGGT_CHECKPOINT_REVISION": config["vggt_checkpoint_revision"],
            "EVA_VGGT_MODEL": config["vggt_model"],
        })
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def create_reviewed_app(config):
    with isolated_model_environment(config) as set_pins:
        cloud = importlib.import_module("cloud")
        set_pins()
        if cloud.configuration() != config:
            raise ValueError("Cloud configuration differs from the reviewed plan")
        return cloud.create_app()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def execute(plan_path, approved_request_sha256, output_path):
    """Caller must already have obtained explicit billable authorization."""
    plan_path, output_path = Path(plan_path).resolve(), Path(output_path).resolve()
    receipt_path = plan_path.with_suffix(".receipt.json")
    if output_path in (plan_path, receipt_path):
        raise ValueError("Output must be separate from plan and receipt")
    if output_path.exists() or receipt_path.exists():
        raise ValueError("Output/receipt exists; inspect the previous attempt instead of retrying")
    plan, plan_bytes = load_json(plan_path, 1024**2)
    if not isinstance(plan, dict) or approved_request_sha256 != plan.get("request_sha256"):
        raise ValueError("Explicit approved request hash does not match the plan")
    current = prepare(plan.get("request_path", ""))
    if plan != current:
        raise ValueError("Request, source, profile or configuration changed; prepare a new plan for review")
    # Parse the exact bytes once more and bind what is sent, not just a prior read.
    payload, request_bytes = load_json(plan["request_path"], MAX_REQUEST)
    if sha(request_bytes) != approved_request_sha256:
        raise ValueError("Request changed during validation")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    receipt = {
        "version": 1, "status": "reserved-before-build", "created_at": utc_now(),
        "plan_sha256": sha(plan_bytes), "plan": plan,
        "output_path": str(output_path), "modal_app_id": None, "modal_call_id": None,
        "cleanup": "not-started", "retry_policy": "none; inspect this attempt before any new run",
    }
    with receipt_path.open("x", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2, allow_nan=False)

    def save():
        receipt["updated_at"] = utc_now()
        receipt_path.write_text(json.dumps(receipt, indent=2, allow_nan=False), encoding="utf-8")

    app, call = None, None
    try:
        # Receipt already exists before imports/build/network.
        app = create_reviewed_app(plan["config"])
        receipt["status"] = "starting-ephemeral-app"
        save()
        with app.run(detach=False):
            receipt.update({"modal_app_id": app.app_id, "status": "app-running"})
            save()
            try:
                call = app.registered_functions["run"].spawn(payload)
                receipt.update({"modal_call_id": call.object_id, "status": "submitted"})
                save()
                result = call.get()
                if (not isinstance(result, dict) or result.get("job_id") != plan["job_id"]
                        or result.get("version") != 1
                        or result.get("status") not in ("complete", "partial", "failed")):
                    raise ValueError("Worker returned an invalid result envelope")
                result_bytes = encoded(result)
                if len(result_bytes) > MAX_RESULT:
                    raise ValueError("Actual result exceeds 64 MiB; do not repeat inference")
                with output_path.open("xb") as handle:
                    handle.write(result_bytes)
                receipt.update({"status": result["status"], "result_sha256": sha(result_bytes),
                                "model_execution": result.get("model_execution", "unknown")})
                save()
            except BaseException:
                if call is not None:
                    try:
                        call.cancel(terminate_containers=True)
                        receipt["cancellation"] = "requested; remote termination not independently verified"
                    except Exception as cancel_error:
                        receipt["cancellation"] = "request-failed: " + type(cancel_error).__name__
                raise
        receipt["cleanup"] = "ephemeral-app-context-exited"
        save()
        return result
    except BaseException as error:
        receipt.update({"status": "interrupted" if isinstance(error, KeyboardInterrupt) else "failed-or-uncertain",
                        "error": {"type": type(error).__name__, "message": str(error)[:1000]},
                        "cleanup": "ephemeral-context-exit-attempted; inspect provider for uncertain work"})
        if app is not None:
            receipt["modal_app_id"] = app.app_id
        save()
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", type=Path, help="Original analyze JSON; used only to prepare a new plan")
    parser.add_argument("--plan", required=True, type=Path, help="New offline plan or existing reviewed plan")
    parser.add_argument("--output", type=Path, help="New result file, required for execution")
    parser.add_argument("--confirm-billable", action="store_true")
    parser.add_argument("--approved-request-sha256")
    args = parser.parse_args(argv)
    if not args.confirm_billable:
        if not args.request or args.output or args.approved_request_sha256:
            parser.error("Offline planning requires --request and --plan only")
        plan = prepare(args.request)
        args.plan.parent.mkdir(parents=True, exist_ok=True)
        with args.plan.open("x", encoding="utf-8") as handle:
            json.dump(plan, handle, indent=2, allow_nan=False)
        print(json.dumps({"status": "offline-plan-only", "plan": str(args.plan.resolve()),
                          "request_sha256": plan["request_sha256"]}))
        return 0
    if args.request or not args.output or not args.approved_request_sha256:
        parser.error("Execution requires --plan, --output, --confirm-billable and --approved-request-sha256")
    result = execute(args.plan, args.approved_request_sha256, args.output)
    print(json.dumps({"status": result["status"], "model_execution": result.get("model_execution", "unknown"),
                      "output": str(args.output.resolve())}))
    return 0 if result["status"] == "complete" and result.get("model_execution") == "executed" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
