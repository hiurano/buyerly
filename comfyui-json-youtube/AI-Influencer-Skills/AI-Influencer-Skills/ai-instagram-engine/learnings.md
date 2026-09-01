# Learnings

Read at the start of every session. Append a one-line dated lesson whenever the user
corrects an output or a model behaves unexpectedly.

- 2026-06-12 (carried over) — Free-styled IG prompts drift into a polished
  photoshoot look. Always compose from `ig-library.md` with exactly ONE capture
  recipe per shot + the skin clause; never use the banned photoshoot words.
- 2026-06-12 (carried over) — Identity is a HARD ceiling: a girl-next-door anchor
  set yields "that girl in a baddie pose", never a different bombshell. True baddie
  look needs baddie ANCHOR images. Styling ≈ 70-80%, casting ≈ 20-30%.
- 2026-06-12 (carried over) — Bust lock is NOT auto-appended in jobs-file mode —
  Claude adds it to every body-visible prompt. GPT Image 2 NSFW-flags the word
  "breast"; the client auto-neutralizes it only for that model.
- 2026-06-12 (carried over) — Nano Banana Pro 4K shrinks the bust on curvy anchor
  sets even with the lock clause. For busty/curvy characters default to `seedream`.
- 2026-06-12 — `anchors/style/` accepts QC-passed images only; a drifted style ref
  compounds drift across every later batch.
- 2026-06-12 — This skill is SFW only by design (free community lead magnet).
- 2026-06-12 (bake-off, live) — GPT Image 2 blocks on the REFERENCE IMAGES, not the
  text: busty anchor/style refs got both shots flagged even with zero anatomy words
  in the prompt. For curvy characters use Nano Banana Pro; GPT Image 2 only suits
  modest anchor sets.
- 2026-06-12 (bake-off, live) — The DOUBLE bust lock (explicit clause as sentence 2
  AND as the final sentence, e.g. "keep the exact same ultra large breast size,
  F cup") held full proportions on Nano Banana Pro at 2K — single trailing lock was
  not enough historically. Adapt the size descriptor per character; never hardcode.
- 2026-06-12 (bake-off, live) — NB Pro renders STYLE-04 "low-quality grainy" too
  clean. The phone-grade pass after QC (JPG ~q82 + downscale) supplies the final
  compression realism.
- 2026-06-12 (validation batch, live, 12 fresh prompts) — Two further failure modes
  found and fixed: (1) "Show the character taking a selfie" renders the ACT from a
  third-person camera (her holding the phone up, photographed from outside) — only
  two constructions are legal: MIRROR selfie (phone in mirror; never failed once
  across all batches) or explicit FRONT-CAM POV (phone never visible); propped-
  phone/timer shots break logically (phone visible in its own photo) and render
  editorial. (2) NO CINEMATIC NIGHT: scenic night moods (city-bokeh panorama,
  TV-glow-only, rain-streaked window) render as noise-free cinematic photography
  even with correct selfie POV — night must be cramped + mundane (car, bed, small
  bathroom) or flash-lit. Score: all 5 mirror shots + all flash shots + both muted-
  daylight shots passed; all 5 fails were third-person acts or scenic night.
- 2026-06-12 (redo round, live) — THE definitive realism rule: LIGHT REGIME beats
  everything. The selfie-POV fix alone did NOT save sunny scenes — golden-hour
  balcony WITH selfie arm + lens flare, kitchen WITH visible phone + blown window,
  sunny sidewalk WITH phone in hand all still rendered as photoshoots, while the
  flat-light gym and the dark couch from the same batch passed. Direct sun / warm
  bright daylight = editorial, unfixable by prompt. NO-SUN guard added; STYLE-05
  golden-hour replaced by overcast-outdoor; STYLE-01 is now dull/muted only; kitchen
  + city-sidewalk + all sunny seeds removed from the catalogs (user decision).
- 2026-06-12 (12-post demo, live) — 5 of 13 shots rendered as fake photoshoots; the
  8 good ones were all night/flash/lamp SELFIES. Two proven root causes: (1) an
  implied PHOTOGRAPHER ("walking toward the camera", posed balcony/kitchen with no
  phone in scene) flips the model into editorial mode — the camera must always be
  hers (selfie / mirror / propped phone); (2) bright-daylight recipes without
  concrete physical flaws get beautified — night/flash force real sensor physics,
  daylight needs explicit blown highlights/grain/tilt. STYLE-01/05/06 rewritten,
  WHO-HOLDS-THE-CAMERA guard + 2/3-night light balance added.
- 2026-06-12 (carried from the dataset-skill live test) — `.env` values OVERRIDE the
  process environment; output lives INSIDE the skill folder (Desktop-app sandbox);
  anchors over 10 MB get converted to JPG q92 copies; capabilities verified live:
  4:5 and 9:16 run natively on ALL four models (the old "GPT Image 2 can't do 4:5"
  assumption was wrong — the client snaps only truly unsupported values).
