from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Float,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    Index,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from database.db import Base


def utcnow():
    """UTC for PostgreSQL TIMESTAMP WITH TIME ZONE columns."""
    return datetime.now(timezone.utc)


utcnow_aware = utcnow
utcnow_naive = utcnow


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(String, unique=True, nullable=True, index=True, doc="Telegram user ID (for push notifications)")
    username = Column(String, unique=True, nullable=False, index=True, doc="User login (e.g. Artem)")
    full_name = Column(String, default="", nullable=False)
    first_name = Column(String, default="", nullable=False, doc="First name")
    last_name = Column(String, default="", nullable=False, doc="Last name")
    email = Column(String, unique=True, nullable=True, index=True, doc="Normalized unique work email")
    email_verified_at = Column(DateTime(timezone=True), nullable=True, index=True, doc="Date and time the email was confirmed (UTC)")
    unconfirmed_email = Column(String, nullable=True, index=True, doc="Newly requested email, pending OTP confirmation")
    avatar_url = Column(String, default="", nullable=False, doc="Avatar URL or path")
    onboarding_step = Column(
        String,
        default="personal_details",
        nullable=False,
        doc="Current onboarding step ('personal_details', 'workspace', 'invites', 'completed')",
    )
    onboarding_completed = Column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether the user finished the full onboarding",
    )
    password_hash = Column(String, default="", nullable=False, doc="Versioned secure password hash")
    auth_token = Column(String, unique=True, nullable=True, index=True, doc="Legacy browser token; migrated to web_sessions and cleared")
    role = Column(String, default="admin", nullable=False, doc="'admin' or 'buyer'")
    is_approved = Column(Boolean, default=True, nullable=False, doc="Whether access is approved")
    active_workspace_id = Column(
        Integer,
        ForeignKey(
            "workspaces.id",
            use_alter=True,
            name="fk_users_active_workspace",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
        doc="Active workspace ID",
    )
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"


class WebSession(Base):
    __tablename__ = "web_sessions"

    id = Column(String(36), primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    csrf_hash = Column(String(64), nullable=False)
    user_agent = Column(String(500), default="", nullable=False)
    ip_address = Column(String(64), default="", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    last_seen_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    rotated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)

    def __repr__(self):
        return f"<WebSession(id='{self.id}', user_id={self.user_id})>"


# Backwards compatibility alias
TelegramUser = User


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, doc="Workspace name (e.g. 'Buyerly', 'Canada Traffic')")
    slug = Column(String, unique=True, nullable=False, index=True, doc="URL slug (e.g. 'buyerly', 'canada-traffic')")
    badge_text = Column(String, default="B", nullable=False, doc="Badge symbol or letter")
    badge_color = Column(String, default="#F5A300", nullable=False, doc="Badge color (#F5A300, #7C3AED, etc.)")
    logo_url = Column(String, default="", nullable=False, doc="Company logo URL or path")
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return f"<Workspace(id={self.id}, name='{self.name}', slug='{self.slug}')>"


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member_user"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, default="owner", nullable=False, doc="'owner', 'admin', 'buyer', 'viewer'")
    joined_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    def __repr__(self):
        return f"<WorkspaceMember(workspace_id={self.workspace_id}, user_id={self.user_id}, role='{self.role}')>"


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="ID of the workspace being invited to",
    )
    token = Column(
        String,
        unique=True,
        nullable=False,
        index=True,
        doc="Unique secure invite token",
    )
    email = Column(
        String,
        nullable=True,
        index=True,
        doc="Invitee email (for personal invites)",
    )
    role = Column(
        String,
        default="buyer",
        nullable=False,
        doc="Role on joining: 'admin', 'buyer', 'viewer'",
    )
    inviter_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="ID of the user who created the invite",
    )
    status = Column(
        String,
        default="pending",
        nullable=False,
        index=True,
        doc="Invite status ('pending', 'accepted', 'revoked', 'expired')",
    )
    max_uses = Column(
        Integer,
        default=1,
        nullable=False,
        doc="Maximum uses (1 = single use, 0 = unlimited)",
    )
    used_count = Column(
        Integer,
        default=0,
        nullable=False,
        doc="How many times the invite was actually used",
    )
    expires_at = Column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
        doc="Invite expiry (UTC)",
    )
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )

    def __repr__(self):
        return (
            f"<WorkspaceInvite(id={self.id}, workspace_id={self.workspace_id}, "
            f"role='{self.role}', status='{self.status}')>"
        )


