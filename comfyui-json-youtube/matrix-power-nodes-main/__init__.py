"""Compiled ComfyUI node pack."""
from .nodes.matrix_datasetconfig import NODE_CLASS_MAPPINGS as _c0, NODE_DISPLAY_NAME_MAPPINGS as _d0
from .nodes.matrix_datasetimage import NODE_CLASS_MAPPINGS as _c1, NODE_DISPLAY_NAME_MAPPINGS as _d1

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
NODE_CLASS_MAPPINGS.update(_c0)
NODE_DISPLAY_NAME_MAPPINGS.update(_d0)
NODE_CLASS_MAPPINGS.update(_c1)
NODE_DISPLAY_NAME_MAPPINGS.update(_d1)

from ._core.credentials import register_credential_routes as _register_credential_routes
_register_credential_routes()

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
