"""Recently deleted rules and rule groups.

Deleting a rule or a group removes the live row exactly as before, so the
worker and every list query keep reading only live data. What the deletion
removed is kept in `deleted_items` for `TRASH_RETENTION_DAYS`; a restore puts
the row back under its old id and re-links whatever still exists.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete

from database.models import DeletedItem, RuleGroup, RulePreset


TRASH_RETENTION_DAYS = 30
KIND_RULE = "rule"
KIND_RULE_GROUP = "rule_group"
TRASH_KINDS = (KIND_RULE, KIND_RULE_GROUP)

# Every stored column of a preset except its identity and bookkeeping.
PRESET_FIELDS = (
    "name",
    "action",
    "enabled",
    "level",
    "conditions",
    "condition_logic",
    "cooldown_minutes",
    "check_interval_minutes",
    "notify_tg",
    "budget_change_percent",
    "budget_max_daily",
    "owner_user_id",
)
GROUP_FIELDS = ("name", "description", "icon", "position", "owner_user_id")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def purge_at(deleted_at: datetime) -> datetime:
    """When a deleted item stops being restorable."""
    if deleted_at.tzinfo is None:
        deleted_at = deleted_at.replace(tzinfo=timezone.utc)
    return deleted_at + timedelta(days=TRASH_RETENTION_DAYS)


async def purge_expired(session, workspace_id: int, now: Optional[datetime] = None) -> None:
    """Drop everything past the retention window; there is no manual purge."""
    cutoff = (now or _now()) - timedelta(days=TRASH_RETENTION_DAYS)
    await session.execute(
        delete(DeletedItem).where(
            DeletedItem.workspace_id == workspace_id,
            DeletedItem.deleted_at < cutoff,
        )
    )


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def preset_snapshot(
    preset: RulePreset,
    group_items: List[Dict[str, int]],
    attachments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """What deleting a rule removes: the row, its memberships, its attachments."""
    return {
        "preset": {field: getattr(preset, field) for field in PRESET_FIELDS},
        "created_at": _iso(preset.created_at),
        "group_items": group_items,
        "attachments": attachments,
    }


def group_snapshot(group: RuleGroup, items: List[Dict[str, int]]) -> Dict[str, Any]:
    """What deleting a group removes. Its rules are not touched by the deletion."""
    return {
        "group": {field: getattr(group, field) for field in GROUP_FIELDS},
        "created_at": _iso(group.created_at),
        "items": items,
    }


def parse_created_at(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None
