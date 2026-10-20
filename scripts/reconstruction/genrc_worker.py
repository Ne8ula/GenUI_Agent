"""Cloud-only GenRC adapter. Imports model libraries lazily; no downloads here."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from genrc_contract import GENRC_COMMIT, ENCODER_COMMIT, verify_models, sha256, write_json


def execute(job_id, input_bytes, stage, model_key):
    """Top-level Modal function (no cross-Python-version closure serialization)."""
    import modal
    import re
    import traceback
    import zipfile
    from genrc_contract import unpack_bundle
    if not re.fullmatch(r"[0-9a-f]{32}",job_id) or stage not in ("smoke","generate"):
        raise ValueError("Invalid job")
    if stage == "generate" and not re.fullmatch(r"[0-9a-f]{64}",model_key or ""):
        raise ValueError("Invalid model key")
    volume = modal.Volume.from_name("eva-genrc-results-v1")
    root = Path("/results")/job_id
    root.mkdir(exist_ok=False)
    summary = {"run_id":job_id,"status":"failed"}
    try:
        write_json(root/"runtime.json",{"pip_freeze":subprocess.check_output([sys.executable,"-m","pip","freeze"],text=True),
            "nvidia_smi":subprocess.check_output(["nvidia-smi"],text=True),"genrc_commit":GENRC_COMMIT})
        volume.commit()
        if stage == "smoke":
            summary = smoke()
        else:
            unpack_bundle(input_bytes,Path("/tmp")/job_id)
            summary = complete(Path("/tmp")/job_id,root/"candidate",Path("/models")/model_key,volume.commit)
    except Exception as error:
        summary = {"status":"failed","error_type":type(error).__name__,"message":str(error)}
        write_json(root/"failure.json",{**summary,"traceback":traceback.format_exc()})
    finally:
        # TorchVersion is a str subclass whose pickle requires torch on the client.
        # Return the same plain JSON data we persist, without cloud-only classes.
        summary = json.loads(json.dumps(summary, allow_nan=False))
        write_json(root/"summary.json",summary)
        with zipfile.ZipFile(root/"artifacts.zip","x",compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(root.rglob("*")):
                if path.is_file() and path.name != "artifacts.zip":
                    archive.write(path,path.relative_to(root).as_posix())
        volume.commit()
    return summary


def source_setup():
    source = Path("/opt/GenRC")
    actual = subprocess.check_output(["git","-C",str(source),"rev-parse","HEAD"],text=True).strip()
    if actual != GENRC_COMMIT:
        raise ValueError("GenRC source revision mismatch")
    encoder = subprocess.check_output(["git","-C","/opt/efficientnet","rev-parse","HEAD"],text=True).strip()
    if encoder != ENCODER_COMMIT:
        raise ValueError("Encoder source revision mismatch")
    sys.path.insert(0, str(source))
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    return source


def smoke():
    source_setup()
    import numpy as np
    import torch
    import open3d as o3d
    from model.mesh_fusion.render import render_mesh
    from model.genrc_pipeline import GenRCPipeline  # verifies the full import graph, no models
    from genrc_geometry import unproject
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable")
    a = torch.eye(4,device="cuda")
    assert torch.equal(a @ a, a)
    vertices = torch.tensor([[-1.,-1.,2.],[1.,-1.,2.],[1.,1.,2.],[-1.,1.,2.]],device="cuda").T
    faces = torch.tensor([[0,1,2],[0,2,3]],device="cuda").T
    K = torch.tensor([[32.,0,32],[0,32,32],[0,0,1]],device="cuda")
    rgb, depth, mask, *_ = render_mesh(vertices,faces,torch.ones_like(vertices),64,64,90,
        torch.eye(4,device="cuda"),faces_per_pixel=1,use_opencv_camera_with_intrinsic=K,cull_backfaces=False)
    values = depth[~mask]
    if values.numel() < 500 or not torch.allclose(values, torch.full_like(values,2),atol=1e-4):
        raise RuntimeError("Rasterizer depth/coverage smoke failed")
    points = unproject(np.full((64,64),2.),K.cpu().numpy(),np.eye(4))
    assert np.allclose(points[32,32], [.03125,.03125,2.])
    mesh = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(vertices.T.cpu().numpy()),o3d.utility.Vector3iVector(faces.T.cpu().numpy()))
    o3d.io.write_triangle_mesh("/tmp/genrc-smoke.ply",mesh)
    assert len(o3d.io.read_triangle_mesh("/tmp/genrc-smoke.ply").triangles) == 2
    return {"status":"passed", "gpu":torch.cuda.get_device_name(),"torch":torch.__version__,
            "cuda":torch.version.cuda, "genrc_commit":GENRC_COMMIT,"rasterized_pixels":values.numel()}


def complete(input_dir, output, model_root, checkpoint=lambda: None):
    import numpy as np
    import torch
    import open3d as o3d
    from PIL import Image
    from scipy.ndimage import binary_dilation
    from scipy.spatial import cKDTree
    from genrc_geometry import triangulate, free_space_filter, load_observations, filter_faces
    from genrc_contract import validate_manifest
    source_setup()
    from model.genrc_pipeline import GenRCPipeline
    from model.utils.opt import get_default_parser
    from model.iron_depth.predict_depth import load_iron_depth_model
    from model.diffusion.diffusion_pipeline import DiffusionPipeline

    input_dir, output, model_root = Path(input_dir), Path(output), Path(model_root)
    output.mkdir(parents=True,exist_ok=False)
    m = validate_manifest(json.loads((input_dir/"manifest.json").read_text()))
    models = verify_models(model_root)
    if sha256(model_root/"models.json") != model_root.name:
        raise ValueError("Model cache key does not match its manifest")
    observations = load_observations(input_dir/"observations.npz")
    crop_K = observations["K"].copy()
    crop_K[0,2] -= 128
    crop_K[:2] *= 512/768
    if not np.allclose(crop_K,m["camera"]["K"]):
        raise ValueError("Observation and generation calibration disagree")
    started = time.monotonic()
    torch.manual_seed(m["seed"])
    torch.cuda.manual_seed_all(m["seed"])
    np.random.seed(m["seed"])
    import random
    random.seed(m["seed"])
    torch.cuda.reset_peak_memory_stats()
    args = get_default_parser().parse_args([])
    args.models_path = str(model_root)
    args.out_path = str(output)
    args.erode_iters = args.dilate_iters = 0
    args.update_mask_after_improvement = False
    args.replace_over_inpainted = args.replace_overlapping = False
    args.simplify_mesh_voxel_size = -1
    args.num_inference_steps = m["steps"]
    args.faces_per_pixel = 1
    args.negative_prompt = "new rooms, additional furniture, people, animals, text, watermark, distorted geometry"
    pipeline = GenRCPipeline(args,setup_models=False,no_save_dir=True)
    args.prompt = m["prompt"]  # upstream constructor otherwise overwrites the requested prompt
    original = o3d.io.read_triangle_mesh(str(input_dir/"room.ply"))
    original_v = np.asarray(original.vertices).copy()
    original_f = np.asarray(original.triangles).copy()
    original_c = np.asarray(original.vertex_colors).copy()
    if not len(original_f) or len(original_f) > 800000 or original_c.shape != original_v.shape:
        raise ValueError("Source mesh exceeds pilot contract or lacks colors")
    # Avoid upstream load_mesh's vertex reindexing: retain original indices exactly.
    pipeline.vertices = torch.tensor(original_v.T,dtype=torch.float32,device="cuda")
    pipeline.faces = torch.tensor(original_f.T,dtype=torch.int64,device="cuda")
    pipeline.colors = torch.tensor(original_c.T,dtype=torch.float32,device="cuda")
    pipeline.K = torch.tensor(m["camera"]["K"],dtype=torch.float32,device="cuda")
    world_from_cv = np.asarray(m["camera"]["world_from_cv_m"])
    pipeline.world_to_cam = torch.tensor(np.linalg.inv(world_from_cv),dtype=torch.float32,device="cuda")
    with torch.no_grad():
        _, rendered, _ = pipeline.project(use_opencv_camera_with_intrinsic=pipeline.K)
    holes = pipeline.inpaint_mask.cpu().numpy().astype(bool)
    rendered_depth = pipeline.rendered_depth.cpu().numpy().copy()
    holes |= ~np.isfinite(rendered_depth) | (rendered_depth <= 0)
    roi = np.zeros((512,512),dtype=bool)
    x0,y0,x1,y1 = m["roi"]
    roi[y0:y1,x0:x1] = True
    active = holes & roi
    rendered.save(output/"before.png")
    Image.fromarray(active.astype(np.uint8)*255).save(output/"generation-mask.png")
    np.save(output/"before-depth.npy",rendered_depth)
    checkpoint()
    if active.sum() < 64 or (~holes).sum() < 4096:
        raise ValueError("Too little missing area or insufficient observed depth anchors")

    # Only local pinned architecture code; strict final checkpoints fill ALL parameters.
    # HF offline mode does not cover torch.hub, hence this separate narrow override.
    real_hub_load = torch.hub.load
    def local_encoder(repo, model, *positional, **kwargs):
        if repo != "rwightman/gen-efficientnet-pytorch" or model != "tf_efficientnet_b5_ap" or positional:
            raise ValueError("Unexpected torch.hub model request")
        return real_hub_load("/opt/efficientnet",model,source="local",pretrained=False)
    torch.hub.load = local_encoder
    try:
        pipeline.iron_depth_n_net, pipeline.iron_depth_model = load_iron_depth_model(
            "scannet", args.iron_depth_iters, str(model_root), "cuda")
    finally:
        torch.hub.load = real_hub_load
    pipeline.diffusion_pipe = DiffusionPipeline(args)
    pipeline.inpaint_mask = torch.tensor(active,device="cuda")
    mask = Image.fromarray(active.astype(np.uint8)*255).convert("RGB")
    with torch.no_grad():
        generated, _ = pipeline.inpaint(rendered,mask,1)
        generated[0].save(output/"diffusion-raw.png")
        rgb = np.array(generated[0]).copy()
        before_rgb = np.array(rendered)
        rgb[~active] = before_rgb[~active]
        generated = [Image.fromarray(rgb)]
        generated[0].save(output/"generated.png")
        checkpoint()
        # Unknown depth OUTSIDE the generation ROI must not be treated as fixed zero depth.
        pipeline.inpaint_mask = torch.tensor(holes,device="cuda")
        predictions, _ = pipeline.predict_depth(generated,fix_input_depth=True)
    depth = predictions[0].cpu().numpy().copy()
    depth[~holes] = rendered_depth[~holes]
    Image.fromarray(rgb).save(output/"generated.png")
    np.save(output/"predicted-depth.npy",depth)
    checkpoint()
    points, faces = triangulate(depth,np.asarray(m["camera"]["K"]),world_from_cv,
        active,~holes,m["bounds_m"])
    # Snap only new boundary vertices to source vertices within a metric seam band.
    boundary = active & binary_dilation(~holes,iterations=2)
    candidates = np.flatnonzero(boundary.ravel() & np.isfinite(points).all(1))
    adjusted = np.zeros(len(points),dtype=bool)
    if len(candidates) and m["seam_m"] > 0:
        distance, index = cKDTree(original_v).query(points[candidates])
        snap = distance <= m["seam_m"]
        points[candidates[snap]] = original_v[index[snap]]
        adjusted[candidates[snap]] = True
        rgb.reshape(-1,3)[candidates[snap]] = np.rint(original_c[index[snap]]*255).astype(np.uint8)
    faces = filter_faces(points,faces,m["bounds_m"])
    faces, diagnostics = free_space_filter(points,faces,observations)
    if not len(faces):
        raise ValueError("No generated triangles survived geometric checks; inspect intermediate artifacts")
    used, inverse = np.unique(faces,return_inverse=True)
    added_v, added_f = points[used],inverse.reshape(-1,3)
    added_c = rgb.reshape(-1,3)[used]/255.
    completion = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(added_v),o3d.utility.Vector3iVector(added_f))
    completion.vertex_colors = o3d.utility.Vector3dVector(added_c)
    o3d.io.write_triangle_mesh(str(output/"completion.ply"),completion)
    combined = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(np.concatenate([original_v,added_v])),
        o3d.utility.Vector3iVector(np.concatenate([original_f,added_f+len(original_v)])))
    combined.vertex_colors = o3d.utility.Vector3dVector(np.concatenate([original_c,added_c]))
    o3d.io.write_triangle_mesh(str(output/"candidate.ply"),combined)
    np.savez_compressed(output/"face-provenance.npz", original_face_ids=np.arange(len(original_f)),
        generated_face_ids=np.arange(len(added_f))+len(original_f), seam_adjusted_added_vertex_ids=np.flatnonzero(adjusted[used]))
    pipeline.vertices = torch.tensor(np.asarray(combined.vertices).T,dtype=torch.float32,device="cuda")
    pipeline.faces = torch.tensor(np.asarray(combined.triangles).T,dtype=torch.int64,device="cuda")
    pipeline.colors = torch.tensor(np.asarray(combined.vertex_colors).T,dtype=torch.float32,device="cuda")
    for frame in (36,37,38):
        if frame != 37:
            pose = observations["world_to_cv"][np.flatnonzero(observations["frames"] == frame)[0]]
            pipeline.world_to_cam = torch.tensor(pose,dtype=torch.float32,device="cuda")
        else:
            pipeline.world_to_cam = torch.tensor(np.linalg.inv(world_from_cv),dtype=torch.float32,device="cuda")
        with torch.no_grad():
            _, view, _ = pipeline.project(use_opencv_camera_with_intrinsic=pipeline.K)
        view.save(output/f"candidate-{frame:04d}.png")
    if sha256(input_dir/"room.ply") != m["source"]["mesh_sha256"]:
        raise RuntimeError("Original input changed")
    write_json(output/"result.json", {"status":"candidate-awaiting-review", "condition":"GenRC perspective-only adaptation; no panorama/textual inversion",
        "genrc_commit":GENRC_COMMIT,"encoder_commit":ENCODER_COMMIT,"input":m,"models":models,
        "seconds":time.monotonic()-started,"peak_vram_bytes":torch.cuda.max_memory_allocated(),
        "gpu":torch.cuda.get_device_name(),"torch":torch.__version__,"cuda":torch.version.cuda,
        "generated_triangles":len(added_f),"original_vertices_changed":0,"original_faces_removed":0,
        "seam_adjusted_new_vertices":int(adjusted[used].sum()),"depth_checks":diagnostics,
        "limitations":["Plausible completion, not recovered hidden truth", "Sparse depth probes can miss contradictions", "Doorway preservation and semantic consistency require visual review", "Single central crop; not complete room coverage"],
        "files":{p.name:{"sha256":sha256(p),"bytes":p.stat().st_size} for p in output.iterdir() if p.is_file()}})
    return {"status":"candidate-awaiting-review","triangles":len(added_f)}
