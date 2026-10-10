import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import case, delete, select

from api.auth import get_current_user
from api.deps import (
    _active_support_grant,
    _utc_iso,
    invalidate_summary_cache,
    record_security_event_and_raise,
)
from api.routers.audit import _stored_notification_channels
from api.schemas import (
    CreateWorkspaceInviteRequest,
    PublicInviteInfoResponse,
    TransferOwnershipRequest,
    UpdateMemberRoleRequest,
    WorkspaceInviteItem,
    WorkspaceInviteLinkResponse,
    WorkspaceMemberItem,
)
from core.config import settings
from core.email import send_invite_accepted_email, send_workspace_invitation_email
from core.rate_limit import rate_limit_dep
from database.db import async_session_maker
from database.models import AuditEvent, User, Workspace, WorkspaceInvite, WorkspaceMember

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Members & Invites"])


@router.get("/workspaces/{workspace_id}/members", response_model=List[WorkspaceMemberItem])
async def list_workspace_members(
    workspace_id: int,
    user: User = Depends(get_current_user),
):
    """List all members of a workspace with their roles and profile information."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        caller_role = caller_member.role if caller_member else None
        if not caller_role and user.role == "admin":
            grant = await _active_support_grant(session, user.id, workspace_id)
            if grant:
                caller_role = grant.role or "admin"
        if not caller_role:
            await record_security_event_and_raise(
                session,
                status_code=403,
                detail="You do not have access to this workspace",
                user=user,
                workspace_id=workspace_id,
                action="LIST_WORKSPACE_MEMBERS",
                resource_type="workspace",
                resource_id=str(workspace_id),
            )

        rows = (
            await session.execute(
                select(WorkspaceMember, User)
                .join(User, User.id == WorkspaceMember.user_id)
                .where(WorkspaceMember.workspace_id == workspace_id)
                .order_by(
                    case(
                        (WorkspaceMember.role == "owner", 1),
                        (WorkspaceMember.role == "admin", 2),
                        (WorkspaceMember.role == "buyer", 3),
                        else_=4,
                    ),
                    WorkspaceMember.joined_at.asc(),
                )
            )
        ).all()

        return [
            WorkspaceMemberItem(
                id=member.id,
                user_id=u.id,
                username=u.username or "",
                full_name=u.full_name or u.username or "",
                first_name=getattr(u, "first_name", "") or "",
                last_name=getattr(u, "last_name", "") or "",
                email=getattr(u, "email", None),
                avatar_url=getattr(u, "avatar_url", "") or "",
                role=member.role,
                joined_at=_utc_iso(member.joined_at),
                is_current_user=(u.id == user.id),
            )
            for member, u in rows
        ]


@router.patch("/workspaces/{workspace_id}/members/{member_user_id}", response_model=WorkspaceMemberItem)
async def update_workspace_member_role(
    workspace_id: int,
    member_user_id: int,
    req: UpdateMemberRoleRequest,
    user: User = Depends(get_current_user),
):
    """Change the role of an existing workspace member."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        caller_role = caller_member.role if caller_member else None
        if not caller_role and user.role == "admin":
            grant = await _active_support_grant(session, user.id, workspace_id)
            if grant:
                caller_role = grant.role or "admin"
        if not caller_role:
            await record_security_event_and_raise(
                session,
                status_code=403,
                detail="You do not have access to this workspace",
                user=user,
                workspace_id=workspace_id,
                action="UPDATE_MEMBER_ROLE",
                resource_type="workspace",
                resource_id=str(workspace_id),
            )

        if caller_role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="You do not have permission to change member roles")

        if member_user_id == user.id:
            raise HTTPException(status_code=400, detail="You cannot change your own role")

        target_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == member_user_id,
                )
            )
        ).scalar_one_or_none()
        if not target_member:
            raise HTTPException(status_code=404, detail="Member not found in this workspace")

        if target_member.role == "owner":
            raise HTTPException(status_code=400, detail="The owner's role cannot be changed. Use ownership transfer instead.")

        if caller_role == "admin" and target_member.role == "admin" and ws.owner_user_id != user.id:
            raise HTTPException(status_code=403, detail="Only the owner can change an admin's role")

        target_member.role = req.role
        await session.commit()

        target_user = (await session.execute(select(User).where(User.id == member_user_id))).scalar_one()
        return WorkspaceMemberItem(
            id=target_member.id,
            user_id=target_user.id,
            username=target_user.username or "",
            full_name=target_user.full_name or target_user.username or "",
            first_name=getattr(target_user, "first_name", "") or "",
            last_name=getattr(target_user, "last_name", "") or "",
            email=getattr(target_user, "email", None),
            avatar_url=getattr(target_user, "avatar_url", "") or "",
            role=target_member.role,
            joined_at=_utc_iso(target_member.joined_at),
            is_current_user=False,
        )


