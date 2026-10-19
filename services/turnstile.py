"""Cloudflare Turnstile check for sign-up, as on Linear's /signup.

The browser solves the widget and sends its token; the server confirms it with
Cloudflare's siteverify. Without ``TURNSTILE_SECRET_KEY`` (local development,
tests) the check is off.
"""

import logging

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str | None, remote_ip: str | None = None) -> bool:
    """Whether Cloudflare accepts this widget token. Fails closed on errors."""
    secret = settings.TURNSTILE_SECRET_KEY
    if not secret:
        return True
    if not token:
        return False

    data = {"secret": secret, "response": token}
    if remote_ip and remote_ip != "unknown":
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(SITEVERIFY_URL, data=data)
            response.raise_for_status()
            result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Turnstile siteverify failed: %s", exc)
        return False

    if result.get("success") is not True:
        logger.info("Turnstile rejected a token: %s", result.get("error-codes"))
        return False
    return True
