from typing import List, Literal

from pydantic import BaseModel

SearchKind = Literal["campaign", "adset", "ad", "rule", "account"]


class SearchResultItem(BaseModel):
    """One thing the command menu can open, named the way its screen names it."""

    kind: SearchKind
    # Meta ID for a campaign, ad set, ad or ad account (`act_…`); the rule id for a rule.
    id: str
    name: str
    # The ad account Ads Manager opens the result in: the result itself for an
    # ad account, empty for a rule.
    account_id: str = ""
    account_name: str = ""
    # The campaign of an ad set, the ad set of an ad; empty otherwise.
    parent_name: str = ""
    # Meta's effective status for a campaign, ad set or ad; `active`, `paused`
    # or `needs_review` for a rule; empty for an ad account.
    status: str = ""


class SearchResponse(BaseModel):
    query: str
    limit: int
    # Campaigns, ad sets, ads, rules, then ad accounts; best match first within each.
    results: List[SearchResultItem]
    # Kinds with more matches than `limit`, so the menu can say the list is cut.
    truncated: List[SearchKind]
