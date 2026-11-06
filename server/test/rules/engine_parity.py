"""The rule engine's evaluation over cases read as JSON from stdin.

server/test/rules/engine.test.ts sends [{"fn": name, "args": [...]}, ...] and
compares each answer with the TypeScript port's (src/rules/engine.ts,
src/rules/preview.ts): {"ok": result}, or {"fail": type} when Python raises
(the request fails on both servers then; what it says is not compared).
"""

import dataclasses
import json
import sys
from datetime import datetime
from types import SimpleNamespace

from core import metrics
from core.currency import format_money
from rules.engine import RuleEngine
from services.rule_preview import preview_from_facts


def _account(fields):
    return SimpleNamespace(**fields)


def _result(result):
    data = dataclasses.asdict(result)
    data["action"] = result.action.value
    return data


def _check(entity, account, insights, override):
    return [
        {"rule": check.rule, "outcome": check.outcome, "detail": check.detail}
        for check in RuleEngine.check(entity, _account(account), insights, override)
    ]


def _fact(fields):
    fact = SimpleNamespace(**fields)
    if fact.fetched_at is not None:
        fact.fetched_at = datetime.fromisoformat(fact.fetched_at)
    return fact


def _preview(account, rule, facts, now):
    return preview_from_facts(_account(account), rule, [_fact(fact) for fact in facts], now=datetime.fromisoformat(now))


def _reading(metric, data):
    return dataclasses.asdict(metrics.rule_metric_reading(metric, data))


FUNCTIONS = {
    "check": _check,
    "evaluate": lambda entity, account, insights, override: _result(
        RuleEngine.evaluate(entity, _account(account), insights, override)
    ),
    "evaluateAll": lambda entity, account, insights, override: [
        _result(result) for result in RuleEngine.evaluate_all(entity, _account(account), insights, override)
    ],
    "preview": _preview,
    "ruleMetricReading": _reading,
    "compareMetric": lambda metric, data, operator, target: metrics.compare_metric(
        metrics.rule_metric_reading(metric, data), operator, target
    ),
    "pyFixed": lambda value, digits: f"{value:.{digits}f}",
    "formatMoney": format_money,
}


def answer(case):
    try:
        return {"ok": FUNCTIONS[case["fn"]](*case["args"])}
    except Exception as error:  # noqa: BLE001 - only that it failed is compared
        return {"fail": type(error).__name__}


json.dump([answer(case) for case in json.load(sys.stdin)], sys.stdout)
