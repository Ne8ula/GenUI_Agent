#!/usr/bin/env bash
# Paste this entire file into the Cloud environment's Setup script field.
# Repo-independent: the checkout path/order is not assumed at provisioning time.
set -euo pipefail

fail() { printf 'Week 4 environment: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Linux" ]] || fail 'This provisioning check is for Linux Cloud, not the Windows demo host.'
for tool in bash git node npm; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required preinstalled tool is missing: $tool. Use a Cloud image with Node 22 or newer; do not install a workstation router."
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Week 4 requires Node >=22; Cloud normally provides Node 22."); process.exit(1); }'

printf 'Week 4 Cloud toolchain preflight\n'
node --version
npm --version
git --version
if command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1; then
  cargo --version
  rustc --version
else
  printf 'Rust toolchain unavailable: continue Node-only foundations; record Rust checks as blocked.\n'
fi

printf '%s\n' \
  'No dependencies, model weights, browsers, provider credentials or desktop packages installed.' \
  'No repository files or global settings changed.' \
  'After checkout, the task prompt runs: bash week4/scripts/cloud-setup.sh' \
  'Fresh Weave references and spending approval are still required for UI work.'
