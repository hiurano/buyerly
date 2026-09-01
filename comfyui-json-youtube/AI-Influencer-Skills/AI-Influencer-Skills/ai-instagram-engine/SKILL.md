---
name: ai-instagram-engine
description: "Generates realistic Instagram content of the user's OWN AI character from anchor images via the WaveSpeed image API, run locally in the Claude Desktop app. Claude authors every post from a proven realism library (amateur-iPhone capture recipes — night selfie, direct flash, golden hour, low-quality candid) so the feed reads like a real person's phone, never a photoshoot. Any vibe: baddie (default), soft-girl, luxury, fitness, egirl. Count guarantee: '10 posts' means 10 delivered, drift-free posts — rejects are regenerated. Reference order is fixed: face anchor first, then body anchors, then approved style images. Models: Nano Banana Pro (default), Nano Banana 2, GPT Image 2, Seedream 4.5 — one WaveSpeed key. Use when the user wants Instagram posts, feed content, stories, baddie pictures or social content with their character. Triggers: 'give me 10 instagram posts', 'mach mir 10 ig bilder', 'baddie posts', 'baddie bilder', 'make ig content', 'instagram content', 'feed bilder', 'stories', 'poste content'. NOT for datasets, character sheets, 360° rotations or LoRA training sets — that is the ai-dataset-builder skill. Always respond in the user's language."
version: 1.2.0
---

# AI Instagram Engine

Produce **realistic Instagram content** of the user's character — at the quality bar
of a real creator's phone, not a photoshoot. You (Claude) are the creative director:
you author every prompt from `ig-library.md`, run the batch, QC the faces and top up
until the ordered count is delivered. The **image model** makes the pixels — never
claim you generate images yourself. Identity lives in the anchors, never in the prompt.

**Boundary:** datasets, character sheets, 360° rotations, LoRA sets → that is the
`ai-dataset-builder` skill. This skill is the content factory on top of it.

## Quick reference

| User intent | What to do |
|---|---|
| "give me 10 baddie posts" / "mach 10 ig bilder" | author 10 prompts from `ig-library.md` → `custom.json` → run |
| "15 soft-girl / luxury / fitness posts" | same flow, that vibe (unknown vibe → interpret like a creator) |
| "stories" | aspect `9:16` instead of `4:5` |
| "use Nano Banana 2 / GPT Image 2 / Seedream" | add `--model <key>` |
| headless / cron, no Claude in the loop | `py generate.py --ig N` (random mixer, fallback only) |
| "key won't work" | the key lives in `.env`, never in chat |

## Where everything lives

