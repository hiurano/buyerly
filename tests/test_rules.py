import json
import unittest
from core.metrics import (
    normalize_rule_level,
    normalize_rule_scope,
    rule_scope_matches_entity,
    validate_rule_semantics,
    validate_rule_set_compatibility,
    validate_runtime_rule,
)
from database.models import Account
from rules.engine import RuleEngine, RuleAction
from scheduler.worker import MonitoringWorker

class TestRuleEngine(unittest.TestCase):

    def setUp(self):
        self.account = Account(
            account_id="act_test_123",
            name="Test ad account",
            access_token="mock_token",
            timezone_name="UTC",
            currency="USD",
            rules_enabled=True,
            active_rules="[]",
        )

    def set_rule(
        self,
        *,
        action="turn_off",
        conditions=None,
        logic="and",
        budget_change_percent=0.0,
        budget_max_daily=0.0,
        scope=None,
    ):
        """Configure one rule using the current multi-rule account schema."""
        rule = {
            "preset_id": 1,
            "name": "Test rule",
            "action": action,
            "conditions": conditions or [],
            "logic": logic,
            "cooldown_minutes": 0,
            "notify_tg": True,
            "budget_change_percent": budget_change_percent,
            "budget_max_daily": budget_max_daily,
        }
        if scope is not None:
            rule["scope"] = scope
        self.account.active_rules = json.dumps([rule])

    # --------------------------------------------------------
    # Baseline: no conditions, inactive ad set
    # --------------------------------------------------------

    def test_no_conditions_returns_noop(self):
        """With no conditions configured the result is NOOP."""
        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 100.0, "leads": 0, "registrations": 0}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.NOOP)
        self.assertIn("No rules are configured", res.reason)

    def test_unknown_action_fails_closed_instead_of_stopping(self):
        self.set_rule(
            action="delete_account",
            conditions=[{"metric": "spend", "operator": "gte", "value": 1.0}],
        )
        adset = {
            "adset_id": "1",
            "adset_name": "Test",
            "status": "ACTIVE",
            "effective_status": "ACTIVE",
            "spend": 100.0,
            "leads": 0,
            "registrations": 0,
        }
        result = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(result.action, RuleAction.NOOP)
        self.assertIn("invalid", result.reason)

    def test_invalid_logic_window_and_non_finite_value_fail_closed(self):
        adset = {
            "adset_id": "1",
            "adset_name": "Test",
            "status": "ACTIVE",
            "effective_status": "ACTIVE",
            "spend": 100.0,
            "leads": 0,
            "registrations": 0,
        }
        invalid_rules = [
            {
                "action": "turn_off",
                "logic": "xor",
                "conditions": [{"metric": "spend", "operator": "gte", "value": 1.0}],
            },
            {
                "action": "turn_off",
                "logic": "and",
                "conditions": [
                    {"metric": "spend", "operator": "gte", "value": 1.0, "time_window": "lifetime"}
                ],
            },
            {
                "action": "turn_off",
                "logic": "and",
                "conditions": [{"metric": "spend", "operator": "gte", "value": float("nan")}],
            },
        ]
        for invalid_rule in invalid_rules:
            self.account.active_rules = json.dumps([{**invalid_rule, "preset_id": 99, "name": "Invalid"}])
            self.assertEqual(RuleEngine.evaluate(adset, self.account).action, RuleAction.NOOP)

    def test_inactive_adset_is_ignored_by_turn_off(self):
        """A paused ad set must not receive actions intended for active delivery."""
        self.set_rule(conditions=[{"metric": "spend", "operator": "gte", "value": 1.0}])
        adset = {"adset_id": "1", "adset_name": "Test", "status": "PAUSED", "spend": 100.0, "leads": 0, "registrations": 0}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.NOOP)

    # --------------------------------------------------------
    # Metric: spend
    # --------------------------------------------------------

    def test_spend_gte_turn_off(self):
        """Spend >= $15 → STOP."""
        self.set_rule(
            action="turn_off",
            conditions=[{"metric": "spend", "operator": "gte", "value": 15.0}],
        )
        
        adset_under = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 10.0, "leads": 2, "registrations": 0}
        self.assertEqual(RuleEngine.evaluate(adset_under, self.account).action, RuleAction.NOOP)

        adset_over = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 15.5, "leads": 2, "registrations": 0}
        res = RuleEngine.evaluate(adset_over, self.account)
        self.assertEqual(res.action, RuleAction.STOP)
        self.assertIn("Spend (15.50 USD) ≥ 15.00 USD", res.reason)

    # --------------------------------------------------------
    # Metric: cpl (cost per lead)
    # --------------------------------------------------------

    def test_cpl_notify_only(self):
        """CPL >= $7 → NOTIFY_ONLY."""
        self.set_rule(
            action="notify_only",
            conditions=[{"metric": "cpl", "operator": "gte", "value": 7.0}],
        )
        
        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 20.0, "leads": 2, "registrations": 0}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.NOTIFY_ONLY)
        self.assertIn("Cost per lead (CPL) (10.00 USD) ≥ 7.00 USD", res.reason)

    # --------------------------------------------------------
    # Metric: leads (lead count)
    # --------------------------------------------------------

    def test_leads_count_metric(self):
        """Leads > 3 AND CPL < $5 -> STOP."""
        self.set_rule(
            conditions=[
                {"metric": "leads", "operator": "gte", "value": 3.0},
                {"metric": "cpl", "operator": "lt", "value": 5.0},
            ]
        )
        
        # 4 leads, CPL = $3 → match
        adset_match = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 12.0, "leads": 4, "registrations": 0}
        self.assertEqual(RuleEngine.evaluate(adset_match, self.account).action, RuleAction.STOP)

        # 2 leads — not >= 3 → NOOP
        adset_no_match = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 6.0, "leads": 2, "registrations": 0}
        self.assertEqual(RuleEngine.evaluate(adset_no_match, self.account).action, RuleAction.NOOP)

    # --------------------------------------------------------
    # Removed metric: the combined CPA
    # --------------------------------------------------------

    def test_legacy_cpa_never_triggers(self):
        """The legacy CPA must not change Meta until a new metric is chosen by hand."""
        self.set_rule(conditions=[{"metric": "cpa", "operator": "gte", "value": 10.0}])

        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 22.0, "leads": 1, "registrations": 1}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.NOOP)

    def test_cpp_metric(self):
        """CPP remains available for non-destructive actions."""
        self.set_rule(
            action="notify_only",
            conditions=[{"metric": "cpp", "operator": "gt", "value": 10.0}],
        )
        adset = {
            "adset_id": "1",
            "adset_name": "Test",
            "status": "ACTIVE",
            "spend": 22.0,
            "leads": 1,
            "registrations": 1,
            "purchases": 2,
        }
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.NOTIFY_ONLY)
        self.assertIn("Cost per purchase (CPP) (11.00 USD) > 10.00 USD", res.reason)

    def test_lead_stop_executes_even_when_registration_exists(self):
        """Explicit STOP conditions are honored even when registrations or purchases exist."""
        self.set_rule(
            conditions=[
                {"metric": "spend", "operator": "gte", "value": 2.0},
                {"metric": "leads", "operator": "lte", "value": 1.0},
            ]
        )
        adset = {
            "adset_id": "1",
            "adset_name": "Test",
            "status": "ACTIVE",
            "effective_status": "ACTIVE",
            "spend": 6.0,
            "leads": 1,
            "registrations": 1,
            "purchases": 0,
        }

        result = RuleEngine.evaluate(adset, self.account)

        self.assertEqual(result.action, RuleAction.STOP)

    def test_lead_stop_executes_even_when_purchase_exists(self):
        self.set_rule(
            conditions=[
                {"metric": "spend", "operator": "gte", "value": 2.0},
                {"metric": "leads", "operator": "eq", "value": 0.0},
            ]
        )
        adset = {
            "adset_id": "1",
            "adset_name": "Test",
            "status": "ACTIVE",
            "effective_status": "ACTIVE",
            "spend": 6.0,
            "leads": 0,
            "registrations": 0,
            "purchases": 1,
        }

        result = RuleEngine.evaluate(adset, self.account)

        self.assertEqual(result.action, RuleAction.STOP)

    def test_explicit_deep_funnel_stop_executes(self):
        """Explicit deep-funnel STOP conditions (e.g. CPReg or Registrations limit) are evaluated."""
        self.set_rule(
            conditions=[
                {"metric": "spend", "operator": "gte", "value": 20.0},
                {"metric": "registrations", "operator": "lte", "value": 1.0},
            ]
        )
        adset = {
            "adset_id": "1",
            "adset_name": "Test",
            "status": "ACTIVE",
            "effective_status": "ACTIVE",
            "spend": 25.0,
            "leads": 2,
            "registrations": 1,
            "purchases": 0,
        }

        result = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(result.action, RuleAction.STOP)

    def test_zero_event_cost_is_unavailable(self):
        """Zero leads must not turn Spend into CPL, or trigger scaling."""
        self.set_rule(
            action="increase_budget",
            conditions=[{"metric": "cpl", "operator": "lt", "value": 10.0}],
            budget_change_percent=20.0,
        )
        adset = {
            "adset_id": "1",
            "adset_name": "Test",
            "status": "ACTIVE",
            "spend": 5.0,
            "leads": 0,
            "registrations": 0,
            "purchases": 0,
        }
        result = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(result.action, RuleAction.NOOP)
        self.assertIsNone(result.cpl)

    def test_zero_spend_with_event_has_zero_cost(self):
        """A genuine zero CPL is not conflated with a missing value."""
        self.set_rule(
            action="notify_only",
            conditions=[{"metric": "cpl", "operator": "eq", "value": 0.0}],
        )
        adset = {
            "adset_id": "1",
            "adset_name": "Test",
            "status": "ACTIVE",
            "spend": 0.0,
            "leads": 1,
            "registrations": 0,
            "purchases": 0,
        }
        result = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(result.action, RuleAction.NOTIFY_ONLY)
        self.assertEqual(result.cpl, 0.0)

    # --------------------------------------------------------
    # Metric: ctr
    # --------------------------------------------------------

    def test_ctr_metric(self):
        """CTR < 1.0% → NOTIFY_ONLY."""
        self.set_rule(
            action="notify_only",
            conditions=[{"metric": "ctr", "operator": "lt", "value": 1.0}],
        )
        
        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 10.0, "leads": 0, "registrations": 0, "impressions": 200, "clicks": 1}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.NOTIFY_ONLY)
        self.assertIn("CTR", res.reason)

    # --------------------------------------------------------
    # AND logic (every condition must match)
    # --------------------------------------------------------

    def test_and_logic_all_match(self):
        """AND: Spend >= $10 AND CPReg >= $5 → NOTIFY_ONLY."""
        self.set_rule(
            action="notify_only",
            logic="and",
            conditions=[
                {"metric": "spend", "operator": "gte", "value": 10.0},
                {"metric": "cpreg", "operator": "gte", "value": 5.0},
            ],
        )
        
        adset_match = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 12.0, "leads": 0, "registrations": 1}
        self.assertEqual(
            RuleEngine.evaluate(adset_match, self.account).action,
            RuleAction.NOTIFY_ONLY,
        )

        adset_no_match = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 8.0, "leads": 0, "registrations": 1}
        self.assertEqual(RuleEngine.evaluate(adset_no_match, self.account).action, RuleAction.NOOP)

    def test_strict_and_inclusive_operators_differ_at_boundary(self):
        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 10.0, "leads": 1, "registrations": 0}

        self.set_rule(conditions=[{"metric": "spend", "operator": "gt", "value": 10.0}])
        self.assertEqual(RuleEngine.evaluate(adset, self.account).action, RuleAction.NOOP)

        self.set_rule(conditions=[{"metric": "spend", "operator": "gte", "value": 10.0}])
        self.assertEqual(RuleEngine.evaluate(adset, self.account).action, RuleAction.STOP)

        self.set_rule(conditions=[{"metric": "spend", "operator": "lt", "value": 10.0}])
        self.assertEqual(RuleEngine.evaluate(adset, self.account).action, RuleAction.NOOP)

        self.set_rule(conditions=[{"metric": "spend", "operator": "lte", "value": 10.0}])
        self.assertEqual(RuleEngine.evaluate(adset, self.account).action, RuleAction.STOP)

    # --------------------------------------------------------
    # OR logic (one matching condition is enough)
    # --------------------------------------------------------

    def test_or_logic_one_match(self):
        """OR: Spend >= $20 OR Leads >= 5 → STOP. Only spend matched."""
        self.set_rule(
            logic="or",
            conditions=[
                {"metric": "spend", "operator": "gte", "value": 20.0},
                {"metric": "leads", "operator": "gte", "value": 5.0},
            ],
        )
        
        # Spend $25 (>= 20), leads = 1 (not >= 5) → OR → STOP
        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 25.0, "leads": 1, "registrations": 0}
        self.assertEqual(RuleEngine.evaluate(adset, self.account).action, RuleAction.STOP)

    def test_or_logic_no_match(self):
        """OR: nothing matched -> NOOP."""
        self.set_rule(
            logic="or",
            conditions=[
                {"metric": "spend", "operator": "gte", "value": 20.0},
                {"metric": "leads", "operator": "gte", "value": 5.0},
            ],
        )
        
        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 10.0, "leads": 2, "registrations": 0}
        self.assertEqual(RuleEngine.evaluate(adset, self.account).action, RuleAction.NOOP)

    # --------------------------------------------------------
    # Action: increase_budget
    # --------------------------------------------------------

    def test_increase_budget_action(self):
        """CPL < $5 -> INCREASE_BUDGET with a percentage and a cap."""
        self.set_rule(
            action="increase_budget",
            conditions=[{"metric": "cpl", "operator": "lt", "value": 5.0}],
            budget_change_percent=20.0,
            budget_max_daily=500.0,
        )
        
        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 8.0, "leads": 3, "registrations": 0}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.INCREASE_BUDGET)
        self.assertEqual(res.budget_change_percent, 20.0)
        self.assertEqual(res.budget_max_daily, 500.0)

    # --------------------------------------------------------
    # Action: decrease_budget
    # --------------------------------------------------------

    def test_decrease_budget_action(self):
        """CPL >= $15 → DECREASE_BUDGET."""
        self.set_rule(
            action="decrease_budget",
            conditions=[{"metric": "cpl", "operator": "gte", "value": 15.0}],
            budget_change_percent=30.0,
        )
        
        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 45.0, "leads": 2, "registrations": 0}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.DECREASE_BUDGET)
        self.assertEqual(res.budget_change_percent, 30.0)

    # --------------------------------------------------------
    # Action: turn_on (reactivation)
    # --------------------------------------------------------

    def test_turn_on_action(self):
        """turn_on → AUTO_REACTIVATE."""
        self.set_rule(
            action="turn_on",
            conditions=[{"metric": "leads", "operator": "gte", "value": 1.0}],
        )
        
        adset = {"adset_id": "1", "adset_name": "Test", "status": "PAUSED", "spend": 5.0, "leads": 2, "registrations": 0}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.AUTO_REACTIVATE)

    def test_turn_on_does_not_touch_active_adset(self):
        self.set_rule(
            action="turn_on",
            conditions=[{"metric": "leads", "operator": "gte", "value": 1.0}],
        )

        adset = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 5.0, "leads": 2, "registrations": 0}
        res = RuleEngine.evaluate(adset, self.account)
        self.assertEqual(res.action, RuleAction.NOOP)

    # --------------------------------------------------------
    # Time window: insights_by_window is passed through
    # --------------------------------------------------------

    def test_time_window_yesterday(self):
        """A condition with time_window='yesterday' reads from insights_by_window."""
        self.set_rule(
            conditions=[
                {"metric": "spend", "operator": "gte", "value": 50.0, "time_window": "yesterday"}
            ]
        )
        
        adset_today = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 5.0, "leads": 0, "registrations": 0}
        adset_yesterday = {"spend": 55.0, "leads": 3, "registrations": 1}
        
        insights = {"yesterday": adset_yesterday}
        
        res = RuleEngine.evaluate(adset_today, self.account, insights_by_window=insights)
        self.assertEqual(res.action, RuleAction.STOP)
        self.assertIn("[Yesterday]", res.reason)

    def test_time_window_fallback_to_today(self):
        """When insights_by_window lacks the window, today's data is used."""
        self.set_rule(
            conditions=[
                {"metric": "spend", "operator": "gte", "value": 10.0, "time_window": "last_3d"}
            ]
        )
        
        adset_today = {"adset_id": "1", "adset_name": "Test", "status": "ACTIVE", "spend": 15.0, "leads": 0, "registrations": 0}
        
        # No insights_by_window → fallback to today data
        res = RuleEngine.evaluate(adset_today, self.account)
        self.assertEqual(res.action, RuleAction.STOP)

    def test_cpreg_and_cpp_turn_off_validation_allowed(self):
        """Validating turn_off action with cpreg / cpp must succeed without throwing."""
        validate_rule_semantics(
            [{"metric": "cpreg", "operator": "gte", "value": 15.0}],
            logic="and",
            action="turn_off",
        )
        validate_rule_semantics(
            [{"metric": "cpp", "operator": "gt", "value": 30.0}],
            logic="and",
            action="turn_off",
        )

    # --------------------------------------------------------
    # Scope: which ad sets a rule is allowed to touch
    # --------------------------------------------------------

    def _triggering_adset(self, adset_id="1", campaign_id="camp_a"):
        return {
            "adset_id": adset_id,
            "adset_name": "Test",
            "campaign_id": campaign_id,
            "status": "ACTIVE",
            "effective_status": "ACTIVE",
            "spend": 100.0,
            "leads": 0,
            "registrations": 0,
            "purchases": 0,
        }

    def test_campaign_scope_only_touches_its_own_campaign(self):
        conditions = [{"metric": "spend", "operator": "gte", "value": 50.0}]
        self.set_rule(
            conditions=conditions,
            scope={"level": "campaign", "ids": ["camp_a"]},
        )

        inside = RuleEngine.evaluate(self._triggering_adset(campaign_id="camp_a"), self.account)
        outside = RuleEngine.evaluate(self._triggering_adset(campaign_id="camp_b"), self.account)

        self.assertEqual(inside.action, RuleAction.STOP)
        self.assertEqual(outside.action, RuleAction.NOOP)

    def test_adset_with_unknown_campaign_is_never_caught_by_campaign_scope(self):
        """A row from an inventory cache written before campaign_id was collected."""
        self.set_rule(
            conditions=[{"metric": "spend", "operator": "gte", "value": 50.0}],
            scope={"level": "campaign", "ids": ["camp_a"]},
        )
        stale = self._triggering_adset()
        del stale["campaign_id"]

        self.assertEqual(RuleEngine.evaluate(stale, self.account).action, RuleAction.NOOP)

    def test_adset_scope_targets_one_adset(self):
        self.set_rule(
            conditions=[{"metric": "spend", "operator": "gte", "value": 50.0}],
            scope={"level": "adset", "ids": ["1"]},
        )

        self.assertEqual(
            RuleEngine.evaluate(self._triggering_adset(adset_id="1"), self.account).action,
            RuleAction.STOP,
        )
        self.assertEqual(
            RuleEngine.evaluate(self._triggering_adset(adset_id="2"), self.account).action,
            RuleAction.NOOP,
        )

    def test_missing_scope_keeps_the_historical_account_wide_behaviour(self):
        self.set_rule(conditions=[{"metric": "spend", "operator": "gte", "value": 50.0}])

        self.assertEqual(
            RuleEngine.evaluate(self._triggering_adset(campaign_id="anything"), self.account).action,
            RuleAction.STOP,
        )

    def test_malformed_scope_fails_closed(self):
        self.set_rule(
            conditions=[{"metric": "spend", "operator": "gte", "value": 50.0}],
            scope={"level": "galaxy", "ids": ["camp_a"]},
        )

        self.assertEqual(
            RuleEngine.evaluate(self._triggering_adset(), self.account).action,
            RuleAction.NOOP,
        )


