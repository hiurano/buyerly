"""Pilot results by simulation (#200): the cheat-sheet days and Meta faults.

Each test runs one scenario of `scripts/rule_simulator.py` through the real
worker, rule engine, Inbox history, undo and MetaClient retries, prints the
table that `docs/PILOT_SIMULATION.md` quotes, and pins what is deterministic
(everything but the retry backoff seconds, which carry Meta-style jitter).
"""

import unittest

from scripts.rule_simulator import SCENARIOS, render, simulate


class TestRuleSimulator(unittest.IsolatedAsyncioTestCase):
    async def run_scenario(self, name: str) -> dict:
        result = await simulate(SCENARIOS[name])
        print("\n" + render(result) + "\n", flush=True)
        return result

    def row(self, result: dict, adset_id: str) -> dict:
        return next(row for row in result["rows"] if row["adset_id"] == adset_id)

    def assert_summary(self, result: dict, **expected) -> None:
        summary = result["summary"]
        actual = {key: summary[key] for key in expected}
        self.assertEqual(actual, expected, summary)

    def assert_follows_the_sheet(self, result: dict) -> None:
        """Every sheet stop happened once, by the same rule, nothing extra."""
        summary = result["summary"]
        self.assert_summary(
            result, missed=0, extra=0, early=0, double_writes=0,
            matched=summary["sheet_stops"], same_rule=summary["sheet_stops"],
            buyerly_stops=summary["sheet_stops"],
        )
        for row in result["rows"]:
            self.assertLessEqual(row["meta_pauses"], 1, row)
            self.assertLessEqual(row["stop_success_events"], 1, row)

    async def test_nl_day_follows_the_cheat_sheet(self):
        result = await self.run_scenario("nl_day")
        self.assert_follows_the_sheet(result)
        self.assert_summary(
            result, sheet_stops=8, delay_median=12.0, delay_max=12.0,
            spent=54.10, sheet=48.50, over_sheet=5.60, no_rules=163.20,
            manual={15: 54.45, 30: 59.10, 60: 76.20},
        )
        self.assertEqual((result["meta_posts"], result["meta_changes"]), (8, 8))
        self.assertEqual(result["events"], {"STOP_CONFIRMATION_STARTED:WAITING": 8, "STOP:SUCCESS": 8})

    async def test_fast_day_follows_the_cheat_sheet(self):
        result = await self.run_scenario("fast_day")
        self.assert_follows_the_sheet(result)
        # With a 5-minute confirmation fast spenders cost more than a buyer
        # looking every 15 minutes: the confirmation is paid at $0.25-0.40/min.
        self.assert_summary(
            result, sheet_stops=5, delay_median=12.0, delay_max=12.5,
            spent=49.00, sheet=29.50, over_sheet=19.50, no_rules=150.00,
            manual={15: 46.50, 30: 57.00, 60: 96.00},
        )

    async def test_fast_day_with_a_short_confirmation(self):
        result = await self.run_scenario("fast_day_confirm2")
        self.assert_follows_the_sheet(result)
        self.assertLess(result["summary"]["spent"], 49.00)
        self.assertLess(result["summary"]["delay_max"], 12.0)

    async def test_late_conversions_cause_early_stops(self):
        result = await self.run_scenario("late_events")
        # A lead or click reported 15 min after the spend is not seen at the
        # threshold: Buyerly stops two ad sets the sheet keeps longer. A buyer
        # in Ads Manager sees the same numbers and does the same.
        self.assert_summary(
            result, sheet_stops=4, buyerly_stops=4, matched=4, same_rule=2,
            missed=0, extra=0, early=2, double_writes=0,
            spent=19.40, sheet=29.00, manual={15: 16.50, 30: 21.00, 60: 36.00},
        )
        self.assertEqual(self.row(result, "late_lead_395")["buyerly_stop"], 4.60)
        self.assertEqual(self.row(result, "late_click_290")["buyerly_stop"], 3.60)

    async def test_undo_restores_and_holds_for_the_day(self):
        result = await self.run_scenario("undo")
        attempts = result["undo"]["attempts"]
        self.assertEqual(
            [(a["ok"], a["already_reverted"], a["posts"]) for a in attempts],
            [(True, False, 1), (True, True, 0)],
        )
        dead = self.row(result, "nl_dead_fast")
        self.assertEqual(dead["final_status"], "ACTIVE")
        # Stopped once; after the undo the rule leaves it alone all day.
        self.assertEqual((dead["stop_success_events"], dead["meta_pauses"]), (1, 1))
        self.assertEqual(result["events"].get("UNDO_ACTION:SUCCESS"), 1)
        self.assertEqual((result["meta_posts"], result["meta_changes"]), (9, 9))

    async def assert_fault(self, name: str, *, posts: int, errors: int = 0) -> dict:
        result = await self.run_scenario(name)
        self.assert_summary(
            result, sheet_stops=8, buyerly_stops=8, matched=8, missed=0, extra=0,
            early=0, double_writes=0,
        )
        # Every ad set paused exactly once in Meta, whatever the retries sent.
        self.assertEqual(result["meta_changes"], 8)
        self.assertEqual(result["meta_posts"], posts)
        self.assertEqual(result["events"].get("STOP:SUCCESS"), 8, result["events"])
        self.assertEqual(result["events"].get("STOP:ERROR", 0), errors, result["events"])
        self.assertTrue(result["account_active"])
        self.assertEqual(result["health"], "healthy")
        return result

    async def test_meta_429_is_retried(self):
        await self.assert_fault("meta_429", posts=9)

    async def test_meta_503_three_times(self):
        result = await self.assert_fault("meta_503", posts=11, errors=1)
        # The failed stop is retried after a new confirmation: 8 more minutes.
        dead = self.row(result, "nl_dead_fast")
        self.assertEqual((dead["buyerly_stop"], dead["inbox_delay_minutes"]), (5.00, 20.0))

    async def test_timeout_before_the_write(self):
        await self.assert_fault("timeout_before", posts=9)

    async def test_timeout_after_the_write(self):
        await self.assert_fault("timeout_after", posts=9)

    async def test_applied_write_whose_retries_all_time_out(self):
        # Meta paused it although every attempt timed out: one read confirms
        # it, Inbox shows the stop (with Undo), no error and no repeat.
        await self.assert_fault("timeout_after_all", posts=10)

    async def test_expired_token_on_a_write(self):
        result = await self.run_scenario("token_expired")
        self.assertEqual((result["meta_posts"], result["meta_changes"]), (1, 0))
        self.assertEqual(
            result["events"],
            {"STOP_CONFIRMATION_STARTED:WAITING": 1, "STOP:ERROR": 1, "TOKEN_EXPIRED:ERROR": 1},
        )
        self.assertFalse(result["account_active"])
        self.assertEqual(result["health"], "critical")

    async def test_undo_whose_write_timed_out_after_meta_applied_it(self):
        result = await self.run_scenario("undo_timeout_after")
        attempts = result["undo"]["attempts"]
        # The first try fails after three writes; the retry sees Meta already
        # undone and records it without writing; a third press is a no-op.
        self.assertEqual(
            [(a["ok"], a.get("already_reverted"), a["posts"]) for a in attempts],
            [(False, None, 3), (True, False, 0), (True, True, 0)],
        )
        dead = self.row(result, "nl_dead_fast")
        self.assertEqual((dead["final_status"], dead["stop_success_events"]), ("ACTIVE", 1))
        self.assertEqual(result["events"].get("UNDO_ACTION:SUCCESS"), 1)


if __name__ == "__main__":
    unittest.main()
