"""A worker that stops finishing monitoring cycles is reported (#199).

The heartbeat proves only that the worker process is alive; these tests age
``finished_at`` of the last completed cycle the way a stuck cycle would and
check every signal an operator gets: /health/worker, the overview and an
urgent Inbox notification that is delivered while the worker is stalled.
"""

import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.routers.audit as audit_module
import api.routers.health as health_module
import api.server as api_server_module
import database.db as database_db
import services.worker_watchdog as watchdog
from api.server import create_app
from core.config import settings
from core.rate_limit import limiter
from database.models import Account, AuditEvent, AutomationRuntimeState, User, Workspace, WorkspaceMember
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

OWNER = {"id": 7300000001, "first_name": "Owner", "username": "watchdog_owner"}


class TestCycleStatus(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)

    def at(self, seconds_ago):
        return {"finished_at": (self.now - timedelta(seconds=seconds_ago)).isoformat(), "errors_count": 0}

    def test_thresholds_are_three_and_six_monitoring_intervals(self):
        self.assertEqual(watchdog.WARNING_LAG_SECONDS, 3 * watchdog.MONITORING_INTERVAL_SECONDS)
        self.assertEqual(watchdog.CRITICAL_LAG_SECONDS, 6 * watchdog.MONITORING_INTERVAL_SECONDS)

    def test_status_follows_the_age_of_the_last_completed_cycle(self):
        self.assertEqual(watchdog.cycle_status(self.at(30), self.now)["status"], "ok")
        self.assertEqual(watchdog.cycle_status(self.at(179), self.now)["status"], "ok")
        self.assertEqual(watchdog.cycle_status(self.at(180), self.now)["status"], "warning")
        self.assertEqual(watchdog.cycle_status(self.at(360), self.now)["status"], "critical")
        self.assertEqual(watchdog.cycle_status(self.at(432), self.now)["lag_seconds"], 432)

    def test_a_worker_that_never_finished_a_cycle_is_unknown_not_stalled(self):
        for payload in (None, {}, {"finished_at": "not a date"}):
            self.assertEqual(watchdog.cycle_status(payload, self.now)["status"], "unknown")

    def test_naive_timestamps_are_read_as_utc(self):
        payload = {"finished_at": (self.now - timedelta(seconds=400)).replace(tzinfo=None).isoformat()}
        self.assertEqual(watchdog.cycle_status(payload, self.now)["status"], "critical")