class TestRuleExecutionLevel(unittest.TestCase):
    def setUp(self):
        self.account = Account(
            account_id="act_test_123",
            name="Test ad account",
            access_token="mock_token",
            timezone_name="UTC",
            currency="USD",
            rules_enabled=True,
            active_rules="[]",
        )

    def _rule(self, level, **overrides):
        rule = {
            "preset_id": 1,
            "name": f"{level} rule",
            "action": "turn_off",
            "level": level,
            "conditions": [{"metric": "spend", "operator": "gte", "value": 50.0}],
            "logic": "and",
            "cooldown_minutes": 0,
            "notify_tg": True,
        }
        rule.update(overrides)
        return rule

    def _entity(self, level, entity_id):
        return {
            "entity_level": level,
            "entity_id": entity_id,
            "entity_name": f"{level} {entity_id}",
            "campaign_id": entity_id if level == "campaign" else "camp_a",
            "adset_id": "as_1" if level == "ad" else "",
            "status": "ACTIVE",
            "effective_status": "ACTIVE",
            "spend": 100.0,
            "leads": 0,
            "registrations": 0,
            "purchases": 0,
        }

    def test_a_rule_only_acts_on_its_own_level(self):
        self.account.active_rules = json.dumps([self._rule("campaign")])

        self.assertEqual(
            RuleEngine.evaluate(self._entity("campaign", "camp_a"), self.account).action,
            RuleAction.STOP,
        )
        # The same spend on an ad set must not trigger a campaign rule.
        self.assertEqual(
            RuleEngine.evaluate(self._entity("adset", "as_1"), self.account).action,
            RuleAction.NOOP,
        )

    def test_result_names_the_entity_it_acted_on(self):
        self.account.active_rules = json.dumps([self._rule("campaign")])
        result = RuleEngine.evaluate(self._entity("campaign", "camp_a"), self.account)

        self.assertEqual(result.entity_level, "campaign")
        self.assertEqual(result.entity_id, "camp_a")
        self.assertFalse(result.is_adset)

    def test_a_rule_without_a_level_still_runs_on_adsets(self):
        rule = self._rule("adset")
        del rule["level"]
        self.account.active_rules = json.dumps([rule])

        self.assertEqual(
            RuleEngine.evaluate(self._entity("adset", "as_1"), self.account).action,
            RuleAction.STOP,
        )

    def test_budget_actions_are_rejected_outside_the_adset_level(self):
        with self.assertRaises(ValueError):
            validate_runtime_rule(
                self._rule(
                    "campaign",
                    action="increase_budget",
                    budget_change_percent=20.0,
                    budget_max_daily=100.0,
                )
            )
        # The same rule is fine on an ad set.
        validate_runtime_rule(
            self._rule(
                "adset",
                action="increase_budget",
                budget_change_percent=20.0,
                budget_max_daily=100.0,
            )
        )

    def test_unknown_level_is_rejected(self):
        with self.assertRaises(ValueError):
            normalize_rule_level("account")
        self.assertEqual(normalize_rule_level(None), "adset")

    def test_an_ad_rule_leaves_its_adset_and_campaign_alone(self):
        self.account.active_rules = json.dumps([self._rule("ad")])

        self.assertEqual(
            RuleEngine.evaluate(self._entity("ad", "ad_1"), self.account).action,
            RuleAction.STOP,
        )
        for level in ("adset", "campaign"):
            self.assertEqual(
                RuleEngine.evaluate(self._entity(level, "x"), self.account).action,
                RuleAction.NOOP,
                level,
            )

    def test_budget_actions_are_rejected_on_ads_too(self):
        with self.assertRaises(ValueError):
            validate_runtime_rule(
                self._rule(
                    "ad",
                    action="increase_budget",
                    budget_change_percent=20.0,
                    budget_max_daily=100.0,
                )
            )


