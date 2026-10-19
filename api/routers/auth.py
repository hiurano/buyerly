import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError

from api.auth import (
    clear_session_cookies,
    create_web_session,
    get_authenticated_user,
    get_current_user,
    live_browser_sessions,
    session_cookie_tokens,
)
from api.deps import _utc_iso, get_user_workspaces_list
from api.schemas import (
    BrowserAccountItem,
    LoginResponse,
    RequestEmailChangeRequest,
    RequestTemporaryPasswordRequest,
    UpdateProfileRequest,
    UserProfileResponse,
    VerifyEmailLinkRequest,
    VerifyTemporaryPasswordRequest,
    WebSessionItem,
    VerifyEmailChangeRequest,
)
from core.config import settings
from core.email import send_otp_verification_email
from core.rate_limit import get_client_ip, rate_limit_dep
from database.db import async_session_maker
from database.models import (
    Account,
    ActionUndoState,
    AnalyticsViewPreference,
    AuditEvent,
    AutomationScheduleState,
    RuleExecutionState,
    RuleGroup,
    RulePreset,
    SummarySnapshot,
    User,
    WebSession,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)
from services.image_uploads import delete_local_upload, is_owned_avatar
from services.otp import (
    OTP_EMAIL_CHANGE,
    OTP_EMAIL_VERIFICATION,
    OTP_LOGIN,
    consume_magic_link,
    consume_otp,
    create_otp,
    email_scope,
    has_recent_active_otp,
    invalidate_otp,
    login_scope,
    mark_otp_delivered,
)
from services.turnstile import verify_turnstile

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Auth & Profile"])

# What Linear's Profile accepts as a username: letters, digits, - _ and .
USERNAME_PATTERN = re.compile(r"[A-Za-z0-9_.-]+")

def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _invite_is_active(invite: WorkspaceInvite, now: datetime) -> bool:
    if invite.status != "pending":
        return False
    if invite.expires_at and _as_utc(invite.expires_at) <= now:
        return False
    return invite.max_uses == 0 or invite.used_count < invite.max_uses


async def _resolve_login_authorization(
    session,
    email: str,
    *,
    invite_token: str | None = None,
    invite_id: int | None = None,
) -> tuple[bool, WorkspaceInvite | None]:
    """Authorize an email sign-in and find the invitation it belongs to, if any.

    Sign-up is open, so any address may sign in. Only an explicit invitation
    can refuse: a spent, expired or foreign one is not accepted.
    """
    clean_email = email.strip().lower()
    if not clean_email or "@" not in clean_email:
        return False, None

    now = datetime.now(timezone.utc)
    if invite_token or invite_id:
        invite_query = select(WorkspaceInvite)
        if invite_token:
            invite_query = invite_query.where(WorkspaceInvite.token == invite_token.strip())
        else:
            invite_query = invite_query.where(WorkspaceInvite.id == invite_id)
        invite_query = invite_query.with_for_update()
        invite = (await session.execute(invite_query)).scalar_one_or_none()
        if not invite or not _invite_is_active(invite, now):
            return False, None
        target_email = (invite.email or "").strip().lower()
        if target_email and target_email != clean_email:
            return False, None
        return True, invite

    invite_res = await session.execute(
        select(WorkspaceInvite)
        .where(
            func.lower(WorkspaceInvite.email) == clean_email,
            WorkspaceInvite.status == "pending",
            or_(
                WorkspaceInvite.expires_at.is_(None),
                WorkspaceInvite.expires_at > now,
            ),
            or_(
                WorkspaceInvite.max_uses == 0,
                WorkspaceInvite.used_count < WorkspaceInvite.max_uses,
            ),
        )
        .order_by(WorkspaceInvite.id.desc())
    )
    return True, invite_res.scalars().first()


