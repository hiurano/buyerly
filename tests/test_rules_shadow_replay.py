"""rules/shadow_replay.py: the reverse shadow run's file handling (#611 stage 4).

The decision itself is checked against the TypeScript cycle on a real
database in server/test/worker/rule-cycle.test.ts.
"""

import gzip
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rules import shadow_replay


class ShadowReplayTest(unittest.IsolatedAsyncioTestCase):
    async def test_off_without_directories(self):
        with tempfile.TemporaryDirectory() as root, mock.patch.dict(os.environ, {"RULES_SHADOW_DIR": root, "RULES_SHADOW_REPLAY_DIR": ""}):
            self.assertEqual(await shadow_replay.replay_pending(), {"requests": 0, "captures": 0, "errors": 0})

    async def test_bad_requests_are_dropped(self):
        with tempfile.TemporaryDirectory() as root:
            requests = Path(root) / "requests"
            requests.mkdir()
            (requests / "0000000000001-a-1.json.gz").write_bytes(gzip.compress(json.dumps({"version": 99}).encode()))
            (requests / "0000000000002-a-2.json.gz").write_bytes(b"not gzip")
            (requests / ".0000000000003-a-3.tmp").write_bytes(b"half written")

            async def never(*_args, **_kwargs):
                raise AssertionError("an unreadable request is not replayed")

            env = {"RULES_SHADOW_REPLAY_DIR": str(requests), "RULES_SHADOW_DIR": str(Path(root) / "captures")}
            with mock.patch.dict(os.environ, env), mock.patch.object(shadow_replay, "replay_request", never):
                self.assertEqual(await shadow_replay.replay_pending(), {"requests": 2, "captures": 0, "errors": 2})
            self.assertEqual(sorted(path.name for path in requests.iterdir()), [".0000000000003-a-3.tmp"])

    async def test_no_write_meta_lands_every_write(self):
        meta = shadow_replay.NoWriteMeta()
        self.assertTrue(await meta.set_adset_status(adset_id="1", status="PAUSED", access_token=""))
        self.assertTrue(await meta.update_adset_budget(adset_id="1", daily_budget=100, access_token=""))


if __name__ == "__main__":
    unittest.main()
