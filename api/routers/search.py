"""Workspace search behind the search page (/ and the sidebar's Search button).

The page promises what this endpoint searches and nothing more: campaigns, ad
sets and ads of today's synced inventory, rules and ad accounts, all of the
workspace in the address. Ads Manager reads the same inventory, so every
result opens on a screen that shows it.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, not_, or_, select
from sqlalchemy.orm import aliased

from api.auth import get_current_user
from api.deps import _preset_snapshot, get_user_accounts, get_user_workspace
from api.schemas import SearchResponse, SearchResultItem
from api.schemas.search import SearchKind, SearchOrder, SearchStatus
from database.db import async_session_maker
from database.models import Account, AnalyticsEntityFact, RulePreset, User
from services.analytics_store import resolve_account_period_dates

router = APIRouter(tags=["Search"])

DEFAULT_SEARCH_LIMIT = 5
MAX_SEARCH_LIMIT = 20
MAX_QUERY_LENGTH = 200
ENTITY_LEVELS = ("campaign", "adset", "ad")
KIND_ORDER: Tuple[str, ...] = ("campaign", "adset", "ad", "rule", "account")
# Gone from delivery for good: found only with Include deleted, as Linear finds archived issues.
DELETED_META_STATUSES = ("DELETED", "ARCHIVED")
RULE_STATUS_GROUPS = {"active": "active", "paused": "paused", "needs_review": "other"}

# A result with its match rank: 0 the name itself, 1 a name starting with the query, 2 one containing it.
Ranked = Tuple[int, SearchResultItem]


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


def _text_rank(name: str, folded: str) -> int:
    """`_name_rank` for a name already in hand."""
    candidate = name.casefold()
    return 0 if candidate == folded else 1 if candidate.startswith(folded) else 2


def _contains(column, text: str):
    return column.ilike(f"%{_literal_like(text)}%", escape="\\")


def _meta_status_is(group: str):
    """Meta's effective status in the page's words, told apart as Ads Manager tells them."""
    status = AnalyticsEntityFact.effective_status
    paused = or_(status == "PAUSED", status.like("%\\_PAUSED", escape="\\"))
    if group == "active":
        return status == "ACTIVE"
    if group == "paused":
        return paused
    return and_(status != "ACTIVE", not_(paused))


def _account_name(account: Account) -> str:
    return (account.custom_name or "").strip() or (account.name or "").strip() or account.account_id


def _account_rank(account: Account, folded: str) -> Optional[int]:
    """How well an ad account matches: its ID exactly, then its names as for entities."""
    account_id = account.account_id.casefold()
    if folded in (account_id, account_id.removeprefix("act_")):
        return 0
    ranks = []
    for name in ((account.custom_name or "").strip(), (account.name or "").strip()):
        if name and folded in name.casefold():
            ranks.append(_text_rank(name, folded))
    return min(ranks) if ranks else None


def _rule_status(preset: RulePreset) -> str:
    # The runtime snapshot decides whether a rule may run, as on the Rules screen.
    snapshot = _preset_snapshot(preset)
    if snapshot.get("needs_review"):
        return "needs_review"
    return "active" if snapshot.get("enabled", True) else "paused"


def _newest_first(item: SearchResultItem) -> float:
    return -item.updated_at.timestamp() if item.updated_at else float("inf")


async def _inventory_matches(
    session,
    workspace_id: int,
    accounts: List[Account],
    levels: Sequence[str],
    text: str,
    limit: int,
    now: datetime,
    statuses: Sequence[str],
    include_deleted: bool,
    order: str,
) -> Tuple[List[Ranked], List[str]]:
    """Campaigns, ad sets and ads stored for each ad account's local today."""
    accounts_by_day: Dict[str, List[str]] = {}
    for account in accounts:
        day = resolve_account_period_dates(account.timezone_name, "today", now)[0]
        accounts_by_day.setdefault(day, []).append(account.account_id)
    if not accounts_by_day or not levels:
        return [], []
    account_ids = [account.account_id for account in accounts]
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
    filters = []
    if statuses:
        filters.append(or_(*(_meta_status_is(group) for group in statuses)))
    if not include_deleted:
        filters.append(AnalyticsEntityFact.effective_status.notin_(DELETED_META_STATUSES))

    found: List[Tuple[str, Any]] = []
    truncated: List[str] = []
    for level in levels:
        # The first day Buyerly synced each match: its age on the page and the "Last updated" order.
        seen = aliased(AnalyticsEntityFact)
        candidate = aliased(AnalyticsEntityFact)
        first_seen = (
            select(seen.entity_id, func.min(seen.date).label("first_seen"))
            .where(
                seen.workspace_id == workspace_id,
                seen.entity_level == level,
                seen.account_id.in_(account_ids),
                seen.entity_id.in_(
                    select(candidate.entity_id).where(
                        candidate.workspace_id == workspace_id,
                        candidate.entity_level == level,
                        or_(candidate.entity_id == text, _contains(candidate.entity_name, text)),
                    )
                ),
            )
            .group_by(seen.entity_id)
            .subquery()
        )
        ordering = [rank, func.lower(AnalyticsEntityFact.entity_name), AnalyticsEntityFact.entity_id]
        if order == "updated":
            ordering.insert(0, first_seen.c.first_seen.desc())
        rows = (
            await session.execute(
                select(
                    AnalyticsEntityFact.entity_id,
                    AnalyticsEntityFact.entity_name,
                    AnalyticsEntityFact.account_id,
                    AnalyticsEntityFact.parent_entity_id,
                    AnalyticsEntityFact.effective_status,
                    rank.label("rank"),
                    first_seen.c.first_seen,
                )
                .join(first_seen, first_seen.c.entity_id == AnalyticsEntityFact.entity_id)
                .where(
                    in_workspace,
                    AnalyticsEntityFact.entity_level == level,
                    or_(
                        AnalyticsEntityFact.entity_id == text,
                        _contains(AnalyticsEntityFact.entity_name, text),
                    ),
                    *filters,
                )
                .order_by(*ordering)
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
        (
            int(row.rank),
            SearchResultItem(
                kind=level,
                id=row.entity_id,
                name=row.entity_name or row.entity_id,
                account_id=row.account_id,
                account_name=names.get(row.account_id, row.account_id),
                parent_name="" if level == "campaign" else parent_names.get(row.parent_entity_id, ""),
                status=row.effective_status or "",
                updated_at=datetime.fromisoformat(row.first_seen).replace(tzinfo=timezone.utc),
            ),
        )
        for level, row in found
    ]
    return results, truncated


async def _rule_matches(
    session,
    workspace_id: int,
    text: str,
    limit: int,
    statuses: Sequence[str],
    order: str,
) -> Tuple[List[Ranked], List[str]]:
    # The status comes from the runtime snapshot, so it is filtered here; a workspace has few rules.
    presets = (
        await session.execute(
            select(RulePreset)
            .where(RulePreset.workspace_id == workspace_id, _contains(RulePreset.name, text))
            .order_by(_name_rank(RulePreset.name, text), func.lower(RulePreset.name), RulePreset.id)
        )
    ).scalars().all()
    folded = text.casefold()
    ranked: List[Ranked] = []
    for preset in presets:
        status = _rule_status(preset)
        if statuses and RULE_STATUS_GROUPS[status] not in statuses:
            continue
        ranked.append((
            _text_rank(preset.name, folded),
            SearchResultItem(kind="rule", id=str(preset.id), name=preset.name, status=status, updated_at=preset.updated_at),
        ))
    if order == "updated":
        ranked.sort(key=lambda item: _newest_first(item[1]))
    return ranked[:limit], ["rule"] if len(ranked) > limit else []


def _account_matches(accounts: List[Account], text: str, limit: int, order: str) -> Tuple[List[Ranked], List[str]]:
    folded = text.casefold()
    ranked: List[Ranked] = []
    for account in accounts:
        rank = _account_rank(account, folded)
        if rank is not None:
            ranked.append((
                rank,
                SearchResultItem(
                    kind="account",
                    id=account.account_id,
                    name=_account_name(account),
                    account_id=account.account_id,
                    updated_at=account.created_at,
                ),
            ))
    ranked.sort(key=lambda item: (item[0], item[1].name.casefold(), item[1].id))
    if order == "updated":
        ranked.sort(key=lambda item: _newest_first(item[1]))
    return ranked[:limit], ["account"] if len(ranked) > limit else []


@router.get("/search", response_model=SearchResponse)
async def search_workspace(
    q: str = Query(..., max_length=MAX_QUERY_LENGTH, description="Name or Meta ID to look for"),
    limit: int = Query(DEFAULT_SEARCH_LIMIT, ge=1, le=MAX_SEARCH_LIMIT, description="Results per kind"),
    kind: Optional[SearchKind] = Query(None, description="Only this kind; every kind when left out"),
    status: List[SearchStatus] = Query([], description="Only these states; ad accounts have none"),
    account: List[str] = Query([], description="Only these ad accounts' records; rules belong to none"),
    order: SearchOrder = Query("relevance", description="Best match first, or newest first"),
    include_deleted: bool = Query(False, description="Also campaigns, ad sets and ads deleted or archived in Meta"),
    user: User = Depends(get_current_user),
) -> SearchResponse:
    """Find campaigns, ad sets, ads, rules and ad accounts of the current workspace."""
    text = q.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Type something to search for.")
    kinds = [kind] if kind else list(KIND_ORDER)
    # A filter a kind has no answer to leaves that kind out.
    if account:
        kinds = [candidate for candidate in kinds if candidate != "rule"]
    if status:
        kinds = [candidate for candidate in kinds if candidate != "account"]
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        # Only ad accounts Ads Manager can open, so a result never leads nowhere.
        accounts = [
            candidate
            for candidate in await get_user_accounts(session, user, workspace_id=ws.id)
            if candidate.is_active and (not account or candidate.account_id in account)
        ]
        entities, entities_truncated = await _inventory_matches(
            session,
            ws.id,
            accounts,
            [level for level in ENTITY_LEVELS if level in kinds],
            text,
            limit,
            datetime.now(timezone.utc),
            status,
            include_deleted,
            order,
        )
        rules, rules_truncated = (
            await _rule_matches(session, ws.id, text, limit, status, order) if "rule" in kinds else ([], [])
        )
    found_accounts, accounts_truncated = (
        _account_matches(accounts, text, limit, order) if "account" in kinds else ([], [])
    )
    # One flat list, as on Linear's search page. Sorts are stable: each kind keeps
    # its own order, and kinds keep their fixed order among equals.
    ranked = entities + rules + found_accounts
    if order == "updated":
        ranked.sort(key=lambda item: _newest_first(item[1]))
    else:
        ranked.sort(key=lambda item: item[0])
    return SearchResponse(
        query=text,
        limit=limit,
        results=[item for _, item in ranked],
        truncated=entities_truncated + rules_truncated + accounts_truncated,
    )
