"""Manual delivery and budget actions on one Meta entity.

These are the product's first writes into Meta from the web application, so each
one reads the live state first, records what it attempted whether it succeeded or
not, and leaves behind an audit row the existing undo endpoint can reverse.
"""

import logging
import time
import uuid
from typing import Any, Dict, Tuple

from fastapi import APIRouter, Depends, HTTPException, Path

from api.auth import get_current_user
from api.deps import (
    ensure_workspace_write_access,
    get_user_workspace_member,
    invalidate_summary_cache,
    load_writable_account,
)
from api.schemas import EntityBudgetRequest, EntityDeliveryRequest
from core.audit import build_audit_event
from core.currency import normalize_currency, from_meta_budget_units, to_meta_budget_units
from core.meta_tokens import resolve_account_access_token
from database.db import async_session_maker
from database.models import Account, User
from meta_api.client import MetaClient
from services.inventory_cache import AdsetInventoryService, PostgreSQLInventoryCache

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Delivery actions"])
meta_client = MetaClient(cache_provider=PostgreSQLInventoryCache())

ENTITY_NOUNS = {"campaign": "campaign", "adset": "ad set", "ad": "ad"}
# A budget that differs by less than a cent of the account currency is the same
# budget; this mirrors the tolerance the undo contract already uses.
BUDGET_EPSILON = 0.011


def _record(
    session,
    *,
    account: Account,
    event_type: str,
    status: str,
    action: str,
    message: str,
    before_state: Dict[str, Any],
    after_state: Dict[str, Any],
    started: float,
    user: User,
    entity_level: str,
    entity_id: str,
    entity_name: str,
    existing=None,
):
    """Add one audit row for an attempted manual action and return it.

    The row carries the entity it acted on and both states, because that is what
    `core.action_undo` reads when the user asks to reverse it.
    """
    event = build_audit_event(
        account=account,
        event_type=event_type,
        status=status,
        correlation_id=uuid.uuid4().hex,
        category="MANUAL_ACTION",
        action=action,
        message=message,
        before_state=before_state,
        after_state=after_state,
        duration_ms=(time.perf_counter() - started) * 1000,
        actor_type="user",
        actor_id=user.telegram_id,
        entity_level=entity_level,
        entity_id=entity_id,
        entity_name=entity_name,
        # Ad set actions keep filling the legacy columns the older history uses.
        adset_id=entity_id if entity_level == "adset" else "",
        adset_name=entity_name if entity_level == "adset" else "",
    )
    if existing is not None:
        for field in ("status", "message", "before_state", "after_state", "duration_ms"):
            setattr(existing, field, getattr(event, field))
        return existing
    session.add(event)
    return event


async def _commit_quietly(session, what: str) -> bool:
    try:
        await session.commit()
        return True
    except Exception as error:
        await session.rollback()
        logger.error("Failed to persist %s", what)
        return False


async def _prepare(
    session,
    user: User,
    level: str,
    entity_id: str,
    account_id: str,
    action: str,
    description: str,
) -> Tuple[Account, str, Dict[str, Any]]:
    """Authorize the action and read the entity's live state from Meta.

    The state is read rather than taken from the request so the audit records
    what Meta reported immediately before the write.
    """
    ws, member = await get_user_workspace_member(session, user)
    ensure_workspace_write_access(user, member, description)
    account = await load_writable_account(session, user, ws, account_id, action)

    access_token = await resolve_account_access_token(session, account)
    try:
        state = await meta_client.get_entity_state(
            entity_id,
            access_token,
            entity_level=level,
            currency=normalize_currency(account.currency),
        )
    except Exception as error:
        logger.error(
            "Could not read %s %s before a manual action; details in audit history",
            level,
            entity_id,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Meta did not return the current state of this {ENTITY_NOUNS[level]}. Nothing was changed.",
        ) from error
    entity_account = str(state.get("account_id") or "").removeprefix("act_")
    if not entity_account or entity_account != account.account_id.removeprefix("act_"):
        raise HTTPException(status_code=404, detail="Entity not found in this ad account.")
    return account, access_token, state


def _after_commit_cleanup(account: Account) -> None:
    if account.workspace_id or account.owner_user_id:
        invalidate_summary_cache(
            workspace_id=account.workspace_id,
            owner_user_id=account.owner_user_id,
        )


