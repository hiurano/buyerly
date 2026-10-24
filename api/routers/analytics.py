"""Analytics Fact Store API endpoints.

Provides high-performance, workspace-isolated hierarchical drill-down
queries (Account -> Campaign -> AdSet -> Ad) directly from the Analytics Fact Store.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.auth import get_current_user
from api.deps import get_user_accounts, get_user_workspace
from database.db import async_session_maker
from database.models import User
from services.analytics_store import AnalyticsFactService, HierarchyParentNotFound

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics Fact Store"])

# Campaigns asks for every account it lists in one request; a workspace holds far fewer.
MAX_HIERARCHY_ACCOUNTS = 500


def _hierarchy_response(
    parent_id: str,
    level: str,
    period: str,
    items: List[Dict[str, Any]],
    comparison: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    freshness_values = [
        str(item["data_as_of"])
        for item in items
        if item.get("data_as_of")
    ]
    return {
        "parent_id": parent_id,
        "level": level,
        "period": period,
        "source": "analytics_fact_store",
        # The oldest per-entity timestamp is the conservative freshness of the
        # whole result set: every visible row is at least this fresh.
        "data_as_of": min(freshness_values) if freshness_values else None,
        "comparison": comparison or _no_comparison(),
        "total": len(items),
        "items": items,
    }


def _no_comparison(requested: bool = False) -> Dict[str, Any]:
    """The shape returned when no baseline was asked for or none could be built."""
    return {
        "requested": requested,
        "available": False,
        "dates": [],
        "reason": "",
        "current_includes_open_day": False,
    }


def _parent_not_found() -> HTTPException:
    """A parent this workspace does not hold; another workspace's looks the same."""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Ad account, campaign or ad set not found, or not available in the current workspace",
    )


@router.get("/hierarchy")
async def get_analytics_hierarchy(
    parent_id: str = Query(..., description="Meta ID of the parent entity (account_id, campaign_id, adset_id)"),
    level: str = Query("campaign", pattern="^(campaign|adset|ad)$", description="Breakdown level"),
    period: str = Query("today", pattern="^(today|yesterday|last_3d|last_7d)$", description="Reporting period"),
    compare: str = Query(
        "none",
        pattern="^(none|previous)$",
        description="Baseline to measure the period against: the equal-length window before it",
    ),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Retrieve normalized metrics breakdown for child entities under a parent hierarchy node.

    Strict multi-tenant security guarantees that data is only visible to authorized members
    of the owning workspace.
    """
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        ws_id = ws.id if ws else getattr(user, "active_workspace_id", None)
        if not ws_id:
            return _hierarchy_response(
                parent_id, level, period, [], _no_comparison(compare == "previous")
            )

        accounts = await get_user_accounts(session, user, workspace_id=ws_id)
        if not accounts:
            return _hierarchy_response(
                parent_id, level, period, [], _no_comparison(compare == "previous")
            )

        try:
            items, comparison = await AnalyticsFactService.get_hierarchy_breakdown(
                session=session,
                workspace_id=ws_id,
                parent_entity_id=parent_id,
                entity_level=level,
                period=period,
                user_accounts=accounts,
                compare=compare == "previous",
            )
        except HierarchyParentNotFound:
            raise _parent_not_found() from None

        return _hierarchy_response(parent_id, level, period, items, comparison)


@router.get("/hierarchy/accounts")
async def get_accounts_hierarchy(
    account_ids: Optional[str] = Query(
        None,
        max_length=20_000,
        description="Comma-separated Meta account IDs (act_…) whose rows to read; every account you can see when left out",
    ),
    period: str = Query("today", pattern="^(today|yesterday|last_3d|last_7d)$", description="Reporting period"),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Campaigns, ad sets and ads of several ad accounts in one request, as Campaigns lists them all at once.

    Each account's rows are what `/hierarchy` returns for that account at each
    level. An account the member cannot see, or that this workspace does not
    hold, comes back under `missing` and never hides the others. Without
    `account_ids` it reads every account the member can see, so Campaigns can
    ask for its rows at the same time as for the accounts themselves (#489).
    """
    wanted = (
        list(dict.fromkeys(part.strip() for part in account_ids.split(",") if part.strip()))
        if account_ids is not None
        else None
    )
    if wanted is not None and len(wanted) > MAX_HIERARCHY_ACCOUNTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"At most {MAX_HIERARCHY_ACCOUNTS} ad accounts per request",
        )
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        ws_id = ws.id if ws else getattr(user, "active_workspace_id", None)
        visible = (
            {account.account_id: account for account in await get_user_accounts(session, user, workspace_id=ws_id)}
            if ws_id
            else {}
        )
        if wanted is None:
            wanted = list(visible)[:MAX_HIERARCHY_ACCOUNTS]
        accounts = [visible[account_id] for account_id in wanted if account_id in visible]
        rows = await AnalyticsFactService.get_accounts_hierarchy(
            session, workspace_id=ws_id, accounts=accounts, period=period
        )

    return {
        "period": period,
        "source": "analytics_fact_store",
        "accounts": [
            {
                "account_id": account.account_id,
                "campaigns": rows[account.account_id]["campaign"],
                "adsets": rows[account.account_id]["adset"],
                "ads": rows[account.account_id]["ad"],
            }
            for account in accounts
        ],
        "missing": [account_id for account_id in wanted if account_id not in visible],
    }
