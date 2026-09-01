# AI-Agent Auto-Install — MatrixLab Krea 2 Free Master

> **User:** paste this whole file to your AI agent (Claude Code, Cursor, Codex, ...)
> and tell it where your ComfyUI runs. The agent does the rest.

You are installing the MatrixLab Krea 2 Free Master workflow into the user's
ComfyUI. Work autonomously, verify every step, never guess file names.

## Inputs you need from the user

- `COMFY_ROOT` — the ComfyUI install directory (contains `main.py`, `models/`, `custom_nodes/`).
- Whether ComfyUI runs locally or on a remote pod (then use its shell/Jupyter).

## Steps

1. **Preflight.** Confirm `COMFY_ROOT` exists and the server answers
   `GET http://<host>:8188/system_stats`. Check free disk: you need ~20 GB.
   GPU should have ≥16 GB VRAM — warn the user if less (it will be slow/OOM).

2. **Install the node pack** (skip if `custom_nodes/rgthree-comfy` exists):
   ```
   cd COMFY_ROOT/custom_nodes
   git clone https://github.com/rgthree/rgthree-comfy
   ```
   No pip requirements needed for rgthree.

3. **Download the models** — read `models.json` in this folder; for each entry
   download `url` into `COMFY_ROOT/models/<folder>/<file>`. Rules:
   - Download to `<file>.part`, then rename — never leave half files under the real name.
   - Skip files that already exist with size > 100 MB.
   - Verify each finished file is > 100 MB (a tiny file is an HTML error page — delete and retry).

4. **Restart the ComfyUI server process** (a browser reload does NOT register new
   node packs). If the user runs it in a terminal: ask them to restart it.

5. **Verify (all three must pass):**
   - `GET /object_info/Power Lora Loader (rgthree)` returns a schema (pack live).
   - `GET /models/diffusion_models` lists `krea2_turbo_fp8_scaled.safetensors`;
     `GET /models/text_encoders` lists `qwen3vl_4b_fp8_scaled.safetensors`;
     `GET /models/vae` lists `wan_2.1_vae.safetensors`.
   - Tell the user to hard-refresh the browser (Ctrl+Shift+R) and drag
     `MatrixLab_Krea2_Free_Master_v1.0.0.json` onto the canvas — zero red nodes expected.

6. **Report** what you installed, what you skipped (already present), and the
   verify results. If anything failed, show the exact error and fix it before
   reporting success.

## Guardrails

- Everything here is a public download — you never need an API key or token.
- Do not modify the workflow JSON.
- Do not change the user's other custom nodes or models.
- KSampler settings in this workflow are intentional (8 steps, CFG 1.0,
  res_multistep) — do not "improve" them.
