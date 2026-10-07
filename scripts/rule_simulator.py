"""Replay simulated buyer days through the real worker, rule engine and undo.

The ad accounts are invented: every ad set spends at its own pace and earns
clicks, leads and registrations at fixed spend points. The worker, the rule
engine, the stop confirmation, the audit trail (Inbox), the undo and the
MetaClient's retries are Buyerly's own, running against the disposable test
database. Rule writes and undo reads go through the real MetaClient into a
fake Meta endpoint (httpx MockTransport) that can answer 429, 5xx, time out
before or after applying the change, or refuse an expired token.

Each run reports, per ad set and per day:

- the cent at which a buyer following the cheat sheet perfectly stops it, at
  which Buyerly stopped it, and at which a buyer checking Ads Manager every N
  minutes would have;
- the delay from the moment the condition really held to the STOP in Inbox;
- extra actions (Buyerly stopped what the sheet keeps), early ones (stopped
  before the sheet would), missed ones, and double writes to Meta;
- after an undo: whether Meta is back, a repeated undo writes nothing and the
  rule leaves the ad set alone for the rest of the day.

The default rules are a Netherlands lead-gen buyer's cheat sheet:

- $3.00 and no click: dead;
- $3.50 and one click: dead;
- $4.00 and no lead: dead;
- $7.00, no registration and fewer than two leads: hard stop;
- $12.00: the ceiling, whatever happened.

Run it against the local disposable database only (the same guard as tests):

    TEST_DATABASE_URL=postgresql+asyncpg://buyerly:...@localhost:5432/buyerly_test \\
    TEST_DATABASE_DISPOSABLE=buyerly_test DATABASE_URL=$TEST_DATABASE_URL \\
    python -m scripts.rule_simulator --scenario all

`tests/test_rule_simulator.py` runs the same scenarios in CI and pins the
numbers; `docs/PILOT_SIMULATION.md` explains them.
"""

import argparse
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from core.action_undo import UndoError, reverse_audit_event
from database.models import (
    Account,
    AccountHealth,
    AppSettings,
    AuditEvent,
    User,
    Workspace,
    WorkspaceMember,
)
from meta_api.client import MetaClient, classify_meta_token_error
from tests.test_db_helper import create_test_engine, init_test_db

TIMEZONE = "Europe/Amsterdam"
ACCOUNT_ID = "act_simulated_nl"
LAUNCH_HOUR = 9

# (name, conditions) in the order a buyer reads the cheat sheet.
CHEAT_SHEET_RULES = [
    ("$3 and no click", [("spend", "gte", 3.0), ("clicks", "eq", 0)]),
    ("$3.50 and one click", [("spend", "gte", 3.5), ("clicks", "lte", 1)]),
    ("$4 and no lead", [("spend", "gte", 4.0), ("leads", "eq", 0)]),
    ("$7, no registration, under two leads", [("spend", "gte", 7.0), ("registrations", "eq", 0), ("leads", "lte", 1)]),
    ("$12 ceiling", [("spend", "gte", 12.0)]),
]

OPERATORS = {
    "gte": lambda value, target: value >= target,
    "lte": lambda value, target: value <= target,
    "eq": lambda value, target: value == target,
}

MANUAL_CHECK_MINUTES = (15, 30, 60)


