"""Ordered, lossless reference-image collection for reusable API nodes."""

from __future__ import annotations

import torch


class ReferenceSetError(ValueError):
    """Reference inputs cannot form one ordered reference set."""


class ReferenceSet:
    """Slot-ordered cloned IMAGE tensors with explicit batch flattening."""

    __slots__ = ("_tensors",)
    batch_policy = "slot-then-frame"

    def __init__(self, tensors):
        self._tensors = tuple(tensors)

    @property
    def tensors(self):
        return self._tensors

    @property
    def frames(self):
        return tuple(frame for value in self._tensors for frame in value)


def make_reference_set(*values):
    """Retain slots in input order; flatten each slot's batch in frame order."""
    tensors = []
    for value in values:
        if value is None:
            continue
        if not isinstance(value, torch.Tensor) or value.ndim != 4 or value.shape[0] < 1:
            raise ReferenceSetError("each reference must be an IMAGE tensor [B,H,W,C]")
        if int(value.shape[-1]) not in (3, 4):
            raise ReferenceSetError("each reference must have RGB or RGBA channels")
        tensors.append(value.detach().clone())
    if not tensors:
        raise ReferenceSetError("at least one reference image is required")
    return ReferenceSet(tensors)


__all__ = [
    "ReferenceSet",
    "ReferenceSetError",
    "make_reference_set",
]
