import json
import logging
import secrets
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, select

from api.auth import get_current_user
from api.deps import (
    _clean_rule_label_name,
    _ensure_compatible_rule_set,
    _ensure_stable_account_owner,
    _ensure_unique_label_name,
    _get_workspace_labels,
    _get_workspace_presets,
    _load_active_rules,
    _preset_attachments,
    _preset_label_ids,
    _preset_last_runs,
    _preset_response,
    _preset_snapshot,
    _rule_entity_states,
    _rule_label_responses,
    _validated_condition_payloads,
    ensure_workspace_write_access,
    get_user_workspace,
    get_user_workspace_member,
    workspace_account_access,
)
from core.account_access import EVERYTHING, AccountAccess
from api.schemas import (
    ApplyPresetRequest,
    BulkPresetLabelsRequest,
    CreatePresetRequest,
    PresetLabelsRequest,
    RuleEntityStateItem,
    RuleLabelCreateRequest,
    RuleLabelResponse,
    RuleLabelUpdateRequest,
    RuleAttachmentRequest,
    RuleDraftRequest,
    RuleScopeItem,
    RulePresetItem,
)
from core.rule_examples import ensure_rule_examples
from core.rule_labels import random_label_color
from core.trash import (
    KIND_RULE,
    KIND_RULE_GROUP,
    group_snapshot,
    preset_snapshot,
    purge_expired,
)
from services.rule_preview import preview_rule_on_account
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
router = APIRouter(tags=["Rules & Presets"])


def _record_assistant_change(
    session,
    request: Request,
    *,
    ws,
    user: User,
    event_type: str,
    action: str,
    message: str,
    preset_id: int,
    preset_name: str,
    account: Account | None = None,
    details: dict | None = None,
) -> None:
    """Leave an Inbox row when the browser's AI assistant changed rules.

    The WebMCP tools mark their writes with `X-Buyerly-Agent: webmcp` after the
    person approved them in Buyerly's own dialog. The header is not proof of
    anything; it only explains in the history who asked for the change.
    """
    if request.headers.get("x-buyerly-agent") != "webmcp":
        return
    session.add(
        AuditEvent(
            workspace_id=ws.id,
            owner_user_id=account.owner_user_id if account else user.id,
            actor_type="user",
            actor_id=str(user.telegram_id or user.id),
            category="MANUAL_ACTION",
            event_type=event_type,
            status="SUCCESS",
            account_id=account.account_id if account else "",
            account_name=(account.name or "") if account else "",
            rule_id=preset_id,
            rule_name=preset_name,
            action=action,
            message=message,
            details={"via": "webmcp", **(details or {})},
            correlation_id=secrets.token_hex(16),
        )
    )


def _account_key(account_id: str) -> str:
    return account_id if account_id.startswith("act_") else f"act_{account_id}"


def _preset_fields(payload: RuleDraftRequest, condition_payloads: list) -> dict:
    """The stored columns of a rule written from the rule window."""
    return {
        "name": payload.name.strip() or "New rule",
        "action": payload.action or "turn_off",
        "level": payload.level,
        "enabled": payload.enabled,
        "conditions": condition_payloads,
        "condition_logic": payload.condition_logic or "and",
        "cooldown_minutes": payload.cooldown_minutes or 0,
        "check_interval_minutes": payload.check_interval_minutes or 5,
        "budget_change_percent": payload.budget_change_percent or 0.0,
        "budget_max_daily": payload.budget_max_daily or 0.0,
    }


