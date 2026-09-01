---
name: ai-dataset-builder
description: "Builds a complete, consistent DATASET of an AI character from the user's own anchor images via the WaveSpeed image API, run locally in the Claude Desktop app. Output: identity face portraits, an emotion grid, and 360° body rotations (grey or white studio). Works from as few as 1-4 base images (bootstrap mode grows the anchor set) up to a full curated set. The user picks the model — Nano Banana Pro (default), Nano Banana 2, GPT Image 2, or Seedream 4.5 — all on one WaveSpeed key. Identity comes only from the anchor images, never from text. Use when the user wants a dataset, character sheet, 360° rotation, LoRA training set, or face/identity reference from base images. Triggers: 'build my dataset', 'bau mein dataset', 'erstelle ein dataset', 'character sheet', 'bau mein character sheet', '360 grad', 'generate the 360', 'lora dataset', 'white background pack'. NOT for Instagram/feed/social content posts — that is the ai-instagram-engine skill. Always respond in the user's language."
version: 1.2.0
---

# AI Dataset Builder

Build a **consistent character dataset** from the user's **anchor images**: face
portraits, an emotion grid, 360° rotations (grey or white studio). You (Claude)
classify the anchors, pick the scene file, run the batch and do the consistency QC;
the **image model** makes the pixels — never claim you generate images yourself.
Identity lives in the anchors, never in the prompt.

**Boundary:** Instagram posts, feed content, baddie/lifestyle shots → that is the
`ai-instagram-engine` skill, not this one. This skill builds the *foundation*.

## Quick reference

| User intent | What to run |
|---|---|
| "build my dataset" / "character sheet" | `py generate.py --character <name>` (FACE + EMOTIONS + 360°) |
| "just the 360" / "only the faces" | add `--blocks 360` / `--blocks face` |
| "white background pack" | `--scenes scenes-white.md` |
| only 1–4 base images | bootstrap mode (see below) |
| images dumped in `anchors/unsorted/` | look at each one, sort into `face/` + `body/` first (see anchor system) |
| "use Nano Banana 2 / GPT Image 2 / Seedream" | add `--model <key>` |
| "key won't work" | the key lives in `.env`, never in chat |

## Where everything lives