class TestCampaignRollup(unittest.TestCase):
    """Campaign metrics are summed from ad sets instead of re-read from Meta."""

    def _adset(self, adset_id, campaign_id, **metrics):
        row = {
            "adset_id": adset_id,
            "adset_name": adset_id,
            "campaign_id": campaign_id,
            "spend": 0.0,
            "leads": 0,
            "registrations": 0,
            "purchases": 0,
            "clicks": 0,
            "impressions": 0,
        }
        row.update(metrics)
        return row

    def test_metrics_are_summed_and_derived_metrics_recomputed(self):
        adsets = [
            self._adset("a1", "c1", spend=30.0, leads=2, clicks=10, impressions=1000),
            self._adset("a2", "c1", spend=10.0, leads=0, clicks=10, impressions=1000),
        ]
        campaigns = [
            {
                "campaign_id": "c1",
                "campaign_name": "Scale",
                "status": "ACTIVE",
                "effective_status": "ACTIVE",
            }
        ]

        entities, windows = MonitoringWorker._campaign_entities(adsets, campaigns, {})
        campaign = entities[0]

        self.assertEqual(campaign["entity_level"], "campaign")
        self.assertEqual(campaign["entity_name"], "Scale")
        self.assertEqual(campaign["spend"], 40.0)
        self.assertEqual(campaign["leads"], 2)
        # Derived from the totals, not averaged from the ad sets.
        self.assertEqual(campaign["cpc"], 2.0)
        self.assertEqual(campaign["ctr"], 1.0)
        self.assertEqual(windows, {})

    def test_identity_and_status_come_from_the_campaign_not_its_adsets(self):
        adsets = [self._adset("a1", "c1", spend=30.0)]
        campaigns = [
            {
                "campaign_id": "c1",
                "campaign_name": "Paused scale",
                "status": "PAUSED",
                "effective_status": "PAUSED",
            }
        ]

        campaign = MonitoringWorker._campaign_entities(adsets, campaigns, {})[0][0]

        self.assertEqual(campaign["status"], "PAUSED")
        self.assertEqual(campaign["effective_status"], "PAUSED")

    def test_adsets_with_an_unknown_campaign_are_left_out(self):
        adsets = [
            self._adset("a1", "c1", spend=30.0),
            self._adset("a2", "", spend=500.0),
        ]
        campaigns = [
            {"campaign_id": "c1", "campaign_name": "Scale", "status": "ACTIVE"}
        ]

        campaign = MonitoringWorker._campaign_entities(adsets, campaigns, {})[0][0]

        self.assertEqual(campaign["spend"], 30.0)

    def test_time_windows_are_rolled_up_per_campaign(self):
        adsets = [
            self._adset("a1", "c1"),
            self._adset("a2", "c1"),
        ]
        campaigns = [
            {"campaign_id": "c1", "campaign_name": "Scale", "status": "ACTIVE"}
        ]
        insights_by_window = {
            "yesterday": {
                "a1": {"spend": 5.0, "leads": 1, "clicks": 4, "impressions": 200},
                "a2": {"spend": 7.0, "leads": 0, "clicks": 0, "impressions": 0},
            }
        }

        _, windows = MonitoringWorker._campaign_entities(
            adsets, campaigns, insights_by_window
        )

        self.assertEqual(windows["c1"]["yesterday"]["spend"], 12.0)
        self.assertEqual(windows["c1"]["yesterday"]["leads"], 1)
        self.assertEqual(windows["c1"]["yesterday"]["ctr"], 2.0)


