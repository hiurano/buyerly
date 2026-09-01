#!/usr/bin/env bash
# diarize-speakers.sh — WHO speaks each word. Combines whisper word-timing + pyannote speaker diarization.
# Whisper gives words+timing but NOT the speaker; this labels each word by voice (SPEAKER_00/01…).
# Cross-check with a lip-check (dense frames: her mouth moving = she speaks) to map a speaker to on/off-camera.
# Setup once: pip install --user --break-system-packages pyannote.audio ; and on huggingface.co (your HF token
#   account) accept: pyannote/speaker-diarization-community-1 (gated). HF token in the hub env (HF_TOKEN).
# Usage: diarize-speakers.sh <ref.mp4> <whisper-words.json>
set -euo pipefail
MP4="$1"; JSON="$2"; DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAV="${MP4%.*}.16k.wav"
ffmpeg -nostdin -loglevel error -y -i "$MP4" -ac 1 -ar 16000 "$WAV"
source "$HOME/AGENT_HUB/env/load-env.sh" >/dev/null 2>&1 || true
export HF_TOKEN="${HF_TOKEN:-${HUGGINGFACE_TOKEN:-}}"
python3 "$DIR/diarize-speakers.py" "$WAV" "$JSON"
