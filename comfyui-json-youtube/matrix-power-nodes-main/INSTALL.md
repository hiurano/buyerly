# Installation for people

This guide installs MATRIX POWER NODES Dataset Workflow V1 (package version 0.1.0). It contains
only the ComfyUI Custom API Nodes built specifically for this Dataset Workflow, not every Matrix
Lab custom node.

## Before you begin

You need:

- a working ComfyUI installation;
- [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) for the workflow switches;
- Git, or the ability to download and extract a ZIP;
- a WaveSpeed account and API key only when you intentionally run paid generations.

Loading and inspecting the workflow is free while `live=false`.

## Option A — install with Git

Open a terminal in your ComfyUI `custom_nodes` folder:

```text
git clone https://github.com/JsonMatrixLab/matrix-power-nodes.git matrix-power-nodes
```

The final folder must be:

```text
ComfyUI/
└── custom_nodes/
    └── matrix-power-nodes/
        ├── __init__.py
        ├── nodes/
        └── workflows/
```

## Option B — install from the GitHub ZIP

1. Open the repository on GitHub.
2. Select **Code → Download ZIP**.
3. Extract the archive into the ComfyUI `custom_nodes` folder.
4. Rename the extracted folder to exactly `matrix-power-nodes`.

Do not leave an extra nested folder such as
`custom_nodes/matrix-power-nodes/matrix-power-nodes-main`.

## Restart and verify

1. Restart the ComfyUI server completely.
2. Refresh the browser.
3. Double-click the canvas and search for:
   - `MATRIX POWER NODES - WaveSpeed Matrix API`
   - `MATRIX POWER NODES - Dataset Image`
4. Load `workflows/matrix-power-nodes-ai-dataset.json`.
5. Confirm that ComfyUI reports no missing node types.
6. Confirm that `live` is off before adding references or changing prompts.

If the two Matrix nodes are missing, check the ComfyUI terminal for the first import error and
verify the folder layout above. This pack intentionally has no pip dependencies.

## First safe run

1. Add one reference image.
2. Leave all but one prompt card bypassed.
3. Keep `live=false` and queue once to verify the dry-run blocker.
4. On a local, single-user installation, use the visible `WaveSpeed Key` control.
5. Review the selected provider model, resolution, enabled shot, and maximum cost.
6. Set `live=true` only when you deliberately authorize the paid operation.

For LAN, remote, container, or RunPod installations, set `WAVESPEED_API_KEY` in the ComfyUI server
process environment. Never paste a credential into a workflow, prompt, issue, screenshot, or log.

## Update

With a Git installation:

```text
git -C ComfyUI/custom_nodes/matrix-power-nodes pull --ff-only
```

Restart ComfyUI after updating. Back up any workflow you changed yourself before replacing it.

## Uninstall

1. Stop ComfyUI.
2. Remove the `custom_nodes/matrix-power-nodes` folder.
3. Restart ComfyUI.

Removing the node folder does not remove credentials or runtime caches stored in the ComfyUI user
data directory. Review [SECURITY.md](SECURITY.md) before removing private runtime data.
