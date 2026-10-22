"""Import-safe Modal entry point: no project or third-party imports at hydration.

Modal may import this module before the mounted source directory is on sys.path.
Only function entry establishes that path, then imports the reviewed worker.
"""


def json_boundary(value):
    """Strip library subclasses before Modal pickles the return value."""
    import json
    return json.loads(json.dumps(value, allow_nan=False))


def remote_worker(payload):
    import sys
    sys.path.insert(0, "/opt/eva-matcher")
    import learned_matcher as worker
    from pathlib import Path
    import tempfile
    import time
    import urllib.request
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="eva-loftr-") as directory:
        checkpoint = Path(directory)/worker.PINS["weights_filename"]
        with urllib.request.urlopen(worker.SOURCES["weights"], timeout=30) as response:
            data = response.read(worker.PINS["weights_size"]+1)
        if len(data) != worker.PINS["weights_size"] or worker.digest(data) != worker.PINS["weights_sha256"]:
            raise ValueError("Pinned LoFTR acquisition integrity failure")
        checkpoint.write_bytes(data)
        notices = {}
        for name, url in worker.license_notice_urls().items():
            with urllib.request.urlopen(url, timeout=15) as response:
                data = response.read(32769)
            if len(data) > 32768:
                raise ValueError("Oversized license notice")
            notices[name] = {"url": url, "sha256": worker.digest(data), "text": data.decode("utf-8")}
        if notices["Kornia-LoFTR-weight-card"]["sha256"] != worker.proposal()["license"]["weight_card_sha256"]:
            raise ValueError("Pinned model card changed")
        artifact = worker.execute(payload, checkpoint)
        return json_boundary({"artifact": artifact, "acquisition": {
            "checkpoint_sha256": worker.PINS["weights_sha256"], "checkpoint_bytes": checkpoint.stat().st_size,
            "notices": notices, "elapsed_seconds_including_acquisition": time.monotonic()-started}})
