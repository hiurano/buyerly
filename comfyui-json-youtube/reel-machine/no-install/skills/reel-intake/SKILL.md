---
name: reel-intake
description: Understand a viral short-form reel so it can be rebuilt with the user's own AI model. The user drops a few screenshots (and the link) of a reel that's already going viral; Claude "watches" them and writes a beat-by-beat teardown of how it's built. Step 1 of the Reel Machine — do this first. Triggers: "clone this reel", "here's a viral reel", "analyze this reel/short", "rebuild this video", "study this reel".
---

# reel-intake (Desktop)

Goal: figure out EXACTLY how a viral reel is built, so `seedance-prompter` can rebuild the *format* with the
user's own model. Clone the mechanic — never the person, their face, handle, exact lines, or their file.

## What the user does (no tools, no install)
1. Find a reel that's already going viral in the niche.
2. Take **3–6 screenshots** across the reel: the very first frame (the hook), 2–4 middle moments, and the last
   frame — including any on-screen text. (Scrub the video and screenshot; or use the phone's screen-record → screenshot.)
3. **Drop the screenshots into this chat** + paste the reel's **link**.

## What Claude does (vision)
Look at the screenshots and write a **teardown** (see `references/teardown-and-legal.md` for the template):
- **Hook (first ~1s):** what stops the scroll (the exact opening image + any burned hook caption).
- **Beats + rough timing:** what happens moment to moment; the turn/twist; the ending.
- **On-screen captions**, in order (read them off the screenshots).
- **Style:** selfie/handheld vs static, setting, mood, pacing (fast & crammed vs slow & sparse).
- **Why it went viral — the mechanic** (the reusable engine, e.g. series+timer hook → fast micro-dialogue →
  withhold → debatable twist → expectation-breaking reaction → comment referendum + rewatch).
- **The angle for THEIR reel:** keep the FORM, change the content — their niche, their model, their own hook + CTA keyword.

## Handoff
That teardown is what `seedance-prompter` uses next. Keep it in the chat/project so the next step can read it.

## Legal / brand-safe (say it plainly to the user)
Use the reference for FORMAT study only. Don't republish the file; don't copy the person's face/handle/exact
lines; use a synthetic AI face for your model and audio you have the rights to. Details: `references/teardown-and-legal.md`.
