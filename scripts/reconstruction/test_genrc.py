import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import subprocess
import sys
import pickle
from unittest.mock import Mock, patch

import numpy as np
from genrc_contract import validate_manifest, unpack_bundle, verify_models, write_json, sha256
from genrc_geometry import unproject, triangulate, free_space_filter, validate_observations, load_observations, filter_faces


def manifest():
    record = {"sha256":hashlib.sha256(b"x").hexdigest(),"bytes":1}
    return {"version":1,"scene":"ai_001_004","condition":"genrc-perspective-pilot",
        "source":{"mesh_sha256":record["sha256"],"report_sha256":"0"*64,"input_manifest_sha256":"1"*64,"license":"CC-BY-SA-3.0","attribution":"Apple"},
        "files":{"room.ply":record,"observations.npz":record},
        "camera":{"frame":37,"K":[[500,0,256],[0,500,256],[0,0,1]],"world_from_cv_m":np.eye(4).tolist(),"crop":[128,0,768,768,512]},
        "bounds_m":[[-5,-5,-5],[5,5,5]],"seed":0,"steps":30,"roi":[0,0,512,512],"seam_m":.01,
        "prompt":"Existing room","evaluation_status":"development-candidate"}


class ContractTests(unittest.TestCase):
    def test_cloud_result_is_portable_without_model_libraries(self):
        from genrc_worker import execute
        class CloudVersion(str):
            def __reduce_ex__(self, protocol):
                raise AssertionError("Cloud-only class leaked across the return boundary")
        cloud_result = {"status":"passed","torch":CloudVersion("1.13.1+cu117")}
        with tempfile.TemporaryDirectory() as d:
            volume = Mock()
            modal = Mock()
            modal.Volume.from_name.return_value = volume
            with patch.dict(sys.modules, {"modal":modal}), \
                 patch("genrc_worker.Path", return_value=Path(d)), \
                 patch("genrc_worker.subprocess.check_output", return_value="runtime fixture"), \
                 patch("genrc_worker.smoke", return_value=cloud_result):
                result = execute("a"*32, None, "smoke", None)
            self.assertIs(type(result["torch"]), str)
            self.assertEqual(pickle.loads(pickle.dumps(result)), cloud_result)
            with zipfile.ZipFile(Path(d)/("a"*32)/"artifacts.zip") as archive:
                self.assertEqual(json.loads(archive.read("summary.json")), result)
            self.assertEqual(volume.commit.call_count, 2)

    def test_cloud_submit_requires_explicit_flag_before_client_import(self):
        with tempfile.TemporaryDirectory() as d:
            result=subprocess.run([sys.executable,str(Path(__file__).with_name("genrc_modal.py")),"smoke","--output",str(Path(d)/"out")],capture_output=True,text=True)
            self.assertEqual(result.returncode,2)
            self.assertIn("requires --confirm-billable",result.stderr)
            self.assertFalse((Path(d)/"out").exists())
    def test_reject_unknown_authority(self):
        m=manifest(); m["allow_network"]=True
        with self.assertRaises(ValueError): validate_manifest(m)

    def test_reject_nan_and_excessive_settings(self):
        for key,value in (("seam_m",float("nan")),("steps",51),("seed",True),("roi",[-1,0,512,512])):
            m=manifest(); m[key]=value
            with self.assertRaises(ValueError): validate_manifest(m)

    def test_reject_reflected_pose(self):
        m=manifest();m["camera"]["world_from_cv_m"][0][0]=-1
        with self.assertRaises(ValueError): validate_manifest(m)

    def test_archive_integrity_and_traversal(self):
        for extra,content in ((None,b"x"),("../outside",b"x"),(None,b"bad")):
            payload=io.BytesIO()
            with zipfile.ZipFile(payload,"w") as z:
                z.writestr("manifest.json",json.dumps(manifest()))
                z.writestr("room.ply",content);z.writestr("observations.npz",b"x")
                if extra:z.writestr(extra,b"bad")
            with tempfile.TemporaryDirectory() as d:
                if extra or content != b"x":
                    with self.assertRaises(ValueError):unpack_bundle(payload.getvalue(),Path(d)/"input")
                else:
                    self.assertEqual(unpack_bundle(payload.getvalue(),Path(d)/"input")["scene"],"ai_001_004")

    def test_model_cache_tampering(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); (root/"stable-diffusion-2-inpainting").mkdir()
            names=["normal_scannet.pt","irondepth_scannet.pt","stable-diffusion-2-inpainting/model_index.json"]
            for n in names:(root/n).write_bytes(b"x")
            source={"url":"https://example.com/original","revision":"pinned","license":"recorded"}
            m={"version":1,"sources":{"irondepth":source,"stable-diffusion-2-inpainting":source},
               "files":{n:{"bytes":1,"sha256":sha256(root/n)} for n in names}}
            write_json(root/"models.json",m)
            with self.assertRaises((ValueError,json.JSONDecodeError)):verify_models(root)
            # Populate structural assets; byte integrity is separate from weight compatibility.
            index={"_class_name":"StableDiffusionInpaintPipeline"}
            for component in ("unet","vae","text_encoder","tokenizer","scheduler"):
                directory=root/"stable-diffusion-2-inpainting"/component;directory.mkdir()
                index[component]=["library","class"]
                config_name="tokenizer_config.json" if component=="tokenizer" else "scheduler_config.json" if component=="scheduler" else "config.json"
                (directory/config_name).write_text("{}")
                if component in ("unet","vae","text_encoder"):(directory/"model.bin").write_bytes(b"weights")
            (root/"stable-diffusion-2-inpainting/model_index.json").write_text(json.dumps(index))
            (root/"stable-diffusion-2-inpainting/tokenizer/vocab.json").write_text("{}")
            (root/"stable-diffusion-2-inpainting/tokenizer/merges.txt").write_text("merges")
            m["files"]={p.relative_to(root).as_posix():{"bytes":p.stat().st_size,"sha256":sha256(p)} for p in root.rglob("*") if p.is_file() and p.name!="models.json"}
            write_json(root/"models.json",m)
            verify_models(root)
            (root/names[0]).write_bytes(b"y")
            with self.assertRaises(ValueError):verify_models(root)