class WorkspaceSupportGrant(Base):
    """Temporary, auditable privileged support/impersonation grant for platform superadmins."""

    __tablename__ = "workspace_support_grants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="ID of the workspace granted temporary support access",
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="ID of the platform administrator granted access",
    )
    role = Column(
        String,
        default="admin",
        nullable=False,
        doc="Temporary workspace role for the session ('admin' or 'viewer')",
    )
    reason = Column(
        Text,
        nullable=False,
        doc="Mandatory justification for support/diagnostic access",
    )
    expires_at = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        doc="Support session expiry (UTC)",
    )
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    revoked_at = Column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
        doc="Time the grant was revoked early (if revoked)",
    )

    def __repr__(self):
        return (
            f"<WorkspaceSupportGrant(id={self.id}, workspace_id={self.workspace_id}, "
            f"user_id={self.user_id}, role='{self.role}', expires='{self.expires_at}')>"
        )


class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"
    __table_args__ = (
        Index(
            "uq_email_verification_codes_active_scope",
            "scope",
            unique=True,
            postgresql_where=text("is_used = false"),
            sqlite_where=text("is_used = 0"),
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, nullable=False, index=True, doc="Email of the code recipient")
    code = Column(String(10), default="", nullable=False, doc="Legacy field; new OTP values are never stored in plaintext")
    code_hash = Column(String(64), nullable=False, doc="HMAC-SHA256 of the verification code")
    link_token_hash = Column(
        String(64),
        unique=True,
        nullable=True,
        index=True,
        doc="HMAC-SHA256 of the one-time sign-in link token",
    )
    invite_id = Column(
        Integer,
        ForeignKey("workspace_invites.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="The invite that authorized this sign-in",
    )
    purpose = Column(String(32), nullable=False, doc="Code purpose: login/email_change/email_verification")
    scope = Column(String(320), nullable=False, index=True, doc="Isolated scope of the one-time code")
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True, doc="Code expiry (UTC)")
    is_used = Column(Boolean, default=False, nullable=False, doc="Whether the code was used")
    failed_attempts = Column(Integer, default=0, nullable=False, doc="Number of failed code attempts")
    delivered_at = Column(DateTime(timezone=True), nullable=True, index=True, doc="The code was handed to the mail provider successfully")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    def __repr__(self):
        return f"<EmailVerificationCode(email='{self.email}', used={self.is_used})>"


class AllowedEmail(Base):
    __tablename__ = "allowed_emails"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(320), nullable=False, unique=True, index=True, doc="Allowlisted email address (lowercase)")
    added_by = Column(String(128), nullable=True, doc="Telegram ID or username of the admin who added the address")
    comment = Column(String(255), nullable=True, doc="Optional comment / buyer name")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    def __repr__(self):
        return f"<AllowedEmail(id={self.id}, email='{self.email}')>"


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    poll_interval_minutes = Column(Integer, default=10, nullable=False, doc="Ad account polling interval (min)")
    critical_rule_interval_minutes = Column(
        Integer,
        default=2,
        nullable=False,
        doc="Maximum check interval for critical STOP rules (min)",
    )
    stop_confirmation_minutes = Column(
        Integer,
        default=10,
        nullable=False,
        doc="How many minutes a STOP condition must hold before the ad set is switched off",
    )
    inventory_cache_minutes = Column(
        Integer,
        default=5,
        nullable=False,
        doc="Cache lifetime for the ad set list and statuses (min)",
    )
    account_health_interval_minutes = Column(
        Integer,
        default=15,
        nullable=False,
        doc="Check interval for ad account currency, time zone and status (min)",
    )
    max_concurrent_accounts = Column(
        Integer,
        default=3,
        nullable=False,
        doc="Maximum Meta ad accounts read concurrently",
    )
    max_concurrent_actions = Column(
        Integer,
        default=3,
        nullable=False,
        doc="Maximum Meta actions executed concurrently",
    )
    usage_soft_limit_percent = Column(
        Integer,
        default=60,
        nullable=False,
        doc="Adaptive Meta API slow-down threshold (%)",
    )
    usage_hard_limit_percent = Column(
        Integer,
        default=80,
        nullable=False,
        doc="Threshold for pausing non-critical Meta API requests (%)",
    )
    adaptive_polling_enabled = Column(
        Boolean,
        default=True,
        nullable=False,
        doc="Automatically reduce frequency as quota usage grows",
    )
    admin_chat_id = Column(String, default="", nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return f"<AppSettings(interval={self.poll_interval_minutes}m)>"


class AutomationRuntimeState(Base):
    """Small durable status snapshot shared by the worker and settings UI."""

    __tablename__ = "automation_runtime_states"

    state_key = Column(String, primary_key=True, default="monitoring")
    payload = Column(JSONB, default=dict, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class RulePreset(Base):
    __tablename__ = "rule_presets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String, nullable=False, doc="Preset name (e.g. 'Stop when CPL exceeds threshold')")
    action = Column(String, default="turn_off", nullable=False, doc="'turn_off', 'turn_on', 'notify_only', 'increase_budget', 'decrease_budget'")
    enabled = Column(
        Boolean,
        default=True,
        nullable=False,
        doc="A disabled rule is never executed by the worker on any ad account",
    )
    level = Column(
        String,
        default="adset",
        nullable=False,
        doc="Execution level: 'adset', 'campaign' or 'ad'; metrics are read and the action is applied there",
    )
    conditions = Column(JSONB, default=list, nullable=False, doc="JSONB list of conditions")
    condition_logic = Column(String, default="and", nullable=False, doc="'and' or 'or' - how conditions are combined")
    cooldown_minutes = Column(Integer, default=0, nullable=False, doc="Pause between firings (min, 0 = none)")
    check_interval_minutes = Column(Integer, default=5, nullable=False, doc="Worker check interval (min)")
    notify_tg = Column(Boolean, default=True, nullable=False, doc="Telegram notification")
    budget_change_percent = Column(Float, default=0.0, nullable=False, doc="Budget change, in percent")
    budget_max_daily = Column(Float, default=0.0, nullable=False, doc="Max daily budget in the ad account currency, 0 = no cap")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return f"<RulePreset(id={self.id}, name='{self.name}', action='{self.action}')>"


class RuleGroup(Base):
    """A reusable, ordered bundle of rule presets owned by one buyer."""

    __tablename__ = "rule_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default="", nullable=False)
    icon = Column(
        String,
        default="custom",
        nullable=False,
        doc="Group marker: 'backlog', 'shield', 'rocket', 'flask' or 'custom'",
    )
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return f"<RuleGroup(id={self.id}, name='{self.name}', owner_user_id={self.owner_user_id})>"


class RuleGroupItem(Base):
    """Ordered membership table between groups and executable presets."""

    __tablename__ = "rule_group_items"
    __table_args__ = (
        UniqueConstraint("group_id", "preset_id", name="uq_rule_group_preset"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey("rule_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    preset_id = Column(Integer, ForeignKey("rule_presets.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    def __repr__(self):
        return f"<RuleGroupItem(group={self.group_id}, preset={self.preset_id}, position={self.position})>"


class RuleExamplesBootstrap(Base):
    """One-time marker so deleted examples are never silently recreated."""

    __tablename__ = "rule_examples_bootstrap"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "owner_user_id",
            name="uq_rule_examples_ws_owner",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    def __repr__(self):
        return (
            f"<RuleExamplesBootstrap(workspace_id={self.workspace_id}, "
            f"owner_user_id={self.owner_user_id}, version={self.version})>"
        )


class MetaConnection(Base):
    """One encrypted Meta user authorization owned by one Buyerly user in a specific workspace."""

    __tablename__ = "meta_connections"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "provider_user_id",
            name="uq_meta_connections_workspace_provider_user",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_user_id = Column(String, nullable=False, index=True)
    provider_user_name = Column(String, default="", nullable=False)
    access_token_encrypted = Column(Text, nullable=False)
    granted_scopes = Column(JSONB, default=list, nullable=False)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="active", nullable=False, index=True)
    last_error = Column(Text, default="", nullable=False)
    last_validated_at = Column(DateTime(timezone=True), nullable=True)
    connected_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )


class MetaConnectionInvite(Base):
    """One-time secure invite link allowing a Facebook profile owner to connect their account
    to a Buyerly workspace without sharing passwords, cookies, or plaintext tokens."""

    __tablename__ = "meta_connection_invites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Workspace the connected profile will be linked to",
    )
    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Buyerly user who generated this invite link",
    )
    token_hash = Column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
        doc="SHA-256 hash of the raw invite token (never store plaintext)",
    )
    token_prefix = Column(
        String(20),
        nullable=False,
        doc="Safe human-readable prefix for UI display, e.g. inv_fb_a1b2c3...",
    )
    label = Column(
        String(255),
        nullable=False,
        default="",
        doc="Admin-assigned human label, e.g. 'Buyer Ivan — Profile #3'",
    )
    status = Column(
        String(32),
        nullable=False,
        default="pending",
        index=True,
        doc="Lifecycle: pending | used | revoked | expired",
    )
    expires_at = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        doc="Hard expiry after which the invite cannot be used",
    )
    used_at = Column(DateTime(timezone=True), nullable=True, doc="Timestamp of successful OAuth completion")
    connected_meta_id = Column(
        Integer,
        ForeignKey("meta_connections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="MetaConnection created as result of this invite",
    )
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )

    def __repr__(self):
        return (
            f"<MetaConnectionInvite(id={self.id}, workspace_id={self.workspace_id}, "
            f"status='{self.status}', label='{self.label}')>"
        )


