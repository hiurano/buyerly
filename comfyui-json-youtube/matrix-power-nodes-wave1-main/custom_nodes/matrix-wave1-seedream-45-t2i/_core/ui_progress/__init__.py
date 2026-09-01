"""Bridge poll.task updates to ComfyUI progress and browser status."""

from __future__ import annotations

import inspect


PROGRESS_WEB_ENTRY = "progress.js"
STATUS_EVENT = "matrix.progress"


def make_progress_callback(
    progress_bar,
    send_status,
    *,
    node_id,
    prompt_id,
    node_type,
    queued_states=(),
):
    """Return the callback consumed by poll_task(on_progress=...)."""
    queued = {str(value).strip().lower() for value in queued_states}

    async def report(value, status):
        text = str(status or "").strip()
        normalized = text.lower()
        if normalized in queued:
            phase, label = "queued", f"Queued — {text}"
        elif normalized and normalized != "unknown":
            phase, label = "processing", f"Processing — {text}"
        else:
            phase, label = "unknown", "Status unavailable"

        progress_bar.update_absolute(value, 1)
        result = send_status(
            STATUS_EVENT,
            {
                "node_id": node_id,
                "prompt_id": prompt_id,
                "node_type": node_type,
                "phase": phase,
                "label": label,
            },
        )
        if inspect.isawaitable(result):
            await result

    return report


__all__ = ["PROGRESS_WEB_ENTRY", "STATUS_EVENT", "make_progress_callback"]
