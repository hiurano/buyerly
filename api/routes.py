"""API router aggregation and backward compatibility exports."""

import logging
import sys
from typing import Any, Dict, List, Optional

from fastapi import APIRouter

import database.db
from api.deps import (
    RESERVED_WORKSPACE_SLUGS,
    SUMMARY_CACHE_TTL,
    SUMMARY_COLUMN_MAX_WIDTH,
    SUMMARY_COLUMN_MIN_WIDTH,
    SUMMARY_DEFAULT_COLUMN_WIDTHS,
    SUMMARY_FILTER_KEYS,
    SUMMARY_FILTER_STATUSES,
    SUMMARY_REQUIRED_COLUMNS,
    SUMMARY_SNAPSHOT_RETENTION,
    SUMMARY_TABLE_COLUMNS,
    SUMMARY_VIEW_MODES,
    SUMMARY_VIEW_PERIODS,
    SUMMARY_VIEW_SCOPE,
    _analytics_view_response,
    _require_admin,
    _cost_or_none,
    _currency_total_payload,
    _enrich_summary_account_metadata,
    _ensure_compatible_rule_set,
    _ensure_stable_account_owner,
    _get_workspace_presets,
    _latest_account_metrics_by_id,
    _load_active_rules,
    _load_json_object,
    _load_persisted_summary,
    _normalize_summary_view_config,
    _persist_summary,
    _preset_response,
    _preset_snapshot,
    _summary_cache,
    _summary_owner_key,
    _summary_snapshot_reference,
    _summary_with_cache_metadata,
    _unique_preset_ids,
    _utc_iso,
    _validated_condition_payloads,
    ensure_workspace_write_access,
    get_user_accounts,
    get_user_workspace,
    get_user_workspace_member,
    get_user_workspaces_list,
    invalidate_summary_cache,
    slugify,
)
from api.routers import (
    accounts_router,
    admin_support_router,
    adsets_router,
    audit_router,
    delivery_router,
    auth_router,
    members_router,
    onboarding_router,
    rules_router,
    search_router,
    settings_router,
    summary_router,
    teams_router,
    telegram_router,
    trash_router,
    workspaces_router,
    health_router,
    analytics_router,
    views_router,
    favorites_router,
    account_notifications_router,
    sync_router,
)
from api.schemas import (
    AccountItem,
    AccountLatestMetrics,
    AccountProfileUpdateRequest,
    AnalyticsViewPreferenceRequest,
    ApplyPresetRequest,
    AutomationSettingsUpdateRequest,
    BatchAddAccountEntry,
    BatchAddRequest,
    BulkInviteItem,
    CheckSlugResponse,
    ConditionItem,
    CreatePresetRequest,
    CreateWorkspaceInviteRequest,
    CreateWorkspaceRequest,
    LoginResponse,
    OnboardingBulkInvitesRequest,
    OnboardingBulkInvitesResponse,
    OnboardingStatusResponse,
    OnboardingWorkspaceRequest,
    ParsedAccountItem,
    ParseRawRequest,
    PersonalDetailsRequest,
    PublicInviteInfoResponse,
    RequestTemporaryPasswordRequest,
    VerifyEmailLinkRequest,
    RuleLabelCreateRequest,
    RuleLabelUpdateRequest,
    RuleLabelResponse,
    PresetLabelsRequest,
    BulkPresetLabelsRequest,
    RulePresetItem,
    SetIntervalRequest,
    SwitchWorkspaceRequest,
    TransferOwnershipRequest,
    UpdateMemberRoleRequest,
    UpdateProfileRequest,
    UpdateWorkspaceRequest,
    UserProfileResponse,
    WorkspaceInviteItem,
    WorkspaceMemberItem,
    WorkspaceItem,
)
from database.db import async_session_maker

logger = logging.getLogger(__name__)

# Master API Router (prefix="/api")
router = APIRouter(prefix="/api")

# Mount all modular domain routers
router.include_router(auth_router)
router.include_router(admin_support_router)
router.include_router(workspaces_router)
router.include_router(members_router)
router.include_router(onboarding_router)
router.include_router(accounts_router)
router.include_router(rules_router)
router.include_router(search_router)
router.include_router(trash_router)
router.include_router(teams_router)
router.include_router(summary_router)
router.include_router(settings_router)
router.include_router(audit_router)
router.include_router(telegram_router)
router.include_router(adsets_router)
router.include_router(delivery_router)
router.include_router(health_router)
router.include_router(analytics_router)
router.include_router(views_router)
router.include_router(favorites_router)
router.include_router(account_notifications_router)
router.include_router(sync_router)

