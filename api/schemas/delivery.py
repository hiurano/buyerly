from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# The hierarchy levels a manual action can target. An ad can be paused but has
# no budget of its own, which the budget endpoint refuses explicitly.
EntityLevel = Literal["campaign", "adset", "ad"]


class EntityDeliveryRequest(BaseModel):
    """Turn one campaign, ad set or ad on or off."""

    model_config = ConfigDict(extra="forbid")

    account_id: str = Field(min_length=1, max_length=60)
    status: Literal["ACTIVE", "PAUSED"]


class EntityBudgetRequest(BaseModel):
    """Set the daily budget on whichever entity actually holds it."""

    model_config = ConfigDict(extra="forbid")

    account_id: str = Field(min_length=1, max_length=60)
    # One unit of the ad account currency is the floor `core.action_undo`
    # already treats as safe to reverse; the ceiling only rejects a slipped
    # keystroke, since Meta enforces its own per-currency minimum.
    daily_budget: float = Field(ge=1.0, le=1_000_000.0)
