#!/usr/bin/env bash
# download.sh — reel-intake step 1: download the reel from its link (yt-dlp).
# Three tiers (in order):
#   1. plain:            download.sh --url <link> --slug <slug>            (YouTube Shorts: works · TikTok: often)
#   2. browser cookies:  download.sh --url <link> --slug <slug> --browser chrome
#      → uses YOUR logged-in browser session (chrome|safari|firefox|edge). This is THE way for Instagram.
#   3. manual: save the reel via any reel-downloader website, drop the .mp4 in, skip this script.
# Usage: download.sh --url <reel-link> --slug <YYYY-MM-DD-slug> [--out intake] [--browser chrome]
set -euo pipefail
URL="" SLUG="" OUT="intake" BROWSER=""
while [ $# -gt 0 ]; do case "$1" in
  --url) URL="$2"; shift 2;; --slug) SLUG="$2"; shift 2;; --out) OUT="$2"; shift 2;;
  --browser) BROWSER="$2"; shift 2;;
  *) echo "unknown arg: $1" >&2; exit 1;; esac; done
[ -n "$URL" ] || { echo "missing --url <reel-link>"; exit 1; }
[ -n "$SLUG" ] || { echo "missing --slug (e.g. 2026-07-01-elevator-reveal)"; exit 1; }

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "→ installing yt-dlp (one-time)…"
  pip install -q yt-dlp || pip3 install -q yt-dlp || brew install yt-dlp 2>/dev/null || winget install -e --id yt-dlp.yt-dlp 2>/dev/null \
    || { echo "couldn't install yt-dlp — install it manually (pip install yt-dlp / brew install yt-dlp / winget install yt-dlp.yt-dlp), OR use tier 3: save the reel via a reel-downloader site and give the agent the file."; exit 1; }
fi

DEST="$OUT/$SLUG"; mkdir -p "$DEST"
ARGS=(-q --no-warnings --socket-timeout 30 -f "mp4/bestvideo*+bestaudio/best" --merge-output-format mp4 -o "$DEST/reference.mp4")
[ -n "$BROWSER" ] && ARGS+=(--cookies-from-browser "$BROWSER")
echo "→ downloading reel$([ -n "$BROWSER" ] && echo " (with $BROWSER cookies)")…"
if yt-dlp "${ARGS[@]}" "$URL"; then
  echo "$URL" > "$DEST/source-link.txt"
  echo "✓ $DEST/reference.mp4 (+ source-link.txt)"
  echo "  Next: scripts/extract-frames.sh --mp4 $DEST/reference.mp4 --slug $SLUG"
else
  echo "✗ download blocked."
  if [ -z "$BROWSER" ]; then
    echo "  Tier 2 — Instagram/TikTok usually need your logged-in browser session. ASK THE USER first, then:"
    echo "    scripts/download.sh --url <link> --slug $SLUG --browser chrome   (or safari/firefox/edge)"
  fi
  echo "  Tier 3 — always works: save the reel via any reel-downloader website and give the agent the file."
  exit 2
fi
