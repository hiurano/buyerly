import unittest
from datetime import datetime

from core.timezones import (
    evaluate_day_boundary,
    resolve_account_clock,
    utc_offset_label,
)


class TestAccountTimezones(unittest.TestCase):
    def test_meta_legacy_hawaii_name_resolves_to_canonical_zone(self):
        clock = resolve_account_clock("US/Hawaii")
        self.assertIsNotNone(clock)
        self.assertEqual(clock.canonical_name, "Pacific/Honolulu")
        local = datetime(2026, 8, 18, 0, 0, tzinfo=clock.zone)
        self.assertEqual(utc_offset_label(local), "UTC−10:00")

    def test_missing_or_invalid_timezone_does_not_fall_back_to_utc(self):
        self.assertIsNone(resolve_account_clock(""))
        self.assertIsNone(resolve_account_clock(None))
        self.assertIsNone(resolve_account_clock("Mars/Olympus_Mons"))

    def test_day_boundary_only_notifies_inside_midnight_window(self):
        at_midnight = evaluate_day_boundary(
            "2026-08-17",
            datetime(2026, 8, 18, 0, 1),
        )
        after_restart = evaluate_day_boundary(
            "2026-08-17",
            datetime(2026, 8, 18, 12, 0),
        )
        first_observation = evaluate_day_boundary(
            "",
            datetime(2026, 8, 18, 12, 0),
        )

        self.assertTrue(at_midnight.should_notify)
        self.assertFalse(after_restart.should_notify)
        self.assertEqual(after_restart.reason, "missed_window")
        self.assertFalse(first_observation.should_notify)
        self.assertEqual(first_observation.reason, "initialized")


if __name__ == "__main__":
    unittest.main()
