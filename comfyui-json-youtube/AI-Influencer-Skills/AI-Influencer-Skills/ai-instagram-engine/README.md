# AI Instagram Engine

Turn your AI character's anchor images into a **realistic Instagram feed** — baddie,
soft-girl, luxury, fitness, any vibe. The output looks like a real person's phone
(night selfies, mirror selfies, flash pics, golden hour), never like a photoshoot.
Fully automatic, run inside the **Claude Desktop app**. Claude authors and checks
every post; your chosen WaveSpeed model (Nano Banana Pro, Nano Banana 2, GPT Image 2,
or Seedream 4.5) makes the pixels.

Building the character itself (dataset, 360°, face sheet)? That's the separate
`ai-dataset-builder` skill — this one is the content factory on top.

---

## Setup — 3 steps

**1. Install the skill**
Put this whole `ai-instagram-engine` folder into your Claude skills folder:
- **Windows:** `C:\Users\<you>\.claude\skills\`
- **Mac:** `~/.claude/skills/` — the `.claude` folder is hidden; press
  **Cmd+Shift+.** in Finder to see it.

So the path ends `…/.claude/skills/ai-instagram-engine/SKILL.md`.
(Careful when unzipping: avoid a double-nested `ai-instagram-engine/ai-instagram-engine/`.)

**2. Add your API key (never paste it in the chat)**
Open the **`.env`** file in this folder, paste your key, save:
- **[WaveSpeed](https://wavespeed.ai/?ref=matrix)** key → powers **all** models

**3. Add your character's images**
- Best face photo(s) → `anchors/face/`
- Body shots → `anchors/body/`
- 2–3 of your favorite REAL-looking posts of her → `anchors/style/`
  (this is the secret: the model *sees* the look you want)

Tip: the cleanest source for face/body anchors is a dataset built with
`ai-dataset-builder`.

---

## Run it

In the Claude Desktop app, just say:

> **give me 10 baddie posts**

…or "15 soft-girl posts", "make luxury content", "5 stories". Claude writes 10
unique posts, generates them in the background, checks every face against your
anchor, regenerates any that drifted — **10 ordered means 10 delivered**.

Output lands in the `output\<name>\instagram\` folder inside this skill folder.

## Good to know
- **Needs:** Python — free from [python.org/downloads](https://www.python.org/downloads/).
  On Windows, tick **"Add Python to PATH"** during install. Nothing else to host —
  anchors upload automatically.
- **Interrupted?** Repeat your request — it resumes and skips what's done.
- After a great batch, let Claude promote the best posts into `anchors/style/` —
  every following batch locks onto that look even harder.
- **Costs:** generation uses WaveSpeed credits (about $0.14 per 2K image on
  Nano Banana Pro — 10 posts ≈ $1.40). Top up at [wavespeed.ai](https://wavespeed.ai/?ref=matrix).

## Troubleshooting
- **Claude doesn't recognize the skill?** Check the install path ends
  `…/.claude/skills/ai-instagram-engine/SKILL.md` (no double-nested folder from
  unzipping), then restart the Claude app.
- **"API key was rejected"?** Open `.env`, paste the key again with no spaces or
  quotes around it — get/check your key at [wavespeed.ai](https://wavespeed.ai/?ref=matrix).
- **Images failing?** An empty WaveSpeed balance is the usual cause — top up and
  repeat your request; finished posts are never regenerated or paid twice.