@router.post("/entities/{level}/{entity_id}/delivery")
async def set_entity_delivery(
    payload: EntityDeliveryRequest,
    level: str = Path(..., pattern="^(campaign|adset|ad)$"),
    entity_id: str = Path(..., min_length=1, max_length=64),
    user: User = Depends(get_current_user),
):
    """Turn one campaign, ad set or ad on or off.

    An entity already in the requested state is reported as unchanged rather
    than written twice, so the history records changes and nothing else.
    """
    noun = ENTITY_NOUNS[level]
    async with async_session_maker() as session:
        account, access_token, state = await _prepare(
            session,
            user,
            level,
            entity_id,
            payload.account_id,
            "SET_ENTITY_DELIVERY",
            f"turning a {noun} on or off",
        )
        current_status = str(state.get("status") or "UNKNOWN").upper()
        entity_name = str(state.get("entity_name") or state.get("adset_name") or "")
        if current_status not in {"ACTIVE", "PAUSED"}:
            raise HTTPException(status_code=409, detail="This entity cannot be toggled in its current state.")
        if current_status == payload.status:
            return {
                "entity_id": entity_id,
                "level": level,
                "status": current_status,
                "changed": False,
                "audit_event_id": None,
                "message": f"This {noun} is already {payload.status.lower()}.",
            }

        event_type = "MANUAL_PAUSE" if payload.status == "PAUSED" else "MANUAL_REACTIVATE"
        before_state = {"status": current_status}
        started = time.perf_counter()
        attempt = _record(
            session, account=account, event_type=event_type, status="PENDING",
            action="SET_ENTITY_DELIVERY", message="Manual action awaiting Meta confirmation.",
            before_state=before_state, after_state={"status": payload.status},
            started=started, user=user, entity_level=level,
            entity_id=entity_id, entity_name=entity_name,
        )
        if not await _commit_quietly(session, "manual action intent"):
            raise HTTPException(status_code=503, detail="History is unavailable. Nothing was sent to Meta.")
        attempt_id = attempt.id
        try:
            await meta_client.set_entity_status(
                entity_id,
                access_token,
                payload.status,
                entity_level=level,
                account_id=account.account_id,
            )
        except Exception as error:
            logger.error(
                "Meta refused a manual delivery change on %s %s; details in audit history",
                level,
                entity_id,
            )
            _record(
                session,
                existing=attempt,
                account=account,
                event_type=event_type,
                status="ERROR",
                action="SET_ENTITY_DELIVERY",
                message="Meta could not confirm the change; verify its current state before retrying.",
                before_state=before_state,
                after_state=before_state,
                started=started,
                user=user,
                entity_level=level,
                entity_id=entity_id,
                entity_name=entity_name,
            )
            await _commit_quietly(session, "manual delivery error")
            raise HTTPException(
                status_code=502,
                detail=f"Meta could not change this {noun}. Check its current state before retrying.",
            ) from error

        if level == "adset":
            await AdsetInventoryService.update_adset_status(
                session, account.account_id, entity_id, payload.status
            )
        _after_commit_cleanup(account)

        _record(
            session,
            existing=attempt,
            account=account,
            event_type=event_type,
            status="SUCCESS",
            action="SET_ENTITY_DELIVERY",
            message=f"{noun.capitalize()} turned {'off' if payload.status == 'PAUSED' else 'on'} manually.",
            before_state=before_state,
            after_state={"status": payload.status},
            started=started,
            user=user,
            entity_level=level,
            entity_id=entity_id,
            entity_name=entity_name,
        )
        saved = await _commit_quietly(session, "manual delivery result")
        return {
            "entity_id": entity_id,
            "level": level,
            "status": payload.status,
            "changed": True,
            "audit_event_id": attempt_id if saved else None,
            "message": (f"{noun.capitalize()} turned {'off' if payload.status == 'PAUSED' else 'on'}."
                        if saved else "Meta applied the change, but history confirmation failed. Undo is unavailable."),
        }


