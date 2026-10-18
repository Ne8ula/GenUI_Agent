# Hypersim living-room baseline

The owner accepted Apple Hypersim and selected **ai_001_004** on 2026-10-18. This is a synthetic living room with one documented camera trajectory, cam_00. Scene selection is accepted; the reconstruction and research milestones are not yet owner-accepted.

## Bounded tooling decision

Implement an offline CPU baseline using supplied metric ray distances, camera poses and per-scene intrinsics. Use CPython 3.12 in `.local/reconstruction/venv` with the pinned [requirements](../../../scripts/reconstruction/requirements.txt): NumPy, h5py, Pillow and Open3D. Install only into this isolated environment. No model weights, training, CUDA setup, paid services or original mesh purchase are required. Frontend integration and artistic presentation are separate work subject to the fresh Weave prerequisite.

The [fixture](ai_001_004.json) freezes 20 integration frames and four distinct evaluation frames before reconstruction. Download only selected entries from Apple's scene archive, with a 512 MiB transfer limit and 1 GiB extraction limit. Keep large inputs/outputs and the environment under the git-ignored `.local/reconstruction/`; retain input hashes and a compact evidence report. Cancel with Ctrl+C; incomplete outputs must not be presented as completed runs.

## Method and evidence limits

Convert radial distance to planar camera depth using the official scene-specific ray matrix. Convert camera translations from asset units to meters. Hypersim cameras use x-right/y-up/z-back; Open3D integration uses x-right/y-down/z-forward. Fuse only integration-frame depth into a 2 cm TSDF, then extract a triangle mesh. Use source HDR color with an explicitly recorded tone mapping for display.

Audit reconstructed pixel positions against supplied position maps on two integration frames. This checks coordinate implementation, not independent geometry accuracy. Raycast the mesh at the four withheld camera poses and report depth error and hit coverage over valid reference pixels. These views come from the same synthetic scene and trajectory; this is within-scene reconstruction testing, not generalization or real-world validation. No scene completion, object detection, automatic memory anchors or photo-only reconstruction is claimed.

Raw output stays separate from any future artistic treatment and user memory. Unknown regions remain unknown. No original full asset mesh is bundled; its separate purchase is unnecessary for this bounded test. The downloaded upstream `LICENSE.txt` covers toolkit software; the dataset's CC BY-SA 3.0 statement is in its README. The run report records that statement at the pinned upstream revision and links the dataset license separately.

## Reproduce and inspect

Use an existing CPython 3.12 interpreter to create `.local/reconstruction/venv` with `python -m venv .local/reconstruction/venv`. The tested environment was Python 3.12.12 on Windows. The [full dependency lock](../../../scripts/reconstruction/requirements-lock-win-py312.txt) records the installed transitive versions; this does not install or start the optional notebook/web tools pulled in by Open3D as services.

From the repository root in PowerShell:

```powershell
$roomPython = '.local/reconstruction/venv/Scripts/python.exe'
& $roomPython -m pip install --only-binary=:all: -r scripts/reconstruction/requirements-lock-win-py312.txt
& $roomPython -m unittest discover -s scripts/reconstruction -p 'test_*.py' -v
& $roomPython scripts/reconstruction/hypersim.py fetch
& $roomPython scripts/reconstruction/hypersim.py reconstruct --output .local/reconstruction/runs/ai_001_004-owner-review
```

Use a fresh output directory for each run. Fetch resumes verified entries; completed cached inputs are hash-checked without network access. The script refuses unsupported intrinsics/dimensions, unreleased selected frames, invalid poses, mismatched hashes and overwriting an existing run. Ctrl+C leaves an incomplete/failed status; interruption during native fusion may not be handled until the current native call returns.

The recorded run is [r02](evidence/r02/report.json), with [all four source/mesh/error comparisons](evidence/r02/evaluation.png), [input hashes and provenance](evidence/r02/input-manifest.json), [source hashes](evidence/r02/source-hashes.json), [16 passing checks](evidence/r02/tests.txt) and [dependency check](evidence/r02/dependency-check.txt). Large local outputs are [mesh](../../../.local/reconstruction/runs/ai_001_004-r02/room-mesh.ply), [point cloud](../../../.local/reconstruction/runs/ai_001_004-r02/room-points.ply) and [camera transforms](../../../.local/reconstruction/runs/ai_001_004-r02/cameras.json); recreate them with the commands above in a new checkout.

## Observed result, 2026-10-18

20 integration frames produced 229,126 mesh vertices, 443,923 triangles and 220,002 exported points. The selected input package is 89,630,751 bytes; measured HTTP response-body transfer was 90,173,383 bytes, below the 512 MiB bound. Coordinate audit p95 discrepancy against supplied position maps was 3.97 mm and 4.16 mm (same-renderer consistency only).

| Withheld frame | Mesh hit coverage over valid reference pixels | Mean radial-depth error on hits | Within 5 cm, including missing pixels as failures |
| --- | ---: | ---: | ---: |
| 0012 | 99.59% | 5.97 mm | 98.59% |
| 0037 | 15.72% | 513.14 mm | 0.65% |
| 0062 | 99.68% | 9.23 mm | 97.95% |
| 0087 | 99.83% | 8.01 mm | 98.33% |

Frame 0037 faces an opening and substantial missing geometry. Do not average away or discard it, claim full-room recovery, or silently change the frozen evaluation set. r01 and r02 produced identical mesh hashes; r02 fixes zero-hit evaluation accounting and clarifies license provenance. The [owner review record](../../design/acceptance/hypersim-ai-001-004-r02.md) is pending.

## Sources inspected

- [Official dataset README](https://github.com/apple-aiml-research/ml-hypersim): data layout, coordinates, release/license and original-asset boundary.
- [Official per-scene intrinsics](https://github.com/apple-aiml-research/ml-hypersim/tree/main/contrib/mikeroberts3000): ray matrix and pixel-center conventions.
- [Camera trajectory catalog](https://raw.githubusercontent.com/apple-aiml-research/ml-hypersim/main/evermotion_dataset/analysis/metadata_camera_trajectories.csv): scene and trajectory identity.
- [Open3D RGB-D integration](https://www.open3d.org/docs/release/tutorial/pipelines/rgbd_integration.html): TSDF and marching-cubes workflow.

Reading depth: official documentation and code/notebook excerpts; no new full-paper review. Dataset-derived evidence carries Apple Hypersim / Evermotion attribution and CC BY-SA 3.0. Preserve the original dataset license with downloaded inputs.
