"""Linear's bell on a project, for an ad account: which of its events reach my Inbox.

Inbox's own rule sends an ad account's events to its lead, and to everyone
while nobody leads it. The bell lets one member choose instead, kind by kind:
a lead can mute rule actions, a buyer who does not lead the account can follow
its urgent problems. The choice is the member's alone and covers Inbox, the
unread badge, email and Telegram, which all read `audit._in_inbox`.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, select

from api.auth import get_current_user
from api.deps import get_user_workspace_member
from core.account_access import account_access
from database.db import async_session_maker
from database.models import Account, AccountNotificationSetting, User, utcnow

router = APIRouter(tags=["Notifications"])

# Inbox kinds an ad account's events can be; Team (invitations, support access) belongs to no account.
ACCOUNT_NOTIFICATION_KINDS = ("urgent", "rule_alerts", "rule_actions", "assistant", "manual", "system")


class AccountNotificationsPayload(BaseModel):
    kinds: list[str]

    @field_validator("kinds")
    @classmethod
    def _kinds(cls, value: list[str]) -> list[str]:
        unknown = set(value) - set(ACCOUNT_NOTIFICATION_KINDS)
        if unknown:
            raise ValueError("Unknown kind of notification.")
        return [kind for kind in ACCOUNT_NOTIFICATION_KINDS if kind in value]


async def _member_and_account(session, user: User, account_id: str):
    ws, member = await get_user_workspace_member(session, user)
    if not ws or not member:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    act_id = account_id if account_id.startswith("act_") else f"act_{account_id}"
    account = (
        await session.execute(select(Account).where(Account.workspace_id == ws.id, Account.account_id == act_id))
    ).scalar_one_or_none()
    if account is None or not (await account_access(session, member, ws.id)).allows_pk(account.id):
        raise HTTPException(status_code=404, detail="Ad account not found")
    return member, account


def _default_kinds(user: User, account: Account) -> list[str]:
    """Inbox's rule without a choice: all of it for the lead, or for everyone while nobody leads."""
    if account.lead_user_id is None or account.lead_user_id == user.id:
        return list(ACCOUNT_NOTIFICATION_KINDS)
    return []


async def _answer(session, user: User, member, account: Account) -> dict:
    rows = []
    if member.id is not None:
        rows = (
            await session.execute(
                select(AccountNotificationSetting).where(
                    AccountNotificationSetting.member_id == member.id,
                    AccountNotificationSetting.account_id == account.account_id,
                )
            )
        ).scalars().all()
    if not rows:
        return {"account_id": account.account_id, "kinds": _default_kinds(user, account), "custom": False}
    enabled = {row.kind for row in rows if row.enabled}
    return {
        "account_id": account.account_id,
        "kinds": [kind for kind in ACCOUNT_NOTIFICATION_KINDS if kind in enabled],
        "custom": True,
    }


@router.get("/accounts/{account_id}/notifications")
async def get_account_notifications(account_id: str, user: User = Depends(get_current_user)):
    """The kinds of this ad account's events that reach my Inbox, and whether I chose them."""
    async with async_session_maker() as session:
        member, account = await _member_and_account(session, user, account_id)
        return await _answer(session, user, member, account)


@router.put("/accounts/{account_id}/notifications")
async def set_account_notifications(
    account_id: str,
    payload: AccountNotificationsPayload,
    user: User = Depends(get_current_user),
):
    """Keeps my choice for every kind, so a kind I leave out stays out even once I lead the account."""
    async with async_session_maker() as session:
        member, account = await _member_and_account(session, user, account_id)
        if member.id is None:
            raise HTTPException(status_code=403, detail="Support access keeps no notification settings.")
        await session.execute(
            delete(AccountNotificationSetting).where(
                AccountNotificationSetting.member_id == member.id,
                AccountNotificationSetting.account_id == account.account_id,
            )
        )
        now = utcnow()
        session.add_all(
            AccountNotificationSetting(
                member_id=member.id,
                account_id=account.account_id,
                kind=kind,
                enabled=kind in payload.kinds,
                updated_at=now,
            )
            for kind in ACCOUNT_NOTIFICATION_KINDS
        )
        await session.commit()
        return await _answer(session, user, member, account)
