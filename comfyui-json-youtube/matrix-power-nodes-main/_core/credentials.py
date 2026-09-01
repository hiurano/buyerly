"""Pack-owned credential routes; regenerate instead of hand-editing."""
from __future__ import annotations

from contextvars import ContextVar
import ipaddress
from urllib.parse import urlsplit


CREDENTIAL_CONTRACTS = {'wavespeed': {'auth': 'bearer',
               'auth_fail': (401, 403),
               'auth_prefix': '',
               'base_url': 'https://api.wavespeed.ai',
               'env_names': ('WAVESPEED_API_KEY', 'MATRIX_WAVESPEED_KEY'),
               'method': 'GET',
               'ok': (200,),
               'path': '/api/v3/models'}}
CREDENTIAL_ROUTES = {'wavespeed': '/matrix/compiled/19c3b69ab6cb840d/wavespeed/key'}
INTENT_HEADER = 'X-Matrix-Credential-Intent-19c3b69ab6cb840d'
INTENT_VALUE = 'matrix-compiled-19c3b69ab6cb840d'
_DENIAL_REASON = ContextVar("matrix_credential_denial_reason", default="forbidden")
_LOOPBACKS = {"127.0.0.1", "::1"}


def _socket_address(request, name):
    transport = getattr(request, "transport", None)
    if transport is None:
        return ""
    try:
        value = transport.get_extra_info(name)
    except Exception:
        return ""
    if isinstance(value, (tuple, list)) and value:
        value = value[0]
    return str(value or "").split("%", 1)[0]


def _authority(value, scheme="http"):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = urlsplit(text if "://" in text else f"{scheme}://{text}")
        host = (parsed.hostname or "").rstrip(".").lower()
        port = parsed.port
    except (TypeError, ValueError):
        return None
    if not host:
        return None
    if port is None:
        port = 443 if parsed.scheme == "https" else 80
    return host, port


def _is_loopback_host(host):
    if host == "localhost":
        return True
    try:
        return str(ipaddress.ip_address(host)) in _LOOPBACKS
    except ValueError:
        return False


async def authorize_credential_request(request):
    """Fail closed unless this is an intentional same-origin loopback request."""
    _DENIAL_REASON.set("forbidden")
    peer = _socket_address(request, "peername")
    local = _socket_address(request, "sockname")
    request_authority = _authority(
        getattr(request, "host", ""),
        getattr(request, "scheme", "http"),
    )
    if peer not in _LOOPBACKS:
        _DENIAL_REASON.set(
            "Credential entry is disabled for non-loopback clients. "
            "Open ComfyUI on the same machine and retry."
        )
        return False
    if local not in _LOOPBACKS or not request_authority or not _is_loopback_host(
        request_authority[0]
    ):
        _DENIAL_REASON.set(
            "Credential entry is disabled while ComfyUI is serving on a non-loopback address. "
            "Bind ComfyUI to 127.0.0.1 or ::1 and retry."
        )
        return False
    headers = getattr(request, "headers", {})
    if headers.get(INTENT_HEADER) != INTENT_VALUE:
        return False
    for marker in ("Origin", "Referer"):
        supplied = headers.get(marker)
        if supplied is not None and _authority(
            supplied, getattr(request, "scheme", "http")
        ) != request_authority:
            return False
    return True


async def _verify_provider_key(config, key):
    """Call the registry-declared free probe once; never create a provider task."""
    try:
        from aiohttp import ClientSession, ClientTimeout

        headers = {"Accept": "application/json", "User-Agent": "matrix-compiled-key-check/1.0"}
        params = None
        auth = config["auth"]
        if auth == "bearer":
            headers["Authorization"] = f"Bearer {key}"
        elif auth.startswith("header:"):
            headers[auth.split(":", 1)[1]] = config["auth_prefix"] + key
        elif auth.startswith("query_key:"):
            params = {auth.split(":", 1)[1]: key}
        timeout = ClientTimeout(total=30)
        async with ClientSession(timeout=timeout, trust_env=False) as session:
            async with session.request(
                config["method"],
                config["base_url"] + config["path"],
                headers=headers,
                params=params,
            ) as response:
                status = int(response.status)
    except Exception:
        return None
    if status in config["auth_fail"]:
        return False
    if status in config["ok"]:
        return True
    return None


def register_credential_routes():
    """Register once during ComfyUI import; stay inert outside a ComfyUI runtime."""
    if not CREDENTIAL_CONTRACTS:
        return False
    try:
        from server import PromptServer
    except (ImportError, AttributeError):
        return False
    prompt_server = getattr(PromptServer, "instance", None)
    routes = getattr(prompt_server, "routes", None)
    if routes is None:
        return False

    from aiohttp import web
    from .auth_provider_key import ProviderKeyStore
    from .auth_provider_key import register_provider_key_routes as register_routes
    from .runtime import _credential_root

    class PolicyWeb:
        @staticmethod
        def json_response(body, status=200):
            if status == 403:
                body = {"error": _DENIAL_REASON.get()}
            return web.json_response(body, status=status)

    for provider, config in CREDENTIAL_CONTRACTS.items():
        store = ProviderKeyStore(
            provider,
            config["env_names"],
            root=_credential_root(),
        )

        async def verify(key, provider_config=config):
            return await _verify_provider_key(provider_config, key)

        register_routes(
            routes,
            PolicyWeb,
            CREDENTIAL_ROUTES[provider],
            store,
            verify=verify,
            authorize=authorize_credential_request,
        )
    return True


__all__ = [
    "CREDENTIAL_ROUTES",
    "INTENT_HEADER",
    "INTENT_VALUE",
    "authorize_credential_request",
    "register_credential_routes",
]
