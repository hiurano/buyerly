import logging
import random
import asyncio
import json
import hashlib
import time
import uuid
from datetime import date, datetime, time as day_time, timedelta, timezone
from typing import Optional, Callable, Any, List, Dict
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from database.db import async_session_maker
from database.models import (
    Account,
    AppSettings,
    AuditEvent,
    AutomationRuntimeState,
    AutomationScheduleState,
    MetaConnection,
    RuleEntityState,
    RuleExecutionState,
    StoppedAdSet,
    Workspace,
)
from core.audit import build_audit_event
from core.logging_config import redact_secrets
from core.currency import normalize_currency
from core.meta_tokens import resolve_account_access_token
from core.timezones import (
    canonical_timezone_name,
    evaluate_day_boundary,
    resolve_account_clock,
    utc_offset_label,
)
from meta_api.client import MetaClient
from core.metrics import normalize_rule_level
from rules.engine import (
    RULE_ACTION_BY_TYPE,
    RuleAction,
    RuleCheck,
    RuleEngine,
    RuleEvaluationResult,
    yielded_rule,
)
from services.inventory_cache import AdsetInventoryService, PostgreSQLInventoryCache
from services.account_health import record_account_health
from services.analytics_store import AnalyticsFactService, resolve_account_period_dates

logger = logging.getLogger(__name__)

PENDING_RECONCILIATION_SECONDS = 15 * 60
# (days before the account's today, seconds between re-reads); the `last_7d`
# window is today plus the six days before it.
CLOSED_DAY_REFRESH_SCHEDULE = ((1, 60 * 60),) + tuple((back, 24 * 60 * 60) for back in range(2, 7))
DAY_BOUNDARY_NOTIFICATION_WINDOW_MINUTES = 5
# Successful history rows that switch an entity on or off; the latest one today
# tells whether a person turned it back on after a rule's stop.
STATUS_EVENT_TYPES = (
    "STOP",
    "AUTO_REACTIVATE",
    "MANUAL_PAUSE",
    "MANUAL_REACTIVATE",
    "UNDO_ACTION",
)
MANUAL_ENABLE_IN_BUYERLY = "You turned it on in Buyerly"
MANUAL_ENABLE_IN_META = "Turned on again in Meta Ads Manager"

