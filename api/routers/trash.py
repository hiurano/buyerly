import json
import logging
import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from api.auth import get_current_user
from api.deps import (
    _load_active_rules,
    _preset_snapshot,
    _utc_iso,
    ensure_workspace_write_access,
    get_user_workspace,
    get_user_workspace_member,
)
from api.schemas import DeletedItemResponse, RestoreDeletedItemResponse
from core.metrics import validate_rule_set_compatibility
from core.trash import (
    KIND_RULE,
    KIND_RULE_GROUP,
    parse_created_at,
    purge_at,
    purge_expired,
)
from database.db import async_session_maker
from database.models import (
    Account,
    AuditEvent,
    DeletedItem,
    RuleGroup,
    RuleGroupItem,
    RulePreset,
    User,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Recently deleted"])


def _person_label(user: Optional[User]) -> str:
    if user is None:
        return ""
    return user.full_name or user.username or user.email or ""


@router.get("/deleted-items", response_model=List[DeletedItemResponse])
async def list_deleted_items(user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        await purge_expired(session, ws.id)
        await session.commit()
        rows = (
            await session.execute(
                select(DeletedItem, User)
                .outerjoin(User, User.id == DeletedItem.deleted_by_user_id)
                .where(DeletedItem.workspace_id == ws.id)
                .order_by(DeletedItem.deleted_at.desc(), DeletedItem.id.desc())
            )
        ).all()
        return [
            DeletedItemResponse(
                id=item.id,
                kind=item.kind,
                entity_id=item.entity_id,
                name=item.name,
                deleted_at=_utc_iso(item.deleted_at),
                purge_at=_utc_iso(purge_at(item.deleted_at)),
                deleted_by=_person_label(deleter),
            )
            for item, deleter in rows
        ]


async def _existing_user_id(session, user_id) -> Optional[int]:
    if not user_id:
        return None
    return user_id if await session.get(User, user_id) else None


async def _restore_rule(session, ws_id: int, item: DeletedItem, user: User) -> RestoreDeletedItemResponse:
    if await session.get(RulePreset, item.entity_id):
        raise HTTPException(status_code=409, detail="This rule already exists.")
    snapshot = item.snapshot or {}
    fields = dict(snapshot.get("preset") or {})
    fields["owner_user_id"] = await _existing_user_id(session, fields.get("owner_user_id"))
    preset = RulePreset(id=item.entity_id, workspace_id=ws_id, **fields)
    created_at = parse_created_at(snapshot.get("created_at"))
    if created_at:
        preset.created_at = created_at
    session.add(preset)
    await session.flush()

    # Back into every group that still exists, where it stood.
    for membership in snapshot.get("group_items") or []:
        group = (
            await session.execute(
                select(RuleGroup).where(
                    RuleGroup.id == membership.get("group_id"),
                    RuleGroup.workspace_id == ws_id,
                )
            )
        ).scalar_one_or_none()
        if group:
            session.add(
                RuleGroupItem(
                    group_id=group.id,
                    preset_id=preset.id,
                    position=int(membership.get("position") or 0),
                )
            )

    # Back onto every ad account it ran on, with the scope it had there. An
    # account that is gone, or that meanwhile took a contradicting rule, is
    # reported instead of being forced.
    skipped: List[str] = []
    restored_accounts: List[str] = []
    for attachment in snapshot.get("attachments") or []:
        account = (
            await session.execute(
                select(Account).where(
                    Account.account_id == attachment.get("account_id"),
                    Account.workspace_id == ws_id,
                )
            )
        ).scalar_one_or_none()
        if not account:
            skipped.append(str(attachment.get("account_id") or ""))
            continue
        active_rules = _load_active_rules(account.active_rules)
        if any(rule.get("preset_id") == preset.id for rule in active_rules):
            continue
        rule = _preset_snapshot(preset)
        rule["scope"] = attachment.get("scope") or rule["scope"]
        candidate = [*active_rules, rule]
        try:
            validate_rule_set_compatibility(candidate)
        except ValueError:
            skipped.append(account.account_id)
            continue
        account.active_rules = json.dumps(candidate)
        if attachment.get("switched_account_off"):
            account.rules_enabled = True
        restored_accounts.append(account.account_id)

    session.add(
        AuditEvent(
            workspace_id=ws_id,
            owner_user_id=preset.owner_user_id or user.id,
            actor_type="user",
            actor_id=str(user.telegram_id or user.id),
            category="MANUAL_ACTION",
            event_type="RESTORE_RULE_PRESET",
            status="SUCCESS",
            rule_id=preset.id,
            rule_name=preset.name,
            action="RESTORE",
            message=f"Rule '{preset.name}' restored.",
            before_state={"deleted": True},
            after_state={"deleted": False},
            details={
                "restored_account_ids": restored_accounts,
                "skipped_account_ids": skipped,
            },
            correlation_id=secrets.token_hex(16),
        )
    )
    return RestoreDeletedItemResponse(
        kind=KIND_RULE,
        entity_id=preset.id,
        name=preset.name,
        skipped_account_ids=skipped,
        missing_rule_ids=[],
    )


async def _restore_group(session, ws_id: int, item: DeletedItem) -> RestoreDeletedItemResponse:
    if await session.get(RuleGroup, item.entity_id):
        raise HTTPException(status_code=409, detail="This group already exists.")
    snapshot = item.snapshot or {}
    fields = dict(snapshot.get("group") or {})
    fields["owner_user_id"] = await _existing_user_id(session, fields.get("owner_user_id"))
    group = RuleGroup(id=item.entity_id, workspace_id=ws_id, **fields)
    created_at = parse_created_at(snapshot.get("created_at"))
    if created_at:
        group.created_at = created_at
    session.add(group)
    await session.flush()

    # Rules deleted since then do not come back with the group.
    missing: List[int] = []
    for entry in snapshot.get("items") or []:
        preset = (
            await session.execute(
                select(RulePreset).where(
                    RulePreset.id == entry.get("preset_id"),
                    RulePreset.workspace_id == ws_id,
                )
            )
        ).scalar_one_or_none()
        if not preset:
            missing.append(int(entry.get("preset_id") or 0))
            continue
        session.add(
            RuleGroupItem(
                group_id=group.id,
                preset_id=preset.id,
                position=int(entry.get("position") or 0),
            )
        )
    return RestoreDeletedItemResponse(
        kind=KIND_RULE_GROUP,
        entity_id=group.id,
        name=group.name,
        skipped_account_ids=[],
        missing_rule_ids=missing,
    )


@router.post("/deleted-items/{item_id}/restore", response_model=RestoreDeletedItemResponse)
async def restore_deleted_item(item_id: int, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "restoring deleted items")
        await purge_expired(session, ws.id)

        item = (
            await session.execute(
                select(DeletedItem).where(
                    DeletedItem.id == item_id,
                    DeletedItem.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if not item:
            raise HTTPException(
                status_code=404,
                detail="This item is no longer in Recently deleted.",
            )

        if item.kind == KIND_RULE:
            result = await _restore_rule(session, ws.id, item, user)
        elif item.kind == KIND_RULE_GROUP:
            result = await _restore_group(session, ws.id, item)
        else:
            raise HTTPException(status_code=400, detail="This item cannot be restored.")

        await session.delete(item)
        await session.commit()
        return result