@dataclass
class SimulatedAdSet:
    """One ad set: cents per minute and the spend at which each event lands."""

    adset_id: str
    name: str
    story: str
    cents_per_minute: int
    daily_budget: float = 30.0
    clicks_at: list[float] = field(default_factory=list)
    leads_at: list[float] = field(default_factory=list)
    registrations_at: list[float] = field(default_factory=list)
    status: str = "ACTIVE"
    spent_cents: int = 0
    history: list[int] = field(default_factory=lambda: [0])

    @property
    def dollars_per_minute(self) -> float:
        return self.cents_per_minute / 100

    def trajectory(self, minutes: float) -> float:
        """Spend after `minutes` if nobody ever paused it."""
        cents = min(int(self.daily_budget * 100), int(max(0.0, minutes) * self.cents_per_minute))
        return cents / 100

    def advance(self) -> None:
        """One more minute of delivery."""
        if self.status == "ACTIVE":
            self.spent_cents = min(int(self.daily_budget * 100), self.spent_cents + self.cents_per_minute)
        self.history.append(self.spent_cents)

    def spend_at_minute(self, minute: int) -> float:
        return self.history[max(0, min(minute, len(self.history) - 1))] / 100

    def counts_at(self, spend: float) -> dict:
        return {
            "clicks": sum(1 for point in self.clicks_at if point <= spend + 1e-9),
            "leads": sum(1 for point in self.leads_at if point <= spend + 1e-9),
            "registrations": sum(1 for point in self.registrations_at if point <= spend + 1e-9),
        }

    @staticmethod
    def sheet_rule(metrics: dict) -> Optional[str]:
        for name, conditions in CHEAT_SHEET_RULES:
            if all(OPERATORS[op](metrics[metric], value) for metric, op, value in conditions):
                return name
        return None

    def cheat_sheet_stop(self) -> tuple[Optional[float], Optional[str]]:
        """The first cent at which a buyer following the sheet turns it off."""
        for cent in range(int(round(self.daily_budget * 100)) + 1):
            spend = cent / 100
            rule = self.sheet_rule({"spend": spend, **self.counts_at(spend)})
            if rule:
                return spend, rule
        return None, None

    def manual_stop(self, every: int, *, spend_lag: int, event_lag: int, minutes: int) -> Optional[float]:
        """Spend when a buyer checking Ads Manager every `every` minutes stops it."""
        for check in range(every, minutes + 1, every):
            seen = {
                "spend": self.trajectory(check - spend_lag),
                **self.counts_at(self.trajectory(check - event_lag)),
            }
            if self.sheet_rule(seen):
                return self.trajectory(check)
        return None


def netherlands_day() -> list[SimulatedAdSet]:
    """A launch of lead-gen ad sets with the behaviours the sheet is written for."""
    return [
        SimulatedAdSet("nl_dead_fast", "NL · dead creative, fast", "never gets a click, spends fast", 10),
        SimulatedAdSet("nl_dead_slow", "NL · dead creative, slow", "never gets a click, spends slowly", 2),
        SimulatedAdSet("nl_one_click", "NL · one click", "a single click at $1.20, nothing else", 5,
                       clicks_at=[1.2]),
        SimulatedAdSet("nl_clicks_no_lead", "NL · clicks, no lead", "clicks but never a lead", 5,
                       clicks_at=[0.6, 1.4, 2.1, 2.9, 3.8, 5.0]),
        SimulatedAdSet("nl_late_lead", "NL · lead at $4.40", "the lead lands just after the $4 cut", 5,
                       clicks_at=[0.5, 1.5, 2.5, 3.3], leads_at=[4.4], registrations_at=[6.1]),
        SimulatedAdSet("nl_lead_no_reg", "NL · one lead, no registration", "a lead at $2.60, no registration", 6,
                       clicks_at=[0.7, 1.6, 2.2], leads_at=[2.6]),
        SimulatedAdSet("nl_two_leads", "NL · two leads, no registration", "two leads, so it runs to the ceiling", 6,
                       clicks_at=[0.5, 1.2, 2.0, 3.1], leads_at=[2.4, 5.8]),
        SimulatedAdSet("nl_winner", "NL · converts", "leads and a registration early", 8,
                       clicks_at=[0.3, 0.9, 1.5, 2.2], leads_at=[1.9, 3.7, 6.5], registrations_at=[4.2]),
    ]


def fast_day() -> list[SimulatedAdSet]:
    """Bigger budgets: the same sheet with ad sets burning 15-24 dollars an hour."""
    return [
        SimulatedAdSet("fast_dead", "Fast · dead creative", "no click at $0.40 a minute", 40),
        SimulatedAdSet("fast_one_click", "Fast · one click", "one click at $1.00", 30, clicks_at=[1.0]),
        SimulatedAdSet("fast_no_lead", "Fast · clicks, no lead", "clicks, never a lead", 25,
                       clicks_at=[0.4, 0.9, 1.7, 2.6, 3.3]),
        SimulatedAdSet("fast_hard_stop", "Fast · one lead, no registration", "a lead at $2.00 and nothing more", 35,
                       clicks_at=[0.5, 1.1, 1.8], leads_at=[2.0]),
        SimulatedAdSet("fast_winner", "Fast · converts", "leads at $1.50 and $3.00, registration at $3.50", 30,
                       clicks_at=[0.4, 0.8, 1.3], leads_at=[1.5, 3.0], registrations_at=[3.5]),
    ]


