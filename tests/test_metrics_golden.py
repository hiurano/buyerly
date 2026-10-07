"""Golden metrics: a non-zero Meta account through Buyerly's real pipeline (#212).

Nobody could compare Buyerly with live Meta numbers: the test accounts never
spent. This test does the next best thing. A fake Graph API (httpx
MockTransport behind the real MetaClient) answers exactly like the Marketing
API's insights, inventory and account edges: string numbers, `actions` with
synonymous rows, cursor pages, `date_preset` resolved in the ad account's time
zone at the moment each request arrives, `time_range`, and a finished day that
keeps changing for an hour after its midnight (the last minutes of spend and a
lead attributed back to the click).

The real worker syncs it on a simulated clock, including a cycle that crosses
the account's midnight. Then the real API is read and every number a buyer
sees is compared with values computed here, from the ground-truth table and
Meta's definitions, with `Decimal`:

- spend, impressions, clicks, link clicks, landing page views, results (leads)
  and registrations add up over entities and days;
- CTR = clicks / impressions x 100, CPC = spend / clicks, CPM = spend /
  impressions x 1000, cost per result = spend / results, all from the sums of
  the window, never averaged; shown rounded half up to cents;
- no denominator means no value ("—"), not zero;
- days are the ad account's local days (Pacific/Auckland is UTC+13 here,
  Pacific/Honolulu UTC-10), each account on its own calendar;
- daily budgets come from Meta in minor units of the account currency.

Explained differences, not checked: reach over several days (Meta counts
unique people over the window, the fact store keeps daily rows and shows the
largest day), and Ads Manager's own "Last 7 days" preset, which ends
yesterday, while Buyerly's last_7d is today and the six days before it.
"""

import json
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from unittest.mock import patch
from urllib.parse import parse_qs
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routers.analytics as analytics_router_module
import api.routes as api_routes_module
import api.server as api_server_module
import scheduler.worker as worker_module
import services.analytics_store as analytics_store_module
from api.server import create_app
from core.config import settings
from core.metrics import round_half_up
from database.models import Account, AnalyticsEntityFact, User, Workspace, WorkspaceMember
from meta_api.client import MetaClient
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

UTC = timezone.utc
NZ = "act_9120001"
HI = "act_9120002"
ACCOUNTS = {
    NZ: {"name": "Golden NZ", "timezone": "Pacific/Auckland", "currency": "NZD"},
    HI: {"name": "Golden HI", "timezone": "Pacific/Honolulu", "currency": "NZD"},
}
# id, account, name, status, daily budget in minor units (None: ad set budgets)
CAMPAIGNS = [
    ("120330000000000101", NZ, "NZ Leads · Broad", "ACTIVE", "6000"),
    ("120330000000000102", NZ, "NZ Leads · Retargeting", "ACTIVE", None),
    ("120330000000000103", HI, "HI Registrations", "ACTIVE", None),
]
ADSETS = [
    ("120330000000000211", "120330000000000101", "Broad 25-44", "ACTIVE", None),
    ("120330000000000212", "120330000000000101", "Broad 45+", "ACTIVE", None),
    ("120330000000000221", "120330000000000102", "Site visitors 30d", "ACTIVE", "1550"),
    ("120330000000000222", "120330000000000102", "Lookalike 1% (paused)", "PAUSED", "1000"),
    ("120330000000000231", "120330000000000103", "Hawaii 18-65", "ACTIVE", "2000"),
]
ADS = [
    ("120330000000000311", "120330000000000211", "Video A", "ACTIVE"),
    ("120330000000000312", "120330000000000211", "Carousel B", "ACTIVE"),
    ("120330000000000321", "120330000000000212", "Static C", "ACTIVE"),
    ("120330000000000331", "120330000000000221", "Reminder D", "ACTIVE"),
    ("120330000000000332", "120330000000000221", "Offer E (paused Oct 3)", "PAUSED"),
    ("120330000000000341", "120330000000000222", "Never ran", "PAUSED"),
    ("120330000000000351", "120330000000000231", "Signup F", "ACTIVE"),
    ("120330000000000352", "120330000000000231", "Signup G", "ACTIVE"),
]
CAMPAIGN_OF = {adset: campaign for adset, campaign, *_ in ADSETS}
ADSET_OF = {ad: adset for ad, adset, *_ in ADS}
ACCOUNT_OF_CAMPAIGN = {campaign: account for campaign, account, *_ in CAMPAIGNS}


