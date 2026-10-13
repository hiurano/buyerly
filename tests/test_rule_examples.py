import asyncio
import unittest

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.metrics import validate_runtime_rule
from core.rule_examples import (
    EXAMPLE_LABELS,
    EXAMPLE_PRESETS,
    RULE_EXAMPLES_VERSION,
    _runtime_payload,
    ensure_rule_examples,
)
from database.models import (
    Account,
    RuleExamplesBootstrap,
    RuleGroup,
    RuleGroupItem,
    RulePreset,
    User,
    Workspace,
    WorkspaceMember,
)
from tests.test_db_helper import create_test_engine, init_test_db


NL_RULES = [
    ("$3 and no click", [("spend", "gte", 3), ("link_clicks", "eq", 0)]),
    ("$3.50 and one click", [("spend", "gte", 3.5), ("link_clicks", "lte", 1)]),
    ("$4 and no lead", [("spend", "gte", 4), ("leads", "eq", 0)]),
    (
        "$7 and no registration",
        [("spend", "gte", 7), ("registrations", "eq", 0), ("leads", "lte", 1)],
    ),
    ("$12 ceiling", [("spend", "gte", 12)]),
]


class TestExampleDefinitions(unittest.TestCase):
    def test_the_set_is_the_nl_launch_ladder(self):
        self.assertEqual(RULE_EXAMPLES_VERSION, 2)
        self.assertEqual(
            [
                (
                    preset["name"],
                    [
                        (condition["metric"], condition["operator"], condition["value"])
                        for condition in preset["conditions"]
                    ],
                )
                for preset in EXAMPLE_PRESETS
            ],
            NL_RULES,
        )
        for preset in EXAMPLE_PRESETS:
            validate_runtime_rule(_runtime_payload(preset))
            self.assertEqual(preset["action"], "turn_off")
            self.assertEqual(preset["level"], "adset")
            self.assertEqual(preset["check_interval_minutes"], 5)
            self.assertEqual(
                {condition["time_window"] for condition in preset["conditions"]},
                {"lifetime"},
            )

    def test_one_label_says_where_to_attach_and_fits_the_label_form(self):
        self.assertEqual([label["name"] for label in EXAMPLE_LABELS], ["NL launch"])
        label = EXAMPLE_LABELS[0]
        self.assertLessEqual(len(label["description"]), 500)
        self.assertIn("test campaigns", label["description"])
        self.assertIn("currency", label["description"])
        self.assertEqual(
            list(label["preset_keys"]),
            [preset["key"] for preset in EXAMPLE_PRESETS],
        )

    def test_the_simulator_replays_the_same_rules(self):
        from scripts.rule_simulator import CHEAT_SHEET_RULES

        self.assertEqual(
            [
                (name, [(metric, operator, float(value)) for metric, operator, value in conditions])
                for name, conditions in NL_RULES
            ],
            CHEAT_SHEET_RULES,
        )


