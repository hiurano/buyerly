import asyncio
import signal
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from core.runtime import configure_logging
from core.worker_jobs import exclusive, ts_worker_jobs
from database.sync_log import run_sync_log_compaction_tick
from scheduler.worker import MonitoringWorker
from services.inbox_email import run_inbox_email_tick
from services.inbox_push import run_inbox_push_tick
from services.inbox_telegram import run_inbox_telegram_tick


async def _touch_heartbeat() -> None:
    Path("/tmp/buyerly-worker-heartbeat").touch()


async def _run_day_boundary_tick(worker: MonitoringWorker) -> None:
    """Run one complete account-day scheduling pass and expose readiness."""

    await worker.run_day_boundary_cycle()
    Path("/tmp/buyerly-worker-day-boundary-cycle-complete").touch()


async def main() -> None:
    logger = configure_logging("worker")
    monitoring_worker = MonitoringWorker()
    day_boundary_worker = MonitoringWorker()

    heartbeat_file = Path("/tmp/buyerly-worker-heartbeat")
    day_boundary_cycle_file = Path(
        "/tmp/buyerly-worker-day-boundary-cycle-complete"
    )
    day_boundary_cycle_file.unlink(missing_ok=True)
    heartbeat_file.touch()
    Path("/tmp/buyerly-worker-ready").touch()

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _touch_heartbeat,
        "interval",
        seconds=10,
        id="heartbeat_job",
        next_run_time=datetime.now(timezone.utc),
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        monitoring_worker.run_cycle,
        "interval",
        minutes=1,
        id="monitoring_job",
        next_run_time=datetime.now(timezone.utc),
        max_instances=1,
        coalesce=True,
    )
    async def run_account_day_boundary_tick() -> None:
        await _run_day_boundary_tick(day_boundary_worker)

    # Jobs without Meta calls move to the TypeScript worker one at a time
    # (#611 stage 4): TS_WORKER_JOBS lists the ones it owns, and each run
    # holds an advisory lock both workers take (core/worker_jobs.py).
    owned_by_ts = ts_worker_jobs()
    shared_jobs = [
        ("inbox_email", run_inbox_email_tick, {"minutes": 1}),
        # A push channel: new notifications go out within seconds, not after a pause.
        ("inbox_telegram", run_inbox_telegram_tick, {"seconds": 20}),
        ("inbox_push", run_inbox_push_tick, {"seconds": 20}),
        # The sync log keeps SYNC_LOG_RETENTION_DAYS; a client further behind bootstraps again.
        ("sync_log_compaction", run_sync_log_compaction_tick, {"hours": 24}),
        # ACCOUNT_DAY_STARTED within five minutes of each account's local midnight.
        ("account_day_boundary", run_account_day_boundary_tick, {"minutes": 1}),
    ]
    if "account_day_boundary" in owned_by_ts:
        # The deploy and the post-deploy smoke wait for this file; the cycle
        # itself runs on the TypeScript worker.
        day_boundary_cycle_file.touch()
    for job_id, run, interval in shared_jobs:
        if job_id in owned_by_ts:
            logger.info("Job %s runs on the TypeScript worker (TS_WORKER_JOBS)", job_id)
            continue
        scheduler.add_job(
            exclusive(job_id, run),
            "interval",
            **interval,
            id=f"{job_id}_job",
            next_run_time=datetime.now(timezone.utc),
            max_instances=1,
            coalesce=True,
        )
    scheduler.start()
    logger.info(
        "Monitoring and account day-boundary workers started with one-minute dispatch ticks"
    )

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signum, stop_event.set)
        except NotImplementedError:
            pass

    try:
        await stop_event.wait()
    finally:
        scheduler.shutdown(wait=False)
        heartbeat_file.unlink(missing_ok=True)
        day_boundary_cycle_file.unlink(missing_ok=True)
        Path("/tmp/buyerly-worker-ready").unlink(missing_ok=True)
        await monitoring_worker.meta_client.aclose()
        await day_boundary_worker.meta_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
