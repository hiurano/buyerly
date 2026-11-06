"""One Python account sync for server/test/worker/account-sync.test.ts.

Reads {"clock": seconds, "account_ids": [...]} from stdin and runs
MonitoringWorker.run_account_sync_cycle on the database in DATABASE_URL
against the Graph API in META_GRAPH_BASE_URL, at that fixed clock. Prints
the cycle's stats as JSON; the test then reads the rows it wrote.
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

    meta = MetaClient(cache_provider=PostgreSQLInventoryCache())
    worker = MonitoringWorker(meta_client=meta, clock=lambda: float(case["clock"]))
    try:
        stats = await worker.run_account_sync_cycle(account_ids=case["account_ids"])
    finally:
        await meta.aclose()
    print(json.dumps(stats))


if __name__ == "__main__":
    logging.basicConfig(level=logging.CRITICAL)
    asyncio.run(main())