def late_events_day() -> list[SimulatedAdSet]:
    """Leads that land close to a threshold, read with the conversion lag."""
    return [
        SimulatedAdSet("late_lead_380", "Late · lead at $3.80", "the lead lands 20 cents before the $4 cut", 5,
                       clicks_at=[0.5, 1.4, 2.6], leads_at=[3.8]),
        SimulatedAdSet("late_lead_395", "Late · lead at $3.95", "the lead lands 5 cents before the $4 cut", 5,
                       clicks_at=[0.6, 1.5, 2.4], leads_at=[3.95], registrations_at=[5.2]),
        SimulatedAdSet("late_click_290", "Late · first click at $2.90", "the first click just before the $3 cut", 5,
                       clicks_at=[2.9, 3.4], leads_at=[3.6]),
        SimulatedAdSet("late_dead", "Late · dead creative", "no click at all", 5),
    ]


@dataclass
class Scenario:
    name: str
    title: str
    adsets: Callable[[], list[SimulatedAdSet]]
    spend_lag: int = 5
    event_lag: int = 5
    confirmation_minutes: int = 5
    hours: float = 10.0
    # Faults the fake Meta answers to the rule's writes, in order, then success.
    write_faults: tuple[str, ...] = ()
    # The token expires right before the first rule write.
    token_expires_on_first_write: bool = False
    # (ad set, minutes after its STOP) the buyer presses Undo, then again.
    undo: Optional[tuple[str, int]] = None
    undo_write_faults: tuple[str, ...] = ()


SCENARIOS = {
    scenario.name: scenario
    for scenario in (
        Scenario("nl_day", "NL lead-gen launch, cheat sheet", netherlands_day, hours=6),
        Scenario("fast_day", "Fast spenders, same sheet", fast_day, hours=3),
        Scenario("late_events", "Leads reported 15 min after the spend", late_events_day, event_lag=15, hours=4),
        Scenario("undo", "NL launch, the buyer undoes the first stop", netherlands_day,
                 undo=("nl_dead_fast", 10), hours=6),
        Scenario("meta_429", "Meta answers 429 to the first write", netherlands_day,
                 write_faults=("429",), hours=3),
        Scenario("meta_503", "Meta answers 503 three times", netherlands_day,
                 write_faults=("503", "503", "503"), hours=3),
        Scenario("timeout_before", "The first write times out before Meta applies it", netherlands_day,
                 write_faults=("timeout_before",), hours=3),
        Scenario("timeout_after", "The first write times out after Meta applied it", netherlands_day,
                 write_faults=("timeout_after",), hours=3),
        Scenario("timeout_after_all", "Applied, then every retry times out", netherlands_day,
                 write_faults=("timeout_after", "timeout_before", "timeout_before"), hours=3),
        Scenario("token_expired", "The token expires before the first write", netherlands_day,
                 token_expires_on_first_write=True, hours=3),
        Scenario("undo_timeout_after", "Undo applied in Meta, every retry times out", netherlands_day,
                 undo=("nl_dead_fast", 10),
                 undo_write_faults=("timeout_after", "timeout_before", "timeout_before"), hours=3),
    )
}


