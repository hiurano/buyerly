# WaveSpeed website — how to run the Seedance prompt

No install. Everything on https://wavespeed.ai. Claude gives you the full prompt; you paste it here.

## Pick the model + mode
1. Search **"Seedance 2.0"** → open it.
2. Choose **reference / text-to-video** mode — i.e. **do NOT add a start image**. (A start image switches it to
   image-to-video and hides your reference images. We want reference mode so Seedance generates the handheld
   opening itself — it looks more real.)

## Fill the fields
| Field | Set it to |
|---|---|
| **Prompt** | paste the full package Claude wrote |
| **Reference Images** | upload your **4–6 model reference images** (face first). No more than ~6. |
| **Reference Audios** | **empty** (native voice) — OR one **real human** voice sample for a consistent voice. Never a TTS/ElevenLabs clip. |
| **Reference Videos** | empty |
| **Aspect Ratio** | **9:16** (the UI often defaults to 16:9 — switch it) |
| **Generate Audio** | **ON** |
| **Web Search** | off |
| **Resolution** | **480p** for the draft → **1080p** for the final |
| **Duration** | 15s (hero) / ~8s (CTA) |

3. **Run** → download the clip → drop it back into the Claude chat.

## Draft → final
- Claude watches the draft (identity / pacing / pose / tone). See `settings.md` for the bug→fix table.
- Good → run it again at **1080p** for the final. Bad → Claude tweaks the prompt, you re-run the 480p draft.
- Draft is cheap (~$0.60 at 480p); only finalize once.

## Then edit
Add captions, the hook overlay, and your CTA keyword in your editor (CapCut/Premiere) — those go in editing,
never in the generation.
