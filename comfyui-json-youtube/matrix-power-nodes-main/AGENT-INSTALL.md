# Installation contract for AI agents

Install MATRIX POWER NODES Dataset Workflow V1 (package version 0.1.0) for a human operator. This
repository contains only the ComfyUI Custom API Nodes built specifically for this Dataset
Workflow; do not describe it as the complete Matrix Lab custom-node collection.

## Hard boundaries

- Do not overwrite an existing `matrix-power-nodes` installation.
- Do not modify the ComfyUI core, Python environment, Torch, CUDA, NumPy, Pillow, or aiohttp.
- Do not install packages: this repository has no additional pip dependencies.
- Do not read, print, copy, log, or commit a credential value.
- Do not set `live=true` or queue a paid request without the operator's explicit approval.
- Do not claim success from file presence alone; verify the nodes in the visible ComfyUI UI.

## Procedure

1. Resolve the actual ComfyUI root from the operator or the installation's launcher.
2. Verify that `<ComfyUI>/custom_nodes` exists.
3. Inspect `<ComfyUI>/custom_nodes/matrix-power-nodes`.
   - If it exists, stop and report the conflict.
   - Do not merge, replace, delete, or update it without a separate instruction.
4. Clone or copy this repository to exactly
   `<ComfyUI>/custom_nodes/matrix-power-nodes`.
5. Verify that `__init__.py`, `nodes/`, `web/`, and
   `workflows/matrix-power-nodes-ai-dataset.json` exist directly under that folder.
6. Verify that rgthree-comfy is installed. If it is missing, report that dependency instead of
   silently installing or modifying unrelated nodes.
7. Restart ComfyUI through its normal controlled launcher, then refresh the browser.
8. Verify in the visible UI:
   - canvas search finds `MATRIX_DatasetConfig` and `MATRIX_DatasetImage`;
   - the bundled workflow loads with no missing node types;
   - `live` is false;
   - all `Load Image` values are empty;
   - the config exposes no backend `api_key` input;
   - each dataset image card exposes its prompt and no credential widget.
9. Keep every paid path disabled. A free dry-run may be queued only when requested.
10. Report the resolved ComfyUI root, installed commit or source hash, node discovery result,
    workflow-load result, `live` state, and every unresolved blocker.

## Credential boundary

The local browser control stores a human-entered WaveSpeed key outside this repository in the
ComfyUI user data directory. For LAN, remote, container, or RunPod installations, the operator
must provide `WAVESPEED_API_KEY` to the ComfyUI server process.

`WAVESPEED_API_KEY` is a variable name, not a credential. Never inspect or echo its value.
