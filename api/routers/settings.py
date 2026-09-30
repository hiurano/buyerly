import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select

from api.auth import get_current_user
from api.deps import _confirm_admin_password, _load_json_object, _utc_iso
from api.schemas import AutomationSettingsUpdateRequest, SetIntervalRequest
from database.db import async_session_maker
from database.models import AppSettings, AutomationRuntimeState, User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Settings"])

# The monitoring row is shared by every workspace, so only global aggregates
# leave it. Rows written before #203 still hold raw error texts with foreign
# account IDs and Meta credentials; an allowlist keeps those out.
_PUBLIC_RUNTIME_KEYS = (
    "cycle_id",
    "started_at",
    "finished_at",
    "duration_ms",
    "accounts_checked",
    "accounts_skipped",
    "rules_checked",
    "adsets_checked",
    "actions_count",
    "errors_count",
    "last_backup_at",
    "synthetic",
    "updated_at",
)
_PUBLIC_USAGE_KEYS = ("max_percent", "app", "accounts_observed", "updated_at")


def _public_runtime(payload: dict) -> dict:
    runtime = {key: payload[key] for key in _PUBLIC_RUNTIME_KEYS if key in payload}
    usage = payload.get("usage")
    if isinstance(usage, dict):
        runtime["usage"] = {key: usage[key] for key in _PUBLIC_USAGE_KEYS if key in usage}
    return runtime


@router.get("/settings")
async def get_settings(user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        res = await session.execute(select(AppSettings).limit(1))
        app_settings = res.scalar_one_or_none()
        runtime_row = (
            await session.execute(
                select(AutomationRuntimeState).where(
                    AutomationRuntimeState.state_key == "monitoring"
                )
            )
        ).scalar_one_or_none()
        runtime = _public_runtime(_load_json_object(runtime_row.payload) if runtime_row else {})
        if runtime_row and "updated_at" not in runtime:
            runtime["updated_at"] = _utc_iso(runtime_row.updated_at)
        return {
            "poll_interval_minutes": app_settings.poll_interval_minutes if app_settings else 10,
            "critical_rule_interval_minutes": (
                app_settings.critical_rule_interval_minutes if app_settings else 2
            ),
            "stop_confirmation_minutes": (
                app_settings.stop_confirmation_minutes if app_settings else 10
            ),
            "inventory_cache_minutes": app_settings.inventory_cache_minutes if app_settings else 5,
            "account_health_interval_minutes": (
                app_settings.account_health_interval_minutes if app_settings else 15
            ),
            "max_concurrent_accounts": app_settings.max_concurrent_accounts if app_settings else 3,
            "max_concurrent_actions": app_settings.max_concurrent_actions if app_settings else 3,
            "usage_soft_limit_percent": app_settings.usage_soft_limit_percent if app_settings else 60,
            "usage_hard_limit_percent": app_settings.usage_hard_limit_percent if app_settings else 80,
            "adaptive_polling_enabled": (
                app_settings.adaptive_polling_enabled if app_settings else True
            ),
            "user_role": user.role,
            "runtime": runtime,
        }


@router.post("/settings/automation")
async def update_automation_settings(
    payload: AutomationSettingsUpdateRequest,
    user: User = Depends(get_current_user),
):
    """Update global polling controls after explicit account-password confirmation."""
    async with async_session_maker() as session:
        await _confirm_admin_password(session, user, payload.current_password)
        app_settings = (
            await session.execute(select(AppSettings).limit(1))
        ).scalar_one_or_none()
        if app_settings is None:
            app_settings = AppSettings()
            session.add(app_settings)

        for field_name in (
            "poll_interval_minutes",
            "critical_rule_interval_minutes",
            "stop_confirmation_minutes",
            "inventory_cache_minutes",
            "account_health_interval_minutes",
            "max_concurrent_accounts",
            "max_concurrent_actions",
            "usage_soft_limit_percent",
            "usage_hard_limit_percent",
            "adaptive_polling_enabled",
        ):
            setattr(app_settings, field_name, getattr(payload, field_name))
        await session.commit()

    return {
        "success": True,
        "message": "Automation settings saved",
    }


@router.post("/settings/interval")
async def set_poll_interval(payload: SetIntervalRequest, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        await _confirm_admin_password(session, user, payload.current_password)
        res = await session.execute(select(AppSettings).limit(1))
        app_settings = res.scalar_one_or_none()
        if not app_settings:
            app_settings = AppSettings(poll_interval_minutes=payload.minutes)
            session.add(app_settings)
        else:
            app_settings.poll_interval_minutes = payload.minutes
        await session.commit()

    return {
        "success": True,
        "poll_interval_minutes": payload.minutes,
        "message": f"Base monitoring interval changed to {payload.minutes} minutes",
    }