class FakeMeta:
    """Meta's ad set node: GET reads the state, POST changes it."""

    def __init__(self, adsets: dict[str, SimulatedAdSet]):
        self.adsets = adsets
        self.faults: list[str] = []
        self.token_expired = False
        self.expire_token_on_first_write = False
        self.posts: list[dict] = []
        # (ad set, new status) every time Meta's state really changed.
        self.changes: list[tuple[str, str]] = []
        self.minute = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        adset_id = request.url.path.rstrip("/").split("/")[-1]
        adset = self.adsets.get(adset_id)
        if adset is None:
            return httpx.Response(400, json={"error": {"code": 100, "message": "Unsupported request"}})
        if request.method == "POST":
            if self.expire_token_on_first_write and not self.posts:
                self.token_expired = True
            body = {key: values[-1] for key, values in parse_qs(request.content.decode()).items()}
            self.posts.append({"minute": self.minute, "adset": adset_id, "status": body.get("status")})
        if self.token_expired:
            return httpx.Response(400, json={"error": {
                "code": 190, "error_subcode": 463, "type": "OAuthException",
                "message": "Error validating access token: Session has expired.",
            }})
        if request.method == "GET":
            return httpx.Response(200, json={
                "id": adset_id, "account_id": ACCOUNT_ID[4:], "name": adset.name,
                "status": adset.status, "effective_status": adset.status,
                "daily_budget": str(int(adset.daily_budget * 100)),
            })
        fault = self.faults.pop(0) if self.faults else ""
        if fault == "429":
            return httpx.Response(429, json={"error": {"code": 17, "message": "User request limit reached"}})
        if fault == "503":
            return httpx.Response(503, json={"error": {"code": 2, "message": "Service temporarily unavailable"}})
        if fault == "timeout_before":
            raise httpx.ReadTimeout("simulated timeout before the write", request=request)
        status = body.get("status")
        if status in {"ACTIVE", "PAUSED"} and adset.status != status:
            adset.status = status
            self.changes.append((adset_id, status))
        if fault == "timeout_after":
            raise httpx.ReadTimeout("simulated timeout after the write", request=request)
        return httpx.Response(200, json={"success": True})


class SimulatedMetaClient(MetaClient):
    """Serves the simulated account; writes and state reads go over HTTP."""

    def __init__(self, adsets: list[SimulatedAdSet], fake: FakeMeta, scenario: Scenario):
        super().__init__()
        self.adsets = {adset.adset_id: adset for adset in adsets}
        self.fake = fake
        self.scenario = scenario
        self.minute = 0
        self.backoff_seconds = 0.0
        self._client = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))

        async def no_wait(seconds: float) -> None:
            self.backoff_seconds += seconds

        self._sleep = no_wait

    def _check_token(self) -> None:
        if self.fake.token_expired:
            raise classify_meta_token_error(
                {"code": 190, "error_subcode": 463, "message": "Error validating access token: Session has expired."}
            )

    def _row(self, adset: SimulatedAdSet) -> dict:
        spend = adset.spend_at_minute(self.minute - self.scenario.spend_lag)
        counts = adset.counts_at(adset.spend_at_minute(self.minute - self.scenario.event_lag))
        return {
            "adset_id": adset.adset_id,
            "adset_name": adset.name,
            "campaign_id": "nl_campaign",
            "status": adset.status,
            "effective_status": adset.status,
            "daily_budget": adset.daily_budget,
            "spend": spend,
            "impressions": counts["clicks"] * 60 + int(spend * 40),
            "purchases": 0,
            **counts,
        }

    async def get_account_info(self, account_id, access_token, *, priority="normal"):
        self._check_token()
        return {"id": account_id, "name": "Simulated NL", "timezone_name": TIMEZONE,
                "currency": "USD", "account_status": 1, "status_label": "Active (ACTIVE)"}

    async def get_adsets_insights(self, account_id, access_token, date_preset="today",
                                  currency="UNKNOWN", priority="normal"):
        self._check_token()
        if date_preset != "today":
            return []
        return [self._row(adset) for adset in self.adsets.values()]

    async def get_hierarchical_insights(self, *args, **kwargs):
        self._check_token()
        return []

    async def get_ads_insights(self, *args, **kwargs):
        return []

    async def get_campaigns_inventory(self, account_id, access_token, priority="normal"):
        return [{"campaign_id": "nl_campaign", "campaign_name": "NL leads",
                 "status": "ACTIVE", "effective_status": "ACTIVE"}]


