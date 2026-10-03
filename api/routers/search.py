"""Workspace search behind the command menu (/ and Ctrl/Cmd+K).

The menu promises what this endpoint searches and nothing more: campaigns, ad
sets and ads of today's synced inventory, rules and ad accounts, all of the
workspace in the address. Ads Manager reads the same inventory, so every
result opens on a screen that shows it.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, or_, select

from api.auth import get_current_user
from api.deps import _preset_snapshot, get_user_accounts, get_user_workspace
from api.schemas import SearchResponse, SearchResultItem
from database.db import async_session_maker
from database.models import Account, AnalyticsEntityFact, RulePreset, User
from services.analytics_store import resolve_account_period_dates

router = APIRouter(tags=["Search"])

DEFAULT_SEARCH_LIMIT = 5
MAX_SEARCH_LIMIT = 20
MAX_QUERY_LENGTH = 200
ENTITY_LEVELS = ("campaign", "adset", "ad")


def _literal_like(text: str) -> str:
    """The query as LIKE text: a `%` or `_` in a name is a character, not a wildcard."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _name_rank(column, text: str):
    """0 for the name itself, 1 for a name that starts with the query, 2 for one containing it."""
    return case(
        (func.lower(column) == func.lower(text), 0),
        (column.ilike(f"{_literal_like(text)}%", escape="\\"), 1),
        else_=2,
    )


def _contains(column, text: str):
    return column.ilike(f"%{_literal_like(text)}%", escape="\\")


def _account_name(account: Account) -> str:
    return (account.custom_name or "").strip() or (account.name or "").strip() or account.account_id


def _account_rank(account: Account, folded: str) -> Optional[int]:
    """How well an ad account matches: its ID exactly, then its names as for entities."""
    account_id = account.account_id.casefold()
    if folded in (account_id, account_id.removeprefix("act_")):
        return 0
    ranks = []
    for name in ((account.custom_name or "").strip(), (account.name or "").strip()):
        candidate = name.casefold()
        if not candidate or folded not in candidate:
            continue
        ranks.append(0 if candidate == folded else 1 if candidate.startswith(folded) else 2)
    return min(ranks) if ranks else None


def _rule_status(preset: RulePreset) -> str:
    # The runtime snapshot decides whether a rule may run, as on the Rules screen.
    snapshot = _preset_snapshot(preset)
    if snapshot.get("needs_review"):
        return "needs_review"
    return "active" if snapshot.get("enabled", True) else "paused"


