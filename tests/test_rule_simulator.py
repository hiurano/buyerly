"""Pilot results by simulation (#200): the cheat-sheet days and Meta faults.

Each test runs one scenario of `scripts/rule_simulator.py` through the real
worker, rule engine, Inbox history, undo and MetaClient retries, prints the
table that `docs/PILOT_SIMULATION.md` quotes, and pins what is deterministic.
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

    def assert_no_wrong_actions(self, result: dict) -> None:
        summary = result["summary"]
        self.assertEqual(summary["missed"], 0, summary)
        self.assertEqual(summary["extra"], 0, summary)
        self.assertEqual(summary["double_writes"], 0, summary)
        for row in result["rows"]:
            self.assertEqual(row["stop_error_events"], 0, row)
            self.assertLessEqual(row["meta_pauses"], 1, row)

    async def test_nl_day_follows_the_cheat_sheet(self):
        result = await self.run_scenario("nl_day")
        self.assert_no_wrong_actions(result)
        summary = result["summary"]
        self.assertEqual(summary["early"], 0, summary)
        self.assertEqual(summary["matched"], summary["sheet_stops"])
        # Buyerly spends less than a buyer who looks every 15 minutes.
        self.assertLess(summary["spent"], summary["manual"][15])

    async def test_fast_day_follows_the_cheat_sheet(self):
        result = await self.run_scenario("fast_day")
        self.assert_no_wrong_actions(result)
        self.assertEqual(result["summary"]["early"], 0, result["summary"])
        self.assertLess(result["summary"]["spent"], result["summary"]["manual"][15])

    async def test_late_conversions_cause_early_stops(self):
        result = await self.run_scenario("late_events")
        self.assertEqual(result["summary"]["extra"], 0, result["summary"])
        self.assertEqual(result["summary"]["double_writes"], 0, result["summary"])

    async def test_undo_restores_and_holds_for_the_day(self):
        result = await self.run_scenario("undo")
        attempts = result["undo"]["attempts"]
        self.assertTrue(attempts[0]["ok"] and not attempts[0]["already_reverted"], attempts)
        self.assertEqual(attempts[0]["posts"], 1)
        self.assertTrue(attempts[1]["ok"] and attempts[1]["already_reverted"], attempts)
        self.assertEqual(attempts[1]["posts"], 0)
        dead = self.row(result, "nl_dead_fast")
        self.assertEqual(dead["final_status"], "ACTIVE")
        self.assertEqual(dead["stop_success_events"], 1)
        self.assertEqual(result["events"].get("UNDO_ACTION:SUCCESS"), 1)

    async def test_meta_429_is_retried(self):
        result = await self.run_scenario("meta_429")
        self.assert_no_wrong_actions(result)
        self.assertEqual(result["events"].get("STOP:ERROR", 0), 0)

    async def test_meta_503_three_times(self):
        result = await self.run_scenario("meta_503")
        self.assertEqual(result["summary"]["double_writes"], 0)
        self.assertEqual(result["events"].get("STOP:ERROR"), 1, result["events"])

    async def test_timeout_before_the_write(self):
        result = await self.run_scenario("timeout_before")
        self.assert_no_wrong_actions(result)

    async def test_timeout_after_the_write(self):
        result = await self.run_scenario("timeout_after")
        self.assert_no_wrong_actions(result)

    async def test_applied_write_whose_retries_all_time_out(self):
        result = await self.run_scenario("timeout_after_all")
        # Meta paused it; Inbox says so and Undo is offered, no error, no repeat.
        self.assert_no_wrong_actions(result)
        self.assertEqual(result["events"].get("STOP:ERROR", 0), 0, result["events"])

    async def test_expired_token_on_a_write(self):
        result = await self.run_scenario("token_expired")
        self.assertEqual(result["meta_changes"], 0)
        self.assertEqual(result["meta_posts"], 1)
        self.assertEqual(result["events"].get("STOP:ERROR"), 1, result["events"])
        self.assertEqual(result["events"].get("TOKEN_EXPIRED:ERROR"), 1, result["events"])
        self.assertFalse(result["account_active"])
        self.assertEqual(result["health"], "critical")

    async def test_undo_whose_write_timed_out_after_meta_applied_it(self):
        result = await self.run_scenario("undo_timeout_after")
        attempts = result["undo"]["attempts"]
        self.assertFalse(attempts[0]["ok"], attempts)
        self.assertEqual(attempts[0]["posts"], 3)
        # The retry sees Meta already undone and records it without a write.
        self.assertTrue(attempts[1]["ok"] and not attempts[1]["already_reverted"], attempts)
        self.assertEqual(attempts[1]["posts"], 0)
        self.assertTrue(attempts[2]["already_reverted"], attempts)
        self.assertEqual(self.row(result, "nl_dead_fast")["final_status"], "ACTIVE")
        self.assertEqual(self.row(result, "nl_dead_fast")["stop_success_events"], 1)


if __name__ == "__main__":
    unittest.main()
