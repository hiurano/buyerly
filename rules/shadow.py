"""What the rules engine saw and decided, for the TypeScript engine's shadow run (#611 stage 4).

Before the TypeScript worker may act on Meta, it decides beside this engine on
the same data and the two decisions are compared (server/src/rules/shadow.ts).
For every ad account whose rules were due, the monitoring cycle hands this
module the inputs of the decision (the entities and their metric windows, the
due rules, today's undos and manual turn-ons, and the account's rule
execution slots as they stood before the check) and then what it decided:
each rule's outcome on each entity and every action it went on to send to
Meta. One gzipped JSON file per account and cycle lands in
``RULES_SHADOW_DIR``; the TypeScript worker reads, compares and deletes them.

Nothing here may disturb the cycle: every failure is logged and swallowed,
and a directory the other side stopped reading is never filled past
``MAX_PENDING_FILES``.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select

from database.models import RuleExecutionState

logger = logging.getLogger(__name__)

CAPTURE_VERSION = 1
MAX_PENDING_FILES = 500


def max_pending_files() -> int:
    """RULES_SHADOW_MAX_FILES raises the cap (CI keeps every case of its run)."""
    try:
        return int(os.environ.get("RULES_SHADOW_MAX_FILES", "") or MAX_PENDING_FILES)
    except ValueError:
        return MAX_PENDING_FILES


def shadow_dir() -> Optional[Path]:
    """Where captures go; unset or empty RULES_SHADOW_DIR turns them off."""
    raw = os.environ.get("RULES_SHADOW_DIR", "").strip()
    return Path(raw) if raw else None


def _state_row(state: RuleExecutionState) -> dict[str, Any]:
    return {
        "execution_key": state.execution_key,
        "entity_id": state.entity_id,
        "action": state.action,
        "status": state.status,
        "last_attempt_at": state.last_attempt_at,
        "last_success_at": state.last_success_at,
        "after_state": state.after_state,
        "details": state.details,
    }


def _evaluation(evaluation: Any) -> dict[str, Any]:
    return {
        "entity_level": evaluation.entity_level,
        "entity_id": str(evaluation.entity_id),
        "rule_id": evaluation.rule_id,
        "rule_name": evaluation.rule_name,
        "action": evaluation.action.value,
        "reason": evaluation.reason,
        "yielded_rules": evaluation.yielded_rules,
    }


# Cycles that wrote at least one account capture; the rest get a marker.
_cycles_with_captures: set[str] = set()


def _write(directory: Path, document: dict[str, Any], account_ref: str) -> None:
    pending = sum(1 for _ in directory.glob("*.json.gz"))
    if pending >= max_pending_files():
        logger.warning("Rules shadow capture skipped: %s files wait unread", pending)
        return
    payload = gzip.compress(
        json.dumps(document, allow_nan=False, ensure_ascii=False, default=str).encode("utf-8")
    )
    name = f"{int(time.time() * 1000):013d}-{document['cycle_id']}-{account_ref}"
    temporary = directory / f".{name}.tmp"
    temporary.write_bytes(payload)
    temporary.replace(directory / f"{name}.json.gz")


def finish_cycle(cycle_id: str, now: float) -> None:
    """A cycle in which no account's rules were due still leaves a marker.

    Its decision is empty on both sides; the comparison counts the cycle, so
    the shadow run is shown to follow every cycle even while no rule is on.
    """
    if cycle_id in _cycles_with_captures:
        _cycles_with_captures.discard(cycle_id)
        return
    directory = shadow_dir()
    if directory is None:
        return
    try:
        directory.mkdir(parents=True, exist_ok=True)
        _write(
            directory,
            {
                "version": CAPTURE_VERSION,
                "marker": True,
                "cycle_id": cycle_id,
                "account": {"account_id": "", "workspace_id": None, "currency": "UNKNOWN", "rules_enabled": False, "timezone_name": None},
                "now": now,
                "stop_confirmation_minutes": 0,
                "critical_interval": 0,
                "due_rules": [],
                "entities": [],
                "entity_windows": {},
                "undone_actions": {},
                "manual_enables": {},
                "execution_states": [],
                "python": {"outcomes": [], "actions": [], "stopped_early": False},
            },
            "cycle",
        )
    except Exception as error:
        logger.warning("Rules shadow cycle marker not written: %s", error)


class ShadowCapture:
    def __init__(self, directory: Path, inputs: dict[str, Any]) -> None:
        self.directory = directory
        self.inputs = inputs
        self.actions: list[dict[str, Any]] = []

    def acted(self, evaluation: Any, observed_state: dict[str, Any], desired_state: dict[str, Any]) -> None:
        """An action the engine claimed and is about to send (or record)."""
        try:
            self.actions.append(
                {
                    **_evaluation(evaluation),
                    "observed_state": dict(observed_state),
                    "desired_state": dict(desired_state),
                }
            )
        except Exception as error:  # pragma: no cover - never stops the cycle
            logger.warning("Rules shadow capture: action not recorded: %s", error)

    def finish(self, outcomes: list[dict[str, Any]], *, stopped_early: bool) -> None:
        """Write the capture; ``stopped_early`` when a refused token cut the check short."""
        try:
            _cycles_with_captures.add(self.inputs["cycle_id"])
            document = {
                **self.inputs,
                "python": {
                    "outcomes": outcomes,
                    "actions": self.actions,
                    "stopped_early": stopped_early,
                },
            }
            _write(self.directory, document, self.inputs["account"]["account_id"])
        except Exception as error:
            logger.warning("Rules shadow capture not written: %s", error)


async def start_capture(
    session,
    *,
    cycle_id: str,
    account: Any,
    now: float,
    stop_confirmation_minutes: int,
    critical_interval: int,
    due_rules: list[dict[str, Any]],
    entities: list[dict[str, Any]],
    entity_windows: dict[str, dict[str, dict[str, Any]]],
    undone_actions: dict[str, set[str]],
    manual_enables: dict[str, str],
) -> Optional[ShadowCapture]:
    """Snapshot one account's decision inputs, before anything acts; None when off or on any failure."""
    directory = shadow_dir()
    if directory is None:
        return None
    try:
        directory.mkdir(parents=True, exist_ok=True)
        with session.no_autoflush:
            states = (
                await session.execute(
                    select(RuleExecutionState).where(
                        RuleExecutionState.account_id == str(account.account_id)
                    )
                )
            ).scalars().all()
        inputs = {
            "version": CAPTURE_VERSION,
            "cycle_id": cycle_id,
            "account": {
                "account_id": str(account.account_id),
                "workspace_id": account.workspace_id,
                "currency": account.currency,
                "rules_enabled": bool(account.rules_enabled),
                "timezone_name": account.timezone_name,
            },
            "now": now,
            "stop_confirmation_minutes": stop_confirmation_minutes,
            "critical_interval": critical_interval,
            "due_rules": due_rules,
            "entities": entities,
            "entity_windows": entity_windows,
            "undone_actions": {key: sorted(value) for key, value in undone_actions.items()},
            "manual_enables": dict(manual_enables),
            "execution_states": [_state_row(state) for state in states],
        }
        # Serialised now: the cycle mutates these structures as it goes.
        inputs = json.loads(json.dumps(inputs, allow_nan=False, ensure_ascii=False, default=str))
        return ShadowCapture(directory, inputs)
    except Exception as error:
        logger.warning("Rules shadow capture not started for %s: %s", getattr(account, "account_id", "?"), error)
        return None