async def _seed(sessions, *, confirmation_minutes: int, repeat_minutes: int) -> tuple[int, int]:
    async with sessions() as session:
        user = User(telegram_id="simulator", username="simulator", full_name="Simulator",
                    role="admin", is_approved=True)
        session.add(user)
        await session.flush()
        workspace = Workspace(name="Simulator", slug="simulator", badge_text="S",
                              badge_color="#3B82F6", owner_user_id=user.id)
        session.add(workspace)
        await session.flush()
        session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
        rules = [
            {
                "preset_id": index,
                "workspace_id": workspace.id,
                "name": name,
                "action": "turn_off",
                "level": "adset",
                "conditions": [
                    {"metric": metric, "operator": op, "value": float(value), "time_window": "today"}
                    for metric, op, value in conditions
                ],
                "logic": "and",
                "check_interval": 5,
                "cooldown_minutes": repeat_minutes,
                "budget_change_percent": 0.0,
                "budget_max_daily": 0.0,
            }
            for index, (name, conditions) in enumerate(CHEAT_SHEET_RULES, start=1)
        ]
        session.add(Account(account_id=ACCOUNT_ID, name="Simulated NL", access_token="simulated",
                            owner_user_id=user.id, workspace_id=workspace.id, timezone_name=TIMEZONE,
                            currency="USD", active_rules=json.dumps(rules), rules_enabled=True,
                            is_active=True))
        session.add(AppSettings(stop_confirmation_minutes=confirmation_minutes,
                                critical_rule_interval_minutes=2))
        await session.commit()
        return user.id, workspace.id


def _launch_timestamp() -> float:
    """09:00 of the account's real current day.

    Undo holds compare the database's own `created_at` (wall clock) with the
    account's day, so the simulated day must be the real one.
    """
    today = datetime.now(ZoneInfo(TIMEZONE)).date()
    return datetime(today.year, today.month, today.day, LAUNCH_HOUR, tzinfo=ZoneInfo(TIMEZONE)).timestamp()