@router.delete("/workspaces/{workspace_id}/members/{member_user_id}")
async def remove_workspace_member(
    workspace_id: int,
    member_user_id: int,
    user: User = Depends(get_current_user),
):
    """Remove a member from the workspace."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        caller_role = caller_member.role if caller_member else None
        if not caller_role and user.role == "admin":
            grant = await _active_support_grant(session, user.id, workspace_id)
            if grant:
                caller_role = grant.role or "admin"
        if not caller_role:
            await record_security_event_and_raise(
                session,
                status_code=403,
                detail="You do not have access to this workspace",
                user=user,
                workspace_id=workspace_id,
                action="REMOVE_MEMBER",
                resource_type="workspace",
                resource_id=str(workspace_id),
            )

        if caller_role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="You do not have permission to remove members")

        if member_user_id == user.id:
            raise HTTPException(status_code=400, detail="Use the leave method to exit a workspace")

        target_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == member_user_id,
                )
            )
        ).scalar_one_or_none()
        if not target_member:
            raise HTTPException(status_code=404, detail="Member not found in this workspace")

        if target_member.role == "owner":
            raise HTTPException(status_code=400, detail="The workspace owner cannot be removed")

        if caller_role == "admin" and target_member.role == "admin" and ws.owner_user_id != user.id:
            raise HTTPException(status_code=403, detail="Only the owner can remove an admin")

        await session.execute(
            delete(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == member_user_id,
            )
        )

        target_user = (await session.execute(select(User).where(User.id == member_user_id))).scalar_one_or_none()
        if target_user and target_user.active_workspace_id == workspace_id:
            other_m = (
                await session.execute(
                    select(WorkspaceMember).where(WorkspaceMember.user_id == member_user_id).limit(1)
                )
            ).scalar_one_or_none()
            if other_m:
                target_user.active_workspace_id = other_m.workspace_id
            else:
                def_slug = f"buyerly-{target_user.id}"
                new_ws = Workspace(
                    name="Buyerly",
                    slug=def_slug,
                    badge_text="B",
                    badge_color="#F5A300",
                    owner_user_id=target_user.id,
                )
                session.add(new_ws)
                await session.flush()
                session.add(WorkspaceMember(workspace_id=new_ws.id, user_id=target_user.id, role="owner"))
                target_user.active_workspace_id = new_ws.id

        await session.commit()
        invalidate_summary_cache(workspace_id=workspace_id)
        return {"status": "ok", "message": "Member removed from the workspace"}


@router.post("/workspaces/{workspace_id}/leave")
async def leave_workspace(
    workspace_id: int,
    user: User = Depends(get_current_user),
):
    """Leave the workspace voluntarily."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if not caller_member:
            raise HTTPException(status_code=404, detail="You are not a member of this workspace")

        if caller_member.role == "owner":
            raise HTTPException(
                status_code=400,
                detail="The owner cannot leave the workspace. Transfer ownership or delete the workspace.",
            )

        await session.execute(
            delete(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )

        db_user = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
        next_ws_id = None
        if db_user.active_workspace_id == workspace_id:
            other_m = (
                await session.execute(
                    select(WorkspaceMember).where(WorkspaceMember.user_id == user.id).limit(1)
                )
            ).scalar_one_or_none()
            if other_m:
                db_user.active_workspace_id = other_m.workspace_id
                next_ws_id = other_m.workspace_id
            else:
                def_slug = f"buyerly-{user.id}"
                new_ws = Workspace(
                    name="Buyerly",
                    slug=def_slug,
                    badge_text="B",
                    badge_color="#F5A300",
                    owner_user_id=user.id,
                )
                session.add(new_ws)
                await session.flush()
                session.add(WorkspaceMember(workspace_id=new_ws.id, user_id=user.id, role="owner"))
                db_user.active_workspace_id = new_ws.id
                next_ws_id = new_ws.id

        await session.commit()
        invalidate_summary_cache(workspace_id=workspace_id)
        return {"status": "ok", "message": "You have left the workspace", "next_workspace_id": next_ws_id}


@router.post("/workspaces/{workspace_id}/transfer-ownership")
async def transfer_workspace_ownership(
    workspace_id: int,
    req: TransferOwnershipRequest,
    user: User = Depends(get_current_user),
):
    """Transfer workspace ownership to another member."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        if ws.owner_user_id != user.id:
            await record_security_event_and_raise(
                session,
                status_code=403,
                detail="Only the owner can transfer workspace ownership",
                user=user,
                workspace_id=workspace_id,
                action="TRANSFER_OWNERSHIP",
                resource_type="workspace",
                resource_id=str(workspace_id),
            )

        if req.new_owner_user_id == user.id:
            raise HTTPException(status_code=400, detail="You already own this workspace")

        target_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == req.new_owner_user_id,
                )
            )
        ).scalar_one_or_none()
        if not target_member:
            raise HTTPException(status_code=404, detail="The new owner must be a member of this workspace")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()

        ws.owner_user_id = req.new_owner_user_id
        target_member.role = "owner"
        if caller_member:
            caller_member.role = "admin"

        await session.commit()
        invalidate_summary_cache(workspace_id=workspace_id)
        return {
            "status": "ok",
            "message": "Ownership transferred",
            "new_owner_user_id": req.new_owner_user_id,
        }


@router.post("/workspaces/{workspace_id}/invites", response_model=WorkspaceInviteItem)
async def create_workspace_invite(
    workspace_id: int,
    req: CreateWorkspaceInviteRequest,
    user: User = Depends(get_current_user),
):
    """Create a new workspace invitation (targeted email or public link)."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        caller_role = caller_member.role if caller_member else None
        if not caller_role and user.role == "admin":
            grant = await _active_support_grant(session, user.id, workspace_id)
            if grant:
                caller_role = grant.role or "admin"
        if not caller_role:
            await record_security_event_and_raise(
                session,
                status_code=403,
                detail="You do not have access to this workspace",
                user=user,
                workspace_id=workspace_id,
                action="CREATE_INVITE",
                resource_type="workspace",
                resource_id=str(workspace_id),
            )

        if caller_role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="You do not have permission to create invites")

        token = f"inv_{secrets.token_urlsafe(24)}"
        now_dt = datetime.now(timezone.utc)
        expires_at = now_dt + timedelta(days=req.expires_in_days) if req.expires_in_days > 0 else None
        target_email = req.email.strip().lower() if req.email and req.email.strip() else None

        invite = WorkspaceInvite(
            workspace_id=workspace_id,
            token=token,
            email=target_email,
            role=req.role,
            inviter_user_id=user.id,
            status="pending",
            max_uses=req.max_uses,
            used_count=0,
            expires_at=expires_at,
        )
        session.add(invite)
        await session.flush()

        session.add(
            AuditEvent(
                workspace_id=workspace_id,
                owner_user_id=user.id,
                actor_type="user",
                actor_id=str(user.id),
                category="WORKSPACE_INVITE",
                event_type="INVITE_CREATE",
                status="SUCCESS",
                message=f"Invite created for {target_email or 'a public link'}",
                details={
                    "invite_id": invite.id,
                    "email": target_email,
                    "role": invite.role,
                    "max_uses": invite.max_uses,
                },
            )
        )
        await session.commit()
        await session.refresh(invite)

        if target_email:
            send_ok = True
            try:
                inviter_name = user.full_name or user.username or "A colleague"
                await send_workspace_invitation_email(
                    to_email=target_email,
                    workspace_name=ws.name,
                    inviter_name=inviter_name,
                    role=invite.role,
                    invite_token=invite.token,
                )
            except Exception as e:
                send_ok = False
                logger.error("Failed to send invitation email to %s: %s", target_email, e)

            session.add(
                AuditEvent(
                    workspace_id=workspace_id,
                    owner_user_id=user.id,
                    actor_type="user",
                    actor_id=str(user.id),
                    category="WORKSPACE_INVITE",
                    event_type="INVITE_SEND",
                    status="SUCCESS" if send_ok else "FAILED",
                    message=f"Invite delivery to {target_email}: {'success' if send_ok else 'error'}",
                    details={"invite_id": invite.id, "email": target_email},
                )
            )
            await session.commit()

        base_url = settings.WEBAPP_URL.rstrip("/") if settings.WEBAPP_URL else ""
        invite_url = f"{base_url}/invite/{invite.token}" if base_url else f"/invite/{invite.token}"

        return WorkspaceInviteItem(
            id=invite.id,
            workspace_id=ws.id,
            workspace_name=ws.name,
            token=invite.token,
            invite_url=invite_url,
            email=invite.email,
            role=invite.role,
            status=invite.status,
            max_uses=invite.max_uses,
            used_count=invite.used_count,
            inviter_name=user.full_name or user.username or "",
            expires_at=_utc_iso(invite.expires_at),
            created_at=_utc_iso(invite.created_at),
        )


