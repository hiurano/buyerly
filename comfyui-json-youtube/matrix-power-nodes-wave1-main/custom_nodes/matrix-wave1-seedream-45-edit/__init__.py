"""Compiled ComfyUI node pack."""
from .nodes.matrix_wave1seedream45edit import NODE_CLASS_MAPPINGS as _c0, NODE_DISPLAY_NAME_MAPPINGS as _d0

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
NODE_CLASS_MAPPINGS.update(_c0)
NODE_DISPLAY_NAME_MAPPINGS.update(_d0)

from ._core.credentials import register_credential_routes as _register_credential_routes
_register_credential_routes()

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
