"""Lossless image preparation and expiring upload reuse."""

from __future__ import annotations

import asyncio
import concurrent.futures
import hashlib
import inspect
import io
import math
import threading
from types import MappingProxyType

import numpy as np
import torch
from PIL import Image

from ..media_reference_set import ReferenceSet, ReferenceSetError, make_reference_set


class ImageInputError(ValueError):
    """The input violates an explicit image or batch contract."""


def image_frame_count(value: object) -> int:
    """Count IMAGE frames from structure only; never materialize tensor contents."""
    if isinstance(value, (ReferenceSet, LocalImagePlan)):
        return len(value.frames)
    if isinstance(value, torch.Tensor) and value.ndim == 4:
        return int(value.shape[0])
    raise ImageInputError("input must be an IMAGE tensor [B,H,W,C]")


def validate_image_cardinality(
    value: object,
    *,
    field: str,
    required: bool,
    min_items: int | None,
    max_items: int | None,
) -> int:
    """Validate provider structural bounds before encode, hash, cache, or upload."""
    for name, bound in (("minItems", min_items), ("maxItems", max_items)):
        if bound is not None and (
            isinstance(bound, bool) or not isinstance(bound, int) or bound < 0
        ):
            raise ImageInputError(f"{field} {name} must be a non-negative integer")
    if (
        min_items is not None
        and max_items is not None
        and min_items > max_items
    ):
        raise ImageInputError(f"{field} minItems must not exceed maxItems")
    effective_min = 1 if required and min_items is None else min_items
    count = image_frame_count(value)
    if effective_min is not None and count < effective_min:
        reason = (
            "required IMAGE input cannot be empty"
            if required and min_items is None and count == 0
            else f"minimum is {effective_min}"
        )
        raise ImageInputError(f"{field} contains {count} images; {reason}")
    if max_items is not None and count > max_items:
        raise ImageInputError(
            f"{field} contains {count} images; maximum is {max_items}"
        )
    return count


class ImageLimits:
    __slots__ = (
        "platform_upload_max_bytes",
        "model_input_max_bytes",
        "model_max_dimensions",
    )

    def __init__(
        self,
        platform_upload_max_bytes,
        model_input_max_bytes=None,
        model_max_dimensions=None,
    ):
        self.platform_upload_max_bytes = int(platform_upload_max_bytes)
        self.model_input_max_bytes = (
            None if model_input_max_bytes is None else int(model_input_max_bytes)
        )
        self.model_max_dimensions = (
            None
            if model_max_dimensions is None
            else (int(model_max_dimensions[0]), int(model_max_dimensions[1]))
        )
        if self.platform_upload_max_bytes < 1:
            raise ImageInputError("platform_upload_limit must be positive")
        if self.model_input_max_bytes is not None and self.model_input_max_bytes < 1:
            raise ImageInputError("model_input_limit must be positive")
        if self.model_max_dimensions is not None and min(self.model_max_dimensions) < 1:
            raise ImageInputError("model maximum dimensions must be positive")


class RemoteAsset:
    __slots__ = ("remote_id", "url", "expires_at")

    def __init__(self, remote_id=None, url=None, expires_at=None):
        self.remote_id = remote_id
        self.url = url
        self.expires_at = expires_at


class ResizeReport:
    __slots__ = ("before", "after")

    def __init__(self, before, after):
        self.before = before
        self.after = after


class EncodedFrame:
    __slots__ = ("data", "dimensions", "resize")

    def __init__(self, data, dimensions, resize):
        self.data = data
        self.dimensions = dimensions
        self.resize = resize


class PreparedLocalFrame:
    __slots__ = ("source", "encoded", "digest")

    def __init__(self, source, encoded, digest):
        self.source = source
        self.encoded = encoded
        self.digest = digest


class LocalImagePlan:
    """Immutable local bytes shared by every paid cell in one dataset config."""

    __slots__ = ("frames",)
    batch_policy = "slot-then-frame"

    def __init__(self, frames):
        self.frames = tuple(frames)


class PreparedImage:
    __slots__ = ("asset", "content_hash", "dimensions", "resize", "upload_cache_hit")

    def __init__(self, asset, digest, dimensions, resize, cache_hit):
        self.asset = asset
        self.content_hash = digest
        self.dimensions = dimensions
        self.resize = resize
        self.upload_cache_hit = cache_hit


class PreparedImageInputs:
    __slots__ = ("batch_policy", "images")

    def __init__(self, batch_policy, images):
        self.batch_policy = batch_policy
        self.images = tuple(images)


