import unittest
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.config import settings
from database.models import Account, RulePreset, User, Workspace, WorkspaceMember
from services.analytics_store import AnalyticsFactService, resolve_account_period_dates
from tests.test_db_helper import create_test_engine, init_test_db, session_headers


VALID_CONDITIONS = [{"metric": "spend", "operator": "gte", "value": 10, "time_window": "today"}]


class TestWorkspaceSearch(unittest.IsolatedAsyncioTestCase):
    """GET /api/search: what the search page promises to find, and only in this workspace."""

    async def asyncSetUp(self):
        api_routes_module._summary_cache.clear()
        self.test_engine = create_test_engine()
        self.test_session_maker = async_sessionmaker(
            self.test_engine, class_=AsyncSession, expire_on_commit=False
        )
        await init_test_db(self.test_engine)
        # Setting it on api.routes reaches every router, the search one included.
        api_routes_module.async_session_maker = self.test_session_maker
        api_auth_module.async_session_maker = self.test_session_maker
        api_server_module.async_session_maker = self.test_session_maker
        settings.ADMIN_CHAT_ID = "8634201356"

        async with self.test_session_maker() as session:
            self.buyer = User(telegram_id="31000001", username="searcher", full_name="Sam Searcher", role="buyer", is_approved=True)
            self.other = User(telegram_id="31000002", username="neighbour", full_name="Nia Neighbour", role="buyer", is_approved=True)
            session.add_all([self.buyer, self.other])
            await session.flush()

            self.alpha = Workspace(name="Alpha", slug="alpha", owner_user_id=self.buyer.id)
            self.beta = Workspace(name="Beta", slug="beta", owner_user_id=self.buyer.id)
            self.gamma = Workspace(name="Gamma", slug="gamma", owner_user_id=self.other.id)
            session.add_all([self.alpha, self.beta, self.gamma])
            await session.flush()
            session.add_all([
                WorkspaceMember(workspace_id=self.alpha.id, user_id=self.buyer.id, role="owner"),
                WorkspaceMember(workspace_id=self.beta.id, user_id=self.buyer.id, role="owner"),
                WorkspaceMember(workspace_id=self.gamma.id, user_id=self.other.id, role="owner"),
            ])
            self.buyer.active_workspace_id = self.alpha.id
            self.other.active_workspace_id = self.gamma.id

            def account(account_id, name, workspace, owner, **fields):
                return Account(
                    account_id=account_id, name=name, workspace_id=workspace.id, owner_user_id=owner.id,
                    currency="USD", account_status=1, status_label="Active", **fields,
                )

            # Ad accounts in different time zones each have their own "today".
            self.leads = account("act_1001", "Leads Meta name", self.alpha, self.buyer, custom_name="Leads account", timezone_name="America/New_York")
            self.euro = account("act_1002", "Euro Test account", self.alpha, self.buyer, timezone_name="Europe/Berlin")
            self.disabled = account("act_1003", "Test disabled account", self.alpha, self.buyer, timezone_name="UTC", is_active=False)
            self.beta_account = account("act_2001", "Beta account", self.beta, self.buyer, timezone_name="UTC")
            self.gamma_account = account("act_3001", "Test neighbour account", self.gamma, self.other, timezone_name="UTC")
            session.add_all([self.leads, self.euro, self.disabled, self.beta_account, self.gamma_account])

            session.add_all([
                RulePreset(workspace_id=self.alpha.id, owner_user_id=self.buyer.id, name="Test stop without leads",
                           action="turn_off", enabled=True, conditions=VALID_CONDITIONS),
                RulePreset(workspace_id=self.alpha.id, owner_user_id=self.buyer.id, name="Paused test rule",
                           action="notify_only", enabled=False, conditions=VALID_CONDITIONS),
                RulePreset(workspace_id=self.alpha.id, owner_user_id=self.buyer.id, name="Unrelated rule",
                           action="turn_off", enabled=True, conditions=VALID_CONDITIONS),
                RulePreset(workspace_id=self.gamma.id, owner_user_id=self.other.id, name="Test rule of a neighbour",
                           action="turn_off", enabled=True, conditions=VALID_CONDITIONS),
            ])
            await session.commit()

        await self._store_inventory(self.alpha, self.leads, [
            ("campaign", "120001", "Test Campaign", "act_1001", "ACTIVE"),
            ("campaign", "120002", "Spring sale", "act_1001", "PAUSED"),
            ("adset", "230001", "Test audience", "120001", "ACTIVE"),
            ("ad", "340001", "Test creative", "230001", "ADSET_PAUSED"),
        ])
        await self._store_inventory(self.alpha, self.euro, [
            ("campaign", "120101", "Latest Test campaign", "act_1002", "ACTIVE"),
            ("campaign", "120102", "Test campaign EU", "act_1002", "ACTIVE"),
            ("campaign", "120103", "Promo 50% off", "act_1002", "ACTIVE"),
            ("campaign", "120104", "Promo 500 leads", "act_1002", "ACTIVE"),
            ("campaign", "120105", "US_Leads", "act_1002", "ACTIVE"),
            ("campaign", "120106", "US-Leads", "act_1002", "ACTIVE"),
            ("campaign", "120107", "Test campaign deleted", "act_1002", "DELETED"),
            ("campaign", "120108", "Test campaign archived", "act_1002", "ARCHIVED"),
        ])
        # Synced three days ago too, so Buyerly first saw it then.
        await self._store_inventory(self.alpha, self.euro, [
            ("campaign", "120102", "Test campaign EU", "act_1002", "ACTIVE"),
        ], days_ago=3)
        # Gone from Meta since yesterday: no longer inventory Ads Manager shows.
        await self._store_inventory(self.alpha, self.euro, [
            ("campaign", "120199", "Test campaign removed yesterday", "act_1002", "ACTIVE"),
        ], days_ago=1)
        # An ad account Buyerly no longer monitors keeps its old facts.
        await self._store_inventory(self.alpha, self.disabled, [
            ("campaign", "120301", "Test campaign of a disabled account", "act_1003", "ACTIVE"),
        ])
        await self._store_inventory(self.beta, self.beta_account, [
            ("campaign", "120401", "Test campaign in Beta", "act_2001", "ACTIVE"),
        ])
        await self._store_inventory(self.gamma, self.gamma_account, [
            ("campaign", "120501", "Test Campaign", "act_3001", "ACTIVE"),
        ])

        self.app = create_app()

    async def asyncTearDown(self):
        await self.test_engine.dispose()

    async def _store_inventory(self, workspace, account, entities, days_ago=0):
        day = resolve_account_period_dates(account.timezone_name, "today")[0]
        if days_ago:
            day = (datetime.fromisoformat(day) - timedelta(days=days_ago)).date().isoformat()
        async with self.test_session_maker() as session:
            await AnalyticsFactService.upsert_entity_facts(
                session,
                workspace_id=workspace.id,
                account_id=account.account_id,
                facts=[
                    {
                        "entity_level": level,
                        "entity_id": entity_id,
                        "entity_name": name,
                        "parent_entity_id": parent,
                        "date": day,
                        "currency": "USD",
                        "status": "ACTIVE" if status == "ACTIVE" else "PAUSED",
                        "effective_status": status,
                        "fetched_at": datetime.now(timezone.utc),
                    }
                    for level, entity_id, name, parent, status in entities
                ],
            )
            await session.commit()

    async def _search(self, query, telegram_id=31000001, username="searcher", slug=None, **params):
        headers = await session_headers(self.test_session_maker, {"id": telegram_id, "username": username})
        if slug is not None:
            headers["X-Workspace-Slug"] = slug
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/api/search", params={"q": query, **params}, headers=headers)

    @staticmethod
    def _found(response, kind=None):
        return [
            (item["kind"], item["name"])
            for item in response.json()["results"]
            if kind is None or item["kind"] == kind
        ]

    async def test_finds_a_campaign_by_name_with_its_ad_account(self):
        response = await self._search("test campaign", slug="alpha")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["query"], "test campaign")
        self.assertEqual(payload["limit"], 5)
        campaigns = [item for item in payload["results"] if item["kind"] == "campaign"]
        # The name itself first, then names starting with it, then names containing it.
        self.assertEqual(
            [item["name"] for item in campaigns],
            ["Test Campaign", "Test campaign EU", "Latest Test campaign"],
        )
        today = resolve_account_period_dates(self.leads.timezone_name, "today")[0]
        self.assertEqual(campaigns[0], {
            "kind": "campaign", "id": "120001", "name": "Test Campaign", "account_id": "act_1001",
            "account_name": "Leads account", "parent_name": "", "status": "ACTIVE",
            # Meta's own dates are not stored: the age is the first day Buyerly synced it.
            "updated_at": f"{today}T00:00:00Z",
        })
        self.assertEqual(payload["truncated"], [])

    async def test_results_are_todays_inventory_of_monitored_accounts_only(self):
        found = self._found(await self._search("test", slug="alpha"))

        self.assertNotIn(("campaign", "Test campaign removed yesterday"), found)
        self.assertNotIn(("campaign", "Test campaign of a disabled account"), found)
        self.assertNotIn(("account", "Test disabled account"), found)
        # Another workspace's data never shows, even when its name matches exactly.
        self.assertNotIn(("campaign", "Test campaign in Beta"), found)
        self.assertNotIn(("account", "Test neighbour account"), found)
        self.assertNotIn(("rule", "Test rule of a neighbour"), found)
        self.assertEqual([name for kind, name in found if kind == "campaign"].count("Test Campaign"), 1)

    async def test_ad_sets_and_ads_name_their_parent(self):
        payload = (await self._search("TEST", slug="alpha")).json()
        by_kind = {item["kind"]: item for item in payload["results"] if item["kind"] in ("adset", "ad")}

        self.assertEqual(by_kind["adset"]["name"], "Test audience")
        self.assertEqual(by_kind["adset"]["parent_name"], "Test Campaign")
        self.assertEqual(by_kind["ad"]["name"], "Test creative")
        self.assertEqual(by_kind["ad"]["parent_name"], "Test audience")
        self.assertEqual(by_kind["ad"]["status"], "ADSET_PAUSED")
        self.assertEqual(by_kind["ad"]["account_id"], "act_1001")

    async def test_one_list_best_match_first_then_kind(self):
        found = self._found(await self._search("test", slug="alpha"))

        # Names starting with the query, then names containing it; kinds in a fixed order among equals.
        self.assertEqual(found, [
            ("campaign", "Test Campaign"),
            ("campaign", "Test campaign EU"),
            ("adset", "Test audience"),
            ("ad", "Test creative"),
            ("rule", "Test stop without leads"),
            ("campaign", "Latest Test campaign"),
            ("rule", "Paused test rule"),
            ("account", "Euro Test account"),
        ])

    async def test_a_tab_searches_one_kind(self):
        for kind in ("campaign", "adset", "ad", "rule", "account"):
            with self.subTest(kind=kind):
                found = self._found(await self._search("test", slug="alpha", kind=kind))
                self.assertTrue(found)
                self.assertEqual({found_kind for found_kind, _ in found}, {kind})
        self.assertEqual((await self._search("test", slug="alpha", kind="issue")).status_code, 422)

    async def test_deleted_and_archived_entities_only_on_request(self):
        found = self._found(await self._search("test campaign", slug="alpha"), "campaign")
        self.assertNotIn(("campaign", "Test campaign deleted"), found)
        self.assertNotIn(("campaign", "Test campaign archived"), found)

        found = self._found(await self._search("test campaign", slug="alpha", include_deleted="true"), "campaign")
        self.assertIn(("campaign", "Test campaign deleted"), found)
        self.assertIn(("campaign", "Test campaign archived"), found)

    async def test_status_filter_speaks_active_paused_other(self):
        active = self._found(await self._search("test", slug="alpha", status="active"))
        # Ad accounts have no status, so a status filter leaves them out.
        self.assertEqual(active, [
            ("campaign", "Test Campaign"),
            ("campaign", "Test campaign EU"),
            ("adset", "Test audience"),
            ("rule", "Test stop without leads"),
            ("campaign", "Latest Test campaign"),
        ])
        # ADSET_PAUSED is paused, as Ads Manager says.
        paused = self._found(await self._search("test", slug="alpha", status="paused"))
        self.assertEqual(paused, [("ad", "Test creative"), ("rule", "Paused test rule")])

        other = self._found(await self._search("test", slug="alpha", status="other", include_deleted="true"))
        self.assertEqual(sorted(other), [("campaign", "Test campaign archived"), ("campaign", "Test campaign deleted")])

        both = self._found(await self._search("test", slug="alpha", status=["active", "paused"], kind="rule"))
        self.assertEqual(both, [("rule", "Test stop without leads"), ("rule", "Paused test rule")])

    async def test_ad_account_filter_keeps_its_records_only(self):
        found = self._found(await self._search("test", slug="alpha", account="act_1002"))

        # Rules belong to no ad account, so they drop out too.
        self.assertEqual(found, [
            ("campaign", "Test campaign EU"),
            ("campaign", "Latest Test campaign"),
            ("account", "Euro Test account"),
        ])

    async def test_last_updated_puts_the_newest_first(self):
        payload = (await self._search("test campaign", slug="alpha", kind="campaign", order="updated")).json()
        names = [item["name"] for item in payload["results"]]
        dates = [item["updated_at"] for item in payload["results"]]

        self.assertEqual(dates, sorted(dates, reverse=True))
        # First synced three days ago, so it is the oldest.
        self.assertEqual(names[-1], "Test campaign EU")
        self.assertEqual((await self._search("test", slug="alpha", order="newest")).status_code, 422)

    async def test_a_meta_id_finds_its_entity(self):
        found = self._found(await self._search("230001", slug="alpha"))

        self.assertEqual(found, [("adset", "Test audience")])

    async def test_percent_and_underscore_are_plain_characters(self):
        self.assertEqual(self._found(await self._search("50%", slug="alpha"), "campaign"), [("campaign", "Promo 50% off")])
        self.assertEqual(self._found(await self._search("US_Leads", slug="alpha"), "campaign"), [("campaign", "US_Leads")])

    async def test_rules_report_whether_they_run(self):
        rules = [
            (item["name"], item["status"])
            for item in (await self._search("test", slug="alpha")).json()["results"]
            if item["kind"] == "rule"
        ]

        self.assertEqual(rules, [("Test stop without leads", "active"), ("Paused test rule", "paused")])

    async def test_ad_accounts_match_their_names_and_id(self):
        for query in ("leads account", "leads meta", "act_1001", "1001"):
            with self.subTest(query=query):
                accounts = [
                    item for item in (await self._search(query, slug="alpha")).json()["results"]
                    if item["kind"] == "account"
                ]
                # An ad account's age is when it was added to Buyerly.
                self.assertTrue(accounts and accounts[0].pop("updated_at"))
                self.assertEqual(accounts, [{
                    "kind": "account", "id": "act_1001", "name": "Leads account", "account_id": "act_1001",
                    "account_name": "", "parent_name": "", "status": "",
                }])

    async def test_each_kind_is_cut_at_the_limit_and_says_so(self):
        payload = (await self._search("test", slug="alpha", limit=2)).json()

        self.assertEqual(len([item for item in payload["results"] if item["kind"] == "campaign"]), 2)
        self.assertEqual(payload["truncated"], ["campaign"])
        self.assertEqual(payload["limit"], 2)

    async def test_the_address_decides_the_workspace(self):
        beta = self._found(await self._search("test", slug="beta"))

        self.assertEqual(beta, [("campaign", "Test campaign in Beta")])
        # Without the header the session's active workspace applies.
        self.assertIn(("campaign", "Test Campaign"), self._found(await self._search("test")))

        refused = await self._search("test", slug="gamma")
        self.assertEqual(refused.status_code, 403)

    async def test_a_neighbour_finds_only_their_own_workspace(self):
        found = self._found(await self._search("test", telegram_id=31000002, username="neighbour"))

        self.assertEqual(found, [
            ("campaign", "Test Campaign"),
            ("rule", "Test rule of a neighbour"),
            ("account", "Test neighbour account"),
        ])

    async def test_rejects_an_empty_or_oversized_request(self):
        for params in ({"q": "   "}, {"q": "x" * 201}, {"q": "test", "limit": 0}, {"q": "test", "limit": 21}):
            with self.subTest(params=params):
                query = params.pop("q")
                response = await self._search(query, slug="alpha", **params)
                self.assertEqual(response.status_code, 422)

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            anonymous = await client.get("/api/search", params={"q": "test"})
        self.assertEqual(anonymous.status_code, 401)


if __name__ == "__main__":
    unittest.main()
