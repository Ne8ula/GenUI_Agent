"""Explicit assumed spaces behind source-background portals; preserve v4 geometry."""
import argparse
import json
from pathlib import Path
import numpy as np
import open3d as o3d
from full_room import context, load, topology
from genrc_contract import sha256, write_json


# Scene-specific hypotheses from the measured portal exits, not recovered rooms.
SPACES = [
    {"name":"east room", "min":[7.1,-1.2,-.01], "max":[10.2,4.5,2.61], "open":[[0,0]]},
    {"name":"east return", "min":[6.,-1.2,-.01], "max":[7.1,-.3,2.61], "open":[[0,1],[1,1]]},
    {"name":"west alcove", "min":[-.6,-2.5,-.01], "max":[.3,-1.8,2.61], "open":[[0,1]]},
    {"name":"south alcove", "min":[1.95,-4.6,-.01], "max":[2.75,-3.7,2.61], "open":[[1,1]]},
]


def enclosure(spaces=SPACES, spacing=.05):
    vertices, faces, colors, records = [], [], [], []
    offset = 0
    for space in spaces:
        lo, hi = np.array(space["min"]), np.array(space["max"])
        for axis in range(3):
            axes = [a for a in range(3) if a != axis]
            for side in (0,1):
                if [axis, side] in space["open"]:
                    continue
                u = np.linspace(lo[axes[0]],hi[axes[0]],int(np.ceil((hi[axes[0]]-lo[axes[0]])/spacing))+1)
                v = np.linspace(lo[axes[1]],hi[axes[1]],int(np.ceil((hi[axes[1]]-lo[axes[1]])/spacing))+1)
                vv,uu = np.meshgrid(v,u,indexing="ij")
                points = np.empty((uu.size,3))
                points[:,axis] = (lo if side == 0 else hi)[axis]
                points[:,axes[0]],points[:,axes[1]] = uu.ravel(),vv.ravel()
                ids = np.arange(uu.size).reshape(uu.shape)
                a,b,c,d = ids[:-1,:-1].ravel(),ids[:-1,1:].ravel(),ids[1:,:-1].ravel(),ids[1:,1:].ravel()
                tri = np.concatenate([np.stack([a,b,c],1),np.stack([b,d,c],1)])
                # Restrained authored materials, with metric plank spacing on the
                # floor. Colors are artistic treatment, not recovered source RGB.
                if axis == 2 and side == 0:
                    plank = np.floor(points[:,1]/.18)
                    shade = .96+.025*np.sin(plank*2.399)
                    seam = np.minimum(np.mod(points[:,1],.18),.18-np.mod(points[:,1],.18)) < .006
                    shade[seam] *= .94
                    rgb = np.array([172,158,136])[None,:]*shade[:,None]/255
                else:
                    palette = [214,211,201] if axis == 2 else ([188,181,164] if axis == 0 else [202,195,177])
                    rgb = np.broadcast_to(np.array(palette)/255,(len(points),3)).copy()
                    # Gentle floor/ceiling contact shading defines volume.
                    edge = np.minimum(points[:,2]-lo[2],hi[2]-points[:,2])
                    if axis < 2:
                        rgb *= (1-.07*np.exp(-np.maximum(edge,0)/.12))[:,None]
                records.append({"space":space["name"],"axis":axis,"side":side,"triangles":len(tri)})
                vertices.append(points);faces.append(tri+offset);colors.append(rgb);offset += len(points)
    mesh = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(np.concatenate(vertices)),
                                     o3d.utility.Vector3iVector(np.concatenate(faces)))
    mesh.vertex_colors = o3d.utility.Vector3dVector(np.concatenate(colors))
    return mesh, records