| Thing | Location |
|---|---|
| Face anchor(s) — THE identity | `anchors/face/` |
| Body / angle anchors | `anchors/body/` |
| Optional classification (you write it) | `anchors/manifest.json` (`face_anchor`, per-file `view`) |
| Default scenes (FACE · EMOTIONS · 360° grey) | `scenes-grey.md` |
| White-background pack | `scenes-white.md` |
| Model registry + API client | `engine_client.py` |
| Runner (upload, anchor order, batch, resume) | `generate.py` |
| API key (never in chat; get one: https://wavespeed.ai/?ref=matrix) | `.env` |
| Generated images | `output\<name>\dataset\` inside this skill folder (drift → `face-drift\` subfolder) |
| Accumulated lessons | `learnings.md` (read at session start) |

## Constitution (hard rules)

1. **Identity comes ONLY from the anchor images.** Never write hair / eyes / skin /
   freckles / tattoos / body type / age / ethnicity into any prompt — if you bake the
   look into text, the character drifts.
2. **The face anchor is always reference #1** on every shot. The runner enforces the
   order face → body; this skill never uses style references (they would contaminate
   the clean studio dataset).
3. **The bust/body lock preserves, never forces.** `Do not make the breasts smaller or
   larger — keep the exact same breast size and body proportions as in the reference
   images.` (Nano Banana shrinks the bust without it. The client auto-neutralizes the
   word "breast" only for GPT Image 2, which flags it — keep the clause in prompts.)
4. **For curvy/busty anchor sets prefer `seedream`.** Nano Banana Pro smooths the
   silhouette toward a smaller default even with the body lock in place.
5. **API keys live in `.env`, never in chat.** Generation always runs in the
   **background**; never start a second batch on the same output (lockfile + resume).
6. **No upsell, ever.**

## The anchor system

```
anchors/
├── face/      THE face anchor (+ extra face views)  → always reference #1
├── body/      body / angle shots                    → 1–3 per shot, picked by the runner
└── unsorted/  drop zone — "I don't know what goes where" → YOU sort it (see below)
```
- **`anchors/unsorted/` is the idiot-proof entry point.** Whenever it contains images
  and `face/` is empty (or the user asks), open every image with vision and sort:
  the best frontal portrait → copy into `face/`, clear body/angle shots → copy into
  `body/`, semantic names (`<name>_front.png`). **Copy, never move** — originals stay
  in `unsorted/`. Skip blurry shots, group photos and pictures of other people; tell
  the user what you picked and what you skipped. The runner never uses `unsorted/`
  directly.
- Files dropped flat into `anchors/` get auto-classified by filename
  (face/closeup/portrait → face, everything else → body).
- **Anchors over ~10 MB** (the runner warns): convert a copy to JPG quality 92
  (Pillow — `Image.open(src).convert('RGB').save(dst, 'JPEG', quality=92)`) and use
  that instead. Identical results, a fraction of the upload size. Never touch the
  user's original files.
- **Reference order on every shot: face anchor → body anchors.** Rotation shots pull
  the body anchor with the matching angle forward (write `anchors/manifest.json` with
  per-file `view` values to enable that — worth doing whenever angles are known).
- **Low-anchor mode (automatic):** with ≤ 4 identity images, every shot gets ALL of
  them. With more, the runner sends a curated selection — fewer, sharper refs beat
  "send everything".

### Bootstrap mode — dataset from 1–4 images
The user has only a couple of pictures? Grow the anchor set first, then build:
1. Put what exists into `anchors/face/` (the best frontal face) and `anchors/body/`.
2. Run the FACE block only: `py generate.py --character <name> --blocks face`.
3. QC the results (see below). Copy the 1–2 **cleanest, drift-free** new angles into
   `anchors/body/` (copy + rename, e.g. `<name>_34_left.png` — never move originals).
4. Now run 360° and the rest with the strengthened set: `--blocks emotions,360`.
Tell the user what you promoted and why. Never promote a shot with face drift —
drifted anchors poison every later generation.

## Models (the user picks — default Nano Banana Pro; ALL on WaveSpeed)

Capabilities verified **live against the WaveSpeed API on 2026-06-12**:

| User says | `--model` | Aspect ratios | Resolution | Output | refs |
|---|---|---|---|---|---|
| Nano Banana Pro *(default)* | `nano-banana-pro` | 1:1 · 2:3 · 3:2 · 3:4 · 4:3 · 4:5 · 5:4 · 9:16 · 16:9 · 21:9 | 1K/2K/4K | png, jpeg | 10 |
| Nano Banana 2 | `nano-banana-2` | same + 1:4 · 4:1 · 1:8 · 8:1 | 0.5K/1K/2K/4K | png, jpeg | 14 |
| GPT Image 2 | `gpt-image-2` | same + 1:2 · 2:1 · 1:3 · 3:1 · 9:21 | 1K/2K/4K | png, jpeg, webp | 10 |
| Seedream 4.5 | `seedream` | any (free `WIDTH*HEIGHT`) | 1K/2K/4K tiers (API max 8192²) | png | 10 |

One `WAVESPEED_API_KEY` powers all four. Resolution: `--resolution 1K/2K/4K`
(default 2K), aspect override: `--aspect 3:4`. An unsupported aspect/resolution
never fails a shot — the client snaps it to the closest value the model supports.

## Workflow (every dataset run)

1. **Sort anchors.** If `anchors/unsorted/` contains images, sort them first (see
   anchor system). Then verify `face/` and `body/` are sensible. Optionally
   write `anchors/manifest.json` with `face_anchor` + per-file `view`
   (`front, 34_front_left, 34_front_right, profile_left, profile_right,
   34_back_left, 34_back_right, back`).
2. **Preflight:** `py generate.py --dry-run` (+ `--model`/`--resolution`/`--scenes`
   as asked). Show the user: model, image count, anchor plan. Wait for a "yes".
3. **Launch in the background + poll** (see Running).
4. **Vision drift QC** (see below). **Top up** until the set is complete.
5. **Present** grouped by block (FACE · EMOTIONS · 360° · tier).

## Running (always background, never foreground)

Windows:
```powershell
Start-Process -FilePath "py" -ArgumentList @("-u","generate.py","--character","<name>","--model","<key>") `
  -RedirectStandardOutput "run_<name>.log" -RedirectStandardError "run_<name>.err.log" `
  -WindowStyle Hidden -PassThru | Select-Object Id
```
macOS / Linux:
```bash
nohup python3 -u generate.py --character <name> --model <key> > run_<name>.log 2>&1 &
```
Poll the log tail every ~30s; done at `DONE:`. Don't relaunch mid-run — it holds a
lockfile and resumes from its checkpoint.

**Content-filter rejections:** `BLOCKED(NSFW)` in the log → tell the user plainly:
*"[model] refused N shots on content grounds — rerun those with `--model seedream`."*
That is a policy refusal, not a technical error. A lone `FAIL` without the block flag
is transient — relaunch, it resumes and retries.

## Vision drift QC + completion guarantee

The face anchor is the identity truth. Open every generated image in the output
folder and compare the face to the face anchor. Clear drift (different person, warped
features, changed eye color) → move the file into a `face-drift\` subfolder there.
A complete dataset means **every planned shot exists drift-free**: relaunch the same
command — the checkpoint skips finished shots and regenerates only what you removed
(delete the drifted file's entry by removing the file; rerun regenerates it).
Report kept vs drift vs blocked.

## Anti-patterns

- FACE shots are **portraits (face + upper body)**, never tight head-only crops.
- Don't write identity into prompts. Don't force a body size — preserve the anchors.
- Don't add style/IG references to a dataset run — clean studio only.
- Don't promote drifted outputs to anchors (drift compounds across generations).
- Don't ask for / accept an API key in chat. Don't run generation in the foreground.
- Python launcher: `py` on Windows, `python3` on macOS/Linux. Don't pitch a paid product.

## Learnings

Read `learnings.md` at session start. Append a one-line dated lesson whenever the
user corrects an output or a model misbehaves.