class TestRuleScopeContract(unittest.TestCase):
    def test_scope_normalization_rejects_unusable_input(self):
        self.assertEqual(
            normalize_rule_scope(None),
            {"level": "account", "ids": []},
        )
        # An account scope ignores ids rather than pretending to honour them.
        self.assertEqual(
            normalize_rule_scope({"level": "account", "ids": ["camp_a"]}),
            {"level": "account", "ids": []},
        )
        self.assertEqual(
            normalize_rule_scope({"level": "campaign", "ids": ["b", "a", "b"]}),
            {"level": "campaign", "ids": ["b", "a"]},
        )
        for invalid in (
            {"level": "galaxy", "ids": ["a"]},
            {"level": "campaign", "ids": []},
            {"level": "campaign", "ids": [{"id": "a"}]},
            {"level": "campaign", "ids": ["  "]},
            {"level": "campaign", "ids": ["x" * 65]},
            {"level": "campaign", "ids": [str(i) for i in range(201)]},
            "campaign",
        ):
            with self.assertRaises(ValueError, msg=invalid):
                normalize_rule_scope(invalid)

    def test_an_ad_is_selected_by_both_its_adset_and_its_campaign(self):
        ad = {
            "entity_level": "ad",
            "entity_id": "ad_1",
            "adset_id": "as_1",
            "campaign_id": "camp_a",
        }

        self.assertTrue(
            rule_scope_matches_entity({"level": "campaign", "ids": ["camp_a"]}, ad)
        )
        self.assertTrue(
            rule_scope_matches_entity({"level": "adset", "ids": ["as_1"]}, ad)
        )
        self.assertFalse(
            rule_scope_matches_entity({"level": "adset", "ids": ["as_2"]}, ad)
        )
        # The ad's own id is not an ad set id, so it must not match one.
        self.assertFalse(
            rule_scope_matches_entity({"level": "adset", "ids": ["ad_1"]}, ad)
        )

    def test_a_campaign_is_never_selected_by_an_adset_scope(self):
        campaign = {
            "entity_level": "campaign",
            "entity_id": "camp_a",
            "campaign_id": "camp_a",
        }

        self.assertFalse(
            rule_scope_matches_entity({"level": "adset", "ids": ["camp_a"]}, campaign)
        )
        self.assertTrue(
            rule_scope_matches_entity({"level": "campaign", "ids": ["camp_a"]}, campaign)
        )

    def test_opposite_actions_coexist_when_aimed_at_different_campaigns(self):
        conditions = [{"metric": "spend", "operator": "gte", "value": 10.0}]

        def rule(action, ids):
            return {
                "preset_id": 1,
                "name": action,
                "action": action,
                "conditions": conditions,
                "logic": "and",
                "scope": {"level": "campaign", "ids": ids},
            }

        # Different campaigns never meet, so this pair is not a contradiction.
        validate_rule_set_compatibility(
            [rule("turn_off", ["camp_a"]), rule("turn_on", ["camp_b"])]
        )

        with self.assertRaises(ValueError):
            validate_rule_set_compatibility(
                [rule("turn_off", ["camp_a"]), rule("turn_on", ["camp_a", "camp_b"])]
            )
        with self.assertRaises(ValueError):
            validate_rule_set_compatibility(
                [
                    rule("turn_off", ["camp_a"]),
                    {**rule("turn_on", ["camp_b"]), "scope": {"level": "account", "ids": []}},
                ]
            )


if __name__ == "__main__":
    unittest.main()
