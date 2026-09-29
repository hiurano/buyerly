import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import String, and_, case, cast, false, func, literal, or_, select, update

from api.auth import get_current_user
from api.deps import (
    _load_json_object,
    _utc_iso,
    ensure_workspace_write_access,
    get_user_workspace_member,
)
from core.action_undo import (
    MUTATING_EVENT_TYPES,
    REVERSIBLE_EVENT_TYPES,
    UndoError,
    ENTITY_NOUNS,
    event_is_within_undo_window,
    undo_entity_id,
    undo_entity_id_column,
    undo_entity_level,
    undo_audit_action,
)
from database.db import async_session_maker
from database.models import AuditEvent, InboxNotificationState, User, WorkspaceMember
from meta_api.client import MetaClient
from api.meta_dependencies import get_meta_client

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Audit & Undo"])


async def serialize_audit_events(session, rows, *, workspace_id, can_write_workspace, user):
    """Turn audit rows into the Inbox payload, including whether each can be undone."""
    row_ids = [row.id for row in rows]
    reversal_rows = []
    if row_ids:
        reversal_rows = (
            await session.execute(
                select(AuditEvent.reverts_event_id, AuditEvent.id).where(
                    AuditEvent.reverts_event_id.in_(row_ids),
                    AuditEvent.workspace_id == workspace_id,
                )
            )
        ).all()
    reversed_by = {
        original_id: reversal_id
        for original_id, reversal_id in reversal_rows
        if original_id is not None
    }

    # Keyed on the entity, so a campaign or ad action is tracked as its own
    # target instead of collapsing into the empty ad set column.
    target_keys = {
        (row.account_id, undo_entity_id(row))
        for row in rows
        if row.account_id and undo_entity_id(row)
    }
    latest_mutating_by_target = {}
    if target_keys:
        account_ids = {account_key for account_key, _ in target_keys}
        entity_ids = {entity_key for _, entity_key in target_keys}
        # One expression object, reused: building it twice would emit two
        # separate bind parameters, and Postgres would then not recognise
        # the grouped expression as the selected one.
        entity_key_column = undo_entity_id_column()
        latest_rows = (
            await session.execute(
                select(
                    AuditEvent.account_id,
                    entity_key_column,
                    func.max(AuditEvent.id),
                )
                .where(
                    AuditEvent.account_id.in_(account_ids),
                    entity_key_column.in_(entity_ids),
                    AuditEvent.status == "SUCCESS",
                    AuditEvent.event_type.in_(MUTATING_EVENT_TYPES),
                    AuditEvent.workspace_id == workspace_id,
                )
                .group_by(AuditEvent.account_id, entity_key_column)
            )
        ).all()
        latest_mutating_by_target = {
            (account_key, entity_key): latest_id
            for account_key, entity_key, latest_id in latest_rows
        }

    items = []
    for row in rows:
        reversal_id = reversed_by.get(row.id)
        is_reversible = (
            row.status == "SUCCESS"
            and row.event_type in REVERSIBLE_EVENT_TYPES
            and bool(row.account_id and undo_entity_id(row))
        )
        latest_id = latest_mutating_by_target.get(
            (row.account_id, undo_entity_id(row))
        )
        can_undo = bool(
            can_write_workspace
            and is_reversible
            and reversal_id is None
            and latest_id == row.id
            and event_is_within_undo_window(row)
        )
        if not can_write_workspace:
            undo_reason = "The Viewer role cannot undo actions."
        elif reversal_id is not None:
            undo_reason = "This action has already been undone."
        elif not is_reversible:
            undo_reason = "This event cannot be reversed by an opposite command."
        elif latest_id != row.id:
            undo_reason = (
                f"The {ENTITY_NOUNS[undo_entity_level(row)]} has changed "
                "since this event."
            )
        elif not event_is_within_undo_window(row):
            undo_reason = "The 24-hour safe undo window has closed."
        else:
            undo_reason = ""
        items.append({
            "id": row.id,
            "owner_user_id": row.owner_user_id if user.role == "admin" else None,
            "workspace_id": row.workspace_id,
            "actor_type": row.actor_type,
            "actor_id": row.actor_id,
            "category": row.category,
            "event_type": row.event_type,
            "status": row.status,
            "account_id": row.account_id,
            "account_name": row.account_name,
            "adset_id": row.adset_id,
            "adset_name": row.adset_name,
            "entity_level": row.entity_level,
            "entity_id": row.entity_id,
            "entity_name": row.entity_name,
            "rule_id": row.rule_id,
            "rule_name": row.rule_name,
            "action": row.action,
            "message": row.message,
            "before_state": _load_json_object(row.before_state),
            "after_state": _load_json_object(row.after_state),
            "details": _load_json_object(row.details),
            "correlation_id": row.correlation_id,
            "reverts_event_id": row.reverts_event_id,
            "reverted_by_event_id": reversal_id,
            "is_reverted": reversal_id is not None,
            "display_status": "REVERTED" if reversal_id is not None else row.status,
            "can_undo": can_undo,
            "undo_reason": undo_reason,
            "duration_ms": row.duration_ms,
            "created_at": _utc_iso(row.created_at),
        })
    return items



