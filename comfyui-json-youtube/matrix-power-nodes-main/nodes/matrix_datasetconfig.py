"""Compiled declaration for MATRIX_DatasetConfig; regenerate instead of hand-editing."""
from __future__ import annotations

from .._core.media_image_in import make_reference_set, prepare_dataset_config

NODE_ID = 'MATRIX_DatasetConfig'
PROVIDER = 'wavespeed'
ROUTES = ('google/nano-banana-pro/edit', 'google/nano-banana-2/edit', 'openai/gpt-image-2/edit')
SCHEMA_WIDGETS = {
    'aspect_ratio': (['16:9', '1:1', '1:2', '1:3', '1:4', '1:8', '21:9', '2:1', '2:3', '3:1', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '9:21'], {'tooltip': 'The aspect ratio of the generated media.'}),
    'enable_image_search': ('BOOLEAN', {'default': False, 'tooltip': 'If enabled, the model will use image search to enhance the generation with real-time information.'}),
    'enable_web_search': ('BOOLEAN', {'default': False, 'tooltip': 'If enabled, the model will use web search to enhance the generation with real-time information.'}),
    'output_format': (['jpeg', 'png', 'webp'], {'default': 'png', 'tooltip': 'The format of the output image.'}),
    'quality': (['high', 'low', 'medium'], {'default': 'medium', 'tooltip': 'The quality of the generated image. Higher quality costs more.'}),
    'resolution': (['0.5k', '1k', '2k', '4k'], {'default': '1k', 'tooltip': 'The resolution of the output image.'}),
}
OPTION_NAMES = ('aspect_ratio', 'enable_image_search', 'enable_web_search', 'output_format', 'quality', 'resolution')


class MATRIXDatasetConfig:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "live": ("BOOLEAN", {"default": False, "label_on": "LIVE — spends money", "label_off": "dry run — sends nothing"}),
                "model": (['google/nano-banana-pro/edit', 'google/nano-banana-2/edit', 'openai/gpt-image-2/edit'], {}),
                "image_1": ("IMAGE", {"forceInput": True}),
            },
            "optional": {
                "image_2": ("IMAGE", {"forceInput": True}),
                "image_3": ("IMAGE", {"forceInput": True}),
                "image_4": ("IMAGE", {"forceInput": True}),
                "image_5": ("IMAGE", {"forceInput": True}),
                "image_6": ("IMAGE", {"forceInput": True}),
                "image_7": ("IMAGE", {"forceInput": True}),
                "image_8": ("IMAGE", {"forceInput": True}),
                "image_9": ("IMAGE", {"forceInput": True}),
                "image_10": ("IMAGE", {"forceInput": True}),
                "image_11": ("IMAGE", {"forceInput": True}),
                "image_12": ("IMAGE", {"forceInput": True}),
                "image_13": ("IMAGE", {"forceInput": True}),
                "image_14": ("IMAGE", {"forceInput": True}),
                'aspect_ratio': SCHEMA_WIDGETS['aspect_ratio'],
                'enable_image_search': SCHEMA_WIDGETS['enable_image_search'],
                'enable_web_search': SCHEMA_WIDGETS['enable_web_search'],
                'output_format': SCHEMA_WIDGETS['output_format'],
                'quality': SCHEMA_WIDGETS['quality'],
                'resolution': SCHEMA_WIDGETS['resolution'],
            },
        }

    RETURN_TYPES = ("MATRIX_API_CONFIG",)
    RETURN_NAMES = ("config",)
    FUNCTION = "execute"
    CATEGORY = "MATRIX POWER NODES/api/dataset"
    DESCRIPTION = 'Native IMAGE references in; immutable WaveSpeed dataset config out. Different source dimensions are preserved independently.'

    async def execute(self, **inputs):
        options = {
            name: inputs[name] for name in OPTION_NAMES if name in inputs
        }
        references = make_reference_set(
            inputs.get('image_1'),
            inputs.get('image_2'),
            inputs.get('image_3'),
            inputs.get('image_4'),
            inputs.get('image_5'),
            inputs.get('image_6'),
            inputs.get('image_7'),
            inputs.get('image_8'),
            inputs.get('image_9'),
            inputs.get('image_10'),
            inputs.get('image_11'),
            inputs.get('image_12'),
            inputs.get('image_13'),
            inputs.get('image_14'),
        )
        config = await prepare_dataset_config(
            provider=PROVIDER,
            route=inputs['model'],
            route_ids=ROUTES,
            options=options,
            live=inputs['live'],
            references=references,
        )
        return (config,)


NODE_CLASS_MAPPINGS = {NODE_ID: MATRIXDatasetConfig}
NODE_DISPLAY_NAME_MAPPINGS = {NODE_ID: 'MATRIX POWER NODES - WaveSpeed Matrix API'}
