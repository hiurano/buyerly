"""The rules engine's captures for the TypeScript shadow run (#611 stage 4).

The first test checks what one cycle leaves in RULES_SHADOW_DIR. The second
drives the real monitoring cycle through many random accounts, rules and
metric changes over several cycles (stop confirmations, cooldowns, budgets,
undos, manual turn-ons): with RULES_SHADOW_DIR set (the server job in CI),
its captures are the cases server/test/rules/decide.test.ts replays through
the TypeScript engine, which must decide exactly as this one did.
"""

import gzip
import json
import os
import random
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from database.models import Account, AppSettings, AuditEvent, User, Workspace, WorkspaceMember
from scheduler.worker import MonitoringWorker
from tests.test_db_helper import create_test_engine, init_test_db
from tests.test_integration import MockMetaClient

WINDOWS = ["today", "yesterday", "last_3d", "last_7d", "lifetime"]
METRICS = ["spend", "cpl", "cpreg", "cpp", "leads", "registrations", "purchases", "ctr", "cpc", "clicks"]
OPERATORS = ["gt", "gte", "lt", "lte", "eq"]
ACTIONS = ["turn_off", "turn_off", "notify_only", "turn_on", "increase_budget", "decrease_budget"]
ZONES = ["HST", "Europe/Berlin", "Asia/Kolkata", "America/St_Johns", "UTC", "Australia/Lord_Howe"]


class ScenarioMeta(MockMetaClient):
    """The integration tests' fake Meta with random ad sets, ads and campaigns."""

    def __init__(self, rng: random.Random, currency: str, zone: str):
        super().__init__()
        self.rng = rng
        self.currency = currency
        self.zone = zone
        self.adsets_state = {}
        self.ads_state = {}
        self.campaigns_state = {}
        for c in range(rng.randint(1, 2)):
            campaign_id = f"cmp_{c}"
            self.campaigns_state[campaign_id] = {
                "campaign_id": campaign_id,
                "campaign_name": f"Campaign {c}",
                "status": rng.choice(["ACTIVE", "ACTIVE", "PAUSED"]),
                "effective_status": "ACTIVE",
                "daily_budget": rng.choice([0.0, 40.0, 100.0]),
            }
        for a in range(rng.randint(1, 4)):
            adset_id = f"as_{a}"
            status = rng.choice(["ACTIVE", "ACTIVE", "ACTIVE", "PAUSED"])
            self.adsets_state[adset_id] = {
                "adset_id": adset_id,
                "adset_name": f"Ad set {a}",
                "campaign_id": rng.choice(list(self.campaigns_state)),
                "status": status,
                "effective_status": status,
                "daily_budget": rng.choice([0.0, 20.0, 33.33, 50.0, 7.5]),
                **self.metrics(),
            }
        for d in range(rng.randint(0, 3)):
            ad_id = f"ad_{d}"
            adset = self.adsets_state[rng.choice(list(self.adsets_state))]
            self.ads_state[ad_id] = {
                "ad_id": ad_id,
                "ad_name": f"Ad {d}",
                "adset_id": adset["adset_id"],
                "campaign_id": adset["campaign_id"],
                "status": "ACTIVE",
                "effective_status": "ACTIVE",
                **self.metrics(),
            }
        self.reshuffle_windows()

    def metrics(self) -> dict:
        rng = self.rng
        spend = rng.choice([0.0, 0.5, 4.99, 5.0, 12.345, 25.0, 80.0, 250.0])
        impressions = rng.choice([0, 10, 1000])
        clicks = rng.choice([0, 1, 7]) if impressions else 0
        return {
            "spend": spend,
            "leads": rng.choice([0, 0, 1, 3]),
            "registrations": rng.choice([0, 1]),
            "purchases": rng.choice([0, 0, 2]),
            "impressions": impressions,
            "clicks": clicks,
            "link_clicks": clicks,
            "ctr": (clicks / impressions * 100) if impressions else 0.0,
            "cpc": (spend / clicks) if clicks else 0.0,
        }

    def reshuffle_windows(self) -> None:
        self.insights_by_window = {
            preset: {key: {**row, **self.metrics()} for key, row in self.adsets_state.items()}
            for preset in ("yesterday", "last_3d", "last_7d", "maximum")
        }
        self.ads_by_window = {
            preset: {key: {**row, **self.metrics()} for key, row in self.ads_state.items()}
            for preset in ("yesterday", "last_3d", "last_7d", "maximum")
        }

    def drift(self) -> None:
        """Metrics move between checks; sometimes a person turns a stopped ad set back on in Meta."""
        for row in self.adsets_state.values():
            if self.rng.random() < 0.5:
                row.update(self.metrics())
            if row["status"] == "PAUSED" and self.rng.random() < 0.25:
                row["status"] = row["effective_status"] = "ACTIVE"
        for row in self.ads_state.values():
            if self.rng.random() < 0.5:
                row.update(self.metrics())
        if self.rng.random() < 0.3:
            self.reshuffle_windows()

    async def get_account_info(self, account_id, access_token, *, priority="normal"):
        return {
            "id": account_id,
            "name": "Scenario",
            "timezone_name": self.zone,
            "currency": self.currency,
            "account_status": 1,
            "status_label": "Active (ACTIVE)",
        }

    async def get_campaigns_insights(self, account_id, access_token, date_preset="today", currency="UNKNOWN", priority="normal"):
        return [{**campaign, **self.metrics()} for campaign in self.campaigns_state.values()]

    async def update_campaign_budget(self, campaign_id, access_token, new_daily_budget_dollars, *args, **kwargs):
        self.campaigns_state[campaign_id]["daily_budget"] = new_daily_budget_dollars
        return True


