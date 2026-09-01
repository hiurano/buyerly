# Nodes

This file is generated from declarations and dated route contracts.

## Credential setup

- `wavespeed` local use: open ComfyUI on loopback and use the detached provider-key control; no pairing token is required.
- `wavespeed` remote recommended: set `WAVESPEED_API_KEY` or `MATRIX_WAVESPEED_KEY` in the ComfyUI server environment and restart the backend.
- `wavespeed` remote interactive: set `MATRIX_ALLOW_REMOTE_KEY_INGEST=1`, configure exact canonical HTTPS origins in `MATRIX_REMOTE_KEY_INGEST_ORIGINS`, restart the backend, then use the one-time pairing token printed to the server log.

## MATRIX POWER NODES - Seedream 4.5 Edit

- Node ID: `MATRIX_Wave1Seedream45Edit`
- Provider route: `bytedance/seedream-v4.5/edit`
- Base price: `$0.04`
- Price formula: ``
- Maximum contract cost: `$0.040000`

### Widgets

- `prompt` — The positive prompt for the generation. (required; string).
- `images` — The images to edit. A maximum of 10 reference images can be uploaded. (required; array; structural image count `1..10` by selected route).
- `size` — Specify the width and height pixel values of the generated image. (optional; string; allowed: `auto`, `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`; bounds `512..8192`).
- `width` — Local width dimension; composed into provider `size` and never sent separately. (optional; integer; default `0`; bounds `512..8192`).
- `height` — Local height dimension; composed into provider `size` and never sent separately. (optional; integer; default `0`; bounds `512..8192`).
- Provider key — detached frontend ingestion control backed by the ComfyUI user credential store; it is not a node input and cannot enter the workflow.
- `live` — required Boolean toggle: off is `SAFE — dry run`; on is `LIVE — spends money`. Server authorization also requires the raw prompt value to be the same literal Boolean, so strings, numbers, missing values, and links fail closed.
- Spend ceiling — derived automatically from the selected route contract.
- Generation identity — internal stable node ID; duplicate the node only when deliberately authorizing a separate otherwise-identical paid generation.

