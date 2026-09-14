import html
import logging
from typing import Optional
from aiogram import Bot
from rules.engine import RuleEvaluationResult
from bot.keyboards import get_reactivate_keyboard
from bot.keyboards import get_undo_action_keyboard
from database.db import async_session_maker
from database.models import EventLog
from core.currency import format_money, normalize_currency
from core.logging_config import redact_secrets

logger = logging.getLogger(__name__)


def _cost_text(value: Optional[float], currency: str) -> str:
    return format_money(value, currency)


def format_account_day_started_message(
    *,
    account_name: str,
    account_id: str,
    local_date: str,
    local_time: str,
    timezone_name: str,
    utc_offset: str,
) -> str:
    safe_name = html.escape(str(account_name or ""))
    safe_acc_id = html.escape(str(account_id or ""))
    safe_date = html.escape(str(local_date or "—"))
    safe_time = html.escape(str(local_time or "00:00"))
    safe_tz = html.escape(str(timezone_name or "UTC"))
    safe_offset = html.escape(str(utc_offset or "UTC"))
    return (
        "🌅 <b>A new day has started in the ad account</b>\n\n"
        f"🏢 <b>Ad account:</b> {safe_name} (<code>{safe_acc_id}</code>)\n"
        f"📅 <b>New date:</b> <code>{safe_date}</code>\n"
        f"🕛 <b>Local time:</b> <code>{safe_time}</code>\n"
        f"🌍 <b>Time zone:</b> <code>{safe_tz}</code> ({safe_offset})\n\n"
        "<i>A new Meta daily period has begun. You can use this moment "
        "as a reference point for launching and tuning rules.</i>"
    )

