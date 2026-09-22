from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from api.schemas.health import AccountHealthItem


# The conversion events Statistics can treat as the primary result. Empty
# means the ad account has not declared one.
PrimaryResult = Literal["", "leads", "registrations", "purchases"]


class AccountLatestMetrics(BaseModel):
    period: Literal["today"] = "today"
    generated_at: str = ""
    saved_at: str = ""
    data_status: Literal["synced", "blocked", "error"]
    data_status_label: str = ""
    spend: Optional[float] = None
    impressions: int = 0
    reach: int = 0
    frequency: Optional[float] = None
    cpm: Optional[float] = None
    clicks: int = 0
    unique_clicks: int = 0
    link_clicks: int = 0
    outbound_clicks: int = 0
    landing_page_views: int = 0
    leads: int = 0
    registrations: int = 0
    purchases: int = 0
    cpl: Optional[float] = None
    cpreg: Optional[float] = None
    cpp: Optional[float] = None
    cpc: Optional[float] = None
    ctr: Optional[float] = None
    ctr_link: Optional[float] = None
    cpc_link: Optional[float] = None
    cost_per_lpv: Optional[float] = None
    roas: Optional[float] = None


class AccountItem(BaseModel):
    id: int
    account_id: str
    name: str
    custom_name: str
    note: str
    connection_type: Literal["facebook_login", "system_user"]
    owner_user_id: Optional[int] = None
    workspace_id: Optional[int] = None
    owner_id: str = ""
    batch_name: str
    timezone_name: str
    currency: str
    account_status: int
    status_label: str
    rules_enabled: bool
    is_active: bool
    active_rules: List[Dict[str, Any]] = Field(default_factory=list)
    group_ids: List[int] = Field(default_factory=list)
    primary_result: PrimaryResult = ""
    target_cost_per_result: Optional[float] = None
    latest_metrics: Optional[AccountLatestMetrics] = None
    health: AccountHealthItem = Field(default_factory=AccountHealthItem)
    created_at: str


class AccountCostTargetRequest(BaseModel):
    """The ad account's declared primary result and the cost target for it.

    An empty ``primary_result`` clears both: Statistics then falls back to
    detecting the result from volume and reports cost without a verdict.
    """

    model_config = ConfigDict(extra="forbid")

    primary_result: PrimaryResult = ""
    # Meta reports cost in the ad account currency, so the target is stored in
    # that currency too. The upper bound only rejects obvious input mistakes.
    target_cost_per_result: Optional[float] = Field(default=None, gt=0, le=1_000_000)

    @model_validator(mode="after")
    def _target_needs_a_declared_result(self) -> "AccountCostTargetRequest":
        if self.target_cost_per_result is not None and not self.primary_result:
            raise ValueError(
                "A cost target needs a primary result to apply to."
            )
        return self


class AccountProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    custom_name: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=500)


class AccountGroupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    account_ids: List[str] = Field(default_factory=list, max_length=250)


class AccountGroupItem(BaseModel):
    id: int
    name: str
    description: str
    account_ids: List[str] = Field(default_factory=list)
    accounts_count: int = 0
    created_at: str = ""
    updated_at: str = ""


class ParseRawRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_text: str = Field(..., min_length=1, max_length=65536)


class ParsedAccountItem(BaseModel):
    account_id: str
    parsed_name: str


class BatchAddAccountEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account_id: str = Field(..., min_length=1, max_length=60)
    name: Optional[str] = Field(default="", max_length=120)


class BatchAddRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    accounts: List[BatchAddAccountEntry] = Field(..., min_length=1, max_length=500)
    batch_name: Optional[str] = Field(default="-", max_length=120)
    access_token: str = Field(..., min_length=1, max_length=1024)
    rules_enabled: Optional[bool] = None