def random_rule(rng: random.Random, preset_id: int, workspace_id: int) -> dict:
    action = rng.choice(ACTIONS)
    conditions = []
    for _ in range(rng.randint(1, 3)):
        metric = rng.choice(METRICS)
        conditions.append(
            {
                "metric": metric,
                "operator": rng.choice(OPERATORS),
                "value": rng.choice([0, 0.0, 1, 2.5, 5, 10.0, 20, 100]),
                "time_window": rng.choice(WINDOWS),
            }
        )
    rule = {
        "preset_id": preset_id,
        "workspace_id": workspace_id,
        "name": f"Rule {preset_id} {action}",
        "action": action,
        "level": rng.choice(["adset", "adset", "campaign", "ad"]),
        "logic": rng.choice(["and", "or"]),
        "conditions": conditions,
        "cooldown_minutes": rng.choice([0, 0, 5, 60]),
        "check_interval": 1,
    }
    if action in {"increase_budget", "decrease_budget"}:
        rule["budget_change_percent"] = rng.choice([10, 15.5, 25.0, 50])
        rule["budget_max_daily"] = rng.choice([0, 30, 55.5, 1000.0])
    return rule


class RulesShadowCaptureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        import scheduler.worker as worker_module

        self.worker_module = worker_module
        self._previous_maker = worker_module.async_session_maker
        worker_module.async_session_maker = self.sessions
        self.temporary = tempfile.TemporaryDirectory()

    async def asyncTearDown(self):
        self.worker_module.async_session_maker = self._previous_maker
        self.temporary.cleanup()
        await self.engine.dispose()

    async def _workspace(self, session, name: str) -> tuple[int, int]:
        user = User(telegram_id=f"7{abs(hash(name)) % 10**9}", username=name, full_name=name, role="buyer", is_approved=True)
        session.add(user)
        await session.flush()
        workspace = Workspace(name=name, slug=name, owner_user_id=user.id)
        session.add(workspace)
        await session.flush()
        session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
        return user.id, workspace.id

    async def test_a_cycle_leaves_what_it_saw_and_decided(self):
        async with self.sessions() as session:
            user_id, workspace_id = await self._workspace(session, "shadow-one")
            session.add(
                Account(
                    account_id="act_shadow_1",
                    name="Shadow",
                    access_token="token",
                    owner_user_id=user_id,
                    workspace_id=workspace_id,
                    timezone_name="HST",
                    currency="USD",
                    rules_enabled=True,
                    is_active=True,
                    active_rules=json.dumps(
                        [
                            {
                                "preset_id": 1,
                                "workspace_id": workspace_id,
                                "name": "Stop spend without leads",
                                "action": "turn_off",
                                "conditions": [
                                    {"metric": "spend", "operator": "gte", "value": 10.0, "time_window": "today"},
                                    {"metric": "leads", "operator": "eq", "value": 0.0, "time_window": "today"},
                                ],
                                "logic": "and",
                            }
                        ]
                    ),
                )
            )
            session.add(AppSettings(stop_confirmation_minutes=0))
            await session.commit()

        with patch.dict(os.environ, {"RULES_SHADOW_DIR": self.temporary.name}):
            worker = MonitoringWorker(meta_client=MockMetaClient(), clock=lambda: 10_000.0)
            worker._sleep = _no_sleep
            await worker.run_cycle()

        files = sorted(Path(self.temporary.name).glob("*.json.gz"))
        self.assertEqual(len(files), 1)
        capture = json.loads(gzip.decompress(files[0].read_bytes()))
        self.assertEqual(capture["account"]["account_id"], "act_shadow_1")
        self.assertEqual(capture["now"], 10_000.0)
        self.assertEqual([rule["preset_id"] for rule in capture["due_rules"]], [1])
        self.assertIn("adset_1", capture["entity_windows"])
        acted = capture["python"]["actions"]
        self.assertEqual([(a["entity_id"], a["action"], a["desired_state"]) for a in acted], [("adset_1", "STOP", {"status": "PAUSED"})])
        fired = [o for o in capture["python"]["outcomes"] if o["state"] == "fired"]
        self.assertEqual([o["entity_id"] for o in fired], ["adset_1"])
        self.assertFalse(capture["python"]["stopped_early"])

    async def test_no_capture_without_a_directory(self):
        async with self.sessions() as session:
            user_id, workspace_id = await self._workspace(session, "shadow-off")
            session.add(
                Account(
                    account_id="act_shadow_off", name="Off", access_token="token", owner_user_id=user_id,
                    workspace_id=workspace_id, timezone_name="HST", currency="USD", rules_enabled=True, is_active=True,
                    active_rules=json.dumps([{"preset_id": 1, "workspace_id": workspace_id, "name": "r", "action": "notify_only",
                                              "conditions": [{"metric": "spend", "operator": "gte", "value": 1, "time_window": "today"}]}]),
                )
            )
            await session.commit()
        with patch.dict(os.environ, {"RULES_SHADOW_DIR": ""}):
            worker = MonitoringWorker(meta_client=MockMetaClient(), clock=lambda: 10_000.0)
            worker._sleep = _no_sleep
            stats = await worker.run_cycle()
        self.assertEqual(stats["errors"], [])
        self.assertEqual(list(Path(self.temporary.name).iterdir()), [])

    async def test_random_scenarios_over_several_cycles(self):
        directory = os.environ.get("RULES_SHADOW_DIR") or self.temporary.name
        scenarios = int(os.environ.get("RULES_SHADOW_SCENARIOS", "12"))
        rng = random.Random(611)
        start = time.time()
        for scenario in range(scenarios):
            await self._scenario(rng, scenario, directory, start)
        self.assertTrue(list(Path(directory).glob("*.json.gz")))

    async def _scenario(self, rng: random.Random, scenario: int, directory: str, start: float) -> None:
        await init_test_db(self.engine)
        zone = rng.choice(ZONES)
        currency = rng.choice(["USD", "EUR", "JPY", "UNKNOWN"])
        async with self.sessions() as session:
            user_id, workspace_id = await self._workspace(session, f"shadow-{scenario}")
            rules = [random_rule(rng, preset_id, workspace_id) for preset_id in range(1, rng.randint(2, 6))]
            session.add(
                Account(
                    account_id=f"act_scn_{scenario}",
                    name=f"Scenario {scenario}",
                    access_token="token",
                    owner_user_id=user_id,
                    workspace_id=workspace_id,
                    timezone_name=zone,
                    currency=currency,
                    rules_enabled=True,
                    is_active=True,
                    active_rules=json.dumps(rules),
                )
            )
            session.add(
                AppSettings(
                    poll_interval_minutes=1,
                    critical_rule_interval_minutes=1,
                    stop_confirmation_minutes=rng.choice([0, 2, 3]),
                )
            )
            await session.commit()

        meta = ScenarioMeta(rng, currency, zone)
        clock = [start]
        worker = MonitoringWorker(meta_client=meta, clock=lambda: clock[0])
        worker._sleep = _no_sleep
        with patch.dict(os.environ, {"RULES_SHADOW_DIR": directory}):
            for _ in range(rng.randint(4, 8)):
                clock[0] += rng.choice([61, 61, 125, 400, 3700])
                await worker.run_cycle()
                meta.drift()
                if rng.random() < 0.3:
                    await self._undo_a_rule_action(rng, f"act_scn_{scenario}", workspace_id)

    async def _undo_a_rule_action(self, rng: random.Random, account_id: str, workspace_id: int) -> None:
        async with self.sessions() as session:
            actions = (
                await session.execute(
                    select(AuditEvent).where(
                        AuditEvent.account_id == account_id,
                        AuditEvent.category == "RULE_ACTION",
                        AuditEvent.actor_type == "system",
                        AuditEvent.status == "SUCCESS",
                    )
                )
            ).scalars().all()
            if not actions:
                return
            source = rng.choice(actions)
            session.add(
                AuditEvent(
                    workspace_id=workspace_id,
                    account_id=account_id,
                    entity_id=source.entity_id,
                    event_type=rng.choice(["UNDO_ACTION", "MANUAL_REACTIVATE"]),
                    category="MANUAL_ACTION",
                    actor_type="user",
                    actor_id="1",
                    status="SUCCESS",
                    reverts_event_id=source.id,
                )
            )
            await session.commit()


async def _no_sleep(_seconds: float) -> None:
    return None


if __name__ == "__main__":
    unittest.main()