class MonitoringWorker:
    """
    Background worker that periodically polls every active account, tracks
    time zones and day rollovers, applies stop/reactivation rules and
    records every decision in the audit log.
    """

    def __init__(
        self, 
        meta_client: Optional[MetaClient] = None,
        clock: Optional[Callable[[], float]] = None,
    ):
        self.meta_client = meta_client or MetaClient(cache_provider=PostgreSQLInventoryCache())
        # A wall clock is intentionally used: persisted timestamps must remain
        # meaningful after a process restart, unlike time.monotonic().
        self._clock = clock or time.time
        self._current_cycle_id = ""
        self._action_semaphore = asyncio.Semaphore(1)
        # The pause between accounts; a simulation replaces it.
        self._sleep = asyncio.sleep
        # (account_id, local date) -> clock time of the last closed-day refresh.
        # In memory on purpose: after a restart the days are simply re-read.
        self._closed_day_refreshed: dict[tuple[str, str], float] = {}

    def _closed_day_due(self, account: Account, now: float) -> Optional[str]:
        """The closed account-local day whose facts should be re-read now.

        Meta keeps changing a finished day: the last minutes of spend arrive
        after midnight and conversions are attributed back to the day of the
        click or view for days. The worker only syncs `today`, so without a
        refresh `yesterday` and the week would keep the totals of the last
        sync before midnight (#212). Yesterday is re-read every hour, the five
        days before it once a day; one day per cycle keeps the cost flat.
        """
        today = date.fromisoformat(
            resolve_account_period_dates(
                account.timezone_name,
                "today",
                datetime.fromtimestamp(now, timezone.utc),
            )[0]
        )
        for days_back, interval in CLOSED_DAY_REFRESH_SCHEDULE:
            day = (today - timedelta(days=days_back)).isoformat()
            refreshed_at = self._closed_day_refreshed.get((str(account.account_id), day))
            if refreshed_at is None or now - refreshed_at >= interval:
                return day
        return None

    @staticmethod
    def _load_rules(
        raw_rules: Any,
        *,
        workspace_id: int | None,
    ) -> list[dict[str, Any]]:
        try:
            rules = json.loads(raw_rules) if isinstance(raw_rules, str) else raw_rules
        except (TypeError, ValueError):
            return []
        if not isinstance(rules, list):
            return []
        if workspace_id is None:
            return []
        return [
            rule
            for rule in rules
            if isinstance(rule, dict)
            and rule.get("workspace_id") == workspace_id
            and rule.get("enabled", True) is not False
        ]

    @staticmethod
    def _stats_noun(evaluation: RuleEvaluationResult) -> str:
        """Plural noun of the acted-on level, for the per-cycle counters."""
        return {
            "adset": "adsets",
            "campaign": "campaigns",
            "ad": "ads",
        }.get(evaluation.entity_level, "adsets")

    @staticmethod
    def _rule_level(rule: Any) -> str:
        """Execution level of a rule snapshot, defaulting to the ad set level."""
        if not isinstance(rule, dict):
            return "adset"
        try:
            return normalize_rule_level(rule.get("level"))
        except ValueError:
            return "adset"

    @staticmethod
    def _campaign_entities(
        adsets: list[dict[str, Any]],
        campaigns: list[dict[str, Any]],
        insights_by_window: dict[str, dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], dict[str, dict[str, dict[str, Any]]]]:
        """Roll ad set rows up into the campaigns that own them.

        Every metric a rule can test is either additive (spend, leads,
        registrations, purchases, clicks, impressions) or derived from additive
        ones (cpl, cpreg, cpp, cpc, ctr), so the rollup is exact and needs no
        extra Meta read. Identity and delivery state come from the campaign
        inventory: an ad set left ACTIVE inside a PAUSED campaign must not make
        the campaign look live.
        """

        def blank() -> dict[str, Any]:
            return {
                "spend": 0.0,
                "leads": 0,
                "registrations": 0,
                "purchases": 0,
                "clicks": 0,
                "impressions": 0,
            }

        def accumulate(target: dict[str, Any], row: dict[str, Any]) -> None:
            target["spend"] += float(row.get("spend", 0.0) or 0.0)
            target["leads"] += int(row.get("leads", 0) or 0)
            target["registrations"] += int(row.get("registrations", 0) or 0)
            target["purchases"] += int(row.get("purchases", 0) or 0)
            target["clicks"] += int(row.get("clicks", 0) or 0)
            target["impressions"] += int(row.get("impressions", 0) or 0)

        def derive(totals: dict[str, Any]) -> dict[str, Any]:
            clicks = totals["clicks"]
            impressions = totals["impressions"]
            return {
                **totals,
                "spend": round(totals["spend"], 6),
                "cpc": round(totals["spend"] / clicks, 2) if clicks > 0 else 0.0,
                "ctr": round((clicks / impressions) * 100, 2) if impressions > 0 else 0.0,
            }

        campaign_of_adset: dict[str, str] = {}
        today_totals: dict[str, dict[str, Any]] = {}
        for adset in adsets:
            campaign_id = str(adset.get("campaign_id") or "")
            if not campaign_id:
                # Without a known campaign the row cannot be attributed; leaving
                # it out is safer than folding it into the wrong campaign.
                continue
            campaign_of_adset[str(adset.get("adset_id") or "")] = campaign_id
            accumulate(today_totals.setdefault(campaign_id, blank()), adset)

        entities = []
        for campaign in campaigns:
            campaign_id = str(campaign.get("campaign_id") or "")
            if not campaign_id:
                continue
            entities.append({
                **derive(today_totals.get(campaign_id, blank())),
                "entity_level": "campaign",
                "entity_id": campaign_id,
                "entity_name": campaign.get("campaign_name") or f"Campaign {campaign_id}",
                "campaign_id": campaign_id,
                "status": campaign.get("status", "UNKNOWN"),
                "effective_status": campaign.get(
                    "effective_status", campaign.get("status", "UNKNOWN")
                ),
            })

        windows_by_campaign: dict[str, dict[str, dict[str, Any]]] = {}
        for window, rows_by_adset in insights_by_window.items():
            window_totals: dict[str, dict[str, Any]] = {}
            for adset_id, row in rows_by_adset.items():
                campaign_id = campaign_of_adset.get(str(adset_id))
                if not campaign_id:
                    continue
                accumulate(window_totals.setdefault(campaign_id, blank()), row)
            for campaign_id, totals in window_totals.items():
                windows_by_campaign.setdefault(campaign_id, {})[window] = derive(totals)

        return entities, windows_by_campaign

    @staticmethod
    def _interval_minutes(value: Any, fallback: int) -> int:
        try:
            return max(1, int(value))
        except (TypeError, ValueError):
            return max(1, fallback)

    @staticmethod
    def _is_critical_stop_rule(rule: dict[str, Any]) -> bool:
        return str(rule.get("action") or "").lower() in {
            "turn_off",
            "stop",
            "pause",
        }

    async def _fetch_account_snapshot(
        self,
        *,
        account: Account,
        access_token: str,
        due_rules: list[dict[str, Any]],
        health_due: bool,
        semaphore: asyncio.Semaphore,
        now: Optional[float] = None,
    ) -> dict[str, Any]:
        """Collect one account's Meta reads under the global concurrency cap."""

        now = self._clock() if now is None else now
        async with semaphore:
            priority = (
                "critical"
                if any(self._is_critical_stop_rule(rule) for rule in due_rules)
                else "normal"
            )
            account_info = None
            currency = normalize_currency(account.currency)

            if health_due or currency == "UNKNOWN":
                account_info = await self.meta_client.get_account_info(
                    account.account_id,
                    access_token,
                    priority=priority,
                )
                currency = normalize_currency(account_info.get("currency") or currency)
            if currency == "UNKNOWN":
                raise RuntimeError(
                    "Meta did not return the ad account currency; automation is blocked"
                )

            today = await self.meta_client.get_adsets_insights(
                account_id=account.account_id,
                access_token=access_token,
                date_preset="today",
                currency=currency,
                priority=priority,
            )
            windows = {
                str(condition.get("time_window") or "today")
                for rule in due_rules
                for condition in (rule.get("conditions") or [])
                if isinstance(condition, dict)
                and str(condition.get("time_window") or "today") != "today"
            }

            async def fetch_window(window: str):
                rows = await self.meta_client.get_adsets_insights(
                    account_id=account.account_id,
                    access_token=access_token,
                    date_preset=window,
                    currency=currency,
                    priority=priority,
                )
                return window, {str(row["adset_id"]): row for row in rows}

            results = await asyncio.gather(
                *(fetch_window(window) for window in sorted(windows)),
                return_exceptions=True,
            )
            insights_by_window = {}
            window_errors = []
            for result in results:
                if isinstance(result, Exception):
                    window_errors.append(str(result))
                else:
                    window, rows = result
                    insights_by_window[window] = rows

            # Only paid for when a campaign rule is actually due this cycle.
            campaigns: list[dict[str, Any]] = []
            campaigns_error = None
            if any(self._rule_level(rule) == "campaign" for rule in due_rules):
                try:
                    campaigns = await self.meta_client.get_campaigns_inventory(
                        account_id=account.account_id,
                        access_token=access_token,
                        priority=priority,
                    )
                except Exception as campaign_error:
                    logger.warning(
                        "Failed to read campaign inventory for %s: %s",
                        account.account_id,
                        campaign_error,
                    )
                    campaigns_error = campaign_error

            # An ad is a leaf, so nothing can be summed up to it: its rows and
            # every window it needs are read at the ad level, and only when an
            # ad rule is due.
            ads: list[dict[str, Any]] = []
            ads_by_window: dict[str, dict[str, Any]] = {}
            ads_error = None
            if any(self._rule_level(rule) == "ad" for rule in due_rules):
                try:
                    ads = await self.meta_client.get_ads_insights(
                        account_id=account.account_id,
                        access_token=access_token,
                        date_preset="today",
                        currency=currency,
                        priority=priority,
                    )
                    for window in sorted(windows):
                        rows = await self.meta_client.get_ads_insights(
                            account_id=account.account_id,
                            access_token=access_token,
                            date_preset=window,
                            currency=currency,
                            priority=priority,
                        )
                        ads_by_window[window] = {
                            str(row["ad_id"]): row for row in rows
                        }
                except Exception as ad_error:
                    logger.warning(
                        "Failed to read ads for %s: %s", account.account_id, ad_error
                    )
                    ads = []
                    ads_by_window = {}
                    ads_error = ad_error

            hierarchical_facts = []
            hierarchy_error = None
            try:
                reporting_timezone = canonical_timezone_name(
                    (account_info or {}).get("timezone_name") or account.timezone_name
                )
                hierarchical_facts = await self.meta_client.get_hierarchical_insights(
                    account_id=account.account_id,
                    access_token=access_token,
                    date_preset="today",
                    currency=currency,
                    account_name=account.name,
                    priority=priority,
                    # The cycle's clock, not a fresh reading: one cycle, one day.
                    reporting_date=resolve_account_period_dates(
                        reporting_timezone,
                        "today",
                        datetime.fromtimestamp(now, timezone.utc),
                    )[0],
                )
            except Exception as h_err:
                logger.warning("Failed to collect hierarchical facts for %s: %s", account.account_id, h_err)
                hierarchy_error = h_err

            closed_day_facts: list[dict[str, Any]] = []
            closed_day = (
                self._closed_day_due(account, now)
                if hierarchy_error is None and isinstance(hierarchical_facts, list)
                else None
            )
            if closed_day:
                try:
                    refreshed = await self.meta_client.get_hierarchical_insights(
                        account_id=account.account_id,
                        access_token=access_token,
                        date_preset="today",
                        currency=currency,
                        account_name=account.name,
                        priority="normal",
                        reporting_date=closed_day,
                        include_idle_inventory=False,
                    )
                    if isinstance(refreshed, list):
                        closed_day_facts = refreshed
                    self._closed_day_refreshed[(str(account.account_id), closed_day)] = now
                except Exception as refresh_error:
                    # Not a health problem: the day keeps its last totals and
                    # the next cycle tries again.
                    logger.warning(
                        "Failed to refresh closed day %s for %s: %s",
                        closed_day,
                        account.account_id,
                        refresh_error,
                    )

            return {
                "closed_day_facts": closed_day_facts,
                "account_info": account_info,
                "currency": currency,
                "adsets": today,
                "campaigns": campaigns,
                "campaigns_error": campaigns_error,
                "ads": ads,
                "ads_by_window": ads_by_window,
                "ads_error": ads_error,
                "insights_by_window": insights_by_window,
                "window_errors": window_errors,
                "hierarchical_facts": hierarchical_facts,
                "hierarchy_error": hierarchy_error,
            }

    async def _persist_runtime_state(
        self,
        *,
        stats: dict[str, Any],
        started_at: str,
        duration_ms: int,
    ) -> None:
        usage_snapshot = (
            self.meta_client.get_usage_snapshot()
            if hasattr(self.meta_client, "get_usage_snapshot")
            else {}
        )
        # Runtime settings are readable by every signed-in user. Keep the
        # operational quota signal, but never expose another owner's account
        # identifiers from the per-account Meta header breakdown.
        usage = {
            "max_percent": int(usage_snapshot.get("max_percent", 0) or 0),
            "app": dict(usage_snapshot.get("app") or {}),
            "accounts_observed": len(usage_snapshot.get("accounts") or {}),
            "updated_at": usage_snapshot.get("updated_at"),
        }
        errors = list(stats.get("errors") or [])
        if errors:
            logger.warning(
                "Monitoring cycle %s finished with %d error(s): %s",
                stats.get("cycle_id"),
                len(errors),
                "; ".join(redact_secrets(str(error))[:240] for error in errors[:5]),
            )
        payload = {
            "cycle_id": stats.get("cycle_id"),
            "started_at": started_at,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "duration_ms": int(duration_ms),
            "accounts_checked": int(stats.get("accounts_checked", 0)),
            "accounts_skipped": int(stats.get("accounts_skipped", 0)),
            "rules_checked": int(stats.get("rules_checked", 0)),
            "adsets_checked": int(stats.get("adsets_checked", 0)),
            "actions_count": sum(
                int(stats.get(key, 0))
                for key in (
                    "adsets_stopped",
                    "campaigns_stopped",
                    "ads_stopped",
                    "adsets_reactivated",
                    "campaigns_reactivated",
                    "ads_reactivated",
                    "budgets_changed",
                    "proposals_sent",
                )
            ),
            # Error texts name ad accounts and may carry Meta credentials, and
            # this row is shared by every workspace: keep only the count here.
            # Per-account causes live in the workspace-scoped account health.
            "errors_count": len(errors),
            "usage": usage,
        }
        try:
            async with async_session_maker() as session:
                row = await session.get(AutomationRuntimeState, "monitoring")
                if row is None:
                    row = AutomationRuntimeState(state_key="monitoring")
                    session.add(row)
                existing_payload = dict(row.payload or {})
                if existing_payload.get("last_backup_at"):
                    payload["last_backup_at"] = existing_payload["last_backup_at"]
                if existing_payload.get("synthetic"):
                    payload["synthetic"] = existing_payload["synthetic"]
                row.payload = payload
                await session.commit()
        except Exception as error:
            logger.error("Failed to persist monitoring runtime state: %s", error)

    async def _set_account_health(
        self,
        session,
        account: Account,
        *,
        success: bool,
        emit_transition_event: bool = True,
        error: Any = None,
        cause: str | None = None,
        signals: dict[str, Any] | None = None,
    ) -> None:
        """Persist health and alert only when status/cause changes."""

        row, transitioned = await record_account_health(
            session,
            account,
            success=success,
            error=error,
            cause=cause,
            signals=signals,
        )
        if row is None or not transitioned:
            return
        health_status = row.status
        health_cause = row.cause
        health_message = row.last_error_message
        health_error_code = row.last_error_code
        health_failures = row.consecutive_failures
        if emit_transition_event:
            await self._persist_audit_event(
                session,
                account,
                event_type="ACCOUNT_HEALTH_RECOVERED" if success else "ACCOUNT_HEALTH_ALERT",
                status="SUCCESS" if success else health_status.upper(),
                category="ACCOUNT_HEALTH",
                action="MONITOR" if success else "INVESTIGATE",
                message="Account health recovered" if success else health_message,
                after_state={"status": health_status, "cause": health_cause},
                details={
                    "error_code": health_error_code,
                    "consecutive_failures": health_failures,
                },
            )

    @staticmethod
    def _rule_key(account_id: str, index: int, rule: dict[str, Any]) -> str:
        rule_id = rule.get("preset_id")
        return f"{account_id}:{rule_id if rule_id is not None else f'index-{index}'}"

    @staticmethod
    def _schedule_key(scope: str, account_id: str, rule_key: str = "") -> str:
        return f"{scope}:{account_id}:{rule_key}"

    @staticmethod
    def _evaluation_rule_key(evaluation: RuleEvaluationResult) -> str:
        if evaluation.rule_id is not None:
            return str(evaluation.rule_id)
        fingerprint = json.dumps(
            {
                "name": evaluation.rule_name,
                "conditions": evaluation.conditions_snapshot,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return f"inline-{hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:16]}"

    @classmethod
    def _execution_key(
        cls,
        account: Account,
        evaluation: RuleEvaluationResult,
    ) -> tuple[str, str]:
        rule_key = cls._evaluation_rule_key(evaluation)
        raw_key = ":".join(
            (
                str(account.account_id),
                str(evaluation.entity_id),
                rule_key,
                evaluation.action.value,
            )
        )
        digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
        return f"rule-action:{digest}", rule_key

    @staticmethod
    def _json_dict(raw_value: Any) -> dict[str, Any]:
        if isinstance(raw_value, dict):
            return raw_value
        try:
            value = json.loads(raw_value or "{}")
        except (TypeError, ValueError):
            return {}
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _state_matches(observed: dict[str, Any], desired: dict[str, Any]) -> bool:
        if "status" in desired:
            return str(observed.get("status", "")).upper() == str(desired["status"]).upper()
        if "daily_budget" in desired:
            try:
                return abs(float(observed.get("daily_budget")) - float(desired["daily_budget"])) < 0.01
            except (TypeError, ValueError):
                return False
        # Notification-only actions do not mutate Meta. A persisted PENDING
        # claim is treated as delivered-or-ambiguous to avoid duplicates.
        return observed == desired

    @staticmethod
    async def _get_or_create_schedule_state(
        session,
        *,
        state_key: str,
        account: Account,
        rule_key: str = "",
        state_cache: Optional[dict[str, AutomationScheduleState]] = None,
    ) -> AutomationScheduleState:
        if state_cache is not None and state_key in state_cache:
            return state_cache[state_key]

        state = (
            await session.execute(
                select(AutomationScheduleState).where(
                    AutomationScheduleState.state_key == state_key
                )
            )
        ).scalar_one_or_none()
        if state is not None:
            if state_cache is not None:
                state_cache[state_key] = state
            return state

        state = AutomationScheduleState(
            state_key=state_key,
            owner_user_id=account.owner_user_id,
            account_id=str(account.account_id),
            rule_key=rule_key,
            last_checked_at=0.0,
        )
        try:
            async with session.begin_nested():
                session.add(state)
                await session.flush()
            if state_cache is not None:
                state_cache[state_key] = state
            return state
        except IntegrityError:
            refreshed = (
                await session.execute(
                    select(AutomationScheduleState).where(
                        AutomationScheduleState.state_key == state_key
                    )
                )
            ).scalar_one()
            if state_cache is not None:
                state_cache[state_key] = refreshed
            return refreshed

    async def _claim_execution(
        self,
        session,
        account: Account,
        evaluation: RuleEvaluationResult,
        *,
        observed_state: dict[str, Any],
        desired_state: dict[str, Any],
        now: float,
    ) -> tuple[bool, str, RuleExecutionState]:
        """Claim one action before Meta mutation and reconcile ambiguous attempts."""

        execution_key, rule_key = self._execution_key(account, evaluation)
        query = select(RuleExecutionState).where(
            RuleExecutionState.execution_key == execution_key
        )
        state = (await session.execute(query.with_for_update())).scalar_one_or_none()
        if state is None:
            state = RuleExecutionState(
                execution_key=execution_key,
                owner_user_id=account.owner_user_id,
                account_id=str(account.account_id),
                adset_id=str(evaluation.entity_id) if evaluation.is_adset else "",
                entity_level=evaluation.entity_level,
                entity_id=str(evaluation.entity_id),
                rule_key=rule_key,
                action=evaluation.action.value,
            )
            session.add(state)
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
            state = (await session.execute(query.with_for_update())).scalar_one()

        if state.status == "PENDING":
            pending_target = self._json_dict(state.after_state)
            if self._state_matches(observed_state, pending_target):
                state.status = "SUCCESS"
                state.last_success_at = state.last_attempt_at or now
                state.details = {"reconciled_after_restart": True}
                await session.commit()
                return False, "reconciled", state
            if now - float(state.last_attempt_at or 0.0) < PENDING_RECONCILIATION_SECONDS:
                await session.commit()
                return False, "pending", state
            state.status = "ERROR"
            state.details = {"reason": "stale_pending_not_confirmed"}
            await session.commit()
            state = (await session.execute(query.with_for_update())).scalar_one()

        cooldown_minutes = max(0, int(evaluation.cooldown_minutes or 0))
        cooldown_seconds = cooldown_minutes * 60
        if (
            cooldown_seconds > 0
            and state.last_success_at is not None
            and now - float(state.last_success_at) < cooldown_seconds
        ):
            await session.commit()
            return False, "cooldown", state

        state.owner_user_id = account.owner_user_id
        state.status = "PENDING"
        state.correlation_id = self._current_cycle_id
        state.last_attempt_at = now
        state.before_state = observed_state
        state.after_state = desired_state
        state.details = {}
        await session.commit()
        return True, "claimed", state

    async def _confirm_stop_evaluation(
        self,
        session,
        account: Account,
        evaluation: RuleEvaluationResult,
        *,
        now: float,
        confirmation_seconds: int,
        max_gap_seconds: int,
    ) -> tuple[bool, str, Optional[RuleExecutionState]]:
        """Require a durable sequence of matching reads before a destructive STOP."""

        if confirmation_seconds <= 0:
            return True, "disabled", None

        execution_key, rule_key = self._execution_key(account, evaluation)
        query = select(RuleExecutionState).where(
            RuleExecutionState.execution_key == execution_key
        )
        state = (await session.execute(query.with_for_update())).scalar_one_or_none()
        if state is None:
            state = RuleExecutionState(
                execution_key=execution_key,
                owner_user_id=account.owner_user_id,
                account_id=str(account.account_id),
                adset_id=str(evaluation.entity_id) if evaluation.is_adset else "",
                entity_level=evaluation.entity_level,
                entity_id=str(evaluation.entity_id),
                rule_key=rule_key,
                action=evaluation.action.value,
            )
            session.add(state)
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
            state = (await session.execute(query.with_for_update())).scalar_one()

        # Let the normal claim path reconcile a Meta mutation that may have
        # completed immediately before a worker restart.
        if state.status == "PENDING":
            await session.commit()
            return True, "execution_pending", state

        details = self._json_dict(state.details)
        try:
            first_seen_at = float(details.get("first_seen_at", 0.0) or 0.0)
            last_seen_at = float(details.get("last_seen_at", 0.0) or 0.0)
            observations = int(details.get("observations", 0) or 0)
        except (TypeError, ValueError):
            first_seen_at = 0.0
            last_seen_at = 0.0
            observations = 0

        is_continuous = (
            state.status == "STOP_CONFIRMING"
            and first_seen_at > 0
            and last_seen_at > 0
            and now >= last_seen_at
            and now - last_seen_at <= max(1, max_gap_seconds)
        )
        if not is_continuous:
            state.status = "STOP_CONFIRMING"
            state.owner_user_id = account.owner_user_id
            state.correlation_id = self._current_cycle_id
            state.last_attempt_at = now
            state.before_state = {"status": "ACTIVE"}
            state.after_state = {"status": "PAUSED"}
            state.details = {
                "first_seen_at": now,
                "last_seen_at": now,
                "observations": 1,
                "confirmation_seconds": confirmation_seconds,
            }
            await session.commit()
            return False, "started", state

        observations += 1
        state.last_attempt_at = now
        state.details = {
            "first_seen_at": first_seen_at,
            "last_seen_at": now,
            "observations": observations,
            "confirmation_seconds": confirmation_seconds,
        }
        if now - first_seen_at < confirmation_seconds:
            await session.commit()
            return False, "waiting", state

        state.status = "IDLE"
        state.details = {
            "confirmed_at": now,
            "first_seen_at": first_seen_at,
            "observations": observations,
            "confirmation_seconds": confirmation_seconds,
        }
        await session.commit()
        return True, "confirmed", state

    async def _reset_stop_confirmations(
        self,
        session,
        account: Account,
        entity_id: str,
        *,
        keep_execution_key: Optional[str] = None,
        now: float,
    ) -> int:
        """Cancel stale STOP candidates when a scheduled STOP check no longer matches."""

        rows = (
            await session.execute(
                select(RuleExecutionState)
                .where(
                    RuleExecutionState.account_id == str(account.account_id),
                    RuleExecutionState.entity_id == str(entity_id),
                    RuleExecutionState.action == RuleAction.STOP.value,
                    RuleExecutionState.status == "STOP_CONFIRMING",
                )
                .with_for_update()
            )
        ).scalars().all()
        reset_count = 0
        for state in rows:
            if keep_execution_key and state.execution_key == keep_execution_key:
                continue
            state.status = "IDLE"
            state.correlation_id = self._current_cycle_id
            state.details = {
                "cancelled_at": now,
                "reason": "stop_condition_no_longer_matched",
            }
            reset_count += 1
        if reset_count:
            await session.commit()
        return reset_count

    async def _load_undone_rule_actions(
        self,
        session,
        account: Account,
        *,
        now: float,
    ) -> dict[str, set[str]]:
        """Rule actions the buyer undid today in this ad account, by entity.

        An undo overrules the rules: repeating the same action on the same
        entity minutes later would take the decision back. The ad account's
        day bounds it, like the `today` window most rules read.
        """
        day_start = self._account_day_start(account, now)
        source = aliased(AuditEvent)
        rows = await session.execute(
            select(AuditEvent.entity_id, source.event_type)
            .join(source, AuditEvent.reverts_event_id == source.id)
            .where(
                AuditEvent.workspace_id == account.workspace_id,
                AuditEvent.account_id == str(account.account_id),
                AuditEvent.event_type == "UNDO_ACTION",
                AuditEvent.status == "SUCCESS",
                AuditEvent.created_at >= day_start.astimezone(timezone.utc),
                source.category == "RULE_ACTION",
                source.actor_type == "system",
            )
        )
        undone: dict[str, set[str]] = {}
        for entity_id, event_type in rows:
            undone.setdefault(str(entity_id), set()).add(str(event_type))
        return undone

    async def _load_manual_enables(
        self,
        session,
        account: Account,
        entities: list[dict[str, Any]],
        *,
        now: float,
    ) -> dict[str, str]:
        """Entities a person turned back on today after a rule turned them off.

        Turning an entity on by hand is the same decision as undoing the stop
        (record 46): the rules leave it running until the ad account's day ends.
        Two ways are recognised: the switch in Buyerly, which leaves a
        ``MANUAL_REACTIVATE`` in the history, and Meta's own Ads Manager, which
        leaves nothing; there the latest status change Buyerly knows of today
        is the rule's stop, yet Meta now reports the entity ACTIVE.
        Returns the entity ids with the reason the rule state shows.
        """
        day_start = self._account_day_start(account, now)
        rows = await session.execute(
            select(
                AuditEvent.entity_id,
                AuditEvent.event_type,
                AuditEvent.category,
                AuditEvent.actor_type,
            )
            .where(
                AuditEvent.workspace_id == account.workspace_id,
                AuditEvent.account_id == str(account.account_id),
                AuditEvent.status == "SUCCESS",
                AuditEvent.event_type.in_(STATUS_EVENT_TYPES),
                AuditEvent.created_at >= day_start.astimezone(timezone.utc),
                AuditEvent.created_at
                < datetime.fromtimestamp(self._account_day_end(account, now), timezone.utc),
            )
            .order_by(AuditEvent.id.asc())
        )
        latest: dict[str, tuple[str, str, str]] = {}
        for entity_id, event_type, category, actor_type in rows:
            if entity_id:
                latest[str(entity_id)] = (
                    str(event_type), str(category or ""), str(actor_type or "")
                )
        status_by_entity = {
            str(entity.get("entity_id") or ""): str(entity.get("status") or "").upper()
            for entity in entities
        }
        holds: dict[str, str] = {}
        for entity_id, (event_type, category, actor_type) in latest.items():
            if event_type == "MANUAL_REACTIVATE" and actor_type == "user":
                holds[entity_id] = MANUAL_ENABLE_IN_BUYERLY
            elif (
                event_type == "STOP"
                and category == "RULE_ACTION"
                and actor_type == "system"
                and status_by_entity.get(entity_id) == "ACTIVE"
            ):
                holds[entity_id] = MANUAL_ENABLE_IN_META
        return holds

    @staticmethod
    def _rules_not_undone(
        rules: list[dict[str, Any]],
        undone: Optional[set[str]],
    ) -> list[dict[str, Any]]:
        """Drop the rules whose action the buyer undid on this entity today."""
        if not undone:
            return rules
        kept = []
        for rule in rules:
            action = RULE_ACTION_BY_TYPE.get(str(rule.get("action") or ""))
            if action is None or action.value not in undone:
                kept.append(rule)
        return kept

    async def _cooldown_until(
        self,
        session,
        account: Account,
        evaluation: RuleEvaluationResult,
        *,
        now: float,
    ) -> Optional[float]:
        """When this rule may act on this entity again, if it is cooling down.

        Checked before a STOP confirmation starts, so a rule waiting out its
        cooldown stays quiet instead of recording a candidate and a skip in the
        history on every check. A PENDING slot still goes through the claim so
        it gets reconciled.
        """
        cooldown_seconds = max(0, int(evaluation.cooldown_minutes or 0)) * 60
        if cooldown_seconds <= 0:
            return None
        execution_key, _ = self._execution_key(account, evaluation)
        state = (
            await session.execute(
                select(RuleExecutionState).where(
                    RuleExecutionState.execution_key == execution_key
                )
            )
        ).scalar_one_or_none()
        if (
            state is not None
            and state.status != "PENDING"
            and state.last_success_at is not None
            and now - float(state.last_success_at) < cooldown_seconds
        ):
            return float(state.last_success_at) + cooldown_seconds
        return None

    async def _is_cooling_down(
        self,
        session,
        account: Account,
        evaluation: RuleEvaluationResult,
        *,
        now: float,
    ) -> bool:
        """Whether this rule already acted on this entity within its cooldown."""
        return (
            await self._cooldown_until(session, account, evaluation, now=now)
        ) is not None

    @staticmethod
    def _account_day_start(account: Account, now: float) -> datetime:
        """Midnight that began the ad account's current day."""
        clock = resolve_account_clock(account.timezone_name)
        local_now = datetime.fromtimestamp(now, clock.zone if clock else timezone.utc)
        return datetime.combine(local_now.date(), day_time.min, tzinfo=local_now.tzinfo)

    @staticmethod
    def _account_day_end(account: Account, now: float) -> float:
        """Midnight that ends the ad account's current day, as a timestamp."""
        clock = resolve_account_clock(account.timezone_name)
        local_now = datetime.fromtimestamp(now, clock.zone if clock else timezone.utc)
        next_day = datetime.combine(
            local_now.date() + timedelta(days=1), day_time.min, tzinfo=local_now.tzinfo
        )
        return next_day.timestamp()

    async def _rule_outcomes(
        self,
        session,
        account: Account,
        entity: dict[str, Any],
        checks: list[RuleCheck],
        candidates: list[RuleEvaluationResult],
        chosen: list[RuleEvaluationResult],
        undone: Optional[set[str]],
        *,
        now: float,
        manual_enable: Optional[str] = None,
    ) -> dict[int, dict[str, Any]]:
        """Where each rule stands on one entity before anything runs (#322).

        A matched rule that will not act this check says why: the buyer undid
        its action today, it is cooling down, or it gave way to a stronger
        action or to another rule doing the same. The rules that do act are
        settled by the action loop through ``_note_outcome``.
        """
        chosen_change = next(
            (c for c in chosen if c.action != RuleAction.NOTIFY_ONLY), None
        )
        chosen_ids = {c.rule_id for c in chosen}
        candidates_by_id = {c.rule_id: c for c in candidates}
        outcomes: dict[int, dict[str, Any]] = {}
        for check in checks:
            rule_id = check.rule.get("preset_id")
            if not isinstance(rule_id, int) or rule_id in outcomes:
                continue
            outcome: dict[str, Any] = {
                "rule_id": rule_id,
                "entity_level": str(entity.get("entity_level") or "adset"),
                "entity_id": str(entity.get("entity_id") or ""),
                "entity_name": str(entity.get("entity_name") or ""),
                "campaign_id": str(entity.get("campaign_id") or ""),
                "state": check.outcome,
                "detail": check.detail,
                "wait_until": None,
                "yielded_to_rule_id": None,
                "yielded_to_rule_name": "",
                "acted_at": None,
            }
            outcomes[rule_id] = outcome
            if check.outcome != "matched" or rule_id in chosen_ids:
                continue
            action = RULE_ACTION_BY_TYPE.get(str(check.rule.get("action") or ""))
            if undone and action is not None and action.value in undone:
                outcome["state"] = "undone"
                outcome["wait_until"] = self._account_day_end(account, now)
                # Empty for an undo in Inbox; the reason when a person turned
                # the entity back on by hand, which the rule state shows.
                outcome["detail"] = (
                    manual_enable if manual_enable and action == RuleAction.STOP else ""
                )
                continue
            candidate = candidates_by_id.get(rule_id)
            if candidate is not None:
                until = await self._cooldown_until(session, account, candidate, now=now)
                if until is not None:
                    outcome["state"] = "cooldown"
                    outcome["wait_until"] = until
                    continue
            outcome["state"] = "yielded"
            if chosen_change is not None:
                outcome["yielded_to_rule_id"] = chosen_change.rule_id
                outcome["yielded_to_rule_name"] = chosen_change.rule_name
        return outcomes

    @staticmethod
    def _note_outcome(
        outcomes: dict[int, dict[str, Any]],
        evaluation: RuleEvaluationResult,
        state: str,
        *,
        detail: Optional[str] = None,
        wait_until: Optional[float] = None,
        acted_at: Optional[float] = None,
    ) -> None:
        outcome = outcomes.get(evaluation.rule_id) if evaluation.rule_id is not None else None
        if outcome is None:
            return
        outcome["state"] = state
        outcome["wait_until"] = wait_until
        if detail is not None:
            outcome["detail"] = detail
        if acted_at is not None:
            outcome["acted_at"] = acted_at

    async def _save_rule_states(
        self,
        session,
        account: Account,
        outcomes: list[dict[str, Any]],
        *,
        checked_rule_ids: set[int],
        attached_rule_ids: set[int],
        now: float,
    ) -> None:
        """Overwrite the account's rule-on-entity snapshot (#322).

        Rows for entities this check no longer saw, and for rules no longer
        attached, are dropped. The last action time survives a check in which
        the rule did not act. A failure here never stops automation.
        """
        if account.workspace_id is None:
            return
        account_ref = str(account.account_id)
        checked_at = datetime.fromtimestamp(now, timezone.utc)

        def stamp(value: Optional[float]) -> Optional[datetime]:
            return datetime.fromtimestamp(value, timezone.utc) if value else None

        rows: dict[tuple[int, str, str], dict[str, Any]] = {}
        for outcome in outcomes:
            key = (outcome["rule_id"], outcome["entity_level"], outcome["entity_id"])
            rows[key] = {
                "workspace_id": account.workspace_id,
                "account_id": str(account.account_id),
                "rule_id": outcome["rule_id"],
                "entity_level": outcome["entity_level"],
                "entity_id": outcome["entity_id"],
                "entity_name": outcome["entity_name"],
                "campaign_id": outcome["campaign_id"],
                "state": outcome["state"],
                "detail": outcome["detail"] or "",
                "wait_until": stamp(outcome["wait_until"]),
                "yielded_to_rule_id": outcome["yielded_to_rule_id"],
                "yielded_to_rule_name": outcome["yielded_to_rule_name"] or "",
                "checked_at": checked_at,
                "acted_at": stamp(outcome["acted_at"]),
            }
        values = list(rows.values())
        try:
            for start in range(0, len(values), 500):
                stmt = pg_insert(RuleEntityState).values(values[start:start + 500])
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_rule_entity_state",
                    set_={
                        "entity_name": stmt.excluded.entity_name,
                        "campaign_id": stmt.excluded.campaign_id,
                        "state": stmt.excluded.state,
                        "detail": stmt.excluded.detail,
                        "wait_until": stmt.excluded.wait_until,
                        "yielded_to_rule_id": stmt.excluded.yielded_to_rule_id,
                        "yielded_to_rule_name": stmt.excluded.yielded_to_rule_name,
                        "checked_at": stmt.excluded.checked_at,
                        "acted_at": func.coalesce(
                            stmt.excluded.acted_at, RuleEntityState.acted_at
                        ),
                    },
                )
                await session.execute(stmt)
            same_account = (
                RuleEntityState.workspace_id == account.workspace_id,
                RuleEntityState.account_id == str(account.account_id),
            )
            if checked_rule_ids:
                await session.execute(
                    delete(RuleEntityState).where(
                        *same_account,
                        RuleEntityState.rule_id.in_(sorted(checked_rule_ids)),
                        RuleEntityState.checked_at < checked_at,
                    )
                )
            await session.execute(
                delete(RuleEntityState).where(
                    *same_account,
                    RuleEntityState.rule_id.not_in(sorted(attached_rule_ids)),
                )
            )
            await session.commit()
        except Exception as error:
            await session.rollback()
            logger.error("Failed to save rule states for %s: %s", account_ref, error)

    async def _entity_actions_to_run(
        self,
        session,
        account: Account,
        candidates: list[RuleEvaluationResult],
        *,
        now: float,
    ) -> list[RuleEvaluationResult]:
        """Pick what the rules do to one entity this cycle (#296).

        Every alert runs: each notify-only rule sends its own message and
        waits out its own cooldown. Of the actions that change the entity
        (all of one kind, see ``RuleEngine.evaluate_all``) only one runs: the
        first rule not on cooldown, so a rule that has just acted no longer
        silences another rule doing the same. When all of them are on
        cooldown the first one still goes through, to be skipped and counted
        as before.

        The rule that runs also names the same-kind rules listed after it as
        having given way to it (#323); weaker kinds are already named by the
        engine.
        """
        changes = [c for c in candidates if c.action != RuleAction.NOTIFY_ONLY]
        alerts = [c for c in candidates if c.action == RuleAction.NOTIFY_ONLY]
        if not changes:
            return alerts
        chosen = 0
        for index, change in enumerate(changes):
            if not await self._is_cooling_down(session, account, change, now=now):
                chosen = index
                break
        change = changes[chosen]
        change.yielded_rules = [
            *(yielded_rule(later) for later in changes[chosen + 1:]),
            *change.yielded_rules,
        ]
        return [change, *alerts]

    @staticmethod
    def _finish_execution(
        state: RuleExecutionState,
        *,
        status: str,
        now: float,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        state.status = status
        if status == "SUCCESS":
            state.last_success_at = now
        state.details = details or {}

    async def _apply_entity_status(
        self,
        session,
        account: Account,
        evaluation: RuleEvaluationResult,
        *,
        access_token: str,
        status: str,
    ) -> None:
        """Write delivery state to Meta at the level the rule targets."""
        async with self._action_semaphore:
            try:
                if evaluation.is_adset:
                    await self.meta_client.set_adset_status(
                        adset_id=evaluation.entity_id,
                        access_token=access_token,
                        status=status,
                        account_id=account.account_id,
                    )
                elif evaluation.entity_level == "ad":
                    await self.meta_client.set_ad_status(
                        ad_id=evaluation.entity_id,
                        access_token=access_token,
                        status=status,
                        account_id=account.account_id,
                    )
                else:
                    await self.meta_client.set_campaign_status(
                        campaign_id=evaluation.entity_id,
                        access_token=access_token,
                        status=status,
                        account_id=account.account_id,
                    )
            except Exception as error:
                if not await self._mutation_landed(
                    account, evaluation, error, access_token=access_token, desired={"status": status}
                ):
                    raise
        if evaluation.is_adset:
            # The local inventory only mirrors ad sets; pausing a campaign is
            # reflected by the cache invalidation the client performs.
            await AdsetInventoryService.update_adset_status(
                session, account.account_id, evaluation.entity_id, status
            )

    async def _mutation_landed(
        self,
        account: Account,
        evaluation: RuleEvaluationResult,
        error: Exception,
        *,
        access_token: str,
        desired: dict[str, Any],
    ) -> bool:
        """Whether Meta holds the change although the write reported a failure.

        A write can time out after Meta applied it; once the client's retries
        are spent the worker used to record an error, Inbox said "failed" and
        Undo was unavailable for a change that had happened (#200). One read
        tells which it was. A token error is never second-guessed.
        """
        if isinstance(error, PermissionError) or not hasattr(self.meta_client, "get_entity_state"):
            return False
        try:
            current = await self.meta_client.get_entity_state(
                evaluation.entity_id,
                access_token,
                entity_level=evaluation.entity_level,
                currency=account.currency,
            )
        except Exception as read_error:
            logger.warning(
                "Could not read %s %s after a failed write: %s",
                evaluation.entity_level,
                evaluation.entity_id,
                read_error,
            )
            return False
        if not isinstance(current, dict) or not self._state_matches(current, desired):
            return False
        logger.warning(
            "Meta applied %s on %s %s although the write failed (%s)",
            desired,
            evaluation.entity_level,
            evaluation.entity_id,
            error,
        )
        return True

    async def _update_budget(
        self,
        account: Account,
        evaluation: RuleEvaluationResult,
        *,
        access_token: str,
        new_budget: float,
    ) -> None:
        async with self._action_semaphore:
            try:
                await self.meta_client.update_adset_budget(
                    adset_id=evaluation.entity_id,
                    access_token=access_token,
                    new_daily_budget_dollars=new_budget,
                    currency=account.currency,
                    account_id=account.account_id,
                )
            except Exception as error:
                if not await self._mutation_landed(
                    account,
                    evaluation,
                    error,
                    access_token=access_token,
                    desired={"daily_budget": new_budget},
                ):
                    raise

    @staticmethod
    async def _reflect_status(
        session,
        account: Account,
        evaluation: RuleEvaluationResult,
        status: str,
    ) -> None:
        """Show a confirmed switch in Ads Manager before the next sync (#200)."""
        await AnalyticsFactService.reflect_entity_change(
            session,
            workspace_id=account.workspace_id,
            account_id=account.account_id,
            entity_level=evaluation.entity_level,
            entity_id=evaluation.entity_id,
            status=status,
        )

    @staticmethod
    async def _record_stopped_adset(session, account: Account, result: RuleEvaluationResult) -> None:
        """Track a stopped ad set so a late conversion can propose reactivation.

        Only ad sets are tracked: the reactivation flow acts on ad sets.
        """
        if not result.is_adset:
            return
        query = await session.execute(
            select(StoppedAdSet).where(StoppedAdSet.adset_id == result.entity_id)
        )
        stopped = query.scalar_one_or_none()
        stopped_at = datetime.now(timezone.utc)
        if stopped:
            stopped.account_id = account.account_id
            stopped.adset_name = result.entity_name
            stopped.stop_spend = result.spend
            stopped.stop_leads = result.leads
            stopped.stop_registrations = result.registrations
            stopped.is_resolved = False
            stopped.stopped_at = stopped_at
        else:
            session.add(
                StoppedAdSet(
                    account_id=account.account_id,
                    adset_id=result.entity_id,
                    adset_name=result.entity_name,
                    stop_spend=result.spend,
                    stop_leads=result.leads,
                    stop_registrations=result.registrations,
                    is_resolved=False,
                    stopped_at=stopped_at,
                )
            )

    @staticmethod
    async def _resolve_stopped_adset(session, adset_id: str) -> None:
        query = await session.execute(
            select(StoppedAdSet).where(StoppedAdSet.adset_id == adset_id)
        )
        stopped = query.scalar_one_or_none()
        if stopped:
            stopped.is_resolved = True

    async def _persist_audit_event(
        self,
        session,
        account: Account,
        *,
        event_type: str,
        status: str,
        evaluation: Optional[RuleEvaluationResult] = None,
        category: str = "RULE_ACTION",
        action: str = "",
        message: str = "",
        before_state: Any = None,
        after_state: Any = None,
        details: Any = None,
        duration_ms: int = 0,
    ) -> Optional[int]:
        """Persist audit without breaking automation."""

        try:
            if account.workspace_id is None:
                raise ValueError(
                    f"Account {account.account_id} has no workspace; audit event is quarantined"
                )
            if account.owner_user_id is None:
                workspace_owner_id = (
                    await session.execute(
                        select(Workspace.owner_user_id).where(
                            Workspace.id == account.workspace_id
                        )
                    )
                ).scalar_one_or_none()
                if workspace_owner_id is None:
                    raise ValueError(
                        f"Account {account.account_id} has no resolvable audit owner"
                    )
                account.owner_user_id = workspace_owner_id

            audit_event = build_audit_event(
                account=account,
                event_type=event_type,
                status=status,
                correlation_id=self._current_cycle_id,
                category=category,
                evaluation=evaluation,
                action=action,
                message=message,
                before_state=before_state,
                after_state=after_state,
                details=details,
                duration_ms=duration_ms,
            )
            session.add(audit_event)
            await session.flush()
            audit_event_id = audit_event.id
            await session.commit()
            return audit_event_id
        except Exception as audit_error:
            await session.rollback()
            logger.error("Failed to persist audit event %s: %s", event_type, audit_error)
            return None

    async def _handle_token_error(
        self,
        session,
        acc: Account,
        error: Exception,
        connection_cache: dict[int, MetaConnection],
    ) -> None:
        logger.error("Token error for account %s: %s", acc.account_id, error)
        acc.is_active = False

        subcode = getattr(error, "subcode", None)
        subcode_key = getattr(error, "subcode_key", "UNKNOWN")
        title = getattr(error, "title", "")
        description = getattr(error, "description", "")
        action_hint = getattr(error, "action_hint", "")
        user_msg = getattr(error, "error_user_msg", "")
        fbtrace_id = getattr(error, "fbtrace_id", "")
        error_code = getattr(error, "code", 190)

        if acc.meta_connection_id and acc.meta_connection_id in connection_cache:
            conn = connection_cache[acc.meta_connection_id]
            conn.status = "error"
            conn.last_error = description or str(error)

        await self._persist_audit_event(
            session,
            acc,
            event_type="TOKEN_EXPIRED",
            status="ERROR",
            category="ACCOUNT_HEALTH",
            action="DISABLE_MONITORING",
            message=description or str(error),
            before_state={"is_active": True},
            after_state={"is_active": False},
            details={
                "error_code": error_code,
                "error_subcode": subcode,
                "subcode_key": subcode_key,
                "subcode_title": title,
                "subcode_description": description,
                "action_hint": action_hint,
                "error_user_msg": user_msg,
                "fbtrace_id": fbtrace_id,
            },
        )

    async def run_day_boundary_cycle(self) -> dict:
        """Notify once when each connected account enters a new local date."""

        self._current_cycle_id = uuid.uuid4().hex
        stats = {
            "cycle_id": self._current_cycle_id,
            "accounts_seen": 0,
            "dates_initialized": 0,
            "days_notified": 0,
            "boundaries_missed": 0,
            "invalid_timezones": 0,
            "errors": [],
        }
        now_ts = self._clock()

        async with async_session_maker() as session:
            accounts = (await session.execute(select(Account))).scalars().all()
            stats["accounts_seen"] = len(accounts)
            for account in accounts:
                account_id = str(account.account_id)
                clock = resolve_account_clock(account.timezone_name)
                if clock is None:
                    stats["invalid_timezones"] += 1
                    stats["errors"].append(
                        f"Account {account_id}: unknown timezone {account.timezone_name!r}"
                    )
                    logger.error(
                        "Account %s day boundary skipped: unknown timezone %r",
                        account_id,
                        account.timezone_name,
                    )
                    continue

                local_now = datetime.fromtimestamp(now_ts, timezone.utc).astimezone(clock.zone)
                decision = evaluate_day_boundary(
                    account.last_day_start_date,
                    local_now,
                    notification_window_minutes=DAY_BOUNDARY_NOTIFICATION_WINDOW_MINUTES,
                )
                timezone_changed = clock.canonical_name != account.timezone_name
                if timezone_changed:
                    account.timezone_name = clock.canonical_name
                if not decision.should_update:
                    if timezone_changed:
                        await session.commit()
                    continue

                previous_date = str(account.last_day_start_date or "")
                account.last_day_start_date = decision.current_date
                if not decision.should_notify:
                    if decision.reason == "initialized":
                        stats["dates_initialized"] += 1
                    else:
                        stats["boundaries_missed"] += 1
                        logger.warning(
                            "Account %s new local date %s was observed outside the midnight window",
                            account_id,
                            decision.current_date,
                        )
                    await session.commit()
                    continue

                offset = utc_offset_label(local_now)
                local_time = local_now.strftime("%H:%M")
                audit_event_id = await self._persist_audit_event(
                    session,
                    account,
                    event_type="ACCOUNT_DAY_STARTED",
                    status="SUCCESS",
                    category="MONITORING",
                    action="DETECT_ACCOUNT_DAY_BOUNDARY",
                    message=(
                        f"A new day started in the ad account: {decision.current_date} "
                        f"at {local_time} ({clock.canonical_name}, {offset})"
                    ),
                    before_state={"last_day_start_date": previous_date},
                    after_state={"last_day_start_date": decision.current_date},
                    details={
                        "timezone_name": clock.canonical_name,
                        "utc_offset": offset,
                        "local_date": decision.current_date,
                        "local_time": local_time,
                    },
                )
                if audit_event_id is None:
                    stats["errors"].append(
                        f"Account {account_id}: failed to persist account day boundary"
                    )
                    continue

                stats["days_notified"] += 1
                logger.info(
                    "Account %s entered local date %s at %s (%s, %s)",
                    account_id,
                    decision.current_date,
                    local_time,
                    clock.canonical_name,
                    offset,
                )

        return stats

    async def sync_account_facts(
        self,
        session,
        account: Account,
        date_preset: str = "today",
    ) -> int:
        """Explicitly fetch and persist hierarchical facts for one account."""
        if not account.workspace_id:
            return 0
        access_token = await resolve_account_access_token(session, account)
        currency = normalize_currency(account.currency)
        if currency == "UNKNOWN":
            info = await self.meta_client.get_account_info(account.account_id, access_token)
            currency = normalize_currency(info.get("currency"))
            account.currency = currency
            await session.commit()
        facts = await self.meta_client.get_hierarchical_insights(
            account_id=account.account_id,
            access_token=access_token,
            date_preset=date_preset,
            currency=currency,
            account_name=account.name,
            reporting_date=resolve_account_period_dates(
                account.timezone_name,
                date_preset,
            )[0],
        )
        if facts:
            return await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=account.workspace_id,
                account_id=account.account_id,
                facts=facts,
            )
        return 0

    async def sync_workspace_facts(
        self,
        session,
        workspace_id: int,
        user_accounts: List[Account],
        date_preset: str = "today",
    ) -> int:
        """Sync hierarchical facts across all accounts in a workspace."""
        total_facts = 0
        for acc in user_accounts:
            try:
                count = await self.sync_account_facts(session, acc, date_preset=date_preset)
                total_facts += count
            except Exception as err:
                logger.error("Failed to sync facts for account %s in workspace %s: %s", acc.account_id, workspace_id, err)
        return total_facts

    async def run_cycle(self) -> dict:
        cycle_started = time.perf_counter()
        started_at = datetime.now(timezone.utc).isoformat()
        self._current_cycle_id = uuid.uuid4().hex
        stats = {
            "cycle_id": self._current_cycle_id,
            "accounts_checked": 0,
            "accounts_skipped": 0,
            "rules_checked": 0,
            "adsets_checked": 0,
            "adsets_stopped": 0,
            "campaigns_stopped": 0,
            "ads_stopped": 0,
            "adsets_reactivated": 0,
            "campaigns_reactivated": 0,
            "ads_reactivated": 0,
            "budgets_changed": 0,
            "actions_skipped": 0,
            "actions_reconciled": 0,
            "stop_confirmations_waiting": 0,
            "proposals_sent": 0,
            "errors": []
        }

        async with async_session_maker() as session:
            # 1. Load every active account
            stmt = select(Account).where(Account.is_active == True)
            result = await session.execute(stmt)
            accounts = result.scalars().all()
            if not accounts:
                await self._persist_runtime_state(
                    stats=stats,
                    started_at=started_at,
                    duration_ms=(time.perf_counter() - cycle_started) * 1000,
                )
                return stats

            # Batch-preload AutomationScheduleState (chunked by 500)
            account_ids = [str(acc.account_id) for acc in accounts]
            schedule_cache: dict[str, AutomationScheduleState] = {}
            for i in range(0, len(account_ids), 500):
                chunk = account_ids[i:i + 500]
                chunk_rows = (
                    await session.execute(
                        select(AutomationScheduleState).where(
                            AutomationScheduleState.account_id.in_(chunk)
                        )
                    )
                ).scalars().all()
                for row in chunk_rows:
                    schedule_cache[row.state_key] = row

            # Batch-preload MetaConnection (chunked by 500)
            connection_ids = {
                acc.meta_connection_id
                for acc in accounts
                if acc.meta_connection_id is not None
            }
            connection_cache: dict[int, MetaConnection] = {}
            if connection_ids:
                conn_id_list = list(connection_ids)
                for i in range(0, len(conn_id_list), 500):
                    chunk_conn_ids = conn_id_list[i:i + 500]
                    conn_rows = (
                        await session.execute(
                            select(MetaConnection).where(
                                MetaConnection.id.in_(chunk_conn_ids)
                            )
                        )
                    ).scalars().all()
                    for conn in conn_rows:
                        connection_cache[conn.id] = conn

            settings_result = await session.execute(select(AppSettings).limit(1))
            app_settings = settings_result.scalar_one_or_none()
            default_interval = self._interval_minutes(
                app_settings.poll_interval_minutes if app_settings else 10,
                10,
            )
            critical_interval = self._interval_minutes(
                app_settings.critical_rule_interval_minutes if app_settings else 2,
                2,
            )
            stop_confirmation_minutes = max(
                0,
                min(
                    60,
                    int(app_settings.stop_confirmation_minutes if app_settings else 10),
                ),
            )
            health_interval = self._interval_minutes(
                app_settings.account_health_interval_minutes if app_settings else 15,
                15,
            )
            max_concurrent_accounts = self._interval_minutes(
                app_settings.max_concurrent_accounts if app_settings else 3,
                3,
            )
            max_concurrent_actions = self._interval_minutes(
                app_settings.max_concurrent_actions if app_settings else 3,
                3,
            )
            if hasattr(self.meta_client, "configure_automation"):
                self.meta_client.configure_automation(
                    inventory_cache_minutes=(
                        app_settings.inventory_cache_minutes if app_settings else 5
                    ),
                    adaptive_polling_enabled=(
                        app_settings.adaptive_polling_enabled if app_settings else True
                    ),
                    usage_soft_limit_percent=(
                        app_settings.usage_soft_limit_percent if app_settings else 60
                    ),
                    usage_hard_limit_percent=(
                        app_settings.usage_hard_limit_percent if app_settings else 80
                    ),
                )
            read_semaphore = asyncio.Semaphore(max_concurrent_accounts)
            self._action_semaphore = asyncio.Semaphore(max_concurrent_actions)

            prepared_accounts = []
            for acc in accounts:
                account_ref = str(acc.account_id)
                if acc.meta_connection_id and acc.meta_connection_id in connection_cache:
                    conn = connection_cache[acc.meta_connection_id]
                    if (
                        acc.workspace_id is not None
                        and conn.workspace_id is not None
                        and conn.workspace_id != acc.workspace_id
                    ):
                        logger.warning(
                            "Skipping account %s: Meta connection %s workspace mismatch (%s != %s)",
                            acc.account_id,
                            conn.id,
                            conn.workspace_id,
                            acc.workspace_id,
                        )
                        await self._set_account_health(
                            session,
                            acc,
                            success=False,
                            error="Meta connection workspace mismatch",
                            cause="system",
                            signals={"token_healthy": False},
                        )
                        continue
                    if conn.status in ("expired", "needs_reconnect", "missing_scopes", "error"):
                        logger.info(
                            "Skipping rule checks for account %s: Meta connection %s is in %s state",
                            acc.account_id,
                            conn.id,
                            conn.status,
                        )
                        await self._set_account_health(
                            session,
                            acc,
                            success=False,
                            error=f"Meta connection requires user action: {conn.status}",
                            cause="user",
                            signals={"token_healthy": False, "connection_status": conn.status},
                        )
                        continue

                now = self._clock()
                active_rules = self._load_rules(
                    acc.active_rules,
                    workspace_id=acc.workspace_id,
                )
                due_rule_entries = []
                if acc.rules_enabled:
                    for index, rule in enumerate(active_rules):
                        rule_key = self._rule_key(acc.account_id, index, rule)
                        interval = self._interval_minutes(
                            rule.get("check_interval"),
                            default_interval,
                        )
                        if self._is_critical_stop_rule(rule):
                            interval = min(interval, critical_interval)
                        state_key = self._schedule_key("rule", acc.account_id, rule_key)
                        schedule_state = await self._get_or_create_schedule_state(
                            session,
                            state_key=state_key,
                            account=acc,
                            rule_key=rule_key,
                            state_cache=schedule_cache,
                        )
                        if (
                            schedule_state.last_checked_at <= 0
                            or now - schedule_state.last_checked_at >= interval * 60
                        ):
                            due_rule_entries.append((rule_key, rule, schedule_state))

                account_state = await self._get_or_create_schedule_state(
                    session,
                    state_key=self._schedule_key("account", acc.account_id),
                    account=acc,
                    state_cache=schedule_cache,
                )
                account_monitor_due = (
                    account_state.last_checked_at <= 0
                    or now - account_state.last_checked_at >= default_interval * 60
                )
                health_state = await self._get_or_create_schedule_state(
                    session,
                    state_key=self._schedule_key("health", acc.account_id),
                    account=acc,
                    state_cache=schedule_cache,
                )
                health_due = (
                    health_state.last_checked_at <= 0
                    or now - health_state.last_checked_at >= health_interval * 60
                )
                currency_refresh_due = normalize_currency(acc.currency) == "UNKNOWN"
                if (
                    not account_monitor_due
                    and not due_rule_entries
                    and not health_due
                    and not currency_refresh_due
                ):
                    stats["accounts_skipped"] += 1
                    continue

                if account_monitor_due:
                    account_state.last_checked_at = now
                for _, _, schedule_state in due_rule_entries:
                    schedule_state.last_checked_at = now
                if health_due or currency_refresh_due:
                    health_state.last_checked_at = now

                due_rules = [rule for _, rule, _ in due_rule_entries]
                stats["accounts_checked"] += 1
                stats["rules_checked"] += len(due_rules)
                try:
                    access_token = await resolve_account_access_token(
                        session, acc, connection_cache=connection_cache
                    )
                except Exception as error:
                    stats["errors"].append(f"Account {account_ref}: {error}")
                    await self._set_account_health(
                        session,
                        acc,
                        success=False,
                        error=error,
                        signals={"token_healthy": False},
                    )
                    continue
                prepared_accounts.append(
                    {
                        "account": acc,
                        "account_ref": account_ref,
                        "now": now,
                        "due_rules": due_rules,
                        "health_due": health_due or currency_refresh_due,
                        "access_token": access_token,
                    }
                )

            await session.commit()
            snapshots = await asyncio.gather(
                *(
                    self._fetch_account_snapshot(
                        account=item["account"],
                        access_token=item["access_token"],
                        due_rules=item["due_rules"],
                        health_due=item["health_due"],
                        semaphore=read_semaphore,
                        now=item["now"],
                    )
                    for item in prepared_accounts
                ),
                return_exceptions=True,
            )

            for item, snapshot in zip(prepared_accounts, snapshots):
                acc = item["account"]
                account_ref = item["account_ref"]
                now = item["now"]
                due_rules = item["due_rules"]
                access_token = item["access_token"]
                try:
                    if isinstance(snapshot, PermissionError):
                        await self._handle_token_error(
                            session,
                            acc,
                            snapshot,
                            connection_cache,
                        )
                        await self._set_account_health(
                            session,
                            acc,
                            success=False,
                            emit_transition_event=False,
                            error=snapshot,
                            cause="user",
                            signals={"token_healthy": False},
                        )
                        continue
                    if isinstance(snapshot, Exception):
                        raise snapshot

                    acc_info = snapshot.get("account_info")
                    if acc_info:
                        acc.currency = normalize_currency(acc_info.get("currency"))
                        refreshed_timezone = canonical_timezone_name(
                            acc_info.get("timezone_name") or acc.timezone_name
                        )
                        if refreshed_timezone != acc.timezone_name:
                            acc.timezone_name = refreshed_timezone
                            acc.last_day_start_date = ""
                        status_code = acc_info.get("account_status", 1)
                        status_label = acc_info.get("status_label", f"Status #{status_code}")
                        acc.account_status = status_code
                        acc.status_label = status_label
                        if status_code != 1:
                            logger.warning(f"Account {acc.account_id} has issue: {status_label}")
                            acc.is_active = False
                            await self._persist_audit_event(
                                session,
                                acc,
                                event_type="ACCOUNT_ISSUE",
                                status="WARNING",
                                category="ACCOUNT_HEALTH",
                                action="DISABLE_MONITORING",
                                message=status_label,
                                before_state={"is_active": True, "account_status": acc.account_status},
                                after_state={"is_active": False, "account_status": status_code},
                                details={"status_label": status_label},
                            )
                            await self._set_account_health(
                                session,
                                acc,
                                success=False,
                                emit_transition_event=False,
                                error=f"Account status: {status_label}",
                                cause="user",
                                signals={"token_healthy": True, "account_active": False},
                            )
                            continue
                    acc.currency = snapshot["currency"]
                    window_errors = snapshot.get("window_errors") or []
                    if window_errors and due_rules:
                        stats["errors"].extend(
                            f"Account {account_ref} window: {error}"
                            for error in window_errors
                        )
                        await self._set_account_health(
                            session,
                            acc,
                            success=False,
                            error=window_errors[0],
                            signals={"token_healthy": True, "account_active": True},
                        )
                        continue
                    insights_by_window = snapshot["insights_by_window"]
                    adsets = snapshot["adsets"]
                    campaigns = snapshot.get("campaigns") or []
                    ads = snapshot.get("ads") or []
                    ads_by_window = snapshot.get("ads_by_window") or {}
                    stats["adsets_checked"] += len(adsets)

                    # Upsert hierarchical facts into Analytics Fact Store
                    hierarchical_facts = snapshot.get("hierarchical_facts")
                    hierarchy_error = snapshot.get("hierarchy_error")
                    if hierarchical_facts and acc.workspace_id:
                        try:
                            await AnalyticsFactService.upsert_entity_facts(
                                session,
                                workspace_id=acc.workspace_id,
                                account_id=acc.account_id,
                                facts=hierarchical_facts,
                            )
                        except Exception as store_err:
                            logger.error("Failed to upsert facts for %s: %s", acc.account_id, store_err)
                            hierarchy_error = store_err
                    closed_day_facts = snapshot.get("closed_day_facts")
                    if closed_day_facts and acc.workspace_id and hierarchy_error is None:
                        try:
                            # A savepoint: a failure must not undo today's facts.
                            async with session.begin_nested():
                                await AnalyticsFactService.upsert_entity_facts(
                                    session,
                                    workspace_id=acc.workspace_id,
                                    account_id=acc.account_id,
                                    facts=closed_day_facts,
                                )
                        except Exception as store_err:
                            logger.warning(
                                "Failed to store refreshed closed-day facts for %s: %s",
                                acc.account_id,
                                store_err,
                            )

                    if hierarchy_error is not None:
                        stats["errors"].append(
                            f"Account {account_ref} hierarchy sync: {hierarchy_error}"
                        )
                        await self._set_account_health(
                            session,
                            acc,
                            success=False,
                            error=f"Meta hierarchy sync failed: {hierarchy_error}",
                            signals={
                                "token_healthy": True,
                                "account_active": True,
                                "meta_read_ok": True,
                                "hierarchy_sync_ok": False,
                                "window_errors_count": len(window_errors),
                            },
                        )
                    else:
                        await self._set_account_health(
                            session,
                            acc,
                            success=True,
                            signals={
                                "token_healthy": True,
                                "account_active": True,
                                "meta_read_ok": True,
                                "hierarchy_sync_ok": True,
                                "window_errors_count": len(window_errors),
                            },
                        )

                    if not acc.rules_enabled or not due_rules:
                        continue

                    stop_rules_due = any(
                        self._is_critical_stop_rule(rule) for rule in due_rules
                    )
                    undone_actions = await self._load_undone_rule_actions(
                        session,
                        acc,
                        now=now,
                    )

                    entities: list[dict[str, Any]] = [
                        {
                            **adset,
                            "entity_level": "adset",
                            "entity_id": str(adset["adset_id"]),
                            "entity_name": str(adset.get("adset_name") or ""),
                        }
                        for adset in adsets
                    ]
                    entity_windows: dict[str, dict[str, dict[str, Any]]] = {
                        str(adset["adset_id"]): {
                            window: rows_by_adset.get(str(adset["adset_id"]), {})
                            for window, rows_by_adset in insights_by_window.items()
                        }
                        for adset in adsets
                    }
                    if campaigns:
                        campaign_entities, campaign_windows = self._campaign_entities(
                            adsets, campaigns, insights_by_window
                        )
                        entities.extend(campaign_entities)
                        entity_windows.update(campaign_windows)
                    elif snapshot.get("campaigns_error") is not None:
                        stats["errors"].append(
                            f"Account {account_ref}: campaign inventory unavailable "
                            f"({snapshot['campaigns_error']}); campaign rules skipped "
                            "this cycle"
                        )

                    for ad in ads:
                        ad_id = str(ad["ad_id"])
                        entities.append({
                            **ad,
                            "entity_level": "ad",
                            "entity_id": ad_id,
                            "entity_name": str(ad.get("ad_name") or ""),
                        })
                        entity_windows[ad_id] = {
                            window: rows_by_ad.get(ad_id, {})
                            for window, rows_by_ad in ads_by_window.items()
                        }
                    if snapshot.get("ads_error") is not None:
                        stats["errors"].append(
                            f"Account {account_ref}: ads unavailable "
                            f"({snapshot['ads_error']}); ad rules skipped this cycle"
                        )

                    # A person turning a stopped entity back on holds the
                    # stop like an undo does, until the account's day ends.
                    manual_enables = await self._load_manual_enables(
                        session,
                        acc,
                        entities,
                        now=now,
                    )
                    for held_id in manual_enables:
                        undone_actions.setdefault(held_id, set()).add(RuleAction.STOP.value)

                    rule_outcomes: list[dict[str, Any]] = []
                    # A token Meta refused on a write stops this account's actions
                    # for the cycle and is handled like one refused on a read.
                    token_error: Optional[PermissionError] = None
                    for adset in entities:
                        if token_error is not None:
                            break
                        a_id = str(adset["entity_id"])
                        current_adset_windows = entity_windows.get(a_id, {})

                        candidates = RuleEngine.evaluate_all(
                            entity=adset,
                            account=acc,
                            insights_by_window=current_adset_windows,
                            active_rules_override=self._rules_not_undone(
                                due_rules,
                                undone_actions.get(a_id),
                            ),
                        )
                        entity_actions = await self._entity_actions_to_run(
                            session,
                            acc,
                            candidates,
                            now=now,
                        )
                        outcomes = await self._rule_outcomes(
                            session,
                            acc,
                            adset,
                            RuleEngine.check(
                                entity=adset,
                                account=acc,
                                insights_by_window=current_adset_windows,
                                active_rules_override=due_rules,
                            ),
                            candidates,
                            entity_actions,
                            undone_actions.get(a_id),
                            now=now,
                            manual_enable=manual_enables.get(a_id),
                        )
                        rule_outcomes.extend(outcomes.values())
                        if not entity_actions:
                            if stop_rules_due:
                                await self._reset_stop_confirmations(
                                    session,
                                    acc,
                                    a_id,
                                    now=now,
                                )
                            continue

                        if stop_rules_due:
                            keep_execution_key = None
                            if entity_actions[0].action == RuleAction.STOP:
                                keep_execution_key, _ = self._execution_key(acc, entity_actions[0])
                            await self._reset_stop_confirmations(
                                session,
                                acc,
                                a_id,
                                keep_execution_key=keep_execution_key,
                                now=now,
                            )

                        for eval_res in entity_actions:
                            if token_error is not None:
                                break
                            current_budget = float(adset.get("daily_budget", 0.0) or 0.0)
                            observed_state: dict[str, Any]
                            desired_state: dict[str, Any]
                            if eval_res.action == RuleAction.STOP:
                                observed_state = {"status": adset.get("status", "UNKNOWN")}
                                desired_state = {"status": "PAUSED"}
                            elif eval_res.action == RuleAction.AUTO_REACTIVATE:
                                observed_state = {"status": adset.get("status", "UNKNOWN")}
                                desired_state = {"status": "ACTIVE"}
                            elif eval_res.action == RuleAction.INCREASE_BUDGET:
                                if current_budget <= 0 or eval_res.budget_change_percent <= 0:
                                    stats["actions_skipped"] += 1
                                    self._note_outcome(
                                        outcomes, eval_res, "skipped",
                                        detail="No daily budget to change at this level",
                                    )
                                    continue
                                new_budget = current_budget * (1 + eval_res.budget_change_percent / 100.0)
                                if eval_res.budget_max_daily > 0:
                                    new_budget = min(new_budget, eval_res.budget_max_daily)
                                observed_state = {"daily_budget": current_budget}
                                desired_state = {"daily_budget": new_budget}
                            elif eval_res.action == RuleAction.DECREASE_BUDGET:
                                if current_budget <= 0 or eval_res.budget_change_percent <= 0:
                                    stats["actions_skipped"] += 1
                                    self._note_outcome(
                                        outcomes, eval_res, "skipped",
                                        detail="No daily budget to change at this level",
                                    )
                                    continue
                                new_budget = max(
                                    current_budget * (1 - eval_res.budget_change_percent / 100.0),
                                    1.0,
                                )
                                observed_state = {"daily_budget": current_budget}
                                desired_state = {"daily_budget": new_budget}
                            else:
                                observed_state = {"status": adset.get("status", "UNKNOWN")}
                                desired_state = dict(observed_state)

                            cooldown_until = await self._cooldown_until(
                                session, acc, eval_res, now=now
                            )
                            if cooldown_until is not None:
                                stats["actions_skipped"] += 1
                                self._note_outcome(
                                    outcomes, eval_res, "cooldown", wait_until=cooldown_until
                                )
                                continue

                            if eval_res.action == RuleAction.STOP:
                                confirmed, confirmation_reason, confirmation_state = (
                                    await self._confirm_stop_evaluation(
                                        session,
                                        acc,
                                        eval_res,
                                        now=now,
                                        confirmation_seconds=stop_confirmation_minutes * 60,
                                        max_gap_seconds=max(180, critical_interval * 60 * 3),
                                    )
                                )
                                if not confirmed:
                                    stats["actions_skipped"] += 1
                                    stats["stop_confirmations_waiting"] += 1
                                    confirming_since = (
                                        self._json_dict(confirmation_state.details).get("first_seen_at")
                                        if confirmation_state
                                        else None
                                    )
                                    self._note_outcome(
                                        outcomes,
                                        eval_res,
                                        "confirming",
                                        wait_until=(
                                            float(confirming_since) + stop_confirmation_minutes * 60
                                            if isinstance(confirming_since, (int, float))
                                            else None
                                        ),
                                    )
                                    if confirmation_reason == "started" and confirmation_state:
                                        await self._persist_audit_event(
                                            session,
                                            acc,
                                            event_type="STOP_CONFIRMATION_STARTED",
                                            status="WAITING",
                                            category="RULE_ENGINE",
                                            evaluation=eval_res,
                                            action=RuleAction.STOP.value,
                                            message=(
                                                "A STOP candidate was found. Buyerly will re-check the "
                                                f"metrics within {stop_confirmation_minutes} min."
                                            ),
                                            before_state=observed_state,
                                            after_state=desired_state,
                                            details={
                                                "confirmation_minutes": stop_confirmation_minutes,
                                                "execution_key": confirmation_state.execution_key,
                                            },
                                        )
                                    continue

                            claimed, claim_reason, execution_state = await self._claim_execution(
                                session,
                                acc,
                                eval_res,
                                observed_state=observed_state,
                                desired_state=desired_state,
                                now=now,
                            )
                            if not claimed:
                                stats["actions_skipped"] += 1
                                if claim_reason == "reconciled":
                                    stats["actions_reconciled"] += 1
                                    self._note_outcome(
                                        outcomes,
                                        eval_res,
                                        "fired",
                                        acted_at=execution_state.last_success_at,
                                    )
                                elif claim_reason == "cooldown":
                                    self._note_outcome(
                                        outcomes,
                                        eval_res,
                                        "cooldown",
                                        wait_until=(
                                            float(execution_state.last_success_at or now)
                                            + max(0, int(eval_res.cooldown_minutes or 0)) * 60
                                        ),
                                    )
                                else:
                                    self._note_outcome(outcomes, eval_res, "pending")
                                if claim_reason in {"cooldown", "pending", "reconciled"}:
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type=(
                                            "RULE_ACTION_RECONCILED"
                                            if claim_reason == "reconciled"
                                            else "RULE_ACTION_COOLDOWN"
                                            if claim_reason == "cooldown"
                                            else "RULE_ACTION_PENDING"
                                        ),
                                        status="SUCCESS" if claim_reason == "reconciled" else "SKIPPED",
                                        evaluation=eval_res,
                                        action=eval_res.action.value,
                                        message={
                                            "cooldown": f"Action skipped: cooldown {eval_res.cooldown_minutes} min.",
                                            "pending": "The action already started in a previous cycle; the duplicate was blocked.",
                                            "reconciled": "The previous action's result was confirmed against Meta's current state.",
                                        }[claim_reason],
                                        before_state=observed_state,
                                        after_state=desired_state,
                                        details={
                                            "claim_reason": claim_reason,
                                            "execution_key": execution_state.execution_key,
                                        },
                                    )
                                continue

                            # STOP the ad set
                            if eval_res.action == RuleAction.STOP:
                                action_started = time.perf_counter()
                                try:
                                    await self._apply_entity_status(
                                        session,
                                        acc,
                                        eval_res,
                                        access_token=access_token,
                                        status="PAUSED",
                                    )
                                    stats[f"{self._stats_noun(eval_res)}_stopped"] += 1
                                    logger.info(f"STOPPED {eval_res.entity_level}: {a_id} ({eval_res.entity_name}) - {eval_res.reason}")

                                    try:
                                        await self._record_stopped_adset(session, acc, eval_res)
                                    except Exception as db_error:
                                        await session.rollback()
                                        logger.error(f"Failed to persist stopped adset {a_id}: {db_error}")
                                        stats["errors"].append(f"Stopped-adset persistence error {a_id}: {db_error}")

                                    self._finish_execution(
                                        execution_state,
                                        status="SUCCESS",
                                        now=now,
                                    )
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type="STOP",
                                        status="SUCCESS",
                                        evaluation=eval_res,
                                        before_state={"status": adset.get("status", "ACTIVE")},
                                        after_state={"status": "PAUSED"},
                                        duration_ms=(time.perf_counter() - action_started) * 1000,
                                    )
                                    await self._reflect_status(session, acc, eval_res, "PAUSED")

                                except Exception as e:
                                    logger.error(f"Error pausing adset {a_id}: {e}")
                                    if isinstance(e, PermissionError):
                                        token_error = e
                                    stats["errors"].append(f"Pause error {a_id}: {e}")
                                    self._finish_execution(
                                        execution_state,
                                        status="ERROR",
                                        now=now,
                                        details={"error": str(e)},
                                    )
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type="STOP",
                                        status="ERROR",
                                        evaluation=eval_res,
                                        message=str(e),
                                        before_state={"status": adset.get("status", "UNKNOWN")},
                                        after_state={"status": adset.get("status", "UNKNOWN")},
                                        duration_ms=(time.perf_counter() - action_started) * 1000,
                                    )

                            # NOTIFICATION ONLY (send notification only)
                            elif eval_res.action == RuleAction.NOTIFY_ONLY:
                                logger.info(f"NOTIFY ONLY {eval_res.entity_level}: {a_id} ({eval_res.entity_name}) - {eval_res.reason}")
                                self._finish_execution(
                                    execution_state,
                                    status="SUCCESS",
                                    now=now,
                                )
                                await self._persist_audit_event(
                                    session,
                                    acc,
                                    event_type="NOTIFY_ONLY",
                                    status="SUCCESS",
                                    evaluation=eval_res,
                                    before_state={"status": adset.get("status", "UNKNOWN")},
                                    after_state={"status": adset.get("status", "UNKNOWN")},
                                )

                            # OFFER TO TURN ON (late conversion)
                            elif eval_res.action == RuleAction.PROPOSE_REACTIVATE:
                                stats["proposals_sent"] += 1
                                logger.info(f"PROPOSE REACTIVATE {eval_res.entity_level}: {a_id} ({eval_res.entity_name}) - {eval_res.reason}")
                                self._finish_execution(
                                    execution_state,
                                    status="SUCCESS",
                                    now=now,
                                )
                                await self._persist_audit_event(
                                    session,
                                    acc,
                                    event_type="PROPOSE_REACTIVATE",
                                    status="SUCCESS",
                                    evaluation=eval_res,
                                    before_state={"status": adset.get("status", "UNKNOWN")},
                                    after_state={"status": adset.get("status", "UNKNOWN")},
                                )


                            # AUTO TURN-ON
                            elif eval_res.action == RuleAction.AUTO_REACTIVATE:
                                action_started = time.perf_counter()
                                try:
                                    await self._apply_entity_status(
                                        session,
                                        acc,
                                        eval_res,
                                        access_token=access_token,
                                        status="ACTIVE",
                                    )
                                    stats[f"{self._stats_noun(eval_res)}_reactivated"] += 1

                                    try:
                                        if eval_res.is_adset:
                                            await self._resolve_stopped_adset(session, a_id)
                                    except Exception as db_error:
                                        await session.rollback()
                                        logger.error(f"Failed to resolve stopped adset {a_id}: {db_error}")
                                        stats["errors"].append(f"Stopped-adset resolution error {a_id}: {db_error}")

                                    self._finish_execution(
                                        execution_state,
                                        status="SUCCESS",
                                        now=now,
                                    )
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type="AUTO_REACTIVATE",
                                        status="SUCCESS",
                                        evaluation=eval_res,
                                        before_state={"status": adset.get("status", "PAUSED")},
                                        after_state={"status": "ACTIVE"},
                                        duration_ms=(time.perf_counter() - action_started) * 1000,
                                    )
                                    await self._reflect_status(session, acc, eval_res, "ACTIVE")

                                    logger.info(f"AUTO REACTIVATED {eval_res.entity_level}: {a_id} ({eval_res.entity_name})")

                                except Exception as e:
                                    logger.error(f"Error auto-reactivating adset {a_id}: {e}")
                                    if isinstance(e, PermissionError):
                                        token_error = e
                                    stats["errors"].append(f"Auto-reactivate error {a_id}: {e}")
                                    self._finish_execution(
                                        execution_state,
                                        status="ERROR",
                                        now=now,
                                        details={"error": str(e)},
                                    )
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type="AUTO_REACTIVATE",
                                        status="ERROR",
                                        evaluation=eval_res,
                                        message=str(e),
                                        before_state={"status": adset.get("status", "UNKNOWN")},
                                        after_state={"status": adset.get("status", "UNKNOWN")},
                                        duration_ms=(time.perf_counter() - action_started) * 1000,
                                    )

                            # BUDGET INCREASE
                            elif eval_res.action == RuleAction.INCREASE_BUDGET:
                                action_started = time.perf_counter()
                                try:
                                    await self._update_budget(
                                        acc,
                                        eval_res,
                                        access_token=access_token,
                                        new_budget=new_budget,
                                    )
                                    stats["budgets_changed"] += 1
                                    self._finish_execution(execution_state, status="SUCCESS", now=now)
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type="INCREASE_BUDGET",
                                        status="SUCCESS",
                                        evaluation=eval_res,
                                        before_state={"daily_budget": current_budget},
                                        after_state={"daily_budget": new_budget},
                                        duration_ms=(time.perf_counter() - action_started) * 1000,
                                    )
                                except Exception as e:
                                    logger.error(f"Error increasing budget for adset {a_id}: {e}")
                                    if isinstance(e, PermissionError):
                                        token_error = e
                                    stats["errors"].append(f"Budget increase error {a_id}: {e}")
                                    self._finish_execution(
                                        execution_state,
                                        status="ERROR",
                                        now=now,
                                        details={"error": str(e)},
                                    )
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type="INCREASE_BUDGET",
                                        status="ERROR",
                                        evaluation=eval_res,
                                        message=str(e),
                                        before_state={"daily_budget": current_budget},
                                        after_state={"daily_budget": current_budget},
                                        duration_ms=(time.perf_counter() - action_started) * 1000,
                                    )

                            # BUDGET DECREASE
                            elif eval_res.action == RuleAction.DECREASE_BUDGET:
                                action_started = time.perf_counter()
                                try:
                                    await self._update_budget(
                                        acc,
                                        eval_res,
                                        access_token=access_token,
                                        new_budget=new_budget,
                                    )
                                    stats["budgets_changed"] += 1
                                    self._finish_execution(execution_state, status="SUCCESS", now=now)
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type="DECREASE_BUDGET",
                                        status="SUCCESS",
                                        evaluation=eval_res,
                                        before_state={"daily_budget": current_budget},
                                        after_state={"daily_budget": new_budget},
                                        duration_ms=(time.perf_counter() - action_started) * 1000,
                                    )
                                except Exception as e:
                                    logger.error(f"Error decreasing budget for adset {a_id}: {e}")
                                    if isinstance(e, PermissionError):
                                        token_error = e
                                    stats["errors"].append(f"Budget decrease error {a_id}: {e}")
                                    self._finish_execution(
                                        execution_state,
                                        status="ERROR",
                                        now=now,
                                        details={"error": str(e)},
                                    )
                                    await self._persist_audit_event(
                                        session,
                                        acc,
                                        event_type="DECREASE_BUDGET",
                                        status="ERROR",
                                        evaluation=eval_res,
                                        message=str(e),
                                        before_state={"daily_budget": current_budget},
                                        after_state={"daily_budget": current_budget},
                                        duration_ms=(time.perf_counter() - action_started) * 1000,
                                    )

                            if execution_state.status == "SUCCESS":
                                cooldown_seconds = max(0, int(eval_res.cooldown_minutes or 0)) * 60
                                self._note_outcome(
                                    outcomes,
                                    eval_res,
                                    "fired",
                                    acted_at=now,
                                    wait_until=now + cooldown_seconds if cooldown_seconds else None,
                                )
                            elif execution_state.status == "ERROR":
                                self._note_outcome(
                                    outcomes,
                                    eval_res,
                                    "error",
                                    detail=str(
                                        self._json_dict(execution_state.details).get("error")
                                        or "Meta rejected the action"
                                    ),
                                )

                    await self._save_rule_states(
                        session,
                        acc,
                        rule_outcomes,
                        checked_rule_ids={
                            rule["preset_id"]
                            for rule in due_rules
                            if isinstance(rule.get("preset_id"), int)
                        },
                        attached_rule_ids={
                            rule["preset_id"]
                            for rule in self._load_rules(
                                acc.active_rules, workspace_id=acc.workspace_id
                            )
                            if isinstance(rule.get("preset_id"), int)
                        },
                        now=now,
                    )
                    if token_error is not None:
                        # Without this the account looked healthy until the
                        # next read failed, and every check retried the write.
                        await self._handle_token_error(
                            session,
                            acc,
                            token_error,
                            connection_cache,
                        )
                        await self._set_account_health(
                            session,
                            acc,
                            success=False,
                            emit_transition_event=False,
                            error=token_error,
                            cause="user",
                            signals={"token_healthy": False},
                        )

                except Exception as e:
                    logger.error(f"Error processing account {account_ref}: {e}")
                    stats["errors"].append(f"Account {account_ref}: {e}")
                    await self._set_account_health(
                        session,
                        acc,
                        success=False,
                        error=e,
                    )

                # Random cross-account jitter (0.5-1.5s) to smooth the load on the Meta API
                jitter = random.uniform(0.5, 1.5)
                await self._sleep(jitter)

            await session.commit()

        await self._persist_runtime_state(
            stats=stats,
            started_at=started_at,
            duration_ms=(time.perf_counter() - cycle_started) * 1000,
        )
        return stats
