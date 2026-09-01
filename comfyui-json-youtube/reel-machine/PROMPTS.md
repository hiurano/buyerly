# The 3 prompts — copy & paste into Claude Code

> Open a terminal → `cd reel-machine` → `claude`. Both skills load automatically (`.claude/skills/`).

## Prompt 1 — skill 1 (reel-intake) · free

```
Clone this reel: <REEL-LINK or /path/to/reel.mp4>
Run the full intake: extract every single frame, pull the word-timed transcript, verify who speaks
each line, and write the teardown.
```
(Blocked download? Save the reel via any reel-downloader site and give Claude the file instead — same prompt.)

## Prompt 2 — skill 2 (seedance-prompter) · 480p draft ≈ $1.50

```
Now rebuild this reel with my model <name> — same look, same pacing.
Write the full per-second Seedance prompt package, then fire the 480p draft on WaveSpeed and check it.
```

## Prompt 3 — the final · 720p ≈ $3

```
The draft looks good — generate the 720p final with the same package.
```
→ upscale to 1080×1920 with Topaz Video AI. Done.

---
If the draft has an issue, just say what ("she rushes the lines" / "loses the phone") — the skill fixes it
via its bug→fix table and re-drafts.
