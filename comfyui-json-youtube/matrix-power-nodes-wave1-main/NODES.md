# Nodes

| Node class | Mode | WaveSpeed operation |
|---|---|---|
| `MATRIX_Wave1GptImage2T2i` | Text to Image | `openai/gpt-image-2/text-to-image` |
| `MATRIX_Wave1GptImage2Edit` | Edit | `openai/gpt-image-2/edit` |
| `MATRIX_Wave1NanoBanana2T2i` | Text to Image | `google/nano-banana-2/text-to-image` |
| `MATRIX_Wave1NanoBanana2Edit` | Edit | `google/nano-banana-2/edit` |
| `MATRIX_Wave1NanoBananaProT2i` | Text to Image | `google/nano-banana-pro/text-to-image` |
| `MATRIX_Wave1NanoBananaProEdit` | Edit | `google/nano-banana-pro/edit` |
| `MATRIX_Wave1Seedream45T2i` | Text to Image | `bytedance/seedream-v4.5` |
| `MATRIX_Wave1Seedream45Edit` | Edit | `bytedance/seedream-v4.5/edit` |
| `MATRIX_Wave1Seedream50ProT2i` | Text to Image | `bytedance/seedream-v5.0-pro` |
| `MATRIX_Wave1Seedream50ProEdit` | Edit | `bytedance/seedream-v5.0-pro/edit` |

All nodes expose one native ComfyUI `IMAGE` output. Edit nodes accept a native `IMAGE` input.
`live` is a literal Boolean money gate and defaults to `false`.

