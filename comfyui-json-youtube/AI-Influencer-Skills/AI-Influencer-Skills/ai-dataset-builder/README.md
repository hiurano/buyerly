# AI Dataset Builder

Turn a few base photos of your AI character into a full, **consistent dataset** —
face portraits, an emotion grid, and 360° body rotations (grey or white studio).
Fully automatic, run inside the **Claude Desktop app**. Claude
does the work; your chosen WaveSpeed model (Nano Banana Pro, Nano Banana 2,
GPT Image 2, or Seedream 4.5) makes the pixels.

Building **Instagram content** instead? That's the separate `ai-instagram-engine`
skill — this one builds the character foundation.

---

## Setup — 3 steps

**1. Install the skill**
Put this whole `ai-dataset-builder` folder into your Claude skills folder:
- **Windows:** `C:\Users\<you>\.claude\skills\`
- **Mac:** `~/.claude/skills/` — the `.claude` folder is hidden; press
  **Cmd+Shift+.** in Finder to see it.

So the path ends `…/.claude/skills/ai-dataset-builder/SKILL.md`.
(Careful when unzipping: avoid a double-nested `ai-dataset-builder/ai-dataset-builder/`.)

**2. Add your API key (never paste it in the chat)**
Open the **`.env`** file in this folder, paste your key, save:
- **[WaveSpeed](https://wavespeed.ai/?ref=matrix)** key → powers **all** models

**3. Add your base images**
- Best face photo(s) → `anchors/face/`
- Body / angle shots → `anchors/body/`
- **Not sure what goes where? Dump everything into `anchors/unsorted/`** — Claude
  looks at every picture and sorts it for you.

Even **1–4 images are enough** — Claude runs a bootstrap pass that grows the anchor
set first. The more angles you have, the more consistent the result.
Use JPG / PNG / WEBP (iPhone HEIC must be converted first — Claude will tell you).

---

## Run it

In the Claude Desktop app, just say:

> **build my dataset**

Want a specific model? Say **"use Seedream 4.5"**. Want 4K? Say **"in 4K"**.
Want one part? **"just the 360"**. Want the white-background pack? Say so.

Claude checks your key + images, shows you the plan, generates in the background,
then quarantines any shot where the face drifted and regenerates it. Output lands in
the `output\<name>\dataset\` folder inside this skill folder.

## Good to know
- **Needs:** Python — free from [python.org/downloads](https://www.python.org/downloads/).
  On Windows, tick **"Add Python to PATH"** during install. Nothing else to host —
  anchors upload automatically.
- **Interrupted?** Say "build my dataset" again — it resumes and skips what's done.
- A full default sheet is **13 images** (4 face, 1 emotion grid, 8× 360°).
- **Costs:** generation uses WaveSpeed credits (about $0.14 per 2K image on
  Nano Banana Pro, $0.24 in 4K). Top up at [wavespeed.ai](https://wavespeed.ai/?ref=matrix).

## Troubleshooting
- **Claude doesn't recognize the skill?** Check the install path ends
  `…/.claude/skills/ai-dataset-builder/SKILL.md` (no double-nested folder from
  unzipping), then restart the Claude app.
- **"API key was rejected"?** Open `.env`, paste the key again with no spaces or
  quotes around it — get/check your key at [wavespeed.ai](https://wavespeed.ai/?ref=matrix).
- **Images failing?** An empty WaveSpeed balance is the usual cause — top up and
  just run it again; finished images are never regenerated or paid twice.
