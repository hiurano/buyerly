"""The GraphQL client API (#509) allows exactly what the REST routes allow.

Every field of the schema runs a REST route's handler (api/client_api/bridge.py); production no
longer mounts those routes, so the test app mounts them as written. These tests hold each field to
its route: the same request as REST and as GraphQL, by people who may not do it
(signed out, from another workspace, a guest off every team, a plain member), must be refused with
the same status, and what is allowed must be allowed both ways. Each write has two copies of its
target, one for the REST request and one for the GraphQL one, so neither sees the other's effect.
"""

import json
import re
import secrets
import sys
import unittest
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.routes as api_routes_module
from api.client_api import schema as client_schema  # the ClientSchema the endpoint serves
from api.client_api.schema import ROUTES
from api.meta_oauth import router as meta_oauth_router
from api.routers import telegram as telegram_router
from api.routes import ALL_REST_ROUTERS, rest_only
from api.server import create_app
from core.config import settings
from core.rate_limit import limiter
from database.models import (
    Account,
    AuditEvent,
    Favorite,
    MetaConnection,
    RuleGroup,
    RulePreset,
    Team,
    TeamDocument,
    TeamMember,
    User,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

GRAPHQL = "/api/graphql"
NO_BODY = object()


def _case(method, path, variables, body=NO_BODY, meta=False):
    """A field's REST request and GraphQL variables, both of copy `n` of the fixture `f`.

    `meta`: the route calls Meta when allowed, so only people it refuses send it.
    """
    return {"method": method, "path": path, "variables": variables, "body": body, "meta": meta}


def _qs(**params):
    query = "&".join(f"{name}={value}" for name, value in params.items() if value is not None)
    return f"?{query}" if query else ""


# A browser's PushSubscription.toJSON(); the keys are a valid P-256 point and auth secret.
PUSH_SUBSCRIPTION = {
    "endpoint": "https://push.example.com/send/parity",
    "keys": {
        "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
        "auth": "tBHItJI5svbpez7KI4CCXg",
    },
}


# Every schema field, as its REST route. `f` is the fixture, `n` 1 for REST and 2 for GraphQL.
CASES = {
    # Queries
    "accounts": _case("GET", lambda f, n: "/api/accounts", lambda f, n: {}),
    "accountNotificationSetting": _case(
        "GET", lambda f, n: f"/api/accounts/{f.acc[n]}/notifications", lambda f, n: {"accountId": f.acc[n]}
    ),
    "analyticsHierarchy": _case(
        "GET", lambda f, n: f"/api/analytics/hierarchy{_qs(parent_id=f.acc[n], period='today')}",
        lambda f, n: {"parentId": f.acc[n], "period": "today"},
    ),
    "analyticsAccountsHierarchy": _case(
        "GET", lambda f, n: f"/api/analytics/hierarchy/accounts{_qs(account_ids=f.acc[n])}",
        lambda f, n: {"accountIds": f.acc[n]},
    ),
    "auditEvents": _case(
        "GET", lambda f, n: f"/api/audit-events{_qs(page_size=5, account_id=f.acc[n])}",
        lambda f, n: {"pageSize": 5, "accountId": f.acc[n]},
    ),
    "deletedItems": _case("GET", lambda f, n: "/api/deleted-items", lambda f, n: {}),
    "desktopNotifications": _case("GET", lambda f, n: "/api/notifications/desktop", lambda f, n: {}),
    "favorites": _case("GET", lambda f, n: "/api/favorites", lambda f, n: {}),
    "inbox": _case("GET", lambda f, n: "/api/inbox?limit=5", lambda f, n: {"limit": 5}),
    "inboxFacets": _case("GET", lambda f, n: "/api/inbox/facets", lambda f, n: {}),
    "inboxSenders": _case("GET", lambda f, n: "/api/inbox/senders", lambda f, n: {}),
    "inboxDisplay": _case("GET", lambda f, n: "/api/inbox/display", lambda f, n: {}),
    "inboxUnreadCount": _case("GET", lambda f, n: "/api/inbox/unread-count", lambda f, n: {}),
    "notificationChannels": _case("GET", lambda f, n: "/api/notifications/channels", lambda f, n: {}),
    "metaConnections": _case("GET", lambda f, n: "/api/meta/connections", lambda f, n: {}),
    "rules": _case("GET", lambda f, n: "/api/presets", lambda f, n: {}),
    "ruleLabels": _case("GET", lambda f, n: "/api/rule-labels", lambda f, n: {}),
    "ruleStates": _case(
        "GET", lambda f, n: f"/api/rule-states{_qs(entity_level='adset', entity_id='120000')}",
        lambda f, n: {"entityLevel": "adset", "entityId": "120000"},
    ),
    "ruleEntityStates": _case("GET", lambda f, n: f"/api/presets/{f.rule[n]}/states", lambda f, n: {"ruleId": f.rule[n]}),
    "rulePreview": _case(
        "GET", lambda f, n: f"/api/accounts/{f.acc[n]}/rules/{f.rule[n]}/preview",
        lambda f, n: {"accountId": f.acc[n], "ruleId": f.rule[n]},
    ),
    "ruleDraftCheck": _case(
        "POST", lambda f, n: "/api/presets/check", lambda f, n: {"input": f.rule_draft(n)}, lambda f, n: f.rule_draft(n)
    ),
    "ruleDraftPreview": _case(
        "POST", lambda f, n: f"/api/accounts/{f.acc[n]}/rules/preview",
        lambda f, n: {"accountId": f.acc[n], "input": f.rule_draft(n)}, lambda f, n: f.rule_draft(n),
    ),
    "search": _case("GET", lambda f, n: "/api/search?q=Tenant", lambda f, n: {"q": "Tenant"}),
    "stoppedAdSets": _case("GET", lambda f, n: "/api/adsets/stopped", lambda f, n: {}),
    "telegramConnection": _case("GET", lambda f, n: "/api/telegram/connection", lambda f, n: {}),
    "teams": _case("GET", lambda f, n: f"/api/workspaces/{f.ws}/teams", lambda f, n: {"workspaceId": f.ws}),
    "teamDocuments": _case(
        "GET", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/documents",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n]},
    ),
    "viewSettings": _case("GET", lambda f, n: "/api/view-settings", lambda f, n: {}),
    "workspaces": _case("GET", lambda f, n: "/api/workspaces", lambda f, n: {}),
    "workspaceMembers": _case("GET", lambda f, n: f"/api/workspaces/{f.ws}/members", lambda f, n: {"workspaceId": f.ws}),
    "workspaceInvites": _case("GET", lambda f, n: f"/api/workspaces/{f.ws}/invites", lambda f, n: {"workspaceId": f.ws}),
    "workspaceInviteLink": _case(
        "GET", lambda f, n: f"/api/workspaces/{f.ws}/invite-link", lambda f, n: {"workspaceId": f.ws}
    ),
    "workspaceSlugCheck": _case(
        "GET", lambda f, n: f"/api/onboarding/check-slug?slug=free-{n}", lambda f, n: {"slug": f"free-{n}"}
    ),
    # Mutations
    "accountUpdate": _case(
        "PATCH", lambda f, n: f"/api/accounts/{f.acc[n]}/profile",
        lambda f, n: {"accountId": f.acc[n], "input": {"note": f"note {n}"}}, lambda f, n: {"note": f"note {n}"},
    ),
    "accountLeadUpdate": _case(
        "PATCH", lambda f, n: f"/api/accounts/{f.acc[n]}/lead",
        lambda f, n: {"accountId": f.acc[n], "input": {"lead_user_id": None}}, lambda f, n: {"lead_user_id": None},
    ),
    "accountDelete": _case("DELETE", lambda f, n: f"/api/accounts/{f.acc[n]}", lambda f, n: {"accountId": f.acc[n]}),
    "accountNotificationSettingUpdate": _case(
        "PUT", lambda f, n: f"/api/accounts/{f.acc[n]}/notifications",
        lambda f, n: {"accountId": f.acc[n], "input": {"kinds": ["urgent"]}}, lambda f, n: {"kinds": ["urgent"]},
    ),
    "accountRuleAttach": _case(
        "POST", lambda f, n: f"/api/accounts/{f.acc[n]}/assign-rule",
        lambda f, n: {"accountId": f.acc[n], "input": {"preset_id": f.rule[n]}}, lambda f, n: {"preset_id": f.rule[n]},
    ),
    "accountRuleDetach": _case(
        "POST", lambda f, n: f"/api/accounts/{f.acc[n]}/detach-rule/{f.rule[n]}",
        lambda f, n: {"accountId": f.acc[n], "ruleId": f.rule[n]},
    ),
    "accountRuleScopeUpdate": _case(
        "PUT", lambda f, n: f"/api/accounts/{f.acc[n]}/rules/{f.rule[n]}/scope",
        lambda f, n: {"accountId": f.acc[n], "ruleId": f.rule[n], "input": {"level": "account", "ids": []}},
        lambda f, n: {"level": "account", "ids": []},
    ),
    "accountRulesToggle": _case(
        "POST", lambda f, n: f"/api/accounts/{f.acc[n]}/toggle-rules", lambda f, n: {"accountId": f.acc[n]}
    ),
    "adSetReactivate": _case(
        "POST", lambda f, n: f"/api/adsets/12000{n}/reactivate", lambda f, n: {"adSetId": f"12000{n}"}, meta=True
    ),
    "adSetDismiss": _case("POST", lambda f, n: f"/api/adsets/12000{n}/dismiss", lambda f, n: {"adSetId": f"12000{n}"}),
    "entityDeliveryUpdate": _case(
        "POST", lambda f, n: f"/api/entities/adset/12000{n}/delivery",
        lambda f, n: {"level": "adset", "entityId": f"12000{n}", "input": {"account_id": f.acc[n], "status": "PAUSED"}},
        lambda f, n: {"account_id": f.acc[n], "status": "PAUSED"}, meta=True,
    ),
    "entityBudgetUpdate": _case(
        "PATCH", lambda f, n: f"/api/entities/adset/12000{n}/budget",
        lambda f, n: {"level": "adset", "entityId": f"12000{n}", "input": {"account_id": f.acc[n], "daily_budget": 10}},
        lambda f, n: {"account_id": f.acc[n], "daily_budget": 10}, meta=True,
    ),
    "auditEventUndo": _case(
        "POST", lambda f, n: f"/api/audit-events/{f.event[n]}/undo", lambda f, n: {"id": f.event[n]}, meta=True
    ),
    "deletedItemRestore": _case(
        "POST", lambda f, n: f"/api/deleted-items/{f.deleted[n]}/restore", lambda f, n: {"id": f.deleted[n]}
    ),
    "favoriteCreate": _case(
        "POST", lambda f, n: "/api/favorites",
        lambda f, n: {"input": {"kind": "page", "path": f"team/T{n}/rules", "title": "Rules"}},
        lambda f, n: {"kind": "page", "path": f"team/T{n}/rules", "title": "Rules"},
    ),
    "favoriteDelete": _case("DELETE", lambda f, n: f"/api/favorites/{f.fav[n]}", lambda f, n: {"id": f.fav[n]}),
    "viewSettingUpdate": _case(
        "PUT", lambda f, n: f"/api/view-settings/rules{n}",
        lambda f, n: {"key": f"rules{n}", "input": {"settings": {"grouping": "none"}}},
        lambda f, n: {"settings": {"grouping": "none"}},
    ),
    "viewSettingReset": _case("DELETE", lambda f, n: f"/api/view-settings/rules{n}", lambda f, n: {"key": f"rules{n}"}),
    "workspaceViewDefaultUpdate": _case(
        "PUT", lambda f, n: f"/api/view-settings/rules{n}/default",
        lambda f, n: {"key": f"rules{n}", "input": {"settings": {"grouping": "none"}}},
        lambda f, n: {"settings": {"grouping": "none"}},
    ),
    "inboxDisplayUpdate": _case(
        "PUT", lambda f, n: "/api/inbox/display", lambda f, n: {"input": {"ordering": "oldest"}},
        lambda f, n: {"ordering": "oldest"},
    ),
    "inboxNotificationRead": _case(
        "POST", lambda f, n: f"/api/inbox/{f.event[n]}/read", lambda f, n: {"id": f.event[n], "input": {"read": True}},
        lambda f, n: {"read": True},
    ),
    "inboxNotificationDelete": _case("POST", lambda f, n: f"/api/inbox/{f.event[n]}/delete", lambda f, n: {"id": f.event[n]}),
    "inboxNotificationSnooze": _case(
        "POST", lambda f, n: f"/api/inbox/{f.event[n]}/snooze",
        lambda f, n: {"id": f.event[n], "input": {"until": None}}, lambda f, n: {"until": None},
    ),
    "inboxDeleteAll": _case("POST", lambda f, n: "/api/inbox/delete-all", lambda f, n: {}),
    "inboxDeleteAllRead": _case("POST", lambda f, n: "/api/inbox/delete-all-read", lambda f, n: {}),
    "desktopNotificationsSubscribe": _case(
        "POST", lambda f, n: "/api/notifications/desktop/subscribe", lambda f, n: {"input": PUSH_SUBSCRIPTION},
        lambda f, n: PUSH_SUBSCRIPTION,
    ),
    "desktopNotificationsUnsubscribe": _case(
        "POST", lambda f, n: "/api/notifications/desktop/unsubscribe",
        lambda f, n: {"input": {"endpoint": PUSH_SUBSCRIPTION["endpoint"]}},
        lambda f, n: {"endpoint": PUSH_SUBSCRIPTION["endpoint"]},
    ),
    "notificationChannelsUpdate": _case(
        "PUT", lambda f, n: "/api/notifications/channels", lambda f, n: {"input": {"invite_accepted": False}},
        lambda f, n: {"invite_accepted": False},
    ),
    "metaInviteCreate": _case("POST", lambda f, n: "/api/meta/invites", lambda f, n: {"input": {}}, lambda f, n: {}),
    "metaConnectionDiscover": _case(
        "POST", lambda f, n: f"/api/meta/connections/{f.conn[n]}/discover", lambda f, n: {"connectionId": f.conn[n]},
        meta=True,
    ),
    "metaConnectionImport": _case(
        "POST", lambda f, n: f"/api/meta/connections/{f.conn[n]}/import",
        lambda f, n: {"connectionId": f.conn[n], "input": {"account_ids": ["act_9"]}},
        lambda f, n: {"account_ids": ["act_9"]}, meta=True,
    ),
    "metaOauthStart": _case("POST", lambda f, n: "/api/meta/oauth/start", lambda f, n: {}),
    "onboardingPersonalDetailsUpdate": _case(
        "POST", lambda f, n: "/api/onboarding/personal-details",
        lambda f, n: {"input": {"first_name": f"Ann{n}", "last_name": "Lee"}},
        lambda f, n: {"first_name": f"Ann{n}", "last_name": "Lee"},
    ),
    "onboardingWorkspaceCreate": _case(
        "POST", lambda f, n: "/api/onboarding/workspace", lambda f, n: {"input": {"name": f"First {n} {f.salt}"}},
        lambda f, n: {"name": f"First {n} {f.salt}"},
    ),
    "onboardingInvitesSend": _case(
        "POST", lambda f, n: "/api/onboarding/invites", lambda f, n: {"input": {"invites": []}},
        lambda f, n: {"invites": []},
    ),
    "onboardingSkip": _case("POST", lambda f, n: "/api/onboarding/skip", lambda f, n: {}),
    "ruleCreate": _case(
        "POST", lambda f, n: "/api/presets", lambda f, n: {"input": f.rule_draft(n)}, lambda f, n: f.rule_draft(n)
    ),
    "ruleUpdate": _case(
        "PUT", lambda f, n: f"/api/presets/{f.rule[n]}", lambda f, n: {"id": f.rule[n], "input": f.rule_draft(n)},
        lambda f, n: f.rule_draft(n),
    ),
    "ruleDelete": _case("DELETE", lambda f, n: f"/api/presets/{f.spare_rule[n]}", lambda f, n: {"id": f.spare_rule[n]}),
    "ruleLabelsSet": _case(
        "PUT", lambda f, n: f"/api/presets/{f.rule[n]}/labels",
        lambda f, n: {"id": f.rule[n], "input": {"label_ids": [f.label[n]]}}, lambda f, n: {"label_ids": [f.label[n]]},
    ),
    "rulesLabelsChange": _case(
        "PATCH", lambda f, n: "/api/presets/labels",
        lambda f, n: {"input": {"preset_ids": [f.rule[n]], "add_label_ids": [f.label[n]]}},
        lambda f, n: {"preset_ids": [f.rule[n]], "add_label_ids": [f.label[n]]},
    ),
    "ruleLabelCreate": _case(
        "POST", lambda f, n: "/api/rule-labels", lambda f, n: {"input": {"name": f"New {n}"}},
        lambda f, n: {"name": f"New {n}"},
    ),
    "ruleLabelUpdate": _case(
        "PATCH", lambda f, n: f"/api/rule-labels/{f.label[n]}",
        lambda f, n: {"id": f.label[n], "input": {"description": "x"}}, lambda f, n: {"description": "x"},
    ),
    "ruleLabelDelete": _case(
        "DELETE", lambda f, n: f"/api/rule-labels/{f.spare_label[n]}", lambda f, n: {"id": f.spare_label[n]}
    ),
    "teamCreate": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/teams",
        lambda f, n: {"workspaceId": f.ws, "input": {"name": f"New {n}", "key": f"NEW{n}"}},
        lambda f, n: {"name": f"New {n}", "key": f"NEW{n}"},
    ),
    "teamUpdate": _case(
        "PATCH", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}",
        lambda f, n: {"workspaceId": f.ws, "id": f.team[n], "input": {"description": "x"}},
        lambda f, n: {"description": "x"},
    ),
    "teamRetire": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.spare_team[n]}/retire",
        lambda f, n: {"workspaceId": f.ws, "id": f.spare_team[n]},
    ),
    "teamRestore": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.spare_team[n]}/restore",
        lambda f, n: {"workspaceId": f.ws, "id": f.spare_team[n]},
    ),
    "teamDelete": _case(
        "DELETE", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.spare_team[n]}",
        lambda f, n: {"workspaceId": f.ws, "id": f.spare_team[n]},
    ),
    "teamMembersAdd": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/members",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n], "input": {"user_ids": [f.user[n]]}},
        lambda f, n: {"user_ids": [f.user[n]]},
    ),
    "teamMemberRemove": _case(
        "DELETE", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/members/{f.user[n]}",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n], "userId": f.user[n]},
    ),
    "teamMemberUpdate": _case(
        "PATCH", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/members/{f.owner}",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n], "userId": f.owner, "input": {"is_owner": True}},
        lambda f, n: {"is_owner": True},
    ),
    "teamAccountsAdd": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/accounts",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n], "input": {"account_ids": [f.acc_pk[n]]}},
        lambda f, n: {"account_ids": [f.acc_pk[n]]},
    ),
    "teamAccountRemove": _case(
        "DELETE", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/accounts/{f.acc_pk[n]}",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n], "accountId": f.acc_pk[n]},
    ),
    "teamDocumentCreate": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/documents",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n], "input": {"title": "Plan", "content": ""}},
        lambda f, n: {"title": "Plan", "content": ""},
    ),
    "teamDocumentUpdate": _case(
        "PATCH", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/documents/{f.doc[n]}",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n], "id": f.doc[n], "input": {"title": "New"}},
        lambda f, n: {"title": "New"},
    ),
    "teamDocumentDelete": _case(
        "DELETE", lambda f, n: f"/api/workspaces/{f.ws}/teams/{f.team[n]}/documents/{f.spare_doc[n]}",
        lambda f, n: {"workspaceId": f.ws, "teamId": f.team[n], "id": f.spare_doc[n]},
    ),
    "telegramLinkCreate": _case("POST", lambda f, n: "/api/telegram/link", lambda f, n: {}),
    "telegramDisconnect": _case("DELETE", lambda f, n: "/api/telegram/connection", lambda f, n: {}),
    "userUpdate": _case(
        "POST", lambda f, n: "/api/auth/update-profile", lambda f, n: {"input": {"title": f"Buyer {n}"}},
        lambda f, n: {"title": f"Buyer {n}"},
    ),
    "workspaceCreate": _case(
        "POST", lambda f, n: "/api/workspaces", lambda f, n: {"input": {"name": f"Other {n} {f.salt}"}},
        lambda f, n: {"name": f"Other {n} {f.salt}"},
    ),
    "workspaceUpdate": _case(
        "PATCH", lambda f, n: f"/api/workspaces/{f.ws}", lambda f, n: {"id": f.ws, "input": {"name": f"Tenant B {n}"}},
        lambda f, n: {"name": f"Tenant B {n}"},
    ),
    "workspaceDelete": _case("DELETE", lambda f, n: f"/api/workspaces/{f.ws}", lambda f, n: {"id": f.ws}),
    "workspaceSwitch": _case(
        "POST", lambda f, n: "/api/workspaces/switch", lambda f, n: {"input": {"workspace_id": f.ws}},
        lambda f, n: {"workspace_id": f.ws},
    ),
    "workspaceLeave": _case("POST", lambda f, n: f"/api/workspaces/{f.ws}/leave", lambda f, n: {"id": f.ws}),
    "workspaceOwnershipTransfer": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/transfer-ownership",
        lambda f, n: {"id": f.ws, "input": {"new_owner_user_id": f.user[n]}}, lambda f, n: {"new_owner_user_id": f.user[n]},
    ),
    "workspaceMemberUpdate": _case(
        "PATCH", lambda f, n: f"/api/workspaces/{f.ws}/members/{f.user[n]}",
        lambda f, n: {"workspaceId": f.ws, "userId": f.user[n], "input": {"role": "admin"}}, lambda f, n: {"role": "admin"},
    ),
    "workspaceMemberRemove": _case(
        "DELETE", lambda f, n: f"/api/workspaces/{f.ws}/members/{f.user[n]}",
        lambda f, n: {"workspaceId": f.ws, "userId": f.user[n]},
    ),
    "workspaceInviteCreate": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/invites",
        lambda f, n: {"workspaceId": f.ws, "input": {"email": f"new{n}@example.test", "role": "member"}},
        lambda f, n: {"email": f"new{n}@example.test", "role": "member"},
    ),
    "workspaceInviteDelete": _case(
        "DELETE", lambda f, n: f"/api/workspaces/{f.ws}/invites/{f.invite[n]}",
        lambda f, n: {"workspaceId": f.ws, "id": f.invite[n]},
    ),
    "workspaceInviteResend": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/invites/{f.invite[n]}/resend",
        lambda f, n: {"workspaceId": f.ws, "id": f.invite[n]},
    ),
    "workspaceInviteAccept": _case(
        "POST", lambda f, n: f"/api/invites/{f.token[n]}/accept", lambda f, n: {"token": f.token[n]}
    ),
    "workspaceInviteLinkEnable": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/invite-link", lambda f, n: {"workspaceId": f.ws}
    ),
    "workspaceInviteLinkReset": _case(
        "POST", lambda f, n: f"/api/workspaces/{f.ws}/invite-link/reset", lambda f, n: {"workspaceId": f.ws}
    ),
    "workspaceInviteLinkDisable": _case(
        "DELETE", lambda f, n: f"/api/workspaces/{f.ws}/invite-link", lambda f, n: {"workspaceId": f.ws}
    ),
}

