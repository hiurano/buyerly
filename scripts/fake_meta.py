"""A fake Meta Graph API for local development and branch previews.

`compose.dev.yaml` runs it as the `fake-meta` service and points Buyerly's
MetaClient at it (META_GRAPH_BASE_URL), so a local stack has ad accounts,
campaigns, ad sets and ads with numbers, and rules can stop, start and
rebudget them, all without Meta or a real token.

It answers the calls MetaClient makes, the way the Marketing API does:

- GET  /<version>/act_<id>                      ad account info
- GET  /<version>/act_<id>/campaigns|adsets|ads inventory, cursor pages
- GET  /<version>/act_<id>/insights             level=account|campaign|adset|ad,
                                                date_preset or time_range
- GET  /<version>/<entity id>                   live state of one entity
- POST /<version>/<entity id>                   status=PAUSED|ACTIVE or
                                                daily_budget=<minor units>

The world is invented and fixed (`build_world`); every ad has its own CPM,
CTR and conversion rates. Each day an ad spends its share of the budget,
spread evenly over the ad account's local day, so today's numbers grow
while you watch and a finished day stays the same. Spend only accrues while
the ad, its ad set and its campaign are all ACTIVE, at the budget in force at
the time: a rule that pauses an ad set at 14:00 freezes its spend there.
Counts are whole numbers derived from spend, so they only ever grow during a
day, and a campaign's numbers are the sums of its ads.

Status and budget changes are kept with their time in a JSON file
(FAKE_META_STATE, default /data/fake-meta.json), so they survive a restart.
Any access token is accepted.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import random
import threading
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

PAGE_SIZE = 25
STATE_PATH = Path(os.environ.get("FAKE_META_STATE", "/data/fake-meta.json"))
DAY_SECONDS = 24 * 60 * 60
# How long the world has been delivering, which is what date_preset=maximum covers.
LIFETIME_DAYS = 30


# ---------------------------------------------------------------------------
# The world


@dataclass
class Ad:
    id: str
    name: str
    adset_id: str
    status: str
    # Share of the ad set's budget this ad spends on a full day.
    share: float
    cpm: float
    ctr: float
    link_ratio: float
    lpv_ratio: float
    lead_rate: float
    registration_rate: float
    purchase_rate: float
    frequency: float


@dataclass
class AdSet:
    id: str
    name: str
    campaign_id: str
    status: str
    # Minor units of the account currency; None when the campaign holds it.
    daily_budget: Optional[int]
    # Share of the campaign budget (campaign budget optimization only).
    share: float = 1.0
    ads: list[str] = field(default_factory=list)


@dataclass
class Campaign:
    id: str
    name: str
    account_id: str
    status: str
    daily_budget: Optional[int]
    adsets: list[str] = field(default_factory=list)


@dataclass
class Account:
    id: str
    name: str
    currency: str
    timezone: str
    campaigns: list[str] = field(default_factory=list)


@dataclass
class World:
    accounts: dict[str, Account] = field(default_factory=dict)
    campaigns: dict[str, Campaign] = field(default_factory=dict)
    adsets: dict[str, AdSet] = field(default_factory=dict)
    ads: dict[str, Ad] = field(default_factory=dict)

    def account_of(self, entity_id: str) -> Optional[str]:
        if entity_id in self.ads:
            entity_id = self.ads[entity_id].adset_id
        if entity_id in self.adsets:
            entity_id = self.adsets[entity_id].campaign_id
        if entity_id in self.campaigns:
            return self.campaigns[entity_id].account_id
        return None


# (account id, name, currency, time zone, goal, campaigns)
# goal decides which conversions the ads bring: leads, registrations or purchases.
# Each campaign: (name, status, CBO budget or None, ad sets)
# Each ad set: (name, status, budget or None, quality, ads)
# quality scales CTR and conversion rates: 1.0 is a normal ad set.
WORLD_SPEC = [
    ("act_1000000000000001", "NL · Lead gen", "EUR", "Europe/Amsterdam", "leads", [
        ("NL | Leads | Broad", "ACTIVE", None, [
            ("Broad 25-54", "ACTIVE", 15000, 1.0, ["Video · Testimonial", "Static · Offer"]),
            ("Broad 35-65+", "ACTIVE", 12000, 0.8, ["Video · Testimonial", "Carousel · Steps"]),
            ("Broad · Women", "PAUSED", 8000, 1.1, ["Static · Offer"]),
        ]),
        ("NL | Leads | Interests", "ACTIVE", 30000, [
            ("Finance interests", "ACTIVE", None, 1.2, ["Video · Explainer", "Static · Calculator"]),
            ("Lookalike 1%", "ACTIVE", None, 0.6, ["Video · Explainer", "Static · Calculator"]),
        ]),
        ("NL | Leads | Retargeting", "PAUSED", None, [
            ("Site visitors 30d", "ACTIVE", 5000, 1.5, ["Static · Reminder"]),
        ]),
    ]),
    ("act_1000000000000002", "US · Sweepstakes", "USD", "America/New_York", "registrations", [
        ("US | Reg | Broad", "ACTIVE", None, [
            ("Broad 18-65+", "ACTIVE", 20000, 1.0, ["UGC · Unboxing", "Static · Prize", "Video · Spin"]),
            ("Broad · Mobile", "ACTIVE", 10000, 0.4, ["UGC · Unboxing", "Static · Prize"]),
        ]),
        ("US | Reg | Lookalike", "ACTIVE", None, [
            ("LAL 2% registrations", "ACTIVE", 15000, 1.3, ["Video · Spin", "Static · Prize"]),
        ]),
    ]),
    ("act_1000000000000003", "DE · E-commerce", "EUR", "Europe/Berlin", "purchases", [
        ("DE | Sales | Advantage+", "ACTIVE", 40000, [
            ("Advantage+ audience", "ACTIVE", None, 1.0, ["Carousel · Bestsellers", "Video · Product", "Static · Sale"]),
        ]),
        ("DE | Sales | Catalog", "ACTIVE", None, [
            ("Catalog · Viewed 14d", "ACTIVE", 12000, 1.4, ["Dynamic · Catalog"]),
            ("Catalog · Broad", "PAUSED", 9000, 0.7, ["Dynamic · Catalog"]),
        ]),
    ]),
]

GOAL_RATES = {
    # (lead rate, registration rate, purchase rate) per landing page view
    "leads": (0.09, 0.012, 0.0),
    "registrations": (0.03, 0.11, 0.004),
    "purchases": (0.0, 0.025, 0.035),
}


def build_world() -> World:
    world = World()
    rng = random.Random(20261011)
    counter = 0

    def next_id(prefix: str) -> str:
        nonlocal counter
        counter += 1
        return f"{prefix}{counter:06d}"

    for account_id, account_name, currency, tz, goal, campaigns in WORLD_SPEC:
        account = Account(account_id, account_name, currency, tz)
        world.accounts[account_id] = account
        lead_rate, reg_rate, purchase_rate = GOAL_RATES[goal]
        for campaign_name, campaign_status, campaign_budget, adsets in campaigns:
            campaign = Campaign(next_id("1202000000"), campaign_name, account_id, campaign_status, campaign_budget)
            world.campaigns[campaign.id] = campaign
            account.campaigns.append(campaign.id)
            for adset_name, adset_status, adset_budget, quality, ad_names in adsets:
                adset = AdSet(
                    next_id("1202100000"),
                    adset_name,
                    campaign.id,
                    adset_status,
                    adset_budget,
                    share=1.0 / len(adsets),
                )
                world.adsets[adset.id] = adset
                campaign.adsets.append(adset.id)
                weights = [rng.uniform(0.5, 1.5) for _ in ad_names]
                for ad_name, weight in zip(ad_names, weights):
                    ad = Ad(
                        id=next_id("1202200000"),
                        name=ad_name,
                        adset_id=adset.id,
                        status="ACTIVE" if rng.random() > 0.12 else "PAUSED",
                        share=weight / sum(weights) * rng.uniform(0.75, 1.0),
                        cpm=rng.uniform(6.0, 22.0),
                        ctr=rng.uniform(0.006, 0.028) * quality,
                        link_ratio=rng.uniform(0.55, 0.85),
                        lpv_ratio=rng.uniform(0.6, 0.9),
                        lead_rate=lead_rate * quality * rng.uniform(0.6, 1.4),
                        registration_rate=reg_rate * quality * rng.uniform(0.6, 1.4),
                        purchase_rate=purchase_rate * quality * rng.uniform(0.6, 1.4),
                        frequency=rng.uniform(1.1, 1.8),
                    )
                    world.ads[ad.id] = ad
                    adset.ads.append(ad.id)
    return world


WORLD = build_world()


# ---------------------------------------------------------------------------
# Changes made through the API, with their time


class History:
    """Status and budget changes per entity, oldest first, persisted to disk."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        # entity id -> [(unix time, field, value)]
        self.events: dict[str, list[tuple[float, str, object]]] = {}
        if path.exists():
            try:
                raw = json.loads(path.read_text())
                self.events = {key: [tuple(e) for e in value] for key, value in raw.items()}
            except (OSError, ValueError):
                self.events = {}

    def record(self, entity_id: str, field_name: str, value: object, at: float) -> None:
        with self.lock:
            self.events.setdefault(entity_id, []).append((at, field_name, value))
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                self.path.write_text(json.dumps(self.events))
            except OSError:
                pass

    def value_at(self, entity_id: str, field_name: str, initial: object, at: float) -> object:
        value = initial
        for when, name, new_value in self.events.get(entity_id, []):
            if when > at:
                break
            if name == field_name:
                value = new_value
        return value

    def change_times(self, entity_ids: list[str], start: float, end: float) -> list[float]:
        return sorted(
            when
            for entity_id in entity_ids
            for when, _name, _value in self.events.get(entity_id, [])
            if start < when < end
        )