async def _apply_rule_attachments(
    session, ws, preset: RulePreset, desired: List[RuleAttachmentRequest], access: AccountAccess = EVERYTHING
) -> None:
    """Make `desired` the ad accounts the rule runs on, each with its scope (#387).

    An account it newly runs on gets its automation turned on, as attaching
    from Ads Manager does; one it leaves keeps its other rules, and an account
    left without rules has its automation turned off, as detaching does. Any
    error leaves every account as it was: the caller has not committed yet.
    """
    wanted = {_account_key(item.account_id): item.scope.model_dump() for item in desired}
    # Accounts out of sight (a private team's) are neither named nor changed: the rule stays on them.
    accounts = [
        account
        for account in (
            await session.execute(select(Account).where(Account.workspace_id == ws.id))
        ).scalars().all()
        if access.allows(account.account_id)
    ]
    known = {account.account_id for account in accounts}
    if any(account_id not in known for account_id in wanted):
        raise HTTPException(status_code=404, detail="Ad account not found.")
    snapshot = _preset_snapshot(preset)
    if wanted and snapshot.get("needs_review"):
        raise HTTPException(
            status_code=400,
            detail="This rule has unsafe or outdated settings. Open it and save it again.",
        )
    for account in accounts:
        active_rules = _load_active_rules(account.active_rules)
        attached = any(rule.get("preset_id") == preset.id for rule in active_rules)
        if account.account_id in wanted:
            await _ensure_stable_account_owner(session, account)
            scope = wanted[account.account_id]
            if attached:
                for rule in active_rules:
                    if rule.get("preset_id") == preset.id:
                        rule["scope"] = scope
            else:
                active_rules.append({**snapshot, "scope": scope})
                account.rules_enabled = True
            _ensure_compatible_rule_set(active_rules)
            account.active_rules = json.dumps(active_rules)
        elif attached:
            active_rules = [rule for rule in active_rules if rule.get("preset_id") != preset.id]
            account.active_rules = json.dumps(active_rules)
            if not active_rules:
                account.rules_enabled = False