# Allowed to anyone in the workspace, and the REST request's effect changes what the GraphQL one
# finds: after leaving there is nothing to leave. The outsider's refusals are still compared.
CHANGES_THE_PERSON = {"workspaceLeave", "workspaceSwitch"}


def _schema_fields() -> dict:
    graphql_schema = client_schema._schema
    return {
        **{name: ("query", field) for name, field in graphql_schema.query_type.fields.items()},
        **{name: ("mutation", field) for name, field in graphql_schema.mutation_type.fields.items()},
    }


def _document(name: str, variables: dict) -> str:
    kind, field = _schema_fields()[name]
    declared = ", ".join(f"${arg}: {field.args[arg].type}" for arg in variables)
    passed = ", ".join(f"{arg}: ${arg}" for arg in variables)
    selection = " { success lastSyncId }" if kind == "mutation" else ""
    return (
        f"{kind} Op{f'({declared})' if declared else ''} "
        f"{{ {name}{f'({passed})' if passed else ''}{selection} }}"
    )


class Fixture:
    pass


class TestClientApi(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        api_routes_module.async_session_maker = self.sessions
        # Every field runs here, so every module a route reaches reads this test's database,
        # also the few api.routes does not reach (favorites, telegram, the Inbox's channels).
        self.patched = {
            module: module.async_session_maker
            for module in list(sys.modules.values())
            if getattr(module, "__name__", "").startswith(("api.", "services.", "core."))
            and hasattr(module, "async_session_maker")
        }
        for module in self.patched:
            module.async_session_maker = self.sessions
        settings.ADMIN_CHAT_ID = "8634201356"
        f = self.f = Fixture()
        f.salt = secrets.token_hex(3)
        now = datetime.now(timezone.utc)

        async with self.sessions() as session:
            def person(telegram_id, username):
                return User(telegram_id=telegram_id, username=username, full_name=username.title(),
                            role="buyer", is_approved=True, onboarding_completed=True, onboarding_step="completed")

            self.owner = person("700000001", "owner")
            self.member = person("700000002", "member")
            self.guest = person("700000003", "guest")
            self.outsider = person("700000004", "outsider")
            extra = [person(f"70000001{n}", f"extra{n}") for n in (1, 2)]
            session.add_all([self.owner, self.member, self.guest, self.outsider, *extra])
            await session.flush()
            ws_b = Workspace(name="Tenant B", slug="tenant-b", owner_user_id=self.owner.id)
            ws_a = Workspace(name="Tenant A", slug="tenant-a", owner_user_id=self.outsider.id)
            session.add_all([ws_a, ws_b])
            await session.flush()
            members = {
                "owner": WorkspaceMember(workspace_id=ws_b.id, user_id=self.owner.id, role="owner"),
                "member": WorkspaceMember(workspace_id=ws_b.id, user_id=self.member.id, role="member"),
                "guest": WorkspaceMember(workspace_id=ws_b.id, user_id=self.guest.id, role="guest"),
            }
            extra_members = [WorkspaceMember(workspace_id=ws_b.id, user_id=user.id, role="member") for user in extra]
            session.add_all([*members.values(), *extra_members,
                             WorkspaceMember(workspace_id=ws_a.id, user_id=self.outsider.id, role="owner")])
            for user in (self.owner, self.member, self.guest, *extra):
                user.active_workspace_id = ws_b.id
            self.outsider.active_workspace_id = ws_a.id
            await session.flush()

            f.ws, f.owner = ws_b.id, self.owner.id
            f.user = {1: extra[0].id, 2: extra[1].id}
            f.acc, f.acc_pk, f.rule, f.spare_rule, f.label, f.spare_label = {}, {}, {}, {}, {}, {}
            f.team, f.spare_team, f.doc, f.spare_doc, f.invite, f.token = {}, {}, {}, {}, {}, {}
            f.event, f.fav, f.conn = {}, {}, {}
            for n in (1, 2):
                account = Account(account_id=f"act_20000{n}", name=f"Tenant B Account {n}", workspace_id=ws_b.id,
                                  owner_user_id=self.owner.id, timezone_name="UTC", currency="USD", is_active=True)
                rules = [RulePreset(workspace_id=ws_b.id, owner_user_id=self.owner.id, name=f"Rule {n}{suffix}",
                                    action="turn_off", conditions=[{"metric": "spend", "operator": "gte", "value": 10}])
                         for suffix in ("", " spare")]
                labels = [RuleGroup(workspace_id=ws_b.id, owner_user_id=self.owner.id, name=f"Label {n}{suffix}",
                                    position=n) for suffix in ("", " spare")]
                teams = [Team(workspace_id=ws_b.id, name=f"Team {n}{suffix}", key=f"T{n}{suffix[:2].strip()}")
                         for suffix in ("", " S")]
                invite = WorkspaceInvite(workspace_id=ws_b.id, token=secrets.token_urlsafe(16), email=f"inv{n}@example.test",
                                         role="member", inviter_user_id=self.owner.id, status="pending",
                                         expires_at=now + timedelta(days=3))
                event = AuditEvent(workspace_id=ws_b.id, owner_user_id=self.owner.id, actor_type="user",
                                   actor_id=str(self.owner.telegram_id), category="MANUAL_ACTION",
                                   event_type="UPDATE_ACCOUNT_PROFILE", status="SUCCESS", account_id=account.account_id,
                                   message="Profile updated", before_state={"note": ""}, after_state={"note": "x"})
                connection = MetaConnection(workspace_id=ws_b.id, owner_user_id=self.owner.id,
                                            provider_user_id=f"fb{n}", access_token_encrypted="encrypted")
                favorite = Favorite(member_id=members["owner"].id, kind="page", path=f"team/T{n}/campaigns",
                                    title="Campaigns", position=n, created_at=now)
                session.add_all([account, *rules, *labels, *teams, invite, event, connection, favorite])
                await session.flush()
                docs = [TeamDocument(team_id=teams[0].id, title=f"Doc {n}{suffix}", content="")
                        for suffix in ("", " spare")]
                session.add_all([*docs, TeamMember(team_id=teams[0].id, member_id=extra_members[n - 1].id)])
                await session.flush()
                f.acc[n], f.acc_pk[n] = account.account_id, account.id
                f.rule[n], f.spare_rule[n] = rules[0].id, rules[1].id
                f.label[n], f.spare_label[n] = labels[0].id, labels[1].id
                f.team[n], f.spare_team[n] = teams[0].id, teams[1].id
                f.doc[n], f.spare_doc[n] = docs[0].id, docs[1].id
                f.invite[n], f.token[n] = invite.id, invite.token
                f.event[n], f.fav[n], f.conn[n] = event.id, favorite.id, connection.id
            await session.commit()

        f.rule_draft = lambda n: {
            "name": f"Draft {n}", "action": "turn_off", "level": "adset",
            "conditions": [{"metric": "spend", "operator": "gte", "value": 10, "time_window": "today"}],
        }
        self.app = create_app()
        # The routes as written, which production no longer mounts: each field is compared with its own.
        rest = APIRouter(prefix="/api")
        for rest_router in ALL_REST_ROUTERS:
            rest.include_router(rest_router)
        self.app.include_router(rest)
        self.app.include_router(meta_oauth_router)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")
        self.headers = {}
        for name, user in (("owner", self.owner), ("member", self.member), ("guest", self.guest), ("outsider", self.outsider)):
            self.headers[name] = await session_headers(self.sessions, {"id": int(user.telegram_id)})
        self.headers["anonymous"] = {}
        # Deleted items are what the routes leave behind: delete one spare rule per copy the REST way.
        f.deleted = {}
        for n in (1, 2):
            response = await self.client.delete(f"/api/presets/{f.spare_rule[n]}", headers=self.headers["owner"])
            self.assertEqual(response.status_code, 200, response.text)
            f.deleted[n] = response.json()["deleted_item_id"]
            async with self.sessions() as session:
                rule = RulePreset(workspace_id=ws_b.id, owner_user_id=self.owner.id, name=f"Rule {n} spare again",
                                  action="turn_off", conditions=[])
                session.add(rule)
                await session.commit()
                f.spare_rule[n] = rule.id

    async def asyncTearDown(self):
        await self.client.aclose()
        for module, original in self.patched.items():
            module.async_session_maker = original
        await self.engine.dispose()

    async def _rest(self, actor: str, name: str) -> tuple[int, object]:
        case = CASES[name]
        kwargs = {"headers": self.headers[actor]}
        if case["body"] is not NO_BODY:
            kwargs["json"] = case["body"](self.f, 1)
        elif case["method"] in ("POST", "PUT", "PATCH"):
            kwargs["json"] = {}
        response = await self.client.request(case["method"], case["path"](self.f, 1), **kwargs)
        return response.status_code, response.json() if response.content else None

    async def _graphql(self, actor: str, name: str, document: str | None = None, variables: dict | None = None):
        if variables is None:
            variables = CASES[name]["variables"](self.f, 2)
        response = await self.client.post(
            GRAPHQL,
            json={"query": document or _document(name, variables), "variables": variables},
            headers=self.headers[actor],
        )
        if response.status_code != 200:
            return response.status_code, response.json()
        body = response.json()
        if body.get("errors"):
            error = body["errors"][0]
            self.assertIn("statusCode", error.get("extensions", {}), f"{name}: an unexpected error {error}")
            return error["extensions"]["statusCode"], error
        return 200, body["data"][name]

    async def _assert_same_as_rest(self, actor: str, skip=frozenset()):
        compared = 0
        for name, case in CASES.items():
            if name in skip:
                continue
            rest_status, rest_body = await self._rest(actor, name)
            if case["meta"] and rest_status < 400:
                self.fail(f"{name}: {actor} may run a route that calls Meta; give the test a fake Meta first")
            gql_status, gql_body = await self._graphql(actor, name)
            self.assertEqual(
                rest_status < 300 or rest_status,
                gql_status < 300 or gql_status,
                f"{name} as {actor}: REST {rest_status} {rest_body}, GraphQL {gql_status} {gql_body}",
            )
            compared += 1
        return compared

    async def test_every_field_runs_a_route_and_is_checked_here(self):
        fields = set(_schema_fields())
        self.assertEqual(fields, set(ROUTES), "every field names the REST route it runs in ROUTES")
        self.assertEqual(fields, set(CASES), "every field is compared with its route in CASES")

    async def test_signed_out_requests_are_refused_before_any_field_runs(self):
        for name in CASES:
            status, _ = await self._graphql("anonymous", name)
            rest_status, _ = await self._rest("anonymous", name)
            self.assertEqual((rest_status, status), (401, 401), name)

    async def test_a_write_needs_the_csrf_token_as_rest_does(self):
        cookie_only = {"Cookie": self.headers["owner"]["Cookie"]}
        response = await self.client.post(
            GRAPHQL, json={"query": "{ favorites }"}, headers=cookie_only
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "CSRF check failed"})
        # Never through GET, where the browser sends no CSRF token.
        response = await self.client.get(f"{GRAPHQL}?query={{favorites}}", headers=self.headers["owner"])
        self.assertNotEqual(response.status_code, 200)

    async def test_another_workspace_sees_and_changes_nothing(self):
        self.assertEqual(await self._assert_same_as_rest("outsider"), len(CASES))

    async def test_a_guest_off_every_team_is_refused_as_by_rest(self):
        await self._assert_same_as_rest("guest", skip=CHANGES_THE_PERSON)

    async def test_a_member_may_do_what_rest_lets_a_member_do(self):
        await self._assert_same_as_rest("member", skip=CHANGES_THE_PERSON)

    async def test_reads_return_what_the_routes_return(self):
        for name, case in CASES.items():
            if _schema_fields()[name][0] != "query" or case["method"] != "GET":
                continue
            variables = case["variables"](self.f, 1)
            rest_status, rest_body = await self._rest("owner", name)
            gql_status, gql_body = await self._graphql("owner", name, variables=variables)
            self.assertEqual((gql_status, gql_body), (rest_status, rest_body), name)

    async def test_a_mutation_returns_its_record_and_the_sync_id_to_wait_for(self):
        response = await self.client.post(GRAPHQL, headers=self.headers["owner"], json={
            "query": "mutation($input: JSON!) { ruleLabelCreate(input: $input) { success lastSyncId ruleLabel } }",
            "variables": {"input": {"name": "Scaling", "color": "#4cb782"}},
        })
        payload = response.json()["data"]["ruleLabelCreate"]
        self.assertTrue(payload["success"])
        self.assertEqual(payload["ruleLabel"]["name"], "Scaling")
        delta = (await self.client.get(f"/api/sync/delta?since={int(payload['lastSyncId']) - 1}",
                                       headers=self.headers["owner"])).json()
        # The label's own change is at most lastSyncId, so a client current to it has the label.
        label_changes = [action for action in delta["actions"]
                         if action["model"] == "Label" and str(action["model_id"]) == str(payload["ruleLabel"]["id"])]
        self.assertTrue(label_changes, delta)
        self.assertTrue(all(action["sync_id"] <= payload["lastSyncId"] for action in label_changes))

    async def test_writes_sent_together_are_each_answered_on_their_own(self):
        # The client's transaction queue (#508) sends what is waiting as one document, a field per write.
        response = await self.client.post(GRAPHQL, headers=self.headers["owner"], json={
            "query": (
                "mutation Transactions($t0_input: JSON!, $t1_accountId: String!, $t1_input: JSON!, $t2_input: JSON!) {"
                " t0: ruleLabelCreate(input: $t0_input) { success lastSyncId ruleLabel }"
                " t1: accountUpdate(accountId: $t1_accountId, input: $t1_input) { success lastSyncId }"
                " t2: ruleLabelCreate(input: $t2_input) { success lastSyncId ruleLabel } }"
            ),
            "variables": {
                "t0_input": {"name": "First", "color": "#4cb782"},
                "t1_accountId": "act_404", "t1_input": {},
                "t2_input": {"name": "Third", "color": "#4cb782"},
            },
        })
        self.assertEqual(response.status_code, 200)
        body = response.json()
        # The refused one is null with its error; the others before and after it are made and answered.
        self.assertEqual(body["data"]["t0"]["ruleLabel"]["name"], "First")
        self.assertIsNone(body["data"]["t1"])
        self.assertEqual(body["data"]["t2"]["ruleLabel"]["name"], "Third")
        self.assertEqual([error["path"] for error in body["errors"]], [["t1"]])
        rest = await self.client.patch("/api/accounts/act_404/profile", json={}, headers=self.headers["owner"])
        self.assertEqual(body["errors"][0]["extensions"]["statusCode"], rest.status_code)
        self.assertLessEqual(body["data"]["t0"]["lastSyncId"], body["data"]["t2"]["lastSyncId"])

    async def test_a_refusal_keeps_the_routes_status_and_words(self):
        status, error = await self._graphql("owner", "accountUpdate", variables={"accountId": "act_404", "input": {}})
        rest = await self.client.patch("/api/accounts/act_404/profile", json={}, headers=self.headers["owner"])
        self.assertEqual(status, rest.status_code)
        self.assertEqual(error["message"], rest.json()["detail"])
        status, error = await self._graphql(
            "owner", "favoriteCreate", variables={"input": {"kind": "nope", "path": "a", "title": "A"}}
        )
        self.assertEqual((status, error["message"]), (422, "Unknown kind of favorite."))
        status, error = await self._graphql("owner", "auditEvents", variables={"pageSize": 1000})
        self.assertEqual(status, 422)

    async def test_production_serves_these_routes_only_as_graphql(self):
        production = create_app()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=production), base_url="http://test") as client:
            for name, route in ROUTES.items():
                path = route.path if route.path.startswith("/api") else "/api" + route.path
                path = re.sub(r"\{[^}]+\}", "1", path)
                for method in route.methods:
                    response = await client.request(method, path, headers=self.headers["owner"])
                    self.assertIn(
                        (response.status_code, response.text),
                        ((404, '{"detail":"Not Found"}'), (405, '{"detail":"Method Not Allowed"}')),
                        f"{name}'s route {method} {path} still answers over REST",
                    )
            # Sync, sign-in, uploads and public links stay REST: each answers, if only to say its record is not there.
            for method, path in (
                ("GET", "/api/sync/bootstrap"), ("GET", "/api/auth/sessions"), ("GET", "/api/me"),
                ("DELETE", "/api/onboarding/avatar"), ("GET", "/api/invites/unknown"),
                ("GET", "/api/meta/invites/public/unknown"), ("GET", "/api/meta/oauth/callback"),
            ):
                response = await client.request(method, path, headers=self.headers["owner"])
                self.assertNotEqual(response.status_code, 405, f"{method} {path}")
                self.assertNotEqual(response.text, '{"detail":"Not Found"}', f"{method} {path}")
        # Telegram's webhook answers 404 to anyone but Telegram, so it is checked on its router.
        self.assertIn(telegram_router.telegram_webhook, [route.endpoint for route in rest_only(telegram_router.router).routes])

    async def test_one_request_cannot_repeat_a_field_without_limit(self):
        aliases = " ".join(f"a{index}: favorites" for index in range(20))
        response = await self.client.post(GRAPHQL, json={"query": f"{{ {aliases} }}"}, headers=self.headers["owner"])
        self.assertIsNone(response.json().get("data"))
        self.assertIn("aliases", json.dumps(response.json()["errors"]).lower())


if __name__ == "__main__":
    unittest.main()
