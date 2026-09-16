import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import List
from aiogram import Router, F, Bot
from aiogram.filters import Command, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery
from sqlalchemy import and_, delete, func, or_, select

from core.config import settings
from core.audit import build_audit_event
from core.action_undo import UndoError, undo_audit_action
from core.currency import format_money, normalize_currency
from core.ownership import entity_is_owned_by, owned_by
from core.meta_tokens import (
    MetaTokenError,
    encrypt_meta_token,
    resolve_account_access_token,
)
from core.timezones import resolve_account_clock
from database.db import async_session_maker
from database.models import (
    Account,
    AllowedEmail,
    AppSettings,
    AuditEvent,
    StoppedAdSet,
    User,
    WebSession,
    WorkspaceMember,
    WorkspaceSupportGrant,
)
from meta_api.client import MetaClient
from bot.keyboards import (
    get_main_menu_keyboard,
    get_cancel_keyboard,
    get_period_keyboard,
    get_interval_keyboard,
    get_account_manage_keyboard,
    get_admin_approval_keyboard,
    get_admin_panel_keyboard,
    get_admin_whitelist_keyboard,
    get_undo_action_keyboard,
)

logger = logging.getLogger(__name__)
router = Router()
meta_client = MetaClient()

# ----------------------------------------------------
# FSM: STEP-BY-STEP WIZARD FOR ADDING A BATCH OF AD ACCOUNTS
# ----------------------------------------------------
class BatchAccountAddStates(StatesGroup):
    waiting_for_ids = State()
    waiting_for_name = State()
    waiting_for_token = State()


class AdminWhitelistStates(StatesGroup):
    waiting_for_email = State()


# ----------------------------------------------------
# USER AUTHENTICATION AND ACCESS CHECKS
# ----------------------------------------------------
async def check_user_access(message: Message, bot: Bot) -> bool:
    tg_id = str(message.from_user.id)
    username = message.from_user.username or ""
    full_name = message.from_user.full_name or ""

    is_configured_admin = bool(settings.ADMIN_CHAT_ID) and (
        tg_id == str(settings.ADMIN_CHAT_ID)
    )

    async with async_session_maker() as session:
        res = await session.execute(select(User).where(User.telegram_id == tg_id))
        user = res.scalar_one_or_none()

        if not user:
            user = User(
                telegram_id=tg_id,
                username=username or f"user_{tg_id}",
                full_name=full_name,
                role="admin" if is_configured_admin else "buyer",
                is_approved=is_configured_admin,
            )
            session.add(user)
            await session.commit()

            # Notify every approved database admin about a pending request.
            if not is_configured_admin:
                admin_result = await session.execute(
                    select(User.telegram_id).where(
                        User.role == "admin",
                        User.is_approved == True,
                        User.telegram_id.is_not(None),
                    )
                )
                admin_ids = list(dict.fromkeys(admin_result.scalars().all()))
                for admin_id in admin_ids:
                    admin_text = (
                        f"🔔 <b>New Buyerly access request!</b>\n\n"
                        f"👤 <b>User:</b> {full_name} (@{username})\n"
                        f"🆔 <b>Telegram ID:</b> <code>{tg_id}</code>\n\n"
                        f"Grant access to the system?"
                    )
                    try:
                        await bot.send_message(
                            chat_id=admin_id,
                            text=admin_text,
                            reply_markup=get_admin_approval_keyboard(tg_id),
                            parse_mode="HTML",
                        )
                    except Exception as e:
                        logger.error(
                            "Error notifying an admin about new user %s: %s",
                            tg_id,
                            e,
                        )

        if not user.is_approved:
            await message.answer(
                f"⛔️ <b>Access restricted</b>\n\n"
                f"Your Telegram ID: <code>{tg_id}</code>\n"
                f"Your access request was sent to an administrator. You will be notified as soon as it is approved.",
                parse_mode="HTML"
            )
            return False

        return True