@router.get("/audit-events")
async def list_audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    category: Optional[str] = Query(None, max_length=40),
    event_status: Optional[str] = Query(None, alias="status", max_length=20),
    account_id: Optional[str] = Query(None, max_length=80),
    rule_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    user: User = Depends(get_current_user),
):
    """Return an owner-isolated, filterable audit history for the web UI."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        workspace_id = ws.id if ws else None
        can_write_workspace = bool(member and member.role != "viewer")
        # Legacy NULL rows are intentionally quarantined from the tenant UI.
        # owner_user_id cannot identify one active workspace when the same user
        # belongs to multiple workspaces.
        filters = [
            AuditEvent.workspace_id == workspace_id
            if workspace_id is not None
            else false()
        ]
        if category:
            filters.append(AuditEvent.category == category.upper())
        if account_id:
            filters.append(AuditEvent.account_id == account_id)
        if rule_id is not None:
            filters.append(AuditEvent.rule_id == rule_id)
        if date_from:
            filters.append(AuditEvent.created_at >= date_from)
        if date_to:
            filters.append(AuditEvent.created_at <= date_to)
        if search and search.strip():
            search_pattern = f"%{search.strip()}%"
            filters.append(
                or_(
                    AuditEvent.account_name.ilike(search_pattern),
                    AuditEvent.account_id.ilike(search_pattern),
                    AuditEvent.adset_name.ilike(search_pattern),
                    AuditEvent.adset_id.ilike(search_pattern),
                    AuditEvent.entity_name.ilike(search_pattern),
                    AuditEvent.entity_id.ilike(search_pattern),
                    AuditEvent.rule_name.ilike(search_pattern),
                    AuditEvent.message.ilike(search_pattern),
                )
            )

        status_filters = list(filters)
        if event_status:
            normalized_status = event_status.upper()
            if normalized_status == "REVERTED":
                filters.append(
                    AuditEvent.id.in_(
                        select(AuditEvent.reverts_event_id).where(
                            AuditEvent.reverts_event_id.is_not(None),
                            AuditEvent.workspace_id == workspace_id,
                        )
                    )
                )
            else:
                filters.append(AuditEvent.status == normalized_status)

        total = (
            await session.execute(
                select(func.count()).select_from(AuditEvent).where(*filters)
            )
        ).scalar_one()

        status_rows = (
            await session.execute(
                select(AuditEvent.status, func.count(AuditEvent.id))
                .where(*status_filters)
                .group_by(AuditEvent.status)
            )
        ).all()
        reverted_count = (
            await session.execute(
                select(func.count(AuditEvent.reverts_event_id)).where(
                    AuditEvent.reverts_event_id.is_not(None),
                    *status_filters,
                )
            )
        ).scalar_one()

        rows = (
            await session.execute(
                select(AuditEvent)
                .where(*filters)
                .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).scalars().all()

        items = await serialize_audit_events(
            session,
            rows,
            workspace_id=workspace_id,
            can_write_workspace=can_write_workspace,
            user=user,
        )

    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "status_counts": {
            **{status_name: count for status_name, count in status_rows},
            "REVERTED": reverted_count,
        },
    }


@router.post("/audit-events/{event_id}/undo")
async def undo_audit_event(
    event_id: int,
    user: User = Depends(get_current_user),
    meta_client: MetaClient = Depends(get_meta_client),
):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "undoing an action")
        try:
            return await undo_audit_action(
                session,
                meta_client=meta_client,
                event_id=event_id,
                actor_type="user",
                actor_id=str(user.telegram_id or user.id),
                owner_user_id=user.id,
                workspace_id=ws.id if ws else None,
                is_admin=user.role == "admin",
            )
        except UndoError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error


# ---------------------------------------------------------------------------
# Inbox: the workspace's audit events, with each member's own read, delete and
# snooze state on top, like Linear's notifications.
# ---------------------------------------------------------------------------

INBOX_PAGE_SIZE = 50


class InboxReadRequest(BaseModel):
    read: bool


class InboxSnoozeRequest(BaseModel):
    until: Optional[datetime] = None


def _own_actor_ids(user: User) -> list[str]:
    return [value for value in {str(user.id), str(user.telegram_id or "")} if value]


def _inbox_columns(user: User, member):
    """SQL expressions for one member's view of every audit event.

    Events the member did themselves, and everything recorded before their
    read mark, count as read until they say otherwise, as in Linear where your
    own changes never notify you.
    """
    now = datetime.now(timezone.utc)
    read_before = getattr(member, "inbox_read_before", None) or now
    deleted_before = getattr(member, "inbox_deleted_before", None)
    state = InboxNotificationState
    implicit_read = or_(
        AuditEvent.created_at <= read_before,
        and_(AuditEvent.actor_type == "user", AuditEvent.actor_id.in_(_own_actor_ids(user))),
    )
    is_read = func.coalesce(state.is_read, implicit_read)
    deleted = state.deleted_at.is_not(None)
    if deleted_before is not None:
        deleted = or_(
            deleted,
            and_(state.id.is_(None), AuditEvent.created_at <= deleted_before, implicit_read),
        )
    snoozed = and_(state.snoozed_until.is_not(None), state.snoozed_until > now)
    join_on = and_(state.audit_event_id == AuditEvent.id, state.user_id == user.id)
    return join_on, is_read, deleted, snoozed


async def _inbox_unread_count(session, user, member, workspace_id) -> int:
    join_on, is_read, deleted, snoozed = _inbox_columns(user, member)
    return (
        await session.execute(
            select(func.count(AuditEvent.id))
            .select_from(AuditEvent)
            .outerjoin(InboxNotificationState, join_on)
            .where(
                AuditEvent.workspace_id == workspace_id,
                ~deleted,
                ~snoozed,
                ~is_read,
            )
        )
    ).scalar_one()


async def _inbox_member(session, user):
    ws, member = await get_user_workspace_member(session, user)
    if not ws or not member:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return ws, member


def _inbox_from_key():
    """Who a notification is from, as Linear's From filter sees it."""
    return case(
        (AuditEvent.actor_type == "user", literal("user:") + AuditEvent.actor_id),
        (AuditEvent.rule_id.is_not(None), literal("rule:") + cast(AuditEvent.rule_id, String)),
        else_=literal("buyerly"),
    )


