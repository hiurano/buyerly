from __future__ import annotations

import json
import os
from pathlib import Path
import re


class MissingProviderKey(RuntimeError):
    pass


class CredentialStoreError(RuntimeError):
    pass


def default_credential_root() -> Path:
    import folder_paths

    return Path(folder_paths.get_user_directory()) / "credentials"


def provider_key_widget(provider: str) -> tuple[str, dict]:
    return (
        "STRING",
        {
            "default": "",
            "multiline": False,
            "tooltip": (
                f"One-time {provider} key entry. Stored as cleartext for this single-user "
                "ComfyUI installation and never saved in the workflow."
            ),
        },
    )


def _safe_tail(value: str) -> str:
    return value[-4:] if len(value) > 4 else ""


class ProviderKeyStore:
    def __init__(
        self,
        provider: str,
        env_names: tuple[str, ...],
        *,
        profile: str = "default",
        root: Path | None = None,
    ) -> None:
        for label, value in (("provider", provider), ("profile", profile)):
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value):
                raise ValueError(f"{label} must be a filesystem-safe identifier")
        self.provider = provider
        self.env_names = env_names
        self.path = (Path(root) if root is not None else default_credential_root()) / provider / (
            f"{profile}.json"
        )

    def remember(self, value: str, *, verified: bool) -> None:
        key = value.strip()
        if not key:
            raise ValueError("refusing to store an empty provider key")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps({"key": key, "verified": bool(verified)}),
            encoding="utf-8",
        )
        os.chmod(temporary, 0o600)
        temporary.replace(self.path)
        os.chmod(self.path, 0o600)

    def _record(self) -> dict | None:
        try:
            record = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise CredentialStoreError(
                f"The stored {self.provider} credential cannot be read safely."
            ) from exc
        if not isinstance(record, dict):
            raise CredentialStoreError(
                f"The stored {self.provider} credential has an invalid format."
            )
        return record

    def resolve(self, transient: str = "") -> str:
        typed = transient.strip()
        if typed:
            return typed
        record = self._record()
        if record and str(record.get("key", "")).strip():
            return str(record["key"]).strip()
        for name in self.env_names:
            value = os.environ.get(name, "").strip()
            if value:
                return value
        first_name = self.env_names[0] if self.env_names else "the provider environment variable"
        raise MissingProviderKey(
            f"No {self.provider} key is available. Use the provider key control once or set "
            f"{first_name}."
        )

    def status(self) -> dict:
        record = self._record()
        if record and str(record.get("key", "")).strip():
            key = str(record["key"]).strip()
            return {
                "stored": True,
                "source": "store",
                "tail": _safe_tail(key),
                "verified": bool(record.get("verified", False)),
            }
        for name in self.env_names:
            key = os.environ.get(name, "").strip()
            if key:
                return {
                    "stored": True,
                    "source": "environment",
                    "tail": _safe_tail(key),
                    "verified": False,
                }
        return {"stored": False, "source": "", "tail": "", "verified": False}


def register_provider_key_routes(
    routes,
    web,
    path: str,
    store: ProviderKeyStore,
    *,
    verify,
    authorize,
):
    if not path.startswith("/") or len([part for part in path.split("/") if part]) < 2:
        raise ValueError("credential route must be namespaced")

    async def is_authorized(request) -> bool:
        try:
            return bool(await authorize(request))
        except Exception:
            return False

    @routes.get(path)
    async def key_status(request):
        if not await is_authorized(request):
            return web.json_response({"error": "forbidden"}, status=403)
        return web.json_response(store.status())

    @routes.post(path)
    async def key_ingest(request):
        if not await is_authorized(request):
            return web.json_response({"error": "forbidden"}, status=403)
        try:
            body = await request.json()
        except Exception:
            body = None
        value = body.get("key", "") if isinstance(body, dict) else ""
        key = value.strip() if isinstance(value, str) else ""
        if not key:
            return web.json_response(
                {"ok": False, "error": "a non-empty string key is required"},
                status=400,
            )
        try:
            verified = await verify(key)
        except Exception:
            verified = None
        if verified is False:
            return web.json_response(
                {"ok": False, "error": "credential rejected"},
                status=401,
            )
        try:
            store.remember(key, verified=verified is True)
        except Exception:
            return web.json_response(
                {"ok": False, "error": "credential store unavailable"},
                status=500,
            )
        return web.json_response({"ok": True, **store.status()})

    return key_status, key_ingest