class TelegramNotifier:
    """
    Formats and sends alerts and reports to Telegram for a specific owner or admin,
    recording every event in the logs and the EventLog table.
    """

    def __init__(self, bot: Bot, target_chat_id: str = ""):
        self.bot = bot
        self.default_chat_id = target_chat_id

    async def _save_event_log(self, event_type: str, chat_id: str, account_id: str, message: str, status: str = "SUCCESS"):
        try:
            async with async_session_maker() as session:
                log_entry = EventLog(
                    event_type=event_type,
                    target_chat_id=str(chat_id),
                    account_id=str(account_id),
                    message=message,
                    status=status
                )
                session.add(log_entry)
                await session.commit()
        except Exception as e:
            logger.error(f"Failed to save EventLog to DB: {e}")

    async def send_alert(
        self,
        event_type: str,
        account_name: str,
        account_id: str,
        target_chat_id: str = "",
        eval_result: Optional[RuleEvaluationResult] = None,
        timezone_name: str = "",
        local_time: str = "",
        **kwargs
    ):
        from core.config import settings
        chat_id = target_chat_id or self.default_chat_id or settings.ADMIN_CHAT_ID
        if not chat_id:
            logger.warning(f"No target_chat_id configured for event {event_type} (Account: {account_id}). Alert skipped.")
            return

        text = ""
        keyboard = None
        currency = normalize_currency(
            eval_result.currency if eval_result else kwargs.get("currency")
        )

        safe_account_name = html.escape(str(account_name or ""))
        safe_account_id = html.escape(str(account_id or ""))
        safe_adset_name = html.escape(str(eval_result.entity_name or "")) if eval_result else ""
        safe_adset_id = html.escape(str(eval_result.entity_id or "")) if eval_result else ""
        safe_reason = html.escape(str(eval_result.reason or "")) if eval_result else ""
        # The inline buttons drive ad set handlers, so a campaign notification
        # is informational until campaign handlers exist.
        is_adset_target = bool(eval_result and eval_result.is_adset)
        entity_label = {
            "adset": "AdSet",
            "campaign": "Campaign",
            "ad": "Ad",
        }.get(eval_result.entity_level if eval_result else "adset", "AdSet")

        try:
            # 1. STOPPING AN AD SET
            if event_type == "STOP" and eval_result:
                text = (
                    f"🛑 <b>Auto-stop: {entity_label}</b>\n\n"
                    f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)\n"
                    f"🎯 <b>{entity_label}:</b> <code>{safe_adset_name}</code> (ID: <code>{safe_adset_id}</code>)\n"
                    f"💰 <b>Spend:</b> {format_money(eval_result.spend, currency)}\n"
                    f"👥 <b>Leads:</b> {eval_result.leads} | <b>Regs:</b> {eval_result.registrations} | <b>Purchases:</b> {eval_result.purchases}\n"
                    f"📊 <b>CPL:</b> {_cost_text(eval_result.cpl, currency)} | <b>CPReg:</b> {_cost_text(eval_result.cpreg, currency)} | <b>CPP:</b> {_cost_text(eval_result.cpp, currency)}\n\n"
                    f"⚠️ <i>Reason: {safe_reason}</i>"
                )

            # 2. LATE LEAD / REGISTRATION (OFFER TO TURN BACK ON)
            elif event_type == "PROPOSE_REACTIVATE" and eval_result:
                text = (
                    f"🟢 <b>A late result landed in the stopped {entity_label}.</b>\n\n"
                    f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)\n"
                    f"🎯 <b>{entity_label}:</b> <code>{safe_adset_name}</code> (ID: <code>{safe_adset_id}</code>)\n"
                    f"💰 <b>Final spend:</b> {format_money(eval_result.spend, currency)}\n"
                    f"👥 <b>Leads:</b> {eval_result.leads} | <b>Regs:</b> {eval_result.registrations} | <b>Purchases:</b> {eval_result.purchases}\n"
                    f"🎯 <b>CPL:</b> {_cost_text(eval_result.cpl, currency)} | <b>CPReg:</b> {_cost_text(eval_result.cpreg, currency)} | <b>CPP:</b> {_cost_text(eval_result.cpp, currency)}\n\n"
                    f"❓ <i>The result is back within range. Turn the ad set on again?</i>"
                )
                if is_adset_target:
                    keyboard = get_reactivate_keyboard(
                        account_id=account_id,
                        adset_id=eval_result.entity_id
                    )

            # 3. AUTO TURN-ON
            elif event_type == "AUTO_REACTIVATE" and eval_result:
                text = (
                    f"⚡ <b>Auto-resume: {entity_label} (a late result landed)</b>\n\n"
                    f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)\n"
                    f"🎯 <b>{entity_label}:</b> <code>{safe_adset_name}</code>\n"
                    f"💰 <b>Spend:</b> {format_money(eval_result.spend, currency)} | <b>Leads:</b> {eval_result.leads} | <b>Regs:</b> {eval_result.registrations} | <b>Purchases:</b> {eval_result.purchases}\n"
                    f"📊 <b>CPL:</b> {_cost_text(eval_result.cpl, currency)} | <b>CPReg:</b> {_cost_text(eval_result.cpreg, currency)} | <b>CPP:</b> {_cost_text(eval_result.cpp, currency)}\n\n"
                    f"✅ <i>The ad set was set to ACTIVE automatically.</i>"
                )

            # 3.1. NOTIFICATION ONLY (send notification only)
            elif event_type == "NOTIFY_ONLY" and eval_result:
                text = (
                    f"🔔 <b>Heads up: a rule fired (notification only)</b>\n\n"
                    f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)\n"
                    f"🎯 <b>{entity_label}:</b> <code>{safe_adset_name}</code> (ID: <code>{safe_adset_id}</code>)\n"
                    f"💰 <b>Spend:</b> {format_money(eval_result.spend, currency)}\n"
                    f"👥 <b>Leads:</b> {eval_result.leads} | <b>Regs:</b> {eval_result.registrations} | <b>Purchases:</b> {eval_result.purchases}\n"
                    f"📊 <b>CPL:</b> {_cost_text(eval_result.cpl, currency)} | <b>CPReg:</b> {_cost_text(eval_result.cpreg, currency)} | <b>CPP:</b> {_cost_text(eval_result.cpp, currency)}\n\n"
                    f"⚠️ <i>{safe_reason}</i>"
                )
                if is_adset_target:
                    from bot.keyboards import get_pause_adset_keyboard
                    keyboard = get_pause_adset_keyboard(
                        account_id=account_id,
                        adset_id=eval_result.entity_id
                    )

            # BUDGET INCREASE
            elif event_type == "INCREASE_BUDGET" and eval_result:
                old_b = kwargs.get("old_budget", 0.0)
                new_b = kwargs.get("new_budget", 0.0)
                text = (
                    f"📈 <b>Ad set budget increased</b>\n\n"
                    f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)\n"
                    f"🎯 <b>{entity_label}:</b> <code>{safe_adset_name}</code> (ID: <code>{safe_adset_id}</code>)\n"
                    f"💰 <b>Budget:</b> {format_money(old_b, currency)} → <b>{format_money(new_b, currency)}</b> (+{eval_result.budget_change_percent:.0f}%)\n"
                    f"📊 <b>Spend:</b> {format_money(eval_result.spend, currency)} | <b>Leads:</b> {eval_result.leads} | <b>Regs:</b> {eval_result.registrations}\n\n"
                    f"⚠️ <i>{safe_reason}</i>"
                )

            # BUDGET DECREASE
            elif event_type == "DECREASE_BUDGET" and eval_result:
                old_b = kwargs.get("old_budget", 0.0)
                new_b = kwargs.get("new_budget", 0.0)
                text = (
                    f"📉 <b>Ad set budget decreased</b>\n\n"
                    f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)\n"
                    f"🎯 <b>{entity_label}:</b> <code>{safe_adset_name}</code> (ID: <code>{safe_adset_id}</code>)\n"
                    f"💰 <b>Budget:</b> {format_money(old_b, currency)} → <b>{format_money(new_b, currency)}</b> (-{eval_result.budget_change_percent:.0f}%)\n"
                    f"📊 <b>Spend:</b> {format_money(eval_result.spend, currency)} | <b>Leads:</b> {eval_result.leads} | <b>Regs:</b> {eval_result.registrations}\n\n"
                    f"⚠️ <i>{safe_reason}</i>"
                )

            # 4. A NEW CALENDAR DAY IN THE AD ACCOUNT
            elif event_type == "ACCOUNT_DAY_STARTED":
                text = format_account_day_started_message(
                    account_name=account_name,
                    account_id=account_id,
                    local_date=str(kwargs.get("local_date") or "—"),
                    local_time=local_time or "00:00",
                    timezone_name=timezone_name or "UTC",
                    utc_offset=str(kwargs.get("utc_offset") or "UTC"),
                )

            # 5. AD ACCOUNT PROBLEM (BAN / HOLD / REVIEW)
            elif event_type == "ACCOUNT_ISSUE":
                safe_status = html.escape(str(local_time or ""))
                text = (
                    f"🚨 <b>ATTENTION: there is a problem with the ad account status in Meta.</b>\n\n"
                    f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)\n"
                    f"⚠️ <b>Status:</b> {safe_status}\n\n"
                    f"🛑 <i>Monitoring of this ad account is paused for now to avoid errors.</i>"
                )

            # 6. BROKEN ACCESS TOKEN
            elif event_type == "TOKEN_EXPIRED":
                subcode = kwargs.get("subcode")
                subcode_title = html.escape(str(kwargs.get("subcode_title") or "").strip())
                subcode_description = html.escape(str(kwargs.get("subcode_description") or "").strip())
                action_hint = html.escape(str(kwargs.get("action_hint") or "").strip())
                raw_user_msg = redact_secrets(str(kwargs.get("user_msg") or "").strip())[:350]
                user_msg = html.escape(raw_user_msg)

                lines = ["🔑 <b>ATTENTION: there is a problem with the Meta API token.</b>\n"]
                lines.append(f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)")

                if subcode_title:
                    subcode_str = f" <i>(Subcode {subcode})</i>" if subcode is not None else ""
                    lines.append(f"🏷 <b>Diagnosis:</b> {subcode_title}{subcode_str}")

                if subcode_description:
                    lines.append(f"📋 <b>Reason:</b> {subcode_description}")
                elif not subcode_title:
                    lines.append("⚠️ <i>The access token became invalid, or its lifetime expired.</i>")

                if user_msg:
                    lines.append(f"💬 <i>«{user_msg}»</i>")

                hint = action_hint or "Refresh the token via the bot (the '➕ Add ad accounts' button)."
                lines.append(f"\n💡 <b>What to do:</b> {hint}")
                lines.append("🛑 <i>Monitoring of this ad account is paused for now.</i>")

                text = "\n".join(lines)

            elif event_type in {"ACCOUNT_HEALTH_ALERT", "ACCOUNT_HEALTH_RECOVERED"}:
                recovered = event_type == "ACCOUNT_HEALTH_RECOVERED"
                safe_status = html.escape(str(kwargs.get("health_status") or "unknown"))
                safe_cause = html.escape(str(kwargs.get("health_cause") or "none"))
                safe_message = html.escape(
                    redact_secrets(str(kwargs.get("health_message") or ""))[:240]
                )
                title = "✅ Ad account health restored" if recovered else "🚨 Ad account monitoring problem"
                text = (
                    f"{title}\n\n"
                    f"🏢 <b>Ad account:</b> {safe_account_name} (<code>{safe_account_id}</code>)\n"
                    f"📊 <b>Status:</b> {safe_status}\n"
                    f"🧭 <b>Source:</b> {safe_cause}"
                )
                if safe_message:
                    text += f"\n⚠️ <b>Details:</b> {safe_message}"

            audit_event_id = kwargs.get("audit_event_id")
            if audit_event_id and event_type in {
                "STOP",
                "AUTO_REACTIVATE",
                "INCREASE_BUDGET",
                "DECREASE_BUDGET",
            }:
                keyboard = get_undo_action_keyboard(audit_event_id)

            if text:
                logger.info(f"Sending Telegram alert [{event_type}] to chat_id={chat_id} (Account: {account_id})")
                await self.bot.send_message(
                    chat_id=chat_id,
                    text=text,
                    reply_markup=keyboard,
                    parse_mode="HTML"
                )
                logger.info(f"✅ Alert [{event_type}] delivered successfully to chat_id={chat_id}")
                await self._save_event_log(event_type=event_type, chat_id=chat_id, account_id=account_id, message=text, status="SUCCESS")

        except Exception as e:
            logger.error(f"❌ Failed to send telegram alert [{event_type}] to {chat_id}: {e}")
            await self._save_event_log(event_type=event_type, chat_id=chat_id, account_id=account_id, message=f"FAILED: {e}\n{text}", status="ERROR")