async def _complete_passwordless_login(
    session,
    *,
    email: str,
    invite_id: int | None,
    request: Request,
    response: Response,
) -> LoginResponse:
    email_clean = email.strip().lower()
    if invite_id is None:
        # Sign-up is open. Never fall back to an invitation created after the
        # code was issued: the code carries its invitation context.
        is_allowed, invite = True, None
    else:
        is_allowed, invite = await _resolve_login_authorization(
            session,
            email_clean,
            invite_id=invite_id,
        )
    if not is_allowed:
        await session.commit()
        raise HTTPException(
            status_code=403,
            detail="Access is no longer permitted. Request a new sign-in link.",
        )

    user = (
        await session.execute(
            select(User)
            .where(func.lower(User.email) == email_clean)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if user is None:
        username_collision = (
            await session.execute(
                select(User.id).where(func.lower(User.username) == email_clean).limit(1)
            )
        ).scalar_one_or_none()
        user = User(
            username=email_clean if username_collision is None else f"user-{uuid.uuid4().hex}",
            email=email_clean,
            email_verified_at=datetime.now(timezone.utc),
            role="buyer",
            is_approved=True,
            onboarding_completed=False,
            onboarding_step="personal_details" if invite else "workspace",
        )
        session.add(user)
        await session.flush()
    else:
        if not user.email_verified_at:
            # Nobody proved this address belongs to the account: a code to the
            # inbox must not hand over an account someone else set it on.
            await session.commit()
            raise HTTPException(
                status_code=403,
                detail="This email isn't confirmed on its account. Contact support to sign in.",
            )
        if not user.is_approved and invite is not None:
            # An invitation is an administrator letting this person in.
            user.is_approved = True

    if not user.is_approved:
        await session.commit()
        raise HTTPException(status_code=403, detail="Your account is awaiting administrator approval.")

    await create_web_session(
        session,
        user=user,
        request=request,
        response=response,
    )
    await session.commit()
    return LoginResponse(
        account_id=user.id,
        username=user.username,
        full_name=user.full_name or user.username,
        role=user.role,
        message="Signed in successfully",
        redirect_url=f"/invite/{invite.token}" if invite else None,
    )


@router.post(
    "/auth/request-temporary-password",
    dependencies=[Depends(rate_limit_dep(
        limit=5,
        window_seconds=60,
        scope="otp_req",
        identity_fields=("email",),
    ))],
)
async def request_temporary_password(req: RequestTemporaryPasswordRequest, request: Request):
    """Email one single-use login link and its matching code.

    A new address with no invitation is a sign-up: it must pass Cloudflare
    Turnstile first. Existing accounts and invited people sign in as before.
    """
    email_clean = req.email.strip().lower()
    if "@" not in email_clean or "." not in email_clean:
        raise HTTPException(status_code=400, detail="Invalid email address")

    async with async_session_maker() as session:
        is_allowed, invite = await _resolve_login_authorization(
            session,
            email_clean,
            invite_token=req.invite_token,
        )
        if not is_allowed:
            raise HTTPException(
                status_code=403,
                detail="This invitation is no longer valid. Ask for a new one.",
            )

        if invite is None:
            has_account = (
                await session.execute(
                    select(User.id).where(func.lower(User.email) == email_clean).limit(1)
                )
            ).scalar_one_or_none() is not None
            if not has_account and not await verify_turnstile(
                req.turnstile_token,
                get_client_ip(request),
            ):
                raise HTTPException(
                    status_code=400,
                    detail="We couldn't verify you're human. Please try again.",
                )

        scope = login_scope(email_clean)
        if await has_recent_active_otp(session, scope=scope):
            raise HTTPException(
                status_code=429,
                detail="A code was sent recently. Wait one minute before requesting another.",
            )

        issued = await create_otp(
            session,
            email=email_clean,
            purpose=OTP_LOGIN,
            scope=scope,
            invite_id=invite.id if invite else None,
        )
        await session.commit()

        sent = False
        try:
            webapp_url = (settings.WEBAPP_URL or "https://buyerly.app").rstrip("/")
            login_link = f"{webapp_url}/auth/email/verify?token={issued.link_token}"
            sent = await send_otp_verification_email(
                email_clean,
                issued.code,
                login_link,
            )
        except Exception as e:
            logger.error("Failed to send OTP email to %s: %s", email_clean, e)

        if not sent and settings.RESEND_API_KEY:
            await invalidate_otp(session, issued.record_id)
            await session.commit()
            raise HTTPException(
                status_code=502,
                detail="The verification code email could not be delivered. Please try again later.",
            )

        if not await mark_otp_delivered(session, issued.record_id):
            await session.rollback()
            raise HTTPException(status_code=409, detail="This code request was superseded by a newer one")
        await session.commit()

        return {"ok": True, "message": "A temporary password has been sent to your email"}


@router.post(
    "/auth/verify-temporary-password",
    response_model=LoginResponse,
    dependencies=[Depends(rate_limit_dep(
        limit=10,
        window_seconds=60,
        scope="verify_login_otp",
        identity_fields=("email",),
    ))],
)
async def verify_temporary_password(
    req: VerifyTemporaryPasswordRequest,
    request: Request,
    response: Response,
):
    """Atomically verify a delivered login OTP, then create/sign in the user."""
    email_clean = req.email.strip().lower()
    if "@" not in email_clean or "." not in email_clean:
        raise HTTPException(status_code=400, detail="Invalid email address")

    async with async_session_maker() as session:
        result = await consume_otp(
            session,
            scope=login_scope(email_clean),
            entered_code=req.code,
        )
        if result.status != "consumed" or result.purpose != OTP_LOGIN:
            await session.commit()
            if result.status == "locked":
                raise HTTPException(
                    status_code=401,
                    detail="Too many incorrect code attempts. Request a new code.",
                )
            raise HTTPException(status_code=401, detail="Invalid or expired temporary password")

        return await _complete_passwordless_login(
            session,
            email=email_clean,
            invite_id=result.invite_id,
            request=request,
            response=response,
        )


@router.post(
    "/auth/verify-email-link",
    response_model=LoginResponse,
    dependencies=[Depends(rate_limit_dep(
        limit=10,
        window_seconds=60,
        scope="verify_login_link",
        identity_fields=("token",),
    ))],
)
async def verify_email_link(
    req: VerifyEmailLinkRequest,
    request: Request,
    response: Response,
):
    """Atomically exchange a delivered one-time email link for a web session."""
    async with async_session_maker() as session:
        result = await consume_magic_link(session, raw_token=req.token)
        if result.status != "consumed" or result.purpose != OTP_LOGIN or not result.email:
            await session.commit()
            raise HTTPException(status_code=401, detail="This sign-in link is invalid or has expired")
        return await _complete_passwordless_login(
            session,
            email=result.email,
            invite_id=result.invite_id,
            request=request,
            response=response,
        )


async def _deliver_otp(session, *, issued, email: str, log_context: str) -> None:
    sent = False
    try:
        sent = await send_otp_verification_email(email, issued.code)
    except Exception as exc:
        logger.error("Failed to send %s to %s: %s", log_context, email, exc)

    if not sent and settings.RESEND_API_KEY:
        await invalidate_otp(session, issued.record_id)
        await session.commit()
        raise HTTPException(
            status_code=502,
            detail="The verification code email could not be delivered. Please try again later.",
        )
    if not await mark_otp_delivered(session, issued.record_id):
        await session.rollback()
        raise HTTPException(status_code=409, detail="This code request was superseded by a newer one")


@router.post(
    "/auth/request-email-verification",
    dependencies=[Depends(rate_limit_dep(limit=5, window_seconds=60, scope="verify_req"))],
)
async def request_email_verification(user: User = Depends(get_current_user)):
    """Request OTP code to verify the current unverified email of logged-in user."""
    async with async_session_maker() as session:
        db_user = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
        target_email = (db_user.email or "").strip().lower()
        if not target_email or "@" not in target_email or "." not in target_email:
            raise HTTPException(status_code=400, detail="You do not have a valid email address on file")
        if db_user.email_verified_at is not None:
            return {"ok": True, "message": "Email already confirmed", "already_verified": True}

        scope = email_scope(db_user.id)
        if await has_recent_active_otp(session, scope=scope):
            raise HTTPException(
                status_code=429,
                detail="A code was sent recently. Wait one minute before requesting another.",
            )

        issued = await create_otp(
            session,
            email=target_email,
            purpose=OTP_EMAIL_VERIFICATION,
            scope=scope,
        )
        await session.commit()
        await _deliver_otp(session, issued=issued, email=target_email, log_context="verification OTP")
        db_user = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
        db_user.unconfirmed_email = target_email
        await session.commit()

        return {"ok": True, "message": "A confirmation code has been sent to your email"}


@router.post(
    "/auth/request-email-change",
    dependencies=[Depends(rate_limit_dep(limit=5, window_seconds=60, scope="email_change_req"))],
)
async def request_email_change(
    req: RequestEmailChangeRequest,
    user: User = Depends(get_current_user),
):
    """Request OTP code to attach or change user email."""
    clean_email = req.new_email.strip().lower()
    if not clean_email or "@" not in clean_email or "." not in clean_email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    async with async_session_maker() as session:
        db_user = (await session.execute(select(User).where(User.id == user.id))).scalar_one()

        # If user is already verified with this exact email, no action needed
        if (db_user.email or "").strip().lower() == clean_email and db_user.email_verified_at is not None:
            return {"ok": True, "message": "This email is already confirmed for your account", "already_verified": True}

        # Check collision: another user already has verified email
        collision = (
            await session.execute(
                select(User.id).where(
                    func.lower(User.email) == clean_email,
                    User.id != db_user.id,
                    User.email_verified_at.is_not(None),
                )
            )
        ).scalar_one_or_none()
        if collision is not None:
            raise HTTPException(status_code=409, detail="This email address is already in use by another user")

        scope = email_scope(db_user.id)
        if await has_recent_active_otp(session, scope=scope):
            raise HTTPException(
                status_code=429,
                detail="A code was sent recently. Wait one minute before requesting another.",
            )

        issued = await create_otp(
            session,
            email=clean_email,
            purpose=OTP_EMAIL_CHANGE,
            scope=scope,
        )
        await session.commit()
        await _deliver_otp(session, issued=issued, email=clean_email, log_context="email change OTP")
        db_user = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
        db_user.unconfirmed_email = clean_email
        await session.commit()

        return {"ok": True, "message": "A confirmation code has been sent to the new email", "unconfirmed_email": clean_email}


@router.post(
    "/auth/verify-email-change",
    dependencies=[Depends(rate_limit_dep(limit=10, window_seconds=60, scope="verify_email_code"))],
)
async def verify_email_change(
    req: VerifyEmailChangeRequest,
    user: User = Depends(get_current_user),
):
    """Atomically verify OTP and activate the email bound to this user."""
    async with async_session_maker() as session:
        db_user = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
        target_email = db_user.unconfirmed_email or db_user.email
        if not target_email:
            raise HTTPException(status_code=400, detail="There is no active email confirmation request")

        target_email = target_email.strip().lower()
        result = await consume_otp(
            session,
            scope=email_scope(db_user.id),
            entered_code=req.code,
        )
        if result.status != "consumed" or result.purpose not in {
            OTP_EMAIL_CHANGE,
            OTP_EMAIL_VERIFICATION,
        }:
            await session.commit()
            if result.status == "locked":
                raise HTTPException(
                    status_code=401,
                    detail="Too many incorrect code attempts. Request a new code.",
                )
            raise HTTPException(status_code=400, detail="Invalid confirmation code")
        if result.email != target_email:
            await session.rollback()
            raise HTTPException(status_code=400, detail="The code does not match the active email request")

        now_dt = datetime.now(timezone.utc)

        # Check collision right before committing
        collision = (
            await session.execute(
                select(User.id).where(
                    func.lower(User.email) == target_email,
                    User.id != db_user.id,
                    User.email_verified_at.is_not(None),
                )
            )
        ).scalar_one_or_none()
        if collision is not None:
            raise HTTPException(status_code=409, detail="This email has already been confirmed by another user")

        # Clear legacy unverified duplicate holders
        other_unverified = (
            await session.execute(
                select(User).where(func.lower(User.email) == target_email, User.id != db_user.id)
            )
        ).scalars().all()
        for other_u in other_unverified:
            other_u.email = None

        db_user.email = target_email
        db_user.email_verified_at = now_dt
        db_user.unconfirmed_email = None

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error("Error activating email %s for user %s: %s", target_email, user.id, e)
            raise HTTPException(status_code=409, detail="The email could not be activated because of a uniqueness conflict")

        return {
            "ok": True,
            "message": "Email confirmed and linked to your account",
            "email": db_user.email,
            "email_verified": True,
        }


@router.post("/auth/update-profile")
async def update_profile(req: UpdateProfileRequest, user: User = Depends(get_current_user)):
    async with async_session_maker() as session:
        res = await session.execute(select(User).where(User.id == user.id))
        db_user = res.scalar_one_or_none()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")

        if req.first_name is not None:
            db_user.first_name = req.first_name.strip()
        if req.last_name is not None:
            db_user.last_name = req.last_name.strip()
        if req.email is not None:
            clean_email = req.email.strip().lower() if req.email.strip() else None
            existing_email = (db_user.email or "").strip().lower() or None
            if clean_email != existing_email:
                raise HTTPException(
                    status_code=400,
                    detail="Changing the email directly without confirmation is not allowed. Use the code verification flow.",
                )
        old_avatar_url = db_user.avatar_url
        if req.avatar_url is not None:
            new_avatar_url = req.avatar_url.strip()
            if new_avatar_url.startswith("/uploads/avatars/") and not is_owned_avatar(
                new_avatar_url,
                user.id,
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Avatar not found, or it belongs to another user",
                )
            db_user.avatar_url = new_avatar_url
        if req.full_name is not None:
            if not req.full_name.strip():
                raise HTTPException(status_code=400, detail="Your full name cannot be empty.")
            db_user.full_name = req.full_name.strip()
        elif req.first_name is not None or req.last_name is not None:
            db_user.full_name = f"{db_user.first_name} {db_user.last_name}".strip()
        if req.title is not None:
            db_user.title = req.title.strip()
        if req.username is not None:
            new_username = req.username.strip()
            # Linear's rule and wording. It also keeps a username from looking like
            # an email: both sign in through the same field.
            if not new_username:
                raise HTTPException(status_code=400, detail="Your username cannot be empty.")
            if not USERNAME_PATTERN.fullmatch(new_username):
                raise HTTPException(
                    status_code=400,
                    detail="The username can only contain alpha-numeric characters in addition to - _ and .",
                )
            if new_username != db_user.username:
                taken = (
                    await session.execute(
                        select(User.id)
                        .where(func.lower(User.username) == new_username.lower(), User.id != db_user.id)
                        .limit(1)
                    )
                ).scalar_one_or_none()
                if taken is not None:
                    raise HTTPException(status_code=400, detail="This username is already taken.")
                db_user.username = new_username

        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(status_code=400, detail="This username is already taken.")
        if old_avatar_url and old_avatar_url != db_user.avatar_url:
            delete_local_upload(
                old_avatar_url,
                "avatars",
                owner_prefix=f"avatar_{user.id}_",
            )
        return {
            "message": "Profile updated",
            "username": db_user.username,
            "full_name": db_user.full_name,
            "first_name": db_user.first_name,
            "last_name": db_user.last_name,
            "title": db_user.title,
            "email": db_user.email,
            "avatar_url": db_user.avatar_url,
        }


@router.post("/auth/logout")
async def logout_user(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
):
    session_id = getattr(request.state, "web_session_id", None)
    async with async_session_maker() as session:
        if session_id:
            web_session = (
                await session.execute(
                    select(WebSession).where(
                        WebSession.id == session_id,
                        WebSession.user_id == user.id,
                    )
                )
            ).scalar_one_or_none()
            if web_session and web_session.revoked_at is None:
                web_session.revoked_at = datetime.now(timezone.utc)
            await session.commit()
    # Linear: Log out leaves the browser's other accounts logged in.
    clear_session_cookies(response, _current_slot(request))
    return {"message": "Signed out"}


def _current_slot(request: Request) -> int:
    return int(getattr(request.state, "web_session_slot", 0) or 0)


@router.get("/auth/accounts", response_model=list[BrowserAccountItem])
async def list_browser_accounts(request: Request, response: Response):
    """Every account logged in to this browser, in the order they were added.

    Reads only the session cookies this browser sent; cookies of ended
    sessions are dropped so their slots can take another account.
    """
    async with async_session_maker() as session:
        live = await live_browser_sessions(session, request)
        live_slots = {slot for slot, _, _ in live}
        for slot, _ in session_cookie_tokens(request):
            if slot not in live_slots:
                clear_session_cookies(response, slot)
        accounts: list[BrowserAccountItem] = []
        seen: set[int] = set()
        for slot, _, web_session in live:
            if web_session.user_id in seen:
                continue
            db_user = (
                await session.execute(select(User).where(User.id == web_session.user_id))
            ).scalar_one_or_none()
            if db_user is None or not db_user.is_approved:
                continue
            seen.add(db_user.id)
            accounts.append(BrowserAccountItem(
                id=db_user.id,
                username=db_user.username or "",
                full_name=db_user.full_name or "",
                email=db_user.email,
                avatar_url=getattr(db_user, "avatar_url", "") or "",
                slot=slot,
                onboarding_completed=bool(getattr(db_user, "onboarding_completed", False)),
                workspaces=await get_user_workspaces_list(session, db_user),
            ))
    return accounts


@router.get("/auth/sessions", response_model=list[WebSessionItem])
async def list_web_sessions(
    request: Request,
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    current_id = getattr(request.state, "web_session_id", None)
    async with async_session_maker() as session:
        rows = (
            await session.execute(
                select(WebSession)
                .where(
                    WebSession.user_id == user.id,
                    WebSession.revoked_at.is_(None),
                    WebSession.expires_at > now,
                )
                .order_by(WebSession.last_seen_at.desc(), WebSession.created_at.desc())
            )
        ).scalars().all()
    return [
        WebSessionItem(
            id=item.id,
            user_agent=item.user_agent,
            ip_address=item.ip_address,
            location=item.location or "",
            created_at=item.created_at,
            expires_at=item.expires_at,
            last_seen_at=item.last_seen_at,
            current=item.id == current_id,
        )
        for item in rows
    ]


@router.delete("/auth/sessions/{session_id}")
async def revoke_web_session(
    session_id: str,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
):
    async with async_session_maker() as session:
        web_session = (
            await session.execute(
                select(WebSession).where(
                    WebSession.id == session_id,
                    WebSession.user_id == user.id,
                    WebSession.revoked_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if web_session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        web_session.revoked_at = datetime.now(timezone.utc)
        await session.commit()

    if session_id == getattr(request.state, "web_session_id", None):
        clear_session_cookies(response, _current_slot(request))
    return {"message": "Session ended"}


@router.post("/auth/logout-all")
async def logout_all_web_sessions(
    request: Request,
    response: Response,
    keep_current: bool = False,
    user: User = Depends(get_current_user),
):
    """End every session of the user; with keep_current, all but this one."""
    now = datetime.now(timezone.utc)
    current_id = getattr(request.state, "web_session_id", None)
    conditions = [
        WebSession.user_id == user.id,
        WebSession.revoked_at.is_(None),
    ]
    if keep_current and current_id:
        conditions.append(WebSession.id != current_id)
    async with async_session_maker() as session:
        await session.execute(
            update(WebSession).where(*conditions).values(revoked_at=now)
        )
        await session.commit()
    if keep_current and current_id:
        return {"message": "Other sessions ended"}
    clear_session_cookies(response, _current_slot(request))
    return {"message": "All sessions ended"}


@router.get("/me", response_model=UserProfileResponse)
async def get_me(user: User = Depends(get_authenticated_user)):
    # The profile lists every workspace, so it is not bound to the route's
    # X-Workspace-Slug: a URL for a foreign workspace must not read as logged out.
    async with async_session_maker() as session:
        db_user = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
        workspaces = await get_user_workspaces_list(session, db_user)
        active_ws = next((w for w in workspaces if w.is_active), workspaces[0] if workspaces else None)

        onboarding_done = bool(getattr(db_user, "onboarding_completed", False))

        return UserProfileResponse(
            id=db_user.id,
            username=db_user.username or "",
            full_name=db_user.full_name or "",
            first_name=getattr(db_user, "first_name", "") or "",
            last_name=getattr(db_user, "last_name", "") or "",
            title=db_user.title or "",
            email=db_user.email,
            email_verified=bool(getattr(db_user, "email_verified_at", None)),
            unconfirmed_email=getattr(db_user, "unconfirmed_email", None),
            avatar_url=getattr(db_user, "avatar_url", "") or "",
            role=db_user.role,
            is_approved=db_user.is_approved,
            onboarding_step=getattr(db_user, "onboarding_step", "completed") or "completed",
            onboarding_completed=onboarding_done,
            active_workspace=active_ws,
            workspaces=workspaces,
        )


@router.get("/admin/overview")
async def get_admin_overview(user: User = Depends(get_current_user)):
    """Return all users, workspaces, members, and invites for administrative inspection."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrators only")
    async with async_session_maker() as session:
        users = (await session.execute(select(User).order_by(User.id))).scalars().all()
        workspaces = (await session.execute(select(Workspace).order_by(Workspace.id))).scalars().all()
        members = (await session.execute(select(WorkspaceMember).order_by(WorkspaceMember.id))).scalars().all()
        invites = (await session.execute(select(WorkspaceInvite).order_by(WorkspaceInvite.id))).scalars().all()

        return {
            "users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "full_name": u.full_name,
                    "first_name": getattr(u, "first_name", "") or "",
                    "last_name": getattr(u, "last_name", "") or "",
                    "email": u.email,
                    "role": u.role,
                    "is_approved": u.is_approved,
                    "onboarding_completed": u.onboarding_completed,
                    "active_workspace_id": u.active_workspace_id,
                    "created_at": _utc_iso(u.created_at),
                }
                for u in users
            ],
            "workspaces": [
                {
                    "id": w.id,
                    "name": w.name,
                    "slug": w.slug,
                    "badge_text": w.badge_text,
                    "badge_color": w.badge_color,
                    "owner_user_id": w.owner_user_id,
                    "created_at": _utc_iso(w.created_at),
                }
                for w in workspaces
            ],
            "members": [
                {
                    "workspace_id": m.workspace_id,
                    "user_id": m.user_id,
                    "role": m.role,
                    "joined_at": _utc_iso(m.joined_at),
                }
                for m in members
            ],
            "invites": [
                {
                    "id": inv.id,
                    "workspace_id": inv.workspace_id,
                    "email": inv.email,
                    "role": inv.role,
                    "status": inv.status,
                    "created_at": _utc_iso(inv.created_at),
                }
                for inv in invites
            ],
        }
