"""Metric completion guards, independently testable without CUDA or model weights."""
import numpy as np


def load_observations(path):
    import zipfile
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        expected = {name+".npy" for name in ("depth","world_to_cv","K","frames","sample_offset","sample_stride")}
        if len(entries) != 6 or {i.filename for i in entries} != expected or sum(i.file_size for i in entries) > 4*1024**2:
            raise ValueError("Unexpected or oversized observation archive")
        shapes = {"depth.npy":(96,48,64),"world_to_cv.npy":(96,4,4),"K.npy":(3,3),"frames.npy":(96,),"sample_offset.npy":(),"sample_stride.npy":()}
        for entry in entries:
            with archive.open(entry) as handle:
                version = np.lib.format.read_magic(handle)
                if version == (1,0):
                    shape, _, dtype = np.lib.format.read_array_header_1_0(handle)
                elif version == (2,0):
                    shape, _, dtype = np.lib.format.read_array_header_2_0(handle)
                else:
                    raise ValueError("Unsupported NPY version")
                if shape != shapes[entry.filename] or dtype.hasobject or dtype.kind not in "fi" or dtype.itemsize not in (4,8):
                    raise ValueError("Unexpected observation shape/dtype")
                if int(np.prod(shape))*dtype.itemsize != entry.file_size-handle.tell():
                    raise ValueError("Invalid NPY payload size")
    with np.load(path,allow_pickle=False) as archive:
        value = {name:archive[name] for name in archive.files}
    validate_observations(value)
    return value


def filter_faces(points, faces, bounds, max_edge=.1):
    triangles = points[faces]
    edges = triangles-triangles[:,[1,2,0]]
    area2 = np.linalg.norm(np.cross(edges[:,0],edges[:,1]),axis=1)
    keep = np.isfinite(triangles).all((1,2)) & (area2 > 1e-10)
    keep &= (np.linalg.norm(edges,axis=2) <= max_edge).all(1)
    keep &= (triangles >= np.asarray(bounds[0])).all((1,2)) & (triangles <= np.asarray(bounds[1])).all((1,2))
    return faces[keep]


def unproject(depth, K, world_from_cv):
    yy, xx = np.indices(depth.shape)
    rays = np.stack([xx+.5, yy+.5, np.ones_like(xx)], -1) @ np.linalg.inv(K).T
    camera = rays * depth[...,None]
    return camera @ world_from_cv[:3,:3].T + world_from_cv[:3,3]


def triangulate(depth, K, world_from_cv, active, known, bounds, max_edge=.1):
    points = unproject(depth, K, world_from_cv)
    valid = (active | known) & np.isfinite(depth) & (depth > .1) & (depth <= 12)
    valid &= (points >= np.asarray(bounds[0])).all(-1) & (points <= np.asarray(bounds[1])).all(-1)
    ids = np.arange(depth.size).reshape(depth.shape)
    a,b,c,d = ids[:-1,:-1],ids[:-1,1:],ids[1:,:-1],ids[1:,1:]
    faces = np.concatenate([np.stack([a,c,b],-1).reshape(-1,3), np.stack([b,c,d],-1).reshape(-1,3)])
    keep = valid.ravel()[faces].all(1) & active.ravel()[faces].any(1)
    faces = faces[keep]
    p = points.reshape(-1,3)
    if len(faces):
        edges = p[faces] - p[faces[:,[1,2,0]]]
        faces = faces[(np.linalg.norm(edges,axis=2) <= max_edge).all(1)]
    return p, faces


def free_space_filter(points, faces, observations, tolerance=.05):
    """Reject new triangles with a vertex/centroid in observed free space.

    Sparse nearest-depth checks are conservative diagnostics, not proof of unseen shape.
    Test ALL training views; do not count missed projections as evidence of correctness.
    """
    keep = np.ones(len(faces), dtype=bool)
    checks = 0
    for pose, reference in zip(observations["world_to_cv"], observations["depth"]):
        indices = np.flatnonzero(keep)
        if not len(indices):
            break
        triangles = points[faces[indices]]
        probes = np.concatenate([triangles, triangles.mean(1)[:,None,:]], axis=1)
        cv = probes @ pose[:3,:3].T + pose[:3,3]
        uvh = cv @ observations["K"].T
        uv = uvh[...,:2] / np.maximum(uvh[...,2:], 1e-8)
        xy = np.rint((uv-float(observations["sample_offset"]))/float(observations["sample_stride"])).astype(np.int64)
        visible = (cv[...,2] > .1) & (xy[...,0] >= 0) & (xy[...,0] < reference.shape[1]) & (xy[...,1] >= 0) & (xy[...,1] < reference.shape[0])
        depths = reference[xy[...,1].clip(0,reference.shape[0]-1), xy[...,0].clip(0,reference.shape[1]-1)]
        valid = visible & np.isfinite(depths) & (depths > .1) & (depths <= 12)
        checks += int(valid.sum())
        blocked = (valid & (cv[...,2] < depths-tolerance)).any(1)
        keep[indices[blocked]] = False
    return faces[keep], {"rejected_triangles":int((~keep).sum()), "valid_depth_probes":checks}


def validate_observations(o):
    required = {"depth","world_to_cv","K","frames","sample_offset","sample_stride"}
    if set(o) != required or o["depth"].shape != (96,48,64) or o["world_to_cv"].shape != (96,4,4):
        raise ValueError("Invalid training observations")
    if o["frames"].tolist() != [i for i in range(100) if i not in (12,37,62,87)]:
        raise ValueError("Evaluation leakage or incorrect training frames")
    if not np.isfinite(o["world_to_cv"]).all() or o["K"].shape != (3,3) or not np.isfinite(o["K"]).all() or float(o["sample_offset"]) != 8.5 or float(o["sample_stride"]) != 16:
        raise ValueError("Invalid observation calibration")
    rotations = o["world_to_cv"][:,:3,:3]
    if not np.allclose(o["world_to_cv"][:,3,:],[0,0,0,1]) or not np.allclose(rotations.transpose(0,2,1)@rotations,np.eye(3),atol=1e-5) or not np.allclose(np.linalg.det(rotations),1,atol=1e-5):
        raise ValueError("Non-rigid observation poses")
