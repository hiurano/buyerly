"""The accounts list's figures, computed by the Python code, for cases read as JSON from stdin.

server/test/accounts/summary.test.ts sends {"round": [[x, ndigits], ...],
"latest": [summary, ...], "today": [{"now": iso, "accounts": [...], "facts": [...]}, ...]}
and compares each answer with the TypeScript port's. Non-finite floats come
back as the strings "nan", "inf" and "-inf" (JSON has no words for them), -0.0 as "-0".
"""

import asyncio
import functools
import json
import math
import sys
from datetime import datetime
from types import SimpleNamespace

from api import deps
from services import analytics_store


def plain(value):
    if isinstance(value, float) and not math.isfinite(value):
        return "nan" if math.isnan(value) else ("inf" if value > 0 else "-inf")
    if isinstance(value, float) and value == 0 and math.copysign(1, value) < 0:
        return "-0"
    if isinstance(value, dict):
        return {key: plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [plain(item) for item in value]
    return value


class FactSession:
    """Answers the report's one query with the case's facts, oldest day first."""

    def __init__(self, facts):
        self.facts = sorted(facts, key=lambda fact: fact.date)

    async def execute(self, _statement):
        facts = self.facts
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: facts))


async def today(case):
    now = datetime.fromisoformat(case["now"].replace("Z", "+00:00"))
    original = analytics_store.resolve_account_period_dates
    analytics_store.resolve_account_period_dates = functools.partial(original, now_utc=now)
    try:
        accounts = [SimpleNamespace(**account) for account in case["accounts"]]
        facts = [SimpleNamespace(**fact) for fact in case["facts"]]
        report = await analytics_store.AnalyticsFactService.get_workspace_summary_report(
            FactSession(facts), 1, "today", accounts
        )
    finally:
        analytics_store.resolve_account_period_dates = original
    metrics = deps._latest_account_metrics_by_id(report)
    return {
        account_id: {key: value for key, value in row.items() if key != "generated_at"}
        for account_id, row in metrics.items()
        if row.get("data_status") == "synced"
    }


def main():
    cases = json.load(sys.stdin)
    answer = {
        "round": [round(value, digits) for value, digits in cases["round"]],
        "latest": [deps._latest_account_metrics_by_id(summary) for summary in cases["latest"]],
        "today": [asyncio.run(today(case)) for case in cases["today"]],
    }
    json.dump(plain(answer), sys.stdout)


if __name__ == "__main__":
    main()
