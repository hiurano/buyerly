"""Which worker runs each background job while they move to TypeScript (#611 stage 4).

The TypeScript worker (`server/src/worker/`, Compose service `worker-ts`)
takes over the jobs that do not call Meta one at a time. ``TS_WORKER_JOBS``
lists the ones it runs; the Python worker (and the API's watchdog loop) skip
exactly those. Moving a job back is removing it from the list and restarting
both workers.

A job is never run by both at once even while a deploy swaps containers or
the list is edited by hand: each run of a shared job first takes a Postgres
advisory lock of its own, and a worker that cannot take it skips that tick.
The TypeScript worker takes the same locks (`server/src/worker/jobs.ts`),
so the numbers below must match there.
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator, Awaitable, Callable

from sqlalchemy import text

from core.config import settings

logger = logging.getLogger(__name__)

# pg_try_advisory_lock(LOCK_NAMESPACE, number): the two-int form, so it never
# meets the single-bigint locks the sync log takes.
LOCK_NAMESPACE = 611
SHARED_JOBS = {
    "inbox_email": 1,
    "inbox_telegram": 2,
    "inbox_push": 3,
    "sync_log_compaction": 4,
    "worker_watchdog": 5,
    "account_day_boundary": 6,
}


def ts_worker_jobs(raw: str | None = None) -> set[str]:
    value = settings.TS_WORKER_JOBS if raw is None else raw
    jobs = {item.strip() for item in value.split(",") if item.strip()}
    unknown = jobs - SHARED_JOBS.keys()
    if unknown:
        logger.warning("TS_WORKER_JOBS names jobs Python does not know: %s", ", ".join(sorted(unknown)))
    return jobs & SHARED_JOBS.keys()


def owned_by_ts(job_id: str) -> bool:
    return job_id in ts_worker_jobs()


@asynccontextmanager
async def job_lock(job_id: str, engine=None) -> AsyncIterator[bool]:
    """Hold the job's advisory lock for one run; yields False when another worker holds it."""
    if engine is None:
        from database.db import engine as default_engine

        engine = default_engine
    number = SHARED_JOBS[job_id]
    async with engine.connect() as connection:
        acquired = bool(
            (
                await connection.execute(
                    text("SELECT pg_try_advisory_lock(:namespace, :number)"),
                    {"namespace": LOCK_NAMESPACE, "number": number},
                )
            ).scalar()
        )
        await connection.commit()
        try:
            yield acquired
        finally:
            if acquired:
                await connection.execute(
                    text("SELECT pg_advisory_unlock(:namespace, :number)"),
                    {"namespace": LOCK_NAMESPACE, "number": number},
                )
                await connection.commit()


def exclusive(job_id: str, run: Callable[[], Awaitable[None]]) -> Callable[[], Awaitable[None]]:
    """The job as the Python worker schedules it: skipped while the other worker runs it."""

    async def tick() -> None:
        async with job_lock(job_id) as acquired:
            if not acquired:
                logger.info("Skipping %s: another worker is running it", job_id)
                return
            await run()

    tick.__name__ = f"{job_id}_tick"
    return tick
