#!/usr/bin/env bash
# doctor.sh — check everything reel-intake needs and say EXACTLY what's missing and how to install it.
# Run this on first use or whenever anything fails. Works on macOS, Linux, and Windows (Git Bash).
ok(){ printf '  [OK]      %s\n' "$1"; }
miss(){ printf '  [MISSING] %s\n      -> install: %s\n' "$1" "$2"; FAIL=1; }
opt(){ printf '  [optional] %s -> %s\n' "$1" "$2"; }
FAIL=0
case "$(uname -s 2>/dev/null)" in Darwin) OS=mac;; MINGW*|MSYS*|CYGWIN*) OS=win;; *) OS=linux;; esac
echo "reel-intake doctor — OS: $OS"
echo "REQUIRED:"
command -v ffmpeg >/dev/null 2>&1 && ok "ffmpeg (frames + contact sheet)" \
  || miss "ffmpeg" "$([ $OS = mac ] && echo 'brew install ffmpeg' || ([ $OS = win ] && echo 'winget install Gyan.FFmpeg' || echo 'apt install ffmpeg'))"
echo "FOR LINK DOWNLOADS (skip if the user drops files in manually):"
command -v yt-dlp >/dev/null 2>&1 && ok "yt-dlp (auto-installs on first link)" \
  || opt "yt-dlp not yet installed" "auto-installs on first use; manual: $([ $OS = mac ] && echo 'brew install yt-dlp' || ([ $OS = win ] && echo 'winget install yt-dlp.yt-dlp' || echo 'pip install yt-dlp'))"
echo "FOR WORD-LEVEL TIMING (optional but recommended — the pacing recipe):"
command -v whisper >/dev/null 2>&1 && ok "whisper (word timestamps)" \
  || opt "whisper not installed" "pip install openai-whisper (needs Python 3; auto-install is attempted on first use). No Python? The skill falls back to reading captions from frames."
command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 && ok "python (for whisper/yt-dlp pip installs)" \
  || opt "python not found" "$([ $OS = win ] && echo 'winget install Python.Python.3.12' || echo 'brew install python') — only needed for whisper"
echo
if [ "$FAIL" = 1 ]; then echo "RESULT: fix the [MISSING] items above, then re-run."; exit 1
else echo "RESULT: ready. Give the agent a reel link or file."; fi
