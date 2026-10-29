"""Modal-side FFS scene reduction: stream one colour laser scan from Zenodo, voxel-average it, return a PLY.
The full scan never reaches the local PC. Output is display geometry, not a registered or cleaned scan."""
import hashlib
import json
import tempfile

import numpy as np

from ffs_fetch import stream_member

# Larger records spill to Modal blob upload, which restrict_modal_access refuses (401 in the v1 attempt).
CHUNK = 1024**2


def voxel_reduce(xyz, rgb, max_points, voxel=0.01):
    """Average position and colour per voxel, doubling the voxel until the result fits max_points."""
    origin = xyz.min(axis=0)
    while True:
        cells = np.floor((xyz - origin) / voxel).astype(np.int64)
        if cells.max() >= 1 << 21:
            raise ValueError("Scene extent exceeds the voxel key range")
        keys = (cells[:, 0] << 42) | (cells[:, 1] << 21) | cells[:, 2]
        unique, inverse, counts = np.unique(keys, return_inverse=True, return_counts=True)
        if len(unique) <= max_points:
            break
        voxel *= 2
    mean = lambda values: np.bincount(inverse, weights=values, minlength=len(unique)) / counts
    points = np.column_stack([mean(xyz[:, i]) for i in range(3)]).astype(np.float32)
    colours = np.column_stack([mean(rgb[:, i]) for i in range(3)]).round().astype(np.uint8)
    return points, colours, voxel


def ply_bytes(points, colours):
    vertex = np.empty(len(points), dtype=[("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
                                         ("red", "u1"), ("green", "u1"), ("blue", "u1")])
    for i, axis in enumerate("xyz"):
        vertex[axis] = points[:, i]
    for i, channel in enumerate(("red", "green", "blue")):
        vertex[channel] = colours[:, i]
    header = ("ply\nformat binary_little_endian 1.0\n"
              f"element vertex {len(vertex)}\nproperty float x\nproperty float y\nproperty float z\n"
              "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n")
    return header.encode("ascii") + vertex.tobytes()


def reduce_scene(member):
    """Yields ('chunk', bytes) records, then one ('report', json) record."""
    import laspy  # container-only dependency

    with tempfile.NamedTemporaryFile(suffix=".las") as scan:
        streamed = stream_member(member["url"], member["archive_bytes"], member["start"], member["end"],
                                 member["crc32"], scan)
        scan.flush()
        las = laspy.read(scan.name)
    xyz = np.column_stack((las.x, las.y, las.z))
    rgb = np.column_stack((las.red, las.green, las.blue)).astype(np.float64)
    if rgb.max() > 255:  # LAS stores 16-bit colour; most scanners fill the high byte.
        rgb /= 257
    points, colours, voxel = voxel_reduce(xyz, rgb, member["max_points"])
    ply = ply_bytes(points, colours)
    for offset in range(0, len(ply), CHUNK):
        yield "chunk", ply[offset:offset + CHUNK]
    yield "report", json.dumps({
        "kind": "eva-ffs-scene-reduction-v1", "member": member["name"], "streamed_bytes": streamed,
        "source_points": int(len(xyz)), "points": int(len(points)), "voxel_m": voxel,
        "bounds_min": xyz.min(axis=0).tolist(), "bounds_max": xyz.max(axis=0).tolist(),
        "ply_bytes": len(ply), "ply_sha256": hashlib.sha256(ply).hexdigest(),
        "laspy_point_format": int(las.header.point_format.id),
        "limitations": ["Voxel-averaged display points from one scan position; occluded regions stay empty.",
                        "Local scanner coordinates; no georeferencing, cleaning or registration."]})
