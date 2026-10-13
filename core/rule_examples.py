"""Ready-made rules every workspace starts with (#386).

The set is a Netherlands lead-gen buyer's ad set test ladder: every dollar
must buy the next step — a link click, a lead, a registration — or the ad set
is dead. `scripts/rule_simulator.py` replays these same rules, so the set and
the simulator cannot drift apart.

Examples are created once per workspace, unattached, under one label. A
version marker remembers what a workspace already got: deleting an example is
permanent, and a new version adds its set once without touching the rules an
older version created (they may have been edited or attached since).
"""

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
    Workspace,
)


# 1: the first six examples in two groups. 2: the NL launch ladder.
RULE_EXAMPLES_VERSION = 2

# Spend since launch: a test ad set is judged on everything it ever spent.
EXAMPLE_TIME_WINDOW = "lifetime"


def _turn_off(key: str, name: str, *conditions: tuple[str, str, float]) -> dict[str, Any]:
    return {
        "key": key,
        "name": name,
        "action": "turn_off",
        "level": "adset",
        "conditions": [
            {"metric": metric, "operator": operator, "value": value, "time_window": EXAMPLE_TIME_WINDOW}
            for metric, operator, value in conditions
        ],
        "condition_logic": "and",
        # Once a day, the rule form's default: a buyer who turns the ad set
        # back on by hand is not overruled again within minutes.
        "cooldown_minutes": 1440,
        "check_interval_minutes": 5,
    }


# The card's thresholds. $3, not $3.20: a stop lands about 12 minutes after
# the condition holds (Meta's report, the STOP confirmation, the check
# interval), so the ad set really stops at $3.00–3.20. At $7 a second lead
# earns the ad set the run to $12, hence "Leads ≤ 1". The card's "wait",
# "keep running" and "overtime" rows are not actions and need no rule.
EXAMPLE_PRESETS: tuple[dict[str, Any], ...] = (
    _turn_off("nl_no_click", "$3 and no click", ("spend", "gte", 3), ("link_clicks", "eq", 0)),
    _turn_off("nl_one_click", "$3.50 and one click", ("spend", "gte", 3.5), ("link_clicks", "lte", 1)),
    _turn_off("nl_no_lead", "$4 and no lead", ("spend", "gte", 4), ("leads", "eq", 0)),
    _turn_off(
        "nl_no_registration",
        "$7 and no registration",
        ("spend", "gte", 7),
        ("registrations", "eq", 0),
        ("leads", "lte", 1),
    ),
    _turn_off("nl_ceiling", "$12 ceiling", ("spend", "gte", 12)),
)

EXAMPLE_LABELS: tuple[dict[str, Any], ...] = (
    {
        "name": "NL launch",
        "color": "#f2994a",
        "description": (
            "Every dollar must buy the next step: no link click by $3.20, no lead by $4, "
            "no registration by $7 — the ad set is dead. Don't cut before $3 and don't "
            "push past $7 for “a bit more”. Attach to test campaigns, not the whole ad "
            "account: the $12 ceiling turns off any ad set that spent $12, working ones "
            "too. Amounts are in the ad account's currency; adjust them for accounts not "
            "in dollars."
        ),
        "preset_keys": tuple(preset["key"] for preset in EXAMPLE_PRESETS),
    },
)


def _runtime_payload(definition: dict[str, Any]) -> dict[str, Any]:
    return {
        "action": definition["action"],
        "level": definition.get("level", "adset"),
        "conditions": definition["conditions"],
        "logic": definition.get("condition_logic", "and"),
        "cooldown_minutes": definition.get("cooldown_minutes", 0),
        "check_interval": definition.get("check_interval_minutes", 5),
        "budget_change_percent": definition.get("budget_change_percent", 0),
        "budget_max_daily": definition.get("budget_max_daily", 0),
    }


async def ensure_rule_examples(session, user: User, *, workspace_id: int) -> bool:
    """Add the current example set to the workspace once, whoever opens Rules first.

    The marker belongs to the workspace owner, so a team of N members gets
    one set, not N. The workspace row lock makes two members opening Rules
    at the same moment wait for each other instead of both creating it.
    """

    async def workspace_markers() -> list[RuleExamplesBootstrap]:
        return list(
            (
                await session.execute(
                    select(RuleExamplesBootstrap).where(
                        RuleExamplesBootstrap.workspace_id == workspace_id,
                    )
                )
            ).scalars().all()
        )

    def up_to_date(markers: list[RuleExamplesBootstrap]) -> bool:
        return any(marker.version >= RULE_EXAMPLES_VERSION for marker in markers)

    # Every Rules page load asks; only the first one in a workspace locks.
    if up_to_date(await workspace_markers()):
        return False

    workspace = (
        await session.execute(
            select(Workspace).where(Workspace.id == workspace_id).with_for_update()
        )
    ).scalar_one_or_none()
    if workspace is None:
        return False
    markers = await workspace_markers()
    if up_to_date(markers):
        await session.commit()
        return False

    owner_id = workspace.owner_user_id or user.id
    owner_marker = next((marker for marker in markers if marker.owner_user_id == owner_id), None)
    if owner_marker is None:
        session.add(
            RuleExamplesBootstrap(
                workspace_id=workspace_id,
                owner_user_id=owner_id,
                version=RULE_EXAMPLES_VERSION,
            )
        )
    else:
        # Their v1 marker stays the workspace's one row; the old examples
        # it stands for are left as they are.
        owner_marker.version = RULE_EXAMPLES_VERSION
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
            level=definition.get("level", "adset"),
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

    for label_definition in EXAMPLE_LABELS:
        label = RuleGroup(
            workspace_id=workspace_id,
            owner_user_id=user.id,
            name=label_definition["name"],
            description=label_definition["description"],
            color=label_definition["color"],
        )
        session.add(label)
        await session.flush()
        for position, preset_key in enumerate(label_definition["preset_keys"]):
            session.add(
                RuleGroupItem(
                    group_id=label.id,
                    preset_id=presets_by_key[preset_key].id,
                    position=position,
                )
            )

    await session.commit()
    return True