HISTORY = History(STATE_PATH)


def status_at(entity_id: str, at: float) -> str:
    entity = WORLD.campaigns.get(entity_id) or WORLD.adsets.get(entity_id) or WORLD.ads.get(entity_id)
    return str(HISTORY.value_at(entity_id, "status", entity.status, at))


def budget_at(entity_id: str, at: float) -> Optional[int]:
    entity = WORLD.campaigns.get(entity_id) or WORLD.adsets.get(entity_id)
    if entity is None or entity.daily_budget is None:
        return None
    return int(HISTORY.value_at(entity_id, "daily_budget", entity.daily_budget, at))


# ---------------------------------------------------------------------------
# Metrics


def day_factor(ad_id: str, day: date) -> float:
    """The same ad has better and worse days; fixed for each date."""
    digest = hashlib.sha256(f"{ad_id}:{day.isoformat()}".encode()).digest()
    return 0.7 + 0.6 * (digest[0] / 255)


def ad_full_day_rate(ad: Ad, at: float) -> float:
    """Spend per second (major units) the ad runs at when everything is on."""
    adset = WORLD.adsets[ad.adset_id]
    campaign = WORLD.campaigns[adset.campaign_id]
    if adset.daily_budget is not None:
        budget = budget_at(adset.id, at) or 0
        adset_daily = budget / 100
    else:
        budget = budget_at(campaign.id, at) or 0
        adset_daily = budget / 100 * adset.share
    return adset_daily * ad.share / DAY_SECONDS


