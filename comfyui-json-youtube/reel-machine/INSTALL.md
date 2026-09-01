# INSTALL — read this first (humans AND AI agents)

## What this is
Two skills that clone any viral reel with YOUR own consistent AI model:
1. **`reel-intake`** — takes a reel (link or file), extracts every frame + a contact sheet, pulls the
   word-timed transcript, and writes the teardown (the rebuild blueprint).
2. **`seedance-prompter`** — writes the per-second Seedance 2.0 prompt package (every second timed, every
   line tagged with speaker + gender + on/off-cam) and can fire the generation on WaveSpeed.

Both live in `.claude/skills/` and are plain instruction files — no install step, no code to run to "set them up".

## 🤖 If you are an AI AGENT setting this up for your user
1. **Work from this folder.** Claude Code auto-loads the skills from `.claude/skills/`. Any other agent
   (Cursor, Codex, etc.): open the two `SKILL.md` files and follow them as your instructions — they are
   written for you, not for the human.
2. **First run: check the machine.** Run both doctor scripts and SHOW the user the result — what's [OK],
   what's [MISSING], with the exact install command for their OS:
   - `.claude/skills/reel-intake/scripts/doctor.sh`
   - `.claude/skills/seedance-prompter/scripts/doctor.sh`
3. **Windows note:** run all `.sh` scripts through Git Bash (comes with Git):
   `"C:\Program Files\Git\bin\bash.exe" <script> <args>`. No bash at all? Every SKILL.md contains the
   equivalent native commands (ffmpeg / yt-dlp / whisper) — run those directly.
4. **Never block.** A blocked download → ask for the file. A missing tool → report it + offer the manual
   path (prompt packages can always be pasted into wavespeed.ai by hand).
5. **The one law:** never describe the model's face/hair/body in a generation prompt — identity comes ONLY
   from the images in `characters/<name>/refs/`.

## 👤 If you are a HUMAN (quickstart, ~3 minutes)
1. Unzip this folder anywhere. Put your model's 4–6 reference images in `characters/<your-model>/refs/`
   (face images first). No consistent model yet? That's the Character Builder — link in the video.
2. Install the basics (skip what you have):
   - **Mac/Linux:** run `./setup.sh` — checks/installs everything and logs you into WaveSpeed.
   - **Windows:** `winget install Git.Git OpenJS.NodeJS.LTS Gyan.FFmpeg jqlang.jq` → then
     `npm install -g @wavespeed/cli` → `wavespeed login` (API key from https://wavespeed.ai).
3. Open **Claude Code** in this folder (`claude` in the terminal) and paste the prompts from `PROMPTS.md`.
   That's the whole workflow. Your agent handles the rest — including telling you if anything is missing.

## What it costs (WaveSpeed, pay per generation — no subscription)
480p draft ≈ $1.50 · ONE 720p final ≈ $3 · then upscale to 1080×1920 with Topaz Video AI.
Never generate at 1080p/4K — that's the whole cost trick.

## No-install version
Don't want a terminal at all? Use the `no-install/` folder with Claude Desktop — Claude writes the prompts,
you paste them into wavespeed.ai yourself.
