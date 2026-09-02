"""Canonical, deterministic workspace URL slug rules."""

import re
import unicodedata


MAX_WORKSPACE_SLUG_LENGTH = 60
RESERVED_WORKSPACE_SLUGS = frozenset(
    {
        "api",
        "admin",
        "app",
        "auth",
        "w",
        "static",
        "uploads",
        "health",
        "docs",
        "redoc",
        "openapi",
        "openapi-json",
        "settings",
        "terms",
        "privacy",
        "data-deletion",
        "onboarding",
        "create-workspace",
        "welcome",
        "workspace",
        "login",
        "sign-in",
        "sign-up",
        "signup",
        "register",
        "dashboard",
        "home",
        "today",
        "main",
        "efficiency",
        "automations",
        "action-history",
        "connections",
        "accounts",
        "facebook-accounts",
        "facebook-groups",
        "groups",
        "lists",
        "collection",
        "rule-groups",
        "add-accounts",
        "add",
        "rules",
        "chats",
        "summary",
        "logs",
        "invite",
        "invites",
        "null",
        "undefined",
    }
)

# Revision 0011 imported these helpers instead of carrying its own snapshot.
# Keep its original reservation set stable while the live router evolves.
_MIGRATION_0011_RESERVED_WORKSPACE_SLUGS = frozenset(
    {
        "api", "admin", "app", "auth", "static", "uploads", "health",
        "docs", "redoc", "openapi", "openapi-json", "settings", "terms",
        "privacy", "data-deletion", "onboarding", "login", "sign-in",
        "dashboard", "home", "accounts", "facebook-accounts",
        "facebook-groups", "groups", "lists", "collection", "rule-groups",
        "add-accounts", "rules", "chats", "summary", "logs", "invite",
        "invites", "null", "undefined",
    }
)

_CYRILLIC_TRANSLITERATION = str.maketrans(
    {
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "g",
        "д": "d",
        "е": "e",
        "ё": "e",
        "ж": "zh",
        "з": "z",
        "и": "i",
        "й": "y",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "х": "kh",
        "ц": "ts",
        "ч": "ch",
        "ш": "sh",
        "щ": "shch",
        "ъ": "",
        "ы": "y",
        "ь": "",
        "э": "e",
        "ю": "yu",
        "я": "ya",
    }
)


def _stable_fallback_hash(value: str) -> str:
    hash_value = 0x811C9DC5
    for byte in value.encode("utf-8"):
        hash_value ^= byte
        hash_value = (hash_value * 0x01000193) & 0xFFFFFFFF
    return f"{hash_value:08x}"


def normalize_workspace_slug(value: str) -> str:
    """Return the same bounded ASCII slug for the same input on every host."""
    normalized = unicodedata.normalize("NFKC", value or "").strip().lower()
    transliterated = normalized.translate(_CYRILLIC_TRANSLITERATION)
    ascii_text = unicodedata.normalize("NFKD", transliterated).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    slug = slug[:MAX_WORKSPACE_SLUG_LENGTH].rstrip("-")
    if slug:
        return slug
    if normalized:
        return f"workspace-{_stable_fallback_hash(normalized)}"
    return "workspace"


def reservation_safe_workspace_slug(value: str) -> str:
    """Migration-only helper retained for revision 0011 reproducibility."""
    slug = normalize_workspace_slug(value)
    if slug not in _MIGRATION_0011_RESERVED_WORKSPACE_SLUGS:
        return slug
    suffix = "-workspace"
    return f"{slug[: MAX_WORKSPACE_SLUG_LENGTH - len(suffix)].rstrip('-')}{suffix}"


def numbered_workspace_slug(base: str, number: int) -> str:
    """Migration-only helper retained for revision 0011 reproducibility."""
    if number < 2:
        return base[:MAX_WORKSPACE_SLUG_LENGTH].rstrip("-")
    suffix = f"-{number}"
    prefix = base[: MAX_WORKSPACE_SLUG_LENGTH - len(suffix)].rstrip("-")
    return f"{prefix}{suffix}"