def ad_spend(ad: Ad, day: date, now: float) -> float:
    """What the ad spent on its account's local `day`, up to `now`."""
    adset = WORLD.adsets[ad.adset_id]
    campaign = WORLD.campaigns[adset.campaign_id]
    tz = ZoneInfo(WORLD.accounts[campaign.account_id].timezone)
    start = datetime.combine(day, time.min, tz).timestamp()
    end = min(datetime.combine(day + timedelta(days=1), time.min, tz).timestamp(), now)
    if end <= start:
        return 0.0
    chain = [ad.id, adset.id, campaign.id]
    cuts = [start, *HISTORY.change_times(chain, start, end), end]
    spent = 0.0
    for left, right in zip(cuts, cuts[1:]):
        middle = (left + right) / 2
        if all(status_at(entity_id, middle) == "ACTIVE" for entity_id in chain):
            spent += ad_full_day_rate(ad, middle) * (right - left)
    return spent * day_factor(ad.id, day)


def ad_metrics(ad: Ad, day: date, now: float) -> dict:
    spend = round(ad_spend(ad, day, now), 2)
    impressions = math.floor(spend / ad.cpm * 1000)
    clicks = math.floor(impressions * ad.ctr)
    link_clicks = math.floor(clicks * ad.link_ratio)
    landing_page_views = math.floor(link_clicks * ad.lpv_ratio)
    return {
        "spend": spend,
        "impressions": impressions,
        "reach": math.floor(impressions / ad.frequency),
        "clicks": clicks,
        "unique_clicks": math.floor(clicks * 0.92),
        "link_clicks": link_clicks,
        "outbound_clicks": math.floor(link_clicks * 0.95),
        "landing_page_views": landing_page_views,
        "leads": math.floor(landing_page_views * ad.lead_rate),
        "registrations": math.floor(landing_page_views * ad.registration_rate),
        "purchases": math.floor(landing_page_views * ad.purchase_rate),
    }


