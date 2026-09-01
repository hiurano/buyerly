"""Shared credential routes; regenerate instead of hand-editing."""
from __future__ import annotations

import logging
import os


CREDENTIAL_CONTRACTS = {'wavespeed': {'auth': 'bearer',
               'auth_fail': (401, 403),
               'auth_prefix': '',
               'base_url': 'https://api.wavespeed.ai',
               'env_names': ('WAVESPEED_API_KEY', 'MATRIX_WAVESPEED_KEY'),
               'method': 'GET',
               'ok': (200,),
               'path': '/api/v3/models'}}
CREDENTIAL_CONTRACT_DIGESTS = {'wavespeed': '498d6a746c9a9379b2cdcfcd81d650b4537ff3fa3094e28e4bbdd3b537893770'}
CREDENTIAL_ROUTES = {'wavespeed': '/matrix/credentials/v2/wavespeed/key'}
CREDENTIAL_POLICY_ABI = 'auth.provider-key/0.8.0'
INTENT_HEADER = 'X-Matrix-Credential-Intent-V2'
INTENT_VALUE = 'matrix-credentials-v2'
logger = logging.getLogger("matrix.credentials.v2")


def _configured_listen_addresses():
    """Read ComfyUI's authoritative listener setting; unknown is fail-closed."""
    try:
        from comfy.cli_args import args
        return getattr(args, "listen")
    except Exception:
        return None


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
    from .auth_provider_key import CredentialIngressPolicy, ProviderKeyStore
    from .auth_provider_key import register_provider_key_routes as register_routes
    from .runtime import _credential_root

    registry_attribute = "_matrix_credentials_v2"
    registry = getattr(prompt_server, registry_attribute, None)
    if registry is None:
        registry = {}
        setattr(prompt_server, registry_attribute, registry)
    elif not isinstance(registry, dict):
        raise RuntimeError("PromptServer credential registry v2 has an invalid shape")

    for provider, config in CREDENTIAL_CONTRACTS.items():
        digest = CREDENTIAL_CONTRACT_DIGESTS[provider]
        existing = registry.get(provider)
        if existing is not None:
            if existing.get("credential_policy_abi") != CREDENTIAL_POLICY_ABI:
                raise RuntimeError(
                    f"credential policy ABI mismatch for {provider}: "
                    f"{existing.get('credential_policy_abi')} != {CREDENTIAL_POLICY_ABI}"
                )
            if existing.get("credential_contract_digest") != digest:
                raise RuntimeError(
                    f"credential contract digest mismatch for {provider}: "
                    f"{existing.get('credential_contract_digest')} != {digest}"
                )
            continue

        stable_path = CREDENTIAL_ROUTES[provider]
        intent_header = INTENT_HEADER
        intent_value = INTENT_VALUE
        policy = CredentialIngressPolicy.from_environment(
            environ=os.environ,
            logger=logger,
            intent_header=intent_header,
            intent_value=intent_value,
            listen_addresses=_configured_listen_addresses(),
        )
        store = ProviderKeyStore(
            provider,
            config["env_names"],
            root=_credential_root(),
        )

        async def verify(key, provider_config=config):
            return await _verify_provider_key(provider_config, key)

        register_routes(routes, web, stable_path, store, verify=verify, policy=policy)
        registry[provider] = dict(
            credential_contract_digest=digest,
            credential_policy_abi=CREDENTIAL_POLICY_ABI,
            policy=policy,
            route=stable_path,
            store=store,
            verifier=verify,
        )
    return True


__all__ = [
    "CREDENTIAL_ROUTES",
    "CREDENTIAL_CONTRACT_DIGESTS",
    "INTENT_HEADER",
    "INTENT_VALUE",
    "register_credential_routes",
]
