# Nodes

This file is generated from declarations and dated route contracts.

## Credential setup

- `wavespeed` local use: open ComfyUI on loopback and use the detached provider-key control; no pairing token is required.
- `wavespeed` remote recommended: set `WAVESPEED_API_KEY` or `MATRIX_WAVESPEED_KEY` in the ComfyUI server environment and restart the backend.
- `wavespeed` remote interactive: set `MATRIX_ALLOW_REMOTE_KEY_INGEST=1`, configure exact canonical HTTPS origins in `MATRIX_REMOTE_KEY_INGEST_ORIGINS`, restart the backend, then use the one-time pairing token printed to the server log.

## MATRIX POWER NODES - Nano Banana Pro

- Node ID: `MATRIX_Wave1NanoBananaProT2i`
- Provider route: `google/nano-banana-pro/text-to-image`
- Base price: `$0.14`
- Price formula: `{"total_price": base_price * (resolution = "2k" ? 1 : (resolution = "4k" ? 12/7 : 1))}`
- Maximum contract cost: `$0.240000`

### Widgets

- `prompt` — The positive prompt for the generation. (required; string).
- `aspect_ratio` — The aspect ratio of the generated media. (optional; string; allowed: `provider default (omit)`, `1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`).
- `output_format` — The format of the output image. (optional; string; default `png`; allowed: `png`, `jpeg`).
- `resolution` — The resolution of the output image. (optional; string; default `1k`; allowed: `1k`, `2k`, `4k`).
- Provider key — detached frontend ingestion control backed by the ComfyUI user credential store; it is not a node input and cannot enter the workflow.
- `live` — required Boolean toggle: off is `SAFE — dry run`; on is `LIVE — spends money`. Server authorization also requires the raw prompt value to be the same literal Boolean, so strings, numbers, missing values, and links fail closed.
- Spend ceiling — derived automatically from the selected route contract.
- Generation identity — internal stable node ID; duplicate the node only when deliberately authorizing a separate otherwise-identical paid generation.