# ----------------------------------------------------
# 1. THE /START COMMAND AND MAIN MENU
# ----------------------------------------------------
@router.message(StateFilter("*"), CommandStart())
async def cmd_start(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    has_access = await check_user_access(message, bot)
    if not has_access:
        return

    tg_id = str(message.from_user.id)
    async with async_session_maker() as session:
        is_admin = await _is_admin_user(session, tg_id)

    text = (
        "👋 <b>Welcome to Buyerly!</b>\n\n"
        "An autonomous monitoring and automation-rule system for Facebook Ads.\n\n"
        "<b>What it does:</b>\n"
        "• ⏱ <b>Auto-monitoring:</b> checks spend, leads and registrations every 10–60 min\n"
        "• 🛑 <b>Automation rules:</b> a flexible condition builder (CPL, CPReg, CPP, Spend and events) with AND/OR logic\n"
        "• 🟢 <b>Late-conversion catch:</b> one button to turn an ad set back on when a conversion lands late\n"
        "• 🌅 <b>New account day:</b> an exact notification at 00:00 in the Meta time zone\n"
        "• 📊 <b>Summary and Spend:</b> personal statistics for your ad accounts\n\n"
        "Use the menu buttons below to control it."
    )
    await message.answer(text, reply_markup=get_main_menu_keyboard(is_admin=is_admin), parse_mode="HTML")


def parse_fb_raw_accounts(raw_text: str) -> List[dict]:
    """
    Smart parser: extracts ad account IDs and names even from raw Facebook Business Manager text.
    Safe against excessively long input (DoS / ReDoS mitigation).
    """
    if not raw_text:
        return []
    if len(raw_text) > 65536:
        raw_text = raw_text[:65536]

    lines = [l.strip() for l in raw_text.strip().split("\n") if l.strip()]
    if len(lines) > 2000:
        lines = lines[:2000]

    id_name_pairs = []
    
    for i, line in enumerate(lines):
        match = re.search(r"(?:Ad account ID|Account ID|ID|act_)[:\s]*(\d{8,25})", line, re.IGNORECASE)
        if match:
            acc_id = f"act_{match.group(1)}"
            name = ""
            if i > 0 and not re.search(r"(?:Ad account ID|Owned by|info for|scope|permission)", lines[i-1], re.IGNORECASE):
                name = lines[i-1][:120].strip()
            id_name_pairs.append((acc_id, name))
            
    if not id_name_pairs:
        all_ids = re.findall(r"(?:act_)?(\d{8,25})", raw_text)
        for num in list(dict.fromkeys(all_ids)):
            id_name_pairs.append((f"act_{num}", ""))
            
    seen = set()
    final_list = []
    for acc_id, name in id_name_pairs:
        if acc_id not in seen:
            seen.add(acc_id)
            final_list.append({"account_id": acc_id, "parsed_name": name})
        if len(final_list) >= 500:
            break
    return final_list


# ----------------------------------------------------
# 2. STEP-BY-STEP AD ACCOUNT ADDING (IN BATCHES)
# ----------------------------------------------------
@router.message(StateFilter("*"), F.text.in_(["➕ Add ad accounts", "➕ Add ad account", "/add"]))
async def start_add_wizard(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    has_access = await check_user_access(message, bot)
    if not has_access:
        return

    await state.set_state(BatchAccountAddStates.waiting_for_ids)
    text = (
        "➕ <b>Adding ad accounts (step 1 of 3)</b>\n\n"
        "Send a list of ad account IDs, or <b>paste text straight from Facebook Business Manager</b>.\n\n"
        "💡 <i>The bot recognises every ad account ID and name in the text on its own.</i>\n\n"
        "<b>Example:</b>\n"
        "<code>act_1234567890123456\n"
        "1070862758952340</code>\n"
        "<i>or paste a copied block containing 'Ad account ID: ...'</i>"
    )
    await message.answer(text, reply_markup=get_cancel_keyboard(), parse_mode="HTML")


@router.message(StateFilter("*"), F.text.in_(["❌ Cancel adding", "❌ Cancel", "/cancel"]))
async def cancel_add_wizard(message: Message, state: FSMContext):
    await state.clear()
    tg_id = str(message.from_user.id)
    async with async_session_maker() as session:
        is_admin = await _is_admin_user(session, tg_id)
    await message.answer("❌ Adding ad accounts cancelled.", reply_markup=get_main_menu_keyboard(is_admin=is_admin))


@router.message(BatchAccountAddStates.waiting_for_ids)
async def process_account_ids(message: Message, state: FSMContext):
    raw_text = message.text.strip()
    
    # The user pressed cancel
    if raw_text in ["❌ Cancel adding", "❌ Cancel", "/cancel"]:
        await state.clear()
        tg_id = str(message.from_user.id)
        async with async_session_maker() as session:
            is_admin = await _is_admin_user(session, tg_id)
        await message.answer("❌ Adding ad accounts cancelled.", reply_markup=get_main_menu_keyboard(is_admin=is_admin))
        return

    parsed_accounts = parse_fb_raw_accounts(raw_text)
    
    if not parsed_accounts:
        await message.answer("❌ No ad account IDs found. Send numeric IDs, or paste the text from Facebook.", parse_mode="HTML")
        return

    await state.update_data(parsed_accounts=parsed_accounts)
    await state.set_state(BatchAccountAddStates.waiting_for_name)

    lines = []
    for a in parsed_accounts[:10]:
        name_str = f" ({a['parsed_name']})" if a['parsed_name'] else ""
        lines.append(f"• <code>{a['account_id']}</code>{name_str}")
    if len(parsed_accounts) > 10:
        lines.append(f"<i>...and {len(parsed_accounts) - 10} more ad accounts</i>")

    text = (
        f"✅ <b>Ad accounts recognised: {len(parsed_accounts)}</b>\n"
        + "\n".join(lines) + "\n\n"
        "📝 <b>Step 2 of 3: a name for the batch</b>\n\n"
        "Enter a shared name (for example <code>Sweden</code> or <code>Underdog</code>).\n"
        "<i>The bot numbers them automatically: Sweden 1, Sweden 2...</i>\n\n"
        "💡 <i>Or send <code>-</code> (a hyphen) to keep the names found in Facebook.</i>"
    )
    await message.answer(text, reply_markup=get_cancel_keyboard(), parse_mode="HTML")


@router.message(BatchAccountAddStates.waiting_for_name)
async def process_batch_name(message: Message, state: FSMContext):
    batch_name = message.text.strip()
    await state.update_data(batch_name=batch_name)
    await state.set_state(BatchAccountAddStates.waiting_for_token)

    text = (
        "🔑 <b>Step 3 of 3: access token</b>\n\n"
        "Send the System User access token:\n"
        "<i>(One token covers the whole batch of ad accounts)</i>\n\n"
        "💡 <i>If you do not have a token, press '🔑 Token guide'.</i>"
    )
    await message.answer(text, reply_markup=get_cancel_keyboard(), parse_mode="HTML")


@router.message(BatchAccountAddStates.waiting_for_token)
async def process_token_and_save(message: Message, state: FSMContext):
    token = message.text.strip()
    data = await state.get_data()
    parsed_accounts: List[dict] = data.get("parsed_accounts", [])
    batch_name = data.get("batch_name", "-")
    owner_id = str(message.from_user.id)

    progress_msg = await message.answer(f"⏳ Checking and connecting {len(parsed_accounts)} ad accounts through the Meta API...")

    try:
        _ = encrypt_meta_token(token)
    except MetaTokenError as exc:
        logger.error("Manual Meta token encryption is unavailable: %s", exc)
        await state.clear()
        await progress_msg.edit_text(
            "⛔️ Secure storage of the Meta access token is temporarily unavailable."
        )
        return

    added_results = []
    error_results = []

    async with async_session_maker() as session:
        owner_user = (
            await session.execute(
                select(User).where(User.telegram_id == owner_id)
            )
        ).scalar_one_or_none()
        if not owner_user or not owner_user.is_approved:
            await state.clear()
            await progress_msg.edit_text("⛔️ Access not confirmed.")
            return

        active_workspace_id = owner_user.active_workspace_id
        if active_workspace_id is None:
            await state.clear()
            await progress_msg.edit_text("⛔️ Choose an active workspace first.")
            return

        member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == active_workspace_id,
                    WorkspaceMember.user_id == owner_user.id,
                )
            )
        ).scalar_one_or_none()
        caller_role = member.role if member else None
        if caller_role is None and owner_user.role == "admin":
            grant = (
                await session.execute(
                    select(WorkspaceSupportGrant).where(
                        WorkspaceSupportGrant.workspace_id == active_workspace_id,
                        WorkspaceSupportGrant.user_id == owner_user.id,
                        WorkspaceSupportGrant.expires_at > datetime.now(timezone.utc),
                        WorkspaceSupportGrant.revoked_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            caller_role = grant.role if grant else None
        if caller_role not in ("owner", "admin", "buyer"):
            await state.clear()
            await progress_msg.edit_text("⛔️ You do not have permission to change the active workspace.")
            return

        for idx, item in enumerate(parsed_accounts, start=1):
            acc_id = item["account_id"]
            parsed_name = item.get("parsed_name", "")

            try:
                acc_info = await meta_client.get_account_info(acc_id, token)
                timezone_name = str(acc_info.get("timezone_name") or "").strip()
                if resolve_account_clock(timezone_name) is None:
                    raise RuntimeError(
                        "Meta did not return a supported time zone for the ad account."
                    )
                fb_name = acc_info.get("name", acc_id)
                currency = normalize_currency(acc_info.get("currency"))
                
                # Build the name
                if batch_name != "-" and len(batch_name) > 0:
                    display_name = f"{batch_name} {idx}" if len(parsed_accounts) > 1 else batch_name
                elif parsed_name:
                    display_name = parsed_name
                else:
                    display_name = fb_name

                # Check whether it already exists in the database
                res = await session.execute(select(Account).where(Account.account_id == acc_id))
                existing = res.scalar_one_or_none()

                if existing:
                    if existing.workspace_id != active_workspace_id:
                        error_results.append(
                            f"• <code>{acc_id}</code>: this ad account is already connected in another workspace."
                        )
                        continue
                    if existing.owner_user_id != owner_user.id and caller_role not in ("owner", "admin"):
                        error_results.append(
                            f"• <code>{acc_id}</code>: this ad account was added by another buyer; only the workspace owner or an admin can update it."
                        )
                        continue

                    if existing.timezone_name != timezone_name:
                        existing.last_day_start_date = ""
                    existing.name = display_name
                    existing.access_token = ""
                    existing.access_token_encrypted = encrypt_meta_token(token)
                    existing.meta_connection_id = None
                    existing.timezone_name = timezone_name
                    existing.currency = currency
                    existing.batch_name = batch_name if batch_name != "-" else ""
                    existing.is_active = True
                else:
                    new_acc = Account(
                        workspace_id=active_workspace_id,
                        account_id=acc_id,
                        name=display_name,
                        access_token="",
                        access_token_encrypted=encrypt_meta_token(token),
                        owner_user_id=owner_user.id,
                        batch_name=batch_name if batch_name != "-" else "",
                        timezone_name=timezone_name,
                        currency=currency,
                        rules_enabled=False,
                        is_active=True
                    )
                    session.add(new_acc)

                added_results.append(f"• <b>{display_name}</b> (<code>{acc_id}</code>) — {timezone_name} · {currency}")

            except Exception as e:
                logger.error(f"Error adding account {acc_id}: {e}")
                error_results.append(f"• <code>{acc_id}</code>: {e}")

        await session.commit()
        is_admin = await _is_admin_user(session, owner_id)

    await state.clear()

    result_text = f"🎉 <b>Connected: {len(added_results)} of {len(parsed_accounts)} ad accounts.</b>\n\n"
    if added_results:
        result_text += "<b>Connected ad accounts:</b>\n" + "\n".join(added_results) + "\n\n"
    if error_results:
        result_text += "⚠️ <b>Connection errors:</b>\n" + "\n".join(error_results) + "\n\n"

    result_text += (
        "📊 <b>Mode:</b> 👁 <i>Analytics and statistics only (automation rules are off).</i>\n"
        "💡 <i>You can switch live stop rules on at any time under '🏢 My ad accounts'.</i>"
    )

    await progress_msg.edit_text(result_text, parse_mode="HTML")
    await message.answer("Main menu:", reply_markup=get_main_menu_keyboard(is_admin=is_admin))


# ----------------------------------------------------
# 3. SUMMARY (PER BUYER)
# ----------------------------------------------------
@router.message(StateFilter("*"), F.text.in_(["📊 Summary", "/summary"]))
async def cmd_summary(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    has_access = await check_user_access(message, bot)
    if not has_access:
        return

    text = (
        "📊 <b>Analytics summary for your ad accounts:</b>\n\n"
        "Choose a period to see how spend and conversions moved:"
    )
    await message.answer(text, reply_markup=get_period_keyboard(), parse_mode="HTML")


def get_short_account_label(name: str, account_id: str) -> str:
    parts = name.strip().split()
    if parts:
        last_part = parts[-1]
        if last_part.isdigit():
            if len(parts) > 1 and len(parts[-2]) <= 8 and not parts[-2].startswith("PrivateCore"):
                return f"{parts[-2]} {last_part}"
            return last_part
    if len(name) <= 8:
        return name
    clean_id = account_id.replace("act_", "")
    return clean_id[-5:]


async def get_user_accounts(session, user_id: str) -> List[Account]:
    user = (
        await session.execute(
            select(User).where(User.telegram_id == user_id)
        )
    ).scalar_one_or_none()
    if not user or not user.is_approved:
        return []
    if user.active_workspace_id:
        stmt = select(Account).where(
            or_(
                Account.workspace_id == user.active_workspace_id,
                and_(Account.workspace_id.is_(None), owned_by(Account, user)),
            )
        )
    else:
        stmt = select(Account).where(owned_by(Account, user))
    res = await session.execute(stmt)
    return res.scalars().all()


async def _is_admin_user(session, user_id: str) -> bool:
    result = await session.execute(
        select(User).where(User.telegram_id == user_id)
    )
    user = result.scalar_one_or_none()
    return bool(user and user.is_approved and user.role == "admin")


async def _can_manage_account(session, user_id: str, account: Account) -> bool:
    result = await session.execute(
        select(User).where(User.telegram_id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_approved:
        return False
    if account.workspace_id is not None:
        member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == account.workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if member and member.role in ("owner", "admin", "buyer"):
            return True
        if user.role == "admin":
            grant = (
                await session.execute(
                    select(WorkspaceSupportGrant).where(
                        WorkspaceSupportGrant.workspace_id == account.workspace_id,
                        WorkspaceSupportGrant.user_id == user.id,
                        WorkspaceSupportGrant.expires_at > datetime.now(timezone.utc),
                        WorkspaceSupportGrant.revoked_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if grant:
                return True
    return entity_is_owned_by(account, user)


@router.callback_query(F.data.startswith("report_period:"))
async def cb_report_period(callback: CallbackQuery):
    period = callback.data.split(":")[1]
    user_id = str(callback.from_user.id)
    period_names = {
        "today": "today",
        "yesterday": "yesterday",
        "last_3d": "the last 3 days",
        "last_7d": "the week (7 days)"
    }
    period_title = period_names.get(period, period)
    
    await callback.answer(f"Loading data for {period_title}...")
    await callback.message.edit_text(f"⏳ Collecting statistics for <b>{period_title}</b> from the Meta API...", parse_mode="HTML")

    async with async_session_maker() as session:
        accounts = await get_user_accounts(session, user_id)

        if not accounts:
            await callback.message.edit_text(
                "ℹ️ You have no connected ad accounts yet.\n"
                "Press '➕ Add ad accounts' in the menu.",
                reply_markup=None
            )
            return

        spend_by_currency = {}
        total_clicks = 0
        total_leads = 0
        total_regs = 0
        total_purchases = 0
        tz_name = "UTC"

        table_rows = []
        purchases_list = []
        no_spend_list = []

        for acc in accounts:
            tz_name = acc.timezone_name or tz_name
            short_name = get_short_account_label(acc.name, acc.account_id)
            try:
                access_token = await resolve_account_access_token(session, acc)
                account_metrics = await meta_client.get_account_insights_summary(
                    account_id=acc.account_id,
                    access_token=access_token,
                    date_preset=period
                )
                currency = normalize_currency(acc.currency)
                acc_spend = account_metrics.get("spend", 0.0)
                acc_clicks = account_metrics.get("clicks", 0)
                acc_leads = account_metrics.get("leads", 0)
                acc_regs = account_metrics.get("registrations", 0)
                acc_purchases = account_metrics.get("purchases", 0)

                spend_by_currency[currency] = spend_by_currency.get(currency, 0.0) + acc_spend
                total_clicks += acc_clicks
                total_leads += acc_leads
                total_regs += acc_regs
                total_purchases += acc_purchases

                table_rows.append({
                    "name": short_name,
                    "spend": acc_spend,
                    "clicks": acc_clicks,
                    "leads": acc_leads,
                    "regs": acc_regs,
                    "purchases": acc_purchases,
                    "currency": currency,
                })

            except Exception as e:
                logger.error(f"Error fetching report for {acc.account_id}: {e}")
                table_rows.append({
                    "name": short_name,
                    "spend": 0.0,
                    "clicks": 0,
                    "leads": 0,
                    "regs": 0,
                    "purchases": 0,
                    "currency": normalize_currency(acc.currency),
                })

        # Build a tidy table inside a <pre> block
        header = f"{'Account':<10}{'Spend':>9}{'Clicks':>6}{'Leads':>5}{'Regs':>5}{'Pur':>4}"
        lines = [header]
        for r in table_rows:
            spend_str = format_money(r["spend"], r["currency"])
            lines.append(f"{r['name']:<10}{spend_str:>9}{r['clicks']:>6}{r['leads']:>5}{r['regs']:>5}{r['purchases']:>4}")

        table_block = "<pre>\n" + "\n".join(lines) + "\n</pre>"

        totals_text = " · ".join(
            format_money(amount, currency)
            for currency, amount in sorted(spend_by_currency.items())
        ) or "—"
        report_text = (
            f"📊 <b>Report for {period_title}</b>\n\n"
            f"💵 <code>{totals_text}</code>\n\n"
            f"👆 <b>{total_clicks}</b>  ·  🎯 <b>{total_leads}</b>  ·  📝 <b>{total_regs}</b>  ·  💳 <b>{total_purchases}</b>\n\n"
            f"{table_block}"
        )

        await callback.message.edit_text(report_text, reply_markup=get_period_keyboard(), parse_mode="HTML")


# ----------------------------------------------------
# 4. SPEND (ONE CLICK, PER BUYER)
# ----------------------------------------------------
@router.message(StateFilter("*"), F.text.in_(["💵 Spend", "/spend"]))
async def cmd_spend(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    has_access = await check_user_access(message, bot)
    if not has_access:
        return

    user_id = str(message.from_user.id)
    wait_msg = await message.answer("⏳ Calculating today's spend across your ad accounts...")

    async with async_session_maker() as session:
        accounts = await get_user_accounts(session, user_id)

        if not accounts:
            await wait_msg.edit_text("ℹ️ You have no connected ad accounts yet.")
            return

        spend_by_currency = {}
        lines = []

        for acc in accounts:
            try:
                access_token = await resolve_account_access_token(session, acc)
                account_metrics = await meta_client.get_account_insights_summary(
                    account_id=acc.account_id,
                    access_token=access_token,
                    date_preset="today"
                )
                currency = normalize_currency(acc.currency)
                acc_spend = account_metrics.get("spend", 0.0)
                spend_by_currency[currency] = spend_by_currency.get(currency, 0.0) + acc_spend
                lines.append(f"• {acc.name}: {format_money(acc_spend, currency)}")
            except Exception as e:
                lines.append(f"• {acc.name}: 🔴 Failed to fetch data")

        totals_text = " · ".join(
            format_money(amount, currency)
            for currency, amount in sorted(spend_by_currency.items())
        ) or "—"

        text = (
            "<b>Breakdown by ad account:</b>\n"
            + "\n".join(lines) + "\n\n"
            f"💵 <b>Today's spend by currency:</b> <code>{totals_text}</code>"
        )
        await wait_msg.edit_text(text, parse_mode="HTML")


def format_account_card(acc: Account) -> str:
    if acc.account_status == 2 or not acc.is_active:
        status_line = "🔴 <b>Disabled in Meta</b>"
    elif acc.account_status == 3:
        status_line = "💳 <b>Payment problem (hold)</b>"
    else:
        status_line = "🟢 <b>Active</b>"

    rules_line = "🛡 <b>Automation rules: ON</b>\n" if acc.rules_enabled else ""
    preset_line = f"📋 Rule: <b>{acc.preset_name}</b>\n" if getattr(acc, 'preset_name', None) else ""

    return (
        f"🏢 <b>{acc.name}</b> (<code>{acc.account_id}</code>)\n"
        f"{status_line}\n"
        f"{rules_line}"
        f"{preset_line}"
        f"🕒 Time zone: <code>{acc.timezone_name}</code>\n"
        f"💱 Currency: <code>{normalize_currency(acc.currency)}</code>"
    )


# ----------------------------------------------------
# 5. THE USER'S AD ACCOUNT LIST
# ----------------------------------------------------
@router.message(StateFilter("*"), F.text.in_(["🏢 My ad accounts", "🏢 Ad accounts", "/accounts"]))
async def cmd_accounts(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    has_access = await check_user_access(message, bot)
    if not has_access:
        return

    user_id = str(message.from_user.id)

    async with async_session_maker() as session:
        accounts = await get_user_accounts(session, user_id)

        if not accounts:
            await message.answer(
                "ℹ️ You have no connected ad accounts yet.\n"
                "To add ad accounts, press <b>➕ Add ad accounts</b> in the menu.",
                parse_mode="HTML"
            )
            return

        for acc in accounts:
            text = format_account_card(acc)
            await message.answer(
                text, 
                reply_markup=get_account_manage_keyboard(acc.account_id, acc.rules_enabled),
                parse_mode="HTML"
            )


@router.callback_query(F.data.startswith("toggle_rules:"))
async def cb_toggle_rules(callback: CallbackQuery):
    account_id = callback.data.split(":")[1]
    user_id = str(callback.from_user.id)
    async with async_session_maker() as session:
        res = await session.execute(select(Account).where(Account.account_id == account_id))
        acc = res.scalar_one_or_none()
        if not acc or not await _can_manage_account(session, user_id, acc):
            await callback.answer("⛔️ You do not have access to this ad account.", show_alert=True)
            return

        try:
            active_rules = json.loads(acc.active_rules or "[]")
        except (TypeError, ValueError):
            active_rules = []
        if not acc.rules_enabled and not active_rules:
            await callback.answer("Attach a rule in the web interface first.", show_alert=True)
            return

        acc.rules_enabled = not acc.rules_enabled
        await session.commit()
        status_str = "🟢 ON" if acc.rules_enabled else "🔴 OFF (statistics only)"
        await callback.answer(f"Automation rules {status_str}!")
        await callback.message.edit_text(
            format_account_card(acc),
            reply_markup=get_account_manage_keyboard(acc.account_id, acc.rules_enabled),
            parse_mode="HTML"
        )


@router.callback_query(F.data.startswith("delete_acc:"))
async def cb_delete_acc(callback: CallbackQuery):
    account_id = callback.data.split(":")[1]
    user_id = str(callback.from_user.id)
    async with async_session_maker() as session:
        result = await session.execute(select(Account).where(Account.account_id == account_id))
        account = result.scalar_one_or_none()
        if not account or not await _can_manage_account(session, user_id, account):
            await callback.answer("⛔️ You do not have access to this ad account.", show_alert=True)
            return
        await session.execute(delete(Account).where(Account.account_id == account_id))
        await session.commit()
    await callback.answer("Ad account removed from the database.")
    await callback.message.edit_text(f"🗑 Ad account <code>{account_id}</code> removed from the system.", parse_mode="HTML")





@router.callback_query(F.data.startswith("back_to_acc:"))
async def cb_back_to_acc(callback: CallbackQuery):
    account_id = callback.data.split(":")[1]
    user_id = str(callback.from_user.id)
    async with async_session_maker() as session:
        res = await session.execute(select(Account).where(Account.account_id == account_id))
        acc = res.scalar_one_or_none()
        if not acc or not await _can_manage_account(session, user_id, acc):
            await callback.answer("⛔️ You do not have access to this ad account.", show_alert=True)
            return
        await callback.message.edit_text(
            format_account_card(acc),
            reply_markup=get_account_manage_keyboard(acc.account_id, acc.rules_enabled),
            parse_mode="HTML"
        )
    await callback.answer()




# ----------------------------------------------------
# 6. POLLING FREQUENCY SETTINGS
# ----------------------------------------------------
@router.message(StateFilter("*"), F.text.in_(["⚙️ Settings", "/settings"]))
async def cmd_settings(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    has_access = await check_user_access(message, bot)
    if not has_access:
        return

    async with async_session_maker() as session:
        res = await session.execute(select(AppSettings).limit(1))
        app_settings = res.scalar_one_or_none()
        interval = app_settings.poll_interval_minutes if app_settings else 10

    text = (
        "⚙️ <b>System settings:</b>\n\n"
        f"⏱ <b>Base monitoring interval:</b> <code>{interval} minutes</code>\n\n"
        "Automation rules use their own interval. Choose how often the status of the other ad accounts is checked:"
    )
    await message.answer(text, reply_markup=get_interval_keyboard(interval), parse_mode="HTML")


@router.callback_query(F.data.startswith("set_interval:"))
async def cb_set_interval(callback: CallbackQuery):
    minutes = int(callback.data.split(":")[1])
    user_id = str(callback.from_user.id)

    async with async_session_maker() as session:
        if not await _is_admin_user(session, user_id):
            await callback.answer("⛔️ Only an administrator can change this interval.", show_alert=True)
            return
        res = await session.execute(select(AppSettings).limit(1))
        app_settings = res.scalar_one_or_none()
        if not app_settings:
            app_settings = AppSettings(poll_interval_minutes=minutes)
            session.add(app_settings)
        else:
            app_settings.poll_interval_minutes = minutes
        await session.commit()

    await callback.answer(f"Base interval changed to {minutes} minutes!")
    await callback.message.edit_text(
        f"✅ <b>Base monitoring interval updated to {minutes} minutes.</b>",
        reply_markup=get_interval_keyboard(minutes),
        parse_mode="HTML"
    )


# ----------------------------------------------------
# 7. TOKEN GUIDE
# ----------------------------------------------------
@router.message(StateFilter("*"), F.text.in_(["🔑 Token guide", "🔑 Access token guide", "/token_help"]))
async def cmd_token_help(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    has_access = await check_user_access(message, bot)
    if not has_access:
        return

    text = (
        "🔑 <b>Guide: how to get an access token in Meta Business Manager</b>\n\n"
        "<b>1️⃣ Step 1: create a system user in Business Manager</b>\n"
        "• In <i>Business Settings → Users → System Users</i> press <b>Add</b> (role <b>Admin</b>).\n\n"
        "<b>2️⃣ Step 2: add the app owner to the same Business Manager</b>\n"
        "• In <i>Users → People</i> invite the Facebook account that owns the app.\n\n"
        "<b>3️⃣ Step 3: add the app to Business Manager and share ad account access</b>\n"
        "• In <i>Accounts → Apps</i> add the app.\n"
        "• In <i>Accounts → Ad Accounts</i> pick the ad accounts and grant <b>Full Control</b>.\n\n"
        "<b>4️⃣ Step 4: give the system user access to the app and create a token</b>\n"
        "• In <i>Accounts → Apps</i> select the app → <i>Assign System Users</i> → add the user you created with <b>Full Control</b>.\n"
        "• Go back to <i>Users → System Users</i> → press <b>Generate New Token</b>:\n"
        "   — pick the app;\n"
        "   — expiry: <b>Never</b> (or 60 days);\n"
        "   — tick both boxes: <code>ads_management</code> and <code>ads_read</code>.\n\n"
        "📋 <i>Copy the token and press '➕ Add ad accounts' in the menu.</i>"
    )
    await message.answer(text, parse_mode="HTML")


# ----------------------------------------------------
# 8. ADMIN PANEL AND ACCESS APPROVAL
# ----------------------------------------------------
@router.message(StateFilter("*"), F.text.in_(["👑 Admin panel", "/admin"]))
async def cmd_admin_panel(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    tg_id = str(message.from_user.id)

    async with async_session_maker() as session:
        if not await _is_admin_user(session, tg_id):
            await message.answer("⛔️ This panel is for administrators only.")
            return

        # User list
        u_res = await session.execute(select(User))
        users = u_res.scalars().all()

# Every ad account belonging to the team
        a_res = await session.execute(select(Account))
        all_accounts = a_res.scalars().all()

        # Number of allowlisted emails
        wl_count = (await session.execute(select(func.count(AllowedEmail.id)))).scalar() or 0

        active_count = sum(1 for a in all_accounts if a.is_active)
        approved_users = [u for u in users if u.is_approved]

        user_lines = []
        for u in approved_users:
            u_accs = sum(1 for a in all_accounts if entity_is_owned_by(a, u))
            user_lines.append(f"• <b>{u.full_name}</b> (@{u.username}) | Ad accounts: {u_accs}")

        text = (
            "👑 <b>Buyerly admin panel:</b>\n\n"
            f"👥 <b>Users on the team:</b> {len(approved_users)}\n"
            f"🏢 <b>Ad accounts monitored:</b> {len(all_accounts)} (active: {active_count})\n"
            f"📧 <b>Allowlisted emails:</b> {wl_count}\n\n"
            f"<b>Team members:</b>\n" + ("\n".join(user_lines) if user_lines else "<i>Just you so far</i>")
        )
        await message.answer(text, reply_markup=get_admin_panel_keyboard(), parse_mode="HTML")


@router.callback_query(F.data == "noop")
async def cb_noop(callback: CallbackQuery):
    await callback.answer()


@router.callback_query(F.data == "admin_back_to_panel")
async def cb_admin_back_to_panel(callback: CallbackQuery):
    actor_id = str(callback.from_user.id)
    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            await callback.answer("⛔️ Insufficient permissions.", show_alert=True)
            return

        u_res = await session.execute(select(User))
        users = u_res.scalars().all()
        a_res = await session.execute(select(Account))
        all_accounts = a_res.scalars().all()
        wl_count = (await session.execute(select(func.count(AllowedEmail.id)))).scalar() or 0

        active_count = sum(1 for a in all_accounts if a.is_active)
        approved_users = [u for u in users if u.is_approved]

        user_lines = []
        for u in approved_users:
            u_accs = sum(1 for a in all_accounts if entity_is_owned_by(a, u))
            user_lines.append(f"• <b>{u.full_name}</b> (@{u.username}) | Ad accounts: {u_accs}")

        text = (
            "👑 <b>Buyerly admin panel:</b>\n\n"
            f"👥 <b>Users on the team:</b> {len(approved_users)}\n"
            f"🏢 <b>Ad accounts monitored:</b> {len(all_accounts)} (active: {active_count})\n"
            f"📧 <b>Allowlisted emails:</b> {wl_count}\n\n"
            f"<b>Team members:</b>\n" + ("\n".join(user_lines) if user_lines else "<i>Just you so far</i>")
        )
        await callback.message.edit_text(text, reply_markup=get_admin_panel_keyboard(), parse_mode="HTML")
        await callback.answer()


@router.callback_query(F.data.startswith("admin_whitelist:"))
async def cb_admin_whitelist(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    actor_id = str(callback.from_user.id)
    page_str = callback.data.split(":")[1]
    page = int(page_str) if page_str.isdigit() else 1

    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            await callback.answer("⛔️ Insufficient permissions.", show_alert=True)
            return

        stmt = select(AllowedEmail).order_by(AllowedEmail.created_at.desc())
        all_emails = (await session.execute(stmt)).scalars().all()

        per_page = 8
        total_pages = max(1, (len(all_emails) + per_page - 1) // per_page)
        page = max(1, min(page, total_pages))

        start_idx = (page - 1) * per_page
        page_emails = all_emails[start_idx : start_idx + per_page]

        lines = []
        for i, e in enumerate(page_emails, start=start_idx + 1):
            comment = f" — <i>{e.comment}</i>" if e.comment else ""
            lines.append(f"{i}. <code>{e.email}</code>{comment}")

        content_str = "\n".join(lines) if lines else "<i>The list is empty. Add the first email.</i>"

        text = (
            "📧 <b>Allowlisted emails:</b>\n\n"
            f"Addresses in total: <b>{len(all_emails)}</b> (page {page}/{total_pages})\n\n"
            f"{content_str}\n\n"
            "<i>💡 Only users on this list can request a temporary password on the site. To remove an address, press the button with its name below.</i>"
        )

        kb = get_admin_whitelist_keyboard(page_emails, page=page, total_pages=total_pages)
        await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
        await callback.answer()


@router.callback_query(F.data == "admin_add_email")
async def cb_admin_add_email(callback: CallbackQuery, state: FSMContext):
    actor_id = str(callback.from_user.id)
    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            await callback.answer("⛔️ Insufficient permissions.", show_alert=True)
            return

    await state.set_state(AdminWhitelistStates.waiting_for_email)
    text = (
        "➕ <b>Add an email to the allowlist:</b>\n\n"
        "Send an email (or several addresses separated by spaces, commas or new lines).\n"
        "You can also add a comment after the address, for example:\n"
        "<code>buyer@agency.com Ivan</code>\n\n"
        "<i>To cancel, press the button below or send /cancel</i>"
    )
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    cancel_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="❌ Cancel", callback_data="admin_whitelist:1")]
    ])
    await callback.message.edit_text(text, reply_markup=cancel_kb, parse_mode="HTML")
    await callback.answer()


@router.message(AdminWhitelistStates.waiting_for_email)
async def process_admin_add_email(message: Message, state: FSMContext):
    actor_id = str(message.from_user.id)
    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            await state.clear()
            await message.answer("⛔️ Insufficient permissions.")
            return

        raw_text = message.text or ""
        if raw_text.strip().lower() in ("/cancel", "cancel", "❌ cancel"):
            await state.clear()
            await message.answer("❌ Adding cancelled.")
            return

        # Parse emails and optional comment
        email_pattern = re.compile(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)")
        found_emails = email_pattern.findall(raw_text)

        if not found_emails:
            await message.answer("⚠️ Could not recognise an email. Send a valid email address (for example <code>buyer@team.com</code>):", parse_mode="HTML")
            return

        # Extract comment if single email was sent with text following it
        comment = None
        if len(found_emails) == 1:
            parts = raw_text.split(found_emails[0], 1)
            after_text = parts[1].strip() if len(parts) > 1 else ""
            if after_text:
                comment = after_text[:255]

        added = []
        already = []
        for em in found_emails:
            clean = em.strip().lower()
            existing = (await session.execute(
                select(AllowedEmail).where(func.lower(AllowedEmail.email) == clean)
            )).scalar_one_or_none()

            if existing:
                already.append(clean)
            else:
                session.add(AllowedEmail(
                    email=clean,
                    added_by=f"tg_{actor_id}",
                    comment=comment,
                ))
                added.append(clean)

        await session.commit()
        await state.clear()

        lines = []
        if added:
            lines.append("✅ <b>Added to the allowlist:</b>\n" + "\n".join(f"• <code>{e}</code>" for e in added))
        if already:
            lines.append("ℹ️ <b>Already on the list:</b>\n" + "\n".join(f"• <code>{e}</code>" for e in already))

        lines.append("\nThese users can now request a temporary password on the site.")

        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
        go_kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📧 Open the allowlist", callback_data="admin_whitelist:1")],
            [InlineKeyboardButton(text="👑 To the admin panel", callback_data="admin_back_to_panel")]
        ])
        await message.answer("\n\n".join(lines), reply_markup=go_kb, parse_mode="HTML")


@router.callback_query(F.data.startswith("del_em:"))
async def cb_delete_allowed_email(callback: CallbackQuery):
    actor_id = str(callback.from_user.id)
    email_id_str = callback.data.split(":")[1]
    if not email_id_str.isdigit():
        await callback.answer("Invalid ID", show_alert=True)
        return

    email_id = int(email_id_str)
    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            await callback.answer("⛔️ Insufficient permissions.", show_alert=True)
            return

        entry = (await session.execute(
            select(AllowedEmail).where(AllowedEmail.id == email_id)
        )).scalar_one_or_none()

        if not entry:
            await callback.answer("This email was already removed, or was not found.", show_alert=True)
            return

        target_email = entry.email.lower()

        # Cascade revoke matching non-admin users and delete active web sessions
        matched_users = (await session.execute(
            select(User).where(func.lower(User.email) == target_email)
        )).scalars().all()

        for u in matched_users:
            if u.role != "admin":
                u.is_approved = False
                await session.execute(
                    delete(WebSession).where(WebSession.user_id == u.id)
                )

        await session.delete(entry)
        await session.commit()

        await callback.answer(f"❌ {target_email} removed from the allowlist.", show_alert=True)

        # Refresh current whitelist page
        stmt = select(AllowedEmail).order_by(AllowedEmail.created_at.desc())
        all_emails = (await session.execute(stmt)).scalars().all()
        per_page = 8
        total_pages = max(1, (len(all_emails) + per_page - 1) // per_page)
        page_emails = all_emails[:per_page]

        lines = []
        for i, e in enumerate(page_emails, start=1):
            comment = f" — <i>{e.comment}</i>" if e.comment else ""
            lines.append(f"{i}. <code>{e.email}</code>{comment}")

        content_str = "\n".join(lines) if lines else "<i>The list is empty. Add the first email.</i>"
        text = (
            "📧 <b>Allowlisted emails:</b>\n\n"
            f"Addresses in total: <b>{len(all_emails)}</b> (page 1/{total_pages})\n\n"
            f"{content_str}\n\n"
            "<i>💡 Only users on this list can request a temporary password on the site. To remove an address, press the button with its name below.</i>"
        )
        kb = get_admin_whitelist_keyboard(page_emails, page=1, total_pages=total_pages)
        await callback.message.edit_text(text, reply_markup=kb, parse_mode="HTML")


@router.message(StateFilter("*"), Command("allow_email"))
async def cmd_allow_email(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    actor_id = str(message.from_user.id)
    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            return

        parts = (message.text or "").split(maxsplit=2)
        if len(parts) < 2:
            await message.answer("ℹ️ Usage: <code>/allow_email buyer@agency.com [comment]</code>", parse_mode="HTML")
            return

        raw_email = parts[1].strip().lower()
        comment = parts[2].strip() if len(parts) > 2 else None

        if "@" not in raw_email or "." not in raw_email or len(raw_email) < 5:
            await message.answer("⚠️ Invalid email address.")
            return

        existing = (await session.execute(
            select(AllowedEmail).where(func.lower(AllowedEmail.email) == raw_email)
        )).scalar_one_or_none()

        if existing:
            if comment and comment != existing.comment:
                existing.comment = comment
                await session.commit()
            await message.answer(f"ℹ️ Email <code>{raw_email}</code> is already on the allowlist.", parse_mode="HTML")
            return

        session.add(AllowedEmail(
            email=raw_email,
            added_by=f"tg_{actor_id}",
            comment=comment,
        ))
        await session.commit()
        await message.answer(f"✅ Email <code>{raw_email}</code> added to the allowlist.", parse_mode="HTML")


@router.message(StateFilter("*"), Command("revoke_email"))
async def cmd_revoke_email(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    actor_id = str(message.from_user.id)
    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            return

        parts = (message.text or "").split(maxsplit=1)
        if len(parts) < 2:
            await message.answer("ℹ️ Usage: <code>/revoke_email buyer@agency.com</code>", parse_mode="HTML")
            return

        raw_email = parts[1].strip().lower()
        entry = (await session.execute(
            select(AllowedEmail).where(func.lower(AllowedEmail.email) == raw_email)
        )).scalar_one_or_none()

        if not entry:
            await message.answer(f"⚠️ Email <code>{raw_email}</code> was not found on the allowlist.", parse_mode="HTML")
            return

        # Cascade revoke matching non-admin users
        matched_users = (await session.execute(
            select(User).where(func.lower(User.email) == raw_email)
        )).scalars().all()

        for u in matched_users:
            if u.role != "admin":
                u.is_approved = False
                await session.execute(
                    delete(WebSession).where(WebSession.user_id == u.id)
                )

        await session.delete(entry)
        await session.commit()
        await message.answer(f"❌ Email <code>{raw_email}</code> removed from the allowlist. Access revoked.", parse_mode="HTML")


@router.message(StateFilter("*"), Command("allowed_emails"))
async def cmd_allowed_emails(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    actor_id = str(message.from_user.id)
    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            return

        stmt = select(AllowedEmail).order_by(AllowedEmail.created_at.desc())
        all_emails = (await session.execute(stmt)).scalars().all()
        per_page = 8
        total_pages = max(1, (len(all_emails) + per_page - 1) // per_page)
        page_emails = all_emails[:per_page]

        lines = []
        for i, e in enumerate(page_emails, start=1):
            comment = f" — <i>{e.comment}</i>" if e.comment else ""
            lines.append(f"{i}. <code>{e.email}</code>{comment}")

        content_str = "\n".join(lines) if lines else "<i>The list is empty. Add the first email.</i>"
        text = (
            "📧 <b>Allowlisted emails:</b>\n\n"
            f"Addresses in total: <b>{len(all_emails)}</b> (page 1/{total_pages})\n\n"
            f"{content_str}\n\n"
            "<i>💡 Only users on this list can request a temporary password on the site.</i>"
        )
        kb = get_admin_whitelist_keyboard(page_emails, page=1, total_pages=total_pages)
        await message.answer(text, reply_markup=kb, parse_mode="HTML")



@router.message(StateFilter("*"), Command("events"))
async def cmd_view_events(message: Message, bot: Bot, state: FSMContext):
    await state.clear()
    tg_id = str(message.from_user.id)

    from database.models import EventLog
    async with async_session_maker() as session:
        if not await _is_admin_user(session, tg_id):
            return

        stmt = select(EventLog).order_by(EventLog.created_at.desc()).limit(15)
        res = await session.execute(stmt)
        logs = res.scalars().all()

        if not logs:
            await message.answer("ℹ️ The event log is empty so far.")
            return

        lines = []
        for l in logs:
            status_icon = "✅" if l.status == "SUCCESS" else "❌"
            time_str = l.created_at.strftime("%H:%M:%S")
            lines.append(f"{status_icon} <code>{time_str}</code> [{l.event_type}] → <code>{l.target_chat_id}</code>")

        await message.answer("📜 <b>The last 15 alert delivery events:</b>\n\n" + "\n".join(lines), parse_mode="HTML")


@router.callback_query(F.data.startswith("approve_user:"))
async def cb_approve_user(callback: CallbackQuery, bot: Bot):
    target_tg_id = callback.data.split(":")[1]
    actor_id = str(callback.from_user.id)

    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            await callback.answer("⛔️ Insufficient permissions.", show_alert=True)
            return
        res = await session.execute(select(User).where(User.telegram_id == target_tg_id))
        user = res.scalar_one_or_none()

        if user:
            user.is_approved = True
            await session.commit()

            # Notify the user
            try:
                await bot.send_message(
                    chat_id=target_tg_id,
                    text="🎉 <b>An administrator approved your Buyerly access.</b>\n\n"
                         "Press /start to begin.",
                    parse_mode="HTML"
                )
            except Exception as e:
                logger.error(f"Failed to notify approved user {target_tg_id}: {e}")

            await callback.message.edit_text(
                f"✅ <b>Access approved for {user.full_name} (@{user.username}).</b>",
                parse_mode="HTML"
            )
            await callback.answer("User approved.")


@router.callback_query(F.data.startswith("reject_user:"))
async def cb_reject_user(callback: CallbackQuery):
    target_tg_id = callback.data.split(":")[1]
    actor_id = str(callback.from_user.id)

    async with async_session_maker() as session:
        if not await _is_admin_user(session, actor_id):
            await callback.answer("⛔️ Insufficient permissions.", show_alert=True)
            return
        await session.execute(delete(User).where(User.telegram_id == target_tg_id))
        await session.commit()

    await callback.message.edit_text(f"❌ <b>Access request (ID: <code>{target_tg_id}</code>) rejected.</b>", parse_mode="HTML")
    await callback.answer("Request rejected.")


# ----------------------------------------------------
# 9. REACTIVATION AND DISMISSAL (INLINE BUTTONS)
# ----------------------------------------------------
@router.callback_query(F.data.startswith("reactivate:"))
async def cb_reactivate(callback: CallbackQuery):
    _, account_id, adset_id = callback.data.split(":")
    user_id = str(callback.from_user.id)
    action_started = time.perf_counter()
    correlation_id = uuid.uuid4().hex
    audit_event_id = None

    async with async_session_maker() as session:
        acc_res = await session.execute(select(Account).where(Account.account_id == account_id))
        account = acc_res.scalar_one_or_none()

        if not account or not await _can_manage_account(session, user_id, account):
            await callback.answer("⛔️ You do not have access to this ad account.", show_alert=True)
            return

        stopped_res = await session.execute(
            select(StoppedAdSet).where(StoppedAdSet.adset_id == adset_id)
        )
        stopped_entry = stopped_res.scalar_one_or_none()
        if not stopped_entry or stopped_entry.account_id != account_id:
            await callback.answer("❌ No stop record found.", show_alert=True)
            return

        try:
            access_token = await resolve_account_access_token(session, account)
            await meta_client.set_adset_status(
                adset_id=adset_id,
                access_token=access_token,
                status="ACTIVE"
            )
        except Exception as e:
            logger.error(f"Error reactivating adset {adset_id}: {e}")
            session.add(
                build_audit_event(
                    account=account,
                    event_type="MANUAL_REACTIVATE",
                    status="ERROR",
                    correlation_id=correlation_id,
                    category="MANUAL_ACTION",
                    action="REACTIVATE_ADSET",
                    message=str(e),
                    before_state={"status": "PAUSED", "is_resolved": False},
                    after_state={"status": "PAUSED", "is_resolved": False},
                    duration_ms=(time.perf_counter() - action_started) * 1000,
                    actor_type="telegram_user",
                    actor_id=user_id,
                    adset_id=adset_id,
                    adset_name=stopped_entry.adset_name,
                )
            )
            try:
                await session.commit()
            except Exception as audit_error:
                await session.rollback()
                logger.error("Failed to persist Telegram reactivation error: %s", audit_error)
            await callback.answer("❌ Meta could not turn the ad set on. Details were saved to the logs.", show_alert=True)
            return

        stopped_entry.is_resolved = True
        audit_event = build_audit_event(
                account=account,
                event_type="MANUAL_REACTIVATE",
                status="SUCCESS",
                correlation_id=correlation_id,
                category="MANUAL_ACTION",
                action="REACTIVATE_ADSET",
                message="Ad set turned on by the user via Telegram.",
                before_state={"status": "PAUSED", "is_resolved": False},
                after_state={"status": "ACTIVE", "is_resolved": True},
                duration_ms=(time.perf_counter() - action_started) * 1000,
                actor_type="telegram_user",
                actor_id=user_id,
                adset_id=adset_id,
                adset_name=stopped_entry.adset_name,
            )
        session.add(audit_event)
        try:
            await session.flush()
            audit_event_id = audit_event.id
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error("Meta activated adset %s but Telegram audit commit failed: %s", adset_id, e)
            await callback.answer("⚠️ Meta turned the ad set on, but Buyerly did not save the local status.", show_alert=True)
            return

    await callback.answer("✅ Ad set turned on.")
    new_text = callback.message.text + "\n\n🟢 <b>STATUS: turned on by the user via Telegram ✅</b>"
    await callback.message.edit_text(
        new_text,
        reply_markup=get_undo_action_keyboard(audit_event_id) if audit_event_id else None,
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("dismiss:"))
async def cb_dismiss(callback: CallbackQuery):
    _, account_id, adset_id = callback.data.split(":")
    user_id = str(callback.from_user.id)

    async with async_session_maker() as session:
        stopped_res = await session.execute(
            select(StoppedAdSet).where(StoppedAdSet.adset_id == adset_id)
        )
        stopped_entry = stopped_res.scalar_one_or_none()
        account_res = await session.execute(
            select(Account).where(Account.account_id == account_id)
        )
        account = account_res.scalar_one_or_none()
        if (
            not stopped_entry
            or stopped_entry.account_id != account_id
            or not account
            or not await _can_manage_account(session, user_id, account)
        ):
            await callback.answer("⛔️ You do not have access to this record.", show_alert=True)
            return
        stopped_entry.is_resolved = True
        session.add(
            build_audit_event(
                account=account,
                event_type="HIDE_STOPPED_NOTIFICATION",
                status="SUCCESS",
                correlation_id=uuid.uuid4().hex,
                category="MANUAL_ACTION",
                action="HIDE_NOTIFICATION",
                message="The completed-stop card was hidden via Telegram.",
                before_state={"status": "PAUSED", "is_resolved": False},
                after_state={"status": "PAUSED", "is_resolved": True},
                actor_type="telegram_user",
                actor_id=user_id,
                adset_id=adset_id,
                adset_name=stopped_entry.adset_name,
            )
        )
        await session.commit()

    await callback.answer("Card hidden.")
    new_text = callback.message.text + "\n\n⚪ <b>Card hidden. The ad set remains off.</b>"
    await callback.message.edit_text(new_text, reply_markup=None, parse_mode="HTML")


@router.callback_query(F.data.startswith("pause_adset:"))
async def cb_pause_adset(callback: CallbackQuery):
    _, account_id, adset_id = callback.data.split(":")
    user_id = str(callback.from_user.id)
    action_started = time.perf_counter()
    correlation_id = uuid.uuid4().hex
    audit_event_id = None

    async with async_session_maker() as session:
        acc_res = await session.execute(select(Account).where(Account.account_id == account_id))
        account = acc_res.scalar_one_or_none()

        if not account or not await _can_manage_account(session, user_id, account):
            await callback.answer("⛔️ You do not have access to this ad account.", show_alert=True)
            return

        try:
            access_token = await resolve_account_access_token(session, account)
            await meta_client.set_adset_status(
                adset_id=adset_id,
                access_token=access_token,
                status="PAUSED"
            )
        except Exception as e:
            logger.error(f"Error pausing adset {adset_id}: {e}")
            session.add(
                build_audit_event(
                    account=account,
                    event_type="MANUAL_PAUSE",
                    status="ERROR",
                    correlation_id=correlation_id,
                    category="MANUAL_ACTION",
                    action="PAUSE_ADSET",
                    message=str(e),
                    before_state={"status": "ACTIVE"},
                    after_state={"status": "ACTIVE"},
                    duration_ms=(time.perf_counter() - action_started) * 1000,
                    actor_type="telegram_user",
                    actor_id=user_id,
                    adset_id=adset_id,
                )
            )
            try:
                await session.commit()
            except Exception as audit_error:
                await session.rollback()
                logger.error("Failed to persist Telegram pause error: %s", audit_error)
            await callback.answer("❌ Meta could not stop the ad set. Details were saved to the logs.", show_alert=True)
            return

        audit_event = build_audit_event(
                account=account,
                event_type="MANUAL_PAUSE",
                status="SUCCESS",
                correlation_id=correlation_id,
                category="MANUAL_ACTION",
                action="PAUSE_ADSET",
                message="Ad set stopped by the user via Telegram.",
                before_state={"status": "ACTIVE"},
                after_state={"status": "PAUSED"},
                duration_ms=(time.perf_counter() - action_started) * 1000,
                actor_type="telegram_user",
                actor_id=user_id,
                adset_id=adset_id,
            )
        session.add(audit_event)
        try:
            await session.flush()
            audit_event_id = audit_event.id
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error("Meta paused adset %s but Telegram audit commit failed: %s", adset_id, e)
            await callback.answer("⚠️ Meta stopped the ad set, but Buyerly did not save the history.", show_alert=True)
            return

    await callback.answer("🛑 Ad set stopped.")
    new_text = callback.message.text + "\n\n🔴 <b>STATUS: stopped manually from an alert 🛑</b>"
    await callback.message.edit_text(
        new_text,
        reply_markup=get_undo_action_keyboard(audit_event_id) if audit_event_id else None,
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("undo_action:"))
async def cb_undo_action(callback: CallbackQuery):
    user_id = str(callback.from_user.id)
    try:
        event_id = int(callback.data.split(":", 1)[1])
    except (IndexError, ValueError):
        await callback.answer("❌ Invalid undo button.", show_alert=True)
        return

    async with async_session_maker() as session:
        user = (
            await session.execute(
                select(User).where(User.telegram_id == user_id)
            )
        ).scalar_one_or_none()
        if not user or not user.is_approved:
            await callback.answer("⛔️ Access not confirmed.", show_alert=True)
            return

        source = await session.get(AuditEvent, event_id)
        workspace_id = user.active_workspace_id
        if source is None or workspace_id is None or source.workspace_id != workspace_id:
            await callback.answer("⛔️ This action is unavailable in the active workspace.", show_alert=True)
            return

        member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        can_write = bool(member and member.role in ("owner", "admin", "buyer"))
        if not can_write and user.role == "admin":
            grant = (
                await session.execute(
                    select(WorkspaceSupportGrant).where(
                        WorkspaceSupportGrant.workspace_id == workspace_id,
                        WorkspaceSupportGrant.user_id == user.id,
                        WorkspaceSupportGrant.expires_at > datetime.now(timezone.utc),
                        WorkspaceSupportGrant.revoked_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            can_write = grant is not None
        if not can_write:
            await callback.answer("⛔️ Insufficient permissions to undo this action.", show_alert=True)
            return
        try:
            result = await undo_audit_action(
                session,
                meta_client=meta_client,
                event_id=event_id,
                actor_type="telegram_user",
                actor_id=user_id,
                owner_id=user_id,
                owner_user_id=user.id,
                workspace_id=workspace_id,
                is_admin=user.role == "admin",
            )
        except UndoError as error:
            await callback.answer(f"❌ {error.message}", show_alert=True)
            return

    await callback.answer("✅ Action undone.")
    new_text = (callback.message.text or "") + f"\n\n↩️ <b>{result['message']}</b>"
    await callback.message.edit_text(new_text, reply_markup=None, parse_mode="HTML")
