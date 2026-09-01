"""Compiled declaration for MATRIX_Wave1Seedream50ProT2i; regenerate instead of hand-editing."""
from __future__ import annotations

NODE_ID = 'MATRIX_Wave1Seedream50ProT2i'
PROVIDER = 'wavespeed'
ROUTE = 'bytedance/seedream-v5.0-pro'
ROUTES = ('bytedance/seedream-v5.0-pro',)
SCHEMA_WIDGETS = {
    'prompt': ('STRING', {'multiline': True, 'tooltip': 'The positive prompt for the generation.'}),
    'aspect_ratio': (['1:1', '1:2', '2:1', '1:3', '3:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '9:21', '21:9'], {'default': '1:1', 'tooltip': 'The aspect ratio of the generated image.'}),
    'output_format': (['jpeg', 'png'], {'default': 'jpeg', 'tooltip': 'The format of the output image.'}),
    'resolution': (['1k', '2k'], {'default': '1k', 'tooltip': 'The output resolution tier used for billing. 1k is the lower-cost tier; 2k is the higher-cost tier.'}),
}
FORMULA_DEFAULTS = {'bytedance/seedream-v5.0-pro': {'resolution': '1k'}}
ROUTE_FIELD_NAMES = tuple(SCHEMA_WIDGETS)
FRAMEWORK_FIELD_NAMES = ('live',)

class MATRIXWave1Seedream50ProT2i:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                'live': ('BOOLEAN', {'default': False, 'label_on': 'LIVE — spends money', 'label_off': 'SAFE — dry run', 'tooltip': 'Off sends nothing; on permits one admitted paid semantic operation. Only a literal local boolean toggle can authorize spend.'}),
                'prompt': SCHEMA_WIDGETS['prompt'],
            },
            "optional": {
                'aspect_ratio': SCHEMA_WIDGETS['aspect_ratio'],
                'output_format': SCHEMA_WIDGETS['output_format'],
                'resolution': SCHEMA_WIDGETS['resolution'],
            },
            "hidden": {"unique_id": "UNIQUE_ID", "matrix_raw_prompt": "PROMPT"},
        }

    RETURN_TYPES = ('IMAGE',)
    RETURN_NAMES = ("result",)
    FUNCTION = "execute"
    CATEGORY = "MATRIX POWER NODES/api/wavespeed"
    DESCRIPTION = 'Generated from bytedance/seedream-v5.0-pro; dry run by default.'

    async def execute(self, **inputs):
        # The class is schema and dispatch only. Lifecycle belongs to resolved blocks.
        from .._core.flow_api_media import MISSING, parse_live_mode
        raw_prompt = inputs.pop('matrix_raw_prompt', MISSING)
        unique_id = str(inputs.pop('unique_id', NODE_ID))
        raw_node = raw_prompt.get(unique_id, MISSING) if isinstance(raw_prompt, dict) else MISSING
        raw_inputs = raw_node.get('inputs', MISSING) if isinstance(raw_node, dict) else MISSING
        raw_live = raw_inputs.get('live', MISSING) if isinstance(raw_inputs, dict) else MISSING
        parse_live_mode(inputs.get('live', MISSING), raw_value=raw_live)
        inputs['api_key'] = ''
        inputs['refresh_nonce'] = f'node:{unique_id}'
        selected_route = inputs.get('model', ROUTE)
        for name, value in FORMULA_DEFAULTS.get(selected_route, {}).items():
            # This is a captured route fact; setdefault preserves every caller value.
            inputs.setdefault(name, value)
        from .._core import build_runtime
        from .._core.flow_api_media import execute_compiled_node
        inputs['__flow_runtime__'] = build_runtime(
            NODE_ID, PROVIDER, ROUTES, inputs, instance_id=unique_id, raw_live=raw_live
        )
        return await execute_compiled_node(NODE_ID, PROVIDER, ROUTE, inputs)

NODE_CLASS_MAPPINGS = {NODE_ID: MATRIXWave1Seedream50ProT2i}
NODE_DISPLAY_NAME_MAPPINGS = {NODE_ID: 'MATRIX POWER NODES - Seedream 5.0 Pro'}
