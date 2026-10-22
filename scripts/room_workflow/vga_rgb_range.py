"""Bounded fixed-archive VGA RGB acquisition. No models, ground-truth or cloud calls."""
import argparse
import base64
import binascii
import hashlib
import io
import json
from pathlib import Path
import re
import stat
import struct
import urllib.request
import zlib

from PIL import Image, ImageDraw

URL = "https://docs-assets.developer.apple.com/ml-research/datasets/arkitscenes/v1/raw/Validation/42445021/vga_wide.zip"
ARCHIVE_BYTES = 526539780
ETAG = '"62782fa3345f5d58ccabdec8cc5af0ca-8"'
TOTAL_CAP = 32 * 1024**2
MEMBER_CAP = 8 * 1024**2
NAME = re.compile(r"vga_wide/42445021_(\d+\.\d{3})\.png")


def sha(data):
    return hashlib.sha256(data).hexdigest()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Archive redirects are forbidden")


class RangeSource:
    url, archive_bytes, etag, name = URL, ARCHIVE_BYTES, ETAG, NAME

    def __init__(self, archive=None):
        if archive is not None:
            if (not isinstance(archive, dict) or set(archive) != {'video_id', 'split', 'url', 'bytes', 'etag'}
                    or archive['video_id'] not in ('42445021', '45261631')
                    or archive['split'] not in ('Training', 'Validation')
                    or archive['url'] != ('https://docs-assets.developer.apple.com/ml-research/datasets/'
                        f"arkitscenes/v1/raw/{archive['split']}/{archive['video_id']}/vga_wide.zip")
                    or type(archive['bytes']) is not int or not 22 <= archive['bytes'] < 2**32
                    or not isinstance(archive['etag'], str) or not archive['etag'] or len(archive['etag']) > 256
                    or any(ord(c) < 32 or ord(c) == 127 for c in archive['etag'])):
                raise ValueError('Invalid frozen RGB archive descriptor')
            self.url, self.archive_bytes, self.etag = archive['url'], archive['bytes'], archive['etag']
            self.name = re.compile(r'vga_wide/'+archive['video_id']+r'_(\d+\.\d{3})\.png')
        self.opener = urllib.request.build_opener(NoRedirect)
        self.bytes = 0
        with self.opener.open(urllib.request.Request(self.url, method="HEAD"), timeout=45) as response:
            if (response.status != 200 or response.geturl() != self.url
                    or response.headers.get("Content-Length") != str(self.archive_bytes)
                    or response.headers.get("ETag") != self.etag):
                raise ValueError("Archive HEAD differs from frozen review")

    def read(self, offset, length):
        if (type(offset) is not int or type(length) is not int or offset < 0 or length <= 0
                or offset+length > self.archive_bytes or self.bytes+length+1 > TOTAL_CAP):
            raise ValueError("Range exceeds fixed archive or total network bound")
        end = offset+length-1
        request = urllib.request.Request(self.url, headers={
            "Range": f"bytes={offset}-{end}", "If-Match": self.etag, "Accept-Encoding": "identity"})
        with self.opener.open(request, timeout=45) as response:
            if (response.status != 206 or response.geturl() != self.url
                    or response.headers.get("Content-Range") != f"bytes {offset}-{end}/{self.archive_bytes}"
                    or response.headers.get("Content-Length") != str(length)
                    or response.headers.get("ETag") != self.etag
                    or response.headers.get("Content-Encoding") not in (None, "identity")):
                raise ValueError("Server did not honor exact frozen byte range")
            data = response.read(length+1)
            self.bytes += len(data)
            if len(data) != length or self.bytes > TOTAL_CAP:
                raise ValueError("Range body length mismatch")
            return data


def directory(source):
    tail_size = min(65557, source.archive_bytes)
    tail = source.read(source.archive_bytes-tail_size, tail_size)
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0 or pos+22 > len(tail):
        raise ValueError("Missing ZIP end record")
    _, disk, cd_disk, local_count, count, size, offset, comment = struct.unpack_from("<4s4H2LH", tail, pos)
    if (disk or cd_disk or local_count != count or not 0 < count < 10000
            or not 0 < size <= 2*1024**2 or pos+22+comment != len(tail)
            or offset+size != source.archive_bytes-tail_size+pos):
        raise ValueError("Unsupported ZIP directory layout")
    raw = source.read(offset, size)
    entries, cursor, previous_names = [], 0, set()
    for _ in range(count):
        if cursor+46 > len(raw):
            raise ValueError("Truncated ZIP central record")
        row = struct.unpack_from("<4s6H3L5H2L", raw, cursor)
        sig, made, needed, flags, method, _, _, crc, compressed, expanded, nl, el, cl, disk, _, external, start = row
        end = cursor+46+nl+el+cl
        if sig != b"PK\x01\x02" or end > len(raw) or disk or flags != 0 or method not in (0, 8):
            raise ValueError("Unsupported ZIP member")
        name = raw[cursor+46:cursor+46+nl].decode("ascii")
        if (name in previous_names or stat.S_ISLNK(external >> 16) or
                not (name == "vga_wide/" or source.name.fullmatch(name))):
            raise ValueError("Unsafe or duplicate RGB member")
        previous_names.add(name)
        if not 0 <= start < offset or compressed > MEMBER_CAP or expanded > MEMBER_CAP:
            raise ValueError("Member outside size or offset bounds")
        entries.append(dict(name=name, flags=flags, method=method, crc32=crc,
                            compressed_bytes=compressed, expanded_bytes=expanded, header_offset=start))
        cursor = end
    if cursor != len(raw):
        raise ValueError("Unconsumed directory data")
    ordered = sorted(entries, key=lambda e: e["header_offset"])
    for i, entry in enumerate(ordered):
        entry["next_header_offset"] = ordered[i+1]["header_offset"] if i+1 < len(ordered) else offset
        if entry["header_offset"]+30+entry["compressed_bytes"] > entry["next_header_offset"]:
            raise ValueError("Overlapping ZIP member offsets")
    return {e["name"]: e for e in entries}, sha(raw)


