"""Notice when the worker stops finishing monitoring cycles and say so in Inbox (#199).

The worker's heartbeat job and Docker healthcheck only prove that its process
and scheduler are alive. A monitoring cycle stuck on an await (or a paused or
dead worker) leaves the heartbeat fresh while rules stop being checked. The
only proof of work is ``finished_at`` of the last completed cycle, which the
worker writes to ``automation_runtime_states['monitoring']``.

This watchdog runs in the API process, independent of the worker:

- once the last completed cycle is older than ``CRITICAL_LAG_SECONDS`` it adds
  one urgent ``WORKER_STALLED`` Inbox notification to every workspace that has
  an active ad account, and ``WORKER_RECOVERED`` once cycles finish again;
- while the worker is stalled it also runs the Inbox email and Telegram
  deliveries itself, because they normally run inside the worker. Each
  delivery is claimed in the database before sending, so a worker that is
  still partly alive cannot send the same notification twice.

Thresholds: the monitoring job runs every minute, so 3 minutes without a
finished cycle is a warning and 6 minutes is critical.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select

from database.db import async_session_maker
from database.models import Account, AuditEvent, AutomationRuntimeState, Workspace

logger = logging.getLogger(__name__)

MONITORING_INTERVAL_SECONDS = 60
WARNING_LAG_SECONDS = 180
CRITICAL_LAG_SECONDS = 360
CHECK_INTERVAL_SECONDS = 60
STATE_KEY = "worker_watchdog"
STALLED_EVENT = "WORKER_STALLED"
RECOVERED_EVENT = "WORKER_RECOVERED"

# Replaced in tests; asyncio.sleep itself must stay intact for the event loop.
_sleep = asyncio.sleep


def _parse(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def cycle_status(payload: Optional[dict], now: Optional[datetime] = None) -> dict:
    """Freshness of the last completed monitoring cycle.

    ``status`` is ``ok``, ``warning``, ``critical`` or ``unknown`` (the worker
    never finished a cycle, e.g. a fresh install).
    """
    now = now or datetime.now(timezone.utc)
    payload = payload or {}
    finished = _parse(payload.get("finished_at"))
    if finished is None:
        return {"status": "unknown", "lag_seconds": None, "finished_at": None, "errors_count": None}
    lag = max(0, int((now - finished).total_seconds()))
    status = "critical" if lag >= CRITICAL_LAG_SECONDS else "warning" if lag >= WARNING_LAG_SECONDS else "ok"
    return {
        "status": status,
        "lag_seconds": lag,
        "finished_at": finished.isoformat(),
        "errors_count": payload.get("errors_count"),
    }


async def read_cycle_status(session, now: Optional[datetime] = None) -> dict:
    row = await session.get(AutomationRuntimeState, "monitoring")
    return cycle_status(dict(row.payload or {}) if row else {}, now)


def _event(workspace: Workspace, event_type: str, status: str, message: str, details: dict) -> AuditEvent:
    return AuditEvent(
        workspace_id=workspace.id,
        owner_user_id=workspace.owner_user_id,
        actor_type="system",
        actor_id="worker_watchdog",
        category="SYSTEM",
        event_type=event_type,
        status=status,
        entity_level="",
        action="INVESTIGATE" if status == "ERROR" else "MONITOR",
        message=message,
        details=details,
    )


async def check_once(now: Optional[datetime] = None, session_maker=None) -> dict:
    """One watchdog pass; returns the cycle status and what it did."""
    now = now or datetime.now(timezone.utc)
    session_maker = session_maker or async_session_maker
    async with session_maker() as session:
        status = await read_cycle_status(session, now)
        state_row = await session.get(AutomationRuntimeState, STATE_KEY, with_for_update=True)
        state = dict(state_row.payload or {}) if state_row else {}
        alerted = bool(state.get("alerted_at"))
        action = None

        if status["status"] == "critical" and not alerted:
            action = STALLED_EVENT
            minutes = status["lag_seconds"] // 60
            message = (
                f"Buyerly has not finished checking rules for {minutes} min "
                f"(last completed check {status['finished_at']}). Rules are not being "
                "applied until the worker recovers."
            )
            event_status = "ERROR"
            state = {"alerted_at": now.isoformat(), "stalled_since": status["finished_at"]}
        elif status["status"] == "ok" and alerted:
            action = RECOVERED_EVENT
            message = "Buyerly is checking rules again."
            event_status = "SUCCESS"
            state = {"recovered_at": now.isoformat(), "stalled_since": state.get("stalled_since")}

        if action:
            workspaces = (
                await session.execute(
                    select(Workspace)
                    .where(
                        Workspace.id.in_(
                            select(Account.workspace_id).where(Account.is_active == True)  # noqa: E712
                        )
                    )
                    .order_by(Workspace.id)
                )
            ).scalars().all()
            details = {"lag_seconds": status["lag_seconds"], "last_finished_at": status["finished_at"]}
            session.add_all(_event(ws, action, event_status, message, details) for ws in workspaces)
            if state_row is None:
                state_row = AutomationRuntimeState(state_key=STATE_KEY)
                session.add(state_row)
            state_row.payload = state
            await session.commit()
            log = logger.error if action == STALLED_EVENT else logger.warning
            log("Worker watchdog: %s (lag %ss, %d workspace(s))", action, status["lag_seconds"], len(workspaces))
        else:
            await session.rollback()
    return {**status, "action": action}


async def _deliver_inbox_while_stalled() -> None:
    # Imported here: the delivery modules pull in the API routers.
    from services.inbox_email import run_inbox_email_tick
    from services.inbox_telegram import run_inbox_telegram_tick

    await run_inbox_email_tick()
    await run_inbox_telegram_tick()


async def run_forever(interval: float = CHECK_INTERVAL_SECONDS) -> None:
    """The API's background loop; never raises except on cancellation."""
    while True:
        await _sleep(interval)
        try:
            result = await check_once()
            if result["status"] == "critical":
                await _deliver_inbox_while_stalled()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Worker watchdog check failed")