@router.get("/presets", response_model=List[RulePresetItem])
async def list_presets(user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        await ensure_rule_examples(session, user, workspace_id=ws.id)
        stmt = (
            select(RulePreset)
            .where(RulePreset.workspace_id == ws.id)
            .order_by(RulePreset.id.desc())
        )
        res = await session.execute(stmt)
        presets = res.scalars().all()
        access = await workspace_account_access(session, user, ws.id)
        attachments = await _preset_attachments(session, ws.id, access)
        _, member = await get_user_workspace_member(session, user, workspace_id=ws.id)
        if member is not None and member.role == "guest":
            # A guest sees the rules at work on their teams' ad accounts, as Linear's guests see only their teams.
            presets = [preset for preset in presets if attachments.get(preset.id)]
        last_runs = await _preset_last_runs(
            session, ws.id, [preset.id for preset in presets]
        )
        labels = await _preset_label_ids(session, [preset.id for preset in presets])
        return [
            _preset_response(
                preset,
                last_runs.get(preset.id),
                attachments.get(preset.id, {}),
                labels.get(preset.id, []),
            )
            for preset in presets
        ]


@router.post("/presets", response_model=RulePresetItem)
async def create_preset(
    payload: CreatePresetRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "creating rules")

        condition_payloads = _validated_condition_payloads(payload.conditions)
        labels = await _get_workspace_labels(session, payload.label_ids or [], workspace_id=ws.id)
        preset = RulePreset(
            workspace_id=ws.id if ws else None,
            owner_user_id=user.id,
            **_preset_fields(payload, condition_payloads),
        )
        session.add(preset)
        await session.flush()
        await _set_preset_labels(session, preset.id, [label.id for label in labels])
        # Created and attached in one write: the rule never sits "nowhere" (#387).
        if payload.attachments:
            await _apply_rule_attachments(
                session, ws, preset, payload.attachments, await workspace_account_access(session, user, ws.id)
            )
        _record_assistant_change(
            session,
            request,
            ws=ws,
            user=user,
            event_type="ASSISTANT_CREATE_RULE",
            action="CREATE",
            message=f"Rule '{preset.name}' created by the AI assistant.",
            preset_id=preset.id,
            preset_name=preset.name,
            details={"rule_action": preset.action, "conditions": preset.conditions},
        )
        await session.commit()
        await session.refresh(preset)
        return await _labelled_preset_response(
            session, ws.id, preset, await workspace_account_access(session, user, ws.id)
        )


@router.post("/presets/check")
async def check_rule_draft(payload: RuleDraftRequest, user: User = Depends(get_current_user)):
    """Whether a rule in the rule window could be saved as it stands (#387).

    The same checks as saving run on it, so a contradiction or a missing
    budget ceiling shows while the buyer is still typing. Writes nothing.
    """
    async with async_session_maker() as session:
        await get_user_workspace(session, user)
    _validated_condition_payloads(payload.conditions)
    return {"valid": True}


@router.post("/accounts/{account_id}/rules/preview")
async def preview_rule_draft_on_account(
    account_id: str,
    payload: RuleDraftRequest,
    user: User = Depends(get_current_user),
):
    """What a rule not saved yet would check on the whole ad account (#387).

    The rule window previews before anything exists, so the rule comes in the
    body instead of by id; the reading is the same as for a saved rule (#200).
    """
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        if ws is None:
            raise HTTPException(status_code=404, detail="Ad account not found.")
        acc = (
            await session.execute(
                select(Account).where(
                    Account.account_id == _account_key(account_id),
                    Account.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if not acc or not (await workspace_account_access(session, user, ws.id)).allows(acc.account_id):
            raise HTTPException(status_code=404, detail="Ad account not found.")
        condition_payloads = _validated_condition_payloads(payload.conditions)
        # Never added to the session: a draft is read, not stored.
        draft = RulePreset(
            workspace_id=ws.id,
            owner_user_id=user.id,
            **_preset_fields(payload, condition_payloads),
        )
        rule = _preset_snapshot(draft)
        if rule.get("needs_review"):
            raise HTTPException(status_code=400, detail=rule.get("review_reason") or "This rule cannot run as set.")
        preview = await preview_rule_on_account(session, acc, rule)
        preview["already_attached"] = False
        return preview


@router.put("/presets/{preset_id}", response_model=RulePresetItem)
async def update_preset(preset_id: int, payload: CreatePresetRequest, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "editing rules")

        condition_payloads = _validated_condition_payloads(payload.conditions)
        stmt = select(RulePreset).where(
            RulePreset.id == preset_id,
            RulePreset.workspace_id == ws.id,
        )
        res = await session.execute(stmt)
        preset = res.scalar_one_or_none()
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        preset.name = payload.name.strip() or preset.name
        preset.action = payload.action or "turn_off"
        preset.level = payload.level
        preset.enabled = payload.enabled
        preset.conditions = condition_payloads
        if payload.condition_logic is not None:
            preset.condition_logic = payload.condition_logic
        if payload.cooldown_minutes is not None:
            preset.cooldown_minutes = payload.cooldown_minutes
        if payload.check_interval_minutes is not None:
            preset.check_interval_minutes = payload.check_interval_minutes
        if payload.budget_change_percent is not None:
            preset.budget_change_percent = payload.budget_change_percent
        if payload.budget_max_daily is not None:
            preset.budget_max_daily = payload.budget_max_daily

        updated_snapshot = _preset_snapshot(preset)
        acc_stmt = select(Account).where(Account.workspace_id == ws.id)
        account_res = await session.execute(acc_stmt)
        for account in account_res.scalars().all():
            active_rules = _load_active_rules(account.active_rules)
            changed = False
            for index, active_rule in enumerate(active_rules):
                if active_rule.get("preset_id") == preset_id:
                    resynced = updated_snapshot.copy()
                    # Scope is a property of this attachment, not of the preset,
                    # so editing the rule must not widen it back to the account.
                    resynced["scope"] = active_rule.get(
                        "scope", updated_snapshot["scope"]
                    )
                    active_rules[index] = resynced
                    changed = True
            if changed:
                _ensure_compatible_rule_set(active_rules)
                account.active_rules = json.dumps(active_rules)

        if payload.label_ids is not None:
            labels = await _get_workspace_labels(session, payload.label_ids, workspace_id=ws.id)
            await _set_preset_labels(session, preset.id, [label.id for label in labels])
        # Where it runs, edited in the same window (#387); left out, unchanged.
        if payload.attachments is not None:
            await _apply_rule_attachments(
                session, ws, preset, payload.attachments, await workspace_account_access(session, user, ws.id)
            )

        await session.commit()
        await session.refresh(preset)
        return await _labelled_preset_response(
            session, ws.id, preset, await workspace_account_access(session, user, ws.id)
        )


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: int, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "deleting rules")

        stmt = select(RulePreset).where(
            RulePreset.id == preset_id,
            RulePreset.workspace_id == ws.id,
        )
        res = await session.execute(stmt)
        preset = res.scalar_one_or_none()
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        # Remove the exact preset ID from linked account snapshots in this workspace,
        # remembering each attachment so a restore can put it back.
        acc_stmt = select(Account).where(Account.workspace_id == ws.id)
        acc_res = await session.execute(acc_stmt)
        affected_account_ids = []
        attachments = []
        for acc in acc_res.scalars().all():
            active_rules = _load_active_rules(acc.active_rules)
            removed = [r for r in active_rules if r.get("preset_id") == preset_id]
            remaining_rules = [r for r in active_rules if r.get("preset_id") != preset_id]
            if removed:
                affected_account_ids.append(acc.account_id)
                acc.active_rules = json.dumps(remaining_rules)
                switched_off = not remaining_rules and bool(acc.rules_enabled)
                if not remaining_rules:
                    acc.rules_enabled = False
                attachments.append(
                    {
                        "account_id": acc.account_id,
                        "scope": removed[0].get("scope") or {"level": "account", "ids": []},
                        "switched_account_off": switched_off,
                    }
                )

        group_items = [
            {"group_id": item.group_id, "position": item.position}
            for item in (
                await session.execute(
                    select(RuleGroupItem).where(RuleGroupItem.preset_id == preset_id)
                )
            ).scalars().all()
        ]
        await purge_expired(session, ws.id)
        trash_item = DeletedItem(
            workspace_id=ws.id,
            kind=KIND_RULE,
            entity_id=preset.id,
            name=preset.name,
            snapshot=preset_snapshot(preset, group_items, attachments),
            deleted_by_user_id=user.id,
        )
        session.add(trash_item)

        session.add(
            AuditEvent(
                workspace_id=ws.id,
                owner_user_id=preset.owner_user_id or user.id,
                actor_type="user",
                actor_id=str(user.telegram_id or user.id),
                category="MANUAL_ACTION",
                event_type="DELETE_RULE_PRESET",
                status="SUCCESS",
                rule_id=preset.id,
                rule_name=preset.name,
                action="DELETE",
                message=f"Rule '{preset.name}' deleted.",
                before_state={
                    "action": preset.action,
                    "conditions": preset.conditions,
                },
                after_state={"deleted": True},
                details={"affected_account_ids": affected_account_ids},
                correlation_id=secrets.token_hex(16),
            )
        )
        await session.execute(delete(RuleGroupItem).where(RuleGroupItem.preset_id == preset_id))
        await session.execute(delete(RulePreset).where(RulePreset.id == preset_id))
        await session.commit()
        return {
            "success": True,
            "message": "Preset deleted",
            "deleted_item_id": trash_item.id,
        }


async def _workspace_label(session, workspace_id: int, label_id: int) -> RuleGroup:
    label = (
        await session.execute(
            select(RuleGroup).where(
                RuleGroup.id == label_id,
                RuleGroup.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found.")
    return label


async def _set_preset_labels(session, preset_id: int, label_ids: List[int]) -> None:
    """Make the rule's labels exactly these; labels it keeps keep their applied time."""
    current = (
        await session.execute(
            select(RuleGroupItem).where(RuleGroupItem.preset_id == preset_id)
        )
    ).scalars().all()
    wanted = set(label_ids)
    for item in current:
        if item.group_id not in wanted:
            await session.delete(item)
    held = {item.group_id for item in current}
    session.add_all(
        RuleGroupItem(group_id=label_id, preset_id=preset_id, position=0)
        for label_id in label_ids
        if label_id not in held
    )


async def _labelled_preset_response(
    session, ws_id: int, preset: RulePreset, access: AccountAccess = EVERYTHING
) -> RulePresetItem:
    last_runs = await _preset_last_runs(session, ws_id, [preset.id])
    attachments = await _preset_attachments(session, ws_id, access)
    labels = await _preset_label_ids(session, [preset.id])
    return _preset_response(
        preset,
        last_runs.get(preset.id),
        attachments.get(preset.id, {}),
        labels.get(preset.id, []),
    )


@router.get("/rule-labels", response_model=List[RuleLabelResponse])
async def list_rule_labels(user: User = Depends(get_current_user)):
    """The workspace's rule labels by name, as Linear lists labels (#383)."""
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        await ensure_rule_examples(session, user, workspace_id=ws.id)
        labels = (
            await session.execute(
                select(RuleGroup)
                .where(RuleGroup.workspace_id == ws.id)
                .order_by(func.lower(RuleGroup.name).asc(), RuleGroup.id.asc())
            )
        ).scalars().all()
        return await _rule_label_responses(session, list(labels))


@router.post("/rule-labels", response_model=RuleLabelResponse)
async def create_rule_label(
    payload: RuleLabelCreateRequest,
    user: User = Depends(get_current_user),
):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "creating labels")
        name = _clean_rule_label_name(payload.name)
        await _ensure_unique_label_name(session, ws.id, name)
        label = RuleGroup(
            workspace_id=ws.id,
            owner_user_id=user.id,
            name=name,
            description=payload.description.strip(),
            color=(payload.color or random_label_color()).lower(),
        )
        session.add(label)
        await session.commit()
        await session.refresh(label)
        return (await _rule_label_responses(session, [label]))[0]


@router.patch("/rule-labels/{label_id}", response_model=RuleLabelResponse)
async def update_rule_label(
    label_id: int,
    payload: RuleLabelUpdateRequest,
    user: User = Depends(get_current_user),
):
    """Rename a label, recolor it or change its description; its rules keep it."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "editing labels")
        label = await _workspace_label(session, ws.id, label_id)
        if payload.name is not None:
            name = _clean_rule_label_name(payload.name)
            await _ensure_unique_label_name(session, ws.id, name, except_id=label.id)
            label.name = name
        if payload.color is not None:
            label.color = payload.color.lower()
        if payload.description is not None:
            label.description = payload.description.strip()
        await session.commit()
        await session.refresh(label)
        return (await _rule_label_responses(session, [label]))[0]


@router.delete("/rule-labels/{label_id}")
async def delete_rule_label(
    label_id: int,
    user: User = Depends(get_current_user),
):
    """The label leaves every rule and goes to Recently deleted; the rules stay."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "deleting labels")
        label = await _workspace_label(session, ws.id, label_id)
        items = [
            {"preset_id": item.preset_id, "position": item.position}
            for item in (
                await session.execute(
                    select(RuleGroupItem).where(RuleGroupItem.group_id == label.id)
                )
            ).scalars().all()
        ]
        await purge_expired(session, ws.id)
        trash_item = DeletedItem(
            workspace_id=ws.id,
            kind=KIND_RULE_GROUP,
            entity_id=label.id,
            name=label.name,
            snapshot=group_snapshot(label, items),
            deleted_by_user_id=user.id,
        )
        session.add(trash_item)
        await session.execute(delete(RuleGroupItem).where(RuleGroupItem.group_id == label.id))
        await session.delete(label)
        await session.commit()
        return {
            "success": True,
            "message": "Label deleted. Its rules were kept.",
            "deleted_item_id": trash_item.id,
        }


@router.put("/presets/{preset_id}/labels", response_model=RulePresetItem)
async def set_preset_labels(
    preset_id: int,
    payload: PresetLabelsRequest,
    user: User = Depends(get_current_user),
):
    """A rule's whole set of labels in one write, as the label picker leaves it."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "labelling rules")
        preset = (await _get_workspace_presets(session, [preset_id], workspace_id=ws.id))[0]
        labels = await _get_workspace_labels(session, payload.label_ids, workspace_id=ws.id)
        await _set_preset_labels(session, preset.id, [label.id for label in labels])
        await session.commit()
        return await _labelled_preset_response(
            session, ws.id, preset, await workspace_account_access(session, user, ws.id)
        )


@router.patch("/presets/labels")
async def change_presets_labels(
    payload: BulkPresetLabelsRequest,
    user: User = Depends(get_current_user),
):
    """Put labels on, or take them off, several rules at once."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "labelling rules")
        presets = await _get_workspace_presets(session, payload.preset_ids, workspace_id=ws.id)
        add = await _get_workspace_labels(session, payload.add_label_ids, workspace_id=ws.id)
        remove = {
            label.id
            for label in await _get_workspace_labels(
                session, payload.remove_label_ids, workspace_id=ws.id
            )
        }
        current = await _preset_label_ids(session, [preset.id for preset in presets])
        changed = 0
        for preset in presets:
            held = current.get(preset.id, [])
            wanted = [label_id for label_id in held if label_id not in remove]
            wanted += [
                label.id for label in add
                if label.id not in wanted and label.id not in remove
            ]
            if wanted != held:
                await _set_preset_labels(session, preset.id, wanted)
                changed += 1
        await session.commit()
        return {"updated_count": changed}


@router.post("/accounts/{account_id}/assign-rule")
async def assign_rule_to_account(
    account_id: str,
    payload: ApplyPresetRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Add a rule/preset to an ad account's rule list."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "attaching rules to an ad account", guest_allowed=True)

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        stmt = select(Account).where(
            Account.account_id == acc_id,
            Account.workspace_id == ws.id,
        )

        res = await session.execute(stmt)
        acc = res.scalar_one_or_none()
        if not acc or not (await workspace_account_access(session, user, ws.id)).allows(acc.account_id):
            raise HTTPException(status_code=404, detail="Ad account not found.")
        await _ensure_stable_account_owner(session, acc)

        # If preset_id provided, load preset
        if payload.preset_id:
            p_stmt = select(RulePreset).where(
                RulePreset.id == payload.preset_id,
                RulePreset.workspace_id == ws.id,
            )
            p_res = await session.execute(p_stmt)
            preset = p_res.scalar_one_or_none()
            if not preset:
                raise HTTPException(status_code=404, detail="Preset not found.")

            new_rule = _preset_snapshot(preset)
            if new_rule.get("needs_review"):
                raise HTTPException(
                    status_code=400,
                    detail="This rule has unsafe or outdated settings. Open it and save it again.",
                )
            new_rule["scope"] = payload.scope.model_dump()
        else:
            raise HTTPException(status_code=400, detail="Custom rules without preset are no longer supported.")

        active_rules = _load_active_rules(acc.active_rules)

        # Check if preset already attached
        if any(r.get("preset_id") == new_rule["preset_id"] for r in active_rules):
            raise HTTPException(status_code=400, detail="This rule is already attached to the ad account.")

        active_rules.append(new_rule)
        _ensure_compatible_rule_set(active_rules)
        acc.active_rules = json.dumps(active_rules)
        automation_was_on = bool(acc.rules_enabled)
        acc.rules_enabled = True
        _record_assistant_change(
            session,
            request,
            ws=ws,
            user=user,
            event_type="ASSISTANT_ATTACH_RULE",
            action="ATTACH",
            message=f"Rule '{new_rule['name']}' attached by the AI assistant.",
            preset_id=new_rule["preset_id"],
            preset_name=new_rule["name"],
            account=acc,
            details={
                "scope": new_rule["scope"],
                "turned_automation_on": not automation_was_on,
            },
        )

        await session.commit()
        return {
            "account_id": acc.account_id,
            "active_rules": active_rules,
            "rules_enabled": acc.rules_enabled,
            "message": f"Rule '{new_rule['name']}' added to the ad account",
        }


@router.put("/accounts/{account_id}/rules/{preset_id}/scope")
async def set_attached_rule_scope(
    account_id: str,
    preset_id: int,
    payload: RuleScopeItem,
    user: User = Depends(get_current_user),
):
    """Re-aim an already attached rule at an account, campaigns or ad sets."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "changing a rule's scope", guest_allowed=True)

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        acc = (
            await session.execute(
                select(Account).where(
                    Account.account_id == acc_id,
                    Account.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if not acc or not (await workspace_account_access(session, user, ws.id)).allows(acc.account_id):
            raise HTTPException(status_code=404, detail="Ad account not found.")
        await _ensure_stable_account_owner(session, acc)

        active_rules = _load_active_rules(acc.active_rules)
        scope = payload.model_dump()
        matched = False
        for rule in active_rules:
            if rule.get("preset_id") == preset_id:
                rule["scope"] = scope
                matched = True
        if not matched:
            raise HTTPException(
                status_code=404,
                detail="This rule is not attached to this ad account.",
            )

        # Narrowing a scope can free a pair of rules that used to contradict
        # each other, and widening one can create a new contradiction.
        _ensure_compatible_rule_set(active_rules)
        acc.active_rules = json.dumps(active_rules)

        await session.commit()
        return {
            "account_id": acc.account_id,
            "active_rules": active_rules,
            "rules_enabled": acc.rules_enabled,
        }


@router.get("/accounts/{account_id}/rules/{preset_id}/preview")
async def preview_rule_on_account_endpoint(
    account_id: str,
    preset_id: int,
    user: User = Depends(get_current_user),
):
    """What attaching this rule to the whole ad account would check (#200).

    Read-only: lists the entities of the rule's level with what the rule sees
    on each on the latest synced numbers, so the buyer attaches knowingly.
    """
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        if ws is None:
            raise HTTPException(status_code=404, detail="Ad account not found.")
        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        acc = (
            await session.execute(
                select(Account).where(
                    Account.account_id == acc_id,
                    Account.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if not acc or not (await workspace_account_access(session, user, ws.id)).allows(acc.account_id):
            raise HTTPException(status_code=404, detail="Ad account not found.")
        preset = (
            await session.execute(
                select(RulePreset).where(
                    RulePreset.id == preset_id,
                    RulePreset.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found.")
        rule = _preset_snapshot(preset)
        if rule.get("needs_review"):
            raise HTTPException(
                status_code=400,
                detail="This rule has unsafe or outdated settings. Open it and save it again.",
            )
        preview = await preview_rule_on_account(session, acc, rule)
        preview["already_attached"] = any(
            item.get("preset_id") == preset.id
            for item in _load_active_rules(acc.active_rules)
        )
        return preview


@router.post("/accounts/{account_id}/detach-rule/{preset_id}")
async def detach_rule_from_account(
    account_id: str,
    preset_id: int,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Remove a specific rule from an ad account's list."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "detaching rules from an ad account", guest_allowed=True)

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        stmt = select(Account).where(
            Account.account_id == acc_id,
            Account.workspace_id == ws.id,
        )

        res = await session.execute(stmt)
        acc = res.scalar_one_or_none()
        if not acc or not (await workspace_account_access(session, user, ws.id)).allows(acc.account_id):
            raise HTTPException(status_code=404, detail="Ad account not found.")

        active_rules = _load_active_rules(acc.active_rules)

        detached = next((r for r in active_rules if r.get("preset_id") == preset_id), None)
        initial_len = len(active_rules)
        active_rules = [r for r in active_rules if r.get("preset_id") != preset_id]

        if len(active_rules) == initial_len:
            raise HTTPException(status_code=404, detail="This rule was not found on this ad account.")

        acc.active_rules = json.dumps(active_rules)
        if len(active_rules) == 0:
            acc.rules_enabled = False
        _record_assistant_change(
            session,
            request,
            ws=ws,
            user=user,
            event_type="ASSISTANT_DETACH_RULE",
            action="DETACH",
            message=f"Rule '{detached.get('name', preset_id)}' detached by the AI assistant.",
            preset_id=preset_id,
            preset_name=str(detached.get("name", "")),
            account=acc,
            details={"turned_automation_off": not active_rules},
        )

        await session.commit()
        return {
            "status": "ok",
            "message": "Rule detached from the ad account.",
            "active_rules": active_rules,
            "rules_enabled": acc.rules_enabled,
        }


@router.post("/accounts/{account_id}/toggle-rules")
async def toggle_rules(account_id: str, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "enabling/disabling rules", guest_allowed=True)

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        stmt = select(Account).where(
            Account.account_id == acc_id,
            Account.workspace_id == ws.id,
        )

        res = await session.execute(stmt)
        acc = res.scalar_one_or_none()
        if not acc or not (await workspace_account_access(session, user, ws.id)).allows(acc.account_id):
            raise HTTPException(status_code=404, detail="Ad account not found.")

        active_rules = _load_active_rules(acc.active_rules)
        if not acc.rules_enabled and not active_rules:
            raise HTTPException(
                status_code=400,
                detail="Attach at least one rule to the ad account first.",
            )

        if not acc.rules_enabled:
            _ensure_compatible_rule_set(active_rules)

        acc.rules_enabled = not acc.rules_enabled
        await session.commit()
        return {
            "account_id": acc.account_id,
            "rules_enabled": acc.rules_enabled,
            "message": f"Automation rules {'enabled' if acc.rules_enabled else 'disabled'}",
        }


@router.get("/presets/{preset_id}/states", response_model=List[RuleEntityStateItem])
async def list_preset_states(preset_id: int, user: User = Depends(get_current_user)):
    """Where one rule stands on each entity it checks (#322)."""
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        preset = (
            await session.execute(
                select(RulePreset.id).where(
                    RulePreset.id == preset_id,
                    RulePreset.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if preset is None:
            raise HTTPException(status_code=404, detail="Preset not found")
        access = await workspace_account_access(session, user, ws.id)
        return await _rule_entity_states(session, ws.id, preset_id=preset_id, access=access)


@router.get("/rule-states", response_model=List[RuleEntityStateItem])
async def list_entity_rule_states(
    entity_level: Literal["campaign", "adset", "ad"],
    entity_id: str = Query(min_length=1, max_length=64),
    user: User = Depends(get_current_user),
):
    """Where each rule aimed at one campaign, ad set or ad stands on it (#322)."""
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        access = await workspace_account_access(session, user, ws.id)
        return await _rule_entity_states(
            session, ws.id, entity_level=entity_level, entity_id=entity_id, access=access
        )
