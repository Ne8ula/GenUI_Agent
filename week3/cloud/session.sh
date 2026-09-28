#!/usr/bin/env bash
# One task-side command at a time. This script never invokes Claude, an API, or a scheduler.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
command_name="${1:-help}"
if [[ "$command_name" == help ]]; then
  printf '%s\n' 'Usage: bash week3/cloud/session.sh prepare|start|references|status|test|capture <unique-revision>|source-eye <unique-revision>'
  printf '%s\n' 'Review with the owner after 3 visual passes. No runtime voice, automatic acceptance, commit or push.'
  exit 0
fi
[[ "$(uname -s)" == Linux ]] || { printf '%s\n' 'Task wrapper targets Linux Cloud. Use the normal npm scripts locally.' >&2; exit 1; }
[[ "$(node --version)" == "v$EVA_NODE_VERSION" ]] || { printf '%s\n' 'Configured Node toolchain missing; run the Cloud environment setup first.' >&2; exit 1; }
cd "$EVA_W3_ROOT"
mkdir -p "$EVA_SCULPT_WORK_DIR"
baseline="$EVA_SCULPT_WORK_DIR/protected-baseline.json"

case "$command_name" in
  prepare)
    node cloud/preflight.mjs
    npm ci --include=dev
    ./node_modules/.bin/playwright install --with-deps chromium
    command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null
    node cloud/guard.mjs init "$baseline"
    node cloud/references.mjs
    npm test
    npm run build
    printf '%s\n' 'Prepared. Start the preview with session.sh start as a session-scoped background command.'
    ;;
  start)
    node cloud/preflight.mjs
    node cloud/guard.mjs check "$baseline"
    # Foreground on purpose: the Cloud task owns this background process, not the cached VM setup.
    exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 1430 --strictPort
    ;;
  references)
    node cloud/preflight.mjs
    node cloud/references.mjs
    ;;
  status)
    node cloud/preflight.mjs
    node cloud/guard.mjs check "$baseline"
    printf 'Browser: %s; review after %s passes; runtime voice allowance: 0\n' "$EVA_BROWSER_CHANNEL" "$EVA_SCULPT_REVIEW_EVERY"
    ;;
  test)
    node cloud/guard.mjs check "$baseline"
    npm test
    npm run build
    npm run smoke
    node cloud/guard.mjs check "$baseline"
    ;;
  capture|source-eye)
    revision="${2:-}"
    [[ "$revision" =~ ^[a-z0-9][a-z0-9-]*$ && "${#revision}" -le 80 ]] || { printf '%s\n' 'Supply a fresh lowercase revision ID, at most 80 characters.' >&2; exit 1; }
    node cloud/guard.mjs check "$baseline"
    export EVA_CAPTURE_REVISION="$revision"
    if [[ "$command_name" == capture ]]; then npm run capture; else npm run source:eye; fi
    node cloud/guard.mjs check "$baseline"
    printf 'Evidence: week3/docs/design/revisions/%s (not an acceptance decision)\n' "$revision"
    ;;
  *) printf 'Unknown command: %s\n' "$command_name" >&2; exit 1 ;;
esac