async def simulate(scenario: Scenario | str = "nl_day", *, lag_minutes: Optional[int] = None,
                   confirmation_minutes: Optional[int] = None, hours: Optional[float] = None) -> dict:
    import scheduler.worker as worker_module

    if isinstance(scenario, str):
        scenario = SCENARIOS[scenario]
    overrides = {}
    if lag_minutes is not None:
        overrides.update(spend_lag=lag_minutes, event_lag=max(lag_minutes, scenario.event_lag))
    if confirmation_minutes is not None:
        overrides["confirmation_minutes"] = confirmation_minutes
    if hours is not None:
        overrides["hours"] = hours
    if overrides:
        scenario = Scenario(**{**scenario.__dict__, **overrides})

    engine = create_test_engine()
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await init_test_db(engine)
    worker_module.async_session_maker = sessions
    user_id, workspace_id = await _seed(
        sessions, confirmation_minutes=scenario.confirmation_minutes, repeat_minutes=1440
    )

    launch = _launch_timestamp()
    now = [launch]
    adsets = scenario.adsets()
    by_id = {adset.adset_id: adset for adset in adsets}
    fake = FakeMeta(by_id)
    fake.faults = list(scenario.write_faults)
    fake.expire_token_on_first_write = scenario.token_expires_on_first_write
    meta = SimulatedMetaClient(adsets, fake, scenario)
    worker = worker_module.MonitoringWorker(meta_client=meta, clock=lambda: now[0])

    async def no_jitter(_seconds: float) -> None:
        return None

    worker._sleep = no_jitter

    stop_minute: dict[str, int] = {}
    stop_cents: dict[str, float] = {}
    undo_report: dict = {}
    seen_events: set[int] = set()
    minutes = int(scenario.hours * 60)

    async def do_undo(event_id: int, minute: int) -> None:
        posts_before = len(fake.posts)
        fake.faults = list(scenario.undo_write_faults)
        attempts = []
        for attempt in range(3):
            async with sessions() as session:
                try:
                    result = await reverse_audit_event(
                        session, meta_client=meta, event_id=event_id, actor_type="user",
                        actor_id=str(user_id), workspace_id=workspace_id, now=now[0],
                    )
                    attempts.append({"ok": True, "already_reverted": bool(result.get("already_reverted")),
                                     "posts": len(fake.posts) - posts_before})
                except UndoError as error:
                    attempts.append({"ok": False, "error": str(error), "status": error.status_code,
                                     "posts": len(fake.posts) - posts_before})
            posts_before = len(fake.posts)
            if attempts[-1]["ok"] and attempts[-1]["already_reverted"]:
                break
        undo_report.update({"minute": minute, "attempts": attempts})

    pending_undo: Optional[tuple[int, int]] = None
    for minute in range(minutes + 1):
        now[0] = launch + minute * 60
        meta.minute = fake.minute = minute
        if minute:
            for adset in adsets:
                adset.advance()
        await worker.run_cycle()
        async with sessions() as session:
            events = (await session.execute(
                select(AuditEvent).where(AuditEvent.event_type == "STOP", AuditEvent.status == "SUCCESS")
            )).scalars().all()
        for event in events:
            if event.id in seen_events:
                continue
            seen_events.add(event.id)
            adset_id = event.entity_id or event.adset_id
            stop_minute.setdefault(adset_id, minute)
            stop_cents.setdefault(adset_id, by_id[adset_id].spent_cents / 100)
            if scenario.undo and adset_id == scenario.undo[0] and pending_undo is None:
                pending_undo = (event.id, minute + scenario.undo[1])
        if pending_undo and minute == pending_undo[1]:
            await do_undo(pending_undo[0], minute)

    async with sessions() as session:
        audit = (await session.execute(select(AuditEvent).order_by(AuditEvent.id))).scalars().all()
        health = (await session.execute(select(AccountHealth))).scalars().first()
        account = (await session.execute(select(Account))).scalars().one()
    await meta.aclose()
    await engine.dispose()

    rows = []
    for adset in adsets:
        sheet, sheet_rule = adset.cheat_sheet_stop()
        stopped = stop_cents.get(adset.adset_id)
        sheet_minute = None if sheet is None else sheet * 100 / adset.cents_per_minute
        stop_events = [e for e in audit if e.event_type == "STOP" and (e.entity_id or e.adset_id) == adset.adset_id]
        pauses = sum(1 for changed, status in fake.changes if changed == adset.adset_id and status == "PAUSED")
        rows.append({
            "adset": adset.name,
            "adset_id": adset.adset_id,
            "story": adset.story,
            "dollars_per_minute": adset.dollars_per_minute,
            "sheet_stop": sheet,
            "sheet_rule": sheet_rule,
            "buyerly_stop": stopped,
            "buyerly_rule": next((e.rule_name for e in stop_events if e.status == "SUCCESS"), None),
            "spent": adset.spent_cents / 100,
            "no_rules": adset.trajectory(minutes),
            "overshoot": round(stopped - sheet, 2) if sheet is not None and stopped is not None else None,
            "inbox_delay_minutes": (
                round(stop_minute[adset.adset_id] - sheet_minute, 1)
                if sheet_minute is not None and adset.adset_id in stop_minute else None
            ),
            "manual": {
                every: adset.manual_stop(every, spend_lag=scenario.spend_lag,
                                         event_lag=scenario.event_lag, minutes=minutes)
                for every in MANUAL_CHECK_MINUTES
            },
            "stop_success_events": sum(1 for e in stop_events if e.status == "SUCCESS"),
            "stop_error_events": sum(1 for e in stop_events if e.status == "ERROR"),
            "meta_pauses": pauses,
            "final_status": adset.status,
        })
    for row in rows:
        manual_spent = {}
        for every, stop in row["manual"].items():
            manual_spent[every] = stop if stop is not None else row["no_rules"]
        row["manual_spent"] = manual_spent
    counts = {}
    for event in audit:
        key = f"{event.event_type}:{event.status}"
        counts[key] = counts.get(key, 0) + 1
    return {
        "scenario": scenario.name,
        "title": scenario.title,
        "spend_lag": scenario.spend_lag,
        "event_lag": scenario.event_lag,
        "confirmation_minutes": scenario.confirmation_minutes,
        "hours": scenario.hours,
        "rows": rows,
        "events": counts,
        "meta_posts": len(fake.posts),
        "meta_changes": len(fake.changes),
        "backoff_seconds": round(meta.backoff_seconds, 1),
        "account_active": account.is_active,
        "health": None if health is None else health.status,
        "undo": undo_report,
        "summary": summarize(rows),
    }


