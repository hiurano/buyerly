"""Where a session was last seen, as Linear writes it: "Helsinki, 18, FI".

The city database is a local MaxMind-format file (GeoLite2 City or DB-IP Lite
City) that `scripts/update_geoip.sh` downloads on deploy; addresses are never
sent anywhere. Without the file every lookup is simply empty.
"""

import ipaddress
import logging
from functools import lru_cache
from typing import Any, Optional

import maxminddb

from core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _reader() -> Optional[Any]:
    path = settings.GEOIP_DATABASE_PATH
    if not path:
        return None
    try:
        return maxminddb.open_database(path)
    except (OSError, ValueError, maxminddb.InvalidDatabaseError):
        logger.info("GeoIP database is not available; session locations stay empty")
        return None


def _name(record: dict) -> str:
    return str((record.get("names") or {}).get("en") or "").strip()


def format_location(record: Optional[dict]) -> str:
    """City, region code (or name when the database has no code), country code."""
    if not record:
        return ""
    city = _name(record.get("city") or {})
    subdivisions = record.get("subdivisions") or []
    region = ""
    if subdivisions:
        region = str(subdivisions[0].get("iso_code") or "").strip() or _name(subdivisions[0])
    country = str((record.get("country") or {}).get("iso_code") or "").strip()
    parts = [city, region, country]
    if city and region == city:
        parts = [city, country]
    return ", ".join(part for part in parts if part)


def _placeable(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Only internet addresses have a city; private, loopback and reserved ones never do."""
    return address.is_global


def locate(ip_value: str) -> str:
    try:
        address = ipaddress.ip_address(ip_value)
    except ValueError:
        return ""
    if not _placeable(address):
        return ""
    reader = _reader()
    if reader is None:
        return ""
    try:
        return format_location(reader.get(str(address)))
    except (ValueError, maxminddb.InvalidDatabaseError):
        return ""
