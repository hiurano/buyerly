"""Terminal-state validation, bounded download, and IMAGE decoding."""

from __future__ import annotations

import inspect
import io

import numpy as np
import torch
from PIL import Image


class ImageOutputError(ValueError):
    """The provider result cannot safely become a ComfyUI IMAGE."""


class DownloadStream:
    __slots__ = ("chunks", "content_type", "content_length")

    def __init__(self, chunks, content_type=None, content_length=None):
        self.chunks = chunks
        self.content_type = content_type
        self.content_length = content_length


def _path(value, dotted):
    current = value
    for part in str(dotted).split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _output_url(result, success_states, status_path, output_path):
    status = _path(result, status_path)
    allowed = {str(value).lower() for value in success_states}
    if str(status).lower() not in allowed:
        raise ImageOutputError(
            f"terminal success is required before download; received {status!r}"
        )
    output = _path(result, output_path)
    if output is None or output == "":
        raise ImageOutputError(f"required output field {output_path!r} is missing")
    if isinstance(output, list):
        if len(output) != 1:
            raise ImageOutputError(
                f"exactly one output is required; received {len(output)}"
            )
        output = output[0]
    if not isinstance(output, str) or not output.strip():
        raise ImageOutputError("required output is not a usable URL")
    return output


def _looks_like_image(data):
    return (
        data.startswith(b"\x89PNG\r\n\x1a\n")
        or data.startswith(b"\xff\xd8\xff")
        or (len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP")
    )


async def image_from_result(
    result,
    *,
    success_states,
    status_path,
    output_path,
    download,
    max_bytes,
    interrupt,
):
    """Validate state, read bounded chunks, then decode one native IMAGE tensor."""
    limit = int(max_bytes)
    if limit < 1:
        raise ImageOutputError("download size cap must be positive")
    url = _output_url(result, success_states, status_path, output_path)
    response = download(url)
    if inspect.isawaitable(response):
        response = await response
    if not isinstance(response, DownloadStream):
        raise ImageOutputError("download must return a DownloadStream")
    if response.content_type and not str(response.content_type).lower().startswith("image/"):
        raise ImageOutputError(
            f"download content type is not an image: {response.content_type}"
        )
    if response.content_length is not None and int(response.content_length) > limit:
        raise ImageOutputError(
            f"declared download size exceeds the {limit}-byte size cap"
        )

    data = bytearray()
    async for chunk in response.chunks:
        interrupt()
        if not isinstance(chunk, (bytes, bytearray, memoryview)):
            raise ImageOutputError("download yielded a non-byte image chunk")
        if len(data) + len(chunk) > limit:
            raise ImageOutputError(f"download exceeded the {limit}-byte size cap")
        data.extend(chunk)
    interrupt()
    raw = bytes(data)
    if not raw or not _looks_like_image(raw):
        raise ImageOutputError("download did not contain a recognized image")
    try:
        with Image.open(io.BytesIO(raw)) as checked:
            checked.verify()
        with Image.open(io.BytesIO(raw)) as image:
            array = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    except Exception as exc:
        raise ImageOutputError(
            f"download did not contain a decodable image: {type(exc).__name__}"
        ) from exc
    return torch.from_numpy(array.copy()).to(torch.float32).unsqueeze(0)
