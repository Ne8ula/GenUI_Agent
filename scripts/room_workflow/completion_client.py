"""Bounded local CPU adapter. No model acquisition, inference, network or UI.

Operator CLI:
  python completion_client.py --request INPUT.json --response NEW.json

INPUT is exactly {version:1, analysis:<executed result including fields>,
request:<original analyze payload>, review:<bound reviewed polygon packet>}.
The caller owns authentication, user confirmation, cancellation and private
artifact retention. This adapter does not grant authority or invent a worker
result: it emits an eva-room-local-completion-v1 artifact.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

MAX_BYTES = 64 * 1024**2
DEFAULT_TIMEOUT = 120
VOXEL = .009
CONFIDENCE_PERCENTILE = 0


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def load_bounded(path):
    with Path(path).open("rb") as handle:
        data = handle.read(MAX_BYTES+1)
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Local completion input exceeds 64 MiB or is empty")
    def invalid_constant(_):
        raise ValueError("Nonfinite JSON constant")
    value = json.loads(data, object_pairs_hook=no_duplicates, parse_constant=invalid_constant)
    return value, data


def validate_envelope(value):
    if not isinstance(value, dict) or set(value) != {"version", "analysis", "request", "review"}:
        raise ValueError("Local completion requires exact supported envelope fields")
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("Unsupported local completion version")
    if not all(isinstance(value[key], dict) for key in ("analysis", "request", "review")):
        raise ValueError("Local completion payloads must be objects")
    if value["request"].get("operation") != "analyze":
        raise ValueError("Local completion requires the original analyze request")
    return value


def validate_contract(value, directory):
    """Full request and actual result contract checks precede numerical decode."""
    from inference import validate_payload
    from review_result import validate_files
    validate_payload(value["request"])
    directory = Path(directory)
    analysis_path, request_path = directory/"analysis.json", directory/"analyze-request.json"
    write_exclusive(analysis_path, canonical(value["analysis"]))
    write_exclusive(request_path, canonical(value["request"]))
    # Same authoritative JS result validator used by executed-result review.
    # A small subprocess wrapper gives even validation its own finite deadline.
    code = (
        "import json,sys; from pathlib import Path; "
        "sys.path.insert(0,sys.argv[1]); "
        "from review_result import validate_files; "
        "validate_files(Path(sys.argv[2]),Path(sys.argv[3]))")
    subprocess.run([sys.executable, "-c", code, str(Path(__file__).parent),
                    str(analysis_path), str(request_path)], check=True, timeout=25,
                   capture_output=True, text=True, creationflags=hidden_flags())


def write_exclusive(path, data):
    if len(data) > MAX_BYTES:
        raise ValueError("Local completion output exceeds 64 MiB")
    # Caller chooses an operator-controlled path, never a path embedded in data.
    with Path(path).open("xb") as handle:
        handle.write(data)


def hidden_flags():
    return subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def worker(request_path, response_path):
    start = time.monotonic()
    value, input_bytes = load_bounded(request_path)
    validate_envelope(value)
    with tempfile.TemporaryDirectory(prefix="eva-completion-validate-") as temp:
        validate_contract(value, temp)
    # Import only after contract validation; numerical archive is unpacked here.
    from complete_candidate import complete_from_fields
    analysis = value["analysis"]
    converted = complete_from_fields(analysis, analysis, value["review"],
                                    voxel=VOXEL, confidence_percentile=CONFIDENCE_PERCENTILE)
    artifact = {
        "version": 1, "artifact_type": "eva-room-local-completion-v1", "status": "complete",
        "job_id": value["request"]["job_id"], "units": "relative",
        "source_analysis_binding": converted["source_analysis_binding"],
        "geometry": converted["geometry"], "fused_geometry": converted["fused_geometry"],
        "raw_geometry": converted["raw_geometry"], "cameras": converted["cameras"],
        "candidate_geometry_sha256": converted["candidate_geometry_sha256"],
        "fused_geometry_sha256": converted["fused_geometry_sha256"],
        "boundary": converted["boundary"], "openings": converted["openings"],
        "original_to_candidate_rotation": converted["original_to_candidate_rotation"],
        "source_inputs": converted["source_inputs"],
        "bindings": {"adapter_request_sha256": sha(input_bytes),
                     "analysis_canonical_sha256": sha(canonical(analysis)),
                     "original_request_canonical_sha256": sha(canonical(value["request"])),
                     "review_canonical_sha256": sha(canonical(value["review"])),
                     "numerical_fields_sha256": converted["numerical_fields_sha256"],
                     "numerical_fields_model_config_sha256": converted["numerical_fields_model_config_sha256"]},
        "diagnostics": {"method": "local-cpu-tsdf-from-existing-ml-fields",
                        "new_model_execution": False, "source_model_execution": "executed",
                        "voxel_relative": VOXEL,
                        "confidence_excluded_lower_percentile": CONFIDENCE_PERCENTILE,
                        "bounded_triangles": converted["bounded_triangles"],
                        "discarded_outside_boundary_triangles": converted["discarded_outside_boundary_triangles"],
                        "authored_shell_triangles": converted["authored_shell_triangles"],
                        "elapsed_seconds": time.monotonic()-start},
        "limitations": [
            "Caller supplied reviewed boundary; this artifact grants no execution or review authority.",
            "Original camera and raw geometry remain unchanged; inferred scale is relative.",
            "Lowest-confidence model estimates are included; model confidence is not probability.",
            "Shell and door/window caps are authored assumptions, not recovered unseen objects.",
            "This local artifact is not a cloud worker result or a Shado comparison.",
            "The broker must discard late output after cancellation or review/source changes."]}
    write_exclusive(response_path, canonical(artifact))
    return artifact["candidate_geometry_sha256"]


def run(request_path, response_path, timeout_seconds=DEFAULT_TIMEOUT):
    if type(timeout_seconds) is not int or not 10 <= timeout_seconds <= 180:
        raise ValueError("Local CPU deadline must be 10 to 180 seconds")
    request_path, response_path = Path(request_path), Path(response_path)
    if response_path.exists():
        raise FileExistsError("Refusing to overwrite an existing completion artifact")
    value, data = load_bounded(request_path)
    validate_envelope(value)
    with tempfile.TemporaryDirectory(prefix="eva-completion-run-") as temp:
        temp = Path(temp)
        frozen_input, temporary_output = temp/"input.json", temp/"output.json"
        write_exclusive(frozen_input, data)
        # Parent owns final publication. Timed-out workers can only write inside
        # this temporary directory, never the caller's final response path.
        subprocess.run([sys.executable, str(Path(__file__).resolve()), "--_worker",
                        "--request", str(frozen_input), "--response", str(temporary_output)],
                       check=True, timeout=timeout_seconds, capture_output=True, text=True,
                       creationflags=hidden_flags())
        result, result_bytes = load_bounded(temporary_output)
        if (result.get("artifact_type") != "eva-room-local-completion-v1"
                or result.get("status") != "complete"
                or result.get("bindings", {}).get("adapter_request_sha256") != sha(data)):
            raise ValueError("Local CPU subprocess returned an unbound artifact")
        write_exclusive(response_path, result_bytes)
        return {"status": "complete", "artifact_type": result["artifact_type"],
                "bytes": len(result_bytes), "sha256": sha(result_bytes),
                "candidate_geometry_sha256": result["candidate_geometry_sha256"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--response", type=Path, required=True)
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        if args._worker:
            worker(args.request, args.response)
        else:
            print(json.dumps(run(args.request, args.response, args.timeout_seconds)))
        return 0
    except (ValueError, OSError, subprocess.SubprocessError, KeyError, TypeError, RecursionError) as error:
        # Do not echo photos, numerical base64, subprocess output or private
        # paths. No failure file is published over a previous successful result.
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "message": "Local CPU completion failed; no successful artifact published."}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
