"""The local fake Meta (scripts/fake_meta.py) behaves like the Graph API.

compose.dev.yaml and branch previews show its numbers in Ads Manager and let
rules act on them, so it has to keep Meta's shape and its own promises: today
grows and never shrinks, a paused entity stops spending, a budget change
changes the pace, a campaign is the sum of its ads, and Buyerly's real
MetaClient reads and writes it without special cases.
"""

import json
import tempfile
import unittest
from datetime import date, datetime, time, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

import httpx

from scripts import fake_meta
from scripts.fake_meta import WORLD, History, ad_metrics, ad_spend, app, total

NL = "act_1000000000000001"
TZ = ZoneInfo(WORLD.accounts[NL].timezone)
DAY = date(2026, 10, 7)


def at(hour: float, day: date = DAY) -> float:
    return datetime.combine(day, time.min, TZ).timestamp() + hour * 3600


def first_running_ad():
    for ad in WORLD.ads.values():
        adset = WORLD.adsets[ad.adset_id]
        campaign = WORLD.campaigns[adset.campaign_id]
        if (
            campaign.account_id == NL
            and adset.daily_budget is not None
            and ad.status == adset.status == campaign.status == "ACTIVE"
        ):
            return ad
    raise AssertionError("the NL account has no running ad with an ad set budget")


class FakeMetaTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.history = History(Path(self.tmp.name) / "state.json")
        patcher = patch.object(fake_meta, "HISTORY", self.history)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_today_grows_through_the_day_and_a_finished_day_stays(self):
        ad = first_running_ad()
        morning, noon, evening = (ad_metrics(ad, DAY, at(h)) for h in (6, 12, 20))
        for key in morning:
            self.assertLessEqual(morning[key], noon[key], key)
            self.assertLessEqual(noon[key], evening[key], key)
        self.assertGreater(evening["spend"], morning["spend"])
        self.assertEqual(ad_metrics(ad, DAY, at(30)), ad_metrics(ad, DAY, at(50)))

    def test_pause_freezes_spend_and_resume_continues(self):
        ad = first_running_ad()
        untouched = ad_spend(ad, DAY, at(24))
        self.history.record(ad.adset_id, "status", "PAUSED", at(12))
        self.assertAlmostEqual(ad_spend(ad, DAY, at(18)), ad_spend(ad, DAY, at(12)))
        self.history.record(ad.adset_id, "status", "ACTIVE", at(18))
        self.assertAlmostEqual(ad_spend(ad, DAY, at(24)), untouched * 0.75, places=6)

    def test_campaign_pause_stops_its_ads(self):
        ad = first_running_ad()
        campaign_id = WORLD.adsets[ad.adset_id].campaign_id
        self.history.record(campaign_id, "status", "PAUSED", at(0))
        self.assertEqual(ad_spend(ad, DAY, at(24)), 0)

    def test_budget_change_changes_the_pace(self):
        ad = first_running_ad()
        adset = WORLD.adsets[ad.adset_id]
        untouched = ad_spend(ad, DAY, at(24))
        self.history.record(adset.id, "daily_budget", adset.daily_budget * 2, at(12))
        self.assertAlmostEqual(ad_spend(ad, DAY, at(24)), untouched * 1.5, places=6)

    async def test_meta_client_reads_and_writes_the_fake(self):
        from meta_api.client import MetaClient

        transport = httpx.ASGITransport(app=app)
        client = MetaClient()
        client.base_url = "http://fake-meta/v26.0"
        client._client = httpx.AsyncClient(transport=transport)
        client._respect_usage_limit = _no_wait
        self.addAsyncCleanup(client.aclose)

        info = await client.get_account_info(NL, "any-token")
        self.assertEqual(info["currency"], "EUR")
        self.assertEqual(info["timezone_name"], "Europe/Amsterdam")

        facts = await client.get_hierarchical_insights(NL, "any-token", "yesterday", "EUR", "NL")
        by_level = {}
        for fact in facts:
            by_level.setdefault(fact["entity_level"], []).append(fact)
        self.assertEqual(set(by_level), {"account", "campaign", "adset", "ad"})
        account_spend = by_level["account"][0]["spend"]
        self.assertGreater(account_spend, 0)
        self.assertAlmostEqual(sum(f["spend"] for f in by_level["ad"]), account_spend, places=2)
        self.assertEqual(
            sum(f["clicks"] for f in by_level["campaign"]), by_level["account"][0]["clicks"]
        )

        ad = first_running_ad()
        self.assertTrue(await client.set_adset_status(ad.adset_id, "any-token", "PAUSED", account_id=NL))
        state = await client.get_entity_state(ad.adset_id, "any-token", "adset", "EUR")
        self.assertEqual((state["status"], state["effective_status"]), ("PAUSED", "PAUSED"))
        ad_state = await client.get_entity_state(ad.id, "any-token", "ad", "EUR")
        self.assertEqual(ad_state["effective_status"], "ADSET_PAUSED")

        self.assertTrue(await client.update_entity_budget(ad.adset_id, "any-token", 321.0, "EUR"))
        state = await client.get_entity_state(ad.adset_id, "any-token", "adset", "EUR")
        self.assertEqual(state["daily_budget"], 321.0)
        saved = json.loads(self.history.path.read_text())
        self.assertEqual([event[1] for event in saved[ad.adset_id]], ["status", "daily_budget"])

    async def test_unknown_objects_answer_like_meta(self):
        from meta_api.client import MetaClient

        client = MetaClient()
        client.base_url = "http://fake-meta/v26.0"
        client._client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app))
        client._respect_usage_limit = _no_wait
        self.addAsyncCleanup(client.aclose)
        with self.assertRaises(RuntimeError):
            await client.get_account_info("act_404", "any-token")

    def test_periods_follow_meta(self):
        account = WORLD.accounts[NL]
        now = at(15)
        days = fake_meta.report_days(account, {"date_preset": "last_7d"}, now)
        self.assertEqual(days, [DAY - timedelta(days=n) for n in range(7, 0, -1)])
        lifetime = fake_meta.report_days(account, {"date_preset": "maximum"}, now)
        self.assertEqual(len(lifetime), fake_meta.LIFETIME_DAYS)
        self.assertEqual(lifetime[-1], DAY)  # Meta's lifetime includes today
        window = fake_meta.report_days(
            account, {"time_range": json.dumps({"since": "2026-10-01", "until": "2026-10-03"})}, now
        )
        self.assertEqual(len(window), 3)
        ads = [a for a in WORLD.ads if WORLD.account_of(a) == NL]
        self.assertEqual(total(ads, [DAY], now)["spend"], total(ads, [DAY], now)["spend"])


async def _no_wait(**_kwargs):
    return None


class DevSeedGuardTest(unittest.TestCase):
    def test_seed_refuses_without_the_local_flag(self):
        from scripts import dev_seed

        with patch.dict("os.environ", {"BUYERLY_DEV_SEED": ""}):
            with self.assertRaises(SystemExit):
                dev_seed.main()

    def test_production_talks_to_meta(self):
        from core.config import Settings

        self.assertEqual(
            Settings.model_fields["META_GRAPH_BASE_URL"].default, "https://graph.facebook.com"
        )
        compose = (Path(__file__).resolve().parents[1] / "docker-compose.yml").read_text()
        self.assertNotIn("META_GRAPH_BASE_URL", compose)


if __name__ == "__main__":
    unittest.main()
