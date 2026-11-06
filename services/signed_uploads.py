"""Signed upload links (decision 55), as server/src/uploads/signed.ts makes and checks them.

`fileUpload` hands one out and the browser PUTs the file's bytes to it, as Linear's uploads go to
signed storage URLs. The token is the grant itself: who uploads, for what, and until when, signed
with the OTP pepper both servers share, so either server may take the bytes.
"""

import base64
import hashlib
import hmac
import json
import time
from typing import Optional

from core.config import settings

UPLOAD_PURPOSES = ("avatar", "workspace_logo")
# The link: the token goes in the query, longer than a path segment should be.
SIGNED_UPLOAD_PATH = "/uploads/signed"
LIFETIME_SECONDS = 10 * 60


def _signature(payload: str) -> str:
    return hmac.new(settings.OTP_PEPPER.encode(), f"file-upload:{payload}".encode(), hashlib.sha256).hexdigest()


def sign_upload(*, user_id: int, purpose: str, filename: str, content_type: str, now: Optional[float] = None) -> str:
    grant = {"u": user_id, "p": purpose, "n": filename, "t": content_type,
             "e": int(now if now is not None else time.time()) + LIFETIME_SECONDS}
    payload = base64.urlsafe_b64encode(json.dumps(grant).encode()).decode().rstrip("=")
    return f"{payload}.{_signature(payload)}"


def verify_upload(token: str, now: Optional[float] = None) -> Optional[dict]:
    """The grant a token carries, or None when it is forged, malformed or over."""
    parts = token.split(".")
    if len(parts) != 2 or not parts[0]:
        return None
    payload, signed = parts
    if not hmac.compare_digest(signed.encode(), _signature(payload).encode()):
        return None
    try:
        grant = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (ValueError, TypeError):
        return None
    if not isinstance(grant, dict) or not isinstance(grant.get("u"), int) or grant.get("p") not in UPLOAD_PURPOSES:
        return None
    if not isinstance(grant.get("e"), (int, float)) or grant["e"] < (now if now is not None else time.time()):
        return None
    return grant
