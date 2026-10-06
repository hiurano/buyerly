import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, Any, List
from database.models import Account
from core.currency import format_money, normalize_currency
from core.metrics import (
    compare_metric,
    cost_per_event,
    normalize_rule_level,
    rule_metric_reading,
    rule_scope_matches_entity,
    validate_rule_set_compatibility,
    validate_runtime_rule,
)

class RuleAction(str, Enum):
    NOOP = "NOOP"                             # Everything is within range
    STOP = "STOP"                             # Stop the ad set (PAUSE)
    NOTIFY_ONLY = "NOTIFY_ONLY"               # Record the match only (nothing is switched off in Meta)
    PROPOSE_REACTIVATE = "PROPOSE_REACTIVATE" # Record a suggestion to turn it back on
    AUTO_REACTIVATE = "AUTO_REACTIVATE"       # Turn it back on automatically (ACTIVE)
    INCREASE_BUDGET = "INCREASE_BUDGET"       # Raise the ad set daily budget by N%
    DECREASE_BUDGET = "DECREASE_BUDGET"       # Lower the ad set daily budget by N%


# What each stored rule `action` does once its conditions match.
RULE_ACTION_BY_TYPE = {
    "turn_off": RuleAction.STOP,
    "notify_only": RuleAction.NOTIFY_ONLY,
    "turn_on": RuleAction.AUTO_REACTIVATE,
    "increase_budget": RuleAction.INCREASE_BUDGET,
    "decrease_budget": RuleAction.DECREASE_BUDGET,
}

@dataclass
class RuleEvaluationResult:
    action: RuleAction
    # The entity the action applies to. For an ad set rule this is the ad set;
    # for a campaign rule it is the campaign. Never mix the two: an audit row
    # naming a campaign id in an ad set field would mislead an incident review.
    entity_id: str
    entity_name: str
    spend: float
    leads: int
    registrations: int
    purchases: int
    cpl: Optional[float]
    cpreg: Optional[float]
    cpp: Optional[float]
    reason: str
    budget_change_percent: float = 0.0
    budget_max_daily: float = 0.0
    cooldown_minutes: int = 0
    rule_id: Optional[int] = None
    rule_name: str = ""
    conditions_snapshot: List[Dict[str, Any]] = field(default_factory=list)
    currency: str = "UNKNOWN"
    entity_level: str = "adset"
    # Parent campaign of an ad set or ad; empty for a campaign-level result.
    campaign_id: str = ""

    @property
    def is_adset(self) -> bool:
        return self.entity_level == "adset"


@dataclass
class RuleCheck:
    """What one rule saw on one entity, matched or not (#322).

    ``outcome`` is ``matched``, ``not_met`` (with the readings that fell
    short in ``detail``) or ``inactive`` (the entity's delivery state rules
    the action out, e.g. a stop rule on a paused campaign). Rules aimed at
    another level or outside their scope leave no check at all.
    """

    rule: Dict[str, Any]
    outcome: str
    detail: str


