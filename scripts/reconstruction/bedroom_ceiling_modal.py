"""One fixed-scope CPU Modal attempt for accepted external ceiling-depth inputs."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import re
import sys
import uuid
import zipfile

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from bedroom_ceiling_depth import (MAX_OUTPUT, ROI, SOURCE_SHA256, THRESHOLDS,
    admit, complete, digest, input_bytes, json_bytes, parse_json)

# Owner approved one UTF-8 retry on 2026-10-22; v1's failed receipt remains intact.
ATTEMPT_RECEIPT = Path("C:/Users/alexx/Documents/ClaudeAgent/GenUI_Agent/.local/reconstruction/teal-bedroom-ceiling-attempt-v2.json")
RESOURCES = {"cpu": 2, "memory": 4096, "timeout": 780, "startup_timeout": 120,
    "retries": 0, "max_containers": 1, "single_use_containers": True, "block_network": True}


def make_plan(payload, manifest):
    import genrc_modal
    inherited = Path(genrc_modal.__file__).parent
    sources = [HERE/"bedroom_ceiling_depth.py", HERE/"bedroom_ceiling_modal.py"]
    sources += [inherited/name for name in ("genrc_modal.py", "genrc_geometry.py", "genrc_worker.py", "genrc_contract.py",
        "genrc-cloud-constraints.txt", "genrc-cloud-requirements-linux-py310.txt")]
    sources.append(inherited.parent/"room_workflow/worldmirror_transfer_probe.py")
    return {"version": 1, "scope": "teal-bedroom-ceiling-attempt-v2", "max_attempts": 1,
        "fixed_attempt_receipt": str(ATTEMPT_RECEIPT), "source_mesh_sha256": SOURCE_SHA256, "roi": ROI,
        "input_sha256": digest(payload), "input_bytes": len(payload), "manifest": manifest,
        "resources": RESOURCES, "gpu_requested": False, "model_inference": False,
        "total_startup_plus_function_seconds": 900, "operational_ceiling_usd": 5,
        "thresholds": THRESHOLDS, "source_sha256": {p.name: digest(p.read_bytes()) for p in sources},
        "limitations": ["Existing GenRC image specification reused; a cache miss may build. Verify cache/budget before execution.",
            "No model volume, GPU, model inference or runtime download is requested.",
            "Resource deadlines do not impose a provider billing cap; external image-generation cost is separate."]}


def execute(run_id, payload, expected_hash):
    import modal
    if not re.fullmatch(r"[0-9a-f]{32}", run_id or "") or type(payload) is not bytes or digest(payload) != expected_hash:
        raise ValueError("Invalid owned run or input hash")
    volume = modal.Volume.from_name("eva-genrc-results-v1")
    root = Path("/results")/run_id
    root.mkdir(exist_ok=False)
    summary = {"run_id": run_id, "input_sha256": expected_hash, "status": "failed"}
    try:
        report = complete(payload, root/"candidate")
        summary.update(status=report["status"], faces=report["faces"])
    except Exception as error:
        summary.update(error_type=type(error).__name__, message=str(error))
    finally:
        (root/"summary.json").write_bytes(json_bytes(summary))
        volume.commit()
    paths = [p for p in root.rglob("*") if p.is_file()]
    if sum(p.stat().st_size for p in paths) > MAX_OUTPUT:
        raise ValueError("Output exceeds 32 MiB; partial evidence retained on result volume")
    archive = root/"artifacts.zip"
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as output:
        for path in sorted(paths):
            output.write(path, path.relative_to(root).as_posix())
    volume.commit()
    if archive.stat().st_size > MAX_OUTPUT:
        raise ValueError("ZIP output exceeds 32 MiB; retained on result volume")
    summary.update(artifact_bytes=archive.stat().st_size, artifact_sha256=digest(archive.read_bytes()))
    return parse_json(json_bytes(summary))


def create_job(modal):
    from genrc_modal import image_spec, RESULT_VOLUME
    image = image_spec(modal)
    for name in ("bedroom_ceiling_depth.py", "bedroom_ceiling_modal.py"):
        image = image.add_local_file(HERE/name, "/root/"+name)
    app = modal.App("eva-bedroom-ceiling-cpu")
    volume = modal.Volume.from_name(RESULT_VOLUME)
    fn = app.function(image=image, volumes={"/results": volume}, **RESOURCES)(execute)
    return app, fn, volume


def stop_owned_app(app_id):
    from genrc_modal import HERE as inherited
    path = str(inherited.parent/"room_workflow")
    sys.path.insert(0, path)
    try:
        from worldmirror_transfer_probe import stop_app
        return stop_app(app_id)
    finally:
        sys.path.remove(path)


def receive(chunks, target, receipt):
    size, sha = receipt.get("artifact_bytes"), receipt.get("artifact_sha256")
    if type(size) is not int or not 0 < size <= MAX_OUTPUT or type(sha) is not str or not re.fullmatch(r"[0-9a-f]{64}", sha):
        raise ValueError("Invalid returned artifact declaration")
    total, computed = 0, hashlib.sha256()
    with Path(target).open("xb") as handle:
        for chunk in chunks:
            if type(chunk) is not bytes or total+len(chunk) > size:
                raise ValueError("Oversized/malformed output; partial artifact retained")
            handle.write(chunk)
            computed.update(chunk)
            total += len(chunk)
    if total != size or computed.hexdigest() != sha:
        raise ValueError("Output hash/size mismatch; partial artifact retained")


def run(modal, payload, plan, output, receipt, save, stop=stop_owned_app):
    app, fn, volume = create_job(modal)
    owned, call, failure = None, None, None
    try:
        with modal.enable_output(), app.run():
            owned = app.app_id
            try:
                receipt.update(app_id=owned, status="app-started"); save()
                call = fn.spawn(receipt["run_id"], payload, plan["input_sha256"])
                receipt.update(call_id=call.object_id, status="submitted"); save()
                summary = parse_json(json_bytes(call.get(timeout=900)))
                receipt["remote_summary"] = summary; save()
                if summary.get("run_id") != receipt["run_id"] or summary.get("input_sha256") != plan["input_sha256"]:
                    raise ValueError("Returned summary is not bound to this run and input")
                receive(volume.read_file(receipt["run_id"]+"/artifacts.zip"), output/"artifacts.zip", summary)
                if summary["status"] != "inferred-ceiling-patch-awaiting-review":
                    raise RuntimeError("CPU completion failed; inspect retained artifacts")
                receipt["status"] = summary["status"]
            except BaseException as error:
                failure = error
                receipt.update(status="failed-or-uncertain", error_type=type(error).__name__)
                if call is not None:
                    try:
                        call.cancel(terminate_containers=True)
                        receipt["cancellation"] = "requested"
                    except Exception as cancel_error:
                        receipt["cancellation"] = {"status": "unconfirmed", "error_type": type(cancel_error).__name__}
                raise
            finally:
                try:
                    receipt["cleanup"] = stop(owned)
                except BaseException as error:
                    receipt.update(status="failed-or-uncertain", cleanup={"status": "unconfirmed", "error_type": type(error).__name__})
                    if failure is None:
                        raise
                finally:
                    save()
    except BaseException as error:
        receipt.update(status="failed-or-uncertain", error_type=type(error).__name__)
        if owned is None and getattr(app, "app_id", None):
            try:
                receipt["cleanup"] = stop(app.app_id)
            except BaseException as cleanup_error:
                receipt["cleanup"] = {"status": "unconfirmed", "error_type": type(cleanup_error).__name__}
        save()
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm-billable", action="store_true")
    parser.add_argument("--plan", type=Path)
    args = parser.parse_args(argv)
    if not args.dry_run and (not args.confirm_billable or args.plan is None):
        parser.error("Execution requires --confirm-billable and the exact reviewed --plan")
    payload = input_bytes(args.input)
    manifest, _ = admit(payload)  # Admission only; no local fitting/reconstruction.
    plan = make_plan(payload, manifest)
    if not args.dry_run:
        if args.plan.is_symlink() or args.plan.stat().st_size > 65536 or parse_json(args.plan.read_bytes()) != plan:
            parser.error("Input, reviewed code, resource or scope plan changed")
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output/"plan.json").write_bytes(json_bytes(plan))
    if args.dry_run:
        (args.output/"dry-run.json").write_bytes(json_bytes({"status": "offline-admission-only-not-submitted",
            "plan_sha256": digest(json_bytes(plan)), "modal_imported": False, "geometry_processed": False,
            "attempt_already_reserved": ATTEMPT_RECEIPT.exists()}))
        return
    receipt = {"scope": "teal-bedroom-ceiling-attempt-v2", "run_id": uuid.uuid4().hex, "status": "reserved",
        "plan_sha256": digest(json_bytes(plan)), "cleanup": {"status": "not-started"}}
    # Fixed path supplied by the owner; changing plan/code paths cannot buy another attempt.
    with ATTEMPT_RECEIPT.open("xb") as handle:
        handle.write(json_bytes(receipt))
    def save():
        ATTEMPT_RECEIPT.write_bytes(json_bytes(receipt))
        (args.output/"receipt.json").write_bytes(json_bytes(receipt))
    save()
    try:
        import modal
        run(modal, payload, plan, args.output, receipt, save)
    except BaseException as error:
        receipt.update(status="failed-or-uncertain", error_type=type(error).__name__); save()
        raise


if __name__ == "__main__":
    main()