# Linear's Inbox filter properties, mapped onto audit events. Issue priority
# has no counterpart in ad events and is left out.
INBOX_FILTER_COLUMNS = {
    "type": lambda: AuditEvent.event_type,
    "from": _inbox_from_key,
    "account": lambda: AuditEvent.account_id,
    "status": lambda: AuditEvent.status,
}


def _parse_inbox_filter(raw: Optional[str]) -> list[dict]:
    if not raw:
        return []
    try:
        clauses = json.loads(raw)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Filter is not valid JSON.") from error
    if not isinstance(clauses, list) or len(clauses) > len(INBOX_FILTER_COLUMNS):
        raise HTTPException(status_code=400, detail="Filter must be a list of clauses.")
    parsed = []
    for clause in clauses:
        if (
            not isinstance(clause, dict)
            or clause.get("field") not in INBOX_FILTER_COLUMNS
            or clause.get("operator") not in {"is", "is_not"}
            or not isinstance(clause.get("values"), list)
            or not all(isinstance(value, str) for value in clause["values"])
            or len(clause["values"]) > 100
        ):
            raise HTTPException(status_code=400, detail="Unsupported filter clause.")
        if clause["values"]:
            parsed.append(clause)
    return parsed


def _inbox_filter_conditions(clauses: list[dict]):
    conditions = []
    for clause in clauses:
        column = INBOX_FILTER_COLUMNS[clause["field"]]()
        matches = column.in_(clause["values"])
        conditions.append(matches if clause["operator"] == "is" else ~matches)
    return conditions


def _inbox_view_filters(ws, is_read, deleted, snoozed, *, unread_only, show_snoozed):
    filters = [AuditEvent.workspace_id == ws.id, ~deleted]
    if not show_snoozed:
        filters.append(~snoozed)
    if unread_only:
        filters.append(~is_read)
    return filters


