"""Analytics Fact Store API endpoints.

Provides high-performance, workspace-isolated hierarchical drill-down
queries (Account -> Campaign -> AdSet -> Ad) directly from the Analytics Fact Store.
"""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.auth import get_current_user
from api.deps import get_user_accounts, get_user_workspace
from database.db import async_session_maker
from database.models import User
from services.analytics_store import AnalyticsFactService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics Fact Store"])


def _hierarchy_response(
    parent_id: str,
    level: str,
    period: str,
    items: List[Dict[str, Any]],
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
        "total": len(items),
        "items": items,
    }


@router.get("/hierarchy")
async def get_analytics_hierarchy(
    parent_id: str = Query(..., description="Meta ID of the parent entity (account_id, campaign_id, adset_id)"),
    level: str = Query("campaign", pattern="^(campaign|adset|ad)$", description="Breakdown level"),
    period: str = Query("today", pattern="^(today|yesterday|last_3d|last_7d)$", description="Reporting period"),
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
            return _hierarchy_response(parent_id, level, period, [])

        accounts = await get_user_accounts(session, user, workspace_id=ws_id)
        if not accounts:
            return _hierarchy_response(parent_id, level, period, [])

        # Account-wide hierarchy views are available only for accounts in the
        # active workspace. Direct campaign/ad set parents remain protected by
        # the workspace filter in the fact store.
        if level == "campaign" or parent_id.startswith("act_"):
            acc_id = parent_id if parent_id.startswith("act_") else f"act_{parent_id}"
            user_acc_ids = {a.account_id for a in accounts}
            if acc_id not in user_acc_ids and parent_id not in user_acc_ids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Ad account not found, or not available in the current workspace",
                )

        items = await AnalyticsFactService.get_hierarchy_breakdown(
            session=session,
            workspace_id=ws_id,
            parent_entity_id=parent_id,
            entity_level=level,
            period=period,
            user_accounts=accounts,
        )

        return _hierarchy_response(parent_id, level, period, items)
