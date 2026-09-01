"""Compiled declaration for MATRIX_DatasetImage; regenerate instead of hand-editing."""
from __future__ import annotations

from .._core.media_image_in import DatasetConfig

NODE_ID = 'MATRIX_DatasetImage'


class MATRIXDatasetImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "config": ("MATRIX_API_CONFIG", {}),
                "prompt": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "after_image": ("IMAGE", {"forceInput": True, "tooltip": "Execution order only; this image is never sent to the provider."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "execute"
    CATEGORY = "MATRIX POWER NODES/api/dataset"
    DESCRIPTION = 'One visible dataset cell: shared API config and prompt in, one IMAGE out.'

    async def execute(
        self, config, prompt, unique_id, after_image=None
    ):
        if not isinstance(config, DatasetConfig):
            raise TypeError('config must be MATRIX_API_CONFIG')
        del after_image
        inputs = config.to_flow_inputs(prompt)
        inputs['refresh_nonce'] = f'node:{unique_id}'
        inputs['api_key'] = ''
        from .._core import build_runtime
        from .._core.flow_api_media import execute_compiled_node
        inputs['__flow_runtime__'] = build_runtime(
            NODE_ID, config.provider, config.route_ids, inputs, run_operations=25, instance_id=unique_id
        )
        result = await execute_compiled_node(
            NODE_ID, config.provider, config.route_ids[0], inputs
        )
        return (result[0],)


NODE_CLASS_MAPPINGS = {NODE_ID: MATRIXDatasetImage}
NODE_DISPLAY_NAME_MAPPINGS = {NODE_ID: 'MATRIX POWER NODES - Dataset Image'}
