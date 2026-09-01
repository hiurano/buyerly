#!/usr/bin/env bash
# ws-video.sh — generate ONE continuous Seedance 2.0 reel clip on WaveSpeed (reference mode, no start frame).
# Identity comes from the character reference images; the prompt describes ONLY scene + outfit + action.
# The settings-lock (9:16, native audio, no web search, refs-only) is HARDCODED so you can't misconfigure it.
#
# Usage:
#   ws-video.sh --prompt-file <package.txt> --out <clip.mp4> [--res 480p|720p|1080p|4k] [--dur 15] \
#               [--voice <real-human-sample.mp3>] <ref1.png> <ref2.png> ... (2–9 character refs, face first)
#
# Model: bytedance/seedance-2.0/text-to-video (~$0.60).  Draft @480p → lock → final @1080p.
# Voice: NATIVE by default. Pass --voice ONLY with a REAL human voice sample of your model
#        (never an ElevenLabs/TTS clip — TTS makes the native audio sound plastic/fake).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; source "$DIR/lib.sh"

PROMPT="" OUT="" RES="480p" DUR="15" VOICE=""; REFS=()
while [ $# -gt 0 ]; do case "$1" in
  --prompt) PROMPT="$2"; shift 2;;
  --prompt-file) PROMPT="$(cat "$2")"; shift 2;;
  --out) OUT="$2"; shift 2;;
  --res) RES="$2"; shift 2;;
  --dur) DUR="$2"; shift 2;;
  --voice) VOICE="$2"; shift 2;;
  -*) echo "unknown flag: $1" >&2; exit 1;;
  *) REFS+=("$1"); shift;;
esac; done
[ -n "$PROMPT" ] && [ -n "$OUT" ] && [ "${#REFS[@]}" -ge 1 ] || { echo "need --prompt-file, --out and 2–9 character refs" >&2; exit 1; }

ws_require
echo "→ uploading ${#REFS[@]} character ref(s)…" >&2
REF_URLS="$(ws_upload_json "${REFS[@]}")"
AUDIO_URLS="[]"
if [ -n "$VOICE" ]; then echo "→ uploading real-human voice ref…" >&2; AUDIO_URLS="$(ws_upload_json "$VOICE")"; fi

# Settings-lock — hardcoded to the proven method. reference_videos stays empty (dilutes identity).
INPUT="$(jq -nc --arg p "$PROMPT" --argjson refs "$REF_URLS" --argjson auds "$AUDIO_URLS" \
  --arg res "$RES" --argjson dur "$DUR" '
  {prompt:$p, reference_images:$refs, reference_videos:[],
   aspect_ratio:"9:16", resolution:$res, duration:$dur,
   enable_web_search:false, generate_audio:true}
  + (if ($auds|length)>0 then {reference_audios:$auds} else {} end)')"

echo "→ generating (seedance-2.0/text-to-video, $RES, ${DUR}s, native audio$([ -n "$VOICE" ] && echo " + voice ref"))…" >&2
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT; printf '%s' "$INPUT" > "$TMP"
wavespeed run bytedance/seedance-2.0/text-to-video --input-file "$TMP" --download "$OUT" --json >/dev/null
[ -f "$OUT" ] && echo "✓ $OUT" || { echo "ERROR: no clip downloaded" >&2; exit 1; }
