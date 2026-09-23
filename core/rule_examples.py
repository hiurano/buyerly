import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from core.metrics import validate_runtime_rule
from database.models import (
    RuleExamplesBootstrap,
    RuleGroup,
    RuleGroupItem,
    RulePreset,
    User,
)


RULE_EXAMPLES_VERSION = 1

EXAMPLE_PRESETS: tuple[dict[str, Any], ...] = (
    {
        "key": "stop_no_leads",
        "name": "Example · Stop with no leads after 20",
        "action": "turn_off",
        "conditions": [
            {"metric": "spend", "operator": "gte", "value": 20, "time_window": "today"},
            {"metric": "leads", "operator": "eq", "value": 0, "time_window": "today"},
        ],
        "condition_logic": "and",
        "cooldown_minutes": 60,
        "check_interval_minutes": 5,
    },
    {
        "key": "stop_expensive_lead",
        "name": "Example · Stop expensive leads above 12",
        "action": "turn_off",
        "conditions": [
            {"metric": "cpl", "operator": "gt", "value": 12, "time_window": "today"},
            {"metric": "leads", "operator": "gte", "value": 2, "time_window": "today"},
        ],
        "condition_logic": "and",
        "cooldown_minutes": 120,
        "check_interval_minutes": 5,
    },
    {
        "key": "notify_expensive_registration",
        "name": "Example · Alert on CPReg above 25",
        "action": "notify_only",
        "conditions": [
            {"metric": "cpreg", "operator": "gt", "value": 25, "time_window": "today"},
            {"metric": "registrations", "operator": "gte", "value": 1, "time_window": "today"},
        ],
        "condition_logic": "and",
        "cooldown_minutes": 120,
        "check_interval_minutes": 10,
    },
    {
        "key": "scale_purchases",
        "name": "Example · +20% on cheap purchases",
        "action": "increase_budget",
        "conditions": [
            {"metric": "purchases", "operator": "gte", "value": 2, "time_window": "today"},
            {"metric": "cpp", "operator": "lte", "value": 20, "time_window": "today"},
        ],
        "condition_logic": "and",
        "cooldown_minutes": 360,
        "check_interval_minutes": 15,
        "budget_change_percent": 20,
        "budget_max_daily": 300,
    },
    {
        "key": "reduce_weak_traffic",
        "name": "Example · −20% on weak CTR",
        "action": "decrease_budget",
        "conditions": [
            {"metric": "spend", "operator": "gte", "value": 100, "time_window": "today"},
            {"metric": "ctr", "operator": "lt", "value": 1, "time_window": "today"},
        ],
        "condition_logic": "and",
        "cooldown_minutes": 180,
        "check_interval_minutes": 15,
        "budget_change_percent": 20,
    },
    {
        "key": "reactivate_late_purchase",
        "name": "Example · Turn on when a purchase lands",
        "action": "turn_on",
        "conditions": [
            {"metric": "purchases", "operator": "gte", "value": 1, "time_window": "today"},
        ],
        "condition_logic": "and",
        "cooldown_minutes": 1440,
        "check_interval_minutes": 15,
    },
)

EXAMPLE_GROUPS = (
    {
        "name": "Example · Launch control",
        "icon": "shield",
        "description": (
            "Stop with no leads, alert on an expensive registration, and cut the budget "
            "on weak CTR. Thresholds are measured in each ad account's currency."
        ),
        "preset_keys": (
            "stop_no_leads",
            "notify_expensive_registration",
            "reduce_weak_traffic",
        ),
    },
    {
        "name": "Example · Control and scale",
        "icon": "rocket",
        "description": (
            "Stop expensive leads, raise the budget safely on purchases, "
            "and turn back on after a purchase lands."
        ),
        "preset_keys": (
            "stop_expensive_lead",
            "scale_purchases",
            "reactivate_late_purchase",
        ),
    },
)


def _runtime_payload(definition: dict[str, Any]) -> dict[str, Any]:
    return {
        "action": definition["action"],
        "conditions": definition["conditions"],
        "logic": definition.get("condition_logic", "and"),
        "cooldown_minutes": definition.get("cooldown_minutes", 0),
        "check_interval": definition.get("check_interval_minutes", 5),
        "budget_change_percent": definition.get("budget_change_percent", 0),
        "budget_max_daily": definition.get("budget_max_daily", 0),
    }


async def ensure_rule_examples(session, user: User, *, workspace_id: int) -> bool:
    """Create safe, unassigned examples once; deletion remains permanent."""

    existing = (
        await session.execute(
            select(RuleExamplesBootstrap).where(
                RuleExamplesBootstrap.owner_user_id == user.id,
                RuleExamplesBootstrap.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return False

    marker = RuleExamplesBootstrap(
        workspace_id=workspace_id,
        owner_user_id=user.id,
        version=RULE_EXAMPLES_VERSION,
    )
    session.add(marker)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        return False

    presets_by_key: dict[str, RulePreset] = {}
    for definition in EXAMPLE_PRESETS:
        validate_runtime_rule(_runtime_payload(definition))
        preset = RulePreset(
            workspace_id=workspace_id,
            owner_user_id=user.id,
            name=definition["name"],
            action=definition["action"],
            conditions=definition["conditions"],
            condition_logic=definition.get("condition_logic", "and"),
            cooldown_minutes=definition.get("cooldown_minutes", 0),
            check_interval_minutes=definition.get("check_interval_minutes", 5),
            budget_change_percent=definition.get("budget_change_percent", 0),
            budget_max_daily=definition.get("budget_max_daily", 0),
        )
        session.add(preset)
        presets_by_key[definition["key"]] = preset
    await session.flush()

    for group_definition in EXAMPLE_GROUPS:
        group = RuleGroup(
            workspace_id=workspace_id,
            owner_user_id=user.id,
            name=group_definition["name"],
            description=group_definition["description"],
            icon=group_definition.get("icon", "custom"),
        )
        session.add(group)
        await session.flush()
        for position, preset_key in enumerate(group_definition["preset_keys"]):
            session.add(
                RuleGroupItem(
                    group_id=group.id,
                    preset_id=presets_by_key[preset_key].id,
                    position=position,
                )
            )

    await session.commit()
    return True
