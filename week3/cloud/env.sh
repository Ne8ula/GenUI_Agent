#!/usr/bin/env bash
# Sourced by session.sh; nothing here is a Claude authentication/model setting.
EVA_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVA_W3_ROOT="$EVA_REPO_ROOT/week3"
export EVA_NODE_VERSION="${EVA_NODE_VERSION:-24.14.0}"
export EVA_TOOLCHAIN_ROOT="${EVA_TOOLCHAIN_ROOT:-/opt/eva-w3}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$EVA_TOOLCHAIN_ROOT/ms-playwright}"
export EVA_BROWSER_CHANNEL="${EVA_BROWSER_CHANNEL:-chromium}"
export EVA_SCULPT_WORK_DIR="${EVA_SCULPT_WORK_DIR:-/tmp/eva-w3-sculpt}"
export EVA_SCULPT_REVIEW_EVERY="${EVA_SCULPT_REVIEW_EVERY:-3}"
export EVA_W3_MAX_TURNS=0
export PATH="$EVA_TOOLCHAIN_ROOT/node-v$EVA_NODE_VERSION/bin:$PATH"
export EVA_REPO_ROOT EVA_W3_ROOT
# Defense in depth for these app-tool processes. Do not alter Cloud's own Claude auth.
unset OPENAI_API_KEY ELEVENLABS_API_KEY ELEVENLABS_VOICE_ID EVA_W3_REPLY_MODEL
[[ "$EVA_SCULPT_REVIEW_EVERY" == 3 ]] || { printf '%s\n' 'This handoff is scoped to three passes per owner review.' >&2; return 1; }
[[ "$EVA_SCULPT_WORK_DIR" = /* && "$EVA_SCULPT_WORK_DIR" != / ]] || { printf '%s\n' 'EVA_SCULPT_WORK_DIR must be an absolute non-root scratch path.' >&2; return 1; }