@router.get("/workspaces/{workspace_id}/invites", response_model=List[WorkspaceInviteItem])
async def list_workspace_invites(
    workspace_id: int,
    user: User = Depends(get_current_user),
):
    """List all invites of a workspace."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        caller_role = caller_member.role if caller_member else None
        if not caller_role and user.role == "admin":
            grant = await _active_support_grant(session, user.id, workspace_id)
            if grant:
                caller_role = grant.role or "admin"
        if not caller_role:
            await record_security_event_and_raise(
                session,
                status_code=403,
                detail="You do not have access to this workspace",
                user=user,
                workspace_id=workspace_id,
                action="LIST_INVITES",
                resource_type="workspace",
                resource_id=str(workspace_id),
            )

        if caller_role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="You do not have permission to view invites")

        rows = (
            await session.execute(
                select(WorkspaceInvite, User)
                .outerjoin(User, User.id == WorkspaceInvite.inviter_user_id)
                .where(WorkspaceInvite.workspace_id == workspace_id)
                .order_by(WorkspaceInvite.id.desc())
            )
        ).all()

        now_dt = datetime.now(timezone.utc)
        items = []
        base_url = settings.WEBAPP_URL.rstrip("/") if settings.WEBAPP_URL else ""

        for invite, inviter in rows:
            current_status = invite.status
            if current_status == "pending" and invite.expires_at and now_dt > invite.expires_at:
                current_status = "expired"

            invite_url = f"{base_url}/invite/{invite.token}" if base_url else f"/invite/{invite.token}"
            inviter_name = (inviter.full_name or inviter.username) if inviter else ""

            items.append(
                WorkspaceInviteItem(
                    id=invite.id,
                    workspace_id=ws.id,
                    workspace_name=ws.name,
                    token=invite.token,
                    invite_url=invite_url,
                    email=invite.email,
                    role=invite.role,
                    status=current_status,
                    max_uses=invite.max_uses,
                    used_count=invite.used_count,
                    inviter_name=inviter_name,
                    expires_at=_utc_iso(invite.expires_at),
                    created_at=_utc_iso(invite.created_at),
                )
            )
        return items


def _invite_link_query(workspace_id: int):
    """The workspace's invite link: a pending public invite with no use limit and no expiry."""
    return select(WorkspaceInvite).where(
        WorkspaceInvite.workspace_id == workspace_id,
        WorkspaceInvite.email.is_(None),
        WorkspaceInvite.status == "pending",
        WorkspaceInvite.max_uses == 0,
        WorkspaceInvite.expires_at.is_(None),
    )


