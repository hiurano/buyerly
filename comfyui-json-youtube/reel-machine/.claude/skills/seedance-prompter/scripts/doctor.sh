#!/usr/bin/env bash
# doctor.sh — check everything seedance-prompter needs for GENERATION and say exactly what's missing.
# Run on first use or whenever a generation fails. Works on macOS, Linux, and Windows (Git Bash).
ok(){ printf '  [OK]      %s\n' "$1"; }
miss(){ printf '  [MISSING] %s\n      -> install: %s\n' "$1" "$2"; FAIL=1; }
FAIL=0
case "$(uname -s 2>/dev/null)" in Darwin) OS=mac;; MINGW*|MSYS*|CYGWIN*) OS=win;; *) OS=linux;; esac
echo "seedance-prompter doctor — OS: $OS"
echo "REQUIRED for firing generations (writing prompts alone needs NOTHING):"
command -v node >/dev/null 2>&1 && ok "node" \
  || miss "node (for the WaveSpeed CLI)" "$([ $OS = mac ] && echo 'brew install node' || ([ $OS = win ] && echo 'winget install OpenJS.NodeJS.LTS' || echo 'apt install nodejs npm')) — or https://nodejs.org"
command -v wavespeed >/dev/null 2>&1 && ok "wavespeed CLI" \
  || miss "wavespeed CLI" "npm install -g @wavespeed/cli   (then: wavespeed login)"
command -v jq >/dev/null 2>&1 && ok "jq" \
  || miss "jq" "$([ $OS = mac ] && echo 'brew install jq' || ([ $OS = win ] && echo 'winget install jqlang.jq' || echo 'apt install jq'))"
command -v ffmpeg >/dev/null 2>&1 && ok "ffmpeg (draft QA contact sheets)" \
  || miss "ffmpeg" "$([ $OS = mac ] && echo 'brew install ffmpeg' || ([ $OS = win ] && echo 'winget install Gyan.FFmpeg' || echo 'apt install ffmpeg'))"
if [ -n "${WAVESPEED_API_KEY:-}" ]; then ok "WaveSpeed API key (env)"
elif command -v wavespeed >/dev/null 2>&1 && wavespeed status >/dev/null 2>&1; then ok "WaveSpeed login (CLI)"
else miss "WaveSpeed API key" "get one at https://wavespeed.ai then run: wavespeed login  (or export WAVESPEED_API_KEY)"; fi
echo
if [ "$FAIL" = 1 ]; then echo "RESULT: fix the [MISSING] items above. You can still WRITE prompt packages now and paste them into wavespeed.ai manually."; exit 1
else echo "RESULT: ready to generate."; fi