@router.get("/inbox")
async def list_inbox(
    offset: int = Query(0, ge=0),
    limit: int = Query(INBOX_PAGE_SIZE, ge=1, le=100),
    ordering: str = Query("newest", pattern="^(newest|oldest)$"),
    unread_only: bool = Query(False),
    show_snoozed: bool = Query(False),
    unread_first: bool = Query(False),
    filter_: Optional[str] = Query(None, alias="filter", max_length=4000),
    user: User = Depends(get_current_user),
):
    """One member's Inbox, newest first unless asked otherwise."""
    clauses = _parse_inbox_filter(filter_)
    async with async_session_maker() as session:
        ws, member = await _inbox_member(session, user)
        join_on, is_read, deleted, snoozed = _inbox_columns(user, member)
        view_filters = _inbox_view_filters(
            ws, is_read, deleted, snoozed, unread_only=unread_only, show_snoozed=show_snoozed
        )
        filters = view_filters + _inbox_filter_conditions(clauses)
        hidden_by_filters = 0
        if clauses:
            def count(conditions):
                return (
                    select(func.count(AuditEvent.id))
                    .select_from(AuditEvent)
                    .outerjoin(InboxNotificationState, join_on)
                    .where(*conditions)
                )
            hidden_by_filters = (
                (await session.execute(count(view_filters))).scalar_one()
                - (await session.execute(count(filters))).scalar_one()
            )
        time_order = (
            (AuditEvent.created_at.asc(), AuditEvent.id.asc())
            if ordering == "oldest"
            else (AuditEvent.created_at.desc(), AuditEvent.id.desc())
        )
        order_by = ((is_read.asc(),) if unread_first else ()) + time_order
        result = (
            await session.execute(
                select(AuditEvent, is_read, InboxNotificationState.snoozed_until)
                .select_from(AuditEvent)
                .outerjoin(InboxNotificationState, join_on)
                .where(*filters)
                .order_by(*order_by)
                .offset(offset)
                .limit(limit + 1)
            )
        ).all()
        page = result[:limit]
        items = await serialize_audit_events(
            session,
            [row for row, _, _ in page],
            workspace_id=ws.id,
            can_write_workspace=member.role != "viewer",
            user=user,
        )
        now = datetime.now(timezone.utc)
        for item, (_, read, snoozed_until) in zip(items, page):
            item["is_read"] = bool(read)
            item["snoozed_until"] = (
                _utc_iso(snoozed_until) if snoozed_until and snoozed_until > now else None
            )
        unread_count = await _inbox_unread_count(session, user, member, ws.id)
    return {
        "items": items,
        "has_more": len(result) > limit,
        "unread_count": unread_count,
        "hidden_by_filters": hidden_by_filters,
    }


async def _actor_names(session, actor_ids: set[str]) -> dict[str, str]:
    """Names for user actors, recorded by user id or by Telegram id."""
    if not actor_ids:
        return {}
    numeric_ids = [int(value) for value in actor_ids if value.isdigit() and len(value) < 10]
    users = (
        await session.execute(
            select(User).where(
                or_(User.telegram_id.in_(actor_ids), User.id.in_(numeric_ids or [-1]))
            )
        )
    ).scalars().all()
    names = {}
    for account in users:
        name = account.full_name or account.username
        if account.telegram_id and account.telegram_id in actor_ids:
            names[account.telegram_id] = name
        if str(account.id) in actor_ids:
            names.setdefault(str(account.id), name)
    return names


@router.get("/inbox/facets")
async def inbox_facets(
    unread_only: bool = Query(False),
    show_snoozed: bool = Query(False),
    user: User = Depends(get_current_user),
):
    """Values and counts for each Inbox filter, over what the list shows unfiltered."""
    async with async_session_maker() as session:
        ws, member = await _inbox_member(session, user)
        join_on, is_read, deleted, snoozed = _inbox_columns(user, member)
        view_filters = _inbox_view_filters(
            ws, is_read, deleted, snoozed, unread_only=unread_only, show_snoozed=show_snoozed
        )

        async def grouped(column, label=None):
            columns = [column, func.count(AuditEvent.id)]
            if label is not None:
                columns.append(func.max(label))
            return (
                await session.execute(
                    select(*columns)
                    .select_from(AuditEvent)
                    .outerjoin(InboxNotificationState, join_on)
                    .where(*view_filters)
                    .group_by(column)
                    .order_by(func.count(AuditEvent.id).desc(), column)
                )
            ).all()

        types = await grouped(AuditEvent.event_type)
        statuses = await grouped(AuditEvent.status)
        accounts = await grouped(AuditEvent.account_id, AuditEvent.account_name)
        from_key = _inbox_from_key()
        senders = await grouped(from_key, AuditEvent.rule_name)
        names = await _actor_names(
            session,
            {key.split(":", 1)[1] for key, _, _ in senders if key.startswith("user:")},
        )

    def sender_label(key, rule_name):
        if key.startswith("user:"):
            return names.get(key.split(":", 1)[1], "Someone")
        if key.startswith("rule:"):
            return rule_name or "Rule"
        return "Buyerly"

    return {
        "type": [{"value": value, "count": count} for value, count in types],
        "from": [
            {"value": key, "label": sender_label(key, rule_name), "count": count}
            for key, count, rule_name in senders
        ],
        "account": [
            {"value": value, "label": name or value, "count": count}
            for value, count, name in accounts
        ],
        "status": [{"value": value, "count": count} for value, count in statuses],
    }


