# Reel Machine — clone any viral AI reel with YOUR own consistent model

Take a reel that's **already going viral**, rebuild it in **Seedance 2.0** with **your own AI model** — same
face, same body, every time. Runs inside **Claude Code**; you type English, Claude fires the generations.

## What you get — 2 skills (they load automatically when you open Claude Code in this folder)
1. **`reel-intake`** — give it a reel LINK (it downloads it) or drop the FILE in. It extracts every single
   frame + a contact sheet, pulls the word-timed transcript, verifies who speaks each line, and *watches*
   the reel to write the teardown — the rebuild blueprint.
2. **`seedance-prompter`** — the master prompting skill. Reads the teardown + your model's reference images,
   writes the uniform per-second Seedance 2.0 package (every second timed, every line tagged with speaker +
   gender + on/off-cam, 6 shapes from solo UGC to duets, 6 lens looks incl. the GoPro porthole), fires the
   generation on WaveSpeed and self-checks the draft. 480p draft → ONE 720p final → Topaz to 1080×1920.

**You bring your model's reference images** (4–6 consistent shots, in `characters/<name>/refs/`). Don't have a
consistent model yet? Building one is the `_skool/character-builder` bonus (that's the "owned asset" part).

## The one rule that makes it work
**Identity comes ONLY from reference images — never from words.** You never describe your model's face/hair/body
in a prompt (that causes drift). You describe the *outfit* and the *scene*; her identity is carried by the refs.

## Setup (once, ~3 min) — full guide in [INSTALL.md](INSTALL.md)
- **Mac/Linux:** `./setup.sh` — installs the WaveSpeed CLI, checks jq + ffmpeg, logs you in.
- **Windows:** `winget install Git.Git OpenJS.NodeJS.LTS Gyan.FFmpeg jqlang.jq` → `npm i -g @wavespeed/cli` → `wavespeed login`.
- Unsure what's missing? The skills check your machine themselves (doctor scripts) and tell you exactly what to install.

You need: Claude Code (or any AI agent — see INSTALL.md), a [WaveSpeed](https://wavespeed.ai) account + API key (pay-per-generation, no subscription).
**One key does both the images (Nano Banana Pro) and the videos (Seedance 2.0).**

## Cost (WaveSpeed, pay per generation)
- Character images: ~$0.14 each (Nano Banana Pro).
- Reel clip: ~$1.50 per 480p draft → ~$3 for ONE 720p final (Seedance 2.0, 15s).
- **The trick:** never generate at 1080p/4k — finalize at 720p and upscale to 1080×1920 with Topaz Video AI.
  Same look, a fraction of the price, even posting every day.

## The flow
```
[setup]    put your model's 4–6 reference images in  characters/<name>/refs/
[per reel] here's a viral reel   + the link          → reel-intake → seedance-prompter → your reel
```

## No-install fallback
Don't want to install anything? Let Claude write the prompts and paste them into the WaveSpeed website
(wavespeed.ai) yourself. Slower, but zero setup.

> Tools you don't own the rights to (a creator's face/voice, copyrighted audio) are for FORMAT study only —
> rebuild the *structure* with your own model and your own/licensed audio. Never republish someone else's file.
