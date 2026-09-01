# MatrixLab Krea 2 — FREE Master Workflow v1.0.0

The MatrixLab 1-pass Krea 2 Turbo workflow: hyperrealistic AI influencer images in
8 steps, with LoRA slots for your own character LoRA.

By **MatrixLab AI** — YouTube: https://www.youtube.com/@MatrixLabAI

## What's inside

| File | What it is |
|---|---|
| `MatrixLab_Krea2_Free_Master_v1.0.0.json` | The workflow (drag & drop into ComfyUI) |
| `models.json` | Machine-readable install manifest (for AI agents / scripts) |
| `AGENT-INSTALL.md` | Give this file to your AI agent (Claude, Cursor, ChatGPT...) — it installs everything for you |

## Requirements

**Custom node pack (1):**

| Pack | Install |
|---|---|
| rgthree-comfy | ComfyUI Manager → search `rgthree` → Install, **then restart ComfyUI** (or `git clone https://github.com/rgthree/rgthree-comfy` into `ComfyUI/custom_nodes/`) |

**Models (3, ~17 GB total, all public downloads):**

| File | Goes into `ComfyUI/models/` | Download |
|---|---|---|
| `krea2_turbo_fp8_scaled.safetensors` (~12.6 GB) | `diffusion_models/` | [HuggingFace / Comfy-Org/Krea-2](https://huggingface.co/Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_turbo_fp8_scaled.safetensors) |
| `qwen3vl_4b_fp8_scaled.safetensors` (~4.4 GB) | `text_encoders/` | [HuggingFace / Comfy-Org/Qwen3-VL](https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors) |
| `wan_2.1_vae.safetensors` (~250 MB) | `vae/` | [HuggingFace / Comfy-Org/Wan_2.1](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors) |

GPU: NVIDIA with **16 GB+ VRAM** recommended (RTX 4080/4090/5090 or a cloud pod).

## Quick start

1. Install the node pack + models (tables above) — or let your AI agent do it
   with `AGENT-INSTALL.md`.
2. **Restart ComfyUI**, then hard-refresh the browser tab (Ctrl+Shift+R).
3. Drag `MatrixLab_Krea2_Free_Master_v1.0.0.json` onto the ComfyUI canvas.
4. Write your prompt in the green **Positive Prompt** box (natural language,
   full sentences — no tag lists).
5. Optional: put your character LoRA into slot 1 of the **Power Lora Loader**.
6. Press **Run**. Settings are already correct: 8 steps, CFG 1.0,
   res_multistep/simple — do not raise CFG or steps, Turbo models break above it.

## Troubleshooting

| Problem | Fix |
|---|---|
| Red nodes ("node not found") | Node pack not installed OR ComfyUI not restarted after install. Browser reload is NOT enough — restart the ComfyUI server, then hard-refresh (Ctrl+Shift+R). |
| "Value not in list: unet_name / clip_name / vae_name" | Model file missing or in the wrong folder. Check the exact folder in the table above (case-sensitive). |
| Image looks washed out / soft | Wrong VAE loaded — use `wan_2.1_vae.safetensors`. |
| LoRA has no visible effect | LoRA was not trained for Krea 2 — only Krea 2 LoRAs work. Check the server log for "shape mismatch" lines. |