async def _inventory_matches(
    session,
    workspace_id: int,
    accounts: List[Account],
    text: str,
    limit: int,
    now: datetime,
) -> Tuple[List[SearchResultItem], List[str]]:
    """Campaigns, ad sets and ads stored for each ad account's local today."""
    accounts_by_day: Dict[str, List[str]] = {}
    for account in accounts:
        day = resolve_account_period_dates(account.timezone_name, "today", now)[0]
        accounts_by_day.setdefault(day, []).append(account.account_id)
    if not accounts_by_day:
        return [], []
    todays_inventory = or_(
        *(
            and_(AnalyticsEntityFact.date == day, AnalyticsEntityFact.account_id.in_(ids))
            for day, ids in accounts_by_day.items()
        )
    )
    in_workspace = and_(AnalyticsEntityFact.workspace_id == workspace_id, todays_inventory)
    rank = case(
        (AnalyticsEntityFact.entity_id == text, 0),
        else_=_name_rank(AnalyticsEntityFact.entity_name, text),
    )

    found: List[Tuple[str, Any]] = []
    truncated: List[str] = []
    for level in ENTITY_LEVELS:
        rows = (
            await session.execute(
                select(
                    AnalyticsEntityFact.entity_id,
                    AnalyticsEntityFact.entity_name,
                    AnalyticsEntityFact.account_id,
                    AnalyticsEntityFact.parent_entity_id,
                    AnalyticsEntityFact.effective_status,
                )
                .where(
                    in_workspace,
                    AnalyticsEntityFact.entity_level == level,
                    or_(
                        AnalyticsEntityFact.entity_id == text,
                        _contains(AnalyticsEntityFact.entity_name, text),
                    ),
                )
                .order_by(
                    rank,
                    func.lower(AnalyticsEntityFact.entity_name),
                    AnalyticsEntityFact.entity_id,
                )
                .limit(limit + 1)
            )
        ).all()
        if len(rows) > limit:
            truncated.append(level)
        found.extend((level, row) for row in rows[:limit])

    # An ad set names its campaign and an ad its ad set, from the same inventory.
    parent_ids = {row.parent_entity_id for level, row in found if level != "campaign" and row.parent_entity_id}
    parent_names: Dict[str, str] = {}
    if parent_ids:
        parent_rows = (
            await session.execute(
                select(AnalyticsEntityFact.entity_id, AnalyticsEntityFact.entity_name).where(
                    in_workspace,
                    AnalyticsEntityFact.entity_level.in_(("campaign", "adset")),
                    AnalyticsEntityFact.entity_id.in_(parent_ids),
                )
            )
        ).all()
        parent_names = {row.entity_id: row.entity_name for row in parent_rows}

    names = {account.account_id: _account_name(account) for account in accounts}
    results = [
        SearchResultItem(
            kind=level,
            id=row.entity_id,
            name=row.entity_name or row.entity_id,
            account_id=row.account_id,
            account_name=names.get(row.account_id, row.account_id),
            parent_name="" if level == "campaign" else parent_names.get(row.parent_entity_id, ""),
            status=row.effective_status or "",
        )
        for level, row in found
    ]
    return results, truncated


async def _rule_matches(session, workspace_id: int, text: str, limit: int):
    presets = (
        await session.execute(
            select(RulePreset)
            .where(RulePreset.workspace_id == workspace_id, _contains(RulePreset.name, text))
            .order_by(_name_rank(RulePreset.name, text), func.lower(RulePreset.name), RulePreset.id)
            .limit(limit + 1)
        )
    ).scalars().all()
    results = [
        SearchResultItem(kind="rule", id=str(preset.id), name=preset.name, status=_rule_status(preset))
        for preset in presets[:limit]
    ]
    return results, ["rule"] if len(presets) > limit else []


def _account_matches(accounts: List[Account], text: str, limit: int):
    folded = text.casefold()
    ranked = []
    for account in accounts:
        rank = _account_rank(account, folded)
        if rank is not None:
            ranked.append((rank, _account_name(account).casefold(), account.account_id, account))
    ranked.sort(key=lambda item: item[:3])
    results = [
        SearchResultItem(
            kind="account",
            id=account.account_id,
            name=_account_name(account),
            account_id=account.account_id,
        )
        for _, _, _, account in ranked[:limit]
    ]
    return results, ["account"] if len(ranked) > limit else []


@router.get("/search", response_model=SearchResponse)
async def search_workspace(
    q: str = Query(..., max_length=MAX_QUERY_LENGTH, description="Name or Meta ID to look for"),
    limit: int = Query(DEFAULT_SEARCH_LIMIT, ge=1, le=MAX_SEARCH_LIMIT, description="Results per kind"),
    user: User = Depends(get_current_user),
) -> SearchResponse:
    """Find campaigns, ad sets, ads, rules and ad accounts of the current workspace."""
    text = q.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Type something to search for.")
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        # Only ad accounts Ads Manager can open, so a result never leads nowhere.
        accounts = [
            account
            for account in await get_user_accounts(session, user, workspace_id=ws.id)
            if account.is_active
        ]
        entities, entities_truncated = await _inventory_matches(
            session, ws.id, accounts, text, limit, datetime.now(timezone.utc)
        )
        rules, rules_truncated = await _rule_matches(session, ws.id, text, limit)
        found_accounts, accounts_truncated = _account_matches(accounts, text, limit)
    return SearchResponse(
        query=text,
        limit=limit,
        results=entities + rules + found_accounts,
        truncated=entities_truncated + rules_truncated + accounts_truncated,
    )
