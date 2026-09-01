# Shape Library — the 6 AI-OFM reel shapes (proven packages; copy the shape, swap the content)

Every shape uses the SAME package structure (`package-spec.md`). What changes: camera holder, voice count,
pacing profile. Shapes B, C and E below are full proven packages; A, D and F show the blocks that differ.

| Shape | On cam | Voices | Camera | Pacing |
|---|---|---|---|---|
| A · Solo UGC monologue | 1 woman | 1 female | selfie (she holds) | story-pace: connected, small beats |
| B · Duet — selfie | 1 woman | her + off-cam voice | SHE holds phone | slow/sparse, real pauses |
| C · Duet — POV | 1 woman | her + off-cam voice | THE OTHER holds phone | slow/sparse + quiet-beat |
| D · Woman × woman | 2 women | 2 female | selfie or POV | banter: quick exchanges + pauses |
| E · CTA talking-head | 1 woman | 1 female | selfie | ONE flowing breath-group, no gaps |
| F · Action / no dialogue | 1 woman | none (ambient) | POV / third | pure motion beats, still per-second |

---

## A · SOLO UGC MONOLOGUE — one woman talks to camera (storytime / hot take / day-in-my-life)

Differs from the spec baseline only here:
```
VOICE & PACING: ONE voice — HER (on-cam, female, lip-sync), smooth young female voice. Story pacing:
natural connected sentences at conversational pace, a small beat between thoughts (~0.3–0.5s), one longer
[pause ~0.8] before the punchline. Never rushed, never robotic, never one word at a time.

PER-SECOND TIMELINE (SHE = on-cam, female, lip-sync — every second timed):
00.0–00.4  [start mid-action — she's already talking-adjacent: a breath, direct eye contact]
00.4–03.0  SHE: "<setup line — plants the question>" — casual, confident
03.0–03.4  [beat — a small knowing look]
03.4–07.5  SHE: "<escalation — the story builds>" — connected flow
07.5–08.3  [pause ~0.8 — she lets it hang, micro-smile]
08.3–12.5  SHE: "<the punchline / reveal>" — flat, matter-of-fact
12.5–15.0  SHE: "<the button / comment-bait question>" — direct to lens; hold the final frame
```
NEGATIVE add-ons: long dead gaps, dragging speech (this shape dies when it drags).

---

## B · DUET — SELFIE (she holds the phone; other voice off-cam) — proven: elevator reveal

