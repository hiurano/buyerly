#!/usr/bin/env bash
# One-time setup for the Reel Machine. Run once: ./setup.sh
# Installs the WaveSpeed CLI + checks the few tools the skills need, then logs you in.
set -euo pipefail
ok(){ printf '  \033[32m✓\033[0m %s\n' "$1"; }
miss(){ printf '  \033[31m✗\033[0m %s\n' "$1"; }

echo "Reel Machine — setup"

# 1) Node/npm (the WaveSpeed CLI is a node package)
if command -v npm >/dev/null 2>&1; then ok "node/npm found"
else miss "npm not found — install Node.js first: https://nodejs.org (LTS), then re-run."; exit 1; fi

# 2) WaveSpeed CLI
if command -v wavespeed >/dev/null 2>&1; then ok "wavespeed CLI ($(wavespeed --version 2>/dev/null))"
else echo "  → installing @wavespeed/cli…"; npm install -g @wavespeed/cli && ok "wavespeed CLI installed"; fi

# 3) jq (JSON) + ffmpeg (frame extraction for reel-intake)
command -v jq     >/dev/null 2>&1 && ok "jq found"     || miss "jq not found — install: brew install jq (mac) / apt install jq (linux)"
command -v ffmpeg >/dev/null 2>&1 && ok "ffmpeg found" || miss "ffmpeg not found — install: brew install ffmpeg / apt install ffmpeg (needed by reel-intake)"

# 4) API key / login
if [ -n "${WAVESPEED_API_KEY:-}" ]; then ok "WAVESPEED_API_KEY set in env"
elif wavespeed status >/dev/null 2>&1; then ok "already logged in ($(wavespeed status 2>/dev/null | head -1))"
else echo "  → logging in to WaveSpeed (paste your API key from https://wavespeed.ai)…"; wavespeed login; fi

chmod +x "$(dirname "$0")"/wavespeed/*.sh "$(dirname "$0")"/skills/*/scripts/*.sh 2>/dev/null || true
echo "Done. Open Claude Code in this folder and say: \"build me a reel from <this viral reel link>\"."
