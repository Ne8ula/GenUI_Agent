"""Bounded Fictional Forensic Scenes (FFS) acquisition: reads selected members of the remote Zenodo
zips through HTTP range requests, never the whole 19-47 GB archive. Never starts compute."""
import argparse
import fnmatch
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import time
import urllib.error
import urllib.request
import zipfile
import zlib

# Zenodo parts of FFS (Daudigny & Grussenmeyer, Data in Brief 2026, doi:10.1016/j.dib.2026.112825); CC BY-NC-SA 4.0.
RECORDS = {"17151982": "th_0001-0020.zip", "17164106": "th_0021-0040.zip", "17164834": "th_0041-0060.zip",
           "17165128": "th_0061_0080.zip", "18623225": "th_0081-0100.zip"}
LICENSE = "CC-BY-NC-SA-4.0"
READ_AHEAD = 64 * 1024


class RangeFile:
    """Read-only seekable view of a remote file; every read is one bounded range request."""

    def __init__(self, url, size, budget):
        self.url, self.size, self.budget, self.pos, self.fetched, self.cache = url, size, budget, 0, 0, (0, b"")

    def seek(self, offset, whence=0):
        self.pos = {0: offset, 1: self.pos + offset, 2: self.size + offset}[whence]
        return self.pos

    def tell(self):
        return self.pos

    def seekable(self):
        return True

    def read(self, n=-1):
        end = self.size if n is None or n < 0 else min(self.size, self.pos + n)
        if end <= self.pos:
            return b""
        start, cached = self.cache
        if not (start <= self.pos and end <= start + len(cached)):
            # zipfile issues many tiny reads; read ahead so Zenodo's per-minute request limit is not hit.
            start, cached = self.pos, self._fetch(self.pos, min(self.size, max(end, self.pos + READ_AHEAD)))
            self.cache = (start, cached)
        data = cached[self.pos - start:end - start]
        self.pos = end
        return data

    def _fetch(self, start, end):
        self.fetched += end - start
        if self.fetched > self.budget:
            raise ValueError("Range reads exceeded the approved byte budget")
        request = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end - 1}",
                                                            "User-Agent": "EVA-FFS-research/1"})
        for attempt in range(2):
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    if response.status != 206 or response.headers.get("Content-Range") != f"bytes {start}-{end - 1}/{self.size}":
                        raise ValueError("Server did not honour the exact byte range")
                    data = response.read()
                break
            except urllib.error.HTTPError as error:
                # One wait for an explicit rate-limit answer; any other failure stops the acquisition.
                if error.code != 429 or attempt:
                    raise
                time.sleep(min(120, int(error.headers.get("Retry-After", "60"))))
        if len(data) != end - start:
            raise ValueError("Incomplete range response")
        return data


def member_range(remote, info):
    """Byte span of a stored member's data, read from its local header (sizes there may be zeroed)."""
    if info.compress_type != zipfile.ZIP_STORED or info.flag_bits & 1:
        raise ValueError("Only unencrypted stored members can be streamed by range")
    remote.seek(info.header_offset)
    header = remote.read(30)
    if header[:4] != b"PK\x03\x04":
        raise ValueError("Invalid local file header")
    name_length, extra_length = struct.unpack("<HH", header[26:30])
    start = info.header_offset + 30 + name_length + extra_length
    return start, start + info.compress_size


def stream_member(url, archive_bytes, start, end, crc, output, chunk=1024**2):
    """One range request for a large member; the zip's CRC-32 is checked before the caller trusts it."""
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end - 1}", "User-Agent": "EVA-FFS-research/1"})
    count, running = 0, 0
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status != 206 or response.headers.get("Content-Range") != f"bytes {start}-{end - 1}/{archive_bytes}":
            raise ValueError("Server did not honour the exact byte range")
        while data := response.read(min(chunk, end - start - count)):
            count += len(data)
            running = zlib.crc32(data, running)
            output.write(data)
            if count == end - start:
                break
    if count != end - start or running != crc:
        raise ValueError("Streamed member is incomplete or failed its CRC-32")
    return count


def safe_name(info):
    path = PurePosixPath(info.orig_filename)
    return not (not info.orig_filename or "\x00" in info.orig_filename or "\\" in info.orig_filename
                or ":" in info.orig_filename or path.is_absolute() or ".." in path.parts
                or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1)


def select(infos, patterns, member_cap, total_cap):
    """Pick matching members; reject unsafe names and anything beyond the caps before reading a byte."""
    chosen = [i for i in infos if not i.is_dir() and any(fnmatch.fnmatch(i.filename, p) for p in patterns)]
    if any(not safe_name(i) for i in chosen):
        raise ValueError("Unsafe archive member selected")
    if any(i.file_size > member_cap for i in chosen) or sum(i.compress_size for i in chosen) > total_cap:
        raise ValueError("Selection exceeds the approved size bound")
    return chosen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--record", choices=sorted(RECORDS), action="append", required=True)
    parser.add_argument("--member", action="append", default=[], help="fnmatch pattern; omit to list only")
    parser.add_argument("--member-cap-mb", type=int, default=32)
    parser.add_argument("--total-cap-mb", type=int, default=64)
    args = parser.parse_args()
    root = args.output_dir.resolve()
    private = Path(__file__).resolve().parents[2] / ".local" / "reconstruction"
    if not root.is_relative_to(private.resolve()):
        parser.error("Use a new output folder under .local/reconstruction")
    root.mkdir(parents=True, exist_ok=False)
    member_cap, total_cap = args.member_cap_mb * 1024**2, args.total_cap_mb * 1024**2
    manifest = {"dataset": "Fictional Forensic Scenes", "license": LICENSE, "parts": [], "status": "acquiring"}
    for record in args.record:
        key = RECORDS[record]
        url = f"https://zenodo.org/api/records/{record}/files/{key}/content"
        with urllib.request.urlopen(urllib.request.Request(f"https://zenodo.org/api/records/{record}"), timeout=60) as r:
            meta = json.load(r)
        entry = next(f for f in meta["files"] if f["key"] == key)
        if meta["metadata"]["license"]["id"] != LICENSE.lower():
            raise ValueError("Record licence changed; review before acquiring")
        # Central directory reads are small; budget them separately from member bytes.
        remote = RangeFile(url, entry["size"], budget=16 * 1024**2 + total_cap)
        with zipfile.ZipFile(remote) as archive:
            infos = archive.infolist()
            (root / f"{record}-listing.json").write_text(json.dumps(
                [[i.filename, i.file_size, i.compress_size] for i in infos], indent=0), encoding="utf-8")
            chosen = select(infos, args.member, member_cap, total_cap) if args.member else []
            files = []
            for info in chosen:
                target = root.joinpath(*PurePosixPath(info.filename).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                # zipfile verifies each member's CRC-32 as it is read.
                target.write_bytes(archive.read(info))
                files.append({"member": info.filename, "bytes": info.file_size, "crc32": f"{info.CRC:08x}"})
        manifest["parts"].append({"record": record, "archive": key, "archive_bytes": entry["size"],
                                  "archive_md5": entry["checksum"], "members": len(infos),
                                  "range_bytes_read": remote.fetched, "extracted": files})
        (root / "acquisition.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["status"] = "listed" if not args.member else "members-extracted"
    (root / "acquisition.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({p["record"]: [p["members"], p["range_bytes_read"], len(p["extracted"])] for p in manifest["parts"]}))


if __name__ == "__main__":
    main()