```
SETUP: Seedance 2.0, Reference/text-to-video mode, 4–6 refs (face first), no START/LAST image, no ref video.
       15s · 9:16 · 480p draft → 720p final (Topaz after) · Generate Audio ON · Ref Audios EMPTY · Web Search OFF.
RULE: describe ONLY scene + outfit + lens, NEVER the character (identity = reference images only).
IMAGE REFERENCE MAP: face refs → identity · body sheet → body; keep identical the entire 15s.

PROMPT:
A continuous 15-second vertical 9:16 handheld phone SELFIE video, authentic amateur UGC, mild wide-lens
selfie distortion, filmed by the woman from the reference images inside a moving elevator. Build her exact
face, body and identity from the reference images and keep them identical the entire clip; never change her
face. She holds the phone in her raised hand at selfie distance in ONE stable pose for the ENTIRE clip — the
phone never leaves her hand, she never lowers her arm, never leans, never changes pose. She stands FREELY
near the middle of the car; the closed doors are off to ONE SIDE, not behind her back. Plain brushed-steel
and mirrored walls with NO digital floor display, NO glowing digits. In the upper-left, a young man's
reflection is visible in the polished steel the whole time; his forearm occasionally enters the bottom-left
frame edge — he is the off-camera person she talks to. She wears {OUTFIT}. Soft overhead downlight, mild
grain, her face sharp while the steel reflections stay slightly soft. ONE continuous take, no cuts, start mid-action.

VOICE & PACING: TWO voices, clearly distinct. SHE (on-cam, female, lip-sync) = smooth feminine voice, cold,
confident, a little arrogant. MAN (off-cam, male voice, never shown) = casual young male. Dialogue is SLOW
and SPARSE — roughly half the 15s is SILENCE: pauses, breaths, reaction looks. Each line lands, then a beat
of silence. NEVER runs lines together, NEVER rushes.

PER-SECOND TIMELINE:
00.0–01.8  [SILENCE — she lifts the phone, a cool glance to his reflection]
01.9–02.2  SHE (on-cam, female): "Hi."            [pause]
02.6–02.8  MAN (off-cam, male): "Hey."            [pause]
03.2–03.6  SHE: "What floor?"
03.9–04.2  MAN: "Twelve."                          [pause ~0.6 — she studies his reflection]
04.9–06.4  SHE: "Seen you twice. You never looked."   [pause ~0.4]
06.9–07.7  SHE: "You're looking now."                  [pause ~0.7]
08.5–09.9  SHE: "Men pay to watch me exist." — cold, arrogant, SLOW   [pause ~0.4]
10.4–11.1  SHE: "Dinner. My place."
11.3–11.7  MAN: "Right now?"                       [pause ~0.4]
12.1–12.5  SHE: "One thing."
12.7–12.9  MAN: "Yeah?"                            [pause ~0.3]
13.1–14.2  SHE: "You've been flirting with a render." — flat, deadpan   [pause ~0.5]
14.5–14.8  MAN: "...What time?" — unbothered
14.9–15.0  [SHE: a small knowing smirk to the lens — hold the final frame]

EFFECTS: 1 Timeline: stable selfie hold + reflection → sparse arrogant build → SIGNATURE: deadpan "render"
reveal → unbothered comeback + chime, doors open to the side, hold. 2 Inventory: selfie hold · reflection
upper-left · 6+ intentional silence beats · micro-expression reactions · chime+doors (no exit).
3 Density: 0–4.2 LOW-MED · 4.2–11.7 LOW-MED (big pauses) · 11.7–15 MED. 4 Motion flow: cool opener with
silence → she controls the beat (the silence IS the tension) → reveal lands, she smirks, frame held.

SCENE-LOCKS: [CHIME] one soft elevator ding ~13.0s; doors slide open to the SIDE. [POSE] one stable selfie
pose all 15s. [REFLECTION] the man stays a reflection; the camera never turns to him. [WALLS] plain
steel/mirror only — no displays, no text.

NEGATIVE: base set + leaning on wall/doors, doors opening behind her back, turning the camera to the man,
glowing floor display, warm or grateful delivery on the reveal.
PREFLIGHT + COST/RISK: per package-spec. Trigger line = the deadpan reveal.
```

---

## C · DUET — POV (the OTHER person holds the phone; her hands free) — proven: street-corner reveal V5

Differs from B in the camera + a quiet-beat structure (SHE goes silent while HE reacts). Lens = look #1
(GoPro porthole) from `looks.md` — this shape almost always pairs with it:
```
PROMPT (camera/lens part):
… shot on an ULTRA-WIDE FISHEYE phone lens (GoPro-style), STRONG fisheye barrel distortion with a DARK
ROUNDED VIGNETTE border framing the image — curved black corners, the subject bulging slightly toward the
center. The OFF-CAMERA MAN holds the phone and films her POV-style: his single dark jacket sleeve and
forearm enter from the BOTTOM-LEFT of the frame; the camera is held CLOSE and slightly BELOW her eye level,
looking up at her, very intimate — she fills the frame from the hips up. She is NOT holding a phone; her
hands are free and gesture naturally. …

VOICE & PACING: TWO voices. SHE (on-cam, female, lip-sync) = main speaker: the hook, the reveal, the final
line. MAN (off-cam, male voice, never shown) = only his short reaction in the middle WHILE SHE LOOKS DOWN
AND STAYS QUIET. She starts slightly quick and breathless on the hook, slows into a direct honest reveal,
goes quiet for his beat, then a soft final line. Keep the two voices clearly distinct (female vs male).

PER-SECOND TIMELINE (the quiet-beat pattern):
00.0–00.4  [start mid-action — close, a quick breath, direct eye contact]
00.4–01.6  SHE (on-cam, female): "<the call-out hook>" — breathless, half-smiling   [tiny pause]
01.6–03.8  SHE: "<the setup, two connected lines>"
03.8–04.8  [small beat — she steadies and holds his gaze]
04.8–06.6  SHE: "<THE REVEAL>" — flat, direct, honest, watching his reaction   [pause ~0.4]
06.9–08.5  SHE: "<the soft follow-up>"
08.5–10.0  [SHE goes QUIET and glances DOWN — she does NOT speak] MAN (off-cam, male): "<reaction part 1>"
11.0–12.3  MAN (off-cam, male): "<reaction part 2>"   [she looks back up]
12.8–14.6  SHE: "<the soft final line>" — a little relieved
14.6–15.0  [a small knowing look back to the lens — hold the final frame]

NEGATIVE add-ons (the POV bugs): her voicing the man's lines, a single voice for everyone, the woman
speaking during his reaction, her holding a phone, a selfie pose, a raised phone arm, arms from both bottom
corners, a flat frame with no vignette, no fisheye.
```