def ad_account(ad_id: str) -> str:
    return ACCOUNT_OF_CAMPAIGN[CAMPAIGN_OF[ADSET_OF[ad_id]]]


DAYS = {
    NZ: [date(2026, 10, day) for day in range(1, 6)],
    HI: [date(2026, 10, day) for day in range(1, 5)],
}
# The ads that delivered on a day; the paused ones ran only on the first two.
DELIVERING = {
    "120330000000000311": None,
    "120330000000000312": None,
    "120330000000000321": None,
    "120330000000000331": None,
    "120330000000000332": {date(2026, 10, 1), date(2026, 10, 2)},
    "120330000000000351": None,
    "120330000000000352": None,
}
METRICS = ("cents", "impressions", "clicks", "link_clicks", "outbound", "lpv", "leads", "regs", "reach")


def ad_day(ad_id: str, day: date, final: bool) -> dict | None:
    """Ground truth for one ad on one account-local day, as Meta reports it."""
    if ad_id not in DELIVERING or day not in DAYS[ad_account(ad_id)]:
        return None
    if DELIVERING[ad_id] is not None and day not in DELIVERING[ad_id]:
        return None
    i = list(DELIVERING).index(ad_id)
    d = day.day
    clicks = 18 + 3 * i + 2 * d
    link = clicks - 4 - i % 3
    row = {
        "cents": 900 + 173 * i + 311 * d + ((i * d) % 7) * 13,
        "impressions": 1200 + 97 * i + 211 * d,
        "clicks": clicks,
        "link_clicks": link,
        "outbound": link - 2,
        "lpv": max(0, link - 5),
        "leads": (i + d) % 4,
        "regs": 1 if (i + 2 * d) % 3 == 0 else 0,
    }
    if ad_id == "120330000000000311" and day == date(2026, 10, 5):
        # CPC 26.75 / 10 = 2.675 sits exactly on half a cent.
        row.update(cents=2675, clicks=10, link_clicks=6, outbound=4, lpv=1)
    if final and ad_id == "120330000000000311" and day == date(2026, 10, 4):
        # Arrives after midnight: the last minutes and a lead credited back.
        row.update(cents=row["cents"] + 37, impressions=row["impressions"] + 40,
                   clicks=row["clicks"] + 1, link_clicks=row["link_clicks"] + 1,
                   leads=row["leads"] + 1)
    if final and ad_id == "120330000000000351" and day == date(2026, 10, 3):
        row.update(cents=row["cents"] + 22, regs=row["regs"] + 1)
    row["reach"] = row["impressions"] * 2 // 3
    return row


def day_is_final(account_id: str, day: date, meta_now: datetime) -> bool:
    """Meta settles a day an hour after the account's midnight that ends it."""
    zone = ZoneInfo(ACCOUNTS[account_id]["timezone"])
    day_end = datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=zone)
    return meta_now >= day_end + timedelta(hours=1)


def entity_ads(level: str, entity_id: str) -> list[str]:
    if level == "ad":
        return [entity_id]
    if level == "adset":
        return [ad for ad, adset, *_ in ADS if adset == entity_id]
    if level == "campaign":
        return [ad for ad, adset, *_ in ADS if CAMPAIGN_OF[adset] == entity_id]
    return [ad for ad, *_ in ADS if ad_account(ad) == entity_id]


def meta_reach(level: str, ad_rows: list[dict]) -> int:
    """Unique reach Meta reports for one entity-day: less than the sum."""
    total = sum(row["reach"] for row in ad_rows)
    return total if level == "ad" else total * 9 // 10 if level != "account" else total * 4 // 5


