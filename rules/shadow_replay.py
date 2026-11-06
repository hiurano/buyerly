"""The rules engine's reverse shadow run (#611 stage 4): TypeScript acts, Python only decides.

Once the TypeScript worker owns the monitoring job (``monitoring`` in
``TS_WORKER_JOBS``), its rule cycle (server/src/worker/rule-cycle.ts) leaves
one request per checked ad account in ``RULES_SHADOW_REPLAY_DIR``: the inputs
it decided on (the entities and their metric windows, the due rules, today's
undos and manual turn-ons, the account's execution slots before the check).

Here the Python worker takes each request and runs its own decision on those
inputs, ``MonitoringWorker._decide_and_act``, the same code its rule cycle
runs, inside a transaction that is always rolled back and with a Meta client
that writes nothing and reads nothing. The decision is written as an ordinary
shadow capture (rules/shadow.py) to ``RULES_SHADOW_DIR``, where the
TypeScript worker's ``rules_shadow`` job compares it with its own, as before
the switch. No second read of Meta: Python decides on what TypeScript read.

A request that cannot be replayed is logged and dropped; nothing here may
disturb the TypeScript cycle.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import Account, RuleExecutionState
from rules import shadow

logger = logging.getLogger(__name__)

REQUEST_VERSION = 1
REQUESTS_PER_RUN = 200


def replay_dir() -> Optional[Path]:
    """Where the TypeScript cycle leaves requests; unset or empty turns the reverse run off."""
    raw = os.environ.get("RULES_SHADOW_REPLAY_DIR", "").strip()
    return Path(raw) if raw else None


class NoWriteMeta:
    """A Meta client for a decision that must not act: every write "lands", nothing is sent."""

    async def set_adset_status(self, **_kwargs: Any) -> bool:
        return True

    async def set_ad_status(self, **_kwargs: Any) -> bool:
        return True

    async def set_campaign_status(self, **_kwargs: Any) -> bool:
        return True

    async def update_adset_budget(self, **_kwargs: Any) -> bool:
        return True

    def get_usage_snapshot(self) -> dict[str, Any]:
        return {}


async def replay_request(request: dict[str, Any], engine=None) -> bool:
    """Decide on one request in a rolled-back transaction; True when a capture was written."""
    if engine is None:
        from database.db import engine as default_engine

        engine = default_engine
    from scheduler.worker import MonitoringWorker

    account_ref = str(request["account"]["account_id"])
    cycle_id = str(request["cycle_id"])
    async with engine.connect() as connection:
        outer = await connection.begin()
        # Commits inside the decision become savepoints of `outer`, which is
        # rolled back below whatever happens.
        session = AsyncSession(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
        try:
            account = (
                await session.execute(select(Account).where(Account.account_id == account_ref))
            ).scalar_one_or_none()
            if account is None:
                logger.warning("Rules shadow replay: account %s is gone", account_ref)
                return False
            # What the TypeScript cycle saw of the account.
            account.currency = request["account"].get("currency")
            account.rules_enabled = bool(request["account"].get("rules_enabled"))
            account.timezone_name = request["account"].get("timezone_name")
            # The execution slots as they stood before the TypeScript check.
            await session.execute(delete(RuleExecutionState).where(RuleExecutionState.account_id == account_ref))
            for row in request.get("execution_states") or []:
                session.add(
                    RuleExecutionState(
                        execution_key=row["execution_key"],
                        owner_user_id=row.get("owner_user_id", account.owner_user_id),
                        account_id=account_ref,
                        adset_id=row.get("adset_id") or "",
                        entity_level=row.get("entity_level") or "adset",
                        entity_id=str(row.get("entity_id") or ""),
                        rule_key=row.get("rule_key") or "",
                        action=str(row.get("action") or ""),
                        status=str(row.get("status") or "IDLE"),
                        correlation_id=row.get("correlation_id") or "",
                        last_attempt_at=float(row.get("last_attempt_at") or 0.0),
                        last_success_at=row.get("last_success_at"),
                        before_state=row.get("before_state") or {},
                        after_state=row.get("after_state") or {},
                        details=row.get("details") or {},
                    )
                )
            await session.flush()

            now = float(request["now"])
            worker = MonitoringWorker(meta_client=NoWriteMeta(), clock=lambda: now)
            worker._current_cycle_id = cycle_id
            worker._action_semaphore = asyncio.Semaphore(1)
            due_rules = list(request.get("due_rules") or [])
            stats: dict[str, Any] = {
                key: 0
                for key in (
                    "adsets_stopped", "campaigns_stopped", "ads_stopped", "adsets_reactivated",
                    "campaigns_reactivated", "ads_reactivated", "budgets_changed", "actions_skipped",
                    "actions_reconciled", "stop_confirmations_waiting", "proposals_sent",
                )
            }
            stats["errors"] = []
            await worker._decide_and_act(
                session,
                account,
                now=now,
                due_rules=due_rules,
                entities=list(request.get("entities") or []),
                entity_windows=dict(request.get("entity_windows") or {}),
                undone_actions={key: set(value) for key, value in (request.get("undone_actions") or {}).items()},
                manual_enables=dict(request.get("manual_enables") or {}),
                access_token="",
                stats=stats,
                stop_confirmation_minutes=int(request.get("stop_confirmation_minutes") or 0),
                critical_interval=int(request.get("critical_interval") or 0),
                connection_cache={},
                stop_rules_due=any(worker._is_critical_stop_rule(rule) for rule in due_rules),
            )
            return cycle_id in shadow._cycles_with_captures
        finally:
            shadow._cycles_with_captures.discard(cycle_id)
            await session.close()
            await outer.rollback()


async def replay_pending(limit: int = REQUESTS_PER_RUN, engine=None) -> dict[str, int]:
    """One pass of the reverse run: every waiting request, oldest first, each deleted after."""
    stats = {"requests": 0, "captures": 0, "errors": 0}
    directory = replay_dir()
    if directory is None or shadow.shadow_dir() is None or not directory.is_dir():
        return stats
    for path in sorted(directory.glob("*.json.gz"))[:limit]:
        stats["requests"] += 1
        try:
            request = json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))
            if request.get("version") != REQUEST_VERSION:
                raise ValueError(f"request version {request.get('version')!r}")
            if await replay_request(request, engine=engine):
                stats["captures"] += 1
        except Exception as error:
            stats["errors"] += 1
            logger.warning("Rules shadow replay failed for %s: %s", path.name, error)
        finally:
            path.unlink(missing_ok=True)
    return stats
