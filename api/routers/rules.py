import json
import logging
import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select

from api.auth import get_current_user
from api.deps import (
    _clean_rule_group_name,
    _ensure_compatible_presets,
    _ensure_compatible_rule_set,
    _ensure_stable_account_owner,
    _get_workspace_presets,
    _load_active_rules,
    _load_group_presets,
    _preset_attachments,
    _preset_last_runs,
    _preset_response,
    _preset_snapshot,
    _rule_group_response,
    _validated_condition_payloads,
    ensure_workspace_write_access,
    get_user_workspace,
    get_user_workspace_member,
)
from api.schemas import (
    ApplyPresetRequest,
    CreatePresetRequest,
    RuleGroupResponse,
    RuleGroupsReorderRequest,
    RuleGroupWriteRequest,
    RuleScopeItem,
    RulePresetItem,
)
from core.rule_examples import ensure_rule_examples
from database.db import async_session_maker
from database.models import (
    Account,
    AuditEvent,
    RuleGroup,
    RuleGroupItem,
    RulePreset,
    User,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Rules & Presets"])


def _grouped_preset_ids(presets_by_group: dict) -> List[int]:
    """Flatten grouped presets into the unique id list an audit lookup needs."""
    return list(
        dict.fromkeys(
            preset.id
            for presets in presets_by_group.values()
            for preset in presets
        )
    )


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
        last_runs = await _preset_last_runs(
            session, ws.id, [preset.id for preset in presets]
        )
        attachments = await _preset_attachments(session, ws.id)
        return [
            _preset_response(
                preset,
                last_runs.get(preset.id, ""),
                attachments.get(preset.id, {}),
            )
            for preset in presets
        ]


@router.post("/presets", response_model=RulePresetItem)
async def create_preset(payload: CreatePresetRequest, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "creating rules")

        condition_payloads = _validated_condition_payloads(payload.conditions)
        preset = RulePreset(
            workspace_id=ws.id if ws else None,
            owner_user_id=user.id,
            name=payload.name.strip() or "New rule",
            action=payload.action or "turn_off",
            level=payload.level,
            enabled=payload.enabled,
            conditions=condition_payloads,
            condition_logic=payload.condition_logic or "and",
            cooldown_minutes=payload.cooldown_minutes or 0,
            check_interval_minutes=payload.check_interval_minutes or 5,
            budget_change_percent=payload.budget_change_percent or 0.0,
            budget_max_daily=payload.budget_max_daily or 0.0,
        )
        session.add(preset)
        await session.commit()
        await session.refresh(preset)
        return _preset_response(preset)


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

        await session.commit()
        await session.refresh(preset)
        last_runs = await _preset_last_runs(session, ws.id, [preset.id])
        attachments = await _preset_attachments(session, ws.id)
        return _preset_response(
            preset,
            last_runs.get(preset.id, ""),
            attachments.get(preset.id, {}),
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

        # Remove the exact preset ID from linked account snapshots in this workspace.
        acc_stmt = select(Account).where(Account.workspace_id == ws.id)
        acc_res = await session.execute(acc_stmt)
        affected_account_ids = []
        for acc in acc_res.scalars().all():
            active_rules = _load_active_rules(acc.active_rules)
            remaining_rules = [r for r in active_rules if r.get("preset_id") != preset_id]
            if len(remaining_rules) != len(active_rules):
                affected_account_ids.append(acc.account_id)
                acc.active_rules = json.dumps(remaining_rules)
                if not remaining_rules:
                    acc.rules_enabled = False

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
        return {"success": True, "message": "Preset deleted"}


@router.get("/rule-groups", response_model=List[RuleGroupResponse])
async def list_rule_groups(user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        ws = await get_user_workspace(session, user)
        await ensure_rule_examples(session, user, workspace_id=ws.id)
        groups = (
            await session.execute(
                select(RuleGroup)
                .where(RuleGroup.workspace_id == ws.id)
                .order_by(RuleGroup.position.asc(), RuleGroup.id.asc())
            )
        ).scalars().all()
        presets_by_group = await _load_group_presets(
            session,
            [group.id for group in groups],
            workspace_id=ws.id,
        )
        last_runs = await _preset_last_runs(
            session, ws.id, _grouped_preset_ids(presets_by_group)
        )
        attachments = await _preset_attachments(session, ws.id)
        return [
            _rule_group_response(
                group, presets_by_group.get(group.id, []), last_runs, attachments
            )
            for group in groups
        ]


@router.put("/rule-groups/reorder", response_model=List[RuleGroupResponse])
async def reorder_rule_groups(
    payload: RuleGroupsReorderRequest,
    user: User = Depends(get_current_user),
):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "reordering rule groups")
        groups = (
            await session.execute(
                select(RuleGroup).where(RuleGroup.workspace_id == ws.id)
            )
        ).scalars().all()
        group_map = {g.id: g for g in groups}

        requested_ids = list(dict.fromkeys(payload.group_ids))
        if len(requested_ids) != len(payload.group_ids):
            raise HTTPException(status_code=400, detail="The group list contains duplicates.")
        inaccessible_ids = [group_id for group_id in requested_ids if group_id not in group_map]
        if inaccessible_ids:
            raise HTTPException(status_code=404, detail="One or more groups are unavailable.")

        for idx, gid in enumerate(requested_ids):
            group_map[gid].position = idx

        await session.commit()

        ordered_groups = (
            await session.execute(
                select(RuleGroup)
                .where(RuleGroup.workspace_id == ws.id)
                .order_by(RuleGroup.position.asc(), RuleGroup.id.asc())
            )
        ).scalars().all()
        presets_by_group = await _load_group_presets(
            session,
            [g.id for g in ordered_groups],
            workspace_id=ws.id,
        )
        last_runs = await _preset_last_runs(
            session, ws.id, _grouped_preset_ids(presets_by_group)
        )
        attachments = await _preset_attachments(session, ws.id)
        return [
            _rule_group_response(
                g, presets_by_group.get(g.id, []), last_runs, attachments
            )
            for g in ordered_groups
        ]


@router.post("/rule-groups", response_model=RuleGroupResponse)
async def create_rule_group(
    payload: RuleGroupWriteRequest,
    user: User = Depends(get_current_user),
):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "creating rule groups")

        presets = await _get_workspace_presets(
            session,
            payload.preset_ids,
            workspace_id=ws.id,
        )
        _ensure_compatible_presets(presets)
        if payload.position is not None:
            position = payload.position
        else:
            max_pos = (
                await session.execute(
                    select(func.max(RuleGroup.position)).where(
                        RuleGroup.workspace_id == ws.id
                    )
                )
            ).scalar()
            position = (max_pos + 1) if max_pos is not None else 0

        group = RuleGroup(
            workspace_id=ws.id if ws else None,
            owner_user_id=user.id,
            name=_clean_rule_group_name(payload.name),
            description=payload.description.strip(),
            icon=payload.icon,
            position=position,
        )
        session.add(group)
        await session.flush()
        session.add_all(
            RuleGroupItem(group_id=group.id, preset_id=preset.id, position=pos)
            for pos, preset in enumerate(presets)
        )
        await session.commit()
        await session.refresh(group)
        last_runs = await _preset_last_runs(
            session, ws.id, [preset.id for preset in presets]
        )
        attachments = await _preset_attachments(session, ws.id)
        return _rule_group_response(group, presets, last_runs, attachments)


@router.put("/rule-groups/{group_id}", response_model=RuleGroupResponse)
async def update_rule_group(
    group_id: int,
    payload: RuleGroupWriteRequest,
    user: User = Depends(get_current_user),
):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "editing rule groups")

        group = (
            await session.execute(
                select(RuleGroup).where(
                    RuleGroup.id == group_id,
                    RuleGroup.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Rule group not found.")

        presets = await _get_workspace_presets(
            session,
            payload.preset_ids,
            workspace_id=ws.id,
        )
        _ensure_compatible_presets(presets)
        group.name = _clean_rule_group_name(payload.name)
        group.description = payload.description.strip()
        group.icon = payload.icon
        if payload.position is not None:
            group.position = payload.position
        await session.execute(delete(RuleGroupItem).where(RuleGroupItem.group_id == group.id))
        session.add_all(
            RuleGroupItem(group_id=group.id, preset_id=preset.id, position=pos)
            for pos, preset in enumerate(presets)
        )
        await session.commit()
        await session.refresh(group)
        last_runs = await _preset_last_runs(
            session, ws.id, [preset.id for preset in presets]
        )
        attachments = await _preset_attachments(session, ws.id)
        return _rule_group_response(group, presets, last_runs, attachments)


@router.delete("/rule-groups/{group_id}")
async def delete_rule_group(
    group_id: int,
    user: User = Depends(get_current_user),
):
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "deleting rule groups")

        group = (
            await session.execute(
                select(RuleGroup).where(
                    RuleGroup.id == group_id,
                    RuleGroup.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Rule group not found.")
        await session.execute(delete(RuleGroupItem).where(RuleGroupItem.group_id == group.id))
        await session.delete(group)
        await session.commit()
        return {"success": True, "message": "Group deleted. The assigned rules were kept on the ad accounts."}


@router.post("/accounts/{account_id}/assign-rule")
async def assign_rule_to_account(
    account_id: str,
    payload: ApplyPresetRequest,
    user: User = Depends(get_current_user),
):
    """Add a rule/preset to an ad account's rule list."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "attaching rules to an ad account")

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        stmt = select(Account).where(
            Account.account_id == acc_id,
            Account.workspace_id == ws.id,
        )

        res = await session.execute(stmt)
        acc = res.scalar_one_or_none()
        if not acc:
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
        acc.rules_enabled = True

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
        ensure_workspace_write_access(user, member, "changing a rule's scope")

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        acc = (
            await session.execute(
                select(Account).where(
                    Account.account_id == acc_id,
                    Account.workspace_id == ws.id,
                )
            )
        ).scalar_one_or_none()
        if not acc:
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


@router.post("/accounts/{account_id}/assign-rule-group/{group_id}")
async def assign_rule_group_to_account(
    account_id: str,
    group_id: int,
    user: User = Depends(get_current_user),
):
    """Atomically attach every rule in a reusable group, skipping duplicates."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "assigning a rule group")

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        account_stmt = select(Account).where(
            Account.account_id == acc_id,
            Account.workspace_id == ws.id,
        )
        account = (await session.execute(account_stmt)).scalar_one_or_none()
        if not account:
            raise HTTPException(status_code=404, detail="Ad account not found.")
        await _ensure_stable_account_owner(session, account)

        group_stmt = select(RuleGroup).where(
            RuleGroup.id == group_id,
            RuleGroup.workspace_id == ws.id,
        )
        group = (await session.execute(group_stmt)).scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Rule group not found.")

        group_items = (
            await session.execute(
                select(RuleGroupItem)
                .where(RuleGroupItem.group_id == group.id)
                .order_by(RuleGroupItem.position, RuleGroupItem.id)
            )
        ).scalars().all()
        if not group_items:
            raise HTTPException(status_code=400, detail="The group has no rules.")

        presets = await _get_workspace_presets(
            session,
            [item.preset_id for item in group_items],
            workspace_id=ws.id,
        )
        active_rules = _load_active_rules(account.active_rules)
        attached_ids = {rule.get("preset_id") for rule in active_rules}
        added_presets = [preset for preset in presets if preset.id not in attached_ids]
        new_snapshots = [_preset_snapshot(preset) for preset in added_presets]
        if any(snapshot.get("needs_review") for snapshot in new_snapshots):
            raise HTTPException(
                status_code=400,
                detail="The group contains an unsafe or outdated rule. Re-save it before assigning.",
            )
        active_rules.extend(new_snapshots)
        _ensure_compatible_rule_set(active_rules)
        account.active_rules = json.dumps(active_rules)
        account.rules_enabled = bool(active_rules)
        await session.commit()

        skipped_count = len(presets) - len(added_presets)
        message = (
            f"Group '{group.name}' assigned: {len(added_presets)} rule(s) added"
            if added_presets
            else f"Every rule in group '{group.name}' is already assigned to this ad account"
        )
        return {
            "account_id": account.account_id,
            "group_id": group.id,
            "group_name": group.name,
            "added_count": len(added_presets),
            "skipped_count": skipped_count,
            "active_rules": active_rules,
            "rules_enabled": account.rules_enabled,
            "message": message,
        }


@router.post("/accounts/{account_id}/detach-rule/{preset_id}")
async def detach_rule_from_account(
    account_id: str,
    preset_id: int,
    user: User = Depends(get_current_user),
):
    """Remove a specific rule from an ad account's list."""
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
        ensure_workspace_write_access(user, member, "detaching rules from an ad account")

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        stmt = select(Account).where(
            Account.account_id == acc_id,
            Account.workspace_id == ws.id,
        )

        res = await session.execute(stmt)
        acc = res.scalar_one_or_none()
        if not acc:
            raise HTTPException(status_code=404, detail="Ad account not found.")

        active_rules = _load_active_rules(acc.active_rules)

        initial_len = len(active_rules)
        active_rules = [r for r in active_rules if r.get("preset_id") != preset_id]

        if len(active_rules) == initial_len:
            raise HTTPException(status_code=404, detail="This rule was not found on this ad account.")

        acc.active_rules = json.dumps(active_rules)
        if len(active_rules) == 0:
            acc.rules_enabled = False

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
        ensure_workspace_write_access(user, member, "enabling/disabling rules")

        acc_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
        stmt = select(Account).where(
            Account.account_id == acc_id,
            Account.workspace_id == ws.id,
        )

        res = await session.execute(stmt)
        acc = res.scalar_one_or_none()
        if not acc:
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
