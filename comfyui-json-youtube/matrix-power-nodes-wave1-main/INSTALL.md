# Installation

## Requirements

- ComfyUI with Python 3.10 or newer
- Network access for live WaveSpeed requests
- A WaveSpeed account and API key for `live=true`
- No local model download and no additional pip dependency

## Recommended installation

1. Download and extract the release ZIP outside ComfyUI.
2. Stop ComfyUI.
3. Run the installer for your platform.
4. Start ComfyUI and refresh node definitions.
5. Load `workflows/matrix-power-nodes-wave1-all-nodes-safe.json`.
6. Keep every node at `live=false` while checking the installation.

PowerShell:

```powershell
.\scripts\install.ps1 -ComfyUIRoot C:\ComfyUI
```

Bash:

```bash
./scripts/install.sh /path/to/ComfyUI
```

## Manual installation

Copy each of the ten directories inside `custom_nodes/` into the target ComfyUI
`custom_nodes/` directory. Stop if any destination already exists. Never merge an old and new
pack. Restart ComfyUI after all ten copies complete.

## Verification

Run `python scripts/verify.py` from the extracted release. In ComfyUI, load the safe showcase
workflow and confirm that ten MATRIX nodes appear. Clicking the green key row must open a visible
password field. Cancel it, collapse the node, expand it, and open it again. Do not enable `live`
for an installation check.