class DatasetConfig:
    __slots__ = (
        "provider",
        "route",
        "route_ids",
        "options",
        "live",
        "references",
        "prepared_references",
        "_locked",
    )

    def __init__(
        self,
        provider,
        route,
        route_ids,
        options,
        live,
        references,
        prepared_references=None,
    ):
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "route", route)
        object.__setattr__(self, "route_ids", route_ids)
        object.__setattr__(self, "options", options)
        object.__setattr__(self, "live", live)
        object.__setattr__(self, "references", references)
        object.__setattr__(self, "prepared_references", prepared_references)
        object.__setattr__(self, "_locked", True)

    def __setattr__(self, name, value):
        if getattr(self, "_locked", False):
            raise AttributeError("dataset config is immutable")
        object.__setattr__(self, name, value)

    def __repr__(self):
        return (
            "DatasetConfig("
            f"provider={self.provider!r}, route={self.route!r}, "
            f"route_ids={self.route_ids!r}, options={dict(self.options)!r}, "
            f"live={self.live!r}, "
            f"references={len(self.references.tensors)} slots)"
        )

    def to_flow_inputs(self, prompt):
        values = dict(self.options)
        values.update(
            {
                "live": self.live,
                "refresh_nonce": "",
                "model": self.route,
                "prompt": str(prompt),
                "images": self.prepared_references or self.references,
            }
        )
        return values


def make_dataset_config(
    *,
    provider,
    route,
    route_ids,
    options,
    live,
    references,
    prepared_references=None,
):
    routes = tuple(route_ids)
    if not isinstance(provider, str) or not provider:
        raise ImageInputError("dataset provider is required")
    if route not in routes:
        raise ImageInputError("dataset route must be one of the declared routes")
    if type(live) is not bool:
        raise ImageInputError("dataset live must be exactly boolean false or true")
    if not isinstance(references, ReferenceSet):
        raise ImageInputError("dataset references must be an ordered reference set")
    if prepared_references is not None and not isinstance(
        prepared_references, LocalImagePlan
    ):
        raise ImageInputError("prepared references must be a local image plan")
    return DatasetConfig(
        str(provider),
        str(route),
        routes,
        MappingProxyType(dict(options)),
        live,
        references,
        prepared_references,
    )


def _prepare_local_reference_plan(references):
    frames = []
    for frame in references.frames:
        encoded = encode_frame(frame)
        frames.append(
            PreparedLocalFrame(frame, encoded, content_hash(encoded.data))
        )
    return LocalImagePlan(frames)


async def prepare_dataset_config(
    *,
    provider,
    route,
    route_ids,
    options,
    live,
    references,
):
    """Prepare full-resolution reference bytes once without blocking ComfyUI."""
    if not isinstance(references, ReferenceSet):
        raise ImageInputError("dataset references must be an ordered reference set")
    prepared = await asyncio.to_thread(_prepare_local_reference_plan, references)
    return make_dataset_config(
        provider=provider,
        route=route,
        route_ids=route_ids,
        options=options,
        live=live,
        references=references,
        prepared_references=prepared,
    )


class UploadCache:
    """Provider/content-addressed remote identities with observed expiry."""

    def __init__(self):
        self._lock = threading.Lock()
        self._entries = {}
        self._in_flight = {}

    def get(self, provider, digest):
        with self._lock:
            return self._entries.get((str(provider), digest))

    def put(self, provider, digest, asset):
        with self._lock:
            self._entries[(str(provider), digest)] = asset

    def discard(self, provider, digest):
        with self._lock:
            self._entries.pop((str(provider), digest), None)

    def begin_upload(self, provider, digest, expected):
        """Atomically reuse a replacement, join one upload, or own that upload."""
        key = (str(provider), digest)
        with self._lock:
            current = self._entries.get(key)
            if current is not expected and current is not None:
                return "cached", current
            if current is expected:
                self._entries.pop(key, None)
            future = self._in_flight.get(key)
            if future is not None:
                return "waiting", future
            future = concurrent.futures.Future()
            self._in_flight[key] = future
            return "owner", future

    def finish_upload(self, provider, digest, future, asset):
        key = (str(provider), digest)
        with self._lock:
            if self._in_flight.get(key) is not future:
                raise ImageInputError("upload single-flight ownership changed")
            self._entries[key] = asset
            self._in_flight.pop(key)
        future.set_result(asset)

    def fail_upload(self, provider, digest, future, error):
        key = (str(provider), digest)
        with self._lock:
            if self._in_flight.get(key) is future:
                self._in_flight.pop(key)
        if not future.done():
            future.set_exception(error)


def content_hash(data):
    return hashlib.sha256(data).hexdigest()


def _frame_image(frame):
    if not isinstance(frame, torch.Tensor) or frame.ndim != 3:
        raise ImageInputError("each image must be a tensor [H,W,C]")
    channels = int(frame.shape[-1])
    if channels not in (3, 4):
        raise ImageInputError("input image must have RGB or RGBA channels")
    array = frame.detach().to("cpu", torch.float32).clamp(0, 1).numpy()
    array = np.rint(array * 255.0).astype(np.uint8)
    return Image.fromarray(array, mode="RGB" if channels == 3 else "RGBA")