def _invite_url(token: str) -> str:
    base_url = settings.WEBAPP_URL.rstrip("/") if settings.WEBAPP_URL else ""
    return f"{base_url}/invite/{token}" if base_url else f"/invite/{token}"


async def _require_invite_link_admin(session, workspace_id: int, user: User, action: str) -> None:
    """Only a workspace owner or admin manages the invite link, as in Linear."""
    ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    caller_member = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    caller_role = caller_member.role if caller_member else None
    if not caller_role and user.role == "admin":
        grant = await _active_support_grant(session, user.id, workspace_id)
        if grant:
            caller_role = grant.role or "admin"
    if not caller_role:
        await record_security_event_and_raise(
            session,
            status_code=403,
            detail="You do not have access to this workspace",
            user=user,
            workspace_id=workspace_id,
            action=action,
            resource_type="workspace",
            resource_id=str(workspace_id),
        )
    if caller_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only workspace admins can manage the invite link")


async def _revoke_invite_links(session, workspace_id: int) -> int:
    links = (await session.execute(_invite_link_query(workspace_id).with_for_update())).scalars().all()
    for link in links:
        link.status = "revoked"
    return len(links)


async def _create_invite_link(session, workspace_id: int, user: User, event_type: str) -> WorkspaceInvite:
    link = WorkspaceInvite(
        workspace_id=workspace_id,
        token=f"inv_{secrets.token_urlsafe(24)}",
        email=None,
        role="buyer",
        inviter_user_id=user.id,
        status="pending",
        max_uses=0,
        used_count=0,
        expires_at=None,
    )
    session.add(link)
    await session.flush()
    session.add(
        AuditEvent(
            workspace_id=workspace_id,
            owner_user_id=user.id,
            actor_type="user",
            actor_id=str(user.id),
            category="WORKSPACE_INVITE",
            event_type=event_type,
            status="SUCCESS",
            message="Invite link enabled" if event_type == "INVITE_LINK_ENABLE" else "Invite link reset",
            details={"invite_id": link.id},
        )
    )
    return link