class TestWorkerWatchdog(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        api_routes_module._summary_cache.clear()
        await limiter.reset()
        self.engine = create_test_engine()
        self.session_maker = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        for module in (api_routes_module, api_auth_module, api_server_module, audit_module, health_module, watchdog):
            patcher = mock.patch.object(module, "async_session_maker", self.session_maker)
            patcher.start()
            self.addCleanup(patcher.stop)
        settings.ADMIN_CHAT_ID = "1"
        self.headers = await session_headers(self.session_maker, OWNER)
        self.now = datetime.now(timezone.utc)
        async with self.session_maker() as session:
            owner = (await session.execute(select(User).where(User.username == "watchdog_owner"))).scalar_one()
            self.workspace = Workspace(name="Acme", slug="acme-watchdog", owner_user_id=owner.id)
            idle = Workspace(name="Idle", slug="idle-watchdog", owner_user_id=owner.id)
            session.add_all([self.workspace, idle])
            await session.flush()
            session.add(WorkspaceMember(workspace_id=self.workspace.id, user_id=owner.id, role="owner"))
            session.add(
                Account(
                    account_id="act_7300000001",
                    name="Watchdog account",
                    owner_user_id=owner.id,
                    workspace_id=self.workspace.id,
                    is_active=True,
                )
            )
            # A workspace without active ad accounts loses nothing while rules
            # are not checked, so it gets no notification.
            session.add(
                Account(
                    account_id="act_7300000002",
                    name="Paused account",
                    owner_user_id=owner.id,
                    workspace_id=idle.id,
                    is_active=False,
                )
            )
            owner.active_workspace_id = self.workspace.id
            owner.is_approved = True
            await session.commit()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()
        await database_db.engine.dispose()

    async def finish_cycle(self, seconds_ago, errors_count=0):
        async with self.session_maker() as session:
            row = await session.get(AutomationRuntimeState, "monitoring")
            if row is None:
                row = AutomationRuntimeState(state_key="monitoring")
                session.add(row)
            row.payload = {
                "finished_at": (self.now - timedelta(seconds=seconds_ago)).isoformat(),
                "errors_count": errors_count,
            }
            await session.commit()

    async def watchdog_events(self):
        async with self.session_maker() as session:
            return (
                await session.execute(
                    select(AuditEvent)
                    .where(AuditEvent.actor_id == "worker_watchdog")
                    .order_by(AuditEvent.id)
                )
            ).scalars().all()

    async def test_health_worker_turns_503_when_cycles_stop(self):
        response = await self.client.get("/health/worker")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "unknown")

        await self.finish_cycle(20)
        response = await self.client.get("/health/worker")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

        await self.finish_cycle(200)
        response = await self.client.get("/health/worker")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "warning")

        # The audit observation: heartbeat alive, last cycle 432 s old.
        await self.finish_cycle(432)
        response = await self.client.get("/health/worker")
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertEqual(body["status"], "critical")
        self.assertGreaterEqual(body["lag_seconds"], 432)
        self.assertEqual(body["critical_seconds"], 360)

    async def test_readiness_stays_about_the_api_itself(self):
        await self.finish_cycle(3600)
        response = await self.client.get("/health/ready")
        self.assertEqual(response.status_code, 200)

    async def test_overview_is_not_healthy_while_cycles_are_stale(self):
        await self.finish_cycle(20)
        overview = (await self.client.get("/api/health/overview", headers=self.headers)).json()
        self.assertEqual(overview["signals"]["worker_cycle_status"], "ok")
        healthy_overall = overview["overall_status"]
        self.assertNotIn(healthy_overall, {"critical", "degraded"})

        await self.finish_cycle(200)
        overview = (await self.client.get("/api/health/overview", headers=self.headers)).json()
        self.assertEqual(overview["signals"]["worker_cycle_status"], "warning")
        self.assertEqual(overview["overall_status"], "degraded")

        await self.finish_cycle(432, errors_count=2)
        overview = (await self.client.get("/api/health/overview", headers=self.headers)).json()
        self.assertEqual(overview["signals"]["worker_cycle_status"], "critical")
        self.assertEqual(overview["signals"]["worker_cycle_errors_count"], 2)
        self.assertEqual(overview["overall_status"], "critical")

    async def test_stall_is_reported_once_and_recovery_once(self):
        await self.finish_cycle(200)
        self.assertIsNone((await watchdog.check_once())["action"])
        self.assertEqual(await self.watchdog_events(), [])

        await self.finish_cycle(432)
        result = await watchdog.check_once()
        self.assertEqual(result["action"], "WORKER_STALLED")
        events = await self.watchdog_events()
        self.assertEqual(len(events), 1)
        stalled = events[0]
        self.assertEqual(stalled.workspace_id, self.workspace.id)
        self.assertEqual(stalled.event_type, "WORKER_STALLED")
        self.assertEqual(stalled.status, "ERROR")
        self.assertIn("not finished checking rules for 7 min", stalled.message)

        # Still stalled a minute later: no second notification.
        self.assertIsNone((await watchdog.check_once())["action"])
        self.assertEqual(len(await self.watchdog_events()), 1)

        # A warning-level lag is not a recovery yet.
        await self.finish_cycle(200)
        self.assertIsNone((await watchdog.check_once())["action"])

        await self.finish_cycle(5)
        self.assertEqual((await watchdog.check_once())["action"], "WORKER_RECOVERED")
        events = await self.watchdog_events()
        self.assertEqual([event.event_type for event in events], ["WORKER_STALLED", "WORKER_RECOVERED"])
        self.assertEqual(events[1].status, "SUCCESS")
        self.assertIsNone((await watchdog.check_once())["action"])

        # A second stall is a new incident.
        await self.finish_cycle(400)
        self.assertEqual((await watchdog.check_once())["action"], "WORKER_STALLED")

    async def test_stall_notification_is_urgent_in_inbox(self):
        await self.finish_cycle(432)
        await watchdog.check_once()
        response = await self.client.get("/api/inbox", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("WORKER_STALLED", response.text)
        self.assertIn('"urgent"', response.text)

    async def test_loop_delivers_inbox_itself_only_while_stalled(self):
        delivered = []

        async def fake_delivery():
            delivered.append(True)

        sleeps = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)
            if len(sleeps) > 2:
                raise asyncio.CancelledError

        await self.finish_cycle(20)
        with mock.patch.object(watchdog, "_deliver_inbox_while_stalled", fake_delivery), mock.patch.object(
            watchdog, "_sleep", fake_sleep
        ):
            with self.assertRaises(asyncio.CancelledError):
                await watchdog.run_forever(interval=1)
        self.assertEqual(delivered, [])

        await self.finish_cycle(432)
        sleeps.clear()
        with mock.patch.object(watchdog, "_deliver_inbox_while_stalled", fake_delivery), mock.patch.object(
            watchdog, "_sleep", fake_sleep
        ):
            with self.assertRaises(asyncio.CancelledError):
                await watchdog.run_forever(interval=1)
        self.assertEqual(len(delivered), 2)

    async def test_loop_survives_a_failing_check(self):
        sleeps = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)
            if len(sleeps) > 2:
                raise asyncio.CancelledError

        async def broken(*args, **kwargs):
            raise RuntimeError("database is down")

        with mock.patch.object(watchdog, "check_once", broken), mock.patch.object(
            watchdog, "_sleep", fake_sleep
        ):
            with self.assertRaises(asyncio.CancelledError):
                await watchdog.run_forever(interval=1)
        self.assertEqual(len(sleeps), 3)


class TestOpsDrillContract(unittest.TestCase):
    """The production drills run only by hand and never write to live data."""

    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parents[1]
        cls.workflow = (root / ".github" / "workflows" / "ops-drill.yml").read_text()
        cls.uploads = (root / "scripts" / "drill_uploads.sh").read_text()
        cls.stall = (root / "scripts" / "drill_worker_stall.sh").read_text()

    def test_workflow_runs_only_on_manual_dispatch_with_confirmation(self):
        triggers = self.workflow.split("\non:", 1)[1].split("\npermissions:", 1)[0]
        self.assertIn("workflow_dispatch:", triggers)
        for trigger in ("push:", "pull_request:", "schedule:"):
            self.assertNotIn(trigger, triggers)
        self.assertIn('if [ "${DRILL}" != "${CONFIRM}" ]', self.workflow)
        self.assertIn("default: restore-local", self.workflow)

    def test_uploads_drill_reads_the_live_volume_read_only(self):
        self.assertIn('-v "${UPLOADS_VOLUME}:/src:ro"', self.uploads)
        self.assertNotIn('"${UPLOADS_VOLUME}:/dst', self.uploads)
        self.assertIn("--network none", self.uploads)

    def test_stall_drill_always_unpauses_the_worker(self):
        self.assertIn("trap unpause EXIT", self.stall)
        self.assertLess(self.stall.index("trap unpause EXIT"), self.stall.index('docker pause "${WORKER_CONTAINER}"'))


if __name__ == "__main__":
    unittest.main()
