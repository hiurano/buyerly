"""Jobs move to the TypeScript worker one at a time and never run twice (#611 stage 4)."""

import asyncio
import unittest
from pathlib import Path
from unittest import mock

from sqlalchemy import text

import services.worker_watchdog as watchdog
from core import worker_jobs
from tests.test_db_helper import create_test_engine

ROOT = Path(__file__).resolve().parents[1]


class TestOwnership(unittest.TestCase):
    def test_the_list_names_known_jobs_only(self):
        self.assertEqual(worker_jobs.ts_worker_jobs(""), set())
        self.assertEqual(
            worker_jobs.ts_worker_jobs(" inbox_email, ,sync_log_compaction,monitoring "),
            {"inbox_email", "sync_log_compaction"},
        )

    def test_the_python_worker_skips_what_the_typescript_worker_owns(self):
        source = (ROOT / "services" / "worker.py").read_text()
        self.assertIn("if job_id in owned_by_ts:", source)
        self.assertIn("exclusive(job_id, run)", source)
        for job_id in ("inbox_email", "inbox_telegram", "inbox_push", "sync_log_compaction", "account_day_boundary", "account_sync"):
            self.assertIn(f'("{job_id}", ', source)
        # The rules half of the monitoring cycle stays on Python until the side-by-side comparison.
        self.assertNotIn('"monitoring"', worker_jobs.SHARED_JOBS)
        self.assertIn('id="monitoring_job"', source)

    def test_the_typescript_worker_uses_the_same_lock_numbers(self):
        source = (ROOT / "server" / "src" / "worker" / "jobs.ts").read_text()
        self.assertIn(f"LOCK_NAMESPACE = {worker_jobs.LOCK_NAMESPACE};", source)
        for job_id, number in worker_jobs.SHARED_JOBS.items():
            self.assertIn(f"  {job_id}: {number},", source)


class TestWatchdogOwnership(unittest.IsolatedAsyncioTestCase):
    async def test_the_api_loop_stops_once_the_typescript_worker_owns_it(self):
        sleeps = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)
            raise asyncio.CancelledError

        with mock.patch.object(worker_jobs.settings, "TS_WORKER_JOBS", "worker_watchdog"), mock.patch.object(
            watchdog, "_sleep", fake_sleep
        ):
            await watchdog.run_forever(interval=1)
        self.assertEqual(sleeps, [])

    async def test_stalled_delivery_leaves_typescript_jobs_alone(self):
        ran = []

        def tick(name):
            async def run():
                ran.append(name)

            return run

        def unlocked(job_id, run):
            return run

        with mock.patch.object(worker_jobs.settings, "TS_WORKER_JOBS", "inbox_email,inbox_push"), mock.patch(
            "services.inbox_email.run_inbox_email_tick", tick("email")
        ), mock.patch("services.inbox_telegram.run_inbox_telegram_tick", tick("telegram")), mock.patch(
            "services.inbox_push.run_inbox_push_tick", tick("push")
        ), mock.patch.object(worker_jobs, "exclusive", unlocked):
            await watchdog._deliver_inbox_while_stalled()
        self.assertEqual(ran, ["telegram"])


class TestJobLock(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_test_engine()

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def test_a_job_held_elsewhere_is_skipped(self):
        async with self.engine.connect() as other:
            # The TypeScript worker holds it (server/src/worker/jobs.ts withJobLock).
            held = (
                await other.execute(
                    text("SELECT pg_try_advisory_lock(:namespace, :number)"),
                    {"namespace": worker_jobs.LOCK_NAMESPACE, "number": worker_jobs.SHARED_JOBS["inbox_push"]},
                )
            ).scalar()
            self.assertTrue(held)
            async with worker_jobs.job_lock("inbox_push", self.engine) as acquired:
                self.assertFalse(acquired)
            async with worker_jobs.job_lock("inbox_email", self.engine) as acquired:
                self.assertTrue(acquired)
            await other.execute(
                text("SELECT pg_advisory_unlock(:namespace, :number)"),
                {"namespace": worker_jobs.LOCK_NAMESPACE, "number": worker_jobs.SHARED_JOBS["inbox_push"]},
            )
        async with worker_jobs.job_lock("inbox_push", self.engine) as acquired:
            self.assertTrue(acquired)

    async def test_exclusive_runs_the_job_only_with_the_lock(self):
        ran = []

        async def job():
            ran.append(True)

        with mock.patch("database.db.engine", self.engine):
            await worker_jobs.exclusive("sync_log_compaction", job)()
            async with worker_jobs.job_lock("sync_log_compaction", self.engine) as acquired:
                self.assertTrue(acquired)
                await worker_jobs.exclusive("sync_log_compaction", job)()
        self.assertEqual(ran, [True])


if __name__ == "__main__":
    unittest.main()
