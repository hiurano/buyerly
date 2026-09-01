"""Semantic result caching with an explicit refresh nonce."""

from __future__ import annotations

import hashlib
import inspect
import json
import math
import os
from collections.abc import Mapping
from pathlib import Path


def credential_fingerprint(provider, credential):
    """Return a stable non-secret cache namespace for one provider account."""
    if not isinstance(provider, str) or not provider.strip():
        raise ValueError("cache fingerprint requires a provider")
    if not isinstance(credential, str) or not credential:
        raise ValueError("cache fingerprint requires a credential")
    return hashlib.sha256(
        (provider.strip() + "\0" + credential).encode("utf-8")
    ).hexdigest()


def _semantic_value(value):
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("semantic factors must not contain NaN or infinity")
        return value
    if isinstance(value, bytes):
        return {"bytes_sha256": hashlib.sha256(value).hexdigest()}
    if isinstance(value, Mapping):
        if any(not isinstance(key, str) for key in value):
            raise TypeError("semantic mapping keys must be strings")
        return {
            key: _semantic_value(value[key])
            for key in sorted(value)
        }
    if isinstance(value, (list, tuple)):
        return [_semantic_value(item) for item in value]
    raise TypeError(
        f"{type(value).__name__} is not a semantic cache value; "
        "convert it at the media boundary"
    )


def semantic_key(identity, factors, refresh_nonce=""):
    """Hash only explicit artifact identity, artifact factors, and refresh intent."""
    encoded = json.dumps(
        {
            "identity": _semantic_value(identity),
            "factors": _semantic_value(factors),
            "refresh_nonce": str(refresh_nonce),
        },
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class SemanticCache:
    def __init__(self, root):
        self.root = Path(root)

    def _path(self, key):
        if not key or any(character not in "0123456789abcdef" for character in key):
            raise ValueError("cache key must be a lowercase hexadecimal digest")
        return self.root / f"{key}.bin"

    def _submit_guard_path(self, key):
        self._path(key)
        return self.root / f"{key}.submit-pending.json"

    def read(self, key):
        try:
            return self._path(key).read_bytes()
        except FileNotFoundError:
            return None

    def write(self, key, value):
        if not isinstance(value, bytes):
            raise TypeError("semantic cache stores bytes")
        self.root.mkdir(parents=True, exist_ok=True)
        target = self._path(key)
        temporary = target.with_suffix(".tmp")
        temporary.write_bytes(value)
        temporary.replace(target)

    async def get_or_create(self, key, create):
        cached = self.read(key)
        if cached is not None:
            return cached, True
        value = create()
        if inspect.isawaitable(value):
            value = await value
        self.write(key, value)
        return value, False

    def claim_submit(self, key, record):
        """Atomically reserve one billable submit for a semantic identity."""
        safe_record = _semantic_value(record)
        if not isinstance(safe_record, dict):
            raise TypeError("submit guard record must be a mapping")
        self.root.mkdir(parents=True, exist_ok=True)
        path = self._submit_guard_path(key)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        try:
            descriptor = os.open(path, flags, 0o600)
        except FileExistsError:
            return False
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(
                    safe_record,
                    handle,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                )
        except BaseException:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
            raise
        return True

    def release_submit(self, key):
        """Release a guard only after the submit outcome is known."""
        try:
            self._submit_guard_path(key).unlink()
        except FileNotFoundError:
            pass


__all__ = ["SemanticCache", "credential_fingerprint", "semantic_key"]
