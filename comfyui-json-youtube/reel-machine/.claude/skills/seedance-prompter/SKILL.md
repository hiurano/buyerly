---
name: seedance-prompter
description: Step 2 of the Reel Machine — THE master prompting skill for Seedance 2.0 AI-OFM reels. Writes the uniform, per-second-timed prompt package for ANY reel type (solo UGC monologue, dialogue duets woman+man or woman+woman, CTA talking-heads, POV or selfie camera, no-dialogue action), then fires the generation on WaveSpeed and self-checks the draft. Every second is timed, every line is tagged with speaker + gender + on/off-cam. Triggers: "seedance prompt", "clone the reel with my model", "write the clip prompt", "make her say", "UGC clip", "dialogue reel", "CTA clip", "generate the reel", after reel-intake.
---

# seedance-prompter

Writes ONE uniform prompt package for a continuous 4–15s Seedance 2.0 clip (WaveSpeed) — then generates it.
Same structure every time, only the content changes. Covers EVERY AI-OFM reel type via the shape library.

**The three laws (never break):**
1. **Every second is timed.** The PER-SECOND TIMELINE accounts for all 15s — every line, every pause, every
   look. Untimed seconds = the model improvises = AI look.
2. **Every voice is tagged.** Each line carries: WHO + GENDER + ON-CAM (lip-sync) or OFF-CAM (voice only)
   + tone. `SHE (on-cam, female, lip-sync)` · `MAN (off-cam, male voice)` · `WOMAN 2 (on-cam, female)`.
   Never let the model guess who speaks — that's how a duet collapses into one voice (proven failure v4).
3. **Identity from reference images ONLY.** Never describe the person. Scene + outfit + lens only.

## First run on any machine — check what's installed (bulletproof rule)
Before the first GENERATION (writing packages needs nothing), run `scripts/doctor.sh` and SHOW the user
what's [OK] / [MISSING] with the exact install command for their OS. Missing pieces? The user can still get
the full prompt package and paste it into wavespeed.ai manually — never block on a missing tool, offer the
manual path. On Windows the scripts run in Git Bash (`"C:\Program Files\Git\bin\bash.exe" scripts/clone.sh …`).

## Inputs
- The model's refs: `characters/<name>/refs/` (4–6, face first; outfit via prompt + 1–2 outfit refs).
- What the clip is: a teardown from `reel-intake` (`intake/<slug>/teardown.md` + `words.json`), a script
  line, or just an idea ("she pranks him in the car").
- If pacing should copy a reference reel: its beat timing (frames = seconds, or word timestamps).

## Workflow
1. **Pick the shape** from `references/shapes.md` — solo monologue · duet selfie · duet POV · woman×woman ·
   CTA talking-head · no-dialogue action. Unsure? Ask ONE question ("who's on camera, who holds the phone?").
2. **Lock the camera POV** — exactly ONE holder:
   - **SELFIE:** she holds the phone, her one raised arm in frame (never a second arm near the lens).
   - **POV:** the OTHER person holds it — their single sleeve/forearm enters one frame corner; her hands are FREE.
   - **THIRD:** nobody in frame holds it (friend/tripod) — say so explicitly.
3. **Pick the LOOK** from `references/looks.md` — GoPro porthole (strong fisheye + dark rounded vignette),
   phone selfie, DV camcorder, webcam, CCTV, third-person rear-cam. Match the reference reel's lens: check
   the frames for corner darkness, line bowing, camera height, color character. What you don't name, the
   model averages away.
4. **Write the package** into `reels/<slug>/prompt.txt` following `references/package-spec.md` — every block,
   same order, every time.
5. **Time the dialogue** (the pacing engine):
   - Word budget: match the reference (or ~35–45 words per 15s duet, ~25 words per 8s CTA).
   - **Fewer words = SLOWER = human.** Model rushes to cram; cut words instead.
   - Duets keep PAUSES between lines (up to half the clip is intentional silence — mark each `[pause ~0.4]`
     or `[SILENCE + what she does]`). CTAs/monologue-pitches are the opposite: ONE flowing breath-group, no gaps.
   - Connect fragments ("…but you didn't") — short isolated lines sound the most AI.
   - Give each voice a steer: "smooth young female voice" / "calm low male voice" — and keep them DISTINCT.
6. **Generate** (draft → check → final):
   ```
   scripts/clone.sh --name <model> --package reels/<slug>/prompt.txt            # 480p draft (~$1.50)
   ```
   WATCH the draft (extract a contact sheet if needed) — identity holds? timing matches? voices right?
   pose held? Fix bugs via the bug→fix table in `references/settings-lock.md`, re-draft (2–4 runs max), then:
   ```
   scripts/clone.sh --name <model> --package reels/<slug>/prompt.txt --final    # ONE 720p final (~$3)
   ```
   → upscale to 1080×1920 with Topaz Video AI. Never generate at 1080p/4k.

## Hard scene rules (bake into every package)
- **LENS is part of the look:** fisheye/ultra-wide + dark rounded vignette if the reference has it; otherwise
  mild wide selfie distortion. Never omit the lens description.
- **Pose lock:** ONE stable pose the whole clip — no walk-ins, no walking out, no pose change (fast body
  motion breaks the face). Dynamics come from the EDIT (glitch intro), not the gen.
- **Direct selfie ≠ mirror:** "films DIRECTLY with the front camera, NO mirror, not a reflection" + negative it.
- Endings: she stays facing the lens, hold the final frame (CTA/overlay space).
- Kill invented junk: "plain walls, NO digital displays, NO readable text" + negative.
- Brand-safe: clothed, suggestive-not-explicit, no adult-platform names, no real-person likeness.
- Overlays/captions/text always in the EDIT — never generated.

## Anti-patterns
- Do NOT leave any second untimed — silence is scripted too (`[SILENCE — she studies him]`).
- Do NOT write an untagged line — every line has speaker + gender + on/off-cam.
- Do NOT describe the model's face/hair/body — refs carry identity.
- Do NOT give two people arms near the lens — ONE camera holder, decided in step 2.
- Do NOT chop dialogue word-by-word into the timeline — flowing lines WITH timed pauses.
- Do NOT use reference audios for voice consistency (inconsistent every run; never TTS) — dub in the edit.
- Do NOT iterate at 1080p/4k — 480p drafts, ONE 720p final, Topaz upscale.

## QA — before handing the package over
- Timeline covers 0.0 → end with no gaps; every line tagged (speaker/gender/on-off-cam/tone).
- Camera holder is ONE person and matches the shape; lens described; pose locked; mirror negated.
- Word budget fits the duration; pauses marked (duet) or explicitly forbidden (CTA).
- No person description anywhere; outfit in prompt; NEGATIVE block covers the shape's known bugs.
- Package structure matches `references/package-spec.md` block-for-block.
