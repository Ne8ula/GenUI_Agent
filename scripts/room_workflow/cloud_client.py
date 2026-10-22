"""Explicit one-shot client for an already deployed private Modal worker.

No automatic retry: on an uncertain invocation inspect its receipt/account
before resubmitting. Secrets remain in the existing Modal client configuration.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

CLIENT_GET_TIMEOUT_SECONDS = 630  # Below the broker's 660-second outer deadline.
DEFINITIVE_RESULT_STATUSES = {"complete", "partial", "failed"}
RECOVERY_RECEIPT_FIELDS = {
    "version", "job_id", "modal_call_id", "request_sha256", "status", "retry_policy",
    "client_get_timeout_seconds", "wait_error_type", "cancellation",
    "cancellation_error_type", "result_sha256",
}
RECOVERY_RECEIPT_STATUSES = DEFINITIVE_RESULT_STATUSES | {
    "submission-started", "submitted", "result-unavailable",
    "cancellation-requested", "cancellation-request-failed",
}
MAX_RESULT_BYTES = 64*1024**2


def bounded_json(path, maximum):
    if not path.is_file() or path.stat().st_size > maximum:
        raise ValueError("Absent or oversized recovery input")
    raw = path.read_bytes()
    if len(raw) > maximum:
        raise ValueError("Recovery input exceeded its byte limit")
    def reject(value):
        raise ValueError("Nonfinite JSON constant: "+value)
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("Duplicate JSON field")
            value[key] = item
        return value
    return json.loads(raw.decode("utf-8"), parse_constant=reject, object_pairs_hook=unique), raw


def validate_recovered_result(result, request_path, request_sha256):
    """Reuse the same authoritative result contract as broker admission."""
    encoded = json.dumps(result, allow_nan=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_RESULT_BYTES:
        raise ValueError("Recovered result exceeds artifact budget")
    code = """import fs from 'node:fs'; import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const raw=fs.readFileSync(process.argv[2]);
