#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

info() {
  printf '[eva-cloud-setup] %s\n' "$1"
}

warn() {
  printf '[eva-cloud-setup] WARNING: %s\n' "$1" >&2
}

fail() {
  printf '[eva-cloud-setup] ERROR: %s\n' "$1" >&2
  exit 1
}

validate_bool() {
  local name="$1"
  local value="$2"

  case "$value" in
    0|1) ;;
    *) fail "$name must be exactly 0 or 1." ;;
  esac
}

script_source="${BASH_SOURCE[0]}"
if [[ "$script_source" != */* ]]; then
  script_source="$(command -v -- "$script_source")"
fi
SCRIPT_DIR="$(cd -- "${script_source%/*}" && pwd -P)"
WEEK4_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_ROOT="$(cd -- "$WEEK4_DIR/.." && pwd -P)"

INSTALL_NODE_DEPS="${EVA_CLOUD_INSTALL_NODE_DEPS-1}"
ALLOW_NPM_SCRIPTS="${EVA_CLOUD_NPM_LIFECYCLE_SCRIPTS-0}"
FETCH_RUST_DEPS="${EVA_CLOUD_FETCH_RUST_DEPS-0}"

validate_bool EVA_CLOUD_INSTALL_NODE_DEPS "$INSTALL_NODE_DEPS"
validate_bool EVA_CLOUD_NPM_LIFECYCLE_SCRIPTS "$ALLOW_NPM_SCRIPTS"
validate_bool EVA_CLOUD_FETCH_RUST_DEPS "$FETCH_RUST_DEPS"

required_files=(
  "$REPO_ROOT/AGENTS.md"
  "$WEEK4_DIR/planning.md"
  "$WEEK4_DIR/DESIGN_PROMPT.md"
)
missing_files=()
for required_file in "${required_files[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    missing_files+=("$required_file")
  fi
done

if (( ${#missing_files[@]} > 0 )); then
  warn "Required repository files are missing from this checkout:"
  for missing_file in "${missing_files[@]}"; do
    printf '  - %s\n' "$missing_file" >&2
  done
  fail "Publish/upload the chosen source branch before running this repository-session bootstrap."
fi

info "Repository-session bootstrap root: $REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not on PATH. Claude Cloud should provide Node 22 or newer; this script will not install it."
fi
if ! node_version="$(node --version 2>/dev/null)"; then
  fail "Node.js was found, but its version could not be read."
fi
node_major="${node_version#v}"
node_major="${node_major%%.*}"
if [[ ! "$node_major" =~ ^[0-9]+$ ]]; then
  fail "Node.js returned an unrecognized version string."
fi
if (( 10#$node_major < 22 )); then
  fail "Node.js 22 or newer is required. Node 24 is recommended for Claude Cloud."
fi
if (( 10#$node_major == 24 )); then
  info "Node.js $node_version detected (recommended major)."
else
  warn "Node.js $node_version meets the supported >=22 range; Node 24 is the recommended Cloud baseline."
fi

if ! command -v npm >/dev/null 2>&1; then
  fail "npm is not on PATH. This script does not install or repair Node tooling."
fi
if ! npm_version="$(npm --version 2>/dev/null)"; then
  fail "npm was found, but its version could not be read."
fi
info "npm $npm_version detected."

cargo_available=0
if command -v cargo >/dev/null 2>&1; then
  if cargo_version="$(cargo --version 2>/dev/null)"; then
    cargo_available=1
    info "$cargo_version detected."
  else
    warn "cargo is on PATH, but its version check failed; Rust fetching will be unavailable."
  fi
else
  warn "cargo is not on PATH; Node-only foundation work remains available."
fi

if command -v rustc >/dev/null 2>&1; then
  if rustc_version="$(rustc --version 2>/dev/null)"; then
    info "$rustc_version detected."
  else
    warn "rustc is on PATH, but its version check failed; Node-only foundation work remains available."
  fi
else
  warn "rustc is not on PATH; Node-only foundation work remains available."
fi

PACKAGE_JSON="$WEEK4_DIR/package.json"
PACKAGE_LOCK="$WEEK4_DIR/package-lock.json"

if [[ -L "$PACKAGE_JSON" ]]; then
  fail "week4/package.json must be a regular in-tree file, not a symbolic link."
fi
if [[ -e "$PACKAGE_JSON" && ! -f "$PACKAGE_JSON" ]]; then
  fail "week4/package.json exists but is not a regular file."
fi

if [[ ! -f "$PACKAGE_JSON" ]]; then
  info "Node dependencies deferred: week4/package.json is absent (valid initial foundation state)."
else
  if [[ -L "$PACKAGE_LOCK" ]]; then
    fail "week4/package-lock.json must be a regular in-tree file, not a symbolic link."
  fi
  if [[ ! -f "$PACKAGE_LOCK" ]]; then
    fail "week4/package.json exists without week4/package-lock.json. Commit the reviewed lockfile; setup will not create or change it."
  fi

  if ! node - "$PACKAGE_JSON" <<'NODE'
const fs = require('node:fs');

const manifestPath = process.argv[2];
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch {
  console.error('[eva-cloud-setup] ERROR: week4/package.json is not valid readable JSON.');
  process.exit(1);
}

if (manifest === null || Array.isArray(manifest) || typeof manifest !== 'object') {
  console.error('[eva-cloud-setup] ERROR: week4/package.json must contain a JSON object.');
  process.exit(1);
}
if (Object.prototype.hasOwnProperty.call(manifest, 'workspaces')) {
  console.error('[eva-cloud-setup] ERROR: week4/package.json must be standalone and cannot declare npm workspaces.');
  process.exit(1);
}

const scripts = manifest.scripts;
if (scripts !== undefined && (scripts === null || Array.isArray(scripts) || typeof scripts !== 'object')) {
  console.error('[eva-cloud-setup] ERROR: week4/package.json scripts must be an object when present.');
  process.exit(1);
}

for (const [name, command] of Object.entries(scripts ?? {})) {
  if (typeof command !== 'string') {
    console.error(`[eva-cloud-setup] ERROR: week4 package script ${JSON.stringify(name)} must be a string.`);
    process.exit(1);
  }

  const normalized = command.replaceAll('\\', '/');
  const reachesParent = /(^|[\s"'=(])\.\.(?:\/|$|[\s"';&|)])/.test(normalized);
  const reachesArchive = /(^|[\/\s"'=])week[123](?=\/|$|[\s"';&|])/.test(normalized);
  const forwardsPackageManager = /\b(?:npm|pnpm|yarn)(?:\.cmd)?\b[^\r\n]*(?:--prefix(?:=|\s)|(?:^|\s)-C(?:=|\s)|--workspaces?\b)/i.test(normalized);

  if (reachesParent || reachesArchive || forwardsPackageManager) {
    console.error(`[eva-cloud-setup] ERROR: week4 package script ${JSON.stringify(name)} forwards outside the standalone Week 4 package or targets an archive.`);
    process.exit(1);
  }
}
NODE
  then
    fail "Refusing dependency setup until week4/package.json is a standalone Week 4 manifest."
  fi

  if [[ "$INSTALL_NODE_DEPS" == "1" ]]; then
    npm_args=(
      --prefix "$WEEK4_DIR"
      ci
      --include=dev
      --no-audit
      --no-fund
    )
    if [[ "$ALLOW_NPM_SCRIPTS" == "0" ]]; then
      npm_args+=(--ignore-scripts)
    else
      warn "npm lifecycle scripts are explicitly enabled. Use this only after reviewing the locked dependency graph and package scripts."
    fi

    info "Installing locked Week 4 Node dependencies."
    npm "${npm_args[@]}"
  else
    info "Node dependency installation skipped: EVA_CLOUD_INSTALL_NODE_DEPS=0."
  fi
fi

CARGO_MANIFEST="$WEEK4_DIR/Cargo.toml"
CARGO_LOCK="$WEEK4_DIR/Cargo.lock"

if [[ -L "$CARGO_MANIFEST" ]]; then
  fail "week4/Cargo.toml must be a regular in-tree file, not a symbolic link."
fi
if [[ -e "$CARGO_MANIFEST" && ! -f "$CARGO_MANIFEST" ]]; then
  fail "week4/Cargo.toml exists but is not a regular file."
fi

if [[ ! -f "$CARGO_MANIFEST" ]]; then
  info "Rust dependency fetch deferred: week4/Cargo.toml is absent (valid initial foundation state)."
elif [[ "$FETCH_RUST_DEPS" == "0" ]]; then
  info "Rust dependency fetch skipped: EVA_CLOUD_FETCH_RUST_DEPS=0."
else
  if [[ -L "$CARGO_LOCK" ]]; then
    fail "week4/Cargo.lock must be a regular in-tree file, not a symbolic link."
  fi
  if [[ ! -f "$CARGO_LOCK" ]]; then
    fail "Rust fetch was requested, but week4/Cargo.lock is missing. Commit the reviewed lockfile; setup will not create or change it."
  fi
  if [[ "$cargo_available" != "1" ]]; then
    fail "Rust fetch was requested, but a working cargo command is unavailable on PATH."
  fi

  info "Fetching locked Week 4 Rust dependencies."
  (
    cd -- "$WEEK4_DIR"
    cargo fetch --locked --manifest-path "$CARGO_MANIFEST"
  )
fi

info "Repository-session bootstrap complete. No application server was started."
