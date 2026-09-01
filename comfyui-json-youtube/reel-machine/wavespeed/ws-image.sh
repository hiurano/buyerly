#!/usr/bin/env bash
# ws-image.sh — generate/edit a character image with Nano Banana Pro (Gemini 3 Pro Image) on WaveSpeed.
# Identity comes from the anchor image(s) you pass — the prompt describes ONLY outfit + scene, never the person.
#
# Usage:
#   ws-image.sh --prompt "<edit instruction>" --out <out.png> [--ratio 3:4] [--res 4k] <anchor1.png> [anchor2.png ...]
#   ws-image.sh --prompt-file <p.txt>        --out <out.png> [--ratio 9:16] [--res 2k] <anchor.png>
#
# Model: google/nano-banana-pro/edit  (~$0.14/img).  res = 1k|2k|4k.  Attach the face anchor(s), face first.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/lib.sh"

PROMPT="" OUT="" RATIO="3:4" RES="4k"; IMAGES=()
while [ $# -gt 0 ]; do case "$1" in
  --prompt) PROMPT="$2"; shift 2;;
  --prompt-file) PROMPT="$(cat "$2")"; shift 2;;
  --out) OUT="$2"; shift 2;;
  --ratio) RATIO="$2"; shift 2;;
  --res) RES="$2"; shift 2;;
  -*) echo "unknown flag: $1" >&2; exit 1;;
  *) IMAGES+=("$1"); shift;;
esac; done
[ -n "$PROMPT" ] && [ -n "$OUT" ] && [ "${#IMAGES[@]}" -gt 0 ] || { echo "need --prompt, --out and at least one anchor image" >&2; exit 1; }

ws_require
echo "→ uploading ${#IMAGES[@]} anchor image(s)…" >&2
URLS="$(ws_upload_json "${IMAGES[@]}")"
INPUT="$(jq -nc --arg p "$PROMPT" --argjson imgs "$URLS" --arg ar "$RATIO" --arg res "$RES" \
  '{prompt:$p, images:$imgs, aspect_ratio:$ar, resolution:$res, output_format:"png"}')"
echo "→ generating (nano-banana-pro/edit, $RES, $RATIO)…" >&2
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT; printf '%s' "$INPUT" > "$TMP"
wavespeed run google/nano-banana-pro/edit --input-file "$TMP" --download "$OUT" --json >/dev/null
[ -f "$OUT" ] && echo "✓ $OUT" || { echo "ERROR: no image downloaded" >&2; exit 1; }