def summarize(rows: list[dict]) -> dict:
    sheet_stops = [row for row in rows if row["sheet_stop"] is not None]
    buyerly_stops = [row for row in rows if row["buyerly_stop"] is not None]
    delays = sorted(row["inbox_delay_minutes"] for row in rows if row["inbox_delay_minutes"] is not None)
    spent = round(sum(row["spent"] for row in rows), 2)
    sheet = round(sum(row["sheet_stop"] if row["sheet_stop"] is not None else row["no_rules"] for row in rows), 2)
    return {
        "adsets": len(rows),
        "sheet_stops": len(sheet_stops),
        "buyerly_stops": len(buyerly_stops),
        "matched": sum(1 for row in rows if row["sheet_stop"] is not None and row["buyerly_stop"] is not None),
        "same_rule": sum(1 for row in rows if row["buyerly_rule"] and row["buyerly_rule"] == row["sheet_rule"]),
        "missed": sum(1 for row in rows if row["sheet_stop"] is not None and row["buyerly_stop"] is None),
        "extra": sum(1 for row in rows if row["sheet_stop"] is None and row["buyerly_stop"] is not None),
        "early": sum(1 for row in rows if row["overshoot"] is not None and row["overshoot"] < 0),
        "double_writes": sum(max(0, row["meta_pauses"] - 1) for row in rows),
        "delay_median": delays[len(delays) // 2] if delays else None,
        "delay_max": delays[-1] if delays else None,
        "spent": spent,
        "sheet": sheet,
        "no_rules": round(sum(row["no_rules"] for row in rows), 2),
        "over_sheet": round(spent - sheet, 2),
        "manual": {
            every: round(sum(row["manual_spent"][every] for row in rows), 2)
            for every in MANUAL_CHECK_MINUTES
        },
    }


def render(result: dict) -> str:
    money = lambda value: "—" if value is None else f"${value:.2f}"
    lines = [
        f"### {result['scenario']}: {result['title']}",
        f"Meta lag: spend {result['spend_lag']} min, events {result['event_lag']} min; "
        f"stop confirmation {result['confirmation_minutes']} min; {result['hours']:g} h",
        "",
        "| Ad set | $/min | Sheet | Buyerly | Over | Inbox delay | Manual 15/30/60 | Without rules |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in result["rows"]:
        over = "—" if row["overshoot"] is None else f"{row['overshoot']:+.2f}"
        delay = "—" if row["inbox_delay_minutes"] is None else f"{row['inbox_delay_minutes']:.1f} min"
        manual = " / ".join(money(row["manual_spent"][every]) for every in MANUAL_CHECK_MINUTES)
        lines.append(
            f"| {row['adset']} | {row['dollars_per_minute']:.2f} | {money(row['sheet_stop'])} | "
            f"{money(row['buyerly_stop'])} | {over} | {delay} | {manual} | {money(row['no_rules'])} |"
        )
    s = result["summary"]
    lines += [
        "",
        f"Stops: sheet {s['sheet_stops']}, Buyerly {s['buyerly_stops']} (matched {s['matched']}, "
        f"same rule {s['same_rule']}, missed {s['missed']}, extra {s['extra']}, early {s['early']}, "
        f"double writes {s['double_writes']}). Inbox delay median {s['delay_median']} min, max {s['delay_max']} min.",
        f"Spent: Buyerly ${s['spent']:.2f}, sheet ${s['sheet']:.2f}, manual every 15/30/60 min "
        + " / ".join(f"${s['manual'][every]:.2f}" for every in MANUAL_CHECK_MINUTES)
        + f", without rules ${s['no_rules']:.2f}.",
        f"Meta writes {result['meta_posts']}, real changes {result['meta_changes']}, backoff {result['backoff_seconds']} s; "
        f"account active {result['account_active']}, health {result['health']}.",
        f"Audit events: {result['events']}",
    ]
    if result["undo"]:
        lines.append(f"Undo: {result['undo']}")
    return "\n".join(lines)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--scenario", action="append", choices=sorted(SCENARIOS) + ["all"],
                        help="Scenario to run (repeatable); default nl_day.")
    parser.add_argument("--lag-minutes", type=int, help="Override how late Meta reports spend.")
    parser.add_argument("--confirmation-minutes", type=int, help="Override the stop confirmation window.")
    parser.add_argument("--hours", type=float)
    args = parser.parse_args()
    names = args.scenario or ["nl_day"]
    if "all" in names:
        names = list(SCENARIOS)
    for name in names:
        result = await simulate(name, lag_minutes=args.lag_minutes,
                                confirmation_minutes=args.confirmation_minutes, hours=args.hours)
        print(render(result))
        print()


if __name__ == "__main__":
    asyncio.run(main())
