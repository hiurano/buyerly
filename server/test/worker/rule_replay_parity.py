"""The reverse shadow run for server/test/worker/rule-cycle.test.ts.

Replays every request the TypeScript rule cycle left in
RULES_SHADOW_REPLAY_DIR (rules/shadow_replay.py) on the database in
DATABASE_URL, writing Python's decisions to RULES_SHADOW_DIR, and prints the
pass's stats as JSON.
"""

import asyncio
import json
import logging


async def main() -> None:
    from rules.shadow_replay import replay_pending

    print(json.dumps(await replay_pending(limit=100_000)))


if __name__ == "__main__":
    logging.basicConfig(level=logging.CRITICAL)
    asyncio.run(main())