@router.get("/workspaces/{workspace_id}/invite-link", response_model=WorkspaceInviteLinkResponse)
async def get_workspace_invite_link(workspace_id: int, user: User = Depends(get_current_user)):
    """Settings → Security → Invite links: the current link, or null while links are off."""
    async with async_session_maker() as session:
        await _require_invite_link_admin(session, workspace_id, user, "VIEW_INVITE_LINK")
        link = (
            await session.execute(_invite_link_query(workspace_id).order_by(WorkspaceInvite.id.desc()).limit(1))
        ).scalar_one_or_none()
        return WorkspaceInviteLinkResponse(invite_url=_invite_url(link.token) if link else None)


@router.post("/workspaces/{workspace_id}/invite-link", response_model=WorkspaceInviteLinkResponse)
async def enable_workspace_invite_link(workspace_id: int, user: User = Depends(get_current_user)):
    """Turns invite links on; an existing link stays the same."""
    async with async_session_maker() as session:
        await _require_invite_link_admin(session, workspace_id, user, "ENABLE_INVITE_LINK")
        link = (
            await session.execute(_invite_link_query(workspace_id).order_by(WorkspaceInvite.id.desc()).limit(1))
        ).scalar_one_or_none()
        if not link:
            link = await _create_invite_link(session, workspace_id, user, "INVITE_LINK_ENABLE")
            await session.commit()
        return WorkspaceInviteLinkResponse(invite_url=_invite_url(link.token))


@router.post("/workspaces/{workspace_id}/invite-link/reset", response_model=WorkspaceInviteLinkResponse)
async def reset_workspace_invite_link(workspace_id: int, user: User = Depends(get_current_user)):
    """Linear's "Reset invite link": the current link stops working and a new one replaces it."""
    async with async_session_maker() as session:
        await _require_invite_link_admin(session, workspace_id, user, "RESET_INVITE_LINK")
        await _revoke_invite_links(session, workspace_id)
        link = await _create_invite_link(session, workspace_id, user, "INVITE_LINK_RESET")
        await session.commit()
        return WorkspaceInviteLinkResponse(invite_url=_invite_url(link.token))


@router.delete("/workspaces/{workspace_id}/invite-link", response_model=WorkspaceInviteLinkResponse)
async def disable_workspace_invite_link(workspace_id: int, user: User = Depends(get_current_user)):
    """Turns invite links off: the link stops working."""
    async with async_session_maker() as session:
        await _require_invite_link_admin(session, workspace_id, user, "DISABLE_INVITE_LINK")
        if await _revoke_invite_links(session, workspace_id):
            session.add(
                AuditEvent(
                    workspace_id=workspace_id,
                    owner_user_id=user.id,
                    actor_type="user",
                    actor_id=str(user.id),
                    category="WORKSPACE_INVITE",
                    event_type="INVITE_LINK_DISABLE",
                    status="SUCCESS",
                    message="Invite link disabled",
                    details={},
                )
            )
            await session.commit()
        return WorkspaceInviteLinkResponse(invite_url=None)