def run(source, output):
    data, poses, unit, K, _ = context()
    report = json.loads((source/"report.json").read_text())
    if sha256(source/"room.ply") != report["mesh_sha256"]:
        raise ValueError("Source candidate changed")
    output.mkdir(parents=True,exist_ok=False)
    base = o3d.io.read_triangle_mesh(str(source/"room.ply"))
    extra, records = enclosure()
    baseline = o3d.t.geometry.RaycastingScene()
    baseline.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(base))
    rejected = np.zeros(len(extra.triangles),bool)
    yy,xx = np.indices((768,1024))
    cv_rays = np.stack([xx+.5,yy+.5,np.ones_like(xx)],-1) @ np.linalg.inv(K).T
    checks = []
    for iteration in range(6):
        active_ids = np.flatnonzero(~rejected)
        active = o3d.geometry.TriangleMesh(extra.vertices, o3d.utility.Vector3iVector(np.asarray(extra.triangles)[active_ids]))
        proposed = o3d.t.geometry.RaycastingScene()
        proposed.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(active))
        previous_rejected = int(rejected.sum())
        for frame in range(100):
            pose = poses[frame]; directions = cv_rays @ pose[:3,:3].T
            rays = o3d.core.Tensor(np.concatenate([np.broadcast_to(pose[:3,3],directions.shape),directions],-1).astype(np.float32))
            old = baseline.cast_rays(rays)["t_hit"].numpy()
            result = proposed.cast_rays(rays)
            new,ids = result["t_hit"].numpy(),result["primitive_ids"].numpy()
            reference = load(data,frame,"depth_meters")*-unit[...,2]
            valid = np.isfinite(reference)&(reference>.1)
            # Repeat after removal: an occluded offending face can become visible.
            conflict = np.isfinite(new)&((np.isfinite(old)&(new<old-.005))|(valid&(new<reference-.02)))
            rejected[active_ids[np.unique(ids[conflict])]] = True
            checks.append({"iteration":iteration,"frame":frame,"proposed_conflict_pixels":int(conflict.sum())})
            if frame%20 == 0:
                print("Visibility veto",iteration,frame,"rejected faces",int(rejected.sum()),flush=True)
        if int(rejected.sum()) == previous_rejected:
            break
    else:
        raise ValueError("Assumed-space visibility veto did not converge")
    faces = np.asarray(extra.triangles)[~rejected]
    used,remap = np.unique(faces,return_inverse=True)
    v,f,c = np.asarray(base.vertices),np.asarray(base.triangles),np.asarray(base.vertex_colors)
    combined = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(np.concatenate([v,np.asarray(extra.vertices)[used]])),
        o3d.utility.Vector3iVector(np.concatenate([f,remap.reshape(-1,3)+len(v)])))
    combined.vertex_colors = o3d.utility.Vector3dVector(np.concatenate([c,np.asarray(extra.vertex_colors)[used]]))
    o3d.io.write_triangle_mesh(str(output/"room.ply"),combined)
    write_json(output/"assumed-space.json",{"spaces":SPACES,"surfaces":records,"spacing_m":.05,
        "proposed_faces":len(extra.triangles),"rejected_faces":int(rejected.sum()),"retained_faces":len(faces),
        "visibility_checks":checks,"policy":"New background coverage is intentional only in this explicitly assumed-space category."})
    write_json(output/"report.json",{
        **report,"method":report["method"]+" plus explicitly assumed adjoining spaces",
        "mesh_sha256":sha256(output/"room.ply"),"prior_candidate_sha256":report["mesh_sha256"],
        "assumed_space":{"base_vertices":len(v),"base_faces":len(f),"vertices":len(used),"faces":len(faces)},
        "navigation_regions_m":[report["navigation_bounds_m"]]+[[s["min"],s["max"]] for s in SPACES],
        "bounds_m":[combined.get_min_bound().tolist(),combined.get_max_bound().tolist()],
        "topology":topology(combined),"script_sha256":sha256(Path(__file__)),
        "limitations":report["limitations"]+["Adjoining room layout and material colors are authored assumptions replacing previously unmodelled source background."]})
    print("Assumed-space faces",len(faces),flush=True)


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    args=parser.parse_args()
    run(args.source,args.output)
