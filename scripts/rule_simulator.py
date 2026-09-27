"""Replay a simulated ad account day through the real worker and rule engine.

The account is invented: every ad set spends at its own pace and earns clicks,
leads and registrations at fixed spend points. The worker, the rule engine, the
stop confirmation and the audit trail are Buyerly's own, running against the
disposable test database, so the report shows how late Buyerly acts compared
with a buyer who follows the same rules to the cent.

The default rules are a Netherlands lead-gen buyer's cheat sheet:

- $3.00 and no click: dead;
- $3.50 and one click: dead;
- $4.00 and no lead: dead;
- $7.00, no registration and fewer than two leads: hard stop;
- $12.00: the ceiling, whatever happened.

Run it against the local disposable database only (the same guard as tests):

    TEST_DATABASE_URL=postgresql+asyncpg://buyerly:...@localhost:5432/buyerly_test \\
    TEST_DATABASE_DISPOSABLE=buyerly_test DATABASE_URL=$TEST_DATABASE_URL \\
    python -m scripts.rule_simulator --lag-minutes 5 --confirmation-minutes 10
"""

import argparse
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from database.models import Account, AppSettings, AuditEvent, User, Workspace, WorkspaceMember
from meta_api.client import MetaClient
from tests.test_db_helper import create_test_engine, init_test_db

TIMEZONE = "Europe/Amsterdam"
ACCOUNT_ID = "act_simulated_nl"

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


@dataclass
class SimulatedAdSet:
    """One ad set: spend per minute and the spend at which each event lands."""

    adset_id: str
    name: str
    story: str
    dollars_per_minute: float
    daily_budget: float
    clicks_at: list[float] = field(default_factory=list)
    leads_at: list[float] = field(default_factory=list)
    registrations_at: list[float] = field(default_factory=list)
    status: str = "ACTIVE"
    stopped_spend: Optional[float] = None

    def spend_after(self, minutes: float) -> float:
        return round(min(self.daily_budget, max(0.0, minutes) * self.dollars_per_minute), 2)

    def counts_at(self, spend: float) -> dict:
        return {
            "clicks": sum(1 for point in self.clicks_at if point <= spend),
            "leads": sum(1 for point in self.leads_at if point <= spend),
            "registrations": sum(1 for point in self.registrations_at if point <= spend),
        }

    def cheat_sheet_stop(self) -> Optional[float]:
        """The first cent at which the buyer following the sheet turns it off."""
        cents = int(round(self.daily_budget * 100))
        for cent in range(cents + 1):
            spend = cent / 100
            metrics = {"spend": spend, **self.counts_at(spend)}
            for _, conditions in CHEAT_SHEET_RULES:
                if all(OPERATORS[op](metrics[metric], value) for metric, op, value in conditions):
                    return spend
        return None


def netherlands_day() -> list[SimulatedAdSet]:
    """A launch of lead-gen ad sets with the behaviours the sheet is written for."""
    return [
        SimulatedAdSet("nl_dead_fast", "NL · dead creative, fast", "never gets a click, spends fast",
                       0.10, 30.0),
        SimulatedAdSet("nl_dead_slow", "NL · dead creative, slow", "never gets a click, spends slowly",
                       0.02, 30.0),
        SimulatedAdSet("nl_one_click", "NL · one click", "a single click at $1.20, nothing else",
                       0.05, 30.0, clicks_at=[1.2]),
        SimulatedAdSet("nl_clicks_no_lead", "NL · clicks, no lead", "clicks but never a lead",
                       0.05, 30.0, clicks_at=[0.6, 1.4, 2.1, 2.9, 3.8, 5.0]),
        SimulatedAdSet("nl_late_lead", "NL · lead at $4.40", "the lead lands just after the $4 cut",
                       0.05, 30.0, clicks_at=[0.5, 1.5, 2.5, 3.3], leads_at=[4.4], registrations_at=[6.1]),
        SimulatedAdSet("nl_lead_no_reg", "NL · one lead, no registration", "a lead at $2.60, no registration",
                       0.06, 30.0, clicks_at=[0.7, 1.6, 2.2], leads_at=[2.6]),
        SimulatedAdSet("nl_two_leads", "NL · two leads, no registration", "two leads, so it runs to the ceiling",
                       0.06, 30.0, clicks_at=[0.5, 1.2, 2.0, 3.1], leads_at=[2.4, 5.8]),
        SimulatedAdSet("nl_winner", "NL · converts", "leads and a registration early",
                       0.08, 30.0, clicks_at=[0.3, 0.9, 1.5, 2.2], leads_at=[1.9, 3.7, 6.5], registrations_at=[4.2]),
    ]