SUMMED = (
    "spend", "impressions", "reach", "clicks", "unique_clicks", "link_clicks",
    "outbound_clicks", "landing_page_views", "leads", "registrations", "purchases",
)


def total(ad_ids: list[str], days: list[date], now: float) -> dict:
    sums = dict.fromkeys(SUMMED, 0)
    for ad_id in ad_ids:
        for day in days:
            for key, value in ad_metrics(WORLD.ads[ad_id], day, now).items():
                sums[key] += value
    sums["spend"] = round(sums["spend"], 2)
    return sums


def insight_row(sums: dict) -> dict:
    """Metrics the way the Marketing API writes them: strings, actions lists."""
    spend, impressions, clicks = sums["spend"], sums["impressions"], sums["clicks"]
    actions = [
        ("link_click", sums["link_clicks"]),
        ("landing_page_view", sums["landing_page_views"]),
        ("lead", sums["leads"]),
        ("complete_registration", sums["registrations"]),
        ("purchase", sums["purchases"]),
    ]
    row = {
        "spend": f"{spend:.2f}",
        "impressions": str(impressions),
        "reach": str(sums["reach"]),
        "frequency": f"{impressions / sums['reach']:.6f}" if sums["reach"] else "0",
        "cpm": f"{spend / impressions * 1000:.6f}" if impressions else "0",
        "clicks": str(clicks),
        "unique_clicks": str(sums["unique_clicks"]),
        "inline_link_clicks": str(sums["link_clicks"]),
        "cpc": f"{spend / clicks:.6f}" if clicks else "0",
        "ctr": f"{clicks / impressions * 100:.6f}" if impressions else "0",
        "actions": [{"action_type": name, "value": str(value)} for name, value in actions if value],
        "cost_per_action_type": [
            {"action_type": name, "value": f"{spend / value:.6f}"} for name, value in actions if value
        ],
    }
    if sums["outbound_clicks"]:
        row["outbound_clicks"] = [{"action_type": "outbound_click", "value": str(sums["outbound_clicks"])}]
    return row


# ---------------------------------------------------------------------------
# Graph API answers


