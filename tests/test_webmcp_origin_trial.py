"""The WebMCP origin trial token in frontend/index.html (#218, stage 5).

The trial ends on a fixed date. Chrome silently ignores an expired token, so
nothing breaks on its own: this test is the reminder to renew or remove it.
"""

import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = PROJECT_ROOT / "frontend" / "index.html"
ARCHITECTURE = PROJECT_ROOT / "docs" / "ARCHITECTURE.md"
TOKEN_PATTERN = re.compile(r'<meta\s+http-equiv="origin-trial"\s+content="([^"]+)"')


def origin_trial_tokens():
    tokens = []
    for token in TOKEN_PATTERN.findall(INDEX_HTML.read_text(encoding="utf-8")):
        raw = base64.b64decode(token)
        # Version byte, 64-byte signature, 4-byte big-endian payload length, JSON payload.
        length = int.from_bytes(raw[65:69], "big")
        tokens.append(json.loads(raw[69:69 + length]))
    return tokens


class TestWebMcpOriginTrial(unittest.TestCase):
    def test_token_is_for_buyerly_app_and_webmcp(self):
        tokens = origin_trial_tokens()
        if not tokens:
            self.skipTest("No origin trial token: WebMCP needs the Chrome flag again.")
        for payload in tokens:
            self.assertEqual(payload["origin"], "https://buyerly.app:443")
            self.assertEqual(payload["feature"], "WebMCP")

    def test_architecture_names_the_expiry_date(self):
        for payload in origin_trial_tokens():
            expiry = datetime.fromtimestamp(payload["expiry"], tz=timezone.utc).date().isoformat()
            self.assertIn(
                f"до {expiry}",
                ARCHITECTURE.read_text(encoding="utf-8"),
                "docs/ARCHITECTURE.md must say until when the WebMCP origin trial token works.",
            )

    def test_token_has_not_expired(self):
        now = datetime.now(timezone.utc)
        for payload in origin_trial_tokens():
            expiry = datetime.fromtimestamp(payload["expiry"], tz=timezone.utc)
            self.assertGreater(
                expiry,
                now,
                f"The WebMCP origin trial token in frontend/index.html expired on {expiry.date()}. "
                "Renew it at https://developer.chrome.com/origintrials (WebMCP, https://buyerly.app) "
                "or remove the <meta http-equiv=\"origin-trial\"> tag, then update docs/ARCHITECTURE.md "
                "and CHANGELOG.md.",
            )


if __name__ == "__main__":
    unittest.main()
