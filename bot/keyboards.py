from typing import Optional
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from core.config import settings


def get_main_menu_keyboard(is_admin: bool = False) -> ReplyKeyboardMarkup:
    """Bot main menu with a button that launches the Web App."""
    kb = []
    
    if settings.WEBAPP_URL:
        kb.append([KeyboardButton(text="🚀 Open Buyerly App", web_app=WebAppInfo(url=settings.WEBAPP_URL))])
        
    kb.extend([
        [
            KeyboardButton(text="📊 Summary"),
            KeyboardButton(text="💵 Spend")
        ],
        [
            KeyboardButton(text="🏢 My ad accounts"),
            KeyboardButton(text="⚙️ Settings")
        ],
        [
            KeyboardButton(text="➕ Add ad accounts"),
            KeyboardButton(text="🔑 Token guide")
        ]
    ])
    if is_admin:
        kb.append([KeyboardButton(text="👑 Admin panel")])
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)

def get_webapp_inline_keyboard() -> Optional[InlineKeyboardMarkup]:
    """Inline button that opens the Web App straight away."""
    if settings.WEBAPP_URL:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🚀 Open web panel", web_app=WebAppInfo(url=settings.WEBAPP_URL))]
        ])
    return None


def get_cancel_keyboard() -> ReplyKeyboardMarkup:
    """Keyboard that cancels the step-by-step wizard."""
    kb = [[KeyboardButton(text="❌ Cancel adding")]]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)

def get_admin_approval_keyboard(telegram_id: str) -> InlineKeyboardMarkup:
    """Inline buttons for an admin to approve a new user."""
    kb = [
        [
            InlineKeyboardButton(text="✅ Approve access", callback_data=f"approve_user:{telegram_id}"),
            InlineKeyboardButton(text="❌ Reject", callback_data=f"reject_user:{telegram_id}")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=kb)

def get_period_keyboard() -> InlineKeyboardMarkup:
    """Period picker for the analytics summary."""
    kb = [
        [
            InlineKeyboardButton(text="📅 Today", callback_data="report_period:today"),
            InlineKeyboardButton(text="⏮ Yesterday", callback_data="report_period:yesterday")
        ],
        [
            InlineKeyboardButton(text="📊 Last 3 days", callback_data="report_period:last_3d"),
            InlineKeyboardButton(text="📈 Last week (7d)", callback_data="report_period:last_7d")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=kb)

def get_interval_keyboard(current_interval: int = 10) -> InlineKeyboardMarkup:
    """Check-interval picker (10, 15, 30, 60 min)."""
    intervals = [10, 15, 30, 60]
    buttons = []
    for m in intervals:
        label = f"✅ {m} min" if m == current_interval else f"{m} min"
        buttons.append(InlineKeyboardButton(text=label, callback_data=f"set_interval:{m}"))
    
    kb = [
        buttons[:2],
        buttons[2:]
    ]
    return InlineKeyboardMarkup(inline_keyboard=kb)

def get_reactivate_keyboard(account_id: str, adset_id: str) -> InlineKeyboardMarkup:
    """Interactive button that turns an ad set back on when a late lead/registration lands."""
    kb = [
        [
            InlineKeyboardButton(
                text="✅ Turn ad set on", 
                callback_data=f"reactivate:{account_id}:{adset_id}"
            ),
            InlineKeyboardButton(
                text="❌ Leave it off", 
                callback_data=f"dismiss:{account_id}:{adset_id}"
            )
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=kb)
def get_pause_adset_keyboard(account_id: str, adset_id: str) -> InlineKeyboardMarkup:
    """Inline button for stopping an ad set manually from an alert."""
    kb = [
        [
            InlineKeyboardButton(
                text="🛑 Stop ad set manually", 
                callback_data=f"pause_adset:{account_id}:{adset_id}"
            )
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=kb)


def get_undo_action_keyboard(event_id: int) -> InlineKeyboardMarkup:
    """One shared reversal action for completed Meta mutations."""

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="↩️ Undo action",
                    callback_data=f"undo_action:{int(event_id)}",
                )
            ]
        ]
    )

def get_account_manage_keyboard(account_id: str, rules_enabled: bool) -> InlineKeyboardMarkup:
    """Manage one ad account: automation toggle, limits, deletion."""
    rules_btn_text = "🛑 Disable automation rules" if rules_enabled else "🛡 Enable automation rules"
    kb = [
        [
            InlineKeyboardButton(text=rules_btn_text, callback_data=f"toggle_rules:{account_id}")
        ],
        [
            InlineKeyboardButton(text="🗑 Delete", callback_data=f"delete_acc:{account_id}")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=kb)


def get_admin_panel_keyboard() -> InlineKeyboardMarkup:
    """Buttons on the admin control panel."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="📧 Allowed emails", callback_data="admin_whitelist:1")
            ]
        ]
    )


def get_admin_whitelist_keyboard(
    emails: list,
    page: int = 1,
    total_pages: int = 1,
) -> InlineKeyboardMarkup:
    """Email allowlist keyboard with pagination and safe callback_data."""
    kb = []

    # Individual delete buttons for emails on current page
    for item in emails:
        comment_str = f" ({item.comment[:15]})" if item.comment else ""
        btn_text = f"🗑 {item.email[:25]}{comment_str}"
        kb.append([
            InlineKeyboardButton(
                text=btn_text,
                callback_data=f"del_em:{item.id}",
            )
        ])

    # Pagination row
    nav_row = []
    if page > 1:
        nav_row.append(
            InlineKeyboardButton(text="◀️ Back", callback_data=f"admin_whitelist:{page - 1}")
        )
    nav_row.append(
        InlineKeyboardButton(text=f"Page {page}/{total_pages}", callback_data="noop")
    )
    if page < total_pages:
        nav_row.append(
            InlineKeyboardButton(text="Next ▶️", callback_data=f"admin_whitelist:{page + 1}")
        )
    if len(nav_row) > 1 or total_pages > 1:
        kb.append(nav_row)

    # Action buttons
    kb.append([
        InlineKeyboardButton(text="➕ Add email", callback_data="admin_add_email")
    ])
    kb.append([
        InlineKeyboardButton(text="🔙 Back to admin panel", callback_data="admin_back_to_panel")
    ])

    return InlineKeyboardMarkup(inline_keyboard=kb)

