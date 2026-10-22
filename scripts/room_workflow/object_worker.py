"""Import-safe Modal entry point; source path is established before dependencies."""


def remote_worker(payload):
    import sys
    import json
    import tempfile
    sys.path.insert(0, "/opt/eva-objects")
    import object_suggestions as worker
    with tempfile.TemporaryDirectory(prefix="eva-object-models-") as directory:
        paths = worker.acquire(directory)
        detect, segment = worker.load_models(paths)
        return json.loads(json.dumps(worker.execute(payload, detect, segment), allow_nan=False))