@router.delete("/workspaces/{workspace_id}/invites/{invite_id}")
async def revoke_workspace_invite(
    workspace_id: int,
    invite_id: int,
    user: User = Depends(get_current_user),
):
    """Revoke an active invitation."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        caller_role = caller_member.role if caller_member else None
        if not caller_role and user.role == "admin":
            grant = await _active_support_grant(session, user.id, workspace_id)
            if grant:
                caller_role = grant.role or "admin"
        if not caller_role:
            await record_security_event_and_raise(
                session,
                status_code=403,
                detail="You do not have access to this workspace",
                user=user,
                workspace_id=workspace_id,
                action="REVOKE_INVITE",
                resource_type="workspace",
                resource_id=str(workspace_id),
            )

        if caller_role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="You do not have permission to revoke invites")

        invite = (
            await session.execute(
                select(WorkspaceInvite).where(
                    WorkspaceInvite.id == invite_id,
                    WorkspaceInvite.workspace_id == workspace_id,
                ).with_for_update()
            )
        ).scalar_one_or_none()
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")

        invite.status = "revoked"
        session.add(
            AuditEvent(
                workspace_id=workspace_id,
                owner_user_id=user.id,
                actor_type="user",
                actor_id=str(user.id),
                category="WORKSPACE_INVITE",
                event_type="INVITE_REVOKE",
                status="SUCCESS",
                message="Invite revoked",
                details={"invite_id": invite.id, "email": invite.email},
            )
        )
        await session.commit()
        return {"status": "ok", "message": "Invite revoked"}


@router.post(
    "/workspaces/{workspace_id}/invites/{invite_id}/resend",
    dependencies=[Depends(rate_limit_dep(limit=5, window_seconds=60, scope="invite_resend"))],
)
async def resend_workspace_invite(
    workspace_id: int,
    invite_id: int,
    user: User = Depends(get_current_user),
):
    """Email a pending personal invitation again, with a fresh 7-day expiry."""
    async with async_session_maker() as session:
        ws = (await session.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        caller_member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        caller_role = caller_member.role if caller_member else None
        if not caller_role and user.role == "admin":
            grant = await _active_support_grant(session, user.id, workspace_id)
            if grant:
                caller_role = grant.role or "admin"
        if not caller_role:
            await record_security_event_and_raise(
                session,
                status_code=403,
                detail="You do not have access to this workspace",
                user=user,
                workspace_id=workspace_id,
                action="RESEND_INVITE",
                resource_type="workspace",
                resource_id=str(workspace_id),
            )

        if caller_role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="You do not have permission to resend invites")

        invite = (
            await session.execute(
                select(WorkspaceInvite).where(
                    WorkspaceInvite.id == invite_id,
                    WorkspaceInvite.workspace_id == workspace_id,
                ).with_for_update()
            )
        ).scalar_one_or_none()
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")
        # "expired" is only ever derived or stored for a pending invite whose date passed.
        if not invite.email or invite.status not in ("pending", "expired"):
            raise HTTPException(status_code=400, detail="Only a pending email invite can be resent")

        invite.status = "pending"
        invite.expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await session.commit()

        inviter_name = user.full_name or user.username or "A colleague"
        try:
            send_ok = await send_workspace_invitation_email(
                to_email=invite.email,
                workspace_name=ws.name,
                inviter_name=inviter_name,
                role=invite.role,
                invite_token=invite.token,
            )
        except Exception as e:
            send_ok = False
            logger.error("Failed to resend invitation email to %s: %s", invite.email, e)

        session.add(
            AuditEvent(
                workspace_id=workspace_id,
                owner_user_id=user.id,
                actor_type="user",
                actor_id=str(user.id),
                category="WORKSPACE_INVITE",
                event_type="INVITE_SEND",
                status="SUCCESS" if send_ok else "FAILED",
                message=f"Invite resent to {invite.email}: {'success' if send_ok else 'error'}",
                details={"invite_id": invite.id, "email": invite.email, "resend": True},
            )
        )
        await session.commit()
        if not send_ok:
            raise HTTPException(status_code=502, detail="The invitation email could not be delivered")
        return {"status": "ok", "message": "Invite resent", "expires_at": _utc_iso(invite.expires_at)}


@router.get(
    "/invites/{token}",
    response_model=PublicInviteInfoResponse,
    dependencies=[Depends(rate_limit_dep(limit=30, window_seconds=60, scope="invite_info"))],
)
async def get_public_invite_info(token: str):
    """Public endpoint to inspect an invite before joining."""
    async with async_session_maker() as session:
        invite = (
            await session.execute(
                select(WorkspaceInvite).where(WorkspaceInvite.token == token)
            )
        ).scalar_one_or_none()
        if not invite:
            return PublicInviteInfoResponse(
                valid=False,
                status="not_found",
                message="Invite not found or the link is invalid",
            )

        now_dt = datetime.now(timezone.utc)
        if invite.status == "revoked":
            return PublicInviteInfoResponse(
                valid=False,
                status="revoked",
                message="This invite was revoked by an administrator",
            )

        if invite.expires_at and now_dt > invite.expires_at:
            return PublicInviteInfoResponse(
                valid=False,
                status="expired",
                message="This invite has expired",
            )

        if invite.max_uses > 0 and invite.used_count >= invite.max_uses:
            return PublicInviteInfoResponse(
                valid=False,
                status="accepted",
                message="This invite has reached its usage limit",
            )

        ws = (await session.execute(select(Workspace).where(Workspace.id == invite.workspace_id))).scalar_one_or_none()
        if not ws:
            return PublicInviteInfoResponse(
                valid=False,
                status="not_found",
                message="This workspace no longer exists",
            )

        inviter = None
        if invite.inviter_user_id:
            inviter = (
                await session.execute(
                    select(User).where(User.id == invite.inviter_user_id)
                )
            ).scalar_one_or_none()

        inviter_name = (inviter.full_name or inviter.username) if inviter else "The team"

        return PublicInviteInfoResponse(
            valid=True,
            status="pending",
            workspace_name=ws.name,
            workspace_slug=ws.slug,
            workspace_badge_text=ws.badge_text or ws.name[:1].upper(),
            workspace_badge_color=ws.badge_color or "#F5A300",
            inviter_name=inviter_name,
            role=invite.role,
            target_email=invite.email,
            expires_at=_utc_iso(invite.expires_at),
            message="Invite is valid",
        )


async def _email_inviter_about_join(
    inviter_id: Optional[int], member_id: int, workspace_id: int
) -> None:
    """Linear emails whoever sent the invite as soon as the invitee joins,
    unless they turned off Other updates → Invite accepted."""
    if not inviter_id or inviter_id == member_id:
        return
    try:
        async with async_session_maker() as session:
            inviter = await session.get(User, inviter_id)
            inviter_membership = (
                await session.execute(
                    select(WorkspaceMember).where(
                        WorkspaceMember.workspace_id == workspace_id,
                        WorkspaceMember.user_id == inviter_id,
                    )
                )
            ).scalar_one_or_none()
            member = await session.get(User, member_id)
            ws = await session.get(Workspace, workspace_id)
        # Someone who has left the workspace is not told about it any more.
        if not (inviter and inviter.email and inviter_membership and member and ws):
            return
        if not _stored_notification_channels(inviter_membership).invite_accepted:
            return
        webapp = (settings.WEBAPP_URL or "https://buyerly.app").rstrip("/")
        await send_invite_accepted_email(
            to_email=inviter.email,
            member_name=member.full_name or member.email or member.username,
            members_url=f"{webapp}/{ws.slug}/settings/members",
            settings_url=f"{webapp}/{ws.slug}/settings/account/notifications",
        )
    except Exception:
        logger.exception("Could not email the inviter about workspace %s", workspace_id)


@router.post(
    "/invites/{token}/accept",
    dependencies=[Depends(rate_limit_dep(limit=10, window_seconds=60, scope="invite_accept"))],
)
async def accept_workspace_invite(
    token: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    """Accept a workspace invite and join the workspace."""
    async with async_session_maker() as session:
        invite = (
            await session.execute(
                select(WorkspaceInvite)
                .where(WorkspaceInvite.token == token)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")

        now_dt = datetime.now(timezone.utc)
        if invite.status == "revoked":
            session.add(
                AuditEvent(
                    workspace_id=invite.workspace_id,
                    owner_user_id=user.id,
                    actor_type="user",
                    actor_id=str(user.id),
                    category="WORKSPACE_INVITE",
                    event_type="INVITE_REJECT",
                    status="FAILED",
                    message="Attempt to accept a revoked invite",
                    details={"invite_id": invite.id, "reason": "revoked"},
                )
            )
            await session.commit()
            raise HTTPException(status_code=400, detail="This invite was revoked")

        if invite.expires_at and now_dt > invite.expires_at:
            invite.status = "expired"
            session.add(
                AuditEvent(
                    workspace_id=invite.workspace_id,
                    owner_user_id=user.id,
                    actor_type="user",
                    actor_id=str(user.id),
                    category="WORKSPACE_INVITE",
                    event_type="INVITE_REJECT",
                    status="FAILED",
                    message="Attempt to accept an expired invite",
                    details={"invite_id": invite.id, "reason": "expired"},
                )
            )
            await session.commit()
            raise HTTPException(status_code=400, detail="This invite has expired")

        ws = (await session.execute(select(Workspace).where(Workspace.id == invite.workspace_id))).scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        # Targeted invite protection: verify user has verified email matching invite.email
        if invite.email:
            target_email = invite.email.strip().lower()
            user_email = (user.email or "").strip().lower()

            if not user_email or not getattr(user, "email_verified_at", None):
                session.add(
                    AuditEvent(
                        workspace_id=invite.workspace_id,
                        owner_user_id=user.id,
                        actor_type="user",
                        actor_id=str(user.id),
                        category="WORKSPACE_INVITE",
                        event_type="INVITE_REJECT",
                        status="FAILED",
                        message="Attempt to accept a targeted invite without a confirmed email",
                        details={"invite_id": invite.id, "reason": "unverified_email"},
                    )
                )
                await session.commit()
                raise HTTPException(
                    status_code=403,
                    detail="A confirmed email address is required to accept a personal invite.",
                )

            if user_email != target_email:
                session.add(
                    AuditEvent(
                        workspace_id=invite.workspace_id,
                        owner_user_id=user.id,
                        actor_type="user",
                        actor_id=str(user.id),
                        category="WORKSPACE_INVITE",
                        event_type="INVITE_REJECT",
                        status="FAILED",
                        message="Attempt to accept a targeted invite with a mismatched email",
                        details={"invite_id": invite.id, "reason": "email_mismatch"},
                    )
                )
                await session.commit()
                raise HTTPException(
                    status_code=403,
                    detail="This invite is intended for a different email address.",
                )

        existing_m = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == invite.workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()

        # A retry by the user who already joined is idempotent: it must not
        # consume another use even after a single-use invite became accepted.
        # Other users still observe the exhausted state while this row lock is
        # held, so concurrent accepts cannot exceed max_uses.
        if not existing_m and (
            invite.status == "accepted"
            or (invite.max_uses > 0 and invite.used_count >= invite.max_uses)
        ):
            session.add(
                AuditEvent(
                    workspace_id=invite.workspace_id,
                    owner_user_id=user.id,
                    actor_type="user",
                    actor_id=str(user.id),
                    category="WORKSPACE_INVITE",
                    event_type="INVITE_REJECT",
                    status="FAILED",
                    message="This invite has reached its usage limit",
                    details={"invite_id": invite.id, "reason": "max_uses_reached"},
                )
            )
            await session.commit()
            raise HTTPException(status_code=400, detail="This invite has reached its usage limit")

        db_user = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
        db_user.active_workspace_id = ws.id

        if not existing_m:
            member = WorkspaceMember(
                workspace_id=invite.workspace_id,
                user_id=user.id,
                role=invite.role,
            )
            session.add(member)
            invite.used_count += 1
            if invite.max_uses > 0 and invite.used_count >= invite.max_uses:
                invite.status = "accepted"

        if not db_user.first_name and not db_user.full_name:
            db_user.onboarding_step = "personal_details"
            db_user.onboarding_completed = False
        else:
            db_user.onboarding_step = "completed"
            db_user.onboarding_completed = True

        session.add(
            AuditEvent(
                workspace_id=invite.workspace_id,
                owner_user_id=user.id,
                actor_type="user",
                actor_id=str(user.id),
                category="WORKSPACE_INVITE",
                event_type="INVITE_ACCEPT",
                status="SUCCESS",
                message=f"Invite accepted by {user.username}",
                details={
                    "invite_id": invite.id,
                    "workspace_id": ws.id,
                    "user_id": user.id,
                    "role": existing_m.role if existing_m else invite.role,
                },
            )
        )

        await session.commit()
        invalidate_summary_cache(workspace_id=ws.id)
        if not existing_m:
            background_tasks.add_task(
                _email_inviter_about_join, invite.inviter_user_id, user.id, ws.id
            )
        return {
            "status": "ok",
            "message": f"You have joined the workspace {ws.name}",
            "workspace_id": ws.id,
            "workspace_slug": ws.slug,
            "role": existing_m.role if existing_m else invite.role,
            "onboarding_step": db_user.onboarding_step,
            "onboarding_completed": db_user.onboarding_completed,
        }