---

## D · WOMAN × WOMAN — two women, both voices female (roommate banter / duet skit)

The tagging matters MOST here — two same-gender voices collapse without distinct registers:
```
VOICE & PACING: TWO female voices, clearly distinct registers. WOMAN 1 (on-cam, female, lip-sync) = the
model from the reference images — smooth, confident, slightly lower register. WOMAN 2 (off-cam, female
voice, never shown — or: enters only as a shoulder at the frame edge) = brighter, faster, higher register.
Banter pacing: quick short exchanges with small pauses, one longer pause before the twist.

PER-SECOND TIMELINE (tag every line — the model must never mix the two women):
00.0–00.5  [start mid-action — WOMAN 1 mid-eyeroll at the lens]
00.5–01.5  WOMAN 2 (off-cam, female, bright): "<the provocation>"
01.8–02.6  WOMAN 1 (on-cam, female, lower register): "<dry comeback>"   [pause ~0.4]
…continue: every second timed, pauses scripted, final frame held…

RULE add-on: only WOMAN 1 is built from the reference images. WOMAN 2 stays off-cam (voice only / shoulder
at the edge) — never a second face in focus, it would fight the identity refs.
NEGATIVE add-ons: both voices sounding identical, a second woman's face in focus, the model answering
herself, two women holding phones.
```

---

## E · CTA TALKING-HEAD — one flowing pitch, no gaps (~8s) — proven

```
PROMPT (scene part): … dimly lit bedroom in the evening — warm bedside-lamp light, cozy bed blurred behind
her (the intimate late-evening creator mood) … direct selfie, NO mirror … ONE stable pose … mild grain,
slight wide-lens selfie distortion, face sharp. ONE continuous take, no cuts, start mid-action.

VOICE & PACING: ONE voice — SHE (on-cam, female, lip-sync). ONE continuous, natural, flowing delivery at
normal conversational pace: the WHOLE thing as a single smooth thought, lines connect directly, NO long
gaps, NO big pauses, never dragging. Confident, knowing, slightly teasing.

PER-SECOND TIMELINE:
00.0–00.3  [start mid-action, a small knowing smile]
00.3–02.6  SHE (on-cam, female): "<the smug hook>" — flows STRAIGHT on, no gap
02.6–03.5  SHE: "<the call-out>" — direct to lens, connected
03.5–04.3  SHE: "comment <KEYWORD>" — leans in, points to lens, no gap
04.3–06.1  SHE: "<the promise>" — warm, confident, straight through
06.1–06.8  [hold — the edit cuts to the proof page]

NEGATIVE add-ons: long gaps between lines, big pauses, slow dragging speech, clipped beats (this shape dies
with pauses — the exact opposite of the duets).
```

---

## F · ACTION / NO DIALOGUE — motion clip (walk-by, get-ready, product beat; 4–8s)

No voices — but the seconds are STILL timed (motion beats instead of lines):
```
VOICE & PACING: no dialogue. Ambient audio only (street/room tone). All timing lives in motion beats.

PER-SECOND TIMELINE (motion beats — every second still accounted for):
00.0–01.0  [she reaches toward the lens — as if setting the phone down; slight focus breath]
01.0–03.0  [she steps back ONCE to mid-frame and settles — then holds position; no further walking]
03.0–05.5  [the featured action: turn to profile / hair flip / holds the product to the light]
05.5–07.0  [she looks back into the lens — micro-smile]
07.0–08.0  [hold the final frame]

POSE note: max ONE positional change (the settle) — after it she is stationary; fast continuous motion
breaks the face. Everything flashy goes in the EDIT.
NEGATIVE add-ons: continuous walking, dancing, fast spins, whip pans, face going soft during motion.
```