def encode_frame(frame, model_max_dimensions=None):
    image = _frame_image(frame)
    before = image.size
    report = None
    if model_max_dimensions is not None:
        maximum_width, maximum_height = model_max_dimensions
        scale = min(maximum_width / image.width, maximum_height / image.height, 1.0)
        if scale < 1:
            after = (
                max(1, math.floor(image.width * scale)),
                max(1, math.floor(image.height * scale)),
            )
            image = image.resize(after, Image.Resampling.LANCZOS)
            report = ResizeReport(before, after)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return EncodedFrame(output.getvalue(), image.size, report)


def _usable(asset, now):
    return (
        isinstance(asset, RemoteAsset)
        and bool(asset.remote_id or asset.url)
        and asset.expires_at is not None
        and float(asset.expires_at) > float(now)
    )


async def _await(value):
    return await value if inspect.isawaitable(value) else value


async def prepare_image_inputs(
    value,
    *,
    provider,
    batch_policy,
    limits,
    cache,
    upload_large_file,
    now,
    remote_exists=None,
    on_progress=None,
    field="images",
    required=True,
    min_items=None,
    max_items=None,
):
    """Encode every declared frame and use only the provider's file-upload path."""
    if batch_policy not in {"exactly-one", "map", "batch"}:
        raise ImageInputError("batch policy must be exactly-one, map, or batch")
    validate_image_cardinality(
        value,
        field=field,
        required=required,
        min_items=min_items,
        max_items=max_items,
    )
    if isinstance(value, LocalImagePlan):
        if batch_policy != "batch":
            raise ImageInputError("a local image plan requires batch policy")
        frames = value.frames
    elif isinstance(value, ReferenceSet):
        if batch_policy != "batch":
            raise ImageInputError("an ordered reference set requires batch policy")
        frames = value.frames
    elif isinstance(value, torch.Tensor) and value.ndim == 4 and value.shape[0] >= 1:
        frames = tuple(value)
    else:
        raise ImageInputError("input must be an IMAGE tensor [B,H,W,C]")
    if batch_policy == "exactly-one" and len(frames) != 1:
        raise ImageInputError(
            f"exactly one image is required; received a batch of {len(frames)}"
        )

    prepared = []
    total_frames = len(frames)
    for index, frame in enumerate(frames):
        if isinstance(frame, PreparedLocalFrame):
            if limits.model_max_dimensions is None:
                encoded = frame.encoded
                digest = frame.digest
            else:
                encoded = encode_frame(frame.source, limits.model_max_dimensions)
                digest = content_hash(encoded.data)
        else:
            encoded = encode_frame(frame, limits.model_max_dimensions)
            digest = content_hash(encoded.data)
        size = len(encoded.data)
        if size > limits.platform_upload_max_bytes:
            raise ImageInputError(
                f"platform_upload_limit is {limits.platform_upload_max_bytes} bytes; "
                f"image is {size} bytes"
            )
        if (
            limits.model_input_max_bytes is not None
            and size > limits.model_input_max_bytes
        ):
            raise ImageInputError(
                f"model_input_limit is {limits.model_input_max_bytes} bytes; "
                f"image is {size} bytes"
            )

        asset = cache.get(provider, digest)
        cache_hit = _usable(asset, now)
        progress_state = "cached" if cache_hit else None
        if cache_hit and remote_exists is not None:
            cache_hit = bool(await _await(remote_exists(asset)))
            progress_state = "cached" if cache_hit else None
        if not cache_hit:
            role, shared = cache.begin_upload(provider, digest, asset)
            if role == "cached":
                asset = shared
                cache_hit = True
                progress_state = "cached"
            elif role == "waiting":
                asset = await asyncio.shield(asyncio.wrap_future(shared))
                cache_hit = True
                progress_state = "cached"
            else:
                try:
                    if on_progress is not None:
                        await _await(on_progress(index, total_frames, "uploading"))
                    asset = await _await(
                        upload_large_file(
                            encoded.data,
                            f"image_{index + 1}_{digest[:12]}.png",
                            "image/png",
                        )
                    )
                    if not _usable(asset, now):
                        raise ImageInputError(
                            "large-file upload returned no remote identity with a future expiry"
                        )
                except BaseException as exc:
                    cache.fail_upload(provider, digest, shared, exc)
                    raise
                cache.finish_upload(provider, digest, shared, asset)
                progress_state = "uploaded"
        prepared.append(
            PreparedImage(asset, digest, encoded.dimensions, encoded.resize, cache_hit)
        )
        if on_progress is not None:
            await _await(
                on_progress(index + 1, total_frames, progress_state or "cached")
            )
    return PreparedImageInputs(batch_policy, prepared)


__all__ = [
    "DatasetConfig",
    "EncodedFrame",
    "ImageInputError",
    "ImageLimits",
    "LocalImagePlan",
    "PreparedImage",
    "PreparedImageInputs",
    "PreparedLocalFrame",
    "ReferenceSet",
    "RemoteAsset",
    "ResizeReport",
    "UploadCache",
    "content_hash",
    "encode_frame",
    "image_frame_count",
    "make_dataset_config",
    "make_reference_set",
    "prepare_dataset_config",
    "prepare_image_inputs",
    "validate_image_cardinality",
]