class _RoutesModule(sys.modules[__name__].__class__):
    """Custom module class to propagate dynamically patched attributes (e.g. in tests) to submodules."""

    def __setattr__(self, name: str, value: Any) -> None:
        super().__setattr__(name, value)
        if name == "async_session_maker":
            import api.deps
            import api.meta_oauth
            import api.routers.account_notifications
            import api.routers.accounts
            import api.routers.admin_support
            import api.routers.adsets
            import api.routers.analytics
            import api.routers.audit
            import api.routers.auth
            import api.routers.delivery
            import api.routers.members
            import api.routers.onboarding
            import api.routers.rules
            import api.routers.search
            import api.routers.settings
            import api.routers.summary
            import api.routers.teams
            import api.routers.trash
            import api.routers.views
            import api.routers.workspaces
            import api.routers.health
            import database.db

            database.db.async_session_maker = value
            api.deps.async_session_maker = value
            api.meta_oauth.async_session_maker = value
            api.routers.account_notifications.async_session_maker = value
            api.routers.accounts.async_session_maker = value
            api.routers.admin_support.async_session_maker = value
            api.routers.adsets.async_session_maker = value
            api.routers.analytics.async_session_maker = value
            api.routers.audit.async_session_maker = value
            api.routers.auth.async_session_maker = value
            api.routers.delivery.async_session_maker = value
            api.routers.members.async_session_maker = value
            api.routers.onboarding.async_session_maker = value
            api.routers.rules.async_session_maker = value
            api.routers.search.async_session_maker = value
            api.routers.settings.async_session_maker = value
            api.routers.summary.async_session_maker = value
            api.routers.teams.async_session_maker = value
            api.routers.trash.async_session_maker = value
            api.routers.views.async_session_maker = value
            api.routers.workspaces.async_session_maker = value
            api.routers.health.async_session_maker = value


sys.modules[__name__].__class__ = _RoutesModule

__all__ = [
    "router",
    "async_session_maker",
    "_summary_cache",
    "invalidate_summary_cache",
    "SUMMARY_CACHE_TTL",
    "SUMMARY_SNAPSHOT_RETENTION",
    "SUMMARY_VIEW_SCOPE",
    "SUMMARY_TABLE_COLUMNS",
    "SUMMARY_REQUIRED_COLUMNS",
    "SUMMARY_VIEW_MODES",
    "SUMMARY_VIEW_PERIODS",
    "SUMMARY_FILTER_KEYS",
    "SUMMARY_FILTER_STATUSES",
    "SUMMARY_COLUMN_MIN_WIDTH",
    "SUMMARY_COLUMN_MAX_WIDTH",
    "SUMMARY_DEFAULT_COLUMN_WIDTHS",
    "slugify",
    "RESERVED_WORKSPACE_SLUGS",
    "get_user_workspace",
    "get_user_workspaces_list",
    "get_user_workspace_member",
    "ensure_workspace_write_access",
    "get_user_accounts",
    "_ensure_stable_account_owner",
    "_load_active_rules",
    "_preset_snapshot",
    "_preset_response",
    "_validated_condition_payloads",
    "_ensure_compatible_rule_set",
    "_unique_preset_ids",
    "_get_workspace_presets",
    "_load_json_object",
    "_utc_iso",
    "_cost_or_none",
    "_currency_total_payload",
    "_summary_with_cache_metadata",
    "_summary_owner_key",
    "_normalize_summary_view_config",
    "_analytics_view_response",
    "_summary_snapshot_reference",
    "_latest_account_metrics_by_id",
    "_enrich_summary_account_metadata",
    "_load_persisted_summary",
    "_persist_summary",
    "_require_admin",
    "WorkspaceItem",
    "CreateWorkspaceRequest",
    "UpdateWorkspaceRequest",
    "SwitchWorkspaceRequest",
    "WorkspaceMemberItem",
    "UpdateMemberRoleRequest",
    "TransferOwnershipRequest",
    "CreateWorkspaceInviteRequest",
    "WorkspaceInviteItem",
    "PublicInviteInfoResponse",
    "UserProfileResponse",
    "RequestTemporaryPasswordRequest",
    "VerifyEmailLinkRequest",
    "LoginResponse",
    "UpdateProfileRequest",
    "OnboardingStatusResponse",
    "PersonalDetailsRequest",
    "CheckSlugResponse",
    "OnboardingWorkspaceRequest",
    "BulkInviteItem",
    "OnboardingBulkInvitesRequest",
    "OnboardingBulkInvitesResponse",
    "ConditionItem",
    "RulePresetItem",
    "CreatePresetRequest",
    "RuleLabelCreateRequest",
    "RuleLabelUpdateRequest",
    "RuleLabelResponse",
    "PresetLabelsRequest",
    "BulkPresetLabelsRequest",
    "ApplyPresetRequest",
    "AccountLatestMetrics",
    "AccountItem",
    "AccountProfileUpdateRequest",
    "ParseRawRequest",
    "ParsedAccountItem",
    "BatchAddAccountEntry",
    "BatchAddRequest",
    "AnalyticsViewPreferenceRequest",
    "SetIntervalRequest",
    "AutomationSettingsUpdateRequest",
]
