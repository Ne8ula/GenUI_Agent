"""TEST ONLY: real worker control flow with synthetic predictions and mocked CUDA.

No model, cloud call, installation or download occurs. Emits request/result pairs
for cross-language validation, not reconstruction evidence.
"""
import base64
import hashlib
import io
import json
import types
from unittest.mock import Mock, patch

import numpy as np
from PIL import Image
import inference


def photo(index):
    output = io.BytesIO()
    Image.new("RGB", (64, 64), (index+1, 40, 80)).save(output, format="PNG")
    data = output.getvalue()
    return {"id": "p"+str(index), "sha256": hashlib.sha256(data).hexdigest(),
            "data_base64": base64.b64encode(data).decode()}


def predicted(model, paths, valid):
    count = len(paths)
    yy, xx = np.indices((20, 20))
    points = np.stack((xx/10, yy/10, 1+.02*xx+.01*yy), -1)
    camera = {"world_to_camera": [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]],
              "intrinsics": [[500, 0, 259], [0, 500, 259], [0, 0, 1]],
              "center": [0, 0, 0], "depth_kind": "OpenCV-z", "units": "relative"}
    return {"points": np.repeat(points[None], count, axis=0),
            "rgb": np.ones((count, 20, 20, 3))*.5, "valid": np.ones((count, 20, 20), bool),
            "cameras": [dict(camera) for _ in paths], "depth": np.ones((count, 20, 20)),
            "confidence": np.ones((count, 20, 20)), "orientation": "SYNTHETIC TEST ONLY"}


def fixture():
    torch = Mock()
    torch.__version__ = "SYNTHETIC"
    torch.cuda.is_available.return_value = True
    torch.cuda.get_device_name.return_value = "NO REAL GPU"
    torch.cuda.max_memory_allocated.return_value = 0
    module = types.ModuleType("vggt.models.vggt")
    module.VGGT = Mock()
    modules = {"torch": torch, "vggt": types.ModuleType("vggt"),
               "vggt.models": types.ModuleType("vggt.models"), "vggt.models.vggt": module}
    config = {"vggt_source_revision": "a"*40, "vggt_checkpoint_revision": "b"*40}
    request = {"version": 1, "operation": "analyze", "job_id": "synthetic-execute-fixture",
               "images": [photo(i) for i in range(5)]}
    with patch.dict("sys.modules", modules), patch.object(inference, "_predict", side_effect=predicted), \
            patch.object(inference, "detect_markers", side_effect=lambda *args: {
                "status": "not-run-synthetic-fixture", "detections": []}):
        analysis = inference.execute(request, config)
        reconstruct = {**request, "operation": "reconstruct", "generated_images": [photo(8)],
                       "boundary": {"polygon": [[0, 0], [2, 0], [2, 2], [0, 2]], "floor": 0, "ceiling": 3},
                       "analysis_binding": analysis.get("analysis_binding")}
        reconstruction = inference.execute(reconstruct, config)
    return {"fixture_only": True, "pairs": [{"request": request, "result": analysis},
                                          {"request": reconstruct, "result": reconstruction}]}


if __name__ == "__main__":
    print(json.dumps(fixture(), allow_nan=False))
