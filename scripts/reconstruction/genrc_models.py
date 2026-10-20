"""Seal an explicitly sourced LOCAL model cache; never download or execute weights."""
import argparse
import json
from pathlib import Path
from genrc_contract import sha256, write_json, verify_models


def seal(root, sources_file):
    root = root.resolve()
    if (root/"models.json").exists():
        raise ValueError("Existing model manifest is immutable; use a new cache directory")
    sources = json.loads(sources_file.read_text(encoding="utf-8"))
    files = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Materialize cache symlinks before sealing")
        if path.is_file():
            files[path.relative_to(root).as_posix()] = {"bytes":path.stat().st_size,"sha256":sha256(path)}
    write_json(root/"models.json",{"version":1,"sources":sources,"files":files})
    try:
        verify_models(root)
    except Exception:
        (root/"models.json").unlink()  # only the new manifest created by this call
        raise
    return sha256(root/"models.json")


if __name__ == "__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--models",type=Path,required=True)
    p.add_argument("--sources",type=Path,required=True,help="JSON with irondepth and stable-diffusion-2-inpainting source URL, revision, license")
    a=p.parse_args()
    print(seal(a.models,a.sources))
