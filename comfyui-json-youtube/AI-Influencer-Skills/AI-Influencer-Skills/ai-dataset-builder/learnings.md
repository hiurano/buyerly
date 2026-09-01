# Learnings

Read at the start of every session. Append a one-line dated lesson whenever the user
corrects an output or a model behaves unexpectedly.

- 2026-06-12 (carried over) — FACE shots are **portraits (face + upper body)**, NOT
  tight head-only crops — tight crops make poor dataset/anchor material.
- 2026-06-12 (carried over) — The body lock must **preserve**, never force a size:
  universal skill, any character — never write a specific size.
- 2026-06-12 (carried over) — GPT Image 2 NSFW-flags the word "breast"; the client
  auto-neutralizes it ONLY for that model (`engine_client._neutralize_bust`). Keep
  the real clause in prompts for Nano Banana / Seedream.
- 2026-06-12 (carried over) — Nano Banana Pro 4K shrinks the bust on curvy anchor
  sets even WITH the lock clause (face fine, proportions lost). For busty/curvy
  anchor sets default to `seedream`; NB Pro is fine for slim/athletic sets.
- 2026-06-12 (carried over) — By design the sheet FACE/EMOTIONS/360° (grey) prompts
  carry NO skin-realism clause; the white pack keeps it (white backgrounds flatten
  skin). Add it per-shot only if a model renders waxy skin.
- 2026-06-12 — This skill is SFW only by design. `scenes.md` renamed to
  `scenes-grey.md` to mirror `scenes-white.md`.
- 2026-06-12 — Idiot-proofing pass (core 5.4.0): friendly 401 message ("check your
  key in .env" + ref link), empty-balance detection with top-up hint, >10 MB anchor
  warning (convert to JPG q92), SKIP label fixed (skipped shots printed "OK" and
  looked like paid regenerations).
- 2026-06-12 — `.env` values OVERRIDE the process environment (was `setdefault`):
  a stale `WAVESPEED_API_KEY` env var silently shadowed the real key and produced
  a confusing 401 on upload. The .env file is the skill's single source of truth.
- 2026-06-12 — Output lives INSIDE the skill folder (`output/<name>/`): the Claude
  Desktop app runs sandboxed and may have access to nothing but this folder — never
  write to Desktop/Documents/other absolute paths.
- 2026-06-12 — Capabilities verified LIVE against the WaveSpeed API: GPT Image 2
  supports 15 aspect ratios (the old "1:1/2:3/3:2 only" assumption was wrong —
  3:4 and 4:5 work natively now); Nano Banana 2 adds a 0.5K tier and 1:4/4:1/1:8/8:1;
  Seedream validates `size` only at runtime (submit accepts anything), official max
  8192x8192. The client now snaps invalid aspect/resolution to the closest supported
  value instead of letting the API 400.
