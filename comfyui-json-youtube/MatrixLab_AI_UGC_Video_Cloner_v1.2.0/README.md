# Matrix Lab AI UGC Video Cloner

Version 1.2.0

This ComfyUI workflow analyzes a source video, identifies its visual structure and audio timing, replaces one selected person or product with your own reference subject, and compiles a timestamped Seedance 2.5 generation prompt.

The workflow uses official ComfyUI Partner Nodes for Gemini, Anthropic Claude, and Seedance. The only custom node pack is rgthree-comfy, which provides the workflow switches and labels.

## Package contents

- `MatrixLab_AI_UGC_Video_Cloner_v1.2.0.json` — the importable ComfyUI workflow.
- `README.md` — user installation and operating guide.
- `AGENTS.md` — installation and verification contract for an AI coding agent.
- `CHANGELOG.md` — release history and known limitations.

No demonstration video, character image, voice sample, API key, account information, or generated output is included.

## Requirements

- ComfyUI 0.33.0 or newer.
- A current ComfyUI frontend.
- The official ComfyUI Partner/API Nodes supplied with ComfyUI.
- rgthree-comfy.
- A signed-in Comfy account with sufficient Partner Node credits.
- One source video.
- At least one coherent replacement reference image. Three complementary images are recommended.

No checkpoint, LoRA, VAE, ControlNet, or other local model download is required.

## Installation

1. Update ComfyUI before importing the workflow.
2. Install `rgthree-comfy` through ComfyUI Manager, then restart ComfyUI.
3. Open ComfyUI settings and disable **Nodes 2.0** (`Comfy.VueNodes.Enabled = false`). Reload the page. This prevents the rgthree group switcher from showing or controlling the first group repeatedly.
4. Import `MatrixLab_AI_UGC_Video_Cloner_v1.2.0.json`.
5. Sign in to your Comfy account through the normal ComfyUI interface. Never paste credentials into workflow text fields.
6. Confirm that ComfyUI reports no missing node types.

If you want an agent to perform the installation, give the complete folder to the agent and tell it to follow `AGENTS.md`.

## What the workflow does

The graph runs from left to right:

1. Loads the source video.
2. Samples 60 chronological frames and previews the exact image batch used for visual analysis.
3. Runs a Gemini 3.5 Flash visual analysis.
4. Runs a separate Gemini 3.5 Flash audio analysis.
5. Runs a third Gemini 3.5 Flash verification pass that produces the source blueprint.
6. Uses the Clone Intent field to select exactly one replacement target.
7. Sends the enabled reference images to Opus 5 and Seedance.
8. Uses Opus 5 to compile the final timestamped Seedance prompt.
9. Generates with one deliberately enabled Seedance mode.
10. Saves the selected video output and four text audit files.

The source video is analyzed by Gemini. Opus receives the verified blueprint, Clone Intent, duration, and enabled replacement images; it does not need the raw source video.

## Prepare your inputs

### Source video

Load the TikTok, Reel, Short, advertisement, dance clip, product demo, or other video you want to reconstruct. Set the duration node to the desired output endpoint. The supported range in this workflow is 4–30 seconds.

### Reference images

References 1–3 start enabled and must be filled before running the workflow. References 4–10 start disabled. Use the green rgthree switch panel to enable only the slots you have filled.

Recommended human references:

1. Clear primary face view.
2. Face detail or alternate angle.
3. Full body and complete outfit.
4. Profile.
5. Rear view.
6. Additional expression.
7. Outfit detail.
8. Body-proportion view.
9. Alternate angle.
10. Additional identity evidence.

Recommended product references follow the same logic: hero view, detail, complete product, alternate angles, rear view, materials, packaging, scale, and legitimate markings.

All active images must describe the same person or the same product. Do not mix identities, outfits, or product variants unless that change is intentionally part of the target.

### Clone Intent

The Clone Intent tells the analysis system exactly who or what should be replaced. It is especially important when multiple people or products appear.

For a single-person video, the included AUTO template is normally sufficient.

For a multi-person video, replace `TARGET_01` with an unambiguous source role:

