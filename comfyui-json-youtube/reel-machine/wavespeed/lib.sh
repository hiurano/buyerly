#!/usr/bin/env bash
# Shared helpers for the WaveSpeed wrappers. Sourced by ws-image.sh / ws-video.sh.
# Requires: wavespeed CLI (setup.sh installs it), jq, a WaveSpeed API key.
set -euo pipefail

ws_require() {
  command -v wavespeed >/dev/null 2>&1 || { echo "ERROR: wavespeed CLI not found. Run ./setup.sh first." >&2; exit 1; }
  command -v jq        >/dev/null 2>&1 || { echo "ERROR: jq not found. Install it (brew install jq / apt install jq)." >&2; exit 1; }
  # key: env var OR the CLI's stored login
  if [ -z "${WAVESPEED_API_KEY:-}" ] && ! wavespeed status >/dev/null 2>&1; then
    echo "ERROR: no WaveSpeed API key. Run 'wavespeed login' or export WAVESPEED_API_KEY." >&2; exit 1
  fi
}

# Upload local files → print a JSON array of CDN URLs. Args: file paths.
ws_upload_json() {
  [ "$#" -gt 0 ] || { echo "[]"; return; }
  for f in "$@"; do [ -f "$f" ] || { echo "ERROR: missing file: $f" >&2; exit 1; }; done
  # `wavespeed upload --json` prints an object with the uploaded URLs; normalize to a flat URL array.
  wavespeed upload "$@" --json 2>/dev/null \
    | jq -c '[.. | strings | select(startswith("http"))] | unique'
}
