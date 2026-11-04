"""The /api router: every REST router without the routes the client API serves, plus GraphQL."""

import sys
from typing import Any

from fastapi import APIRouter

# Tests read and patch these through this module (see _RoutesModule below).
from api.deps import _summary_cache, invalidate_summary_cache
from api.routers import (
    accounts_router,
    admin_support_router,
    adsets_router,
    audit_router,
    delivery_router,
    desktop_notifications_router,
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
from api.client_api import router as client_api_router
from api.client_api.schema import ROUTES as CLIENT_API_ROUTES
from database.db import async_session_maker


# Every REST router, as written. The routes the client API serves (api/client_api/schema.py, #509)
# are not mounted over HTTP: GraphQL runs their handlers, with the routes' own checks.
ALL_REST_ROUTERS = [
    auth_router,
    admin_support_router,
    workspaces_router,
    members_router,
    onboarding_router,
    accounts_router,
    rules_router,
    search_router,
    trash_router,
    teams_router,
    summary_router,
    settings_router,
    audit_router,
    telegram_router,
    adsets_router,
    delivery_router,
    desktop_notifications_router,
    health_router,
    analytics_router,
    views_router,
    favorites_router,
    account_notifications_router,
    sync_router,
]

_CLIENT_API_ONLY = {id(route) for route in CLIENT_API_ROUTES.values()}


def rest_only(source: APIRouter) -> APIRouter:
    """`source` without the routes the client API serves; sync, sign-in, uploads, public links and webhooks stay."""
    kept = APIRouter()
    kept.routes.extend(route for route in source.routes if id(route) not in _CLIENT_API_ONLY)
    return kept


# Master API Router (prefix="/api")
router = APIRouter(prefix="/api")
for rest_router in ALL_REST_ROUTERS:
    router.include_router(rest_only(rest_router))
router.include_router(client_api_router)

class _RoutesModule(sys.modules[__name__].__class__):
    """Custom module class to propagate dynamically patched attributes (e.g. in tests) to submodules."""

    def __setattr__(self, name: str, value: Any) -> None:
        super().__setattr__(name, value)
        if name == "async_session_maker":
            import api.client_api.bridge
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
            api.client_api.bridge.async_session_maker = value
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
    "ALL_REST_ROUTERS",
    "rest_only",
    "router",
    "async_session_maker",
    "_summary_cache",
    "invalidate_summary_cache",
]
