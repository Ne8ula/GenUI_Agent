"""Bounded public ARKitScenes acquisition; never downloads models or starts compute."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import urllib.request
import zipfile

BASE = "https://docs-assets.developer.apple.com/ml-research/datasets/arkitscenes/v1"
REVISION = "474aaa83d7b1c9080619d8485de2d7c885c01fc5"
REPO = f"https://raw.githubusercontent.com/apple-aiml-research/ARKitScenes/{REVISION}"
MAX_ARCHIVE = 256 * 1024**2
MAX_EXPANDED = 1024**3


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def download(url, target, limit, *, expected=None):
    """One attempt, bounded stream, immutable target; interrupted .part is retained."""
    if target.exists() or target.with_suffix(target.suffix + ".part").exists():
        raise ValueError(f"Existing acquisition; inspect rather than overwrite: {target}")
    part = target.with_suffix(target.suffix + ".part")
    headers = {"User-Agent": "EVA-ARKitScenes-research/1"}
    if expected is not None:
        if (not isinstance(expected, dict) or set(expected) != {'bytes', 'etag'}
                or type(expected['bytes']) is not int or not 0 < expected['bytes'] <= limit
                or not isinstance(expected['etag'], str) or not expected['etag']
                or len(expected['etag']) > 256 or any(ord(c) < 32 or ord(c) == 127 for c in expected['etag'])):
            raise ValueError('Invalid frozen download metadata')
        headers['If-Match'] = expected['etag']
        headers['Accept-Encoding'] = 'identity'
    request = urllib.request.Request(url, headers=headers)
    digest, count = hashlib.sha256(), 0
    with _opener.open(request, timeout=60) as response:
        if response.geturl() != url:
            raise ValueError("Unexpected download redirect")
        size = response.headers.get("Content-Length")
        if expected is not None and (
                len(response.headers.get_all('Content-Length', [])) != 1
                or len(response.headers.get_all('ETag', [])) != 1
                or response.headers.get_all('Content-Encoding', []) not in ([], ['identity'])
                or response.headers.get_all('Transfer-Encoding', [])):
            raise ValueError('Ambiguous or transformed frozen download headers')
        if expected is not None and (getattr(response, 'status', None) != 200
                or size is None or int(size) != expected['bytes']
                or response.headers.get('ETag') != expected['etag']):
            raise ValueError(f"Frozen download metadata changed: status={getattr(response, 'status', None)!r}, "
                             f"bytes={size!r}, etag={response.headers.get('ETag')!r}")
        if size and int(size) > limit:
            raise ValueError("Asset exceeds download bound")
        with part.open("xb") as output:
            while expected is None or count < expected['bytes']:
                # Frozen Content-Length frames the body; never read beyond its approved budget.
                chunk = response.read(min(1024 * 1024, expected['bytes']-count) if expected else 1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > limit:
                    raise ValueError("Asset exceeded download bound")
                output.write(chunk)
                digest.update(chunk)
        if size and int(size) != count:
            raise ValueError("Incomplete download")
    part.rename(target)
    return {"url": url, "file": target.name, "bytes": count,
            "sha256": digest.hexdigest(),
            "integrity": "local transfer hash; publisher digest unavailable"}


def extract(archive, destination):
    """Validate all entries before extracting; reject links, traversal and zip bombs."""
    if destination.exists():
        raise ValueError("Extraction target already exists")
    with zipfile.ZipFile(archive) as handle:
        entries = handle.infolist()
        if len(entries) > 100000 or sum(e.file_size for e in entries) > MAX_EXPANDED:
            raise ValueError("Expanded archive exceeds bound")
        names = set()
        for entry in entries:
            name = entry.orig_filename
            path = PurePosixPath(name)
            if (not name or "\x00" in name or "\\" in name or ":" in name or path.is_absolute()
                    or ".." in path.parts or stat.S_ISLNK(entry.external_attr >> 16)
                    or name.casefold() in names):
                raise ValueError("Unsafe or duplicate archive path")
            names.add(name.casefold())
            if entry.file_size > 32 * 1024**2 or entry.flag_bits & 1:
                raise ValueError("Oversized or encrypted archive member")
        destination.mkdir(parents=True)
        for entry in entries:
            target = destination.joinpath(*PurePosixPath(entry.filename).parts)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with handle.open(entry) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--split", choices=["Training", "Validation"], default="Validation")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"\d{8}", args.video_id):
        parser.error("Expected eight-digit capture ID")
    root = args.output_dir.resolve()
    # Repository-specific isolation: public benchmark assets are never app assets.
    private = Path(__file__).resolve().parents[2] / ".local" / "reconstruction"
    if not root.is_relative_to(private.resolve()):
        parser.error("Use a new output folder under .local/reconstruction")
    root.mkdir(parents=True, exist_ok=False)
    records = []
    for url, name, cap in [
        (f"{REPO}/LICENSE", "LICENSE.txt", 65536),
        (f"{BASE}/raw/metadata.csv", "metadata.csv", 2 * 1024**2),
        (f"{BASE}/upsampling/{args.split}/{args.video_id}.zip", "capture.zip", MAX_ARCHIVE),
    ]:
        record = download(url, root / name, cap)
        records.append(record)
        (root / "acquisition.json").write_text(json.dumps({
            "dataset": "ARKitScenes", "video_id": args.video_id, "split": args.split,
            "repository_revision": REVISION, "assets": records,
            "status": "acquiring", "attempts": 1,
        }, indent=2), encoding="utf-8")
        print(json.dumps(record), flush=True)
    extract(root / "capture.zip", root / "extracted")
    manifest = json.loads((root / "acquisition.json").read_text())
    manifest.update(status="downloaded-and-extracted", role="benchmark-input-and-reference-only",
                    model_execution="not-run", boundary="not-yet-reviewed")
    (root / "acquisition.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
