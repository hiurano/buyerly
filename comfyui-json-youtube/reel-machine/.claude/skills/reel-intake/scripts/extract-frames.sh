#!/usr/bin/env bash
# extract-frames.sh — reel-intake step 2: frames + contact sheet from a reference reel (ffmpeg).
# Usage: extract-frames.sh --mp4 <ref.mp4> --slug <YYYY-MM-DD-slug> [--out intake]
set -euo pipefail
MP4="" SLUG="" OUT="intake"
while [ $# -gt 0 ]; do case "$1" in
  --mp4) MP4="$2"; shift 2;; --slug) SLUG="$2"; shift 2;; --out) OUT="$2"; shift 2;;
  *) echo "unknown arg: $1" >&2; exit 1;; esac; done
[ -f "$MP4" ] || { echo "missing --mp4 (drop the downloaded reel here)"; exit 1; }
[ -n "$SLUG" ] || { echo "missing --slug (e.g. 2026-07-01-elevator-reveal)"; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found — run ./setup.sh"; exit 1; }

DEST="$OUT/$SLUG"; FRAMES="$DEST/frames"; mkdir -p "$FRAMES"
echo "→ probing"; ffprobe -v quiet -print_format json -show_format -show_streams "$MP4" > "$DEST/info.json" || true
echo "→ frames (1 fps)"; ffmpeg -nostdin -loglevel error -i "$MP4" -vf fps=1 "$FRAMES/frame-%03d.png"
echo "→ contact sheet (4x4)"; ffmpeg -nostdin -loglevel error -i "$MP4" -vf "fps=1,scale=320:-1,tile=4x4" "$DEST/contact-sheet.jpg" 2>/dev/null \
  || ffmpeg -nostdin -loglevel error -i "$MP4" -vf "fps=1,scale=320:-1,tile=4x4" "$DEST/contact-sheet-%02d.jpg"
cp "$MP4" "$DEST/reference.mp4" 2>/dev/null || true
echo "✓ done → $DEST"
echo "  Next: Claude reads $DEST/contact-sheet*.jpg + frames/ and writes $DEST/teardown.md"