def decode_payload(payload, entry):
    if len(payload) != entry["compressed_bytes"] or len(payload) > MEMBER_CAP:
        raise ValueError("Compressed image exceeds frozen size")
    expected = entry["expanded_bytes"]
    if not 0 < expected <= MEMBER_CAP:
        raise ValueError("Expanded image exceeds bound")
    if entry["method"] == 0:
        data = payload
    elif entry["method"] == 8:
        decoder = zlib.decompressobj(-15)
        data = decoder.decompress(payload, expected+1)
        if not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
            raise ValueError("Invalid or oversized deflate stream")
    else:
        raise ValueError("Unsupported compression")
    if len(data) != expected or binascii.crc32(data) & 0xffffffff != entry["crc32"]:
        raise ValueError("Expanded size or CRC32 mismatch")
    return data


def member(source, entry):
    offset = entry["header_offset"]
    header = source.read(offset, 30)
    signature, needed, flags, method, _, _, crc, compressed, expanded, nl, el = struct.unpack("<4s5H3L2H", header)
    if (signature != b"PK\x03\x04" or flags != entry["flags"] or method != entry["method"]
            or crc != entry["crc32"] or compressed != entry["compressed_bytes"]
            or expanded != entry["expanded_bytes"] or nl != len(entry["name"].encode("ascii"))):
        raise ValueError("Local ZIP header differs from directory")
    payload_offset = offset+30+nl+el
    if payload_offset+compressed > entry["next_header_offset"]:
        raise ValueError("Local member overlaps another ZIP record")
    extra = source.read(offset+30, nl+el)
    if extra[:nl] != entry["name"].encode("ascii"):
        raise ValueError("Local ZIP member name mismatch")
    return decode_payload(source.read(payload_offset, compressed), entry)


def acquire(plan_path, output):
    plan = json.loads(plan_path.read_text())
    proposal_path = plan_path.with_name("proposal.json")
    if (plan["archive_url"] != URL or plan["archive_bytes"] != ARCHIVE_BYTES or plan["head_etag"] != ETAG
            or plan["proposal_sha256"] != sha(proposal_path.read_bytes())
            or len(plan["members"]) != 7 or len({e["name"] for e in plan["members"]}) != 7):
        raise ValueError("Frozen acquisition plan mismatch")
    output.mkdir(parents=True, exist_ok=False)
    (output/"source-rgb").mkdir(); (output/"normalized-rgb").mkdir()
    source = RangeSource()
    entries, directory_sha = directory(source)
    records, images = [], []
    receipt = dict(version=1, status="acquiring", url=URL, archive_bytes=ARCHIVE_BYTES,
                   etag=ETAG, plan_sha256=sha(plan_path.read_bytes()),
                   proposal_sha256=plan["proposal_sha256"], directory_sha256=directory_sha,
                   source_kind="official extracted RGB video frames", records=records)
    for selected in plan["members"]:
        entry = entries.get(selected["name"])
        if not entry or any(entry[k] != selected[k] for k in
                ("name", "flags", "method", "crc32", "compressed_bytes", "expanded_bytes", "header_offset")):
            raise ValueError("Fresh directory differs from planned RGB member")
        data = member(source, entry)
        with Image.open(io.BytesIO(data)) as image:
            if image.format != "PNG" or image.size != (640,480) or image.mode != "RGB" or getattr(image,"n_frames",1) != 1:
                raise ValueError("Unexpected VGA RGB image format")
            image.load()
            upright = image.transpose(Image.Transpose.ROTATE_270)
            buffer = io.BytesIO(); upright.save(buffer, format="PNG")
            normalized = buffer.getvalue()
            images.append(upright.copy())
        name = Path(entry["name"]).name
        (output/"source-rgb"/name).open("xb").write(data)
        (output/"normalized-rgb"/name).open("xb").write(normalized)
        records.append(dict(**entry, original_lowres_filename=selected["original_lowres_filename"],
                            timestamp_delta_seconds=selected["timestamp_delta_seconds"],
                            source_path=f"source-rgb/{name}", source_sha256=sha(data), source_bytes=len(data),
                            normalized_path=f"normalized-rgb/{name}", normalized_sha256=sha(normalized),
                            normalized_bytes=len(normalized), source_size=[640,480], normalized_size=[480,640],
                            rotation_clockwise=90, source_role="RGB only; no supplied depth/pose/intrinsics"))
        receipt["network_body_bytes"] = source.bytes
        (output/"acquisition.json").write_text(json.dumps(receipt,indent=2),encoding="utf8")
    receipt["status"]="verified-rgb-only-acquisition-complete"
    (output/"acquisition.json").write_text(json.dumps(receipt,indent=2),encoding="utf8")
    sheet=Image.new("RGB",(7*250,370),"#17201f"); draw=ImageDraw.Draw(sheet)
    for i,(image,record) in enumerate(zip(images,records)):
        image.thumbnail((240,320));sheet.paste(image,(i*250+5,0))
        draw.text((i*250+5,323),f"{i:02d} {Path(record['name']).stem.split('_')[-1]}",fill="white")
        draw.text((i*250+5,338),f"delta {record['timestamp_delta_seconds']:+.3f}s",fill="#edcb82")
    draw.text((5,355),"Actual VGA RGB | fixed90deg clockwise | exploratory coverage proposal, not verified geometry",fill="white")
    sheet.save(output/"vga-seven.jpg",quality=93)
    print(json.dumps({"status":receipt["status"],"network_body_bytes":source.bytes,"manifest_sha256":sha((output/"acquisition.json").read_bytes())}))