if(createHash('sha256').update(raw).digest('hex')!==process.argv[3])throw Error('Request changed');
const {validateWorkerResult}=await import(pathToFileURL(process.argv[1]));
validateWorkerResult(JSON.parse(fs.readFileSync(0,'utf8')),JSON.parse(raw));"""
    validation = subprocess.run(
        ["node", "--input-type=module", "-e", code, str(Path(__file__).with_name("result.mjs")),
         str(request_path), request_sha256], input=encoded, capture_output=True, text=True, timeout=20)
    if validation.returncode:
        raise ValueError("Recovered worker result failed request/source validation")


def recover_existing(receipt_path, request_path, output_path):
    """One read-only existing-call poll; never alters original evidence or authority."""
    receipt_path, request_path, output_path = map(lambda p: Path(p).resolve(),
                                                 (receipt_path, request_path, output_path))
    if output_path.exists() or output_path in (receipt_path, request_path):
        raise ValueError("Recovery requires a fresh output artifact")
    receipt, raw_receipt = bounded_json(receipt_path, 65536)
    payload, raw_request = bounded_json(request_path, 150*1024**2)
    from inference import validate_payload
    validate_payload(payload)
    request_sha256 = hashlib.sha256(raw_request).hexdigest()
    if (not isinstance(receipt, dict) or set(receipt)-RECOVERY_RECEIPT_FIELDS
            or type(receipt.get("version")) is not int or receipt["version"] != 1
            or receipt.get("job_id") != payload["job_id"]
            or receipt.get("request_sha256") != request_sha256
            or receipt.get("status") not in RECOVERY_RECEIPT_STATUSES
            or not isinstance(receipt.get("modal_call_id"), str)
            or not re.fullmatch(r"fc-[A-Za-z0-9_-]{1,125}", receipt["modal_call_id"])):
        raise ValueError("Recovery receipt is not bound to this exact job/request/call")
    cancelled = (receipt["status"].startswith("cancellation-")
                 or isinstance(receipt.get("cancellation"), str))
    envelope = {"version": 1, "artifact_type": "eva-room-cloud-recovery-v1",
                "job_id": payload["job_id"], "operation": payload["operation"],
                "request_sha256": request_sha256,
                "receipt_sha256": hashlib.sha256(raw_receipt).hexdigest(),
                "modal_call_id": receipt["modal_call_id"], "status": "unavailable",
                "result": None, "error_type": None, "cancellation_requested": cancelled}
    import modal
    try:
        result = modal.FunctionCall.from_id(receipt["modal_call_id"]).get(timeout=0)
    except BaseException as error:
        # The installed SDK raises its exact base TimeoutError for an empty
        # zero-timeout poll. FunctionTimeoutError and OutputExpiredError are
        # subclasses and must NOT be relabeled as a still-pending invocation.
        poll_timeout = getattr(getattr(modal, "exception", None), "TimeoutError", None)
        envelope["status"] = "pending" if isinstance(poll_timeout, type) and type(error) is poll_timeout else "unavailable"
        envelope["error_type"] = type(error).__name__[:128]
    else:
        validate_recovered_result(result, request_path, request_sha256)
        if receipt["status"] in DEFINITIVE_RESULT_STATUSES and receipt["status"] != result["status"]:
            raise ValueError("Recovered outcome contradicts the definitive original receipt")
        envelope.update(status="result-available", result=result)
    # Preserve an exact evidence snapshot; concurrent receipt changes require
    # another explicit poll and a new envelope, never a stale status merge.
    if receipt_path.read_bytes() != raw_receipt or request_path.read_bytes() != raw_request:
        raise ValueError("Recovery evidence changed while retrieving the existing call")
    encoded = json.dumps(envelope, allow_nan=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_RESULT_BYTES+4096:
        raise ValueError("Recovery envelope exceeds artifact budget")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("x", encoding="utf-8") as handle:
        handle.write(encoded)
    print(json.dumps({key: envelope[key] for key in ("job_id", "modal_call_id", "status")}), flush=True)
    return envelope


def update_pending_receipt(path, receipt, **updates):
    """Do not demote an existing call whose result was recovered elsewhere."""
    current = json.loads(path.read_text(encoding="utf-8"))
    if current.get("modal_call_id") != receipt.get("modal_call_id"):
        raise ValueError("Receipt call identity changed; inspect instead of overwriting")
    if current.get("status") in DEFINITIVE_RESULT_STATUSES:
        return False
    receipt.update(updates)
    path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return True


def request_cancellation(call, path, receipt, *, status):
    """Cancellation acknowledgement never proves remote termination."""
    current = json.loads(path.read_text(encoding="utf-8"))
    if current.get("modal_call_id") != receipt.get("modal_call_id"):
        raise ValueError("Receipt call identity changed; inspect instead of cancelling")
    if current.get("status") in DEFINITIVE_RESULT_STATUSES:
        return False
    try:
        call.cancel(terminate_containers=True)
        cancellation = "requested; remote termination unverified"
    except BaseException as error:
        cancellation = "request-failed; remote termination unknown"
        receipt["cancellation_error_type"] = type(error).__name__
        if status == "cancellation-requested":
            status = "cancellation-request-failed"
    return update_pending_receipt(path, receipt, status=status, cancellation=cancellation)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--output", "--response", dest="output", type=Path)
    parser.add_argument("--cancel-receipt", type=Path)
    parser.add_argument("--recover-receipt", type=Path)
    parser.add_argument("--confirm-billable", action="store_true")
    parser.add_argument("--app", default="eva-room-workflow", choices=["eva-room-workflow"])
    args = parser.parse_args(argv)
    if args.recover_receipt:
        if args.cancel_receipt or args.confirm_billable or not args.request or not args.output:
            parser.error("Recovery accepts existing --recover-receipt, exact --request and fresh --output only")
        recover_existing(args.recover_receipt, args.request, args.output)
        return 0
    if args.cancel_receipt:
        if args.request or args.output or not args.cancel_receipt.is_file() or args.cancel_receipt.stat().st_size > 65536:
            parser.error("Cancellation accepts one existing small receipt")
        receipt = json.loads(args.cancel_receipt.read_text(encoding="utf-8"))
        call_id = receipt.get("modal_call_id")
        if not isinstance(call_id, str) or not call_id.startswith("fc-") or len(call_id) > 128:
            parser.error("Receipt lacks a known call ID; inspect the provider before claiming cancellation")
        if receipt.get("status") in DEFINITIVE_RESULT_STATUSES:
            print(json.dumps({"modal_call_id": call_id, "status": receipt["status"],
                              "cancellation": "not requested; definitive result already recorded"}), flush=True)
            return 0
        import modal
        request_cancellation(modal.FunctionCall.from_id(call_id), args.cancel_receipt, receipt,
                             status="cancellation-requested")
        current = json.loads(args.cancel_receipt.read_text(encoding="utf-8"))
        print(json.dumps({"modal_call_id": call_id, "status": current["status"],
                          "cancellation": current.get("cancellation")}), flush=True)
        return 1 if current.get("cancellation", "").startswith("request-failed") else 0
    if not args.request or not args.output:
        parser.error("Invocation requires --request and --output/--response")
    if not args.confirm_billable:
        parser.error("Remote invocation requires --confirm-billable for this bounded request")
    receipt_path = args.request.with_suffix(".receipt.json")
    if args.output.exists() or receipt_path.exists():
        parser.error("Output/receipt already exists; inspect prior job instead of retrying")
    if not args.request.is_file() or args.request.stat().st_size > 150*1024**2:
        parser.error("Request file absent or exceeds budget")
    def reject_constant(value):
        raise ValueError("Nonfinite JSON constant: "+value)
    payload = json.loads(args.request.read_text(encoding="utf-8"), parse_constant=reject_constant)
    from inference import validate_payload
    validate_payload(payload)
    import modal
    receipt = {"version": 1, "job_id": payload["job_id"], "modal_call_id": None,
               "request_sha256": hashlib.sha256(args.request.read_bytes()).hexdigest(),
               "status": "submission-started", "retry_policy": "none; inspect existing call first",
               "client_get_timeout_seconds": CLIENT_GET_TIMEOUT_SECONDS}
    # Reserve before network submission. An interrupted spawn is uncertain even
    # when the call ID never came back, and must not become an automatic retry.
    with receipt_path.open("x", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2)
    # Spawn gives a recoverable call ID before blocking for the result.
    function = modal.Function.from_name(args.app, "run")
    call = function.spawn(payload)
    receipt.update({"modal_call_id": call.object_id, "status": "submitted"})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt), flush=True)
    try:
        result = call.get(timeout=CLIENT_GET_TIMEOUT_SECONDS)
    except BaseException as error:
        # Includes SDK-specific timeout exceptions and KeyboardInterrupt. Never
        # fetch or spawn again after an uncertain wait; preserve the stable ID.
        receipt["wait_error_type"] = type(error).__name__
        request_cancellation(call, receipt_path, receipt, status="result-unavailable")
        print("Existing call failed or its result is unavailable; inspect the receipt before any retry", file=sys.stderr)
        return 130 if isinstance(error, KeyboardInterrupt) else 1
    encoded = json.dumps(result, allow_nan=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > 64*1024**2:
        raise ValueError("Worker output exceeds artifact budget; existing call must not be retried")
    # A recovered or late artifact must not be overwritten by this waiter.
    with args.output.open("x", encoding="utf-8") as handle:
        handle.write(encoded)
    receipt["status"] = result["status"]
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps({"job_id": payload["job_id"], "status": result["status"],
                      "model_execution": result["model_execution"]}), flush=True)
    return 0 if result["status"] in ("complete", "partial") else 1


if __name__ == "__main__":
    raise SystemExit(main())