class SimulatedMetaClient(MetaClient):
    """Serves the simulated account and records the worker's writes."""

    def __init__(self, adsets: list[SimulatedAdSet], clock, launch_ts: float, lag_minutes: float):
        super().__init__()
        self.adsets = {adset.adset_id: adset for adset in adsets}
        self.clock = clock
        self.launch_ts = launch_ts
        self.lag_minutes = lag_minutes

    def _spend(self, adset: SimulatedAdSet, *, reported: bool) -> float:
        if adset.stopped_spend is not None:
            return adset.stopped_spend
        minutes = (self.clock() - self.launch_ts) / 60
        if reported:
            minutes -= self.lag_minutes
        return adset.spend_after(minutes)

    def _row(self, adset: SimulatedAdSet) -> dict:
        spend = self._spend(adset, reported=True)
        counts = adset.counts_at(spend)
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
        return {"id": account_id, "name": "Simulated NL", "timezone_name": TIMEZONE,
                "currency": "USD", "account_status": 1, "status_label": "Active (ACTIVE)"}

    async def get_adsets_insights(self, account_id, access_token, date_preset="today",
                                  currency="UNKNOWN", priority="normal"):
        if date_preset != "today":
            return []
        return [self._row(adset) for adset in self.adsets.values()]

    async def get_hierarchical_insights(self, *args, **kwargs):
        return []

    async def get_ads_insights(self, *args, **kwargs):
        return []

    async def get_campaigns_inventory(self, account_id, access_token, priority="normal"):
        return [{"campaign_id": "nl_campaign", "campaign_name": "NL leads",
                 "status": "ACTIVE", "effective_status": "ACTIVE"}]

    async def set_adset_status(self, adset_id, access_token, status, *args, **kwargs):
        adset = self.adsets[adset_id]
        if status == "PAUSED" and adset.status == "ACTIVE":
            # Meta stops delivery now; the ad set keeps what it really spent.
            adset.stopped_spend = self._spend(adset, reported=False)
        adset.status = status
        return True

    async def set_campaign_status(self, *args, **kwargs):
        return True

    async def set_ad_status(self, *args, **kwargs):
        return True

    async def update_adset_budget(self, *args, **kwargs):
        return True


async def _seed(sessions, *, confirmation_minutes: int, repeat_minutes: int) -> None:
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


async def simulate(*, lag_minutes: float, confirmation_minutes: int, hours: float = 10.0) -> dict:
    import scheduler.worker as worker_module

    engine = create_test_engine()
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await init_test_db(engine)
    worker_module.async_session_maker = sessions
    await _seed(sessions, confirmation_minutes=confirmation_minutes, repeat_minutes=1440)

    launch = datetime(2026, 10, 5, 9, 0, tzinfo=ZoneInfo(TIMEZONE)).timestamp()
    now = [launch]
    adsets = netherlands_day()
    meta = SimulatedMetaClient(adsets, lambda: now[0], launch, lag_minutes)
    worker = worker_module.MonitoringWorker(meta_client=meta, clock=lambda: now[0])

    for minute in range(int(hours * 60) + 1):
        now[0] = launch + minute * 60
        await worker.run_cycle()

    async with sessions() as session:
        events = (await session.execute(
            select(AuditEvent.event_type).where(AuditEvent.event_type.in_(
                ("STOP", "STOP_CONFIRMATION_STARTED", "RULE_ACTION_COOLDOWN")))
        )).scalars().all()
    await engine.dispose()

    rows = []
    for adset in adsets:
        sheet = adset.cheat_sheet_stop()
        actual = adset.stopped_spend if adset.stopped_spend is not None else adset.spend_after(hours * 60)
        rows.append({
            "adset": adset.name,
            "story": adset.story,
            "dollars_per_minute": adset.dollars_per_minute,
            "sheet_stop": sheet,
            "buyerly_stop": adset.stopped_spend,
            "spent": actual,
            "no_rules": adset.spend_after(hours * 60),
            "overshoot": round(actual - sheet, 2) if sheet is not None and adset.stopped_spend is not None else None,
        })
    return {
        "lag_minutes": lag_minutes,
        "confirmation_minutes": confirmation_minutes,
        "rows": rows,
        "events": {kind: events.count(kind) for kind in sorted(set(events))},
    }


def render(result: dict) -> str:
    lines = [
        f"### Meta reporting lag {result['lag_minutes']:g} min, stop confirmation {result['confirmation_minutes']} min",
        "",
        "| Ad set | $/min | Sheet stops at | Buyerly stopped at | Over the sheet | Spent | Without rules |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    money = lambda value: "—" if value is None else f"${value:.2f}"
    for row in result["rows"]:
        over = "—" if row["overshoot"] is None else f"+${row['overshoot']:.2f}"
        lines.append(
            f"| {row['adset']} | {row['dollars_per_minute']:.2f} | {money(row['sheet_stop'])} | "
            f"{money(row['buyerly_stop'])} | {over} | {money(row['spent'])} | {money(row['no_rules'])} |"
        )
    spent = sum(row["spent"] for row in result["rows"])
    sheet = sum(row["sheet_stop"] if row["sheet_stop"] is not None else row["no_rules"] for row in result["rows"])
    without = sum(row["no_rules"] for row in result["rows"])
    over = sum(row["overshoot"] or 0 for row in result["rows"])
    lines += [
        "",
        f"Spent with Buyerly ${spent:.2f}, following the sheet to the cent ${sheet:.2f}, "
        f"without rules ${without:.2f}. Saved ${without - spent:.2f}; ${over:.2f} over the sheet.",
        f"Audit events: {result['events']}",
    ]
    return "\n".join(lines)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lag-minutes", type=float, action="append",
                        help="How late Meta reports spend and events (repeatable). Default 5.")
    parser.add_argument("--confirmation-minutes", type=int, action="append",
                        help="Worker stop confirmation window (repeatable). Default 10.")
    parser.add_argument("--hours", type=float, default=10.0)
    args = parser.parse_args()
    for lag in args.lag_minutes or [5.0]:
        for confirmation in args.confirmation_minutes or [10]:
            result = await simulate(lag_minutes=lag, confirmation_minutes=confirmation, hours=args.hours)
            print(render(result))
            print()


if __name__ == "__main__":
    asyncio.run(main())
