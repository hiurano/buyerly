from typing import List, Optional
from pydantic import BaseModel, Field


class TeamItem(BaseModel):
    """One row of Settings → Teams and what the team's own pages need."""
    id: int
    name: str
    key: str
    description: str = ""
    created_at: str
    retired_at: Optional[str] = None
    deleted_at: Optional[str] = None
    # Until when a deleted team can still be restored.
    restorable_until: Optional[str] = None
    member_user_ids: List[int] = Field(default_factory=list)
    account_ids: List[int] = Field(default_factory=list)
    is_member: bool = False


class CreateTeamRequest(BaseModel):
    name: str = Field(..., max_length=48)
    key: str = Field(..., max_length=7)
    description: str = Field(default="", max_length=255)


class UpdateTeamRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=48)
    key: Optional[str] = Field(None, max_length=7)
    description: Optional[str] = Field(None, max_length=255)


class TeamMembersRequest(BaseModel):
    user_ids: List[int] = Field(..., min_length=1, max_length=500)


class TeamAccountsRequest(BaseModel):
    account_ids: List[int] = Field(..., min_length=1, max_length=1000)
