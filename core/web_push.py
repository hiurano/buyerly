"""Web Push with VAPID (RFC 8291, 8292): desktop notifications through the browser's push service.

Linear's Desktop channel reaches the browser even with the tab closed: the service worker
(frontend/sw/sw.ts) gets the push and shows the notification. A browser's subscription is
an endpoint at its push service and two keys; the message is encrypted for those keys
(aes128gcm) and signed with the server's VAPID key, whose public half the page subscribed with.

VAPID_PRIVATE_KEY is created on the server once by scripts/deploy.sh; changing it ends every
subscription, as browsers subscribed with the old public key.
"""

import base64
import json
import logging
import os
import struct
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Optional
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, hmac, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from core.config import settings

logger = logging.getLogger(__name__)

# A notification older than this is no news: the push service drops it.
TTL_SECONDS = 24 * 60 * 60
RECORD_SIZE = 4096
TIMEOUT_SECONDS = 10


def b64url_decode(value: str) -> bytes:
    value = value.strip()
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def generate_private_key() -> str:
    """A new VAPID key as VAPID_PRIVATE_KEY takes it: the raw P-256 scalar, base64url."""
    key = ec.generate_private_key(ec.SECP256R1())
    return b64url_encode(key.private_numbers().private_value.to_bytes(32, "big"))


@lru_cache(maxsize=4)
def _load_private_key(value: str) -> Optional[ec.EllipticCurvePrivateKey]:
    if not value:
        return None
    try:
        if value.startswith("-----BEGIN"):
            key = serialization.load_pem_private_key(value.replace("\\n", "\n").encode(), password=None)
        else:
            raw = b64url_decode(value.replace("+", "-").replace("/", "_"))
            if len(raw) == 32:
                key = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
            else:
                # `openssl ecparam -genkey -outform DER`, as scripts/deploy.sh writes it.
                key = serialization.load_der_private_key(raw, password=None)
    except (ValueError, TypeError):
        logger.error("VAPID_PRIVATE_KEY is not a P-256 private key; desktop notifications are off")
        return None
    if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
        logger.error("VAPID_PRIVATE_KEY is not a P-256 private key; desktop notifications are off")
        return None
    return key


def private_key() -> Optional[ec.EllipticCurvePrivateKey]:
    return _load_private_key(settings.VAPID_PRIVATE_KEY.strip())


def is_configured() -> bool:
    return private_key() is not None


def _public_bytes(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def public_key() -> Optional[str]:
    """The applicationServerKey the page subscribes with."""
    key = private_key()
    return b64url_encode(_public_bytes(key.public_key())) if key else None


def _hmac(key: bytes, data: bytes) -> bytes:
    mac = hmac.HMAC(key, hashes.SHA256())
    mac.update(data)
    return mac.finalize()


def encrypt(plaintext: bytes, p256dh: str, auth: str, *, salt: Optional[bytes] = None,
            sender_key: Optional[ec.EllipticCurvePrivateKey] = None) -> bytes:
    """The aes128gcm body for one subscription (RFC 8291), in a single record."""
    receiver_public = b64url_decode(p256dh)
    auth_secret = b64url_decode(auth)
    receiver = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), receiver_public)
    sender_key = sender_key or ec.generate_private_key(ec.SECP256R1())
    sender_public = _public_bytes(sender_key.public_key())
    salt = salt or os.urandom(16)

    shared = sender_key.exchange(ec.ECDH(), receiver)
    prk_key = _hmac(auth_secret, shared)
    ikm = _hmac(prk_key, b"WebPush: info\x00" + receiver_public + sender_public + b"\x01")
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    if len(plaintext) + 1 + 16 > RECORD_SIZE:
        raise ValueError("Push message is too long")
    ciphertext = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)
    header = salt + struct.pack("!IB", RECORD_SIZE, len(sender_public)) + sender_public
    return header + ciphertext


def _vapid_authorization(endpoint: str, key: ec.EllipticCurvePrivateKey) -> str:
    """`vapid t=<JWT>, k=<public key>` (RFC 8292) for the endpoint's push service."""
    parts = urlsplit(endpoint)
    claims = {
        "aud": f"{parts.scheme}://{parts.netloc}",
        "exp": int(time.time()) + 12 * 60 * 60,
        "sub": settings.VAPID_SUBJECT,
    }
    signing_input = ".".join(
        b64url_encode(json.dumps(part, separators=(",", ":")).encode())
        for part in ({"typ": "JWT", "alg": "ES256"}, claims)
    )
    r, s = decode_dss_signature(key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256())))
    signature = b64url_encode(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return f"vapid t={signing_input}.{signature}, k={b64url_encode(_public_bytes(key.public_key()))}"


@dataclass
class SendResult:
    ok: bool
    status: Optional[int] = None
    error: Optional[str] = None

    @property
    def gone(self) -> bool:
        """The subscription expired or was unsubscribed: forget it."""
        return self.status in (404, 410)


def request_for(endpoint: str, p256dh: str, auth: str, message: dict[str, Any]) -> tuple[dict[str, str], bytes]:
    key = private_key()
    if key is None:
        raise RuntimeError("VAPID_PRIVATE_KEY is not set")
    body = encrypt(json.dumps(message, separators=(",", ":")).encode(), p256dh, auth)
    headers = {
        "Authorization": _vapid_authorization(endpoint, key),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(TTL_SECONDS),
        "Urgency": "normal",
    }
    return headers, body


async def send(endpoint: str, p256dh: str, auth: str, message: dict[str, Any],
               *, transport: Optional[httpx.AsyncBaseTransport] = None) -> SendResult:
    """Post one notification to the subscription's push service."""
    try:
        headers, body = request_for(endpoint, p256dh, auth, message)
    except (ValueError, TypeError) as error:
        # The browser handed us keys that are not a P-256 point: nothing will ever arrive.
        return SendResult(ok=False, status=410, error=f"bad keys: {error}")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, transport=transport) as client:
            response = await client.post(endpoint, content=body, headers=headers)
    except httpx.HTTPError as error:
        return SendResult(ok=False, error=type(error).__name__)
    if 200 <= response.status_code < 300:
        return SendResult(ok=True, status=response.status_code)
    return SendResult(ok=False, status=response.status_code, error=response.text[:200])
