"""Offline plan and explicit one-call Modal runner for pinned LoFTR.

No Modal import/build/acquisition occurs before execute() reserves a receipt.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

import learned_matcher as matcher
from pilot import encoded, load_json, sha

ROOT = Path(__file__).resolve().parent
SOURCE_NAMES = ("learned_matcher.py", "learned_matcher_pilot.py", "inference.py",
                "geometry.py", "prediction_fields.py", "requirements-cloud.txt", "pilot.py",
                "learned_matcher_tracks.py", "refine_arkit_bundle.py", "learned_matcher_worker.py")
WHEELS = [
    "https://files.pythonhosted.org/packages/58/26/9e6fad0f5e8c25b19e3c25fd0efa0817b9e1a3d9670df8454162e053f283/kornia-0.7.3-py2.py3-none-any.whl#sha256="+matcher.PINS["implementation_wheel_sha256"],
    "https://files.pythonhosted.org/packages/1c/5a/5969a793c1b2b0d9027b2f813ecadb568be3d319abe299df4f8e47ec7707/kornia_rs-0.1.9-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl#sha256="+matcher.PINS["kornia_rs_cp311_linux_wheel_sha256"],
]
RESOURCES = {"gpu": "A100-40GB", "cpu": 4, "memory_mib": 16384, "timeout_seconds": 180,
             "retries": 0, "max_containers": 1, "scaledown_seconds": 2,
             "startup_timeout_seconds": 60, "client_get_timeout_seconds": 240,
             "retry_meaning": "No application/input retries; Modal can reschedule crashed containers until client cancellation",
             "ephemeral": True, "build_startup_dollar_cap": None}
NOTICES = matcher.license_notice_urls()


def prepare(request_path):
    path = Path(request_path).resolve()
    request, raw = load_json(path, matcher.POLICY["maximum_input_json_bytes"])
    originals = matcher.validate_request(request)
    preprocessing = [matcher.prepare_image(record)[1] for record in originals]
    from learned_matcher_tracks import POLICY as track_policy
    return {"version": 1, "kind": "eva-loftr-original-only-pilot", "request_path": str(path),
            "request_sha256": sha(raw), "request_canonical_sha256": sha(encoded(request)),
            "original_input_hashes": [{"id": x["id"], "sha256": x["sha256"]} for x in originals],
            "preprocessing": preprocessing,
            "proposal": matcher.proposal(), "resources": RESOURCES, "wheels": WHEELS,
            "downstream_policy": track_policy,
            "notices": NOTICES,
            "source_sha256": {name: sha((ROOT/name).read_bytes()) for name in SOURCE_NAMES}}


def create_app():
    import modal
    from learned_matcher_worker import remote_worker
    # Same base/apt/requirements sequence reuses the successful Torch image layers.
    image = (modal.Image.debian_slim(python_version="3.11").apt_install("git")
             .pip_install_from_requirements(str(ROOT/"requirements-cloud.txt"))
             .pip_install(*WHEELS, extra_options="--no-deps")
             .add_local_dir(str(ROOT), remote_path="/opt/eva-matcher"))
    app = modal.App("eva-loftr-original-only-pilot")
    app.function(name="match", image=image, gpu="A100-40GB", cpu=4, memory=16384,
                 timeout=180, startup_timeout=60, retries=0, max_containers=1, scaledown_window=2)(remote_worker)
    return app


def execute(plan_path, approved_request_sha256, output_path):
    plan_path, output_path = Path(plan_path).resolve(), Path(output_path).resolve()
    receipt_path = plan_path.with_suffix(".receipt.json")
    if output_path.exists() or receipt_path.exists() or output_path in (plan_path, receipt_path):
        raise ValueError("Existing output/attempt; inspect instead of retrying")
    plan, raw_plan = load_json(plan_path, 1024**2)
    if approved_request_sha256 != plan.get("request_sha256") or plan != prepare(plan["request_path"]):
        raise ValueError("Reviewed request/code/configuration changed")
    payload, raw = load_json(plan["request_path"], matcher.POLICY["maximum_input_json_bytes"])
    if sha(raw) != approved_request_sha256:
        raise ValueError("Request changed during validation")
    receipt = {"version": 1, "status": "reserved-before-build", "plan_sha256": sha(raw_plan),
               "created_at": datetime.now(timezone.utc).isoformat(), "plan": plan,
               "retry_policy": "none", "modal_app_id": None, "modal_call_id": None}
    with receipt_path.open("x", encoding="utf-8") as file:
        json.dump(receipt, file, indent=2)
    def save():
        receipt_path.write_text(json.dumps(receipt, indent=2, allow_nan=False), encoding="utf-8")
    call = None
    try:
        app = create_app()
        with app.run(detach=False):
            receipt.update(status="app-running", modal_app_id=app.app_id); save()
            call = app.registered_functions["match"].spawn(payload)
            receipt.update(status="submitted", modal_call_id=call.object_id); save()
            try:
                response = call.get(timeout=RESOURCES["client_get_timeout_seconds"])
            except BaseException:
                # Cancel before app.run teardown, so hydration rescheduling is
                # stopped promptly even when no user function ever entered.
                try:
                    call.cancel(terminate_containers=True)
                    receipt["cancellation"] = "requested before context exit; inspect provider state"
                except Exception:
                    receipt["cancellation"] = "request-failed before context exit; inspect provider state"
                save()
                raise
            if not isinstance(response, dict) or set(response) != {"artifact", "acquisition"}:
                raise ValueError("Invalid matching response")
            matcher.validate_result(response["artifact"], payload)
            result_bytes = encoded(response)
            if len(result_bytes) > matcher.POLICY["maximum_output_bytes"]+100000:
                raise ValueError("Oversized matching response")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with output_path.open("xb") as file:
                file.write(result_bytes)
            receipt.update(status="executed", result_sha256=sha(result_bytes)); save()
        receipt["cleanup"] = "ephemeral-app-context-exited"; save()
        return response
    except BaseException as error:
        if call is not None and "cancellation" not in receipt:
            try:
                call.cancel(terminate_containers=True)
                receipt["cancellation"] = "requested; inspect provider state"
            except Exception:
                receipt["cancellation"] = "request-failed; inspect provider state"
        receipt.update(status="failed-or-uncertain", error_type=type(error).__name__); save()
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--approved-request-sha256")
    parser.add_argument("--confirm-billable", action="store_true")
    args = parser.parse_args()
    if args.confirm_billable:
        if not args.output or not args.approved_request_sha256 or args.request:
            parser.error("Execution requires reviewed --plan, --output and --approved-request-sha256")
        execute(args.plan, args.approved_request_sha256, args.output)
    else:
        if not args.request or args.output or args.approved_request_sha256:
            parser.error("Offline plan requires --request and --plan only")
        value = prepare(args.request)
        args.plan.parent.mkdir(parents=True, exist_ok=True)
        with args.plan.open("x", encoding="utf-8") as file:
            json.dump(value, file, indent=2, allow_nan=False)
        print(json.dumps({"status": "offline-plan-only", "request_sha256": value["request_sha256"]}))