class TestRuleExamples(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        await init_test_db(self.engine)

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def _workspace(self, session, slug: str, *member_names: str):
        users = [
            User(telegram_id=f"{slug}-{name}", username=f"{slug}_{name}", is_approved=True)
            for name in member_names
        ]
        session.add_all(users)
        await session.flush()
        workspace = Workspace(name=slug.title(), slug=slug, owner_user_id=users[0].id)
        session.add(workspace)
        await session.flush()
        for index, user in enumerate(users):
            session.add(
                WorkspaceMember(
                    workspace_id=workspace.id,
                    user_id=user.id,
                    role="owner" if index == 0 else "buyer",
                )
            )
            user.active_workspace_id = workspace.id
        await session.commit()
        return workspace, users

    async def _count(self, session, model, *where) -> int:
        return (
            await session.execute(select(func.count()).select_from(model).where(*where))
        ).scalar_one()

    async def test_a_new_workspace_gets_the_nl_launch_set_unattached_once(self):
        async with self.sessions() as session:
            workspace, (user,) = await self._workspace(session, "examples", "owner")
            account = Account(
                account_id="act_examples",
                name="Examples account",
                access_token="token",
                currency="USD",
                rules_enabled=False,
                workspace_id=workspace.id,
                owner_user_id=user.id,
            )
            session.add(account)
            await session.commit()

            self.assertTrue(await ensure_rule_examples(session, user, workspace_id=workspace.id))

            presets = (
                await session.execute(
                    select(RulePreset)
                    .where(RulePreset.workspace_id == workspace.id)
                    .order_by(RulePreset.id)
                )
            ).scalars().all()
            labels = (
                await session.execute(
                    select(RuleGroup).where(RuleGroup.workspace_id == workspace.id)
                )
            ).scalars().all()
            self.assertEqual(
                [
                    (
                        preset.name,
                        [
                            (condition["metric"], condition["operator"], condition["value"])
                            for condition in preset.conditions
                        ],
                    )
                    for preset in presets
                ],
                NL_RULES,
            )
            self.assertTrue(all(preset.level == "adset" for preset in presets))
            self.assertTrue(all(preset.check_interval_minutes == 5 for preset in presets))
            self.assertEqual([label.name for label in labels], ["NL launch"])
            self.assertEqual(labels[0].description, EXAMPLE_LABELS[0]["description"])
            items = (
                await session.execute(
                    select(RuleGroupItem)
                    .where(RuleGroupItem.group_id == labels[0].id)
                    .order_by(RuleGroupItem.position)
                )
            ).scalars().all()
            self.assertEqual([item.preset_id for item in items], [preset.id for preset in presets])

            await session.refresh(account)
            self.assertFalse(account.rules_enabled)
            self.assertEqual(account.active_rules, "[]")

            markers = (
                await session.execute(
                    select(RuleExamplesBootstrap).where(
                        RuleExamplesBootstrap.workspace_id == workspace.id
                    )
                )
            ).scalars().all()
            self.assertEqual(
                [(marker.owner_user_id, marker.version) for marker in markers],
                [(user.id, 2)],
            )

            # Deletion is permanent: the examples are not created again.
            await session.execute(delete(RulePreset).where(RulePreset.id == presets[0].id))
            await session.execute(delete(RuleGroup).where(RuleGroup.id == labels[0].id))
            await session.commit()
            self.assertFalse(await ensure_rule_examples(session, user, workspace_id=workspace.id))
            self.assertEqual(
                await self._count(session, RulePreset, RulePreset.workspace_id == workspace.id),
                len(EXAMPLE_PRESETS) - 1,
            )
            self.assertEqual(
                await self._count(session, RuleGroup, RuleGroup.workspace_id == workspace.id),
                0,
            )

    async def test_a_team_gets_one_set_not_one_per_member(self):
        async with self.sessions() as session:
            workspace, (owner, first, second) = await self._workspace(
                session, "team", "owner", "first", "second"
            )

            self.assertTrue(await ensure_rule_examples(session, first, workspace_id=workspace.id))
            self.assertFalse(await ensure_rule_examples(session, second, workspace_id=workspace.id))
            self.assertFalse(await ensure_rule_examples(session, owner, workspace_id=workspace.id))

            self.assertEqual(
                await self._count(session, RulePreset, RulePreset.workspace_id == workspace.id),
                len(EXAMPLE_PRESETS),
            )
            self.assertEqual(
                await self._count(session, RuleGroup, RuleGroup.workspace_id == workspace.id),
                1,
            )
            # The marker sits on the owner, whoever opened Rules first.
            markers = (
                await session.execute(
                    select(RuleExamplesBootstrap.owner_user_id).where(
                        RuleExamplesBootstrap.workspace_id == workspace.id
                    )
                )
            ).scalars().all()
            self.assertEqual(markers, [owner.id])

    async def test_members_opening_rules_at_once_create_one_set(self):
        async with self.sessions() as session:
            workspace, members = await self._workspace(
                session, "race", "owner", "first", "second"
            )

        async def open_rules(user):
            async with self.sessions() as session:
                return await ensure_rule_examples(session, user, workspace_id=workspace.id)

        created = await asyncio.gather(*(open_rules(user) for user in members))

        self.assertEqual(sorted(created), [False, False, True])
        async with self.sessions() as session:
            self.assertEqual(
                await self._count(session, RulePreset, RulePreset.workspace_id == workspace.id),
                len(EXAMPLE_PRESETS),
            )

    async def test_a_workspace_with_the_old_examples_gets_the_nl_set_once(self):
        async with self.sessions() as session:
            workspace, (owner, member) = await self._workspace(session, "legacy", "owner", "member")
            # Version 1 left a marker per member and its own examples, which
            # may have been edited since.
            old_rule = RulePreset(
                workspace_id=workspace.id,
                owner_user_id=member.id,
                name="Example · Stop with no leads after 20",
                action="turn_off",
                conditions=[
                    {"metric": "spend", "operator": "gte", "value": 25, "time_window": "today"},
                    {"metric": "leads", "operator": "eq", "value": 0, "time_window": "today"},
                ],
            )
            old_label = RuleGroup(
                workspace_id=workspace.id,
                owner_user_id=member.id,
                name="Example · Launch control",
            )
            session.add_all(
                [
                    old_rule,
                    old_label,
                    RuleExamplesBootstrap(workspace_id=workspace.id, owner_user_id=owner.id, version=1),
                    RuleExamplesBootstrap(workspace_id=workspace.id, owner_user_id=member.id, version=1),
                ]
            )
            await session.commit()

            self.assertTrue(await ensure_rule_examples(session, member, workspace_id=workspace.id))
            self.assertFalse(await ensure_rule_examples(session, owner, workspace_id=workspace.id))
            self.assertFalse(await ensure_rule_examples(session, member, workspace_id=workspace.id))

            names = (
                await session.execute(
                    select(RulePreset.name)
                    .where(RulePreset.workspace_id == workspace.id)
                    .order_by(RulePreset.id)
                )
            ).scalars().all()
            self.assertEqual(
                names,
                ["Example · Stop with no leads after 20", *[name for name, _ in NL_RULES]],
            )
            await session.refresh(old_rule)
            self.assertEqual(old_rule.conditions[0]["value"], 25)
            label_names = (
                await session.execute(
                    select(RuleGroup.name)
                    .where(RuleGroup.workspace_id == workspace.id)
                    .order_by(RuleGroup.id)
                )
            ).scalars().all()
            self.assertEqual(label_names, ["Example · Launch control", "NL launch"])
            markers = (
                await session.execute(
                    select(RuleExamplesBootstrap.owner_user_id, RuleExamplesBootstrap.version)
                    .where(RuleExamplesBootstrap.workspace_id == workspace.id)
                    .order_by(RuleExamplesBootstrap.owner_user_id)
                )
            ).all()
            self.assertEqual([tuple(row) for row in markers], [(owner.id, 2), (member.id, 1)])

    async def test_a_workspace_whose_owner_never_opened_rules_gets_an_owner_marker(self):
        async with self.sessions() as session:
            workspace, (owner, member) = await self._workspace(session, "nomarker", "owner", "member")
            session.add(
                RuleExamplesBootstrap(workspace_id=workspace.id, owner_user_id=member.id, version=1)
            )
            await session.commit()

            self.assertTrue(await ensure_rule_examples(session, member, workspace_id=workspace.id))
            self.assertFalse(await ensure_rule_examples(session, member, workspace_id=workspace.id))
            versions = dict(
                (
                    await session.execute(
                        select(RuleExamplesBootstrap.owner_user_id, RuleExamplesBootstrap.version)
                        .where(RuleExamplesBootstrap.workspace_id == workspace.id)
                    )
                ).all()
            )
            self.assertEqual(versions, {owner.id: 2, member.id: 1})

    async def test_each_workspace_receives_its_own_set(self):
        async with self.sessions() as session:
            first_workspace, (first,) = await self._workspace(session, "first", "owner")
            second_workspace, (second,) = await self._workspace(session, "second", "owner")

            await ensure_rule_examples(session, first, workspace_id=first_workspace.id)
            await ensure_rule_examples(session, second, workspace_id=second_workspace.id)

            for workspace in (first_workspace, second_workspace):
                self.assertEqual(
                    await self._count(session, RulePreset, RulePreset.workspace_id == workspace.id),
                    len(EXAMPLE_PRESETS),
                )
