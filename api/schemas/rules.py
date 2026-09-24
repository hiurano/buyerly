from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

from core.metrics import (
    RULE_MAX_SCOPE_IDS,
    normalize_rule_scope,
    validate_runtime_rule,
)


RuleGroupIcon = Literal["backlog", "shield", "rocket", "flask", "custom"]


class RuleScopeItem(BaseModel):
    """Which entities an attached rule may act on.

    Scope only narrows the search; the level a rule acts on is its own `level`.
    "account" keeps the historical behaviour of sweeping the whole ad account.
    """

    model_config = ConfigDict(extra="forbid")

    level: Literal["account", "campaign", "adset"] = "account"
    ids: List[str] = Field(default_factory=list, max_length=RULE_MAX_SCOPE_IDS)

    @model_validator(mode="after")
    def validate_scope_shape(self):
        # One source of truth: the runtime validator the worker also uses.
        normalize_rule_scope(self.model_dump())
        return self


class ConditionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metric: Literal["spend", "cpl", "cpreg", "cpp", "leads", "registrations", "purchases", "ctr", "cpc"] = "spend"
    operator: Literal["gte", "gt", "lte", "lt", "eq"] = "gte"
    value: float = Field(default=0.0, ge=0, le=1_000_000_000, allow_inf_nan=False)
    time_window: Literal["today", "yesterday", "last_3d", "last_7d"] = "today"


class RulePresetItem(BaseModel):
    id: int
    name: str
    action: str
    # Where the rule reads metrics and applies its action.
    level: Literal["campaign", "adset", "ad"] = "adset"
    enabled: bool = True
    conditions: List[ConditionItem]
    condition_logic: str = "and"
    cooldown_minutes: int = 0
    check_interval_minutes: int = 5
    budget_change_percent: float = 0.0
    budget_max_daily: float = 0.0
    currency_mode: Literal["account"] = "account"
    created_at: str
    # Legacy or unsafe snapshots are held back from execution until re-saved.
    needs_review: bool = False
    review_reason: str = ""
    # Last RULE_ACTION audit event for this preset as ISO 8601 with offset;
    # empty when the rule has never fired.
    last_run_at: str = ""
    # Ad accounts this preset is currently attached to, so the UI can tell a
    # configured rule apart from one that cannot run anywhere yet.
    attached_account_ids: List[str] = Field(default_factory=list)
    # Scope per attached account, so a client can say what detaching removes
    # instead of silently discarding a rule narrowed to specific campaigns.
    attached_scopes: Dict[str, RuleScopeItem] = Field(default_factory=dict)


class CreatePresetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    action: Literal["turn_off", "notify_only", "turn_on", "increase_budget", "decrease_budget"] = "turn_off"
    level: Literal["campaign", "adset", "ad"] = "adset"
    enabled: bool = True
    conditions: List[ConditionItem] = Field(min_length=1, max_length=20)
    condition_logic: Literal["and", "or"] = "and"
    cooldown_minutes: int = Field(default=0, ge=0, le=10_080)
    check_interval_minutes: int = Field(default=5, ge=1, le=1_440)
    budget_change_percent: float = Field(default=0.0, ge=0, le=100, allow_inf_nan=False)
    budget_max_daily: float = Field(default=0.0, ge=0, le=10_000_000, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_safe_action_parameters(self):
        validate_runtime_rule(
            {
                "action": self.action,
                "level": self.level,
                "conditions": [condition.model_dump() for condition in self.conditions],
                "logic": self.condition_logic,
                "cooldown_minutes": self.cooldown_minutes,
                "check_interval": self.check_interval_minutes,
                "budget_change_percent": self.budget_change_percent,
                "budget_max_daily": self.budget_max_daily,
            }
        )
        return self


class RuleGroupWriteRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    icon: RuleGroupIcon = "custom"
    position: Optional[int] = None
    preset_ids: List[int] = Field(default_factory=list, min_length=0, max_length=50)


class RuleGroupResponse(BaseModel):
    id: int
    name: str
    description: str
    icon: str = "custom"
    position: int = 0
    preset_ids: List[int]
    rules: List[RulePresetItem]
    created_at: str


class RuleGroupsReorderRequest(BaseModel):
    group_ids: List[int] = Field(min_length=0, max_length=100)


class ApplyPresetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preset_id: int = Field(gt=0)
    scope: RuleScopeItem = Field(default_factory=RuleScopeItem)


class DeletedItemResponse(BaseModel):
    id: int
    kind: Literal["rule", "rule_group"]
    entity_id: int
    name: str
    deleted_at: str
    # Past this moment the item is gone for good.
    purge_at: str
    deleted_by: str = ""


class RestoreDeletedItemResponse(BaseModel):
    kind: Literal["rule", "rule_group"]
    entity_id: int
    name: str
    # Ad accounts a restored rule could not return to: gone, or now running a
    # rule it would contradict.
    skipped_account_ids: List[str] = Field(default_factory=list)
    # Rules of a restored group that were deleted in the meantime.
    missing_rule_ids: List[int] = Field(default_factory=list)
