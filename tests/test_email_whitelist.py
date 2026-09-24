import unittest
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.routers.auth as auth_router_module
import api.server as api_server_module
import database.db as database_db_module
from api.server import create_app
from core.config import settings
from core.rate_limit import limiter
from database.db import hash_password
from database.models import (
    AllowedEmail,
    User,
    WebSession,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)
from tests.test_db_helper import create_test_engine, init_test_db


class TestEmailWhitelistAccess(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.limiter_patcher = patch.object(limiter, "is_allowed", new_callable=AsyncMock)
        self.mock_limiter = self.limiter_patcher.start()
        self.mock_limiter.return_value = (True, 0)

        self.original_auth_session_maker = auth_router_module.async_session_maker
        self.original_api_session_maker = api_auth_module.async_session_maker
        self.original_routes_session_maker = api_routes_module.async_session_maker
        self.original_server_session_maker = api_server_module.async_session_maker
        self.original_db_session_maker = database_db_module.async_session_maker
        self.original_admin_chat_id = settings.ADMIN_CHAT_ID
        settings.ADMIN_CHAT_ID = "123456789"
        # OTP hashing needs a pepper, and the module must not rely on another
        # test file having set one earlier in the same process: CI splits the
        # suite across shards, so each module runs on its own.
        self.original_otp_pepper = settings.OTP_PEPPER
        settings.OTP_PEPPER = "test-otp-pepper"
        self.original_email_login_without_invite = settings.EMAIL_LOGIN_WITHOUT_INVITE
        settings.EMAIL_LOGIN_WITHOUT_INVITE = True

        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        await init_test_db(self.engine)

        auth_router_module.async_session_maker = self.sessions
        api_auth_module.async_session_maker = self.sessions
        api_routes_module.async_session_maker = self.sessions
        api_server_module.async_session_maker = self.sessions
        database_db_module.async_session_maker = self.sessions

        self.app = create_app()

        # Seed admin and buyer
        async with self.sessions() as session:
            admin = User(
                telegram_id="123456789",
                username="admin_user",
                full_name="Admin User",
                email="admin@buyerly.com",
                password_hash=hash_password("adminpassword123"),
                role="admin",
                is_approved=True,
            )
            buyer = User(
                telegram_id="987654321",
                username="buyer_user",
                full_name="Buyer User",
                email="buyer@buyerly.com",
                password_hash=hash_password("buyerpassword123"),
                role="buyer",
                is_approved=True,
            )
            session.add_all([admin, buyer])
            await session.commit()
            await session.refresh(admin)
            await session.refresh(buyer)
            self.admin_id = admin.id
            self.buyer_id = buyer.id

    async def asyncTearDown(self):
        self.limiter_patcher.stop()
        auth_router_module.async_session_maker = self.original_auth_session_maker
        api_auth_module.async_session_maker = self.original_api_session_maker
        api_routes_module.async_session_maker = self.original_routes_session_maker
        api_server_module.async_session_maker = self.original_server_session_maker
        database_db_module.async_session_maker = self.original_db_session_maker
        settings.ADMIN_CHAT_ID = self.original_admin_chat_id
        settings.OTP_PEPPER = self.original_otp_pepper
        settings.EMAIL_LOGIN_WITHOUT_INVITE = self.original_email_login_without_invite
        await self.engine.dispose()

    async def test_unlisted_email_rejected_on_request_temporary_password(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
            resp = await client.post(
                "/api/auth/request-temporary-password",
                json={"email": "stranger@random.com"},
            )
            self.assertEqual(resp.status_code, 403)
            self.assertIn("not on the allowlist", resp.json()["detail"])

    async def _seed_joined_member(self):
        async with self.sessions() as session:
            user = await session.get(User, self.buyer_id)
            user.email_verified_at = datetime.now(timezone.utc)
            ws = Workspace(name="Joined", slug="joined", owner_user_id=self.admin_id)
            session.add(ws)
            await session.flush()
            session.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="buyer"))
            session.add(WorkspaceInvite(
                workspace_id=ws.id, inviter_user_id=self.admin_id,
                email=user.email, role="buyer", token="spent-invitation-token",
                status="accepted", max_uses=1, used_count=1,
            ))
            await session.commit()

    async def test_joined_member_can_repeat_login_with_code_and_link(self):
        await self._seed_joined_member()
        with patch("api.routers.auth.send_otp_verification_email", new_callable=AsyncMock, return_value=True) as send:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://test") as client:
                for use_link in (False, True):
                    response = await client.post("/api/auth/request-temporary-password", json={"email": "buyer@buyerly.com"})
                    self.assertEqual(response.status_code, 200, response.text)
                    _, code, link = send.call_args.args
                    endpoint = "verify-email-link" if use_link else "verify-temporary-password"
                    payload = {"token": parse_qs(urlsplit(link).query)["token"][0]} if use_link else {"email": "buyer@buyerly.com", "code": code}
                    response = await client.post(f"/api/auth/{endpoint}", json=payload)
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertIsNone(response.json()["redirect_url"])
                    self.assertTrue(client.cookies.get("buyerly_session"))
                    client.cookies.clear()
        async with self.sessions() as session:
            self.assertIsNone((await session.execute(select(AllowedEmail).where(AllowedEmail.email == "buyer@buyerly.com"))).scalar_one_or_none())

    async def test_membership_removal_invalidates_issued_login(self):
        await self._seed_joined_member()
        with patch("api.routers.auth.send_otp_verification_email", new_callable=AsyncMock, return_value=True) as send:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://test") as client:
                response = await client.post("/api/auth/request-temporary-password", json={"email": "buyer@buyerly.com"})
                self.assertEqual(response.status_code, 200, response.text)
                code = send.call_args.args[1]
                async with self.sessions() as session:
                    await session.execute(delete(WorkspaceMember).where(WorkspaceMember.user_id == self.buyer_id))
                    await session.commit()
                response = await client.post("/api/auth/verify-temporary-password", json={"email": "buyer@buyerly.com", "code": code})
                self.assertEqual(response.status_code, 403, response.text)
                self.assertIsNone(client.cookies.get("buyerly_session"))

    async def test_unapproved_or_unverified_member_cannot_request_login(self):
        await self._seed_joined_member()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://test") as client:
            for approved, verified in ((False, True), (True, False)):
                async with self.sessions() as session:
                    user = await session.get(User, self.buyer_id)
                    user.is_approved = approved
                    user.email_verified_at = datetime.now(timezone.utc) if verified else None
                    await session.commit()
                response = await client.post("/api/auth/request-temporary-password", json={"email": "buyer@buyerly.com"})
                self.assertEqual(response.status_code, 403, response.text)

    async def test_whitelisted_email_allowed_on_request_temporary_password(self):
        async with self.sessions() as session:
            session.add(AllowedEmail(email="allowed.buyer@agency.com", added_by="admin"))
            await session.commit()

        with patch("api.routers.auth.send_otp_verification_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
                resp = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": "ALLOWED.BUYER@agency.com"},
                )
                self.assertEqual(resp.status_code, 200)
                self.assertTrue(resp.json()["ok"])
                self.assertEqual(mock_send.call_count, 1)

    async def test_invited_email_allowed_on_request_temporary_password(self):
        from datetime import datetime, timedelta, timezone
        async with self.sessions() as session:
            ws = Workspace(name="Test WS", slug="test-ws", owner_user_id=self.admin_id)
            session.add(ws)
            await session.flush()
            invite = WorkspaceInvite(
                workspace_id=ws.id,
                inviter_user_id=self.admin_id,
                email="invited.partner@agency.com",
                role="buyer",
                token="invite-token-123",
                used_count=0,
                max_uses=1,
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            )
            session.add(invite)
            await session.commit()

        with patch("api.routers.auth.send_otp_verification_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
                resp = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": "invited.partner@agency.com"},
                )
                self.assertEqual(resp.status_code, 200)
                self.assertTrue(resp.json()["ok"])

    async def test_admin_whitelist_api_crud(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
            # Login as admin
            login_resp = await client.post(
                "/api/auth/login",
                json={"username": "admin_user", "password": "adminpassword123"},
            )
            self.assertEqual(login_resp.status_code, 200)
            csrf_token = client.cookies.get("buyerly_csrf")

            # 1. Add email
            add_resp = await client.post(
                "/api/auth/admin/allowed-emails",
                headers={"X-CSRF-Token": csrf_token} if csrf_token else {},
                json={"email": "NewBuyer@traffic.com", "comment": "Lead Buyer"},
            )
            self.assertEqual(add_resp.status_code, 200)
            data = add_resp.json()
            self.assertEqual(data["email"], "newbuyer@traffic.com")
            self.assertEqual(data["comment"], "Lead Buyer")
            email_id = data["id"]

            # 2. List emails
            list_resp = await client.get("/api/auth/admin/allowed-emails")
            self.assertEqual(list_resp.status_code, 200)
            emails = list_resp.json()
            self.assertTrue(any(e["id"] == email_id for e in emails))

            # 3. Delete email
            del_resp = await client.delete(
                f"/api/auth/admin/allowed-emails/{email_id}",
                headers={"X-CSRF-Token": csrf_token} if csrf_token else {},
            )
            self.assertEqual(del_resp.status_code, 200)

            # 4. Verify deleted
            list_resp2 = await client.get("/api/auth/admin/allowed-emails")
            emails2 = list_resp2.json()
            self.assertFalse(any(e["id"] == email_id for e in emails2))

    async def test_buyer_forbidden_from_admin_whitelist_api(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
            # Login as buyer
            login_resp = await client.post(
                "/api/auth/login",
                json={"username": "buyer_user", "password": "buyerpassword123"},
            )
            self.assertEqual(login_resp.status_code, 200)
            csrf_token = client.cookies.get("buyerly_csrf")

            # Attempt to call admin endpoints
            get_resp = await client.get("/api/auth/admin/allowed-emails")
            self.assertEqual(get_resp.status_code, 403)

            add_resp = await client.post(
                "/api/auth/admin/allowed-emails",
                headers={"X-CSRF-Token": csrf_token} if csrf_token else {},
                json={"email": "hacker@test.com"},
            )
            self.assertEqual(add_resp.status_code, 403)

    async def test_revocation_cascades_to_user_approval_and_sessions(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
            # Admin adds email for new user
            async with self.sessions() as session:
                entry = AllowedEmail(email="revokeme@team.com", added_by="admin")
                session.add(entry)
                await session.commit()
                await session.refresh(entry)
                entry_id = entry.id

            # User logs in and gets session
            async with self.sessions() as session:
                user = User(
                    username="revokeme",
                    email="revokeme@team.com",
                    password_hash=hash_password("pass123456"),
                    role="buyer",
                    is_approved=True,
                )
                session.add(user)
                await session.commit()
                await session.refresh(user)
                target_user_id = user.id

                from datetime import datetime, timedelta, timezone
                session.add(WebSession(
                    id="session-revokeme-123",
                    user_id=target_user_id,
                    token_hash="hash-token-revokeme-123",
                    csrf_hash="csrf-hash-revokeme-123",
                    expires_at=datetime.now(timezone.utc) + timedelta(days=1),
                ))
                await session.commit()

            # Admin deletes email via API
            admin_login = await client.post(
                "/api/auth/login",
                json={"username": "admin_user", "password": "adminpassword123"},
            )
            self.assertEqual(admin_login.status_code, 200)
            csrf_token = client.cookies.get("buyerly_csrf")

            del_resp = await client.delete(
                f"/api/auth/admin/allowed-emails/{entry_id}",
                headers={"X-CSRF-Token": csrf_token} if csrf_token else {},
            )
            self.assertEqual(del_resp.status_code, 200)

            # Check that user is no longer approved and web session was dropped
            async with self.sessions() as session:
                u = (await session.execute(select(User).where(User.id == target_user_id))).scalar_one()
                self.assertFalse(u.is_approved)

                active_sessions = (await session.execute(
                    select(WebSession).where(WebSession.user_id == target_user_id)
                )).scalars().all()
                self.assertEqual(len(active_sessions), 0)


    async def _seed_pending_invite(self, token="password-first-invite-token"):
        from datetime import timedelta
        async with self.sessions() as session:
            ws = Workspace(name="Invite WS", slug="invite-ws", owner_user_id=self.admin_id)
            session.add(ws)
            await session.flush()
            session.add(WorkspaceInvite(
                workspace_id=ws.id,
                inviter_user_id=self.admin_id,
                email="newcomer@agency.com",
                role="buyer",
                token=token,
                used_count=0,
                max_uses=1,
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            ))
            await session.commit()
        return token

    async def test_email_login_without_invite_is_disabled_by_default(self):
        await self._seed_joined_member()
        settings.EMAIL_LOGIN_WITHOUT_INVITE = False
        with patch("api.routers.auth.send_otp_verification_email", new_callable=AsyncMock, return_value=True) as send:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://test") as client:
                response = await client.post("/api/auth/request-temporary-password", json={"email": "buyer@buyerly.com"})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertIn("only through a workspace invitation", response.json()["detail"])
        send.assert_not_called()

    async def test_issued_non_invite_code_and_link_stop_working_when_disabled(self):
        await self._seed_joined_member()
        with patch("api.routers.auth.send_otp_verification_email", new_callable=AsyncMock, return_value=True) as send:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://test") as client:
                for use_link in (False, True):
                    settings.EMAIL_LOGIN_WITHOUT_INVITE = True
                    response = await client.post("/api/auth/request-temporary-password", json={"email": "buyer@buyerly.com"})
                    self.assertEqual(response.status_code, 200, response.text)
                    _, code, link = send.call_args.args
                    settings.EMAIL_LOGIN_WITHOUT_INVITE = False
                    endpoint = "verify-email-link" if use_link else "verify-temporary-password"
                    payload = {"token": parse_qs(urlsplit(link).query)["token"][0]} if use_link else {"email": "buyer@buyerly.com", "code": code}
                    response = await client.post(f"/api/auth/{endpoint}", json=payload)
                    self.assertEqual(response.status_code, 403, response.text)
                    self.assertIsNone(client.cookies.get("buyerly_session"))

    async def test_invite_email_login_still_works_when_disabled(self):
        token = await self._seed_pending_invite()
        settings.EMAIL_LOGIN_WITHOUT_INVITE = False
        with patch("api.routers.auth.send_otp_verification_email", new_callable=AsyncMock, return_value=True) as send:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://test") as client:
                response = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": "newcomer@agency.com", "invite_token": token},
                )
                self.assertEqual(response.status_code, 200, response.text)
                code = send.call_args.args[1]
                response = await client.post(
                    "/api/auth/verify-temporary-password",
                    json={"email": "newcomer@agency.com", "code": code},
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["redirect_url"], f"/invite/{token}")
                self.assertTrue(client.cookies.get("buyerly_session"))

    async def test_password_login_accepts_only_username_or_email(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://test") as client:
            for identifier, expected in (
                ("buyer_user", 200),
                ("BUYER@buyerly.com", 200),
                ("Buyer User", 401),
                ("987654321", 401),
            ):
                client.cookies.clear()
                response = await client.post(
                    "/api/auth/login",
                    json={"username": identifier, "password": "buyerpassword123"},
                )
                self.assertEqual(response.status_code, expected, identifier)
                if expected == 200:
                    self.assertEqual(response.json()["username"], "buyer_user")

    async def test_password_login_prefers_exact_username_over_email_match(self):
        async with self.sessions() as session:
            session.add(User(
                username="buyer@buyerly.com.alias",
                email="buyer_user",
                password_hash=hash_password("otherpassword123"),
                role="buyer",
                is_approved=True,
            ))
            await session.commit()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://test") as client:
            response = await client.post(
                "/api/auth/login",
                json={"username": "buyer_user", "password": "buyerpassword123"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["username"], "buyer_user")


class TestEmailDelivery(unittest.IsolatedAsyncioTestCase):
    async def test_send_email_strips_key_and_sets_user_agent(self):
        from core.email import send_email
        with patch("core.email.settings") as mock_settings, \
             patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_settings.RESEND_API_KEY = "  \"re_clean_secret_key_123\" \r\n"
            mock_settings.EMAIL_FROM = "Buyerly <team@buyerly.app>"
            mock_post.return_value = SimpleNamespace(status_code=200, text='{"id": "msg_123"}')

            result = await send_email(
                to_email="  user@example.com  ",
                subject="Test Subject",
                html_content="<p>Hello</p>",
                text_content="Hello",
            )
            self.assertTrue(result)
            mock_post.assert_called_once()
            args, kwargs = mock_post.call_args
            headers = kwargs.get("headers", {})
            self.assertEqual(headers.get("Authorization"), "Bearer re_clean_secret_key_123")
            self.assertEqual(headers.get("User-Agent"), "buyerly/1.0")
            self.assertEqual(headers.get("Content-Type"), "application/json")
            payload = kwargs.get("json", {})
            self.assertEqual(payload.get("to"), ["user@example.com"])
            self.assertEqual(payload.get("from"), "Buyerly <team@buyerly.app>")
            self.assertEqual(payload.get("subject"), "Test Subject")
            self.assertEqual(payload.get("html"), "<p>Hello</p>")
            self.assertEqual(payload.get("text"), "Hello")

    async def test_send_email_handles_api_failure(self):
        from core.email import send_email
        with patch("core.email.settings") as mock_settings, \
             patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_settings.RESEND_API_KEY = "re_some_key"
            mock_settings.EMAIL_FROM = "Buyerly <team@buyerly.app>"
            mock_post.return_value = SimpleNamespace(status_code=403, text='{"message": "Forbidden"}')

            result = await send_email(
                to_email="user@example.com",
                subject="Test",
                html_content="<p>Test</p>",
            )
            self.assertFalse(result)

    async def test_send_email_dev_fallback_when_no_key(self):
        from core.email import send_email
        with patch("core.email.settings") as mock_settings:
            mock_settings.RESEND_API_KEY = ""
            mock_settings.EMAIL_FROM = "Buyerly <team@buyerly.app>"

            result = await send_email(
                to_email="user@example.com",
                subject="Test",
                html_content="<p>Test</p>",
            )
            self.assertTrue(result)

    async def test_send_email_rejects_empty_recipient(self):
        from core.email import send_email
        result = await send_email(
            to_email="   ",
            subject="Test",
            html_content="<p>Test</p>",
        )
        self.assertFalse(result)
