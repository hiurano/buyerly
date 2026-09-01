# Nodes

This file is generated from declarations and dated route contracts.

## Credential setup

- `wavespeed` local use: open ComfyUI on loopback and use the detached provider-key control; no pairing token is required.
- `wavespeed` remote recommended: set `WAVESPEED_API_KEY` or `MATRIX_WAVESPEED_KEY` in the ComfyUI server environment and restart the backend.
- `wavespeed` remote interactive: set `MATRIX_ALLOW_REMOTE_KEY_INGEST=1`, configure exact canonical HTTPS origins in `MATRIX_REMOTE_KEY_INGEST_ORIGINS`, restart the backend, then use the one-time pairing token printed to the server log.

## MATRIX POWER NODES - Seedream 5.0 Pro

- Node ID: `MATRIX_Wave1Seedream50ProT2i`
- Provider route: `bytedance/seedream-v5.0-pro`
- Base price: `$0.045`
- Price formula: `{"total_price": (resolution = "2k" ? 90000 : 45000)}`
- Maximum contract cost: `$0.090000`

### Widgets

- `prompt` — The positive prompt for the generation. (required; string).
- `aspect_ratio` — The aspect ratio of the generated image. (optional; string; default `1:1`; allowed: `1:1`, `1:2`, `2:1`, `1:3`, `3:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `9:21`, `21:9`).
- `output_format` — The format of the output image. (optional; string; default `jpeg`; allowed: `jpeg`, `png`).
- `resolution` — The output resolution tier used for billing. 1k is the lower-cost tier; 2k is the higher-cost tier. (optional; string; default `1k`; allowed: `1k`, `2k`).
- Provider key — detached frontend ingestion control backed by the ComfyUI user credential store; it is not a node input and cannot enter the workflow.
- `live` — required Boolean toggle: off is `SAFE — dry run`; on is `LIVE — spends money`. Server authorization also requires the raw prompt value to be the same literal Boolean, so strings, numbers, missing values, and links fail closed.
- Spend ceiling — derived automatically from the selected route contract.
- Generation identity — internal stable node ID; duplicate the node only when deliberately authorizing a separate otherwise-identical paid generation.

