---
name: reel-intake
description: Step 1 of the Reel Machine — turn any viral short-form reel into a precise teardown an AI agent can rebuild. Takes a LINK (downloads it) or a FILE the user drops in (when the platform blocks downloads), extracts every single frame + a contact sheet, pulls the word-timed transcript, verifies who speaks each line, and "watches" the reel beat by beat. Triggers: "clone this reel", "analyze this reel/short/video", "here's a viral reel", "intake", "the file is at …", "rebuild this video".
---

# reel-intake

Goal: understand EXACTLY how a viral reel is built — frame by frame, word by word — so `seedance-prompter`
can rebuild the *format* with your own model. You clone the mechanic — never the person, their face, handle,
exact lines, or their file.

## Input → Output
- **Input:** a reel LINK, or a FILE the user drops in (both work — file always wins if given).
- **Output (in `intake/<slug>/`):** `reference.mp4` · `frames/` (1 per second) · `contact-sheet.jpg` ·
  `transcript.txt` + `words.json` (word-level timing) · `teardown.md` (the rebuild blueprint).

## First run on any machine — check what's installed (bulletproof rule)
Before the first intake (and whenever a step fails), run `scripts/doctor.sh` and SHOW the user the result:
what's [OK], what's [MISSING], and the exact install command for their OS (mac/windows/linux). Only
**ffmpeg** is truly required; yt-dlp auto-installs for links; whisper is optional (frames carry a fallback).
Never fail silently — always tell the user what the machine is missing and how to fix it in one command.

## Steps

### 1 · Get the reel (three tiers — never let a blocked download stop the run)
- **User gave a FILE** (path or drag-in): use it directly — copy it to `intake/<slug>/reference.mp4`,
  keep the original link (if any) for the teardown. No download needed.
- **User gave a LINK — tier 1:** run `scripts/download.sh` with `--url <link> --slug <YYYY-MM-DD-slug>`
  (yt-dlp). Works logged-out for YouTube Shorts, often for TikTok.
- **Tier 2 (Instagram needs this):** IG blocks logged-out downloads. ASK the user first, then re-run with
  `--browser chrome` (or safari/firefox/edge) — yt-dlp uses their own logged-in browser session.
- **Tier 3 (always works):** the user saves the reel via any reel-downloader website and drops the `.mp4`
  in — then continue exactly as with a given file. A blocked download is a fork in the road, not an error.

### 2 · Extract EVERY frame
```
scripts/extract-frames.sh --mp4 <ref.mp4> --slug <YYYY-MM-DD-slug> [--out intake]
```
1-fps frames (`frame-001.png` = second 1) + a 4×4 contact sheet — the whole reel on one image.

### 3 · Word-level transcript (the pacing recipe)
```
scripts/transcribe.sh --mp4 <ref.mp4> --out intake/<slug>
```
Whisper with word timestamps (auto-installs on first use). The word-level GAPS are the pause structure the
prompter will match — this is what makes the clone sound human. If Whisper isn't available on this machine,
fall back to reading the burned captions off the frames (caption changes between frames ≈ 1s timing) or ask
the user to type what's said.

### 4 · WATCH it (agent vision) → `teardown.md`
Read the contact sheet, open single frames where detail matters, and write the blueprint:
- **Hook (first ~1s):** what stops the scroll.
- **Beat table:** what happens each second (frame-07 = second 7); the turn/twist; the ending.
- **Lines + captions in order**, mapped to the timing from step 3.
- **WHO speaks each line — verify, never guess:** lip-check the frames (her mouth moving = she speaks;
  mouth closed while audio runs = off-camera voice). Tag every line: speaker + gender + on-cam/off-cam.
  For tricky multi-voice reels, voice-verify with `scripts/diarize-speakers.sh` (pyannote; optional).
- **Camera + LOOK:** who holds the camera (whose arm is in frame?), lens character (fisheye? vignette?
  camera height?), setting, light, color character — the prompter needs the LOOK named precisely.
- **Why it went viral:** the *mechanic* in one sentence (e.g. call-out hook → withhold → debatable twist →
  comment bait).

## Windows / agents without bash
The scripts run in **Git Bash** (bundled with Git for Windows — if `git` exists, bash exists:
`"C:\Program Files\Git\bin\bash.exe" scripts/extract-frames.sh …`). No bash at all? Run the equivalents
directly — the output contract stays the same (`intake/<slug>/` with the files above):
- Download: `yt-dlp -f "mp4/bestvideo*+bestaudio/best" --merge-output-format mp4 -o intake/<slug>/reference.mp4 <link>` (+ `--cookies-from-browser chrome` for IG)
- Frames: `ffmpeg -i reference.mp4 -vf fps=1 intake/<slug>/frames/frame-%03d.png`
- Contact sheet: `ffmpeg -i reference.mp4 -vf "fps=1,scale=320:-1,tile=4x4" intake/<slug>/contact-sheet.jpg`
- Transcript: `whisper reference.mp4 --model small --word_timestamps True --output_format all --output_dir intake/<slug>`

## The teardown is the handoff
`seedance-prompter` reads `teardown.md` + `words.json` to set the word budget, pause structure, beat map,
camera POV and look. Keep the FORM, change the content: your model, your angle, your own or licensed audio.

## Anti-patterns
- Do NOT stall on a blocked download — the manual file path is a first-class input, not an error.
- Do NOT skip the contact sheet and "analyze" from memory — beats, captions, the twist live in the frames.
- Do NOT guess speaker attribution — lip-check (and diarize if needed). Wrong voices ruin the clone.
- Do NOT copy the person: no face, no handle, no exact lines, never republish their file. Format only.
- Do NOT write a vibe summary — every beat gets its second; every line gets its speaker tag.
- Do NOT dump 100 frames into context — contact sheet first, single frames only where detail matters.

## QA — before handing off to seedance-prompter
- `intake/<slug>/` has: reference.mp4, frames/, contact-sheet.jpg, transcript.txt + words.json, teardown.md.
- Beat table covers the full duration; every line tagged (speaker/gender/on-off-cam); look described
  (lens/vignette/camera height/holder).
- The source link (if any) is recorded in the teardown.

## Legal / brand-safe
See `references/legal-and-teardown.md`. Short version: FORMAT analysis only — mute the original audio,
don't republish the source file, don't copy the person's face/handle/exact lines.
