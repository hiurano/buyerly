import json
import time
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routers.analytics as analytics_router_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.config import settings
from database.db import hash_password
from database.models import (
    Account,
    AnalyticsEntityFact,
    User,
    Workspace,
    WorkspaceMember,
)
from meta_api.client import MetaClient
from services.analytics_store import (
    AnalyticsFactService,
    HierarchyParentNotFound,
    resolve_account_period_dates,
    resolve_previous_period_dates,
    resolve_recent_dates,
)
from tests.test_db_helper import create_test_engine, init_test_db, session_headers


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.text = ""

    def json(self):
        return self.payload


class TestAnalyticsFactStore(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        api_routes_module._summary_cache.clear()
        self.test_engine = create_test_engine()
        self.test_session_maker = async_sessionmaker(
            self.test_engine, class_=AsyncSession, expire_on_commit=False
        )
        await init_test_db(self.test_engine)

        api_routes_module.async_session_maker = self.test_session_maker
        api_auth_module.async_session_maker = self.test_session_maker
        analytics_router_module.async_session_maker = self.test_session_maker
        api_server_module.async_session_maker = self.test_session_maker
        settings.ADMIN_CHAT_ID = "8634201356"

        async with self.test_session_maker() as session:
            # Workspace 1 & User 1
            self.user1 = User(
                telegram_id="11111111",
                username="buyer1",
                full_name="Buyer One",
                password_hash=hash_password("password123"),
                role="buyer",
                is_approved=True,
            )
            session.add(self.user1)
            await session.flush()

            self.ws1 = Workspace(
                name="Agency Alpha",
                slug="alpha",
                owner_user_id=self.user1.id,
            )
            session.add(self.ws1)
            await session.flush()

            self.user1.active_workspace_id = self.ws1.id
            session.add(
                WorkspaceMember(
                    workspace_id=self.ws1.id,
                    user_id=self.user1.id,
                    role="owner",
                )
            )

            # Account 1 in Workspace 1 (USD)
            self.acc1 = Account(
                workspace_id=self.ws1.id,
                owner_user_id=self.user1.id,
                account_id="act_1001",
                name="Alpha Main USD",
                currency="USD",
                timezone_name="America/New_York",
                is_active=True,
                account_status=1,
                status_label="Active",
            )
            session.add(self.acc1)

            # Account 2 in Workspace 1 (EUR)
            self.acc2 = Account(
                workspace_id=self.ws1.id,
                owner_user_id=self.user1.id,
                account_id="act_1002",
                name="Alpha Euro EUR",
                currency="EUR",
                timezone_name="Europe/Berlin",
                is_active=True,
                account_status=1,
                status_label="Active",
            )
            session.add(self.acc2)

            # Workspace 2 & User 2 (Isolated Tenant)
            self.user2 = User(
                telegram_id="22222222",
                username="buyer2",
                full_name="Buyer Two",
                password_hash=hash_password("password123"),
                role="buyer",
                is_approved=True,
            )
            session.add(self.user2)
            await session.flush()

            self.ws2 = Workspace(
                name="Agency Beta",
                slug="beta",
                owner_user_id=self.user2.id,
            )
            session.add(self.ws2)
            await session.flush()

            self.user2.active_workspace_id = self.ws2.id
            session.add(
                WorkspaceMember(
                    workspace_id=self.ws2.id,
                    user_id=self.user2.id,
                    role="owner",
                )
            )

            # Account 3 in Workspace 2
            self.acc3 = Account(
                workspace_id=self.ws2.id,
                owner_user_id=self.user2.id,
                account_id="act_2001",
                name="Beta Main USD",
                currency="USD",
                timezone_name="UTC",
                is_active=True,
                account_status=1,
                status_label="Active",
            )
            session.add(self.acc3)

            await session.commit()

        self.app = create_app()

    async def test_resolve_account_period_dates(self):
        # Test timezone date resolution
        fixed_now = datetime(2026, 8, 29, 3, 0, 0, tzinfo=timezone.utc)
        # In New York (UTC-4), it is 2026-08-28 23:00:00
        dates_ny_today = resolve_account_period_dates("America/New_York", "today", now_utc=fixed_now)
        self.assertEqual(dates_ny_today, ["2026-08-28"])

        dates_ny_yesterday = resolve_account_period_dates("America/New_York", "yesterday", now_utc=fixed_now)
        self.assertEqual(dates_ny_yesterday, ["2026-08-27"])

        dates_ny_last_3d = resolve_account_period_dates("America/New_York", "last_3d", now_utc=fixed_now)
        self.assertEqual(dates_ny_last_3d, ["2026-08-28", "2026-08-27", "2026-08-26"])

        # In Berlin (UTC+2), it is 2026-08-29 05:00:00
        dates_berlin_today = resolve_account_period_dates("Europe/Berlin", "today", now_utc=fixed_now)
        self.assertEqual(dates_berlin_today, ["2026-08-29"])

    async def test_upsert_and_retrieve_facts_idempotency(self):
        async with self.test_session_maker() as session:
            today_str = datetime.now(timezone.utc).date().isoformat()
            raw_facts = [
                {
                    "entity_level": "account",
                    "entity_id": "act_1001",
                    "entity_name": "Alpha Main USD",
                    "parent_entity_id": "",
                    "date": today_str,
                    "currency": "USD",
                    "spend": 150.50,
                    "impressions": 10000,
                    "clicks": 500,
                    "leads": 25,
                    "registrations": 10,
                    "purchases": 5,
                },
                {
                    "entity_level": "campaign",
                    "entity_id": "cmp_1",
                    "entity_name": "Campaign 1",
                    "parent_entity_id": "act_1001",
                    "date": today_str,
                    "currency": "USD",
                    "spend": 100.00,
                    "impressions": 7000,
                    "clicks": 350,
                    "leads": 20,
                    "registrations": 8,
                    "purchases": 4,
                },
                {
                    "entity_level": "adset",
                    "entity_id": "adset_1",
                    "entity_name": "AdSet 1",
                    "parent_entity_id": "cmp_1",
                    "date": today_str,
                    "currency": "USD",
                    "spend": 60.00,
                    "impressions": 4000,
                    "clicks": 200,
                    "leads": 12,
                },
                {
                    "entity_level": "ad",
                    "entity_id": "ad_1",
                    "entity_name": "Ad 1",
                    "parent_entity_id": "adset_1",
                    "date": today_str,
                    "currency": "USD",
                    "spend": 30.00,
                    "impressions": 2000,
                    "clicks": 100,
                    "leads": 6,
                },
            ]

            count = await AnalyticsFactService.upsert_entity_facts(
                session=session,
                workspace_id=self.ws1.id,
                account_id="act_1001",
                facts=raw_facts,
            )
            await session.commit()
            self.assertEqual(count, 4)

            # Re-upserting updated metrics (idempotence)
            raw_facts[0]["spend"] = 200.00
            raw_facts[0]["leads"] = 30
            count2 = await AnalyticsFactService.upsert_entity_facts(
                session=session,
                workspace_id=self.ws1.id,
                account_id="act_1001",
                facts=raw_facts,
            )
            await session.commit()
            self.assertEqual(count2, 4)

            # Verify updated values in DB
            fact_row = (
                await session.execute(
                    select(AnalyticsEntityFact).where(
                        AnalyticsEntityFact.workspace_id == self.ws1.id,
                        AnalyticsEntityFact.entity_id == "act_1001",
                        AnalyticsEntityFact.date == today_str,
                    )
                )
            ).scalar_one()

            self.assertEqual(fact_row.spend, 200.00)
            self.assertEqual(fact_row.leads, 30)

    async def test_workspace_summary_multi_currency_and_division_safety(self):
        async with self.test_session_maker() as session:
            dates_acc1 = resolve_account_period_dates(self.acc1.timezone_name, "today")
            dates_acc2 = resolve_account_period_dates(self.acc2.timezone_name, "today")

            # Fact for Account 1 (USD, with 0 leads to test division by zero protection)
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc1.account_id,
                facts=[{
                    "entity_level": "account",
                    "entity_id": self.acc1.account_id,
                    "date": dates_acc1[0],
                    "currency": "USD",
                    "spend": 50.0,
                    "impressions": 2000,
                    "clicks": 100,
                    "leads": 0,  # Zero leads
                    "registrations": 0,
                    "purchases": 0,
                }],
            )

            # Fact for Account 2 (EUR, with 10 leads)
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc2.account_id,
                facts=[{
                    "entity_level": "account",
                    "entity_id": self.acc2.account_id,
                    "date": dates_acc2[0],
                    "currency": "EUR",
                    "spend": 100.0,
                    "impressions": 5000,
                    "clicks": 250,
                    "leads": 10,
                    "registrations": 5,
                    "purchases": 2,
                }],
            )
            await session.commit()

            summary = await AnalyticsFactService.get_workspace_summary_report(
                session,
                workspace_id=self.ws1.id,
                period="today",
                user_accounts=[self.acc1, self.acc2],
            )

            # Check mixed currency behavior (BL-015)
            self.assertTrue(summary["mixed_currencies"])
            self.assertEqual(summary["display_currency"], "")
            self.assertIsNone(summary["total_spend"])  # Mixed currencies must not be summed
            self.assertEqual(len(summary["currency_totals"]), 2)

            usd_bucket = next(b for b in summary["currency_totals"] if b["currency"] == "USD")
            eur_bucket = next(b for b in summary["currency_totals"] if b["currency"] == "EUR")

            self.assertEqual(usd_bucket["spend"], 50.0)
            self.assertIsNone(usd_bucket["cost_per_lead"])  # Division by zero safety!

            self.assertEqual(eur_bucket["spend"], 100.0)
            self.assertEqual(eur_bucket["leads"], 10)
            self.assertEqual(eur_bucket["cost_per_lead"], 10.0)

    async def test_hierarchical_drill_down_and_tenant_isolation(self):
        async with self.test_session_maker() as session:
            self.acc1.timezone_name = "UTC"
            today_str = datetime.now(timezone.utc).date().isoformat()

            # Insert hierarchy into Workspace 1
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc1.account_id,
                facts=[
                    {
                        "entity_level": "campaign",
                        "entity_id": "cmp_alpha_1",
                        "entity_name": "Alpha Campaign 1",
                        "parent_entity_id": self.acc1.account_id,
                        "date": today_str,
                        "currency": "USD",
                        "spend": 80.0,
                        "impressions": 4000,
                        "clicks": 200,
                        "leads": 10,
                    },
                    {
                        "entity_level": "adset",
                        "entity_id": "adset_alpha_1",
                        "entity_name": "Alpha Adset 1",
                        "parent_entity_id": "cmp_alpha_1",
                        "date": today_str,
                        "currency": "USD",
                        "spend": 80.0,
                        "impressions": 4000,
                        "clicks": 200,
                        "leads": 10,
                    },
                ],
            )

            # Insert hierarchy into Workspace 2
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws2.id,
                account_id=self.acc3.account_id,
                facts=[
                    {
                        "entity_level": "campaign",
                        "entity_id": "cmp_beta_1",
                        "entity_name": "Beta Secret Campaign",
                        "parent_entity_id": self.acc3.account_id,
                        "date": today_str,
                        "currency": "USD",
                        "spend": 500.0,
                        "impressions": 20000,
                        "clicks": 1000,
                        "leads": 50,
                    }
                ],
            )
            await session.commit()

            # Query campaigns for Workspace 1
            breakdown_w1, _ = await AnalyticsFactService.get_hierarchy_breakdown(
                session,
                workspace_id=self.ws1.id,
                parent_entity_id=self.acc1.account_id,
                entity_level="campaign",
                period="today",
                user_accounts=[self.acc1],
            )
            self.assertEqual(len(breakdown_w1), 1)
            self.assertEqual(breakdown_w1[0]["entity_id"], "cmp_alpha_1")
            self.assertEqual(breakdown_w1[0]["cost_per_lead"], 8.0)

            # An authorized account parent returns the selected level account-wide.
            account_adsets, _ = await AnalyticsFactService.get_hierarchy_breakdown(
                session,
                workspace_id=self.ws1.id,
                parent_entity_id=self.acc1.account_id,
                entity_level="adset",
                period="today",
                user_accounts=[self.acc1],
            )
            self.assertEqual([item["entity_id"] for item in account_adsets], ["adset_alpha_1"])

            # Existing direct-parent drill-down remains available.
            direct_adsets, _ = await AnalyticsFactService.get_hierarchy_breakdown(
                session,
                workspace_id=self.ws1.id,
                parent_entity_id="cmp_alpha_1",
                entity_level="adset",
                period="today",
                user_accounts=[self.acc1],
            )
            self.assertEqual([item["entity_id"] for item in direct_adsets], ["adset_alpha_1"])

            # Verify Tenant Isolation: Workspace 1 query MUST NOT see Workspace 2 campaigns
            with self.assertRaises(HierarchyParentNotFound):
                await AnalyticsFactService.get_hierarchy_breakdown(
                    session,
                    workspace_id=self.ws1.id,
                    parent_entity_id=self.acc3.account_id,
                    entity_level="campaign",
                    period="today",
                    user_accounts=[self.acc1, self.acc2],
                )

    async def test_hierarchy_rows_keep_their_own_parent(self):
        async with self.test_session_maker() as session:
            self.acc1.timezone_name = "UTC"
            today_str = datetime.now(timezone.utc).date().isoformat()

            def fact(level, entity_id, parent_id, spend):
                return {
                    "entity_level": level,
                    "entity_id": entity_id,
                    "entity_name": entity_id,
                    "parent_entity_id": parent_id,
                    "date": today_str,
                    "currency": "USD",
                    "spend": spend,
                }

            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc1.account_id,
                facts=[
                    fact("campaign", "cmp_a", self.acc1.account_id, 60.0),
                    fact("campaign", "cmp_b", self.acc1.account_id, 40.0),
                    fact("adset", "set_a1", "cmp_a", 30.0),
                    fact("adset", "set_a2", "cmp_a", 20.0),
                    fact("adset", "set_b1", "cmp_b", 10.0),
                    fact("ad", "ad_a1_x", "set_a1", 9.0),
                    fact("ad", "ad_a2_x", "set_a2", 8.0),
                    fact("ad", "ad_a2_y", "set_a2", 7.0),
                    fact("ad", "ad_b1_x", "set_b1", 6.0),
                ],
            )
            # Another workspace reusing a campaign ID must not join the drill-down.
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws2.id,
                account_id=self.acc3.account_id,
                facts=[fact("adset", "set_foreign", "cmp_a", 500.0)],
            )
            await session.commit()

            async def parents(parent_id, level):
                items, _ = await AnalyticsFactService.get_hierarchy_breakdown(
                    session,
                    workspace_id=self.ws1.id,
                    parent_entity_id=parent_id,
                    entity_level=level,
                    period="today",
                    user_accounts=[self.acc1],
                )
                return {item["entity_id"]: item["parent_entity_id"] for item in items}

            account_id = self.acc1.account_id
            self.assertEqual(
                await parents(account_id, "campaign"),
                {"cmp_a": account_id, "cmp_b": account_id},
            )
            self.assertEqual(
                await parents(account_id, "adset"),
                {"set_a1": "cmp_a", "set_a2": "cmp_a", "set_b1": "cmp_b"},
            )
            self.assertEqual(
                await parents(account_id, "ad"),
                {
                    "ad_a1_x": "set_a1",
                    "ad_a2_x": "set_a2",
                    "ad_a2_y": "set_a2",
                    "ad_b1_x": "set_b1",
                },
            )
            self.assertEqual(
                await parents("cmp_a", "adset"),
                {"set_a1": "cmp_a", "set_a2": "cmp_a"},
            )
            self.assertEqual(
                await parents("set_a2", "ad"),
                {"ad_a2_x": "set_a2", "ad_a2_y": "set_a2"},
            )

    async def test_drill_down_reads_the_account_local_day(self):
        """A campaign parent reads its ad account's dates, on either side of UTC."""
        cases = (
            # West of UTC in the evening: UTC has already started the next day.
            ("America/New_York", datetime(2026, 9, 26, 2, 30, tzinfo=timezone.utc), "2026-09-25"),
            # East of UTC just after midnight: UTC is still on the previous day.
            ("Asia/Tokyo", datetime(2026, 9, 25, 15, 30, tzinfo=timezone.utc), "2026-09-26"),
            # The first evening after the clocks went back: UTC-5 now, not UTC-4.
            ("America/New_York", datetime(2026, 11, 2, 4, 30, tzinfo=timezone.utc), "2026-11-01"),
        )

        async def breakdown(session, parent_id, period, now, compare=False):
            items, comparison = await AnalyticsFactService.get_hierarchy_breakdown(
                session,
                workspace_id=self.ws1.id,
                parent_entity_id=parent_id,
                entity_level="adset",
                period=period,
                user_accounts=[self.acc1],
                compare=compare,
                now_utc=now,
            )
            return {item["entity_id"]: item for item in items}, comparison

        async with self.test_session_maker() as session:
            for index, (zone, now, local_today) in enumerate(cases):
                with self.subTest(zone=zone, now=now.isoformat()):
                    # Reading UTC's date instead would land on another day.
                    self.assertNotEqual(now.date().isoformat(), local_today)
                    self.acc1.timezone_name = zone
                    campaign, adset = f"cmp_clock_{index}", f"set_clock_{index}"
                    today = date.fromisoformat(local_today)
                    window = [(today - timedelta(days=back)).isoformat() for back in (2, 1, 0)]
                    spend_by_day = dict(zip(window, (10.0, 20.0, 40.0)))
                    await AnalyticsFactService.upsert_entity_facts(
                        session,
                        workspace_id=self.ws1.id,
                        account_id=self.acc1.account_id,
                        facts=[
                            {
                                "entity_level": level,
                                "entity_id": entity_id,
                                "entity_name": entity_id,
                                "parent_entity_id": parent_id,
                                "date": day,
                                "currency": "USD",
                                "spend": spend,
                            }
                            for day, spend in spend_by_day.items()
                            for level, entity_id, parent_id in (
                                ("campaign", campaign, self.acc1.account_id),
                                ("adset", adset, campaign),
                            )
                        ],
                    )
                    await session.commit()

                    drilled, today_comparison = await breakdown(
                        session, campaign, "today", now, compare=True
                    )
                    self.assertEqual({key: row["spend"] for key, row in drilled.items()}, {adset: 40.0})
                    # The account-wide view of the same level shows the same day.
                    account_wide, _ = await breakdown(session, self.acc1.account_id, "today", now)
                    self.assertEqual(account_wide[adset]["spend"], 40.0)
                    # A day in progress stays without a baseline at every depth.
                    self.assertFalse(today_comparison["available"])
                    self.assertTrue(today_comparison["current_includes_open_day"])

                    yesterday, comparison = await breakdown(
                        session, campaign, "yesterday", now, compare=True
                    )
                    self.assertEqual(yesterday[adset]["spend"], 20.0)
                    self.assertEqual(comparison["dates"], [window[0]])
                    self.assertEqual(yesterday[adset]["previous"]["spend"], 10.0)

                    trend = await AnalyticsFactService.get_entity_timeseries(
                        session,
                        workspace_id=self.ws1.id,
                        parent_entity_id=campaign,
                        entity_level="adset",
                        days=3,
                        user_accounts=[self.acc1],
                        now_utc=now,
                    )
                    self.assertEqual(trend["timezone"], zone)
                    self.assertEqual([point["date"] for point in trend["points"]], window)
                    self.assertEqual([point["spend"] for point in trend["points"]], [10.0, 20.0, 40.0])
                    self.assertEqual(trend["open_day"], local_today)

    async def test_drill_down_refuses_a_parent_outside_the_workspace_accounts(self):
        """A parent with no account in this workspace is refused, never read on UTC."""

        def fact(level, entity_id, parent_id):
            return {
                "entity_level": level,
                "entity_id": entity_id,
                "entity_name": entity_id,
                "parent_entity_id": parent_id,
                "date": "2026-09-25",
                "currency": "USD",
                "spend": 10.0,
            }

        async with self.test_session_maker() as session:
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws2.id,
                account_id=self.acc3.account_id,
                facts=[
                    fact("campaign", "cmp_foreign", self.acc3.account_id),
                    fact("adset", "set_foreign", "cmp_foreign"),
                ],
            )
            # Facts kept in this workspace from an ad account it no longer holds.
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id="act_1099",
                facts=[
                    fact("campaign", "cmp_detached", "act_1099"),
                    fact("adset", "set_detached", "cmp_detached"),
                ],
            )
            # One campaign ID stored under two accounts has no single clock.
            for account in (self.acc1, self.acc2):
                await AnalyticsFactService.upsert_entity_facts(
                    session,
                    workspace_id=self.ws1.id,
                    account_id=account.account_id,
                    facts=[fact("adset", f"set_{account.account_id}", "cmp_split")],
                )
            await session.commit()

            async def assert_refused(parent_id):
                with self.assertRaises(HierarchyParentNotFound):
                    await AnalyticsFactService.get_hierarchy_breakdown(
                        session,
                        workspace_id=self.ws1.id,
                        parent_entity_id=parent_id,
                        entity_level="adset",
                        user_accounts=[self.acc1, self.acc2],
                    )
                with self.assertRaises(HierarchyParentNotFound):
                    await AnalyticsFactService.get_entity_timeseries(
                        session,
                        workspace_id=self.ws1.id,
                        parent_entity_id=parent_id,
                        entity_level="adset",
                        user_accounts=[self.acc1, self.acc2],
                    )

            for parent_id in ("cmp_foreign", "cmp_detached", "cmp_missing", ""):
                with self.subTest(parent_id=parent_id):
                    await assert_refused(parent_id)
            with self.assertLogs("services.analytics_store", level="WARNING"):
                await assert_refused("cmp_split")

    async def test_meta_client_get_hierarchical_insights(self):
        client = MetaClient()
        client._fetch_paginated_data = AsyncMock(
            side_effect=[
                # 1. Account insights summary
                [{"spend": "100.00", "impressions": "5000", "clicks": "200", "actions": [{"action_type": "lead", "value": "10"}]}],
                # 2. Authoritative campaign inventory
                [
                    {
                        "id": "c1",
                        "name": "Camp 1",
                        "status": "ACTIVE",
                        "effective_status": "ACTIVE",
                        "daily_budget": "2500",
                    },
                    {
                        "id": "c2",
                        "name": "Paused without delivery",
                        "status": "PAUSED",
                        "effective_status": "PAUSED",
                    },
                ],
                # 3. Authoritative ad set inventory
                [
                    {
                        "id": "as1",
                        "name": "AdSet 1",
                        "campaign_id": "c1",
                        "status": "ACTIVE",
                        "effective_status": "ACTIVE",
                        "daily_budget": "1500",
                    },
                    {
                        "id": "as2",
                        "name": "Paused ad set without delivery",
                        "campaign_id": "c2",
                        "status": "PAUSED",
                        "effective_status": "PAUSED",
                    },
                ],
                # 4. Authoritative ad inventory
                [
                    {"id": "ad1", "name": "Ad 1", "campaign_id": "c1", "adset_id": "as1", "status": "ACTIVE", "effective_status": "ACTIVE"},
                    {"id": "ad2", "name": "Paused ad without delivery", "campaign_id": "c2", "adset_id": "as2", "status": "PAUSED", "effective_status": "PAUSED"},
                ],
                # 5. Campaign level insights
                [{"campaign_id": "c1", "campaign_name": "Camp 1", "spend": "60.00", "impressions": "3000", "clicks": "120", "actions": [{"action_type": "lead", "value": "6"}]}],
                # 6. Adset level insights
                [{"adset_id": "as1", "adset_name": "AdSet 1", "campaign_id": "c1", "spend": "40.00", "impressions": "2000", "clicks": "80", "actions": []}],
                # 7. Ad level insights
                [{"ad_id": "ad1", "ad_name": "Ad 1", "adset_id": "as1", "spend": "20.00", "impressions": "1000", "clicks": "40", "actions": []}],
            ]
        )

        facts = await client.get_hierarchical_insights(
            account_id="act_1001",
            access_token="test_token",
            date_preset="today",
            currency="USD",
            account_name="Alpha USD",
            reporting_date="2026-08-28",
        )

        self.assertEqual(len(facts), 7)
        levels = [f["entity_level"] for f in facts]
        self.assertEqual(levels, ["account", "campaign", "campaign", "adset", "adset", "ad", "ad"])
        self.assertEqual(facts[0]["spend"], 100.0)
        self.assertEqual(facts[0]["leads"], 10)
        self.assertEqual(facts[1]["entity_id"], "c1")
        self.assertEqual(facts[1]["parent_entity_id"], "act_1001")
        self.assertEqual(facts[1]["status"], "ACTIVE")
        self.assertEqual(facts[1]["daily_budget"], 25.0)
        self.assertEqual(facts[2]["entity_id"], "c2")
        self.assertEqual(facts[2]["spend"], 0.0)
        self.assertEqual(facts[2]["effective_status"], "PAUSED")
        self.assertEqual(facts[3]["entity_id"], "as1")
        self.assertEqual(facts[3]["parent_entity_id"], "c1")
        self.assertEqual(facts[3]["daily_budget"], 15.0)
        self.assertEqual(facts[4]["entity_id"], "as2")
        self.assertEqual(facts[4]["spend"], 0.0)
        self.assertEqual(facts[4]["effective_status"], "PAUSED")
        self.assertEqual(facts[5]["entity_id"], "ad1")
        self.assertEqual(facts[5]["parent_entity_id"], "as1")
        self.assertEqual(facts[6]["entity_id"], "ad2")
        self.assertEqual(facts[6]["spend"], 0.0)
        self.assertEqual(facts[6]["effective_status"], "PAUSED")
        self.assertTrue(all(fact["date"] == "2026-08-28" for fact in facts))

        calls = client._fetch_paginated_data.await_args_list
        self.assertTrue(calls[1].args[0].endswith("/campaigns"))
        self.assertEqual(
            calls[1].args[1]["fields"],
            "id,name,status,effective_status,daily_budget",
        )
        self.assertTrue(calls[2].args[0].endswith("/adsets"))
        self.assertIn("campaign_id", calls[2].args[1]["fields"])
        self.assertTrue(calls[3].args[0].endswith("/ads"))
        self.assertIn("adset_id", calls[3].args[1]["fields"])
        self.assertNotIn("adset_id", calls[4].args[1]["fields"])
        self.assertIn("adset_id", calls[5].args[1]["fields"])
        self.assertIn("ad_id", calls[6].args[1]["fields"])

    async def test_hierarchical_insights_preserves_insight_only_campaign(self):
        client = MetaClient()
        client._fetch_paginated_data = AsyncMock(
            side_effect=[
                [],
                [],
                [],
                [],
                [{"campaign_id": "removed_1", "campaign_name": "Removed today", "spend": "12.50"}],
                [],
                [],
            ]
        )

        facts = await client.get_hierarchical_insights(
            account_id="act_1001",
            access_token="test_token",
            currency="USD",
            reporting_date="2026-08-28",
        )

        campaign = next(fact for fact in facts if fact["entity_level"] == "campaign")
        self.assertEqual(campaign["entity_id"], "removed_1")
        self.assertEqual(campaign["spend"], 12.5)
        self.assertEqual(campaign["status"], "UNKNOWN")

    async def test_hierarchical_inventory_failure_is_not_silenced(self):
        client = MetaClient()
        client._fetch_paginated_data = AsyncMock(
            side_effect=[[], RuntimeError("Meta campaign inventory unavailable")]
        )

        with self.assertRaisesRegex(RuntimeError, "campaign inventory unavailable"):
            await client.get_hierarchical_insights(
                account_id="act_1001",
                access_token="test_token",
                currency="USD",
                reporting_date="2026-08-28",
            )

    async def test_analytics_hierarchy_api_endpoint(self):
        async with self.test_session_maker() as session:
            today_str = resolve_account_period_dates(self.acc1.timezone_name, "today")[0]
            older_fetch = datetime(2026, 9, 12, 8, 0, tzinfo=timezone.utc)
            newer_fetch = datetime(2026, 9, 12, 9, 0, tzinfo=timezone.utc)
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc1.account_id,
                facts=[
                    {
                        "entity_level": "campaign",
                        "entity_id": "cmp_api_1",
                        "entity_name": "Campaign API Test",
                        "parent_entity_id": self.acc1.account_id,
                        "date": today_str,
                        "currency": "USD",
                        "spend": 75.0,
                        "impressions": 3000,
                        "clicks": 150,
                        "leads": 5,
                        "fetched_at": older_fetch,
                    },
                    {
                        "entity_level": "campaign",
                        "entity_id": "cmp_api_zero",
                        "entity_name": "Paused Campaign",
                        "parent_entity_id": self.acc1.account_id,
                        "date": today_str,
                        "currency": "USD",
                        "status": "PAUSED",
                        "effective_status": "PAUSED",
                        "spend": 0.0,
                        "impressions": 0,
                        "clicks": 0,
                        "fetched_at": newer_fetch,
                    },
                    {
                        "entity_level": "adset",
                        "entity_id": "adset_api_zero",
                        "entity_name": "Paused Ad Set",
                        "parent_entity_id": "cmp_api_zero",
                        "date": today_str,
                        "currency": "USD",
                        "status": "PAUSED",
                        "effective_status": "PAUSED",
                    },
                    {
                        "entity_level": "ad",
                        "entity_id": "ad_api_zero",
                        "entity_name": "Paused Ad",
                        "parent_entity_id": "adset_api_zero",
                        "date": today_str,
                        "currency": "USD",
                        "status": "PAUSED",
                        "effective_status": "PAUSED",
                    },
                ],
            )
            await session.commit()

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            auth_w1 = await session_headers(self.test_session_maker, {"id": 11111111, "first_name": "Buyer One", "username": "buyer1"})
            headers_w1 = {**auth_w1}

            # Authorized query for own account's campaigns
            res = await ac.get(
                f"/api/analytics/hierarchy?parent_id={self.acc1.account_id}&level=campaign&period=today",
                headers=headers_w1,
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["total"], 2)
            self.assertEqual(data["source"], "analytics_fact_store")
            self.assertEqual(data["data_as_of"], "2026-09-12T08:00:00Z")
            rows_by_id = {item["entity_id"]: item for item in data["items"]}
            self.assertEqual(rows_by_id["cmp_api_1"]["spend"], 75.0)
            self.assertEqual(rows_by_id["cmp_api_1"]["data_as_of"], "2026-09-12T08:00:00Z")
            self.assertEqual(rows_by_id["cmp_api_zero"]["spend"], 0.0)
            self.assertEqual(rows_by_id["cmp_api_zero"]["effective_status"], "PAUSED")

            for level, expected_id in (
                ("adset", "adset_api_zero"),
                ("ad", "ad_api_zero"),
            ):
                level_res = await ac.get(
                    f"/api/analytics/hierarchy?parent_id={self.acc1.account_id}&level={level}&period=today",
                    headers=headers_w1,
                )
                self.assertEqual(level_res.status_code, 200)
                self.assertEqual(level_res.json()["items"][0]["entity_id"], expected_id)

            # Query for alien account from another workspace should be rejected (404)
            for level in ("campaign", "adset", "ad"):
                res_alien = await ac.get(
                    f"/api/analytics/hierarchy?parent_id={self.acc3.account_id}&level={level}&period=today",
                    headers=headers_w1,
                )
                self.assertEqual(res_alien.status_code, 404)

            # A campaign parent reads the ad sets stored under it.
            direct = await ac.get(
                "/api/analytics/hierarchy?parent_id=cmp_api_zero&level=adset&period=today",
                headers=headers_w1,
            )
            self.assertEqual(direct.status_code, 200)
            self.assertEqual([item["entity_id"] for item in direct.json()["items"]], ["adset_api_zero"])

            # A campaign this workspace does not hold is refused, not shown as empty.
            unknown = await ac.get(
                "/api/analytics/hierarchy?parent_id=cmp_unknown&level=adset&period=today",
                headers=headers_w1,
            )
            self.assertEqual(unknown.status_code, 404)

    async def test_analytics_hierarchy_compares_against_the_preceding_window(self):
        """The baseline is the equal-length window immediately before the reported one."""
        timezone_name = self.acc1.timezone_name
        reported = resolve_account_period_dates(timezone_name, "yesterday")[0]
        baseline = resolve_previous_period_dates(timezone_name, "yesterday")[0]
        self.assertNotEqual(reported, baseline)

        def campaign(entity_id, day, spend, leads):
            return {
                "entity_level": "campaign",
                "entity_id": entity_id,
                "entity_name": entity_id,
                "parent_entity_id": self.acc1.account_id,
                "date": day,
                "currency": "USD",
                "spend": spend,
                "impressions": 1000,
                "clicks": 50,
                "leads": leads,
            }

        async with self.test_session_maker() as session:
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc1.account_id,
                facts=[
                    # Same spend, more leads: cost per lead fell against the baseline.
                    campaign("cmp_improved", baseline, 100.0, 4),
                    campaign("cmp_improved", reported, 100.0, 10),
                    # Started inside the reported window, so it has no baseline.
                    campaign("cmp_new", reported, 50.0, 2),
                    # Ran only before the reported window: it must not become a row.
                    campaign("cmp_gone", baseline, 70.0, 7),
                ],
            )
            await session.commit()

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            auth_w1 = await session_headers(self.test_session_maker, {"id": 11111111, "first_name": "Buyer One", "username": "buyer1"})
            headers_w1 = {**auth_w1}
            base_url = (
                f"/api/analytics/hierarchy?parent_id={self.acc1.account_id}"
                "&level=campaign"
            )
            compared = await ac.get(f"{base_url}&period=yesterday&compare=previous", headers=headers_w1)
            plain = await ac.get(f"{base_url}&period=yesterday", headers=headers_w1)
            open_period = await ac.get(f"{base_url}&period=today&compare=previous", headers=headers_w1)
            rejected = await ac.get(f"{base_url}&period=yesterday&compare=sideways", headers=headers_w1)

        self.assertEqual(compared.status_code, 200)
        payload = compared.json()
        comparison = payload["comparison"]
        self.assertTrue(comparison["requested"])
        self.assertTrue(comparison["available"])
        self.assertEqual(comparison["dates"], [baseline])
        # A closed day carries no day in progress, so the change is final.
        self.assertFalse(comparison["current_includes_open_day"])

        rows = {item["entity_id"]: item for item in payload["items"]}
        # The reported window defines the rows: a campaign that only ran in the
        # baseline window is history, not a row to act on.
        self.assertEqual(set(rows), {"cmp_improved", "cmp_new"})
        self.assertEqual(rows["cmp_improved"]["cost_per_lead"], 10.0)
        self.assertEqual(rows["cmp_improved"]["previous"]["leads"], 4)
        self.assertEqual(rows["cmp_improved"]["previous"]["cost_per_lead"], 25.0)
        # No baseline is reported as absent, never as a zero that reads as -100%.
        self.assertIsNone(rows["cmp_new"]["previous"])

        # Without a comparison the rows keep their previous shape exactly.
        self.assertEqual(plain.status_code, 200)
        self.assertFalse(plain.json()["comparison"]["requested"])
        self.assertNotIn("previous", plain.json()["items"][0])

        # A day in progress cannot be compared with an equal part of an earlier day.
        self.assertEqual(open_period.status_code, 200)
        open_comparison = open_period.json()["comparison"]
        self.assertTrue(open_comparison["requested"])
        self.assertFalse(open_comparison["available"])
        self.assertIn("still open", open_comparison["reason"])
        self.assertTrue(open_comparison["current_includes_open_day"])

        self.assertEqual(rejected.status_code, 422)

    async def test_analytics_timeseries_reports_one_point_per_local_day(self):
        """A day the fact store never received is a gap, not a day without spend."""
        timezone_name = self.acc1.timezone_name
        window = resolve_recent_dates(timezone_name, 5)
        self.assertEqual(len(window), 5)
        self.assertEqual(window, sorted(window), "the window runs oldest day first")

        async with self.test_session_maker() as session:
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc1.account_id,
                facts=[
                    {
                        "entity_level": "campaign",
                        "entity_id": f"cmp_trend_{index}",
                        "entity_name": "Trend campaign",
                        "parent_entity_id": self.acc1.account_id,
                        "date": day,
                        "currency": "USD",
                        "spend": 100.0,
                        "impressions": 1000,
                        "clicks": 50,
                        "leads": 5,
                    }
                    # The middle day of the window is deliberately never reported.
                    for index, day in enumerate(window)
                    if day != window[2]
                ],
            )
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc1.account_id,
                facts=[
                    {
                        "entity_level": "adset",
                        "entity_id": "set_trend",
                        "entity_name": "Trend ad set",
                        "parent_entity_id": "cmp_trend_0",
                        "date": day,
                        "currency": "USD",
                        "spend": 40.0,
                    }
                    for day in window
                ],
            )
            await session.commit()

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            auth_w1 = await session_headers(self.test_session_maker, {"id": 11111111, "first_name": "Buyer One", "username": "buyer1"})
            headers_w1 = {**auth_w1}
            series = await ac.get(
                f"/api/analytics/timeseries?parent_id={self.acc1.account_id}&level=campaign&days=5",
                headers=headers_w1,
            )
            too_long = await ac.get(
                f"/api/analytics/timeseries?parent_id={self.acc1.account_id}&level=campaign&days=365",
                headers=headers_w1,
            )
            alien = await ac.get(
                f"/api/analytics/timeseries?parent_id={self.acc3.account_id}&level=campaign&days=5",
                headers=headers_w1,
            )
            drilled = await ac.get(
                "/api/analytics/timeseries?parent_id=cmp_trend_0&level=adset&days=5",
                headers=headers_w1,
            )
            unknown = await ac.get(
                "/api/analytics/timeseries?parent_id=cmp_unknown&level=adset&days=5",
                headers=headers_w1,
            )

        self.assertEqual(series.status_code, 200)
        payload = series.json()
        self.assertEqual(payload["source"], "analytics_fact_store")
        self.assertEqual([point["date"] for point in payload["points"]], window)
        # The last local date is still in progress and is named as such.
        self.assertEqual(payload["open_day"], window[-1])
        self.assertEqual(payload["currency"], "USD")

        by_date = {point["date"]: point for point in payload["points"]}
        self.assertTrue(by_date[window[0]]["has_data"])
        self.assertEqual(by_date[window[0]]["cost_per_lead"], 20.0)
        # The unreported day is flagged, and carries no invented cost.
        self.assertFalse(by_date[window[2]]["has_data"])
        self.assertIsNone(by_date[window[2]]["cost_per_lead"])

        # The window length is validated, not trusted from the query string.
        self.assertEqual(too_long.status_code, 422)

        # Another workspace's ad account is not readable through the trend either.
        self.assertEqual(alien.status_code, 404)

        # A campaign parent keeps its ad account's clock and names it.
        self.assertEqual(drilled.status_code, 200)
        drilled_payload = drilled.json()
        self.assertEqual(drilled_payload["timezone"], timezone_name)
        self.assertEqual([point["date"] for point in drilled_payload["points"]], window)
        self.assertEqual(drilled_payload["open_day"], window[-1])
        self.assertEqual(unknown.status_code, 404)

    async def test_retention_cleanup(self):
        async with self.test_session_maker() as session:
            old_date = (datetime.now(timezone.utc).date() - timedelta(days=70)).isoformat()
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=self.ws1.id,
                account_id=self.acc1.account_id,
                facts=[{
                    "entity_level": "ad",
                    "entity_id": "ad_old",
                    "entity_name": "Old Ad",
                    "parent_entity_id": "adset_1",
                    "date": old_date,
                    "currency": "USD",
                    "spend": 10.0,
                }],
            )
            await session.commit()

            deleted = await AnalyticsFactService.cleanup_expired_facts(
                session,
                ad_days=60,
            )
            self.assertGreaterEqual(deleted, 1)

            # Check that old ad was purged
            remaining = (
                await session.execute(
                    select(AnalyticsEntityFact).where(AnalyticsEntityFact.entity_id == "ad_old")
                )
            ).scalars().all()
            self.assertEqual(len(remaining), 0)
