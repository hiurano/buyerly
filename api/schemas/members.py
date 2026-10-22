from typing import Optional
from pydantic import BaseModel, Field


class WorkspaceMemberItem(BaseModel):
    id: int
    user_id: int
    username: str
    full_name: str
    first_name: str = ""
    last_name: str = ""
    email: Optional[str] = None
    avatar_url: str = ""
    role: str
    joined_at: str
    is_current_user: bool = False


class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|member|guest)$")


class TransferOwnershipRequest(BaseModel):
    new_owner_user_id: int


class CreateWorkspaceInviteRequest(BaseModel):
    email: Optional[str] = Field(None, max_length=255)
    role: str = Field(default="member", pattern="^(admin|member|guest)$")
    expires_in_days: int = Field(default=7, ge=1, le=365)
    max_uses: int = Field(default=1, ge=0, le=1000)


class WorkspaceInviteItem(BaseModel):
    id: int
    workspace_id: int
    workspace_name: str
    token: str
    invite_url: str
    email: Optional[str] = None
    role: str
    status: str
    max_uses: int
    used_count: int
    inviter_name: str
    expires_at: Optional[str] = None
    created_at: str


class WorkspaceInviteLinkResponse(BaseModel):
    """Settings → Security → Invite links: the link, or null while invite links are off."""
    invite_url: Optional[str] = None
    # No link because an admin turned links off, not because the workspace never had one.
    turned_off: bool = False


class PublicInviteInfoResponse(BaseModel):
    valid: bool
    status: str
    workspace_name: Optional[str] = None
    workspace_slug: Optional[str] = None
    # The invitation shows the workspace's mark: its logo, or initials on a color from its id.
    workspace_id: Optional[int] = None
    workspace_logo_url: Optional[str] = None
    inviter_name: Optional[str] = None
    role: Optional[str] = None
    target_email: Optional[str] = None
    expires_at: Optional[str] = None
    message: Optional[str] = None
