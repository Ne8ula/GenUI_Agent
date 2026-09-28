#!/usr/bin/env bash
# Paste this entire script into a NEW Claude Code web environment's Setup script field.
# VM-only provisioning: no repository assumption, background server, AI call or model configuration.
# Figma Weave graph nodes are NOT Node.js/npm packages. This script does not install
# a Weave SDK/server, authenticate Figma, edit a graph/frame, upload assets or run generation.
# Toolchain readiness does not clear AGENTS.md / docs/design/FIGMA_WEAVE.md's UI gate.
set -euo pipefail

if [[ "$(uname -s)" != Linux ]]; then
  printf '%s\n' 'This provisioning script is for the Linux Cloud VM, not the Windows checkout.' >&2
  exit 1
fi
if [[ "$(id -u)" != 0 ]]; then
  printf '%s\n' 'Run this in the Cloud environment setup field (root), not a restricted task shell.' >&2
  exit 1
fi
version="${EVA_NODE_VERSION:-24.14.0}"
tools="${EVA_TOOLCHAIN_ROOT:-/opt/eva-w3}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { printf '%s\n' 'Invalid Node version.' >&2; exit 1; }
[[ "$tools" = /* && "$tools" != / ]] || { printf '%s\n' 'Toolchain root must be an absolute non-root directory.' >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
if ! command -v ffmpeg >/dev/null || ! command -v curl >/dev/null || ! command -v xz >/dev/null; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl xz-utils ffmpeg
fi
case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) printf '%s\n' 'Unsupported CPU architecture; no fallback download attempted.' >&2; exit 1 ;;
esac
node_home="$tools/node-v$version"
if [[ -x "$node_home/bin/node" ]]; then
  [[ "$("$node_home/bin/node" --version)" == "v$version" ]] || { printf '%s\n' 'Existing toolchain version differs; not overwriting it.' >&2; exit 1; }
else
  [[ ! -e "$node_home" ]] || { printf '%s\n' 'Incomplete existing toolchain; inspect it rather than overwriting.' >&2; exit 1; }
  temp="$(mktemp -d)"
  trap 'rm -rf -- "$temp"' EXIT
  archive="node-v$version-linux-$arch.tar.xz"
  curl --fail --location --silent --show-error "https://nodejs.org/dist/v$version/$archive" -o "$temp/$archive"
  curl --fail --location --silent --show-error "https://nodejs.org/dist/v$version/SHASUMS256.txt" -o "$temp/SHASUMS256.txt"
  awk -v name="$archive" '$2 == name { print }' "$temp/SHASUMS256.txt" > "$temp/checksum.txt"
  [[ "$(wc -l < "$temp/checksum.txt")" -eq 1 ]] || { printf '%s\n' 'Official archive checksum not found.' >&2; exit 1; }
  (cd "$temp" && sha256sum --check checksum.txt)
  tar -xJf "$temp/$archive" -C "$temp"
  mkdir -p "$tools"
  mv "$temp/node-v$version-linux-$arch" "$node_home"
fi
mkdir -p "${PLAYWRIGHT_BROWSERS_PATH:-$tools/ms-playwright}"
"$node_home/bin/node" --version
ffmpeg -version
printf '%s\n' 'Toolchain ready only. In the task, run bash week3/cloud/session.sh prepare after the reviewed repository snapshot is available.'
printf '%s\n' 'No dev server or Claude loop was started; running processes are not preserved in the Cloud environment cache.'
printf '%s\n' 'Weave readiness is NOT verified. Before every UI pass, obtain and inspect fresh images and motion video via direct Weave models OR reusable workflows, with per-run cost approval.'
if [[ -n "${EVA_WEAVE_TOOL_REF:-}" ]]; then
  printf '%s\n' 'A Weave workflow hint was supplied; inspect its actual contract read-only, or discover a suitable direct Weave model. No manual graph is required per task.'
else
  printf '%s\n' 'No Weave workflow hint is set. Discover a direct Weave model, select an existing workflow, or request the current pass packet from the connected main session.'
fi
printf 'Packet destination hint: %s/<pass-id>/REVIEW.md (not created or validated by setup).\n' "${EVA_WEAVE_PACKET_ROOT:-week3/docs/design/revisions}"
printf '%s\n' 'Use references/images/, references/videos/, references/contact-sheet.png, implementation/before/, implementation/after/ and provenance.json; link fixed-location captures rather than duplicating them.'
printf '%s\n' 'Missing access, usable Weave model/workflow, finite cost approval or inspectable output blocks UI edits, not unrelated non-UI preparation.'
printf '%s\n' 'Do not copy credentials, add a duplicate MCP route, auto-run generation, or treat local OAuth/reminder hooks as Cloud verification.'