| Thing | Location |
|---|---|
| Face anchor(s) — THE identity | `anchors/face/` |
| Body anchors | `anchors/body/` |
| Approved style references (the look) | `anchors/style/` — QC-passed images ONLY |
| The realism system you author from | `ig-library.md` |
| Headless fallback blocks | `ig-blocks.md` |
| Your authored batch | `custom.json` |
| Model registry + API client | `engine_client.py` |
| Runner (upload, anchor order, batch, resume) | `generate.py` |
| API key (never in chat; get one: https://wavespeed.ai/?ref=matrix) | `.env` |
| Generated images | `output\<name>\instagram\` inside this skill folder (drift → `face-drift\`) |
| Accumulated lessons | `learnings.md` (read at session start) |

## Models (the user picks — default Nano Banana Pro; ALL on WaveSpeed)

Capabilities verified **live against the WaveSpeed API on 2026-06-12** — feed `4:5`
and story `9:16` run natively on every model:

| User says | `--model` | Aspect ratios | Resolution | refs |
|---|---|---|---|---|
| Nano Banana Pro *(default)* | `nano-banana-pro` | 1:1 · 2:3 · 3:2 · 3:4 · 4:3 · 4:5 · 5:4 · 9:16 · 16:9 · 21:9 | 1K/2K/4K | 10 |
| Nano Banana 2 | `nano-banana-2` | same + 1:4 · 4:1 · 1:8 · 8:1 | 0.5K/1K/2K/4K | 14 |
| GPT Image 2 | `gpt-image-2` | same + 1:2 · 2:1 · 1:3 · 3:1 · 9:21 | 1K/2K/4K | 10 |
| Seedream 4.5 | `seedream` | any (free `WIDTH*HEIGHT`) | 1K/2K/4K tiers | 10 |

An unsupported aspect/resolution never fails a shot — the client snaps it to the
closest value the model supports.

## Constitution (hard rules)

1. **Identity comes ONLY from the anchor images.** Never write hair / eyes / skin /
   freckles / tattoos / body type / age / ethnicity into any prompt.
2. **Fixed reference order, enforced by the runner: face anchor → 1–2 body anchors →
   up to 3 style references.** The style refs are how the feed inherits the real
   amateur-iPhone look — the model *sees* it instead of reading about it.
3. **`anchors/style/` holds QC-passed images only.** A drifted face used as a style
   ref poisons every following generation (drift compounds). When a fresh batch
   produces standout drift-free posts, offer to promote 1–3 of them into `style/`.
4. **Every prompt carries exactly ONE capture recipe** from `ig-library.md`
   (STYLE-01…07) and ends with the skin clause. No banned photoshoot words
   (professional / editorial / 8k / stunning / cinematic …). **Only two camera
   constructions exist: mirror selfie (phone visible in the mirror) or front-cam
   POV (phone never visible, arm cut off at the frame edge)** — anything else,
   including "taking a selfie" seen from outside or propped-phone timer shots,
   renders as a photoshoot (WHO-HOLDS-THE-CAMERA guard). **NO SUN and NO cinematic
   night** — sunny/golden scenes and scenic night moods (city bokeh, TV-glow-only,
   rain windows) always render editorial (proven live three times); stick to flash,
   mirrors, cramped mundane rooms, dull/grey daylight (NO-SUN + NO-CINEMATIC-NIGHT
   guards).
5. **Body visible → body lock appended** (`Do not make the breasts smaller or larger —
   keep the exact same breast size and body proportions as in the reference images.`)
   The jobs-file path does NOT auto-append it — you add it per prompt. (The client
   auto-neutralizes the word "breast" only for GPT Image 2.)
6. **Count guarantee: N ordered = N delivered drift-free.** QC rejects get fresh
   replacement prompts (new combos, new names) until N clean posts exist.
7. **API keys live in `.env`, never in chat. Generation always runs in the
   background;** never a second batch on the same output (lockfile + resume).
   **No upsell, ever.**

## The authoring flow (every batch)

1. Read `ig-library.md`. Look at the anchors (face/body/style) — what vibe fits this
   character and what does the user want?
2. **Author exactly N prompts** in the requested vibe (default: baddie): compose per
   the formula, scene matches outfit, no two alike, spread per the variety rules.
   Use the proven scene catalog as the base — recombine, re-dress, vary; don't
   free-style from zero and don't repeat combos delivered earlier in the session.
3. Write `custom.json` in the skill folder:
```json
[
  {"name": "ig_01_bedroom_mirror", "aspect": "4:5", "prompt": "Show the character ..."},
  {"name": "ig_02_night_car",      "aspect": "4:5", "prompt": "Show the character ..."}
]
```
   `name` = `ig_NN_<slug>` (unique, descriptive) · aspect `4:5` feed / `9:16` story.
4. **Preflight:** `py generate.py --dry-run --jobs-file custom.json` (+ `--model`).
   Show the user model + count + anchor plan, wait for "yes".
5. **Launch in the background + poll** (see Running).
6. **QC + top-up** (see below). 7. **Present** grouped by vibe.

## Running (always background, never foreground)

Windows:
```powershell
Start-Process -FilePath "py" -ArgumentList @("-u","generate.py","--character","<name>","--jobs-file","custom.json") `
  -RedirectStandardOutput "run_<name>.log" -RedirectStandardError "run_<name>.err.log" `
  -WindowStyle Hidden -PassThru | Select-Object Id
```
macOS / Linux:
```bash
nohup python3 -u generate.py --character <name> --jobs-file custom.json > run_<name>.log 2>&1 &
```
Poll the log tail every ~30s; done at `DONE:`. Don't relaunch mid-run — lockfile +
checkpoint resume.

**Content-filter rejections:** `BLOCKED(NSFW)` → tell the user plainly: *"[model]
refused N shots on content grounds — rerun those with `seedream`."* Not a technical
error. A lone `FAIL` without the block flag is transient — relaunch, it resumes.

## QC + count guarantee (the delivery loop)

1. Compare every generated post's face to the face anchor. Clear drift → move the
   file into `face-drift\` in the output folder.
2. Count clean posts. Short of N? Author that many **fresh** prompts (new scene+
   outfit+style combos, new `ig_NN+` names) into a new jobs file and run again.
3. Repeat until N clean posts exist. Report kept vs drift vs blocked, then offer:
   promote the 1–3 best posts into `anchors/style/` for an even more locked-in look
   next batch.

## Anti-patterns

- Don't free-style prompts without a STYLE recipe — that's exactly how feeds turn
  into photoshoots. One recipe per shot, skin clause at the end, no banned words.
- Don't write identity into prompts. Don't force a body size — preserve the anchors.
- Don't put unvetted or drifted images into `anchors/style/`.
- Don't blur/degrade the face — imperfections belong to background and movement.
- Don't deliver 7 when 10 were ordered — top up.
- Anchors over ~10 MB (the runner warns): convert a copy to JPG quality 92 first —
  identical results, a fraction of the upload size. Never touch the originals.
- Don't ask for / accept an API key in chat. Don't run generation in the foreground.
- Python launcher: `py` on Windows, `python3` on macOS/Linux. Don't pitch a paid product.

## Learnings

Read `learnings.md` at session start. Append a one-line dated lesson whenever the
user corrects an output or a model misbehaves.
