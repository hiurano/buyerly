"""Python rule cycles for server/test/worker/rule-cycle.test.ts.

Reads {"clocks": [seconds, ...], "account_ids": [...]} from stdin and runs
MonitoringWorker.run_rule_cycle once per clock, in order, on the database in
DATABASE_URL against the Graph API in META_GRAPH_BASE_URL. Prints each
cycle's stats as a JSON list; the test then reads the rows they wrote.
"""

import asyncio
import json
import logging
import sys


async def main() -> None:
    case = json.load(sys.stdin)
    from meta_api.client import MetaClient
    from scheduler.worker import MonitoringWorker
    from services.inventory_cache import PostgreSQLInventoryCache

    clock = {"now": 0.0}
    meta = MetaClient(cache_provider=PostgreSQLInventoryCache())
    worker = MonitoringWorker(meta_client=meta, clock=lambda: clock["now"])

    async def no_pause(_seconds: float) -> None:
        return None

    worker._sleep = no_pause
    # Meta's own pacing between requests; the test's Meta answers at once.
    meta._sleep = no_pause
    results = []
    try:
        for now in case["clocks"]:
            clock["now"] = float(now)
            results.append(await worker.run_rule_cycle(account_ids=case["account_ids"]))
    finally:
        await meta.aclose()
    print(json.dumps(results))


if __name__ == "__main__":
    logging.basicConfig(level=logging.CRITICAL)
    asyncio.run(main())
