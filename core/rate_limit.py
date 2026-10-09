import asyncio
import hashlib
import ipaddress
import logging
import math
import time
from collections import defaultdict
from functools import lru_cache
from typing import Callable, Optional, Tuple
from urllib.parse import unquote

from fastapi import HTTPException, Request

from core.config import CLOUDFLARE_PUBLISHED_CIDRS, settings


logger = logging.getLogger(__name__)


class RateLimiter:
    """Sliding-window limiter kept in the memory of the single API process.

    Production runs one API process, so the counters are shared by every
    request; a restart clears them, which only gives a client a fresh window.
    """

    def __init__(self, cleanup_interval_seconds: int = 300):
        self._records: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._last_cleanup = time.time()
        self._cleanup_interval = cleanup_interval_seconds

    def _cleanup_stale(self, now: float) -> None:
        """Evict records where all timestamps are older than 10 minutes."""
        threshold = now - 600
        stale_keys = [
            key
            for key, timestamps in self._records.items()
            if not timestamps or timestamps[-1] < threshold
        ]
        for key in stale_keys:
            del self._records[key]
        self._last_cleanup = now

    async def is_allowed(
        self,
        key: str,
        limit: int,
        window_seconds: int,
    ) -> Tuple[bool, int]:
        if limit < 1 or window_seconds < 1:
            raise ValueError("limit and window_seconds must be positive")
        now = time.time()
        window_start = now - window_seconds

        async with self._lock:
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup_stale(now)

            timestamps = [stamp for stamp in self._records[key] if stamp > window_start]
            self._records[key] = timestamps
            if len(timestamps) < limit:
                timestamps.append(now)
                return True, 0

            retry_after = max(1, math.ceil(timestamps[0] + window_seconds - now))
            return False, retry_after

    async def reset(self, key: Optional[str] = None) -> None:
        async with self._lock:
            if key is None:
                self._records.clear()
            else:
                self._records.pop(key, None)


limiter = RateLimiter()



def _normalize_ip(raw_value: str) -> Optional[str]:
    value = raw_value.strip()
    if not value:
        return None
    if value.startswith("[") and "]" in value:
        value = value[1 : value.index("]")]
    try:
        parsed = ipaddress.ip_address(value)
    except ValueError:
        if value.count(":") == 1 and "." in value:
            try:
                parsed = ipaddress.ip_address(value.rsplit(":", 1)[0])
            except ValueError:
                return None
        else:
            return None
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped:
        parsed = parsed.ipv4_mapped
    return parsed.compressed


@lru_cache(maxsize=32)
def _trusted_proxy_networks(raw_config: str):
    networks = []
    for item in raw_config.split(","):
        value = item.strip()
        if not value:
            continue
        try:
            networks.append(ipaddress.ip_network(value, strict=False))
        except ValueError:
            logger.warning("Ignoring invalid trusted proxy CIDR")
    return tuple(networks)


def _is_trusted_proxy(ip_value: str) -> bool:
    parsed = ipaddress.ip_address(ip_value)
    return any(
        parsed.version == network.version and parsed in network
        for network in _trusted_proxy_networks(settings.TRUSTED_PROXY_CIDRS)
    )


def _from_cloudflare(ip_value: str) -> bool:
    configured = settings.CLOUDFLARE_IP_CIDRS.strip()
    if configured.lower() == "off":
        return False
    parsed = ipaddress.ip_address(ip_value)
    return any(
        parsed.version == network.version and parsed in network
        for network in _trusted_proxy_networks(configured or CLOUDFLARE_PUBLISHED_CIDRS)
    )


def _from_tunnel(ip_value: str) -> bool:
    configured = settings.CLOUDFLARE_TUNNEL_CIDRS.strip()
    if not configured or settings.CLOUDFLARE_IP_CIDRS.strip().lower() == "off":
        return False
    parsed = ipaddress.ip_address(ip_value)
    return any(
        parsed.version == network.version and parsed in network
        for network in _trusted_proxy_networks(configured)
    )


