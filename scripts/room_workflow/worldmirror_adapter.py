"""CPU coordinate adapter; no model imports, downloads or inferred metric scale."""
import numpy as np

# Inspected SAM camera_to_pytorch3d_camera applies rotation only, not its look-at translation.
SAM_SOURCE_REVISION = "f91db411c50efee93d8db7aeb323885650f6f722"
WORLDMIRROR_SOURCE_REVISION = "df9988efb87bfc0f4947eb3889411cf957478b06"
SAM_AXES = np.array([-1., -1., 1.])


def _points(value):
    points = np.asarray(value, dtype=float)
    if points.ndim < 2 or points.shape[-1] != 3 or not np.isfinite(points).all():
        raise ValueError("Expected finite XYZ points")
    return points


def _pose(value):
    pose = np.asarray(value, dtype=float)
    if (pose.shape != (4, 4) or not np.isfinite(pose).all()
            or not np.allclose(pose[3], [0, 0, 0, 1], atol=1e-7)):
        raise ValueError("Expected an affine OpenCV camera-to-world pose")
    rotation = pose[:3, :3]
    if (not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-4)
            or not np.isclose(np.linalg.det(rotation), 1, atol=1e-4)):
        raise ValueError("Camera pose must be proper and rigid; scale is separate")
    return pose


def world_to_camera(points, camera_to_world_pose):
    pose = _pose(camera_to_world_pose)
    return (_points(points)-pose[:3, 3]) @ pose[:3, :3]


def camera_to_world(points, camera_to_world_pose):
    pose = _pose(camera_to_world_pose)
    return _points(points) @ pose[:3, :3].T + pose[:3, 3]


def world_to_sam(points, camera_to_world_pose):
    return world_to_camera(points, camera_to_world_pose)*SAM_AXES


def sam_to_world(points, camera_to_world_pose):
    return camera_to_world(_points(points)*SAM_AXES, camera_to_world_pose)


def external_pointmap(world_points, pose, intrinsics, image_size):
    """Return unbatched HWC float32 for the pinned wrapper, never a filtered PLY."""
    if (not isinstance(image_size, list) or len(image_size) != 2
            or any(type(n) is not int or not 1 <= n <= 1024 for n in image_size)):
        raise ValueError("Invalid pointmap image dimensions")
    camera = world_to_camera(world_points, pose)
    width, height = image_size
    if camera.shape != (height, width, 3):
        raise ValueError("Pointmap must match the exact processed image grid")
    pixels, valid = project(camera, intrinsics)
    yy, xx = np.indices((height, width))
    residual = np.linalg.norm(pixels-np.stack((xx, yy), -1), axis=-1)
    # shortcut: reject any invalid pixel; add explicit validity handling only after testing SAM normalization with missing depth.
    if not valid.all() or residual.max() > .5:
        raise ValueError("Pointmap fails positive-depth or half-pixel reprojection gate")
    result = (camera*SAM_AXES).astype(np.float32)
    if not np.isfinite(result).all():
        raise ValueError("Pointmap exceeds float32 range")
    return result


def _decoded_pose(decoded):
    if not isinstance(decoded, dict) or set(decoded) != {"rotation", "translation", "scale"}:
        raise ValueError("Require final decoded SAM pose, not raw network pose or GLB axes")
    q, t, s = (np.asarray(decoded[k], dtype=float) for k in ("rotation", "translation", "scale"))
    if (q.shape != (4,) or t.shape != (3,) or s.shape != (3,)
            or not all(np.isfinite(v).all() for v in (q, t, s))
            or not np.isclose(q @ q, 1, atol=1e-4) or np.any(s <= 1e-6)
            or np.any(s > 1e4) or not np.allclose(s, s[0])):
        raise ValueError("Invalid decoded quaternion, translation or uniform scale")
    w, x, y, z = q/np.linalg.norm(q)
    rotation = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                         [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                         [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    return rotation, t, s


def object_to_world(vertices, decoded, camera_to_world_pose):
    """Raw decoder vertices only; final pose already includes pointmap denormalization."""
    rotation, translation, scale = _decoded_pose(decoded)
    # SAM compose_transform uses PyTorch3D row vectors: scale, right-multiply R, translate.
    return sam_to_world((_points(vertices)*scale) @ rotation+translation, camera_to_world_pose)


def world_to_object(points, decoded, camera_to_world_pose):
    rotation, translation, scale = _decoded_pose(decoded)
    return (world_to_sam(points, camera_to_world_pose)-translation) @ rotation.T/scale


def pixel_transform(transform):
    """Integer pixel centers, Pillow resize then crop; no dataset calibration."""
    fields = {"source_size", "resized_size", "crop_left_top", "model_size"}
    if not isinstance(transform, dict) or set(transform) != fields:
        raise ValueError("Exact resize/crop metadata is required")
    for key in fields:
        value = transform[key]
        if (not isinstance(value, list) or len(value) != 2
                or any(type(n) is not int or not 0 <= n <= 8192 for n in value)):
            raise ValueError("Invalid pixel transform dimensions")
    source, resized, crop, size = (np.asarray(transform[k]) for k in
                                 ("source_size", "resized_size", "crop_left_top", "model_size"))
    if min(*source, *resized, *size) < 1 or np.any(crop+size > resized) or max(size) > 1024:
        raise ValueError("Resize/crop exceeds image or resource bounds")
    scale = resized/source
    offset = (scale-1)/2-crop
    return np.array([[scale[0], 0, offset[0]], [0, scale[1], offset[1]], [0, 0, 1]])


def preprocess_mask(mask, transform):
    from PIL import Image
    pixel_transform(transform)
    mask = np.asarray(mask)
    if mask.dtype != bool or mask.shape != tuple(reversed(transform["source_size"])):
        raise ValueError("Mask must match the normalized original image")
    left, top = transform["crop_left_top"]
    width, height = transform["model_size"]
    image = Image.fromarray(mask).resize(tuple(transform["resized_size"]), Image.Resampling.NEAREST)
    return np.asarray(image.crop((left, top, left+width, top+height)), dtype=bool)


def project(camera_points, intrinsics):
    points, K = _points(camera_points), np.asarray(intrinsics, dtype=float)
    if (K.shape != (3, 3) or not np.isfinite(K).all() or K[0, 0] <= 0 or K[1, 1] <= 0
            or not np.allclose(K[2], [0, 0, 1], atol=1e-7)):
        raise ValueError("Invalid pixel intrinsics")
    valid = points[..., 2] > 1e-6
    projected = points @ K.T
    pixels = np.zeros(points.shape[:-1]+(2,))
    np.divide(projected[..., :2], projected[..., 2, None], out=pixels, where=valid[..., None])
    return pixels, valid
