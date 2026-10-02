"""The Buyerly Telegram bot: only links personal accounts and delivers Inbox notifications.

The bot token lives only in the server's .env (TELEGRAM_BOT_TOKEN). Telegram
calls the API back through a webhook guarded by a secret derived from the token.
"""

import hashlib
import hmac
import logging
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

API_URL = "https://api.telegram.org"
WEBHOOK_PATH = "/api/telegram/webhook"
ALLOWED_UPDATES = ["message", "my_chat_member"]

_bot_username: Optional[str] = None


def bot_token() -> str:
    return (settings.TELEGRAM_BOT_TOKEN or "").strip("\"' \t\r\n")


def is_configured() -> bool:
    return bool(bot_token())


def webhook_secret() -> str:
    """Telegram sends it back in X-Telegram-Bot-Api-Secret-Token; no extra secret to keep."""
    return hmac.new(bot_token().encode(), b"buyerly-telegram-webhook", hashlib.sha256).hexdigest()


def webhook_url() -> str:
    return (settings.WEBAPP_URL or "https://buyerly.app").rstrip("/") + WEBHOOK_PATH


@dataclass
class SendResult:
    ok: bool
    # The person blocked the bot or deleted their account: retrying will not help.
    unreachable: bool = False
    error: str = ""
    retry_after: int = 0


async def _call(method: str, payload: dict[str, Any], timeout: float = 10.0) -> httpx.Response:
    async with httpx.AsyncClient(timeout=timeout) as client:
        return await client.post(f"{API_URL}/bot{bot_token()}/{method}", json=payload)


def _description(response: httpx.Response) -> str:
    try:
        return str(response.json().get("description") or "")
    except ValueError:
        return response.text[:200]


async def send_message(
    chat_id: int,
    text: str,
    *,
    button: Optional[tuple[str, str]] = None,
) -> SendResult:
    """Send an HTML message, optionally with one link button (label, url)."""
    if not is_configured():
        logger.info("[DEV TELEGRAM] To: %s | %s", chat_id, text.splitlines()[0] if text else "")
        return SendResult(ok=True)
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "link_preview_options": {"is_disabled": True},
    }
    if button:
        payload["reply_markup"] = {"inline_keyboard": [[{"text": button[0], "url": button[1]}]]}
    try:
        response = await _call("sendMessage", payload)
    except httpx.HTTPError as error:
        logger.error("Telegram sendMessage to %s failed: %s", chat_id, error)
        return SendResult(ok=False, error=type(error).__name__)
    if response.status_code == 200:
        return SendResult(ok=True)
    description = _description(response)
    if response.status_code == 403 or "chat not found" in description.lower():
        return SendResult(ok=False, unreachable=True, error=description)
    retry_after = 0
    if response.status_code == 429:
        try:
            retry_after = int(response.json().get("parameters", {}).get("retry_after") or 0)
        except ValueError:
            retry_after = 0
    logger.error("Telegram sendMessage to %s failed: HTTP %d %s", chat_id, response.status_code, description)
    return SendResult(ok=False, error=description, retry_after=retry_after)


async def get_bot_username() -> Optional[str]:
    """The bot's @username for t.me links, asked from Telegram once per process."""
    global _bot_username
    if _bot_username or not is_configured():
        return _bot_username
    try:
        response = await _call("getMe", {})
        if response.status_code == 200:
            _bot_username = response.json().get("result", {}).get("username") or None
        else:
            logger.error("Telegram getMe failed: HTTP %d %s", response.status_code, _description(response))
    except httpx.HTTPError as error:
        logger.error("Telegram getMe failed: %s", error)
    return _bot_username


async def register_webhook() -> bool:
    """Point the bot at this server; harmless to repeat on every start."""
    if not is_configured():
        return False
    try:
        response = await _call(
            "setWebhook",
            {
                "url": webhook_url(),
                "secret_token": webhook_secret(),
                "allowed_updates": ALLOWED_UPDATES,
                "max_connections": 5,
            },
        )
    except httpx.HTTPError as error:
        logger.error("Telegram setWebhook failed: %s", error)
        return False
    if response.status_code != 200:
        logger.error("Telegram setWebhook failed: HTTP %d %s", response.status_code, _description(response))
        return False
    logger.info("Telegram webhook set to %s", webhook_url())
    return True
