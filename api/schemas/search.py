from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel

SearchKind = Literal["campaign", "adset", "ad", "rule", "account"]
# Status filter of the search page: Meta's delivery and a rule's run state in three words.
SearchStatus = Literal["active", "paused", "other"]
SearchOrder = Literal["relevance", "updated"]


class SearchResultItem(BaseModel):
    """One thing the search page can open, named the way its screen names it."""

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
    # The record's age on the page and the "Last updated" order: when a rule was
    # last changed, when an ad account was added, and for a campaign, ad set or ad
    # the first day Buyerly synced it (Meta's own dates are not stored).
    updated_at: Optional[datetime] = None


class SearchResponse(BaseModel):
    query: str
    limit: int
    # Best match first (exact name, name start, name containing it), or newest
    # first for `order=updated`; kinds in a fixed order among equals.
    results: List[SearchResultItem]
    # Kinds with more matches than `limit`, so the page can say the list is cut.
    truncated: List[SearchKind]
