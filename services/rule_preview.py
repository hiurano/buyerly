"""What a rule would check and act on if attached to a whole ad account (#200).

Attaching from the rules list covers every entity of the rule's level in the
ad account and turns the account's automation on. Before that click the buyer
sees which campaigns, ad sets or ads it will check and which of them match its
conditions on the latest synced numbers. Nothing here writes or calls Meta.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from core.metrics import normalize_rule_level
from core.timezones import resolve_account_clock
from database.models import Account, AnalyticsEntityFact
from rules.engine import RuleEngine
from services.analytics_store import _period_metrics

PREVIEW_ENTITY_LIMIT = 50
# Delivery states Meta keeps reporting for entities that will never run again.
GONE_STATUSES = {"DELETED", "ARCHIVED"}
# Meta's date presets the worker reads: everything but `today` ends yesterday.
WINDOW_DAYS = {"yesterday": 1, "last_3d": 3, "last_7d": 7}


def _window_dates(account: Account, now: datetime) -> Dict[str, List[str]]:
    clock = resolve_account_clock(account.timezone_name)
    local_today = (now.astimezone(clock.zone) if clock else now).date()
    windows = {"today": [local_today.isoformat()]}
    for window, days in WINDOW_DAYS.items():
        windows[window] = [
            (local_today - timedelta(days=offset)).isoformat()
            for offset in range(1, days + 1)
        ]
    return windows


def _sort_key(item: Dict[str, Any]):
    order = {"matched": 0, "not_met": 1, "inactive": 2}
    return (order.get(item["outcome"], 3), -item["spend"], item["entity_name"].lower())


async def preview_rule_on_account(
    session,
    account: Account,
    rule: Dict[str, Any],
    *,
    now_utc: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Entities the rule would check in this account, matched ones first."""
    try:
        level = normalize_rule_level(rule.get("level"))
    except ValueError:
        level = "adset"
    now = now_utc or datetime.now(timezone.utc)
    windows = _window_dates(account, now)
    all_dates = sorted({day for days in windows.values() for day in days})

    rows = (
        await session.execute(
            select(AnalyticsEntityFact).where(
                AnalyticsEntityFact.workspace_id == account.workspace_id,
                AnalyticsEntityFact.account_id == account.account_id,
                AnalyticsEntityFact.entity_level == level,
                AnalyticsEntityFact.date.in_(all_dates),
            )
        )
    ).scalars().all()
    facts_by_entity: Dict[str, List[AnalyticsEntityFact]] = {}
    for row in rows:
        facts_by_entity.setdefault(str(row.entity_id), []).append(row)

    # The engine skips an account whose automation is off; the preview asks
    # what happens once attaching turns it on.
    probe = SimpleNamespace(
        rules_enabled=True,
        workspace_id=account.workspace_id,
        currency=account.currency,
        active_rules=[rule],
    )
    # A paused rule is previewed as it will act once turned on.
    scoped_rule = {**rule, "enabled": True, "scope": {"level": "account", "ids": []}}
    items: List[Dict[str, Any]] = []
    latest_fetch: Optional[datetime] = None
    for entity_id, facts in facts_by_entity.items():
        facts.sort(key=lambda fact: fact.date)
        latest = facts[-1]
        status = str(latest.status or "UNKNOWN").upper()
        if status in GONE_STATUSES:
            continue
        if latest.fetched_at and (latest_fetch is None or latest.fetched_at > latest_fetch):
            latest_fetch = latest.fetched_at
        insights = {
            window: _period_metrics([fact for fact in facts if fact.date in set(days)])
            for window, days in windows.items()
        }
        entity = {
            **insights["today"],
            "entity_level": level,
            "entity_id": entity_id,
            "entity_name": latest.entity_name or entity_id,
            "status": status,
            "effective_status": str(latest.effective_status or status).upper(),
        }
        checks = RuleEngine.check(
            entity,
            probe,
            insights_by_window=insights,
            active_rules_override=[scoped_rule],
        )
        check = checks[0] if checks else None
        items.append({
            "entity_id": entity_id,
            "entity_name": entity["entity_name"],
            "status": status,
            "spend": float(insights["today"]["spend"]),
            "outcome": check.outcome if check else "not_met",
            "detail": check.detail if check else "",
        })

    items.sort(key=_sort_key)
    return {
        "account_id": account.account_id,
        "account_name": account.name or account.account_id,
        "level": level,
        "rule_name": str(rule.get("name") or ""),
        "action": str(rule.get("action") or ""),
        "rules_enabled": bool(account.rules_enabled),
        "total": len(items),
        "running": sum(1 for item in items if item["status"] == "ACTIVE"),
        "matching": sum(1 for item in items if item["outcome"] == "matched"),
        "data_as_of": latest_fetch.astimezone(timezone.utc).isoformat() if latest_fetch else None,
        "entities": items[:PREVIEW_ENTITY_LIMIT],
    }