@router.get("/inbox/unread-count")
async def inbox_unread_count(user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        if not ws or not member:
            return {"unread_count": 0}
        return {"unread_count": await _inbox_unread_count(session, user, member, ws.id)}


async def _update_inbox_state(user: User, event_id: int, **values):
    async with async_session_maker() as session:
        ws, member = await _inbox_member(session, user)
        event_workspace = (
            await session.execute(select(AuditEvent.workspace_id).where(AuditEvent.id == event_id))
        ).scalar_one_or_none()
        if event_workspace is None or event_workspace != ws.id:
            raise HTTPException(status_code=404, detail="Notification not found.")
        state = (
            await session.execute(
                select(InboxNotificationState).where(
                    InboxNotificationState.user_id == user.id,
                    InboxNotificationState.audit_event_id == event_id,
                )
            )
        ).scalar_one_or_none()
        if state is None:
            # The first touch pins the read state the member saw, so a later
            # "Delete all read" or a new read mark cannot flip it.
            _, is_read, _, _ = _inbox_columns(user, member)
            seen_read = (
                await session.execute(
                    select(is_read)
                    .select_from(AuditEvent)
                    .outerjoin(
                        InboxNotificationState,
                        and_(
                            InboxNotificationState.audit_event_id == AuditEvent.id,
                            InboxNotificationState.user_id == user.id,
                        ),
                    )
                    .where(AuditEvent.id == event_id)
                )
            ).scalar_one()
            state = InboxNotificationState(
                user_id=user.id, audit_event_id=event_id, is_read=bool(seen_read)
            )
            session.add(state)
        for key, value in values.items():
            setattr(state, key, value)
        await session.commit()
        unread_count = await _inbox_unread_count(session, user, member, ws.id)
    return {"success": True, "unread_count": unread_count}


@router.post("/inbox/{event_id}/read")
async def mark_inbox_read(
    event_id: int,
    payload: InboxReadRequest,
    user: User = Depends(get_current_user),
):
    return await _update_inbox_state(user, event_id, is_read=payload.read)


@router.post("/inbox/{event_id}/delete")
async def delete_inbox_notification(event_id: int, user: User = Depends(get_current_user)):
    return await _update_inbox_state(
        user, event_id, deleted_at=datetime.now(timezone.utc)
    )


@router.post("/inbox/{event_id}/snooze")
async def snooze_inbox_notification(
    event_id: int,
    payload: InboxSnoozeRequest,
    user: User = Depends(get_current_user),
):
    until = payload.until
    if until is None:
        return await _update_inbox_state(user, event_id, snoozed_until=None)
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if until <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Pick a time in the future.")
    # A snoozed notification comes back unread, as in Linear.
    return await _update_inbox_state(user, event_id, snoozed_until=until, is_read=False)


async def _delete_inbox_bulk(user: User, *, only_read: bool):
    now = datetime.now(timezone.utc)
    async with async_session_maker() as session:
        ws, member = await _inbox_member(session, user)
        if member.id is None:
            raise HTTPException(
                status_code=403, detail="Support access cannot clear this Inbox."
            )
        workspace_events = select(AuditEvent.id).where(AuditEvent.workspace_id == ws.id)
        state_filters = [
            InboxNotificationState.user_id == user.id,
            InboxNotificationState.deleted_at.is_(None),
            InboxNotificationState.audit_event_id.in_(workspace_events),
        ]
        if only_read:
            state_filters.append(InboxNotificationState.is_read.is_(True))
        await session.execute(
            update(InboxNotificationState).where(*state_filters).values(deleted_at=now)
        )
        stored = await session.get(WorkspaceMember, member.id)
        if not only_read:
            stored.inbox_read_before = now
        stored.inbox_deleted_before = now
        await session.commit()
        unread_count = await _inbox_unread_count(session, user, stored, ws.id)
    return {"success": True, "unread_count": unread_count}


@router.post("/inbox/delete-all")
async def delete_all_inbox(user: User = Depends(get_current_user)):
    return await _delete_inbox_bulk(user, only_read=False)


@router.post("/inbox/delete-all-read")
async def delete_all_read_inbox(user: User = Depends(get_current_user)):
    return await _delete_inbox_bulk(user, only_read=True)
