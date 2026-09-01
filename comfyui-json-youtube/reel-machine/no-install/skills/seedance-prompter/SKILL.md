---
name: seedance-prompter
description: Turn a reel teardown + the user's model reference images into a finished Seedance 2.0 clip. Claude writes the full per-second Seedance prompt; the user pastes it into the WaveSpeed website, uploads their reference images, and generates. Step 3 of the Reel Machine. Triggers: "clone the reel now", "write the seedance prompt", "generate the reel", "make my model do this reel", after reel-intake. Uses the user's pre-made model reference images.
---

# seedance-prompter (Desktop)

Input: the `teardown` from reel-intake + the user's pre-made 4–6 **reference images** of their model. Claude writes
the full Seedance prompt; the user runs it on the WaveSpeed website; out comes their reel. Two shapes cover
everything (see `references/examples.md`): **A) hero dialogue body** (with pauses) and **B) CTA talking-head** (one flowing line).

## Settings the user sets in WaveSpeed (Claude reminds them every time)
Model **Seedance 2.0**, **reference mode / text-to-video** (NO start image — Seedance makes the handheld opening
itself, which looks more real). Then: **Aspect 9:16 · Generate Audio ON · Reference Audios empty · Reference
Videos empty · Web Search off · Resolution 480p (draft) → 1080p (final).** Upload the **4–6 reference images**
(face first; don't add more than ~6 — extra/near-duplicate refs blur the identity). Full click-guide: `references/wavespeed-ui.md`.

## Voice (important, tested)
- **Default = native Seedance audio** (Reference Audios empty). Claude steers the voice in the prompt ("sweet cute voice" / "cold, confident").
- **For the same voice across reels:** upload a **REAL human voice sample** of the model into Reference Audios.
- **NEVER upload a text-to-speech / ElevenLabs clip as the voice reference** — TTS makes the native audio sound plastic/fake. Real human audio only, or native.

## The package Claude writes
Mirror `references/examples.md`:
```
PROMPT           one paragraph: scene + outfit + camera + "ONE continuous take, no cuts, start mid-action". NEVER describe the person.
PACING           the key block (below)
DIALOGUE + PER-SECOND TIMELINE   S = on-cam (lip-sync) · O = off-cam voice; exact times + the PAUSES as intentional silence
SECTION 1 Effects Timeline · 2 Master Inventory · 3 Density Map · 4 Motion Flow
scene-lock lines ([POSE]/[CAMERA]/[WALLS]/…) · NEGATIVE
```

## PACING — the trick that makes it human, not AI
From the teardown, match the original's **word budget + pause structure**.
- **Fewer words = SLOWER** (the model stretches). Too many words → it rushes; cut words.
- **Hero dialogue** keeps pauses between lines (~half the clip can be silence). **CTA / one person** = the opposite: ONE flowing sentence, no gaps.

## Hard rules (bake into every prompt)
1. **Never describe the person** — identity from the reference images ("the woman from the reference images" + "keep her face and identity exactly as in the reference images").
2. **Pose lock:** one stable selfie pose, phone always in hand; no leaning, no pose change, no walking out.
3. **Direct selfie, not a mirror** (+ negative the mirror). Endings: exits open to the SIDE; she stays facing the lens; hold the last frame for the CTA.
4. **Kill model junk** (invented displays/wall text) in prompt + negative. Captions/overlays are added later in editing, never generated in the clip.

## Draft → check → final
1. User runs the **480p draft**, downloads it, drops it back in the chat.
2. **Claude watches the draft:** identity holds? pacing has real pauses (not rushed)? pose held? tone right? (bug→fix table in `references/settings.md`).
3. Fix the prompt if needed, re-draft. When it's right → run the **1080p final**. Lip-sync slurs? keep the best visual and dub real audio in editing.
