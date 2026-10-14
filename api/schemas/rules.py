from typing import Annotated, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from core.metrics import (
    RULE_MAX_SCOPE_IDS,
    normalize_rule_scope,
    validate_runtime_rule,
)


LabelColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
# Linear allows up to 50 labels on one issue.
MAX_RULE_LABELS = 50


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

    metric: Literal["spend", "cpl", "cpreg", "cpp", "leads", "registrations", "purchases", "ctr", "cpc", "clicks", "link_clicks"] = "spend"
    operator: Literal["gte", "gt", "lte", "lt", "eq"] = "gte"
    value: float = Field(default=0.0, ge=0, le=1_000_000_000, allow_inf_nan=False)
    time_window: Literal["today", "yesterday", "last_3d", "last_7d", "lifetime"] = "today"


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
    # Latest check of this preset on any entity, matched or not; empty when
    # the worker has not checked it yet.
    last_checked_at: str = ""
    # Ad accounts this preset is currently attached to, so the UI can tell a
    # configured rule apart from one that cannot run anywhere yet.
    attached_account_ids: List[str] = Field(default_factory=list)
    # Scope per attached account, so a client can say what detaching removes
    # instead of silently discarding a rule narrowed to specific campaigns.
    attached_scopes: Dict[str, RuleScopeItem] = Field(default_factory=dict)
    # The rule's labels (#383), by id.
    label_ids: List[int] = Field(default_factory=list)


class RuleAttachmentRequest(BaseModel):
    """One ad account a rule runs on, and where in it (#387)."""

    model_config = ConfigDict(extra="forbid")

    account_id: str = Field(min_length=1, max_length=64, pattern=r"^(act_)?\d+$")
    scope: RuleScopeItem = Field(default_factory=RuleScopeItem)


# One rule can run on this many ad accounts from the rule window.
MAX_RULE_ATTACHMENTS = 100


class RuleDraftRequest(BaseModel):
    """A rule as the New rule window holds it, before it has a name or an id.

    The same checks as a saved rule run on it, so the window can show what is
    wrong and preview it on an ad account before anything is written (#387).
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="", max_length=120)
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


class CreatePresetRequest(RuleDraftRequest):
    name: str = Field(min_length=1, max_length=120)
    # Labels a new rule starts with; editing a rule leaves its labels to
    # PUT /presets/{id}/labels, so a write without them never clears them.
    label_ids: Optional[List[int]] = Field(default=None, max_length=MAX_RULE_LABELS)
    # Where the rule runs (#387). Creating attaches it to these ad accounts in
    # the same write; editing makes these the whole set, detaching the rest.
    # Left out, an edit keeps the rule where it runs.
    attachments: Optional[List[RuleAttachmentRequest]] = Field(
        default=None, max_length=MAX_RULE_ATTACHMENTS
    )

    @model_validator(mode="after")
    def validate_unique_attachments(self):
        accounts = [
            item.account_id if item.account_id.startswith("act_") else f"act_{item.account_id}"
            for item in self.attachments or []
        ]
        if len(accounts) != len(set(accounts)):
            raise ValueError("Each ad account can be chosen once.")
        return self


class RuleLabelCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    # A random color from the palette when left out, as Linear does.
    color: Optional[LabelColor] = None
    description: str = Field(default="", max_length=500)


class RuleLabelUpdateRequest(BaseModel):
    """Only what is sent changes: a rename, a color, a description."""

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    color: Optional[LabelColor] = None
    description: Optional[str] = Field(default=None, max_length=500)


class RuleLabelResponse(BaseModel):
    id: int
    name: str
    color: str
    description: str = ""
    # How many rules carry it.
    rule_count: int = 0
    # When it was last put on a rule, ISO 8601; empty when never.
    last_applied_at: str = ""
    created_at: str = ""


class PresetLabelsRequest(BaseModel):
    """A rule's whole set of labels, in one write."""

    model_config = ConfigDict(extra="forbid")

    label_ids: List[int] = Field(default_factory=list, max_length=MAX_RULE_LABELS)


class BulkPresetLabelsRequest(BaseModel):
    """Labels put on or taken off several rules at once (the selection's L)."""

    model_config = ConfigDict(extra="forbid")

    preset_ids: List[int] = Field(min_length=1, max_length=500)
    add_label_ids: List[int] = Field(default_factory=list, max_length=MAX_RULE_LABELS)
    remove_label_ids: List[int] = Field(default_factory=list, max_length=MAX_RULE_LABELS)


RuleEntityStateName = Literal[
    "fired",
    "cooldown",
    "confirming",
    "undone",
    "yielded",
    "not_met",
    "inactive",
    "pending",
    "skipped",
    "error",
    "matched",
    "rules_off",
    "rule_paused",
]


class RuleEntityStateItem(BaseModel):
    """Where one rule stands on one entity as of its latest check (#322).

    Times are ISO 8601 with an offset, empty when unknown. ``wait_until`` is
    when a cooldown, an undo or a STOP confirmation runs out; ``acted_at`` the
    rule's last action on this entity, kept across checks where it did not act.
    """

    rule_id: int
    rule_name: str
    account_id: str
    account_name: str = ""
    entity_level: Literal["campaign", "adset", "ad"]
    entity_id: str
    entity_name: str = ""
    campaign_id: str = ""
    state: RuleEntityStateName
    detail: str = ""
    wait_until: str = ""
    yielded_to_rule_id: Optional[int] = None
    yielded_to_rule_name: str = ""
    checked_at: str
    acted_at: str = ""


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