def prepare_request(acquisition_dir, output):
    from inference import validate_payload
    receipt_path=acquisition_dir/"acquisition.json"
    receipt=json.loads(receipt_path.read_text())
    if receipt["status"]!="verified-rgb-only-acquisition-complete" or len(receipt["records"])!=7:
        raise ValueError("Verified seven-RGB acquisition required")
    images=[]
    for i,record in enumerate(receipt["records"]):
        name=Path(record["name"]).name
        source=acquisition_dir/"source-rgb"/name
        path=acquisition_dir/"normalized-rgb"/name
        if sha(source.read_bytes())!=record["source_sha256"]:
            raise ValueError("Original VGA bytes changed")
        data=path.read_bytes()
        if sha(data)!=record["normalized_sha256"]:
            raise ValueError("Normalized VGA bytes changed")
        with Image.open(io.BytesIO(data)) as image:
            if image.format!="PNG" or image.size!=(480,640) or image.mode!="RGB":
                raise ValueError("Unexpected normalized image dimensions")
            image.verify()
        images.append({"id":f"arkit_42445021_vga_visual_{i:02d}","sha256":sha(data),
                       "data_base64":base64.b64encode(data).decode("ascii")})
    payload={"version":1,"operation":"analyze","job_id":"arkit_42445021_vga_visual_v1","images":images}
    validate_payload(payload)
    raw=(json.dumps(payload,indent=2)+"\n").encode()
    output.mkdir(parents=True,exist_ok=False)
    (output/"analyze-request.json").open("xb").write(raw)
    manifest={"version":1,"status":"RGB-only-request-prepared-not-executed",
              "job_id":payload["job_id"],"request_sha256":sha(raw),"request_bytes":len(raw),
              "acquisition_manifest_sha256":sha(receipt_path.read_bytes()),
              "proposal_sha256":receipt["proposal_sha256"],"source_records":receipt["records"],
              "images":[{"id":e["id"],"sha256":e["sha256"]} for e in images],
              "boundary":"unconfirmed; doorway/hallway background must not add another room",
              "scope":"Separate exploratory visual-coverage candidate; original pilot unchanged",
              "reference_policy":"RGB only, fixed90deg clockwise. No supplied depth, intrinsics, poses or mesh.",
              "model_execution":False}
    (output/"input-manifest.json").open("x",encoding="utf8").write(json.dumps(manifest,indent=2))
    print(json.dumps({k:v for k,v in manifest.items() if k in ("status","job_id","request_sha256","request_bytes","acquisition_manifest_sha256")}))


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    command=parser.add_mutually_exclusive_group(required=True)
    command.add_argument("--plan",type=Path)
    command.add_argument("--prepare-from",type=Path)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    private=Path(__file__).resolve().parents[2]/".local"/"reconstruction"
    if not args.output.resolve().is_relative_to(private.resolve()):
        parser.error("Fresh private reconstruction output required")
    if args.plan:
        acquire(args.plan,args.output)
    else:
        prepare_request(args.prepare_from,args.output)
