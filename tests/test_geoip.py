import unittest
from unittest.mock import patch

import core.geoip as geoip


class TestSessionLocation(unittest.TestCase):
    def test_geolite2_record_reads_like_linear(self):
        record = {
            "city": {"names": {"en": "Helsinki"}},
            "subdivisions": [{"iso_code": "18", "names": {"en": "Uusimaa"}}],
            "country": {"iso_code": "FI", "names": {"en": "Finland"}},
        }
        self.assertEqual(geoip.format_location(record), "Helsinki, 18, FI")

    def test_dbip_record_without_region_code_uses_the_region_name(self):
        record = {
            "city": {"names": {"en": "Helsinki"}},
            "subdivisions": [{"names": {"en": "Uusimaa"}}],
            "country": {"iso_code": "FI"},
        }
        self.assertEqual(geoip.format_location(record), "Helsinki, Uusimaa, FI")

    def test_city_named_like_its_region_is_written_once(self):
        record = {
            "city": {"names": {"en": "Moscow"}},
            "subdivisions": [{"names": {"en": "Moscow"}}],
            "country": {"iso_code": "RU"},
        }
        self.assertEqual(geoip.format_location(record), "Moscow, RU")

    def test_partial_and_empty_records(self):
        self.assertEqual(geoip.format_location({"country": {"iso_code": "FI"}}), "FI")
        self.assertEqual(geoip.format_location({}), "")
        self.assertEqual(geoip.format_location(None), "")

    def test_private_and_malformed_addresses_are_never_looked_up(self):
        with patch.object(geoip, "_reader") as reader:
            for value in ("", "unknown", "10.0.0.1", "172.18.0.3", "127.0.0.1", "::1"):
                self.assertEqual(geoip.locate(value), "")
            reader.assert_not_called()

    def test_missing_database_leaves_location_empty(self):
        geoip._reader.cache_clear()
        try:
            with (
                patch.object(geoip.settings, "GEOIP_DATABASE_PATH", "/nonexistent/city.mmdb"),
                patch.object(geoip, "_placeable", return_value=True),
            ):
                self.assertEqual(geoip.locate("203.0.113.10"), "")
        finally:
            geoip._reader.cache_clear()

    def test_internet_address_is_formatted_from_the_database(self):
        # Documentation addresses stand in for real ones, which never enter the repo.
        class Reader:
            def get(self, ip_value):
                assert ip_value == "203.0.113.10"
                return {"city": {"names": {"en": "Helsinki"}}, "country": {"iso_code": "FI"}}

        with (
            patch.object(geoip, "_reader", return_value=Reader()),
            patch.object(geoip, "_placeable", return_value=True),
        ):
            self.assertEqual(geoip.locate("203.0.113.10"), "Helsinki, FI")


if __name__ == "__main__":
    unittest.main()