def sums(level: str, entity_id: str, days: list[date], meta_now: datetime) -> dict | None:
    account_id = entity_id if level == "account" else ad_account(entity_ads(level, entity_id)[0])
    totals = dict.fromkeys(METRICS, 0)
    delivered = False
    for day in days:
        final = day_is_final(account_id, day, meta_now)
        rows = [row for ad in entity_ads(level, entity_id) if (row := ad_day(ad, day, final))]
        if not rows:
            continue
        delivered = True
        for key in METRICS[:-1]:
            totals[key] += sum(row[key] for row in rows)
        totals["reach"] += meta_reach(level, rows)
    return totals if delivered else None


# ---------------------------------------------------------------------------
# Expected values, from Meta's definitions


def q2(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def expected(totals: dict, *, single_day: bool) -> dict:
    spend = Decimal(totals["cents"]) / 100
    impressions = totals["impressions"]

    def per(denominator, numerator=spend, scale=1):
        return None if not denominator else q2(Decimal(numerator) * scale / denominator)

    values = {
        "spend": q2(spend),
        "impressions": impressions,
        "clicks": totals["clicks"],
        "link_clicks": totals["link_clicks"],
        "outbound_clicks": totals["outbound"],
        "landing_page_views": totals["lpv"],
        "leads": totals["leads"],
        "registrations": totals["regs"],
        "ctr": per(impressions, totals["clicks"], 100),
        "ctr_link": per(impressions, totals["link_clicks"], 100),
        "ctr_outbound": per(impressions, totals["outbound"], 100),
        "cpc": per(totals["clicks"]),
        "cpc_link": per(totals["link_clicks"]),
        "cpm": per(impressions, spend, 1000),
        "cost_per_lead": per(totals["leads"]),
        "cost_per_registration": per(totals["regs"]),
        "cost_per_landing_page_view": per(totals["lpv"]),
    }
    if single_day:
        values["reach"] = totals["reach"]
    return values


# ---------------------------------------------------------------------------
# The fake Graph API


class FakeGraphAPI:
    """Answers the Graph API calls Buyerly makes, the way Meta does."""

    PAGE_SIZE = 3

    def __init__(self):
        self.now: datetime = datetime(2026, 10, 1, tzinfo=UTC)
        # Every request takes a second, so one sync can cross midnight.
        self.tick = timedelta(seconds=1)
        self.requests: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        meta_now = self.now
        self.now += self.tick
        params = {key: values[-1] for key, values in parse_qs(request.url.query.decode()).items()}
        parts = request.url.path.strip("/").split("/")[1:]  # drop the version
        self.requests.append({"method": request.method, "parts": parts, "params": params, "at": meta_now})
        if request.method != "GET":
            return httpx.Response(400, json={"error": {"code": 100, "message": "read-only fake"}})
        account_id = parts[0]
        if account_id not in ACCOUNTS:
            return httpx.Response(400, json={"error": {"code": 100, "message": "Unknown object"}})
        if len(parts) == 1:
            info = ACCOUNTS[account_id]
            return httpx.Response(200, json={
                "id": account_id, "name": info["name"], "timezone_name": info["timezone"],
                "currency": info["currency"], "account_status": 1,
            })
        edge = parts[1]
        if edge == "insights":
            rows = self._insights(account_id, params, meta_now)
        else:
            rows = self._inventory(account_id, edge)
        return httpx.Response(200, json=self._page(rows, params, request))

    def _page(self, rows: list[dict], params: dict, request: httpx.Request) -> dict:
        start = int(params.get("after") or 0)
        page = rows[start:start + self.PAGE_SIZE]
        body: dict = {"data": page}
        if start + self.PAGE_SIZE < len(rows):
            after = str(start + self.PAGE_SIZE)
            body["paging"] = {"cursors": {"before": str(start), "after": after},
                              "next": f"{request.url}&after={after}"}
        return body

    @staticmethod
    def _inventory(account_id: str, edge: str) -> list[dict]:
        if edge == "campaigns":
            return [
                {"id": cid, "name": name, "status": status, "effective_status": status,
                 **({"daily_budget": budget} if budget else {})}
                for cid, account, name, status, budget in CAMPAIGNS if account == account_id
            ]
        if edge == "adsets":
            return [
                {"id": sid, "name": name, "campaign_id": cid, "status": status,
                 "effective_status": status, **({"daily_budget": budget} if budget else {})}
                for sid, cid, name, status, budget in ADSETS
                if ACCOUNT_OF_CAMPAIGN[cid] == account_id
            ]
        if edge == "ads":
            return [
                {"id": aid, "name": name, "campaign_id": CAMPAIGN_OF[sid], "adset_id": sid,
                 "status": status, "effective_status": status}
                for aid, sid, name, status in ADS if ad_account(aid) == account_id
            ]
        raise AssertionError(f"unexpected edge {edge}")

    @staticmethod
    def _days(account_id: str, params: dict, meta_now: datetime) -> list[date]:
        if "action_attribution_windows" in params or "use_unified_attribution_setting" in params:
            raise AssertionError("Buyerly must read the account's own attribution setting")
        if "time_range" in params:
            window = json.loads(params["time_range"])
            since, until = date.fromisoformat(window["since"]), date.fromisoformat(window["until"])
            return [since + timedelta(days=n) for n in range((until - since).days + 1)]
        today = meta_now.astimezone(ZoneInfo(ACCOUNTS[account_id]["timezone"])).date()
        preset = params.get("date_preset")
        if preset == "today":
            return [today]
        if preset == "yesterday":
            return [today - timedelta(days=1)]
        raise AssertionError(f"unexpected period {params}")

    def _insights(self, account_id: str, params: dict, meta_now: datetime) -> list[dict]:
        level = params.get("level", "account")
        days = self._days(account_id, params, meta_now)
        if level == "account":
            entities = [account_id]
        elif level == "campaign":
            entities = [cid for cid, account, *_ in CAMPAIGNS if account == account_id]
        elif level == "adset":
            entities = [sid for sid, cid, *_ in ADSETS if ACCOUNT_OF_CAMPAIGN[cid] == account_id]
        else:
            entities = [aid for aid, *_ in ADS if ad_account(aid) == account_id]
        rows = []
        for entity_id in entities:
            totals = sums(level, entity_id, days, meta_now)
            if totals is None:
                continue  # Meta leaves out entities without delivery
            rows.append(self._row(level, entity_id, totals, days))
        return rows

    @staticmethod
    def _row(level: str, entity_id: str, totals: dict, days: list[date]) -> dict:
        spend = Decimal(totals["cents"]) / 100
        impressions = totals["impressions"]
        reach = max(1, totals["reach"])
        actions = [
            ("link_click", totals["link_clicks"]),
            ("landing_page_view", totals["lpv"]),
            ("page_engagement", totals["clicks"] + 7),
            ("post_engagement", totals["clicks"] + 5),
            # The pixel row comes first and duplicates the aggregated one.
            ("offsite_conversion.fb_pixel_lead", totals["leads"]),
            ("lead", totals["leads"]),
            ("onsite_web_lead", totals["leads"]),
            ("offsite_conversion.fb_pixel_complete_registration", totals["regs"]),
            ("complete_registration", totals["regs"]),
        ]
        row = {
            "spend": f"{spend:.2f}",
            "impressions": str(impressions),
            "reach": str(totals["reach"]),
            "frequency": f"{Decimal(impressions) / reach:.6f}",
            "cpm": f"{spend * 1000 / impressions:.6f}",
            "clicks": str(totals["clicks"]),
            "unique_clicks": str(totals["clicks"] - 2),
            "cpc": f"{spend / totals['clicks']:.6f}",
            "ctr": f"{Decimal(totals['clicks']) * 100 / impressions:.6f}",
            "inline_link_clicks": str(totals["link_clicks"]),
            "outbound_clicks": [{"action_type": "outbound_click", "value": str(totals["outbound"])}],
            "actions": [{"action_type": kind, "value": str(value)} for kind, value in actions if value],
            "date_start": days[0].isoformat(),
            "date_stop": days[-1].isoformat(),
        }
        if level == "account":
            row["account_id"] = entity_id[4:]
            return row
        ad = entity_ads(level, entity_id)[0]
        adset = ADSET_OF[ad]
        campaign = CAMPAIGN_OF[adset]
        row["campaign_id"] = campaign
        row["campaign_name"] = next(name for cid, _, name, *_ in CAMPAIGNS if cid == campaign)
        if level in {"adset", "ad"}:
            row["adset_id"] = adset
            row["adset_name"] = next(name for sid, _, name, *_ in ADSETS if sid == adset)
        if level == "ad":
            row["ad_id"] = ad
            row["ad_name"] = next(name for aid, _, name, _ in ADS if aid == ad)
        return row


class _FrozenDatetime(datetime):
    """`datetime.now()` of the analytics store, pinned to the reading moment."""

    frozen: datetime = datetime(2026, 10, 1, tzinfo=UTC)

    @classmethod
    def now(cls, tz=None):
        return cls.frozen.astimezone(tz) if tz else cls.frozen.replace(tzinfo=None)


# ---------------------------------------------------------------------------


class TestGoldenMetrics(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        api_routes_module._summary_cache.clear()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        for module in (api_routes_module, api_auth_module, analytics_router_module,
                       api_server_module, worker_module):
            module.async_session_maker = self.sessions
        settings.ADMIN_CHAT_ID = "8634201356"

        async with self.sessions() as session:
            user = User(telegram_id="71200001", username="golden", full_name="Golden Buyer",
                        role="buyer", is_approved=True)
            session.add(user)
            await session.flush()
            workspace = Workspace(name="Golden", slug="golden", owner_user_id=user.id)
            session.add(workspace)
            await session.flush()
            user.active_workspace_id = workspace.id
            session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
            for account_id, info in ACCOUNTS.items():
                # Created as a fresh import: Meta tells the worker the rest.
                session.add(Account(
                    workspace_id=workspace.id, owner_user_id=user.id, account_id=account_id,
                    name=info["name"], access_token="golden-token", currency="UNKNOWN",
                    timezone_name=info["timezone"], is_active=True, rules_enabled=False,
                ))
            await session.commit()
            self.workspace_id = workspace.id

        self.graph = FakeGraphAPI()
        self.meta = MetaClient()
        self.meta._client = httpx.AsyncClient(transport=httpx.MockTransport(self.graph.handler))
        self.clock = [0.0]
        self.worker = worker_module.MonitoringWorker(meta_client=self.meta, clock=lambda: self.clock[0])
        self.app = create_app()

    async def asyncTearDown(self):
        await self.meta.aclose()
        await self.engine.dispose()

    async def _cycle(self, at: datetime) -> dict:
        self.clock[0] = at.timestamp()
        self.graph.now = at
        _FrozenDatetime.frozen = at
        with patch.object(analytics_store_module, "datetime", _FrozenDatetime):
            stats = await self.worker.run_cycle()
        self.assertEqual(stats["errors"], [], at.isoformat())
        self.assertEqual(stats["accounts_checked"], 2, at.isoformat())
        return stats

    async def _get(self, client, headers, url: str, at: datetime) -> dict:
        api_routes_module._summary_cache.clear()
        _FrozenDatetime.frozen = at
        with patch.object(analytics_store_module, "datetime", _FrozenDatetime):
            response = await client.get(url, headers=headers)
        self.assertEqual(response.status_code, 200, f"{url}: {response.text}")
        return response.json()

    def _assert_metrics(self, actual: dict, want: dict, label: str) -> None:
        for key, value in want.items():
            with self.subTest(label=label, metric=key):
                self.assertEqual(actual.get(key), value, f"{label} {key}")

    async def _stored_spend(self, account_id: str, day: date, level: str) -> dict:
        async with self.sessions() as session:
            rows = (await session.execute(
                select(AnalyticsEntityFact).where(
                    AnalyticsEntityFact.account_id == account_id,
                    AnalyticsEntityFact.entity_level == level,
                    AnalyticsEntityFact.date == day.isoformat(),
                )
            )).scalars().all()
        return {row.entity_id: row.spend for row in rows if row.spend or row.impressions}

    async def test_buyerly_shows_what_meta_reports(self):
        start = datetime(2026, 10, 4, 10, 19, 57, tzinfo=UTC)
        cycles = [start + timedelta(minutes=10 * k) for k in range(13)]
        oct4, oct5 = date(2026, 10, 4), date(2026, 10, 5)

        for k, at in enumerate(cycles):
            await self._cycle(at)
            if k == 4:
                # 23:59:57 in Auckland; Meta's clock passes midnight during the
                # sync. Every Oct 4 row must still be Oct 4's, none of Oct 5's.
                self.assertTrue(any(r["at"] >= datetime(2026, 10, 4, 11, tzinfo=UTC)
                                    for r in self.graph.requests if r["parts"][-1] == "insights"))
                for level in ("account", "campaign", "adset", "ad"):
                    entities = [NZ] if level == "account" else [
                        e for e in {"campaign": [c[0] for c in CAMPAIGNS],
                                    "adset": [s[0] for s in ADSETS],
                                    "ad": [a[0] for a in ADS]}[level]
                        if (level == "ad" and ad_account(e) == NZ)
                        or (level == "adset" and ACCOUNT_OF_CAMPAIGN[CAMPAIGN_OF[e]] == NZ)
                        or (level == "campaign" and ACCOUNT_OF_CAMPAIGN[e] == NZ)
                    ]
                    want = {
                        entity: q2(Decimal(totals["cents"]) / 100)
                        for entity in entities
                        if (totals := sums(level, entity, [oct4], at)) is not None
                    }
                    self.assertEqual(await self._stored_spend(NZ, oct4, level), want, level)
                self.assertEqual(await self._stored_spend(NZ, oct5, "account"), {})
            if k == 5:
                # Just after midnight Meta still shows Oct 4 without its late part.
                stored = await self._stored_spend(NZ, oct4, "account")
                self.assertEqual(stored[NZ], q2(Decimal(sums("account", NZ, [oct4], at)["cents"]) / 100))
                self.assertFalse(day_is_final(NZ, oct4, at))

        # Every hierarchy read asked Meta for explicit account-local days.
        hierarchy_reads = [
            r for r in self.graph.requests
            if r["parts"][-1] == "insights" and r["params"].get("level") in {"account", "campaign", "ad"}
        ]
        self.assertTrue(hierarchy_reads)
        self.assertTrue(all("time_range" in r["params"] for r in hierarchy_reads))
        self.assertFalse([r for r in self.graph.requests if r["method"] != "GET"])

        # Per-day buckets: each account's facts sit on its own local dates and
        # equal what Meta reports for that day now.
        reading = datetime(2026, 10, 4, 12, 20, tzinfo=UTC)
        self.assertEqual(reading.astimezone(ZoneInfo("Pacific/Auckland")).date(), oct5)
        self.assertEqual(reading.astimezone(ZoneInfo("Pacific/Honolulu")).date(), oct4)
        async with self.sessions() as session:
            account_facts = (await session.execute(
                select(AnalyticsEntityFact).where(AnalyticsEntityFact.entity_level == "account")
            )).scalars().all()
        for account_id in ACCOUNTS:
            stored = {f.date: f for f in account_facts if f.account_id == account_id and f.impressions}
            self.assertEqual(sorted(stored), [d.isoformat() for d in DAYS[account_id]], account_id)
            for day in DAYS[account_id]:
                totals = sums("account", account_id, [day], reading)
                fact = stored[day.isoformat()]
                with self.subTest(bucket=f"{account_id} {day}"):
                    self.assertEqual(fact.spend, q2(Decimal(totals["cents"]) / 100))
                    self.assertEqual(fact.impressions, totals["impressions"])
                    self.assertEqual(fact.leads, totals["leads"])
                    self.assertEqual(fact.registrations, totals["regs"])
                    self.assertEqual(fact.currency, "NZD")

        def window(account_id: str, period: str) -> list[date]:
            today = reading.astimezone(ZoneInfo(ACCOUNTS[account_id]["timezone"])).date()
            length = {"today": 1, "yesterday": 1, "last_3d": 3, "last_7d": 7}[period]
            last = today - timedelta(days=1) if period == "yesterday" else today
            return [last - timedelta(days=n) for n in range(length)][::-1]

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await session_headers(
                self.sessions, {"id": 71200001, "first_name": "Golden", "username": "golden"}
            )
            for period in ("today", "yesterday", "last_3d", "last_7d"):
                single = period in {"today", "yesterday"}
                summary = await self._get(client, headers, f"/api/summary?period={period}", reading)
                self.assertEqual(summary["source"], "PostgreSQL Fact Store")
                rows = {row["account_id"]: row for row in summary["accounts"]}
                workspace = dict.fromkeys(METRICS, 0)
                for account_id in ACCOUNTS:
                    totals = sums("account", account_id, window(account_id, period), reading)
                    for key in METRICS:
                        workspace[key] += totals[key]
                    want = expected(totals, single_day=single)
                    want.pop("outbound_clicks")
                    if single:
                        want["frequency"] = q2(Decimal(totals["impressions"]) / totals["reach"])
                    else:
                        want.pop("reach", None)
                    self._assert_metrics(rows[account_id], want, f"summary {period} {account_id}")
                    self.assertEqual(rows[account_id]["currency"], "NZD")

                # Workspace totals: each account on its own calendar, ratios
                # from the summed numbers.
                ws = expected(workspace, single_day=False)
                self.assertEqual(summary["display_currency"], "NZD")
                self._assert_metrics(summary, {
                    "total_spend": ws["spend"],
                    "total_impressions": ws["impressions"],
                    "total_clicks": ws["clicks"],
                    "total_link_clicks": ws["link_clicks"],
                    "total_landing_page_views": ws["landing_page_views"],
                    "total_leads": ws["leads"],
                    "total_regs": ws["registrations"],
                    "avg_ctr": ws["ctr"],
                    "avg_ctr_link": ws["ctr_link"],
                    "avg_cpc": ws["cpc"],
                    "avg_cpc_link": ws["cpc_link"],
                    "avg_cpm": ws["cpm"],
                    "cost_per_lead": ws["cost_per_lead"],
                    "cost_per_registration": ws["cost_per_registration"],
                    "cost_per_landing_page_view": ws["cost_per_landing_page_view"],
                }, f"workspace {period}")

                # Ads Manager: every level, account-wide, with the previous window.
                for account_id in ACCOUNTS:
                    days = window(account_id, period)
                    previous_days = (
                        [] if period == "today"
                        else [days[0] - timedelta(days=n) for n in range(len(days), 0, -1)]
                    )
                    for level, entities in (
                        ("campaign", [c[0] for c in CAMPAIGNS]),
                        ("adset", [s[0] for s in ADSETS]),
                        ("ad", [a[0] for a in ADS]),
                    ):
                        compare = "previous" if previous_days else "none"
                        data = await self._get(
                            client, headers,
                            f"/api/analytics/hierarchy?parent_id={account_id}&level={level}"
                            f"&period={period}&compare={compare}",
                            reading,
                        )
                        items = {item["entity_id"]: item for item in data["items"]}
                        delivered = {
                            entity: totals for entity in entities
                            if (totals := sums(level, entity, days, reading)) is not None
                            and (entity == account_id or ad_account(entity_ads(level, entity)[0]) == account_id)
                        }
                        self.assertTrue(delivered, f"{account_id} {level} {period}")
                        for entity, totals in delivered.items():
                            label = f"{period} {level} {entity}"
                            self.assertIn(entity, items, label)
                            self._assert_metrics(items[entity], expected(totals, single_day=single), label)
                            self.assertEqual(items[entity]["currency"], "NZD", label)
                            if previous_days:
                                before = sums(level, entity, previous_days, reading)
                                previous = items[entity]["previous"]
                                if before is None:
                                    # Absent, or a synced row without delivery.
                                    self.assertTrue(
                                        previous is None
                                        or (previous["spend"], previous["impressions"]) == (0.0, 0),
                                        label,
                                    )
                                else:
                                    self._assert_metrics(
                                        items[entity]["previous"],
                                        expected(before, single_day=len(previous_days) == 1),
                                        f"{label} previous",
                                    )
                        # Rows without delivery in the window are zeros with no
                        # ratios, never a 0.00 that reads as a measurement.
                        for entity, item in items.items():
                            if entity in delivered:
                                continue
                            self.assertEqual((item["spend"], item["impressions"]), (0.0, 0), entity)
                            for ratio in ("ctr", "cpc", "cpm", "cpc_link", "ctr_link", "cost_per_lead"):
                                self.assertIsNone(item[ratio], f"{period} {entity} {ratio}")

                # Drill-down reads the same numbers under each parent.
                for campaign, _, _, _, _ in CAMPAIGNS:
                    account_id = ACCOUNT_OF_CAMPAIGN[campaign]
                    days = window(account_id, period)
                    data = await self._get(
                        client, headers,
                        f"/api/analytics/hierarchy?parent_id={campaign}&level=adset&period={period}",
                        reading,
                    )
                    for item in data["items"]:
                        totals = sums("adset", item["entity_id"], days, reading)
                        if totals is not None:
                            self._assert_metrics(item, expected(totals, single_day=single),
                                                 f"drill {period} {campaign} > {item['entity_id']}")
                            self.assertEqual(CAMPAIGN_OF[item["entity_id"]], campaign)

            # Budgets come from Meta in minor units, statuses as Meta has them.
            data = await self._get(
                client, headers, f"/api/analytics/hierarchy?parent_id={NZ}&level=adset&period=today", reading
            )
            items = {item["entity_id"]: item for item in data["items"]}
            self.assertEqual(items["120330000000000221"]["daily_budget"], 15.5)
            self.assertEqual(items["120330000000000222"]["daily_budget"], 10.0)
            self.assertEqual(items["120330000000000222"]["status"], "PAUSED")
            campaigns = await self._get(
                client, headers, f"/api/analytics/hierarchy?parent_id={NZ}&level=campaign&period=today", reading
            )
            budget = {item["entity_id"]: item["daily_budget"] for item in campaigns["items"]}
            self.assertEqual(budget["120330000000000101"], 60.0)

            # The half cent: 26.75 NZD over 10 clicks is 2.68, as Ads Manager shows.
            ads = await self._get(
                client, headers, f"/api/analytics/hierarchy?parent_id={NZ}&level=ad&period=today", reading
            )
            video = next(item for item in ads["items"] if item["entity_id"] == "120330000000000311")
            self.assertEqual((video["spend"], video["clicks"], video["cpc"]), (26.75, 10, 2.68))


class TestHalfUpRounding(unittest.TestCase):
    def test_a_half_cent_rounds_up(self):
        self.assertEqual(round(26.75 / 10, 2), 2.67)  # why the helper exists
        self.assertEqual(round_half_up(26.75 / 10), 2.68)
        self.assertEqual(round_half_up(1.005), 1.01)
        self.assertEqual(round_half_up(0.1 + 0.2), 0.3)
        self.assertEqual(round_half_up(2.674999), 2.67)
        self.assertEqual(round_half_up(-2.675), -2.68)
        self.assertEqual(round_half_up(12.5, 0), 13.0)


if __name__ == "__main__":
    unittest.main()