```text
MODE: EXPLICIT
TARGET_TYPE: HUMAN
TARGET_01: the woman who starts on the left in a dark dress and performs the jump into the water
REPLACE_TARGET_01_WITH: the single human character defined by all active replacement reference images
REPLACEMENT_REFERENCE_ROLE: HUMAN_CHARACTER
PRESERVE: every other person, product, prop, background role, environment, camera path and action timing
VOICE_OWNER: TARGET_01 if the optional voice reference is enabled; otherwise preserve the verified source speaker mapping
REQUESTED_DIALOGUE_LANGUAGE: preserve the source language
```

For a product video:

```text
MODE: EXPLICIT
TARGET_TYPE: PRODUCT
TARGET_01: the primary shoe removed from the box and held toward the camera
REPLACE_TARGET_01_WITH: the single product defined by all active replacement reference images
REPLACEMENT_REFERENCE_ROLE: PRODUCT
PRESERVE: the presenter, hands, packaging, secondary products, background, camera path and action timing
VOICE_OWNER: preserve the verified source speaker mapping
REQUESTED_DIALOGUE_LANGUAGE: preserve the source language
```

Use observable identifiers: starting position, clothing tracker, handled object, decisive action, or speaking role. Do not identify a target only as “the main person” when several people appear.

### Optional target screenshot

Keep this input disabled for clear single-target videos. Enable it only when the source contains multiple similar people or products and a still frame materially helps Gemini resolve the requested target.

### Optional voice reference

Load a clean sample containing only the intended character’s voice. Keep the group disabled unless you intentionally want the target to use that voice. The Clone Intent must assign `VOICE_OWNER` to the selected target.

## Safe operating sequence

1. Load the source video.
2. Set the target duration.
3. Review or replace the Clone Intent.
4. Load at least references 1–3, or disable every unused reference slot.
5. Keep both Seedance modes disabled.
6. Run the analysis and prompt-compilation portion.
7. Review the sampled-frame preview and the four saved text files.
8. Confirm that the prompt starts at `0.0s`, ends at the selected duration, and preserves all non-target people and products.
9. Check the live credit estimate shown on the Seedance node.
10. Enable exactly one Seedance mode and its matching Save Video node.
11. Queue one paid generation.
12. Inspect the result before spending credits on another run.

## Seedance modes

### Mode A — recommended

Mode A sends the final prompt and enabled replacement images to Seedance. It does not send the source video to Seedance. This is the recommended default when the goal is to reconstruct the video concept with a clearly different person or product.

### Mode B — optional source-video edit

Mode B additionally sends the source video to Seedance in edit mode. It can preserve source motion more literally, but it may also preserve more of the original target’s appearance.

Never enable both modes simultaneously.

## Outputs

The workflow saves:

- Visual evidence report.
- Audio evidence report.
- Verified source blueprint.
- Final Seedance master prompt.
- One final video from the enabled Seedance mode.

Outputs use `MatrixLab_AI_UGC_` filename prefixes and can be changed in the Save nodes.

## Credit safety

Gemini and Opus are token-billed Partner Nodes. Seedance is the dominant cost and displays an estimated credit cost directly on its node. Prices can change, so treat the live node estimate and Comfy credit history as authoritative.

The release workflow ships with both Seedance modes and both Save Video nodes bypassed. Importing the workflow does not authorize an agent to enable or run a paid generation.

## Troubleshooting

### Every reference switch says R01

Disable ComfyUI Nodes 2.0, reload the frontend, and re-import the workflow. This is an rgthree frontend compatibility issue, not duplicated reference groups in the workflow.

### Missing Partner Nodes

Update ComfyUI. Do not replace the official Gemini, Claude, or Seedance nodes with unrelated community alternatives.

### Missing rgthree nodes

Install or update rgthree-comfy through ComfyUI Manager and restart ComfyUI.

### Empty input error

Load the source video and every enabled reference slot. Disable optional or unused inputs with the rgthree switches.

### Wrong person or product is replaced

Switch the Clone Intent to `MODE: EXPLICIT` and describe the target using its source position, wardrobe or product tracker, role, and decisive action. Enable the optional target screenshot only if text remains ambiguous.

### The original target remains visible in Mode A

Confirm that Mode A has no source-video connection, that all active reference images depict one coherent replacement subject, and that the Clone Intent selects exactly one source target.