def _edge(request: Request) -> tuple[str, bool]:
    """The address that connected to our own proxies, and whether it is our Cloudflare Tunnel.

    The tunnel address is checked only where our side wrote it down: as the
    direct peer, or as a hop a trusted proxy appended. A trusted proxy's own
    address is never taken for the tunnel, so the tunnel networks may overlap
    TRUSTED_PROXY_CIDRS (both are the Docker networks in production).
    """
    peer_ip = _normalize_ip(request.client.host if request.client else "")
    if peer_ip is None:
        return "unknown", False
    if not _is_trusted_proxy(peer_ip):
        return peer_ip, _from_tunnel(peer_ip)

    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        chain = [_normalize_ip(item) for item in forwarded.split(",")]
        if not chain or any(item is None for item in chain):
            return peer_ip, False
        current = peer_ip
        for hop in reversed(chain):
            if not _is_trusted_proxy(current):
                break
            current = hop
            if _from_tunnel(current):
                return current, True
        return current, False

    real_ip = _normalize_ip(request.headers.get("X-Real-IP", ""))
    if real_ip:
        return real_ip, _from_tunnel(real_ip)
    return peer_ip, False


def _via_cloudflare(request: Request) -> bool:
    """Cloudflare headers count only when Cloudflare itself made the connection.

    A direct hit on the server can send any CF-* header, but its own address is
    then the edge address, which is neither in Cloudflare's published networks
    nor the local address our Cloudflare Tunnel connects from.
    """
    edge_ip, via_tunnel = _edge(request)
    return via_tunnel or (edge_ip != "unknown" and _from_cloudflare(edge_ip))


def get_client_ip(request: Request) -> str:
    """The browser's address: forwarded headers only from trusted proxies or Cloudflare."""
    edge_ip, via_tunnel = _edge(request)
    if via_tunnel or (edge_ip != "unknown" and _from_cloudflare(edge_ip)):
        visitor_ip = _normalize_ip(request.headers.get("CF-Connecting-IP", ""))
        if visitor_ip:
            return visitor_ip
    return edge_ip


_UNKNOWN_COUNTRIES = {"XX", "T1"}


def _location_part(raw_value: str, max_length: int) -> str:
    value = raw_value.strip()
    if not value:
        return ""
    # HTTP headers are read as latin-1; Cloudflare sends city names as UTF-8 bytes.
    try:
        value = value.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    if "%" in value:
        value = unquote(value)
    value = "".join(char for char in value if char.isprintable() and char != ",").strip()
    return value[:max_length]


def get_client_location(request: Request) -> str:
    """'Helsinki, 18, FI' from Cloudflare's visitor location headers, as Linear shows it.

    Empty when the request did not come through Cloudflare or the headers are off.
    """
    if not _via_cloudflare(request):
        return ""
    city = _location_part(request.headers.get("cf-ipcity", ""), 80)
    region = _location_part(request.headers.get("cf-region-code", ""), 10)
    country = _location_part(request.headers.get("cf-ipcountry", ""), 2).upper()
    if country in _UNKNOWN_COUNTRIES or not country.isalpha():
        country = ""
    return ", ".join(part for part in (city, region, country) if part)


async def _request_identity(request: Request, fields: tuple[str, ...]) -> str:
    if not fields:
        return ""
    payload = {}
    try:
        content_type = request.headers.get("content-type", "").split(";", 1)[0].strip()
        if content_type == "application/json":
            payload = await request.json()
    except (TypeError, ValueError):
        payload = {}
    if not isinstance(payload, dict):
        return ""
    for field in fields:
        value = payload.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip().casefold()
    return ""


def rate_limit_dep(
    limit: int,
    window_seconds: int = 60,
    scope: str = "default",
    identity_fields: tuple[str, ...] = (),
) -> Callable:
    """Enforce independent shared limits for the client IP and account key."""

    async def _dependency(request: Request) -> None:
        client_ip = get_client_ip(request)
        identity = await _request_identity(request, identity_fields)
        keys = [f"{scope}:ip:{client_ip}"]
        if identity:
            identity_hash = hashlib.sha256(identity.encode("utf-8")).hexdigest()
            keys.append(f"{scope}:identity:{identity_hash}")

        retry_after = 0
        for key in keys:
            allowed, key_retry_after = await limiter.is_allowed(
                key,
                limit,
                window_seconds,
            )
            if not allowed:
                retry_after = max(retry_after, key_retry_after)

        if retry_after:
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Please try again in {retry_after} s.",
                headers={"Retry-After": str(retry_after)},
            )

    return _dependency