def error(code: int, message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": {"message": message, "type": "OAuthException", "code": code}}, status_code=status)


def effective_status(entity_id: str, now: float) -> str:
    if entity_id in WORLD.ads:
        ad = WORLD.ads[entity_id]
        own = status_at(ad.id, now)
        if own != "ACTIVE":
            return own
        parent = effective_status(ad.adset_id, now)
        return "ADSET_PAUSED" if parent == "PAUSED" else ("CAMPAIGN_PAUSED" if parent == "CAMPAIGN_PAUSED" else parent)
    if entity_id in WORLD.adsets:
        adset = WORLD.adsets[entity_id]
        own = status_at(adset.id, now)
        if own != "ACTIVE":
            return own
        return "CAMPAIGN_PAUSED" if status_at(adset.campaign_id, now) != "ACTIVE" else "ACTIVE"
    return status_at(entity_id, now)


def entity_fields(entity_id: str, now: float) -> dict:
    account_id = WORLD.account_of(entity_id) or ""
    entity = WORLD.campaigns.get(entity_id) or WORLD.adsets.get(entity_id) or WORLD.ads.get(entity_id)
    row = {
        "id": entity_id,
        "account_id": account_id.removeprefix("act_"),
        "name": entity.name,
        "status": status_at(entity_id, now),
        "effective_status": effective_status(entity_id, now),
    }
    budget = budget_at(entity_id, now)
    if budget is not None:
        row["daily_budget"] = str(budget)
    if entity_id in WORLD.adsets:
        row["campaign_id"] = WORLD.adsets[entity_id].campaign_id
    if entity_id in WORLD.ads:
        ad = WORLD.ads[entity_id]
        row["adset_id"] = ad.adset_id
        row["campaign_id"] = WORLD.adsets[ad.adset_id].campaign_id
    return row


def page(rows: list[dict], params: dict, request: Request) -> dict:
    start = int(params.get("after") or 0)
    body: dict = {"data": rows[start:start + PAGE_SIZE]}
    if start + PAGE_SIZE < len(rows):
        after = str(start + PAGE_SIZE)
        body["paging"] = {
            "cursors": {"before": str(start), "after": after},
            "next": str(request.url.include_query_params(after=after)),
        }
    return body


def report_days(account: Account, params: dict, now: float) -> list[date]:
    if params.get("time_range"):
        window = json.loads(params["time_range"])
        since, until = date.fromisoformat(window["since"]), date.fromisoformat(window["until"])
        return [since + timedelta(days=n) for n in range((until - since).days + 1)]
    today = datetime.fromtimestamp(now, ZoneInfo(account.timezone)).date()
    preset = params.get("date_preset") or "last_30d"
    if preset == "today":
        return [today]
    if preset == "yesterday":
        return [today - timedelta(days=1)]
    if preset == "maximum":
        # Meta's lifetime: every day up to now, today included. The invented
        # world has been running for LIFETIME_DAYS.
        return [today - timedelta(days=n) for n in range(LIFETIME_DAYS - 1, -1, -1)]
    if preset.startswith("last_") and preset.endswith("d"):
        # Meta's last_Nd ends yesterday.
        count = int(preset[5:-1])
        return [today - timedelta(days=n) for n in range(count, 0, -1)]
    raise ValueError(f"unsupported date_preset {preset}")


def insights(account: Account, params: dict, now: float) -> list[dict]:
    level = params.get("level") or "account"
    days = report_days(account, params, now)
    period = {"date_start": days[0].isoformat(), "date_stop": days[-1].isoformat()}
    account_ads = [
        ad_id
        for campaign_id in account.campaigns
        for adset_id in WORLD.campaigns[campaign_id].adsets
        for ad_id in WORLD.adsets[adset_id].ads
    ]
    groups: list[tuple[dict, list[str]]] = []
    if level == "account":
        groups.append(({"account_id": account.id.removeprefix("act_"), "account_name": account.name}, account_ads))
    for campaign_id in account.campaigns:
        campaign = WORLD.campaigns[campaign_id]
        campaign_ads = [ad_id for adset_id in campaign.adsets for ad_id in WORLD.adsets[adset_id].ads]
        if level == "campaign":
            groups.append(({"campaign_id": campaign.id, "campaign_name": campaign.name}, campaign_ads))
        for adset_id in campaign.adsets:
            adset = WORLD.adsets[adset_id]
            ids = {"campaign_id": campaign.id, "adset_id": adset.id, "adset_name": adset.name}
            if level == "adset":
                groups.append((ids, list(adset.ads)))
            if level == "ad":
                for ad_id in adset.ads:
                    groups.append(({**ids, "ad_id": ad_id, "ad_name": WORLD.ads[ad_id].name}, [ad_id]))
    rows = []
    for ids, ad_ids in groups:
        sums = total(ad_ids, days, now)
        if sums["spend"] == 0 and sums["impressions"] == 0:
            continue  # Meta leaves out what did not deliver
        rows.append({**ids, **insight_row(sums), **period})
    return rows


app = FastAPI(title="Fake Meta Graph API", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "accounts": sorted(WORLD.accounts)}


@app.get("/{version}/{object_id}")
async def read_object(version: str, object_id: str, request: Request):
    now = datetime.now(timezone.utc).timestamp()
    if object_id in WORLD.accounts:
        account = WORLD.accounts[object_id]
        return {
            "id": account.id,
            "name": account.name,
            "timezone_name": account.timezone,
            "currency": account.currency,
            "account_status": 1,
            "disable_reason": 0,
        }
    if WORLD.account_of(object_id):
        return entity_fields(object_id, now)
    return error(100, f"Unsupported get request. Object with ID '{object_id}' does not exist")


@app.get("/{version}/{account_id}/{edge}")
async def read_edge(version: str, account_id: str, edge: str, request: Request):
    now = datetime.now(timezone.utc).timestamp()
    params = dict(request.query_params)
    account = WORLD.accounts.get(account_id)
    if account is None:
        return error(100, f"Unsupported get request. Object with ID '{account_id}' does not exist")
    if edge == "insights":
        try:
            rows = insights(account, params, now)
        except (ValueError, KeyError) as exc:
            return error(100, f"Invalid parameter: {exc}")
        return page(rows, params, request)
    campaign_ids = account.campaigns
    adset_ids = [a for c in campaign_ids for a in WORLD.campaigns[c].adsets]
    ids = {
        "campaigns": campaign_ids,
        "adsets": adset_ids,
        "ads": [ad for a in adset_ids for ad in WORLD.adsets[a].ads],
    }.get(edge)
    if ids is None:
        return error(100, f"Unknown edge {edge}")
    return page([entity_fields(entity_id, now) for entity_id in ids], params, request)


@app.post("/{version}/{object_id}")
async def write_object(version: str, object_id: str, request: Request):
    now = datetime.now(timezone.utc).timestamp()
    if not WORLD.account_of(object_id):
        return error(100, f"Unsupported post request. Object with ID '{object_id}' does not exist")
    form = dict(await request.form())
    form.update(request.query_params)
    if "status" in form:
        status = str(form["status"]).upper()
        if status not in {"ACTIVE", "PAUSED"}:
            return error(100, "Invalid parameter: status")
        HISTORY.record(object_id, "status", status, now)
    if "daily_budget" in form:
        if budget_at(object_id, now) is None:
            return error(100, "This object has no daily budget of its own")
        try:
            budget = int(form["daily_budget"])
        except ValueError:
            return error(100, "Invalid parameter: daily_budget")
        if budget <= 0:
            return error(100, "Invalid parameter: daily_budget")
        HISTORY.record(object_id, "daily_budget", budget, now)
    return {"success": True}
