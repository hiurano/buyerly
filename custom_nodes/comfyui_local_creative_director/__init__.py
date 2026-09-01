from .local_ollama_director import LocalOllamaCreativeDirector

NODE_CLASS_MAPPINGS = {
    "LocalOllamaCreativeDirector": LocalOllamaCreativeDirector
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LocalOllamaCreativeDirector": "🎬 Mistral NeMo AI Director (Local Ollama UGC)"
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
