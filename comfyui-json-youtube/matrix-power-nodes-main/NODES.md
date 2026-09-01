# Nodes

This file is generated from declarations and dated route contracts.

## MATRIX POWER NODES - WaveSpeed Matrix API

- Node ID: `MATRIX_DatasetConfig`
- Provider routes:
  - `google/nano-banana-pro/edit`
    - Base price: `$0.14`
    - Price formula: `{"total_price": base_price * (resolution = "2k" ? 1 : (resolution = "4k" ? 12/7 : 1))}`
  - `google/nano-banana-2/edit`
    - Base price: `$0.07`
    - Price formula: `{"total_price": ((resolution = "0.5k" ? 45000 : base_price * (resolution = "2k" ? 1.5 : (resolution = "4k" ? 2 : 1))) + (enable_web_search ? 14000 : 0) + (enable_image_search ? 14000 : 0))  }`
  - `openai/gpt-image-2/edit`
    - Base price: `$0.07`
    - Price formula: `{"total_price": ((quality = "low") ? (resolution = "4k" ? 40000 : (resolution = "2k" ? 30000 : 20000)) : ((quality = "high") ? (resolution = "4k" ? 730000 : (resolution = "2k" ? 410000 : 230000)) : (resolution = "4k" ? 190000 : (resolution = "2k" ? 110000 : 70000)))) + (($count(images) - 1) * 12000)}`
- Maximum contract cost: `$0.886000`

### Widgets

- `model` — selects the provider route (required; string; allowed: `google/nano-banana-pro/edit`, `google/nano-banana-2/edit`, `openai/gpt-image-2/edit`).
- `aspect_ratio` — The aspect ratio of the generated media. (optional; string; allowed: `16:9`, `1:1`, `1:2`, `1:3`, `1:4`, `1:8`, `21:9`, `2:1`, `2:3`, `3:1`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `9:21`).
- `enable_image_search` — If enabled, the model will use image search to enhance the generation with real-time information. (optional; boolean; default `False`).
- `enable_web_search` — If enabled, the model will use web search to enhance the generation with real-time information. (optional; boolean; default `False`).
- `output_format` — The format of the output image. (optional; string; default `png`; allowed: `jpeg`, `png`, `webp`).
- `quality` — The quality of the generated image. Higher quality costs more. (optional; string; default `medium`; allowed: `high`, `low`, `medium`).
- `resolution` — The resolution of the output image. (optional; string; default `1k`; allowed: `0.5k`, `1k`, `2k`, `4k`).
- `image_1` — required native ComfyUI `IMAGE` reference input.
- `image_2` … `image_14` — optional native `IMAGE` references; different dimensions remain independent and are never batched together.
- Provider key — frontend-only ingestion control backed by the ComfyUI user credential store; it is not a node input and cannot enter the workflow.
- `live` — off is dry run and sends nothing; on permits an admitted paid call.
- Spend bounds — derived automatically from provider facts and the declared run size.

## MATRIX POWER NODES - Dataset Image

- Node ID: `MATRIX_DatasetImage`
- Provider routes:
  - `google/nano-banana-pro/edit`
    - Base price: `$0.14`
    - Price formula: `{"total_price": base_price * (resolution = "2k" ? 1 : (resolution = "4k" ? 12/7 : 1))}`
  - `google/nano-banana-2/edit`
    - Base price: `$0.07`
    - Price formula: `{"total_price": ((resolution = "0.5k" ? 45000 : base_price * (resolution = "2k" ? 1.5 : (resolution = "4k" ? 2 : 1))) + (enable_web_search ? 14000 : 0) + (enable_image_search ? 14000 : 0))  }`
  - `openai/gpt-image-2/edit`
    - Base price: `$0.07`
    - Price formula: `{"total_price": ((quality = "low") ? (resolution = "4k" ? 40000 : (resolution = "2k" ? 30000 : 20000)) : ((quality = "high") ? (resolution = "4k" ? 730000 : (resolution = "2k" ? 410000 : 230000)) : (resolution = "4k" ? 190000 : (resolution = "2k" ? 110000 : 70000)))) + (($count(images) - 1) * 12000)}`
- Maximum contract cost: `$0.886000`

### Widgets

- `config` — immutable `MATRIX_API_CONFIG` input from the previous cell.
- `prompt` — this cell's independent image instruction.
- Generation identity — internal stable node ID; duplicate the prompt node only when deliberately authorizing a separate paid generation.
