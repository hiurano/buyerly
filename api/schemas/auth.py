from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.schemas.workspaces import WorkspaceItem


class UserProfileResponse(BaseModel):
    username: str
    full_name: str
    first_name: str = ""
    last_name: str = ""
    email: Optional[str] = None
    email_verified: bool = False
    unconfirmed_email: Optional[str] = None
    avatar_url: str = ""
    role: str
    is_approved: bool
    onboarding_step: str = "completed"
    onboarding_completed: bool = False
    active_workspace: Optional[WorkspaceItem] = None
    workspaces: List[WorkspaceItem] = Field(default_factory=list)


class RequestTemporaryPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(..., min_length=3, max_length=255)
    invite_token: Optional[str] = Field(None, min_length=16, max_length=255)


class VerifyTemporaryPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(..., min_length=3, max_length=255)
    code: str = Field(..., min_length=6, max_length=6)


class VerifyEmailLinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(..., min_length=32, max_length=255)


class RequestEmailChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    new_email: str = Field(..., min_length=3, max_length=255)


class VerifyEmailChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(..., min_length=1, max_length=10)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=255)


class LoginResponse(BaseModel):
    username: str
    full_name: str
    role: str
    message: str = "Signed in successfully"
    redirect_url: Optional[str] = None


class WebSessionItem(BaseModel):
    id: str
    user_agent: str = ""
    ip_address: str = ""
    created_at: datetime
    expires_at: datetime
    last_seen_at: datetime
    current: bool = False


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    old_password: str = Field(default="", max_length=255)
    new_password: str = Field(..., min_length=8, max_length=255)


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = Field(None, max_length=120)
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    avatar_url: Optional[str] = Field(None, max_length=500)

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            return ""
        if any(c in cleaned for c in ("<", ">", '"', "'", "\r", "\n", "\t", "\0")):
            raise ValueError("avatar_url contains invalid characters")
        if cleaned.startswith("//"):
            raise ValueError("Protocol-relative URLs are not supported")
        if cleaned.startswith("/uploads/avatars/"):
            return cleaned
        if cleaned.startswith("http://") or cleaned.startswith("https://"):
            return cleaned
        raise ValueError("avatar_url must start with https://, http:// or /uploads/avatars/")


class AllowedEmailItem(BaseModel):
    id: int
    # "email": a pre-registration email grant; "user": an existing account.
    kind: Literal["email", "user"]
    email: Optional[str] = None
    user_id: Optional[int] = None
    username: Optional[str] = None
    added_by: Optional[str] = None
    comment: Optional[str] = None
    created_at: datetime


class AddAllowedEmailRequest(BaseModel):
    """Allowlist either an email or an existing account's username."""

    model_config = ConfigDict(extra="forbid")
    email: Optional[str] = Field(None, min_length=3, max_length=255)
    username: Optional[str] = Field(None, min_length=1, max_length=255)
    comment: Optional[str] = Field(None, max_length=255)

    @model_validator(mode="after")
    def _exactly_one_target(self):
        if (self.email is None) == (self.username is None):
            raise ValueError("Provide either email or username")
        return self
