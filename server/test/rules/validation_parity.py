"""core/metrics.py's rule checks over cases read as JSON from stdin.

server/test/rules/validation.test.ts sends [{"fn": name, "args": [...]}, ...]
and compares each answer with the TypeScript port's: {"ok": result}, or
{"error": message} for a ValueError, or {"crash": type} for anything else.
"""

import json
import sys

from core import metrics

FUNCTIONS = {
    "normalizeRuleConditions": lambda conditions: list(metrics.normalize_rule_conditions(conditions)),
    "normalizeRuntimeRule": lambda rule: list(metrics.normalize_runtime_rule(rule)),
    "validatePublicRuleConditions": metrics.validate_public_rule_conditions,
    "validateRuntimeRule": metrics.validate_runtime_rule,
    "validateRuleSetCompatibility": metrics.validate_rule_set_compatibility,
    "normalizeRuleScope": metrics.normalize_rule_scope,
    "normalizeRuleLevel": metrics.normalize_rule_level,
}


def answer(case):
    try:
        return {"ok": FUNCTIONS[case["fn"]](*case["args"])}
    except ValueError as error:
        return {"error": str(error)}
    except Exception as error:  # noqa: BLE001 - the type is the answer
        return {"crash": type(error).__name__}


json.dump([answer(case) for case in json.load(sys.stdin)], sys.stdout)