class RuleEngine:
    """
    Rule engine supporting dynamic conditions (Spend, CPL, CPReg, CPP,
    Leads, Registrations, Purchases, CTR, CPC),
    AND/OR logic, budget-control actions and multiple time windows.
    """

    @staticmethod
    def _eval_condition(metric_val: float, operator: str, target_val: float) -> bool:
        """Backward-compatible helper for callers outside the main evaluator."""
        from core.metrics import MetricReading

        return compare_metric(
            MetricReading(key="value", label="Value", unit="", value=metric_val),
            operator,
            target_val,
        )

    @staticmethod
    def _get_metric_value(metric: str, adset_data: Dict[str, Any]) -> tuple:
        """Return (metric value, human-readable label, unit)."""
        reading = rule_metric_reading(metric, adset_data)
        return reading.value, reading.label, reading.unit

    @staticmethod
    def evaluate(
        entity: Dict[str, Any],
        account: Account,
        insights_by_window: Optional[Dict[str, Dict[str, Any]]] = None,
        active_rules_override: Optional[List[Dict[str, Any]]] = None,
    ) -> RuleEvaluationResult:
        """
        Evaluate an entity (ad set or campaign) against the user's rules,
        supporting AND/OR logic and time windows. Several rules can apply
        to one ad account, with conflicts resolved.

        The dict describes an ad set or a campaign; the level comes from
        ``entity_level``, defaulting to the ad set.
        """
        return RuleEngine._evaluate(
            entity, account, insights_by_window, active_rules_override
        )

    @staticmethod
    def _evaluate(
        entity: Dict[str, Any],
        account: Account,
        insights_by_window: Optional[Dict[str, Dict[str, Any]]],
        active_rules_override: Optional[List[Dict[str, Any]]],
        *,
        all_actions: bool = False,
        checks: Optional[List[RuleCheck]] = None,
    ) -> Any:
        """Return the highest-priority action, or with ``all_actions`` every
        matched rule's result, highest priority first (a NOOP result still
        when nothing matched). ``checks`` collects every applicable rule's
        outcome."""
        entity_level = str(entity.get("entity_level") or "adset")
        entity_id = str(entity.get("entity_id") or entity.get("adset_id") or "")
        entity_name = str(entity.get("entity_name") or entity.get("adset_name") or "")
        campaign_id = str(entity.get("campaign_id") or "")
        status = entity.get("status", "UNKNOWN")
        effective_status = entity.get("effective_status", status)
        spend = float(entity.get("spend", 0.0))
        leads = int(entity.get("leads", 0))
        registrations = int(entity.get("registrations", 0))
        purchases = int(entity.get("purchases", 0))
        cpl = cost_per_event(spend, leads)
        cpreg = cost_per_event(spend, registrations)
        cpp = cost_per_event(spend, purchases)
        is_active = status == "ACTIVE" and effective_status == "ACTIVE"
        currency = normalize_currency(getattr(account, "currency", "UNKNOWN"))

        def noop(reason="Metrics are within range."):
            return RuleEvaluationResult(
                action=RuleAction.NOOP,
                entity_id=entity_id,
                entity_name=entity_name,
                spend=spend,
                leads=leads,
                registrations=registrations,
                purchases=purchases,
                cpl=cpl,
                cpreg=cpreg,
                cpp=cpp,
                reason=reason,
                cooldown_minutes=0,
                currency=currency,
                entity_level=entity_level,
                campaign_id=campaign_id,
            )

        if not getattr(account, "rules_enabled", False):
            return noop("Rules are switched off for this ad account.")

        if active_rules_override is not None:
            active_rules = active_rules_override
        else:
            raw_rules = getattr(account, "active_rules", "[]")
            try:
                active_rules = json.loads(raw_rules) if isinstance(raw_rules, str) else raw_rules
            except Exception:
                active_rules = []

        if not active_rules or not isinstance(active_rules, list) or len(active_rules) == 0:
            return noop("No rules are configured.")

        account_workspace_id = getattr(account, "workspace_id", None)
        if account_workspace_id is not None:
            active_rules = [
                rule
                for rule in active_rules
                if isinstance(rule, dict)
                and rule.get("workspace_id") == account_workspace_id
            ]
            if not active_rules:
                return noop("This workspace's rules are not configured.")

        try:
            validate_rule_set_compatibility(active_rules)
        except (TypeError, ValueError) as error:
            return noop(f"Automation halted: {error}")

        def get_action_priority(action: RuleAction) -> int:
            priorities = {
                RuleAction.STOP: 100,
                RuleAction.DECREASE_BUDGET: 90,
                RuleAction.INCREASE_BUDGET: 80,
                RuleAction.AUTO_REACTIVATE: 70,
                RuleAction.PROPOSE_REACTIVATE: 60,
                RuleAction.NOTIFY_ONLY: 50,
                RuleAction.NOOP: 0
            }
            return priorities.get(action, 0)

        triggered_actions = []
        invalid_rule_seen = False

        for rule in active_rules:
            if rule.get("enabled", True) is False or rule.get("needs_review", False) is True:
                continue
            # A rule only ever sees the level it executes on, so a campaign rule
            # never reads ad set metrics and vice versa.
            try:
                if normalize_rule_level(rule.get("level")) != entity_level:
                    continue
            except ValueError:
                invalid_rule_seen = True
                continue
            # A rule aimed at one campaign must leave the rest of the account alone.
            if not rule_scope_matches_entity(rule.get("scope"), entity):
                continue
            try:
                validate_runtime_rule(rule)
            except (TypeError, ValueError):
                invalid_rule_seen = True
                continue
            action_type = rule.get("action")
            if action_type == "turn_on":
                if status != "PAUSED":
                    if checks is not None:
                        checks.append(RuleCheck(rule, "inactive", "Not paused"))
                    continue
            elif not is_active:
                if checks is not None:
                    checks.append(RuleCheck(rule, "inactive", "Not active"))
                continue

            conditions = rule.get("conditions", [])
            if not conditions:
                continue

            condition_logic = rule.get("logic", "and")

            matched_reasons = []
            unmet_reasons = []
            any_match = False
            all_match = True

            for cond in conditions:
                metric = cond.get("metric", "spend")
                operator = cond.get("operator", "gte")
                target_val = float(cond.get("value", 0.0))
                time_window = cond.get("time_window", "today")

                if time_window != "today" and insights_by_window and time_window in insights_by_window:
                    source_data = insights_by_window[time_window]
                else:
                    source_data = entity

                reading = rule_metric_reading(metric, source_data)
                metric_val, metric_name, unit = reading.value, reading.label, reading.unit

                op_symbol = {
                    "gt": ">",
                    "gte": "≥",
                    "lt": "<",
                    "lte": "≤",
                    "eq": "=",
                }.get(operator, operator)
                
                window_label = ""
                if time_window != "today":
                    window_labels = {"yesterday": "Yesterday", "last_3d": "3 days", "last_7d": "7 days"}
                    window_label = f" [{window_labels.get(time_window, time_window)}]"

                if metric_val is None:
                    all_match = False
                    unmet_reasons.append(f"{metric_name}{window_label}: no data")
                    continue
                if unit == "currency":
                    val_fmt = format_money(metric_val, currency)
                    tgt_fmt = format_money(target_val, currency)
                elif unit == "%":
                    val_fmt = f"{metric_val:.2f}%"
                    tgt_fmt = f"{target_val:.2f}%"
                else:
                    val_fmt = f"{int(metric_val)}"
                    tgt_fmt = f"{int(target_val)}"

                matches = compare_metric(reading, operator, target_val)

                if matches:
                    any_match = True
                    matched_reasons.append(f"{metric_name}{window_label} ({val_fmt}) {op_symbol} {tgt_fmt}")
                else:
                    all_match = False
                    unmet_reasons.append(
                        f"{metric_name}{window_label} {val_fmt}, needs {op_symbol} {tgt_fmt}"
                    )

            triggered = any_match if condition_logic == "or" else all_match

            if checks is not None:
                checks.append(
                    RuleCheck(
                        rule,
                        "matched" if triggered else "not_met",
                        ", ".join(matched_reasons if triggered else unmet_reasons),
                    )
                )

            if triggered:
                rule_action = RULE_ACTION_BY_TYPE.get(action_type)
                if rule_action is None:
                    invalid_rule_seen = True
                    continue

                rule_name = rule.get("name", "Unknown Rule")
                reason_str = f"[{rule_name}] " + ", ".join(matched_reasons)
                
                triggered_actions.append({
                    "action": rule_action,
                    "reason": reason_str,
                    "budget_change": float(rule.get("budget_change_percent", 0.0)),
                    "budget_max": float(rule.get("budget_max_daily", 0.0)),
                    "cooldown_minutes": int(rule.get("cooldown_minutes", 0)),
                    "rule_id": rule.get("preset_id"),
                    "rule_name": rule_name,
                    "conditions": conditions,
                    "priority": get_action_priority(rule_action)
                })

        if not triggered_actions:
            return noop(
                "Rules are missing or invalid; no actions were sent to Meta."
                if invalid_rule_seen
                else "Metrics are within range."
            )

        # Sort by priority descending; the sort is stable, so rules with the
        # same action keep their order.
        triggered_actions.sort(key=lambda x: x["priority"], reverse=True)

        def result(triggered: Dict[str, Any], reason: str) -> RuleEvaluationResult:
            return RuleEvaluationResult(
                action=triggered["action"],
                entity_id=entity_id,
                entity_name=entity_name,
                spend=spend,
                leads=leads,
                registrations=registrations,
                purchases=purchases,
                cpl=cpl,
                cpreg=cpreg,
                cpp=cpp,
                reason=reason,
                budget_change_percent=triggered["budget_change"],
                budget_max_daily=triggered["budget_max"],
                cooldown_minutes=triggered["cooldown_minutes"],
                rule_id=triggered["rule_id"],
                rule_name=triggered["rule_name"],
                conditions_snapshot=triggered["conditions"],
                currency=currency,
                entity_level=entity_level,
                campaign_id=campaign_id,
            )

        if all_actions:
            return [result(t, t["reason"]) for t in triggered_actions]
        combined_reason = " | ".join(t["reason"] for t in triggered_actions)
        return result(triggered_actions[0], combined_reason)

    @staticmethod
    def evaluate_all(
        entity: Dict[str, Any],
        account: Account,
        insights_by_window: Optional[Dict[str, Dict[str, Any]]] = None,
        active_rules_override: Optional[List[Dict[str, Any]]] = None,
    ) -> List[RuleEvaluationResult]:
        """Every rule action due on the entity, in the order to try them.

        A notify-only rule changes nothing in Meta, so it never competes with
        another rule: each one gets its own result and keeps its own cooldown.
        Actions that change the entity compete: only the strongest kind of
        action that matched is returned (STOP over a budget cut, a budget cut
        over a raise), one result per rule of that kind. The caller runs the
        first of them not on cooldown, so a rule waiting out its cooldown hands
        over to another rule doing the same thing, never to a weaker action.

        Changes come first, then alerts. An empty list means nothing matched.
        """
        results = RuleEngine._evaluate(
            entity,
            account,
            insights_by_window,
            active_rules_override,
            all_actions=True,
        )
        if isinstance(results, RuleEvaluationResult):
            return []
        changes = [r for r in results if r.action != RuleAction.NOTIFY_ONLY]
        alerts = [r for r in results if r.action == RuleAction.NOTIFY_ONLY]
        if changes:
            changes = [r for r in changes if r.action == changes[0].action]
        return changes + alerts

    @staticmethod
    def check(
        entity: Dict[str, Any],
        account: Account,
        insights_by_window: Optional[Dict[str, Dict[str, Any]]] = None,
        active_rules_override: Optional[List[Dict[str, Any]]] = None,
    ) -> List[RuleCheck]:
        """How each rule aimed at the entity fared on this read (#322).

        Unlike ``evaluate_all`` this keeps the rules that did not match, with
        the readings that fell short, so a buyer can see why a rule is quiet.
        Nothing here decides an action.
        """
        checks: List[RuleCheck] = []
        RuleEngine._evaluate(
            entity,
            account,
            insights_by_window,
            active_rules_override,
            all_actions=True,
            checks=checks,
        )
        return checks