class MetaOAuthState(Base):
    """Short-lived, single-use OAuth state; the browser secret itself is never stored."""

    __tablename__ = "meta_oauth_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    state_hash = Column(String, unique=True, nullable=False, index=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    return_path = Column(String, default="/facebook-accounts", nullable=False)
    reconnect_connection_id = Column(
        Integer,
        ForeignKey("meta_connections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invite_id = Column(
        Integer,
        ForeignKey("meta_connection_invites.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Invite that triggered this OAuth flow; null for direct connections",
    )
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class MetaConnectionAsset(Base):
    """Latest safe discovery snapshot of an ad account visible to a connection."""

    __tablename__ = "meta_connection_assets"
    __table_args__ = (
        UniqueConstraint(
            "connection_id",
            "meta_account_id",
            name="uq_meta_connection_asset_account",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    connection_id = Column(
        Integer,
        ForeignKey("meta_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    meta_account_id = Column(String, nullable=False, index=True)
    name = Column(String, default="", nullable=False)
    business_id = Column(String, default="", nullable=False, index=True)
    business_name = Column(String, default="No Business Manager", nullable=False)
    account_status = Column(Integer, default=1, nullable=False)
    currency = Column(String, default="UNKNOWN", nullable=False)
    timezone_name = Column(String, default="UTC", nullable=False)
    discovered_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    account_id = Column(String, unique=True, nullable=False, index=True, doc="Facebook Ad Account ID (act_...)")
    name = Column(String, nullable=False, doc="Human-readable ad account name")
    custom_name = Column(
        String,
        default="",
        nullable=False,
        doc="Internal Buyerly name for the ad account; never overwritten by Meta data",
    )
    note = Column(
        Text,
        default="",
        nullable=False,
        doc="Editable internal owner note about the ad account",
    )
    access_token = Column(
        String,
        nullable=True,
        default="",
        doc="Deprecated plaintext manual token; cleared after migration",
    )
    access_token_encrypted = Column(
        Text,
        nullable=True,
        default="",
        doc="Encrypted manual User/System User Access Token",
    )
    meta_connection_id = Column(
        Integer,
        ForeignKey("meta_connections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Encrypted Meta OAuth connection used by this account",
    )
    
    # Owner link (multi-user isolation)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    batch_name = Column(String, default="", nullable=False, doc="Batch name (if the accounts were added as a batch)")
    currency = Column(String, default="UNKNOWN", nullable=False, doc="ISO 4217 ad account currency from Meta")
    
    # Time zone and tracking of the local calendar day boundary
    timezone_name = Column(String, default="UTC", nullable=False, doc="Ad account time zone")
    last_started_date = Column(String, default="", nullable=False, doc="Legacy: the previous date spend was detected")
    last_day_start_date = Column(String, default="", nullable=False, doc="Last local date handled by the new-day notification")
    
    # Attached rules (JSON)
    active_rules = Column(Text, default="[]", nullable=False, doc="JSON array of attached rule objects")
    
    # Ad account status in Meta
    account_status = Column(Integer, default=1, nullable=False, doc="1: ACTIVE, 2: DISABLED, 3: UNSETTLED")
    status_label = Column(String, default="Active (ACTIVE)", nullable=False)
    
    rules_enabled = Column(Boolean, default=False, nullable=False, doc="Whether automated stop rules are enabled")
    is_active = Column(Boolean, default=True, nullable=False, doc="Whether the ad account is enabled in the system")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    def __repr__(self):
        return f"<Account(account_id='{self.account_id}', name='{self.name}', status={self.account_status})>"


class AccountHealth(Base):
    """Latest secret-safe reliability snapshot for one workspace account."""

    __tablename__ = "account_health"
    __table_args__ = (
        UniqueConstraint("account_pk", name="uq_account_health_account_pk"),
        Index("ix_account_health_workspace_status", "workspace_id", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_pk = Column(
        Integer,
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String(16), default="unknown", nullable=False, index=True)
    cause = Column(String(16), default="none", nullable=False, index=True)
    signals = Column(JSONB, default=dict, nullable=False)
    consecutive_failures = Column(Integer, default=0, nullable=False)
    last_success_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_error_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_error_code = Column(String(64), default="", nullable=False)
    last_error_message = Column(Text, default="", nullable=False)
    last_checked_at = Column(DateTime(timezone=True), nullable=False, index=True)
    last_transition_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return f"<AccountHealth(account_pk={self.account_pk}, status='{self.status}', cause='{self.cause}')>"


class AccountGroup(Base):
    """Workspace-scoped, reusable grouping of advertising accounts."""

    __tablename__ = "account_groups"
    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default="", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    __table_args__ = (
        Index(
            "uq_account_groups_workspace_name_ci",
            workspace_id,
            func.lower(func.btrim(name)),
            unique=True,
            postgresql_where=workspace_id.is_not(None),
        ),
    )

    def __repr__(self):
        return f"<AccountGroup(id={self.id}, workspace_id={self.workspace_id}, name='{self.name}')>"


class AccountGroupMember(Base):
    """Ordered many-to-many membership between account groups and accounts."""

    __tablename__ = "account_group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "account_id", name="uq_account_group_member"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey("account_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    def __repr__(self):
        return f"<AccountGroupMember(group={self.group_id}, account={self.account_id}, position={self.position})>"


class SummarySnapshot(Base):
    """Durable, workspace/owner-isolated history of successful dashboard refreshes."""

    __tablename__ = "summary_snapshots"
    __table_args__ = (
        Index(
            "ix_summary_snapshots_workspace_period_created",
            "workspace_id",
            "period",
            "created_at",
        ),
        Index(
            "ix_summary_snapshots_user_period_created",
            "owner_user_id",
            "period",
            "created_at",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    period = Column(String, nullable=False, index=True)
    payload = Column(JSONB, nullable=False, doc="Safe summary JSONB with no access token")
    schema_version = Column(Integer, default=1, nullable=False)
    generated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def __repr__(self):
        return f"<SummarySnapshot(workspace_id={self.workspace_id}, owner_user_id={self.owner_user_id}, period='{self.period}', generated='{self.generated_at}')>"


class AnalyticsViewPreference(Base):
    """Owner-isolated saved configuration for an analytics surface."""

    __tablename__ = "analytics_view_preferences"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "scope", name="uq_analytics_view_owner_scope"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    scope = Column(String, default="summary", nullable=False, index=True)
    config = Column(JSONB, default=dict, nullable=False, doc="Safe JSONB of view settings")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return f"<AnalyticsViewPreference(owner_user_id={self.owner_user_id}, scope='{self.scope}')>"


class StoppedAdSet(Base):
    __tablename__ = "stopped_adsets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(String, nullable=False, index=True)
    adset_id = Column(String, unique=True, nullable=False, index=True)
    adset_name = Column(String, nullable=False)
    
    stop_spend = Column(Float, nullable=False, doc="Spend at switch-off time, in the ad account currency")
    stop_leads = Column(Integer, default=0, nullable=False, doc="Leads at switch-off time")
    stop_registrations = Column(Integer, default=0, nullable=False, doc="Registrations at switch-off time")
    
    is_resolved = Column(Boolean, default=False, nullable=False, doc="Whether the late conversion was handled (turned on/dismissed)")
    stopped_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return f"<StoppedAdSet(adset_id='{self.adset_id}', spend={self.stop_spend})>"


class AdsetInventoryCache(Base):
    """PostgreSQL-backed shared inventory cache for Meta ad sets across worker and API."""

    __tablename__ = "adset_inventory_cache"

    account_id = Column(String, primary_key=True, index=True)
    adsets_payload = Column(JSONB, nullable=False, doc="List of adsets: id, name, status, effective_status, daily_budget")
    version = Column(Integer, default=1, nullable=False)
    fetched_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return f"<AdsetInventoryCache(account_id='{self.account_id}', expires_at='{self.expires_at}')>"


class EventLog(Base):
    __tablename__ = "event_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String, nullable=False, index=True, doc="Event type (ACCOUNT_DAY_STARTED, STOP, etc.)")
    target_chat_id = Column(String, default="", index=True, doc="Recipient (Telegram ID)")
    account_id = Column(String, default="", index=True, doc="Ad account ID")
    message = Column(Text, nullable=False, doc="Text of the sent message or event")
    status = Column(String, default="SUCCESS", nullable=False, doc="Status: SUCCESS or ERROR")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def __repr__(self):
        return f"<EventLog(type='{self.event_type}', chat='{self.target_chat_id}', status='{self.status}', time='{self.created_at}')>"


class AuditEvent(Base):
    """Append-only product audit trail, independent from notification delivery."""

    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_type = Column(String, default="system", nullable=False, index=True)
    actor_id = Column(String, default="monitoring_worker", nullable=False)
    category = Column(String, default="RULE_ACTION", nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    status = Column(String, default="SUCCESS", nullable=False, index=True)
    account_id = Column(String, default="", nullable=False, index=True)
    account_name = Column(String, default="", nullable=False)
    adset_id = Column(String, default="", nullable=False, index=True, doc="Empty when the action was not on an ad set")
    adset_name = Column(String, default="", nullable=False)
    entity_level = Column(
        String,
        default="adset",
        nullable=False,
        index=True,
        doc="Level of the entity the action was applied to: 'campaign', 'adset' or 'ad'",
    )
    entity_id = Column(String, default="", nullable=False, index=True, doc="Meta ID of this entity")
    entity_name = Column(String, default="", nullable=False)
    rule_id = Column(Integer, nullable=True, index=True)
    rule_name = Column(String, default="", nullable=False)
    action = Column(String, default="", nullable=False, index=True)
    message = Column(Text, default="", nullable=False)
    before_state = Column(JSONB, default=dict, nullable=False)
    after_state = Column(JSONB, default=dict, nullable=False)
    details = Column(JSONB, default=dict, nullable=False)
    correlation_id = Column(String, default="", nullable=False, index=True)
    reverts_event_id = Column(Integer, ForeignKey("audit_events.id"), nullable=True, unique=True, index=True)
    duration_ms = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<AuditEvent(type='{self.event_type}', account='{self.account_id}', "
            f"status='{self.status}', time='{self.created_at}')>"
        )


class AutomationScheduleState(Base):
    """Durable worker schedule state that survives restart and deploy."""

    __tablename__ = "automation_schedule_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    state_key = Column(String, unique=True, nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    account_id = Column(String, default="", nullable=False, index=True)
    rule_key = Column(String, default="", nullable=False, index=True)
    last_checked_at = Column(Float, default=0.0, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class RuleExecutionState(Base):
    """One durable execution slot per account/ad set/rule/action combination."""

    __tablename__ = "rule_execution_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    execution_key = Column(String, unique=True, nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    account_id = Column(String, default="", nullable=False, index=True)
    adset_id = Column(String, default="", nullable=False, index=True, doc="Empty when the slot is not about an ad set")
    entity_level = Column(String, default="adset", nullable=False, index=True)
    entity_id = Column(String, default="", nullable=False, index=True)
    rule_key = Column(String, default="", nullable=False, index=True)
    action = Column(String, default="", nullable=False, index=True)
    status = Column(String, default="IDLE", nullable=False, index=True)
    correlation_id = Column(String, default="", nullable=False, index=True)
    last_attempt_at = Column(Float, default=0.0, nullable=False)
    last_success_at = Column(Float, nullable=True)
    before_state = Column(JSONB, default=dict, nullable=False)
    after_state = Column(JSONB, default=dict, nullable=False)
    details = Column(JSONB, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ActionUndoState(Base):
    """Durable one-at-a-time claim for an idempotent audit action reversal."""

    __tablename__ = "action_undo_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    original_event_id = Column(Integer, ForeignKey("audit_events.id"), unique=True, nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    status = Column(String, default="PENDING", nullable=False, index=True)
    correlation_id = Column(String, default="", nullable=False, index=True)
    attempt_count = Column(Integer, default=1, nullable=False)
    expected_state = Column(JSONB, default=dict, nullable=False)
    desired_state = Column(JSONB, default=dict, nullable=False)
    last_error = Column(Text, default="", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class AnalyticsEntityFact(Base):
    """Normalized, workspace-isolated hierarchical metric fact store (Account -> Campaign -> AdSet -> Ad)."""

    __tablename__ = "analytics_entity_daily_facts"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "account_id",
            "entity_level",
            "entity_id",
            "date",
            name="uq_analytics_facts_ws_acc_level_entity_date",
        ),
        Index("ix_analytics_facts_ws_date_level", "workspace_id", "date", "entity_level"),
        Index("ix_analytics_facts_ws_parent_date", "workspace_id", "parent_entity_id", "date"),
        Index("ix_analytics_facts_acc_date", "account_id", "date"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_id = Column(String, nullable=False, index=True, doc="Meta Ad Account ID (act_...)")
    entity_level = Column(String(16), nullable=False, index=True, doc="'account', 'campaign', 'adset', 'ad'")
    entity_id = Column(String(64), nullable=False, index=True, doc="Meta ID of the entity")
    entity_name = Column(String(255), default="", nullable=False)
    parent_entity_id = Column(String(64), default="", nullable=False, index=True)
    date = Column(String(10), nullable=False, index=True, doc="Ad account local date (YYYY-MM-DD)")
    currency = Column(String(10), default="UNKNOWN", nullable=False)

    # Spend and delivery metrics
    spend = Column(Float, default=0.0, nullable=False)
    impressions = Column(Integer, default=0, nullable=False)
    reach = Column(Integer, default=0, nullable=False)
    frequency = Column(Float, default=0.0, nullable=False)
    cpm = Column(Float, default=0.0, nullable=False)

    # Click and engagement metrics
    clicks = Column(Integer, default=0, nullable=False)
    unique_clicks = Column(Integer, default=0, nullable=False)
    link_clicks = Column(Integer, default=0, nullable=False)
    outbound_clicks = Column(Integer, default=0, nullable=False)
    landing_page_views = Column(Integer, default=0, nullable=False)
    cpc = Column(Float, default=0.0, nullable=False)
    cpc_link = Column(Float, nullable=True)
    ctr = Column(Float, default=0.0, nullable=False)
    ctr_link = Column(Float, nullable=True)
    ctr_outbound = Column(Float, nullable=True)

    # Conversion funnel
    leads = Column(Integer, default=0, nullable=False)
    registrations = Column(Integer, default=0, nullable=False)
    purchases = Column(Integer, default=0, nullable=False)
    cost_per_lead = Column(Float, nullable=True)
    cost_per_registration = Column(Float, nullable=True)
    cost_per_purchase = Column(Float, nullable=True)
    cost_per_landing_page_view = Column(Float, nullable=True)

    # Extended Meta events
    raw_actions = Column(JSONB, default=list, nullable=False)

    # Statuses and budgets
    status = Column(String(32), default="UNKNOWN", nullable=False)
    effective_status = Column(String(32), default="UNKNOWN", nullable=False)
    daily_budget = Column(Float, default=0.0, nullable=False)

    # Metadata
    fetched_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    def __repr__(self):
        return (
            f"<AnalyticsEntityFact(ws={self.workspace_id}, acc='{self.account_id}', "
            f"level='{self.entity_level}', id='{self.entity_id}', date='{self.date}', spend={self.spend})>"
        )
