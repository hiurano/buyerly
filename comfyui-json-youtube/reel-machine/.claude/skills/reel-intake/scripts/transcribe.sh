#!/usr/bin/env bash
# transcribe.sh — word-level transcript of the reference reel (the pacing recipe).
# Usage: transcribe.sh --mp4 <ref.mp4> --out intake/<slug>
set -euo pipefail
MP4="" OUT="."
while [ $# -gt 0 ]; do case "$1" in --mp4) MP4="$2"; shift 2;; --out) OUT="$2"; shift 2;; *) shift;; esac; done
[ -f "$MP4" ] || { echo "missing --mp4"; exit 1; }
mkdir -p "$OUT"
if ! command -v whisper >/dev/null 2>&1; then
  echo "→ installing openai-whisper (one-time)…"; pip install -q openai-whisper || pip3 install -q openai-whisper || { echo "pip install failed — install manually: pip install openai-whisper"; exit 1; }
fi
echo "→ transcribing with word timestamps…"
# NOTE: whisper accepts only ONE --output_format — "all" writes txt+json (+srt/vtt/tsv, cleaned below)
whisper "$MP4" --model small --word_timestamps True --output_format all --output_dir "$OUT" >/dev/null 2>&1
base="$(basename "$MP4")"; base="${base%.*}"
[ -f "$OUT/$base.txt" ]  && mv "$OUT/$base.txt"  "$OUT/transcript.txt"
[ -f "$OUT/$base.json" ] && mv "$OUT/$base.json" "$OUT/words.json"
[ -f "$OUT/$base.srt" ]  && mv "$OUT/$base.srt"  "$OUT/transcript.srt"
rm -f "$OUT/$base.vtt" "$OUT/$base.tsv"
[ -f "$OUT/transcript.txt" ] && [ -f "$OUT/words.json" ] \
  || { echo "✗ whisper produced no transcript (check the audio track) — expected transcript.txt + words.json in $OUT"; exit 1; }
echo "✓ transcript.txt + words.json in $OUT (the word gaps = the pause structure the cloner matches)"
