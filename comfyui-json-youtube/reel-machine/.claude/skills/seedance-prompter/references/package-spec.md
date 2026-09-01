# The Package Spec — every Seedance prompt has EXACTLY these blocks, in this order

No exceptions. A package missing a block is not done. Only the CONTENT changes per reel — never the structure.

```
SETUP
  Seedance 2.0 · Reference/text-to-video mode (NO start image) · refs (face first, 4–6)
  <duration>s · 9:16 · 480p draft → 720p final (Topaz to 1080×1920 after) · Generate Audio ON ·
  Reference Audios EMPTY · Reference Videos EMPTY · Web Search OFF

RULE
  Describe ONLY scene + outfit + lens — NEVER the person. Identity = the reference images only.

IMAGE REFERENCE MAP
  Which refs lock what: face refs → face/identity · body sheet → body · outfit refs (1–2) → the outfit.

PROMPT   (one continuous paragraph, always in this internal order)
  1. Clip type + duration + aspect ("A continuous 15-second vertical 9:16 …")
  2. THE LENS — paste a preset from `looks.md` (GoPro porthole / phone selfie / DV camcorder / webcam /
     CCTV / third-person rear-cam); match the reference reel's lens
  3. CAMERA HOLDER — exactly one (selfie arm / other person's single sleeve in one corner / third party)
  4. Scene + environment + light (time of day, practicals, background motion)
  5. Identity line: "Build her exact face, body and identity from the reference images and keep them
     identical the entire clip; never change her face."
  6. POSE LOCK ("ONE stable pose the entire clip — no walk-in, no walking, no pose change …")
  7. Outfit (exact, consistent) — outfits live HERE, not in face refs
  8. Texture/realism (mild grain, phone exposure, face sharp, background soft)
  9. "ONE continuous take, no cuts, start mid-action."

VOICE & PACING
  How many voices + gender + register per voice ("HER = smooth young female voice, main speaker.
  MAN = calm low male voice, off camera, never shown."). Pacing profile:
  – DIALOGUE: slow + sparse, pauses between lines, up to half the clip intentional silence.
  – PITCH/CTA: ONE flowing breath-group, connected lines, NO gaps.
  Always: "natural connected speech, never robotic, never one word at a time; keep the voices clearly distinct."

PER-SECOND TIMELINE   (the heart — every second of the clip, no gaps)
  Format per entry:
    <start>–<end>s  <SPEAKER> (<on-cam lip-sync | off-cam voice>, <female|male>): "<line>" — <tone/action>
    <start>–<end>s  [SILENCE / pause ~0.4 — what she does: glance, breath, look down]
  Every line tagged. Every silence scripted. The final beat holds the frame.

EFFECTS   (compact, 4 parts)
  1 Timeline: the 3–5 moments (hook → build → signature beat → landing), flag the SIGNATURE moment
  2 Inventory: the distinct effects used (handheld hold, push-in, micro-expression pause, …)
  3 Density map: LOW/MED/HIGH per 3–6s chunk
  4 Motion flow: opening → build → resolution in one line each

SCENE-LOCKS   (only the ones the scene needs)
  [POSE] [CAMERA] [WALLS/ENV] [PROP/SOUND e.g. CHIME] — one line each, hard constraints.

NEGATIVE
  Always include the base set: fast/crammed speech, running lines together, robotic one-word delivery,
  monotone, changing pose, walking in/out, mirror/reflection selfie (unless the shape IS a mirror),
  doubled arms / second person's arm at the lens, face morphing, identity drift, warped mouth, plastic skin,
  extra fingers, invented cuts, camera cuts, changing outfit, readable text/displays in scene, text baked
  into the video, watermark, studio glamour, cinematic grading, gimbal smoothness, nudity.
  + the shape-specific bugs (see shapes.md) + tone guards ("warm or grateful delivery on a cold reveal").

PREFLIGHT
  □ every second timed, every line tagged   □ one camera holder   □ lens described   □ pose locked
  □ no person description   □ outfit in prompt   □ word budget fits duration   □ settings = SETUP block
  □ brand-safe   □ no internal names/slugs/file IDs inside the PROMPT text

COST / RISK
  Draft 480p ~$1.50 · final 720p ~$3 · never 1080p/4k · lip-sync slurs → best visual + dub in edit ·
  which line is THE trigger (regenerate rather than lose it).
```

## Duration guide
- 15s — hero/dialogue/story clips (max per generation; longer = stitch clips in the edit)
- 8s — CTA / single-pitch clips
- 4–8s — action/no-dialogue inserts