class GeometryTests(unittest.TestCase):
    def test_post_snap_degenerate_faces_rejected(self):
        points=np.array([[0,0,1],[0,0,1],[.01,0,1]])
        self.assertEqual(len(filter_faces(points,np.array([[0,1,2]]),[[-1,-1,0],[1,1,2]])),0)

    def test_oversized_observation_zip_rejected_before_decode(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"observations.npz"
            with zipfile.ZipFile(path,"w") as z:z.writestr("unexpected.npy",b"x")
            with self.assertRaises(ValueError):load_observations(path)

    def test_huge_npy_header_rejected_before_allocation(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"observations.npz"
            header=io.BytesIO()
            np.lib.format.write_array_header_1_0(header,{"descr":"<f4","fortran_order":False,"shape":(2**40,)})
            with zipfile.ZipFile(path,"w") as z:
                for name in ("depth","world_to_cv","K","frames","sample_offset","sample_stride"):
                    z.writestr(name+".npy",header.getvalue())
            with self.assertRaises(ValueError):load_observations(path)

    def test_half_pixel_metric_pose(self):
        pose=np.eye(4);pose[:3,3]=[3,4,5]
        points=unproject(np.full((2,2),2.),np.array([[2,0,1],[0,2,1],[0,0,1]]),pose)
        np.testing.assert_allclose(points[0,0],[2.5,3.5,7])

    def test_cropped_camera_ray_matches_original(self):
        K=np.array([[900.,0,512],[0,900.,384],[0,0,1]])
        crop=K.copy();crop[0,2]-=128;crop[:2]*=2/3
        for u,v in ((.5,.5),(256.5,256.5),(511.5,511.5)):
            np.testing.assert_allclose(np.linalg.inv(crop)@[u,v,1],np.linalg.inv(K)@[u*1.5+128,v*1.5,1])

    def test_only_faces_touching_active_region_added(self):
        depth=np.ones((4,4));active=np.zeros((4,4),bool);active[1,1]=True
        _,faces=triangulate(depth,np.diag([100.,100.,1]),np.eye(4),active,~active,[[-1,-1,0],[1,1,2]])
        self.assertGreater(len(faces),0)
        self.assertTrue((faces==5).any(1).all())

    def test_nonfinite_and_outside_roi_holes_not_fused(self):
        depth=np.ones((4,4));depth[1,1]=np.nan
        active=np.zeros((4,4),bool);active[1,1]=True
        _,faces=triangulate(depth,np.diag([100.,100.,1]),np.eye(4),active,np.zeros((4,4),bool),[[-1,-1,0],[1,1,2]])
        self.assertEqual(len(faces),0)

    def test_room_bounds_and_long_edges(self):
        depth=np.ones((3,3));active=np.ones((3,3),bool)
        _,faces=triangulate(depth,np.eye(3),np.eye(4),active,~active,[[-10,-10,0],[10,10,2]])
        self.assertEqual(len(faces),0)
        _,faces=triangulate(depth,np.diag([100.,100.,1]),np.eye(4),active,~active,[[-1,-1,2],[1,1,3]])
        self.assertEqual(len(faces),0)

    def test_free_space_rejection(self):
        points=np.array([[0,0,1],[.01,0,1],[0,.01,1],[0,0,3],[.01,0,3],[0,.01,3]])
        observations={"world_to_cv":np.eye(4)[None],"K":np.eye(3),"depth":np.full((1,2,2),2.),"sample_offset":0,"sample_stride":1}
        faces,report=free_space_filter(points,np.array([[0,1,2],[3,4,5]]),observations)
        np.testing.assert_array_equal(faces,[[3,4,5]])
        self.assertEqual(report["rejected_triangles"],1)

    def test_heldout_frames_cannot_enter_depth_checks(self):
        o={"depth":np.ones((96,48,64)),"world_to_cv":np.repeat(np.eye(4)[None],96,0),"K":np.eye(3),
           "frames":np.array([i for i in range(100) if i not in (12,37,62,87)]),"sample_offset":8.5,"sample_stride":16}
        validate_observations(o)
        o["frames"][0]=37
        with self.assertRaises(ValueError):validate_observations(o)


if __name__ == "__main__":unittest.main()