@router.patch("/entities/{level}/{entity_id}/budget")
async def set_entity_budget(
    payload: EntityBudgetRequest,
    level: str = Path(..., pattern="^(campaign|adset|ad)$"),
    entity_id: str = Path(..., min_length=1, max_length=64),
    user: User = Depends(get_current_user),
):
    """Change the daily budget of the entity that holds it.

    A budget is only ever moved, never created: an entity reporting no budget
    keeps it on the other level of the hierarchy, and writing one here would
    change how the campaign is optimized rather than how much it spends.
    """
    if level == "ad":
        raise HTTPException(status_code=400, detail="An ad has no budget of its own.")

    noun = ENTITY_NOUNS[level]
    async with async_session_maker() as session:
        account, access_token, state = await _prepare(
            session,
            user,
            level,
            entity_id,
            payload.account_id,
            "SET_ENTITY_BUDGET",
            f"changing a {noun} budget",
        )
        entity_name = str(state.get("entity_name") or state.get("adset_name") or "")
        try:
            current_budget = float(state.get("daily_budget") or 0.0)
        except (TypeError, ValueError):
            current_budget = 0.0

        if current_budget < 1.0:
            other = "its ad sets" if level == "campaign" else "its campaign"
            raise HTTPException(
                status_code=409,
                detail=f"This {noun} carries no daily budget; the budget is held by {other}.",
            )
        try:
            payload.daily_budget = from_meta_budget_units(
                to_meta_budget_units(payload.daily_budget, account.currency), account.currency
            )
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        if abs(current_budget - payload.daily_budget) <= BUDGET_EPSILON:
            return {
                "entity_id": entity_id,
                "level": level,
                "daily_budget": current_budget,
                "changed": False,
                "audit_event_id": None,
                "message": "The daily budget is already set to this amount.",
            }

        event_type = (
            "INCREASE_BUDGET" if payload.daily_budget > current_budget else "DECREASE_BUDGET"
        )
        before_state = {"daily_budget": current_budget, "status": state.get("status")}
        after_state = {"daily_budget": payload.daily_budget, "status": state.get("status")}
        started = time.perf_counter()
        attempt = _record(
            session, account=account, event_type=event_type, status="PENDING",
            action="SET_ENTITY_BUDGET", message="Manual action awaiting Meta confirmation.",
            before_state=before_state, after_state=after_state,
            started=started, user=user, entity_level=level,
            entity_id=entity_id, entity_name=entity_name,
        )
        if not await _commit_quietly(session, "manual action intent"):
            raise HTTPException(status_code=503, detail="History is unavailable. Nothing was sent to Meta.")
        attempt_id = attempt.id
        try:
            await meta_client.update_entity_budget(
                entity_id,
                access_token,
                payload.daily_budget,
                currency=normalize_currency(account.currency),
                entity_level=level,
                account_id=account.account_id,
            )
        except Exception as error:
            logger.error(
                "Meta refused a manual budget change on %s %s; details in audit history",
                level,
                entity_id,
            )
            _record(
                session,
                existing=attempt,
                account=account,
                event_type=event_type,
                status="ERROR",
                action="SET_ENTITY_BUDGET",
                message="Meta could not confirm the change; verify its current state before retrying.",
                before_state=before_state,
                after_state=before_state,
                started=started,
                user=user,
                entity_level=level,
                entity_id=entity_id,
                entity_name=entity_name,
            )
            await _commit_quietly(session, "manual budget error")
            raise HTTPException(
                status_code=502,
                detail=f"Meta could not change this {noun} budget. Check its current state before retrying.",
            ) from error

        _after_commit_cleanup(account)
        _record(
            session,
            existing=attempt,
            account=account,
            event_type=event_type,
            status="SUCCESS",
            action="SET_ENTITY_BUDGET",
            message=f"{noun.capitalize()} daily budget changed manually.",
            before_state=before_state,
            after_state=after_state,
            started=started,
            user=user,
            entity_level=level,
            entity_id=entity_id,
            entity_name=entity_name,
        )
        saved = await _commit_quietly(session, "manual budget result")
        return {
            "entity_id": entity_id,
            "level": level,
            "daily_budget": payload.daily_budget,
            "previous_daily_budget": current_budget,
            "changed": True,
            "audit_event_id": attempt_id if saved else None,
            "message": (f"{noun.capitalize()} daily budget updated." if saved else
                        "Meta applied the change, but history confirmation failed. Undo is unavailable."),
        }
