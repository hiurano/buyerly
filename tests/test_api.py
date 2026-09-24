import asyncio
import hashlib
import io
import json
import os
import tempfile
import unittest
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from cryptography.fernet import Fernet
from PIL import Image, PngImagePlugin
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.config import settings
from core.meta_tokens import decrypt_meta_token
from core.rate_limit import limiter
from database.db import Base, hash_password, verify_password
from database.models import (
    Account,
    AccountHealth,
    AccountGroup,
    AccountGroupMember,
    ActionUndoState,
    AllowedEmail,
    AppSettings,
    AuditEvent,
    DeletedItem,
    EmailVerificationCode,
    RuleGroup,
    RuleGroupItem,
    RulePreset,
    SummarySnapshot,
    AnalyticsViewPreference,
    MetaConnection,
    StoppedAdSet,
    User,
    WebSession,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)


from tests.test_db_helper import create_test_engine, init_test_db, session_headers


class TestWebApi(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.original_meta_token_key = settings.META_TOKEN_ENCRYPTION_KEY
        settings.META_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode("ascii")
        api_routes_module._summary_cache.clear()
        await limiter.reset()
        self.test_engine = create_test_engine()
        self.test_session_maker = async_sessionmaker(self.test_engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.test_engine)

        # Patch session maker in modules
        api_routes_module.async_session_maker = self.test_session_maker
        api_auth_module.async_session_maker = self.test_session_maker
        api_server_module.async_session_maker = self.test_session_maker

        # These tests cover the email code/link flow on its own; the
        # invite-only default is covered in tests/test_email_whitelist.py.
        self.original_email_login_without_invite = settings.EMAIL_LOGIN_WITHOUT_INVITE
        settings.EMAIL_LOGIN_WITHOUT_INVITE = True
        settings.OTP_PEPPER = "test-otp-pepper"
        settings.ADMIN_CHAT_ID = "8634201356"

        # Populate initial test user & account
        async with self.test_session_maker() as session:
            admin_user = User(
                telegram_id="8634201356",
                username="admin_user",
                full_name="Admin Test",
                password_hash=hash_password("admin-password"),
                role="admin",
                is_approved=True,
            )
            session.add(admin_user)

            buyer_user = User(
                telegram_id="8948797431",
                username="buyer_nick",
                full_name="Buyer Nick",
                role="buyer",
                is_approved=True,
            )
            session.add(buyer_user)
            await session.flush()

            ws_admin = Workspace(
                name="Admin Workspace",
                slug="admin-workspace",
                badge_text="A",
                badge_color="#3B82F6",
                owner_user_id=admin_user.id,
            )
            ws_buyer = Workspace(
                name="Buyer Workspace",
                slug="buyer-workspace",
                badge_text="B",
                badge_color="#10B981",
                owner_user_id=buyer_user.id,
            )
            session.add_all([ws_admin, ws_buyer])
            await session.flush()
            self.ws_buyer_id = ws_buyer.id

            session.add(WorkspaceMember(workspace_id=ws_admin.id, user_id=admin_user.id, role="owner"))
            session.add(WorkspaceMember(workspace_id=ws_buyer.id, user_id=buyer_user.id, role="owner"))
            admin_user.active_workspace_id = ws_admin.id
            buyer_user.active_workspace_id = ws_buyer.id

            acc = Account(
                account_id="act_1018756607700064",
                name="Швеция 1",
                access_token="mock_token",
                owner_user_id=buyer_user.id,
                workspace_id=ws_buyer.id,
                timezone_name="UTC",
                currency="USD",
                rules_enabled=False,
                is_active=True,
            )
            session.add(acc)

            app_set = AppSettings(poll_interval_minutes=15)
            session.add(app_set)

            await session.commit()

        self.app = create_app()

    async def asyncTearDown(self):
        settings.META_TOKEN_ENCRYPTION_KEY = self.original_meta_token_key
        settings.EMAIL_LOGIN_WITHOUT_INVITE = self.original_email_login_without_invite
        await self.test_engine.dispose()

    def test_summary_cache_invalidation_matches_workspace_or_owner(self):
        api_routes_module._summary_cache.update(
            {
                "ws:10:today": (1.0, {}),
                "user:20:today": (1.0, {}),
                "ws:30:today": (1.0, {}),
            }
        )

        api_routes_module.invalidate_summary_cache(
            workspace_id=10,
            owner_user_id=20,
        )

        self.assertNotIn("ws:10:today", api_routes_module._summary_cache)
        self.assertNotIn("user:20:today", api_routes_module._summary_cache)
        self.assertIn("ws:30:today", api_routes_module._summary_cache)

    async def test_health_endpoints(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            live_response = await client.get("/health/live")
            ready_response = await client.get("/health/ready")

        self.assertEqual(live_response.status_code, 200)
        self.assertEqual(live_response.json()["status"], "alive")
        self.assertEqual(ready_response.status_code, 200)
        self.assertEqual(ready_response.json()["status"], "ready")
        self.assertIn("version", ready_response.json())

    async def test_password_login_upgrades_legacy_hash(self):
        legacy_password = "legacy-password"
        async with self.test_session_maker() as session:
            result = await session.execute(
                select(User).where(User.username == "buyer_nick")
            )
            buyer = result.scalar_one()
            buyer.password_hash = hashlib.sha256(legacy_password.encode()).hexdigest()
            await session.commit()

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            missing_password = await client.post(
                "/api/auth/login",
                json={"username": "admin_user", "password": "anything"},
            )
            wrong_password = await client.post(
                "/api/auth/login",
                json={"username": "buyer_nick", "password": "wrong-password"},
            )
            login = await client.post(
                "/api/auth/login",
                json={"username": "buyer_nick", "password": legacy_password},
            )

        self.assertEqual(missing_password.status_code, 401)
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(login.status_code, 200)
        self.assertNotIn("token", login.json())
        self.assertIn("buyerly_session=", login.headers.get("set-cookie", ""))
        self.assertIn("HttpOnly", login.headers.get("set-cookie", ""))

        async with self.test_session_maker() as session:
            result = await session.execute(
                select(User).where(User.username == "buyer_nick")
            )
            upgraded_buyer = result.scalar_one()
            self.assertTrue(upgraded_buyer.password_hash.startswith("pbkdf2_sha256$"))
            self.assertTrue(verify_password(legacy_password, upgraded_buyer.password_hash))

    async def test_browser_sessions_are_hashed_csrf_protected_and_individually_revocable(self):
        password = "browser-session-password"
        async with self.test_session_maker() as session:
            buyer = (
                await session.execute(select(User).where(User.username == "buyer_nick"))
            ).scalar_one()
            buyer.password_hash = hash_password(password)
            await session.commit()

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://test") as client:
            login = await client.post(
                "/api/auth/login",
                headers={"User-Agent": "Buyerly test browser"},
                json={"username": "buyer_nick", "password": password},
            )
            self.assertEqual(login.status_code, 200)
            raw_token = client.cookies.get("buyerly_session")
            csrf_token = client.cookies.get("buyerly_csrf")
            self.assertTrue(raw_token)
            self.assertTrue(csrf_token)

            me = await client.get("/api/me")
            self.assertEqual(me.status_code, 200)

            csrf_blocked = await client.post(
                "/api/auth/change-password",
                json={"old_password": password, "new_password": "changed-password"},
            )
            self.assertEqual(csrf_blocked.status_code, 403)

            sessions_response = await client.get("/api/auth/sessions")
            self.assertEqual(sessions_response.status_code, 200)
            sessions = sessions_response.json()
            self.assertEqual(len(sessions), 1)
            self.assertTrue(sessions[0]["current"])
            self.assertEqual(sessions[0]["user_agent"], "Buyerly test browser")

            revoke = await client.delete(
                f"/api/auth/sessions/{sessions[0]['id']}",
                headers={"X-CSRF-Token": csrf_token},
            )
            self.assertEqual(revoke.status_code, 200)
            self.assertEqual((await client.get("/api/me")).status_code, 401)

        async with self.test_session_maker() as session:
            stored = (await session.execute(select(WebSession))).scalar_one()
            self.assertNotEqual(stored.token_hash, raw_token)
            self.assertIsNotNone(stored.revoked_at)

    async def test_change_password_requires_current_password(self):
        old_password = "old-password"
        new_password = "new-password"
        async with self.test_session_maker() as session:
            result = await session.execute(
                select(User).where(User.username == "buyer_nick")
            )
            buyer = result.scalar_one()
            buyer.password_hash = hashlib.sha256(old_password.encode()).hexdigest()
            buyer.auth_token = "test-web-token"
            await session.commit()

        headers = {"Authorization": "Bearer test-web-token"}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            missing_current = await client.post(
                "/api/auth/change-password",
                headers=headers,
                json={"new_password": new_password},
            )
            wrong_current = await client.post(
                "/api/auth/change-password",
                headers=headers,
                json={"old_password": "wrong-password", "new_password": new_password},
            )
            changed = await client.post(
                "/api/auth/change-password",
                headers=headers,
                json={"old_password": old_password, "new_password": new_password},
            )

        self.assertEqual(missing_current.status_code, 400)
        self.assertEqual(wrong_current.status_code, 400)
        self.assertEqual(changed.status_code, 200)

        async with self.test_session_maker() as session:
            result = await session.execute(
                select(User).where(User.username == "buyer_nick")
            )
            changed_buyer = result.scalar_one()
        self.assertTrue(verify_password(new_password, changed_buyer.password_hash))

    async def test_health_overview_is_workspace_isolated_and_secret_safe(self):
        async with self.test_session_maker() as session:
            buyer = (
                await session.execute(select(User).where(User.username == "buyer_nick"))
            ).scalar_one()
            buyer_account = (
                await session.execute(select(Account).where(Account.workspace_id == self.ws_buyer_id))
            ).scalar_one()
            session.add(
                AccountHealth(
                    workspace_id=self.ws_buyer_id,
                    account_pk=buyer_account.id,
                    status="degraded",
                    cause="meta",
                    signals={"token_healthy": True},
                    consecutive_failures=1,
                    last_error_code="meta_graph_unavailable",
                    last_error_message="Meta Graph unavailable [REDACTED]",
                    last_checked_at=datetime.now(timezone.utc),
                )
            )
            admin_workspace = (
                await session.execute(select(Workspace).where(Workspace.slug == "admin-workspace"))
            ).scalar_one()
            foreign_account = Account(
                account_id="act_foreign_health",
                name="Foreign health",
                owner_user_id=admin_workspace.owner_user_id,
                workspace_id=admin_workspace.id,
            )
            session.add(foreign_account)
            await session.flush()
            session.add(
                AccountHealth(
                    workspace_id=admin_workspace.id,
                    account_pk=foreign_account.id,
                    status="critical",
                    cause="user",
                    signals={},
                    last_error_message="foreign",
                    last_checked_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()

        auth = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**auth}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            overview = await client.get("/api/health/overview", headers=headers)
            foreign = await client.get("/api/accounts/act_foreign_health/health", headers=headers)

        self.assertEqual(overview.status_code, 200)
        payload = overview.json()
        self.assertEqual([item["account_id"] for item in payload["accounts"]], [buyer_account.account_id])
        self.assertNotIn("access_token", str(payload).lower())
        self.assertEqual(foreign.status_code, 404)

    async def test_get_accounts_endpoint(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {**auth}
            resp = await client.get("/api/accounts", headers=headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["account_id"], "act_1018756607700064")
            self.assertEqual(data[0]["name"], "Швеция 1")
            self.assertEqual(data[0]["custom_name"], "")
            self.assertEqual(data[0]["note"], "")
            self.assertEqual(data[0]["group_ids"], [])
            self.assertEqual(data[0]["connection_type"], "system_user")
            self.assertIsNone(data[0]["latest_metrics"])
            self.assertEqual(data[0]["active_rules"], [])

    async def test_account_groups_are_crud_owner_scoped_and_exposed_on_accounts(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            admin = (await session.execute(select(User).where(User.telegram_id == "8634201356"))).scalar_one()
            session.add_all(
                [
                    Account(
                        account_id="act_2000000000000001",
                        name="NL second",
                        access_token="mock_token",
                        owner_user_id=buyer.id,
                        workspace_id=buyer.active_workspace_id,
                        timezone_name="UTC",
                        currency="USD",
                    ),
                    Account(
                        account_id="act_9000000000000001",
                        name="Admin foreign",
                        access_token="mock_token",
                        owner_user_id=admin.id,
                        workspace_id=admin.active_workspace_id,
                        timezone_name="UTC",
                        currency="USD",
                    ),
                ]
            )
            await session.commit()

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        admin_data = await session_headers(self.test_session_maker, {"id": 8634201356, "first_name": "Admin", "username": "admin_user"})
        buyer_headers = {**buyer_data}
        admin_headers = {**admin_data}
        transport = httpx.ASGITransport(app=self.app)

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/account-groups",
                headers=buyer_headers,
                json={
                    "name": "  NL · основной  ",
                    "description": "  Нидерланды, основной оффер  ",
                    "account_ids": ["act_2000000000000001", "act_1018756607700064"],
                },
            )
            self.assertEqual(created.status_code, 201)
            group = created.json()
            self.assertEqual(group["name"], "NL · основной")
            self.assertEqual(group["description"], "Нидерланды, основной оффер")
            self.assertEqual(
                group["account_ids"],
                ["act_2000000000000001", "act_1018756607700064"],
            )
            self.assertEqual(group["accounts_count"], 2)

            duplicate = await client.post(
                "/api/account-groups",
                headers=buyer_headers,
                json={"name": "nl · ОСНОВНОЙ", "account_ids": []},
            )
            self.assertEqual(duplicate.status_code, 409)

            foreign_member = await client.post(
                "/api/account-groups",
                headers=buyer_headers,
                json={"name": "Invalid", "account_ids": ["act_9000000000000001"]},
            )
            self.assertEqual(foreign_member.status_code, 422)

            buyer_groups = await client.get("/api/account-groups", headers=buyer_headers)
            admin_groups = await client.get("/api/account-groups", headers=admin_headers)
            accounts = await client.get("/api/accounts", headers=buyer_headers)
            self.assertEqual(len(buyer_groups.json()), 1)
            self.assertEqual(admin_groups.json(), [])
            grouped_accounts = {
                item["account_id"]: item["group_ids"] for item in accounts.json()
            }
            self.assertEqual(grouped_accounts["act_1018756607700064"], [group["id"]])
            self.assertEqual(grouped_accounts["act_2000000000000001"], [group["id"]])

            forbidden_update = await client.put(
                f"/api/account-groups/{group['id']}",
                headers=admin_headers,
                json={"name": "Hijack", "account_ids": []},
            )
            self.assertEqual(forbidden_update.status_code, 404)

            updated = await client.put(
                f"/api/account-groups/{group['id']}",
                headers=buyer_headers,
                json={
                    "name": "NL · масштабирование",
                    "description": "",
                    "account_ids": ["act_1018756607700064"],
                },
            )
            self.assertEqual(updated.status_code, 200)
            self.assertEqual(updated.json()["accounts_count"], 1)
            self.assertEqual(updated.json()["account_ids"], ["act_1018756607700064"])

            account_deleted = await client.delete(
                "/api/accounts/act_1018756607700064",
                headers=buyer_headers,
            )
            self.assertEqual(account_deleted.status_code, 200)
            group_after_account_delete = await client.get(
                "/api/account-groups",
                headers=buyer_headers,
            )
            self.assertEqual(group_after_account_delete.json()[0]["accounts_count"], 0)
            self.assertEqual(group_after_account_delete.json()[0]["account_ids"], [])

            deleted = await client.delete(
                f"/api/account-groups/{group['id']}",
                headers=buyer_headers,
            )
            self.assertEqual(deleted.status_code, 200)
            self.assertEqual(
                (await client.get("/api/account-groups", headers=buyer_headers)).json(),
                [],
            )

        async with self.test_session_maker() as session:
            self.assertEqual(
                int((await session.execute(select(func.count()).select_from(AccountGroup))).scalar_one()),
                0,
            )
            self.assertEqual(
                int((await session.execute(select(func.count()).select_from(AccountGroupMember))).scalar_one()),
                0,
            )

    async def test_account_group_names_are_atomic_and_unique_per_workspace(self):
        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            primary = await client.post(
                "/api/account-groups",
                headers=headers,
                json={"name": "Shared Name", "account_ids": []},
            )
            self.assertEqual(primary.status_code, 201)

            first_race, second_race = await asyncio.gather(
                client.post(
                    "/api/account-groups",
                    headers=headers,
                    json={"name": "Concurrent", "account_ids": []},
                ),
                client.post(
                    "/api/account-groups",
                    headers=headers,
                    json={"name": "CONCURRENT", "account_ids": []},
                ),
            )
            self.assertEqual(
                sorted((first_race.status_code, second_race.status_code)),
                [201, 409],
            )

            second_workspace = await client.post(
                "/api/workspaces",
                headers=headers,
                json={"name": "Secondary Group Scope"},
            )
            self.assertEqual(second_workspace.status_code, 200)

            same_name_other_workspace = await client.post(
                "/api/account-groups",
                headers=headers,
                json={"name": "Shared Name", "account_ids": []},
            )
            self.assertEqual(same_name_other_workspace.status_code, 201)

            switch_back = await client.post(
                "/api/workspaces/switch",
                headers=headers,
                json={"slug": "buyer-workspace"},
            )
            self.assertEqual(switch_back.status_code, 200)
            duplicate_primary = await client.post(
                "/api/account-groups",
                headers=headers,
                json={"name": "  SHARED NAME  ", "account_ids": []},
            )
            self.assertEqual(duplicate_primary.status_code, 409)

        async with self.test_session_maker() as session:
            shared_rows = (
                await session.execute(
                    select(AccountGroup.workspace_id).where(
                        func.lower(AccountGroup.name) == "shared name"
                    )
                )
            ).scalars().all()
            self.assertEqual(len(shared_rows), 2)
            self.assertEqual(len(set(shared_rows)), 2)

    async def test_account_profile_and_latest_saved_metrics_are_owner_isolated(self):
        async with self.test_session_maker() as session:
            buyer = (
                await session.execute(
                    select(User).where(User.telegram_id == "8948797431")
                )
            ).scalar_one()
            conn_obj = MetaConnection(
                workspace_id=self.ws_buyer_id,
                owner_user_id=buyer.id,
                provider_user_id="provider_nick_1",
                access_token_encrypted="encrypted_token",
                status="active",
            )
            session.add(conn_obj)
            await session.flush()
            account = (
                await session.execute(
                    select(Account).where(Account.account_id == "act_1018756607700064")
                )
            ).scalar_one()
            account.owner_user_id = buyer.id
            account.meta_connection_id = conn_obj.id
            session.add(
                SummarySnapshot(
                    workspace_id=buyer.active_workspace_id,
                    owner_user_id=buyer.id,
                    period="today",
                    payload={
                        "period": "today",
                        "generated_at": "2026-08-18T08:15:00+00:00",
                        "accounts": [
                            {
                                "account_id": account.account_id,
                                "data_status": "synced",
                                "data_status_label": "Metrics received",
                                "spend": 123.45,
                                "impressions": 9000,
                                "clicks": 210,
                                "leads": 17,
                                "registrations": 6,
                                "purchases": 2,
                            }
                        ],
                    },
                )
            )
            account_group = AccountGroup(
                workspace_id=buyer.active_workspace_id,
                owner_user_id=buyer.id,
                name="NL",
                description="Netherlands",
            )
            session.add(account_group)
            await session.flush()
            session.add(AccountGroupMember(group_id=account_group.id, account_id=account.id, position=0))
            admin = (await session.execute(select(User).where(User.telegram_id == "8634201356"))).scalar_one()
            session.add(
                Account(
                    account_id="act_999999999",
                    name="Foreign",
                    owner_user_id=admin.id,
                    workspace_id=admin.active_workspace_id,
                    timezone_name="UTC",
                    currency="USD",
                )
            )
            await session.commit()

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            accounts = await client.get("/api/accounts", headers=headers)
            updated = await client.patch(
                "/api/accounts/act_1018756607700064/profile",
                headers=headers,
                json={"custom_name": "  NL · основной  ", "note": "  Льётся NL, новый оффер  "},
            )
            forbidden = await client.patch(
                "/api/accounts/act_999999999/profile",
                headers=headers,
                json={"custom_name": "Hijack", "note": ""},
            )
            invalid = await client.patch(
                "/api/accounts/act_1018756607700064/profile",
                headers=headers,
                json={"custom_name": "x" * 121, "note": ""},
            )
            summary = await client.get("/api/summary?period=today", headers=headers)

        self.assertEqual(accounts.status_code, 200)
        item = accounts.json()[0]
        self.assertEqual(item["connection_type"], "facebook_login")
        self.assertEqual(item["latest_metrics"]["spend"], 123.45)
        self.assertEqual(item["latest_metrics"]["leads"], 17)
        self.assertEqual(item["latest_metrics"]["registrations"], 6)
        self.assertEqual(item["latest_metrics"]["purchases"], 2)
        self.assertEqual(item["latest_metrics"]["generated_at"], "2026-08-18T08:15:00+00:00")
        self.assertTrue(item["latest_metrics"]["saved_at"])
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["custom_name"], "NL · основной")
        self.assertEqual(updated.json()["note"], "Льётся NL, новый оффер")
        self.assertEqual(summary.status_code, 200)
        summary_account = summary.json()["accounts"][0]
        self.assertEqual(summary_account["custom_name"], "NL · основной")
        self.assertEqual(summary_account["note"], "Льётся NL, новый оффер")
        self.assertEqual(summary_account["group_ids"], [account_group.id])
        self.assertEqual(forbidden.status_code, 404)
        self.assertEqual(invalid.status_code, 422)

    async def test_account_cost_target_is_declared_validated_and_workspace_scoped(self):
        """Statistics may judge a row only against a target stored for that account."""
        async with self.test_session_maker() as session:
            admin = (
                await session.execute(
                    select(User).where(User.telegram_id == "8634201356")
                )
            ).scalar_one()
            session.add(
                Account(
                    account_id="act_888888888",
                    name="Foreign target",
                    owner_user_id=admin.id,
                    workspace_id=admin.active_workspace_id,
                    timezone_name="UTC",
                    currency="USD",
                )
            )
            await session.commit()

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        target_url = "/api/accounts/act_1018756607700064/cost-target"
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            undeclared = await client.get("/api/accounts", headers=headers)
            saved = await client.patch(
                target_url,
                headers=headers,
                json={"primary_result": "leads", "target_cost_per_result": 42.5},
            )
            declared = await client.get("/api/accounts", headers=headers)
            # A cost target without the event it applies to cannot be interpreted.
            orphan_target = await client.patch(
                target_url,
                headers=headers,
                json={"primary_result": "", "target_cost_per_result": 42.5},
            )
            not_positive = await client.patch(
                target_url,
                headers=headers,
                json={"primary_result": "leads", "target_cost_per_result": 0},
            )
            unknown_result = await client.patch(
                target_url,
                headers=headers,
                json={"primary_result": "clicks", "target_cost_per_result": 10},
            )
            cleared = await client.patch(
                target_url,
                headers=headers,
                json={"primary_result": "", "target_cost_per_result": None},
            )
            after_clear = await client.get("/api/accounts", headers=headers)
            foreign = await client.patch(
                "/api/accounts/act_888888888/cost-target",
                headers=headers,
                json={"primary_result": "purchases", "target_cost_per_result": 10},
            )

        def row(response):
            return next(
                item
                for item in response.json()
                if item["account_id"] == "act_1018756607700064"
            )

        # An account that declared nothing reports no target, never a zero.
        self.assertEqual(undeclared.status_code, 200)
        self.assertEqual(row(undeclared)["primary_result"], "")
        self.assertIsNone(row(undeclared)["target_cost_per_result"])

        self.assertEqual(saved.status_code, 200)
        self.assertEqual(row(declared)["primary_result"], "leads")
        self.assertEqual(row(declared)["target_cost_per_result"], 42.5)

        self.assertEqual(orphan_target.status_code, 422)
        self.assertEqual(not_positive.status_code, 422)
        self.assertEqual(unknown_result.status_code, 422)

        # Clearing the declared result clears the target with it.
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(row(after_clear)["primary_result"], "")
        self.assertIsNone(row(after_clear)["target_cost_per_result"])

        # Another workspace's account is not found, not merely refused.
        self.assertEqual(foreign.status_code, 404)

    async def test_delivery_invalidates_app_postgresql_inventory_cache(self):
        from services.inventory_cache import PostgreSQLInventoryCache

        meta = self.app.state.meta_client
        provider = meta._cache_provider
        self.assertIsInstance(provider, PostgreSQLInventoryCache)
        account_id = "act_1018756607700064"
        rows = [{"id": "adset_cached", "status": "ACTIVE"}]
        await provider.set_inventory(account_id, rows)
        # A separate provider sees the same persisted inventory.
        reader = PostgreSQLInventoryCache(session_factory=self.test_session_maker)
        self.assertEqual(await reader.get_inventory(account_id), rows)
        headers = await session_headers(self.test_session_maker, {"id": 8948797431})
        state = {"account_id": account_id, "entity_name": "Campaign", "status": "ACTIVE"}
        with patch.object(meta, "get_entity_state", AsyncMock(return_value=state)), patch.object(
            meta, "_request_with_retry", AsyncMock(return_value=httpx.Response(200, json={"success": True})),
        ), patch.object(provider, "invalidate", wraps=provider.invalidate) as invalidate:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as client:
                response = await client.post(
                    "/api/entities/campaign/cmp_cached/delivery",
                    headers=headers,
                    json={"account_id": account_id, "status": "PAUSED"},
                )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["changed"])
        invalidate.assert_awaited_once_with(account_id)
        self.assertIsNone(await reader.get_inventory(account_id))

    async def test_manual_delivery_and_budget_actions_are_audited_and_scoped(self):
        """The first writes into Meta: authorized, verified, recorded, reversible."""
        async with self.test_session_maker() as session:
            admin = (
                await session.execute(
                    select(User).where(User.telegram_id == "8634201356")
                )
            ).scalar_one()
            session.add(
                Account(
                    account_id="act_777777777",
                    name="Foreign delivery",
                    owner_user_id=admin.id,
                    workspace_id=admin.active_workspace_id,
                    timezone_name="UTC",
                    currency="USD",
                )
            )
            await session.commit()

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        account_id = "act_1018756607700064"
        delivery_url = "/api/entities/campaign/cmp_live_1/delivery"
        budget_url = "/api/entities/campaign/cmp_live_1/budget"

        def state(status="ACTIVE", daily_budget=100.0):
            return {
                "entity_id": "cmp_live_1",
                "account_id": account_id,
                "entity_name": "Live campaign",
                "status": status,
                "effective_status": status,
                "daily_budget": daily_budget,
                "currency": "USD",
            }

        transport = httpx.ASGITransport(app=self.app)
        client_args = dict(transport=transport, base_url="http://test")

        # A successful pause, and the same call again once Meta reports PAUSED.
        with patch.object(
            self.app.state.meta_client, "get_entity_state",
            new=AsyncMock(side_effect=[state(), state("PAUSED")]),
        ), patch.object(
            self.app.state.meta_client, "set_entity_status",
            new=AsyncMock(return_value=True),
        ) as status_write:
            async with httpx.AsyncClient(**client_args) as client:
                paused = await client.post(
                    delivery_url, headers=headers,
                    json={"account_id": account_id, "status": "PAUSED"},
                )
                repeated = await client.post(
                    delivery_url, headers=headers,
                    json={"account_id": account_id, "status": "PAUSED"},
                )

        self.assertEqual(paused.status_code, 200)
        self.assertTrue(paused.json()["changed"])
        self.assertIsNotNone(paused.json()["audit_event_id"])
        # An entity already in the requested state is never written twice.
        self.assertEqual(repeated.status_code, 200)
        self.assertFalse(repeated.json()["changed"])
        self.assertIsNone(repeated.json()["audit_event_id"])
        self.assertEqual(status_write.await_count, 1)

        # Meta refusing the write is a recoverable failure that is still recorded.
        with patch.object(
            self.app.state.meta_client, "get_entity_state",
            new=AsyncMock(return_value=state()),
        ), patch.object(
            self.app.state.meta_client, "set_entity_status",
            new=AsyncMock(side_effect=RuntimeError("Meta API Error (400): nope")),
        ):
            async with httpx.AsyncClient(**client_args) as client:
                failed = await client.post(
                    delivery_url, headers=headers,
                    json={"account_id": account_id, "status": "PAUSED"},
                )
        self.assertEqual(failed.status_code, 502)

        async with self.test_session_maker() as session:
            events = (
                await session.execute(
                    select(AuditEvent).where(AuditEvent.entity_id == "cmp_live_1")
                )
            ).scalars().all()
        by_status = {event.status: event for event in events}
        # Exactly two rows: the change and the refusal. The no-op wrote nothing.
        self.assertEqual(len(events), 2)
        self.assertEqual(by_status["SUCCESS"].event_type, "MANUAL_PAUSE")
        self.assertEqual(by_status["SUCCESS"].entity_level, "campaign")
        self.assertEqual(by_status["SUCCESS"].category, "MANUAL_ACTION")
        self.assertEqual(by_status["ERROR"].event_type, "MANUAL_PAUSE")

        # An authorized account must not authorize a different account's entity.
        with patch.object(
            self.app.state.meta_client, "get_entity_state",
            new=AsyncMock(return_value={**state(), "account_id": "777777777"}),
        ), patch.object(
            self.app.state.meta_client, "set_entity_status", new=AsyncMock(),
        ) as foreign_write:
            async with httpx.AsyncClient(**client_args) as client:
                wrong_entity = await client.post(
                    delivery_url, headers=headers,
                    json={"account_id": account_id, "status": "PAUSED"},
                )
        self.assertEqual(wrong_entity.status_code, 404)
        foreign_write.assert_not_awaited()

        # If the durable intent cannot be saved, no mutation may reach Meta.
        with patch.object(
            self.app.state.meta_client, "get_entity_state", new=AsyncMock(return_value=state()),
        ), patch("api.routers.delivery._commit_quietly", new=AsyncMock(return_value=False)), patch.object(
            self.app.state.meta_client, "set_entity_status", new=AsyncMock(),
        ) as unaudited_write:
            async with httpx.AsyncClient(**client_args) as client:
                unavailable = await client.post(
                    delivery_url, headers=headers,
                    json={"account_id": account_id, "status": "PAUSED"},
                )
        self.assertEqual(unavailable.status_code, 503)
        unaudited_write.assert_not_awaited()

        # Budget: only where a budget already exists, and never on an ad.
        with patch.object(
            self.app.state.meta_client, "get_entity_state",
            new=AsyncMock(side_effect=[state(daily_budget=100.0), state(daily_budget=0.0)]),
        ), patch.object(
            self.app.state.meta_client, "update_entity_budget",
            new=AsyncMock(return_value=True),
        ):
            async with httpx.AsyncClient(**client_args) as client:
                raised = await client.patch(
                    budget_url, headers=headers,
                    json={"account_id": account_id, "daily_budget": 150.0},
                )
                without_budget = await client.patch(
                    budget_url, headers=headers,
                    json={"account_id": account_id, "daily_budget": 150.0},
                )

        self.assertEqual(raised.status_code, 200)
        self.assertEqual(raised.json()["previous_daily_budget"], 100.0)
        # A budget is moved, never created: that would change how Meta optimizes.
        self.assertEqual(without_budget.status_code, 409)

        async with httpx.AsyncClient(**client_args) as client:
            ad_budget = await client.patch(
                "/api/entities/ad/ad_live_1/budget", headers=headers,
                json={"account_id": account_id, "daily_budget": 150.0},
            )
            below_floor = await client.patch(
                budget_url, headers=headers,
                json={"account_id": account_id, "daily_budget": 0.5},
            )
            foreign = await client.post(
                "/api/entities/campaign/cmp_live_1/delivery", headers=headers,
                json={"account_id": "act_777777777", "status": "PAUSED"},
            )
        self.assertEqual(ad_budget.status_code, 400)
        self.assertEqual(below_floor.status_code, 422)
        # Another workspace's ad account is not found, not merely refused.
        self.assertEqual(foreign.status_code, 404)

        # The campaign budget audit can be reversed through the existing API.
        with patch.object(
            self.app.state.meta_client, "get_entity_state",
            new=AsyncMock(return_value=state(daily_budget=150.0)),
        ), patch.object(
            self.app.state.meta_client, "update_entity_budget", new=AsyncMock(return_value=True),
        ) as undo_budget:
            async with httpx.AsyncClient(**client_args) as client:
                undone = await client.post(
                    f"/api/audit-events/{raised.json()['audit_event_id']}/undo", headers=headers,
                )
        self.assertEqual(undone.status_code, 200)
        undo_budget.assert_awaited_once_with(
            "cmp_live_1", "mock_token", 100.0, currency="USD",
            entity_level="campaign", account_id=account_id,
        )

        # The Viewer role is read-only, and is stopped before Meta is touched.
        async with self.test_session_maker() as session:
            member = (
                await session.execute(
                    select(WorkspaceMember).where(
                        WorkspaceMember.workspace_id == self.ws_buyer_id
                    )
                )
            ).scalars().first()
            member.role = "viewer"
            await session.commit()
        with patch.object(
            self.app.state.meta_client, "get_entity_state",
            new=AsyncMock(side_effect=AssertionError("Meta must not be read for a viewer")),
        ):
            async with httpx.AsyncClient(**client_args) as client:
                viewer = await client.post(
                    delivery_url, headers=headers,
                    json={"account_id": account_id, "status": "PAUSED"},
                )
        self.assertEqual(viewer.status_code, 403)

    async def test_toggle_rules_and_presets(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {**auth}

            invalid_interval = await client.post(
                "/api/presets",
                headers=headers,
                json={
                    "name": "Invalid interval",
                    "conditions": [],
                    "check_interval_minutes": 0,
                },
            )
            self.assertEqual(invalid_interval.status_code, 422)

            removed_cpa = await client.post(
                "/api/presets",
                headers=headers,
                json={
                    "name": "Unsafe combined CPA",
                    "conditions": [
                        {"metric": "cpa", "operator": "gte", "value": 10.0}
                    ],
                },
            )
            self.assertEqual(removed_cpa.status_code, 422)

            base_condition = [
                {"metric": "spend", "operator": "gte", "value": 10.0, "time_window": "today"}
            ]
            invalid_payloads = [
                {"name": "Unknown action", "action": "delete_account", "conditions": base_condition},
                {"name": "Unknown logic", "condition_logic": "xor", "conditions": base_condition},
                {
                    "name": "Unknown window",
                    "conditions": [{**base_condition[0], "time_window": "lifetime"}],
                },
                {
                    "name": "Unsafe percent",
                    "action": "increase_budget",
                    "conditions": base_condition,
                    "budget_change_percent": 500,
                    "budget_max_daily": 100,
                },
                {
                    "name": "Missing ceiling",
                    "action": "increase_budget",
                    "conditions": base_condition,
                    "budget_change_percent": 20,
                    "budget_max_daily": 0,
                },
                {"name": "Negative threshold", "conditions": [{**base_condition[0], "value": -1}]},
                {
                    "name": "Impossible range",
                    "conditions": [
                        {"metric": "spend", "operator": "gte", "value": 10, "time_window": "today"},
                        {"metric": "spend", "operator": "lt", "value": 5, "time_window": "today"},
                    ],
                },
                {
                    "name": "Non-integer count metric",
                    "action": "turn_off",
                    "conditions": [
                        {"metric": "registrations", "operator": "gte", "value": 1.5, "time_window": "today"}
                    ],
                },
            ]
            for invalid_payload in invalid_payloads:
                invalid_response = await client.post(
                    "/api/presets",
                    headers=headers,
                    json=invalid_payload,
                )
                self.assertEqual(invalid_response.status_code, 422, invalid_payload["name"])

            # An account cannot be enabled before at least one rule is attached.
            t_resp = await client.post("/api/accounts/act_1018756607700064/toggle-rules", headers=headers)
            self.assertEqual(t_resp.status_code, 400)

            # Create Preset with OR logic, new metric, and budget scaling
            preset_payload = {
                "name": "Тестовый пресет",
                "action": "increase_budget",
                "condition_logic": "or",
                "budget_change_percent": 25.0,
                "budget_max_daily": 200.0,
                "conditions": [
                    {"metric": "leads", "operator": "gte", "value": 5.0, "time_window": "today"},
                    {"metric": "cpl", "operator": "lt", "value": 3.0, "time_window": "yesterday"}
                ]
            }
            p_resp = await client.post("/api/presets", headers=headers, json=preset_payload)
            self.assertEqual(p_resp.status_code, 200)
            p_data = p_resp.json()
            self.assertEqual(p_data["condition_logic"], "or")
            self.assertEqual(p_data["budget_change_percent"], 25.0)
            self.assertEqual(len(p_data["conditions"]), 2)

            # Assign Preset to Account
            apply_payload = {
                "preset_id": p_data["id"]
            }
            a_resp = await client.post("/api/accounts/act_1018756607700064/assign-rule", headers=headers, json=apply_payload)
            self.assertEqual(a_resp.status_code, 200)
            a_data = a_resp.json()
            self.assertTrue(a_data["rules_enabled"])
            self.assertEqual(len(a_data["active_rules"]), 1)
            assigned_rule = a_data["active_rules"][0]
            self.assertEqual(assigned_rule["action"], "increase_budget")
            self.assertEqual(assigned_rule["logic"], "or")
            self.assertEqual(assigned_rule["budget_change_percent"], 25.0)

            # Updating a preset immediately updates its runtime snapshot.
            updated_payload = {
                **preset_payload,
                "name": "Тестовый пресет v2",
                "action": "turn_off",
                "condition_logic": "and",
                "budget_change_percent": 0.0,
                "budget_max_daily": 0.0,
            }
            u_resp = await client.put(
                f"/api/presets/{p_data['id']}", headers=headers, json=updated_payload
            )
            self.assertEqual(u_resp.status_code, 200)

            async with self.test_session_maker() as session:
                stored_preset = await session.get(RulePreset, p_data["id"])
                self.assertIsInstance(stored_preset.conditions, list)

            accounts_resp = await client.get("/api/accounts", headers=headers)
            runtime_rule = accounts_resp.json()[0]["active_rules"][0]
            self.assertEqual(runtime_rule["name"], "Тестовый пресет v2")
            self.assertEqual(runtime_rule["action"], "turn_off")
            self.assertEqual(runtime_rule["logic"], "and")

            # Detaching is targeted and disables the account when no rules remain.
            d_resp = await client.post(
                f"/api/accounts/act_1018756607700064/detach-rule/{p_data['id']}",
                headers=headers,
            )
            self.assertEqual(d_resp.status_code, 200)
            self.assertEqual(d_resp.json()["active_rules"], [])
            self.assertFalse(d_resp.json()["rules_enabled"])

            delete_response = await client.delete(
                f"/api/presets/{p_data['id']}",
                headers=headers,
            )
            self.assertEqual(delete_response.status_code, 200)

        async with self.test_session_maker() as session:
            delete_audit = (
                await session.execute(
                    select(AuditEvent).where(
                        AuditEvent.event_type == "DELETE_RULE_PRESET",
                        AuditEvent.rule_id == p_data["id"],
                    )
                )
            ).scalar_one()
        self.assertEqual(delete_audit.workspace_id, self.ws_buyer_id)
        self.assertEqual(delete_audit.action, "DELETE")

    async def test_disabled_preset_stops_running_and_reports_its_attachments(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)
        headers = {**auth}
        account_id = "act_1018756607700064"

        payload = {
            "name": "Стоп дорогого лида",
            "action": "turn_off",
            "conditions": [
                {"metric": "cpl", "operator": "gte", "value": 12.0, "time_window": "today"}
            ],
        }

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post("/api/presets", headers=headers, json=payload)
            self.assertEqual(created.status_code, 200)
            preset = created.json()
            preset_id = preset["id"]

            # A new rule is on, has never fired, and is attached to nothing.
            self.assertTrue(preset["enabled"])
            self.assertFalse(preset["needs_review"])
            self.assertEqual(preset["last_run_at"], "")
            self.assertEqual(preset["attached_account_ids"], [])

            attached = await client.post(
                f"/api/accounts/{account_id}/assign-rule",
                headers=headers,
                json={"preset_id": preset_id},
            )
            self.assertEqual(attached.status_code, 200)

            listed = await client.get("/api/presets", headers=headers)
            listed_preset = next(
                item for item in listed.json() if item["id"] == preset_id
            )
            self.assertEqual(listed_preset["attached_account_ids"], [account_id])

            # Switching the rule off rewrites every account snapshot holding it,
            # which is what actually keeps the worker from running it.
            disabled = await client.put(
                f"/api/presets/{preset_id}",
                headers=headers,
                json={**payload, "enabled": False},
            )
            self.assertEqual(disabled.status_code, 200)
            self.assertFalse(disabled.json()["enabled"])

            accounts = await client.get("/api/accounts", headers=headers)
            account = next(
                item
                for item in accounts.json()
                if item["account_id"] == account_id
            )
            runtime_rule = next(
                rule
                for rule in account["active_rules"]
                if rule["preset_id"] == preset_id
            )
            self.assertFalse(runtime_rule["enabled"])

            # Switching it back on restores execution.
            reenabled = await client.put(
                f"/api/presets/{preset_id}",
                headers=headers,
                json={**payload, "enabled": True},
            )
            self.assertEqual(reenabled.status_code, 200)
            self.assertTrue(reenabled.json()["enabled"])

    async def test_rule_group_icon_round_trips(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)
        headers = {**auth}

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/rule-groups",
                headers=headers,
                json={"name": "Safety", "icon": "shield", "preset_ids": []},
            )
            self.assertEqual(created.status_code, 200)
            self.assertEqual(created.json()["icon"], "shield")
            group_id = created.json()["id"]

            # Groups created without an icon fall back to the neutral marker.
            default_icon = await client.post(
                "/api/rule-groups",
                headers=headers,
                json={"name": "Unmarked", "preset_ids": []},
            )
            self.assertEqual(default_icon.json()["icon"], "custom")

            updated = await client.put(
                f"/api/rule-groups/{group_id}",
                headers=headers,
                json={"name": "Scaling", "icon": "rocket", "preset_ids": []},
            )
            self.assertEqual(updated.json()["icon"], "rocket")

            rejected = await client.post(
                "/api/rule-groups",
                headers=headers,
                json={"name": "Bad icon", "icon": "skull", "preset_ids": []},
            )
            self.assertEqual(rejected.status_code, 422)

            listed = await client.get("/api/rule-groups", headers=headers)
            stored = next(
                item for item in listed.json() if item["id"] == group_id
            )
            self.assertEqual(stored["icon"], "rocket")

    async def test_rule_scope_is_attached_re_aimed_and_survives_preset_edits(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)
        headers = {**auth}
        account_id = "act_1018756607700064"

        payload = {
            "name": "Стоп по кампании",
            "action": "turn_off",
            "conditions": [
                {"metric": "cpl", "operator": "gte", "value": 12.0, "time_window": "today"}
            ],
        }

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            preset_id = (
                await client.post("/api/presets", headers=headers, json=payload)
            ).json()["id"]

            attached = await client.post(
                f"/api/accounts/{account_id}/assign-rule",
                headers=headers,
                json={
                    "preset_id": preset_id,
                    "scope": {"level": "campaign", "ids": ["camp_a"]},
                },
            )
            self.assertEqual(attached.status_code, 200)
            snapshot = next(
                rule
                for rule in attached.json()["active_rules"]
                if rule["preset_id"] == preset_id
            )
            self.assertEqual(snapshot["scope"], {"level": "campaign", "ids": ["camp_a"]})

            rescoped = await client.put(
                f"/api/accounts/{account_id}/rules/{preset_id}/scope",
                headers=headers,
                json={"level": "campaign", "ids": ["camp_a", "camp_b"]},
            )
            self.assertEqual(rescoped.status_code, 200)
            self.assertEqual(
                next(
                    rule
                    for rule in rescoped.json()["active_rules"]
                    if rule["preset_id"] == preset_id
                )["scope"],
                {"level": "campaign", "ids": ["camp_a", "camp_b"]},
            )

            # Scope belongs to the attachment: editing the rule must not widen it
            # back to the whole ad account.
            edited = await client.put(
                f"/api/presets/{preset_id}",
                headers=headers,
                json={**payload, "name": "Стоп по кампании v2"},
            )
            self.assertEqual(edited.status_code, 200)

            accounts = await client.get("/api/accounts", headers=headers)
            stored = next(
                rule
                for rule in next(
                    item
                    for item in accounts.json()
                    if item["account_id"] == account_id
                )["active_rules"]
                if rule["preset_id"] == preset_id
            )
            self.assertEqual(stored["name"], "Стоп по кампании v2")
            self.assertEqual(stored["scope"], {"level": "campaign", "ids": ["camp_a", "camp_b"]})

            # The rules list reports the scope per attached account, so a client
            # can say what detaching would remove before it happens.
            listed = await client.get("/api/presets", headers=headers)
            listed_preset = next(
                item for item in listed.json() if item["id"] == preset_id
            )
            self.assertEqual(
                listed_preset["attached_scopes"],
                {account_id: {"level": "campaign", "ids": ["camp_a", "camp_b"]}},
            )
            self.assertEqual(listed_preset["attached_account_ids"], [account_id])

            for invalid in (
                {"level": "galaxy", "ids": ["camp_a"]},
                {"level": "campaign", "ids": []},
            ):
                rejected = await client.put(
                    f"/api/accounts/{account_id}/rules/{preset_id}/scope",
                    headers=headers,
                    json=invalid,
                )
                self.assertEqual(rejected.status_code, 422, invalid)

            missing = await client.put(
                f"/api/accounts/{account_id}/rules/{preset_id + 9999}/scope",
                headers=headers,
                json={"level": "account", "ids": []},
            )
            self.assertEqual(missing.status_code, 404)

    async def test_account_rejects_rules_with_opposite_actions_and_same_trigger(self):
        auth = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**auth}
        condition = [
            {"metric": "spend", "operator": "gte", "value": 10, "time_window": "today"}
        ]

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            stop = await client.post(
                "/api/presets",
                headers=headers,
                json={"name": "Выключить", "action": "turn_off", "conditions": condition},
            )
            start = await client.post(
                "/api/presets",
                headers=headers,
                json={"name": "Включить", "action": "turn_on", "conditions": condition},
            )
            self.assertEqual(stop.status_code, 200)
            self.assertEqual(start.status_code, 200)

            first_assignment = await client.post(
                "/api/accounts/act_1018756607700064/assign-rule",
                headers=headers,
                json={"preset_id": stop.json()["id"]},
            )
            conflict = await client.post(
                "/api/accounts/act_1018756607700064/assign-rule",
                headers=headers,
                json={"preset_id": start.json()["id"]},
            )

        self.assertEqual(first_assignment.status_code, 200)
        self.assertEqual(conflict.status_code, 409)
        self.assertIn("contradict", conflict.json()["detail"])

        async with self.test_session_maker() as session:
            account = (
                await session.execute(
                    select(Account).where(Account.account_id == "act_1018756607700064")
                )
            ).scalar_one()
        self.assertEqual(len(json.loads(account.active_rules)), 1)

    async def test_rule_groups_are_isolated_editable_and_assigned_atomically(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            admin = (await session.execute(select(User).where(User.telegram_id == "8634201356"))).scalar_one()
            buyer_presets = [
                RulePreset(
                    owner_user_id=buyer.id,
                    workspace_id=buyer.active_workspace_id,
                    name="Stop no leads",
                    action="turn_off",
                    conditions=[{"metric": "spend", "operator": "gte", "value": 10}],
                ),
                RulePreset(
                    owner_user_id=buyer.id,
                    workspace_id=buyer.active_workspace_id,
                    name="Notify high CPL",
                    action="notify_only",
                    conditions=[{"metric": "cpl", "operator": "gte", "value": 7}],
                ),
            ]
            foreign_preset = RulePreset(
                owner_user_id=admin.id,
                workspace_id=admin.active_workspace_id,
                name="Admin private rule",
                action="turn_off",
                conditions=[],
            )
            session.add_all([*buyer_presets, foreign_preset])
            await session.commit()
            for preset in [*buyer_presets, foreign_preset]:
                await session.refresh(preset)
            buyer_ids = [preset.id for preset in buyer_presets]
            foreign_id = foreign_preset.id

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        admin_data = await session_headers(self.test_session_maker, {"id": 8634201356, "first_name": "Admin", "username": "admin_user"})
        buyer_headers = {**buyer_data}
        admin_headers = {**admin_data}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            foreign_response = await client.post(
                "/api/rule-groups",
                headers=buyer_headers,
                json={"name": "Invalid", "preset_ids": [foreign_id]},
            )
            created = await client.post(
                "/api/rule-groups",
                headers=buyer_headers,
                json={
                    "name": "  Launch safety  ",
                    "description": "Start-of-day protection",
                    "preset_ids": [buyer_ids[0], buyer_ids[1], buyer_ids[0]],
                },
            )

            self.assertEqual(foreign_response.status_code, 400)
            self.assertEqual(created.status_code, 200)
            group = created.json()
            self.assertEqual(group["name"], "Launch safety")
            self.assertEqual(group["preset_ids"], buyer_ids)
            self.assertEqual([rule["name"] for rule in group["rules"]], ["Stop no leads", "Notify high CPL"])

            empty_created = await client.post(
                "/api/rule-groups",
                headers=buyer_headers,
                json={"name": "Empty Stage", "preset_ids": []},
            )
            self.assertEqual(empty_created.status_code, 200)
            self.assertEqual(empty_created.json()["name"], "Empty Stage")
            self.assertEqual(empty_created.json()["preset_ids"], [])
            self.assertEqual(empty_created.json()["rules"], [])

            group_id = group["id"]
            buyer_list = await client.get("/api/rule-groups", headers=buyer_headers)
            admin_list = await client.get("/api/rule-groups", headers=admin_headers)
            forbidden_update = await client.put(
                f"/api/rule-groups/{group_id}",
                headers=admin_headers,
                json={"name": "Hijack", "preset_ids": [foreign_id]},
            )
            self.assertIn(group_id, [item["id"] for item in buyer_list.json()])
            self.assertEqual(
                len([item for item in admin_list.json() if item["name"].startswith("Example ·")]),
                2,
            )
            self.assertEqual(forbidden_update.status_code, 404)

            single_assign = await client.post(
                "/api/accounts/act_1018756607700064/assign-rule",
                headers=buyer_headers,
                json={"preset_id": buyer_ids[0]},
            )
            grouped_assign = await client.post(
                f"/api/accounts/act_1018756607700064/assign-rule-group/{group_id}",
                headers=buyer_headers,
            )
            repeated_assign = await client.post(
                f"/api/accounts/act_1018756607700064/assign-rule-group/{group_id}",
                headers=buyer_headers,
            )
            self.assertEqual(single_assign.status_code, 200)
            self.assertEqual(grouped_assign.status_code, 200)
            self.assertEqual(grouped_assign.json()["added_count"], 1)
            self.assertEqual(grouped_assign.json()["skipped_count"], 1)
            self.assertEqual(len(grouped_assign.json()["active_rules"]), 2)
            self.assertEqual(repeated_assign.json()["added_count"], 0)
            self.assertEqual(repeated_assign.json()["skipped_count"], 2)

            updated = await client.put(
                f"/api/rule-groups/{group_id}",
                headers=buyer_headers,
                json={"name": "Launch bundle", "description": "Updated", "preset_ids": list(reversed(buyer_ids))},
            )
            self.assertEqual(updated.status_code, 200)
            self.assertEqual(updated.json()["preset_ids"], list(reversed(buyer_ids)))

            deleted = await client.delete(f"/api/rule-groups/{group_id}", headers=buyer_headers)
            accounts = await client.get("/api/accounts", headers=buyer_headers)
            self.assertEqual(deleted.status_code, 200)
            self.assertEqual(len(accounts.json()[0]["active_rules"]), 2)

        async with self.test_session_maker() as session:
            self.assertIsNone(await session.get(RuleGroup, group_id))
            group_items = (
                await session.execute(select(RuleGroupItem).where(RuleGroupItem.group_id == group_id))
            ).scalars().all()
            self.assertEqual(group_items, [])

    async def test_deleted_rules_and_groups_are_restorable_for_thirty_days(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            presets = [
                RulePreset(
                    owner_user_id=buyer.id,
                    workspace_id=buyer.active_workspace_id,
                    name="Stop no leads",
                    action="turn_off",
                    conditions=[{"metric": "spend", "operator": "gte", "value": 10}],
                ),
                RulePreset(
                    owner_user_id=buyer.id,
                    workspace_id=buyer.active_workspace_id,
                    name="Notify high CPL",
                    action="notify_only",
                    conditions=[{"metric": "cpl", "operator": "gte", "value": 7}],
                ),
            ]
            session.add_all(presets)
            await session.commit()
            for preset in presets:
                await session.refresh(preset)
            stop_id, notify_id = presets[0].id, presets[1].id
            buyer_workspace_id = buyer.active_workspace_id

        buyer_headers = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        admin_headers = await session_headers(self.test_session_maker, {"id": 8634201356, "first_name": "Admin", "username": "admin_user"})
        scope = {"level": "campaign", "ids": ["120200000000001"]}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            group = (await client.post(
                "/api/rule-groups",
                headers=buyer_headers,
                json={"name": "Launch safety", "preset_ids": [stop_id, notify_id]},
            )).json()
            attached = await client.post(
                "/api/accounts/act_1018756607700064/assign-rule",
                headers=buyer_headers,
                json={"preset_id": stop_id, "scope": scope},
            )
            self.assertEqual(attached.status_code, 200)

            deleted_rule = await client.delete(f"/api/presets/{stop_id}", headers=buyer_headers)
            deleted_group = await client.delete(f"/api/rule-groups/{group['id']}", headers=buyer_headers)
            self.assertEqual(deleted_rule.status_code, 200)
            self.assertEqual(deleted_group.status_code, 200)
            rule_item_id = deleted_rule.json()["deleted_item_id"]
            group_item_id = deleted_group.json()["deleted_item_id"]

            # Deletion still takes the rule off the account.
            account = (await client.get("/api/accounts", headers=buyer_headers)).json()[0]
            self.assertEqual(account["active_rules"], [])
            self.assertFalse(account["rules_enabled"])

            listed = (await client.get("/api/deleted-items", headers=buyer_headers)).json()
            self.assertEqual(
                [(item["kind"], item["name"]) for item in listed],
                [("rule_group", "Launch safety"), ("rule", "Stop no leads")],
            )
            self.assertTrue(all(item["purge_at"] > item["deleted_at"] for item in listed))

            # Another workspace neither sees nor restores it.
            admin_listed = (await client.get("/api/deleted-items", headers=admin_headers)).json()
            self.assertNotIn(rule_item_id, [item["id"] for item in admin_listed])
            foreign_restore = await client.post(
                f"/api/deleted-items/{rule_item_id}/restore", headers=admin_headers
            )
            self.assertEqual(foreign_restore.status_code, 404)

            # The rule left the group when it was deleted, so the group comes
            # back with the rules it held at its own deletion.
            restored_group = await client.post(
                f"/api/deleted-items/{group_item_id}/restore", headers=buyer_headers
            )
            self.assertEqual(restored_group.status_code, 200)
            self.assertEqual(restored_group.json()["entity_id"], group["id"])
            self.assertEqual(restored_group.json()["missing_rule_ids"], [])
            groups = (await client.get("/api/rule-groups", headers=buyer_headers)).json()
            self.assertEqual(
                next(item for item in groups if item["id"] == group["id"])["preset_ids"],
                [notify_id],
            )

            # The rule comes back under its id, into that group and onto the
            # account with the scope it had there.
            restored_rule = await client.post(
                f"/api/deleted-items/{rule_item_id}/restore", headers=buyer_headers
            )
            self.assertEqual(restored_rule.status_code, 200)
            self.assertEqual(restored_rule.json()["entity_id"], stop_id)
            self.assertEqual(restored_rule.json()["skipped_account_ids"], [])

            groups = (await client.get("/api/rule-groups", headers=buyer_headers)).json()
            restored = next(item for item in groups if item["id"] == group["id"])
            self.assertEqual(sorted(restored["preset_ids"]), sorted([stop_id, notify_id]))
            account = (await client.get("/api/accounts", headers=buyer_headers)).json()[0]
            self.assertEqual([rule["preset_id"] for rule in account["active_rules"]], [stop_id])
            self.assertEqual(account["active_rules"][0]["scope"], scope)
            self.assertTrue(account["rules_enabled"])

            self.assertEqual((await client.get("/api/deleted-items", headers=buyer_headers)).json(), [])
            repeated = await client.post(
                f"/api/deleted-items/{rule_item_id}/restore", headers=buyer_headers
            )
            self.assertEqual(repeated.status_code, 404)

        # Past thirty days an item is gone for good.
        async with self.test_session_maker() as session:
            expired = DeletedItem(
                workspace_id=buyer_workspace_id,
                kind="rule",
                entity_id=987654,
                name="Old rule",
                snapshot={},
                deleted_at=datetime.now(timezone.utc) - timedelta(days=31),
            )
            session.add(expired)
            await session.commit()
            await session.refresh(expired)
            expired_id = expired.id
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            listed = (await client.get("/api/deleted-items", headers=buyer_headers)).json()
            self.assertEqual(listed, [])
            gone = await client.post(f"/api/deleted-items/{expired_id}/restore", headers=buyer_headers)
            self.assertEqual(gone.status_code, 404)

    async def test_rule_groups_reorder(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)
        headers = {**auth}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp1 = await client.post("/api/rule-groups", headers=headers, json={"name": "Group Alpha", "preset_ids": []})
            self.assertEqual(resp1.status_code, 200)
            g1 = resp1.json()

            resp2 = await client.post("/api/rule-groups", headers=headers, json={"name": "Group Beta", "preset_ids": []})
            self.assertEqual(resp2.status_code, 200)
            g2 = resp2.json()

            resp3 = await client.post("/api/rule-groups", headers=headers, json={"name": "Group Gamma", "preset_ids": []})
            self.assertEqual(resp3.status_code, 200)
            g3 = resp3.json()

            reorder_resp = await client.put(
                "/api/rule-groups/reorder",
                headers=headers,
                json={"group_ids": [g3["id"], g1["id"], g2["id"]]},
            )
            self.assertEqual(reorder_resp.status_code, 200)
            reordered = reorder_resp.json()
            custom_groups = [g for g in reordered if g["id"] in {g1["id"], g2["id"], g3["id"]}]
            self.assertEqual([g["id"] for g in custom_groups], [g3["id"], g1["id"], g2["id"]])

            get_resp = await client.get("/api/rule-groups", headers=headers)
            self.assertEqual(get_resp.status_code, 200)
            get_groups = [g for g in get_resp.json() if g["id"] in {g1["id"], g2["id"], g3["id"]}]
            self.assertEqual([g["id"] for g in get_groups], [g3["id"], g1["id"], g2["id"]])

    async def test_parse_raw_endpoint(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)
        raw_fb_text = """
        Ad account ID: 1083480094013618
        Швеция 1083
        act_1070862758952340
        """
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {**auth}
            resp = await client.post("/api/accounts/parse-raw", headers=headers, json={"raw_text": raw_fb_text})
            self.assertEqual(resp.status_code, 200)
            items = resp.json()
            self.assertEqual(len(items), 2)
            self.assertEqual(items[0]["account_id"], "act_1083480094013618")
            self.assertEqual(items[1]["account_id"], "act_1070862758952340")

    async def test_batch_import_never_enables_rules_for_a_new_account(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)
        headers = {**auth}

        meta_account = {
            "timezone_name": "Europe/Stockholm",
            "name": "Imported account",
            "account_status": 1,
            "status_label": "Active",
            "currency": "EUR",
        }
        legacy_payload = {
            "accounts": [{"account_id": "act_new_account", "name": "New account"}],
            "batch_name": "-",
            "access_token": "new_mock_token",
            # Older clients may still send this field. It must be ignored.
            "rules_enabled": True,
        }

        transport = httpx.ASGITransport(app=self.app)
        with patch.object(
            self.app.state.meta_client,
            "get_account_info",
            new=AsyncMock(return_value=meta_account),
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/accounts/batch-add",
                    headers=headers,
                    json=legacy_payload,
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["success_count"], 1)

        async with self.test_session_maker() as session:
            result = await session.execute(
                select(Account).where(Account.account_id == "act_new_account")
            )
            imported = result.scalar_one()
            self.assertFalse(imported.rules_enabled)
            self.assertEqual(imported.active_rules, "[]")
            self.assertEqual(imported.currency, "EUR")
            self.assertEqual(imported.access_token, "")
            self.assertNotIn("new_mock_token", imported.access_token_encrypted)
            self.assertEqual(
                decrypt_meta_token(imported.access_token_encrypted),
                "new_mock_token",
            )

    async def test_manual_reimport_marks_existing_account_as_system_user(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)
        headers = {**auth}
        account_id = "act_1018756607700064"

        async with self.test_session_maker() as session:
            existing = (
                await session.execute(
                    select(Account).where(Account.account_id == account_id)
                )
            ).scalar_one()
            buyer = (
                await session.execute(
                    select(User).where(User.telegram_id == "8948797431")
                )
            ).scalar_one()
            conn_obj = MetaConnection(
                workspace_id=self.ws_buyer_id,
                owner_user_id=buyer.id,
                provider_user_id="provider_nick_reimport",
                access_token_encrypted="encrypted_token",
                status="active",
            )
            session.add(conn_obj)
            await session.flush()
            existing.meta_connection_id = conn_obj.id
            await session.commit()

        meta_account = {
            "timezone_name": "Europe/Stockholm",
            "name": "Reconnected account",
            "account_status": 1,
            "status_label": "Active",
            "currency": "EUR",
        }
        payload = {
            "accounts": [{"account_id": account_id, "name": "Manual source"}],
            "batch_name": "-",
            "access_token": "replacement_system_user_token",
        }

        transport = httpx.ASGITransport(app=self.app)
        with patch.object(
            self.app.state.meta_client,
            "get_account_info",
            new=AsyncMock(return_value=meta_account),
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/accounts/batch-add",
                    headers=headers,
                    json=payload,
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["success_count"], 1)

        async with self.test_session_maker() as session:
            reconnected = (
                await session.execute(
                    select(Account).where(Account.account_id == account_id)
                )
            ).scalar_one()
            self.assertIsNone(reconnected.meta_connection_id)
            self.assertEqual(reconnected.access_token, "")
            self.assertNotIn(
                "replacement_system_user_token",
                reconnected.access_token_encrypted,
            )
            self.assertEqual(
                decrypt_meta_token(reconnected.access_token_encrypted),
                "replacement_system_user_token",
            )
            self.assertEqual(reconnected.currency, "EUR")

    async def test_batch_import_rejects_account_without_supported_meta_timezone(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)
        payload = {
            "accounts": [{"account_id": "act_missing_timezone", "name": "Broken clock"}],
            "batch_name": "-",
            "access_token": "new_mock_token",
        }
        meta_account = {
            "timezone_name": "Mars/Olympus_Mons",
            "name": "Broken clock",
            "account_status": 1,
            "status_label": "Active",
            "currency": "USD",
        }

        transport = httpx.ASGITransport(app=self.app)
        with patch.object(
            self.app.state.meta_client,
            "get_account_info",
            new=AsyncMock(return_value=meta_account),
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/accounts/batch-add",
                    headers={**auth},
                    json=payload,
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["success_count"], 0)
        self.assertEqual(response.json()["error_count"], 1)
        self.assertIn("time zone", response.json()["errors"][0]["error"])

        async with self.test_session_maker() as session:
            rejected = (
                await session.execute(
                    select(Account).where(Account.account_id == "act_missing_timezone")
                )
            ).scalar_one_or_none()
            self.assertIsNone(rejected)

    async def test_analytics_view_is_saved_per_user_and_validated(self):
        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        admin_data = await session_headers(self.test_session_maker, {"id": 8634201356, "first_name": "Admin", "username": "admin_user"})
        buyer_headers = {**buyer_data}
        admin_headers = {**admin_data}
        transport = httpx.ASGITransport(app=self.app)

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            default_view = await client.get("/api/analytics-view", headers=buyer_headers)
            self.assertEqual(default_view.status_code, 200)
            self.assertFalse(default_view.json()["is_saved"])
            self.assertEqual(default_view.json()["view_mode"], "all")
            self.assertEqual(len(default_view.json()["visible_columns"]), 24)
            self.assertEqual(default_view.json()["sort_column"], "")
            self.assertEqual(default_view.json()["filters"], {"query": "", "status": "all", "group_id": "all"})
            self.assertEqual(default_view.json()["period"], "today")

            saved_view = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"view_mode": "delivery", "visible_columns": ["spend", "impressions", "cpm"]},
            )
            self.assertEqual(saved_view.status_code, 200)
            self.assertTrue(saved_view.json()["is_saved"])
            self.assertEqual(
                saved_view.json()["visible_columns"],
                ["account", "data", "spend", "impressions", "cpm"],
            )
            self.assertEqual(len(saved_view.json()["column_order"]), 24)
            self.assertEqual(saved_view.json()["column_order"][:3], ["account", "custom_name", "note"])
            self.assertEqual(saved_view.json()["column_widths"]["account"], 260)

            restored_view = await client.get("/api/analytics-view", headers=buyer_headers)
            self.assertEqual(restored_view.json()["view_mode"], "delivery")
            self.assertEqual(restored_view.json()["visible_columns"], saved_view.json()["visible_columns"])

            reordered_view = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={
                    "view_mode": "custom",
                    "visible_columns": ["account", "data", "spend", "cpp"],
                    "column_order": ["spend", "account", "data", "cpp"],
                    "column_widths": {"spend": 176, "account": 320, "cpp": 88},
                    "sort_column": "spend",
                    "sort_direction": "desc",
                    "filters": {"query": "sweden", "status": "synced", "group_id": "42"},
                    "period": "last_7d",
                },
            )
            self.assertEqual(reordered_view.status_code, 200)
            self.assertEqual(
                reordered_view.json()["column_order"][:4],
                ["spend", "account", "data", "cpp"],
            )
            self.assertEqual(reordered_view.json()["column_widths"]["spend"], 176)
            self.assertEqual(reordered_view.json()["column_widths"]["account"], 320)
            self.assertEqual(reordered_view.json()["sort_column"], "spend")
            self.assertEqual(reordered_view.json()["sort_direction"], "desc")
            self.assertEqual(
                reordered_view.json()["filters"],
                {"query": "sweden", "status": "synced", "group_id": "42"},
            )
            self.assertEqual(reordered_view.json()["period"], "last_7d")

            restored_reordered_view = await client.get("/api/analytics-view", headers=buyer_headers)
            self.assertEqual(restored_reordered_view.json()["column_order"][:4], ["spend", "account", "data", "cpp"])
            self.assertEqual(restored_reordered_view.json()["column_widths"]["cpp"], 88)
            self.assertEqual(restored_reordered_view.json()["sort_column"], "spend")
            self.assertEqual(restored_reordered_view.json()["filters"]["status"], "synced")
            self.assertEqual(restored_reordered_view.json()["period"], "last_7d")

            isolated_admin_view = await client.get("/api/analytics-view", headers=admin_headers)
            self.assertFalse(isolated_admin_view.json()["is_saved"])
            self.assertEqual(len(isolated_admin_view.json()["visible_columns"]), 24)

            invalid_view = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"view_mode": "custom", "visible_columns": ["account", "secret_token"]},
            )
            self.assertEqual(invalid_view.status_code, 422)

            invalid_order = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"view_mode": "custom", "column_order": ["account", "unknown_metric"]},
            )
            self.assertEqual(invalid_order.status_code, 422)

            invalid_width = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"view_mode": "custom", "column_widths": {"spend": 421}},
            )
            self.assertEqual(invalid_width.status_code, 422)

            invalid_sort = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"sort_column": "unknown_metric"},
            )
            self.assertEqual(invalid_sort.status_code, 422)

            invalid_filter = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"filters": {"owner": "somebody"}},
            )
            self.assertEqual(invalid_filter.status_code, 422)

            invalid_status = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"filters": {"status": "archived"}},
            )
            self.assertEqual(invalid_status.status_code, 422)

            invalid_group = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"filters": {"group_id": "foreign"}},
            )
            self.assertEqual(invalid_group.status_code, 422)

            invalid_period = await client.put(
                "/api/analytics-view",
                headers=buyer_headers,
                json={"period": "last_30d"},
            )
            self.assertEqual(invalid_period.status_code, 422)

        async with self.test_session_maker() as session:
            count = int(
                (await session.execute(select(func.count()).select_from(AnalyticsViewPreference))).scalar_one()
            )
            self.assertEqual(count, 1)

    async def test_summary_exposes_metric_definitions_quality_and_cache_provenance(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            session.add_all(
                [
                    Account(
                        account_id="act_blocked",
                        name="Blocked account",
                        access_token="blocked_token",
                        owner_user_id=buyer.id,
                        workspace_id=buyer.active_workspace_id,
                        currency="USD",
                        account_status=2,
                        is_active=True,
                    ),
                    Account(
                        account_id="act_sync_error",
                        name="Error account",
                        access_token="error_token",
                        owner_user_id=buyer.id,
                        workspace_id=buyer.active_workspace_id,
                        currency="USD",
                        account_status=1,
                        is_active=True,
                    ),
                ]
            )
            await session.commit()

        async def insights_side_effect(account_id, access_token, date_preset):
            if account_id == "act_sync_error":
                raise RuntimeError("Meta unavailable")
            return {
                "spend": 30.0,
                "clicks": 50,
                "impressions": 1000,
                "reach": 600,
                "unique_clicks": 40,
                "link_clicks": 30,
                "outbound_clicks": 25,
                "landing_page_views": 20,
                "leads": 2,
                "registrations": 1,
                "purchases": 1,
            }

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)
        mocked_insights = AsyncMock(side_effect=insights_side_effect)
        with patch.object(self.app.state.meta_client, "get_account_insights_summary", new=mocked_insights):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                fresh = await client.get("/api/summary?period=today&force=true", headers=headers)
                cached = await client.get("/api/summary?period=today", headers=headers)

        self.assertEqual(fresh.status_code, 200)
        data = fresh.json()
        self.assertEqual(data["source"], "Meta Marketing API")
        self.assertTrue(data["generated_at"].endswith("Z"))
        self.assertNotIn("total_results", data)
        self.assertNotIn("avg_cost_per_result", data)
        self.assertNotIn("total_conversions", data)
        self.assertEqual(data["total_spend"], 60.0)
        self.assertEqual(data["cost_per_lead"], 15.0)
        self.assertEqual(data["cost_per_registration"], 30.0)
        self.assertEqual(data["cost_per_purchase"], 30.0)
        self.assertEqual(data["avg_ctr"], 5.0)
        self.assertEqual(data["avg_cpc"], 0.6)
        self.assertEqual(data["total_impressions"], 2000)
        self.assertEqual(data["total_reach"], 1200)
        self.assertEqual(data["avg_frequency"], 1.67)
        self.assertEqual(data["avg_cpm"], 30.0)
        self.assertEqual(data["total_unique_clicks"], 80)
        self.assertEqual(data["total_link_clicks"], 60)
        self.assertEqual(data["total_outbound_clicks"], 50)
        self.assertEqual(data["total_landing_page_views"], 40)
        self.assertEqual(data["avg_ctr_link"], 3.0)
        self.assertEqual(data["avg_ctr_outbound"], 2.5)
        self.assertEqual(data["avg_cpc_link"], 1.0)
        self.assertEqual(data["cost_per_landing_page_view"], 1.5)
        self.assertIn("not added together", data["metric_definitions"]["leads"])
        self.assertIn("Counted separately", data["metric_definitions"]["registrations"])
        self.assertIn("Counted separately", data["metric_definitions"]["purchases"])
        self.assertIn("regardless of their current status", data["metric_definitions"]["spend"])
        self.assertEqual(
            data["data_quality"],
            {
                "status": "partial",
                "accounts_total": 3,
                "accounts_synced": 2,
                "accounts_failed": 1,
                "accounts_blocked": 0,
                "metrics_coverage_percent": 66.7,
                "monetary_totals_available": True,
                "currency_issue": "",
            },
        )
        self.assertEqual(data["display_currency"], "USD")
        self.assertFalse(data["mixed_currencies"])
        self.assertEqual(data["currency_totals"][0]["spend"], 60.0)
        by_id = {account["account_id"]: account for account in data["accounts"]}
        self.assertEqual(by_id["act_1018756607700064"]["data_status"], "synced")
        self.assertEqual(by_id["act_blocked"]["data_status"], "synced")
        self.assertTrue(by_id["act_blocked"]["is_banned"])
        self.assertEqual(by_id["act_blocked"]["spend"], 30.0)
        self.assertEqual(by_id["act_sync_error"]["data_status"], "error")
        self.assertFalse(data["cache"]["is_cached"])
        self.assertEqual(data["cache"]["origin"], "live")
        self.assertTrue(data["snapshot"]["persisted"])
        self.assertTrue(cached.json()["cache"]["is_cached"])
        self.assertEqual(cached.json()["cache"]["origin"], "memory")
        self.assertEqual(mocked_insights.await_count, 3)

        async with self.test_session_maker() as session:
            snapshot_count = (
                await session.execute(select(func.count()).select_from(SummarySnapshot))
            ).scalar_one()
        self.assertEqual(snapshot_count, 1)

    async def test_summary_survives_reload_and_keeps_previous_snapshot(self):
        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)

        first_metrics = {
            "spend": 100.0,
            "clicks": 50,
            "impressions": 1000,
            "leads": 10,
            "registrations": 5,
            "purchases": 1,
        }
        second_metrics = {**first_metrics, "spend": 125.0, "clicks": 60}

        with patch.object(
            self.app.state.meta_client,
            "get_account_insights_summary",
            new=AsyncMock(side_effect=[first_metrics, second_metrics]),
        ) as mocked_insights:
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                first = await client.get(
                    "/api/summary?period=today&force=true",
                    headers=headers,
                )
                api_routes_module._summary_cache.clear()
                restored = await client.get(
                    "/api/summary?period=today",
                    headers=headers,
                )
                second = await client.get(
                    "/api/summary?period=today&force=true",
                    headers=headers,
                )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(restored.json()["total_spend"], 100.0)
        self.assertEqual(restored.json()["cache"]["origin"], "database")
        self.assertTrue(restored.json()["cache"]["is_cached"])
        self.assertEqual(second.json()["total_spend"], 125.0)
        self.assertEqual(second.json()["snapshot"]["previous"]["total_spend"], 100.0)
        self.assertEqual(mocked_insights.await_count, 2)

        async with self.test_session_maker() as session:
            snapshots = (
                await session.execute(
                    select(SummarySnapshot).order_by(SummarySnapshot.id)
                )
            ).scalars().all()
        self.assertEqual(len(snapshots), 2)
        self.assertNotIn("access_token", snapshots[0].payload)

        with patch.object(
            self.app.state.meta_client,
            "get_account_insights_summary",
            new=AsyncMock(side_effect=RuntimeError("Meta unavailable")),
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                failed_refresh = await client.get(
                    "/api/summary?period=today&force=true",
                    headers=headers,
                )

        self.assertEqual(failed_refresh.status_code, 502)
        self.assertIn("snapshot is unchanged", failed_refresh.json()["detail"])
        async with self.test_session_maker() as session:
            snapshot_count_after_failure = (
                await session.execute(select(func.count()).select_from(SummarySnapshot))
            ).scalar_one()
        self.assertEqual(snapshot_count_after_failure, 2)

    async def test_summary_never_combines_money_from_different_currencies(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            session.add(
                Account(
                    account_id="act_eur",
                    name="Euro account",
                    access_token="eur_token",
                    owner_user_id=buyer.id,
                    workspace_id=buyer.active_workspace_id,
                    currency="EUR",
                    is_active=True,
                )
            )
            await session.commit()

        async def insights(account_id, access_token, date_preset):
            return {
                "spend": 100.0 if account_id == "act_eur" else 50.0,
                "clicks": 10,
                "impressions": 1000,
                "leads": 2,
                "registrations": 1,
                "purchases": 0,
            }

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        with patch.object(
            self.app.state.meta_client,
            "get_account_insights_summary",
            new=AsyncMock(side_effect=insights),
        ):
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/summary?period=today&force=true",
                    headers={**buyer_data},
                )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["mixed_currencies"])
        self.assertEqual(data["display_currency"], "")
        self.assertIsNone(data["total_spend"])
        self.assertIsNone(data["cost_per_lead"])
        self.assertEqual(
            {item["currency"]: item["spend"] for item in data["currency_totals"]},
            {"EUR": 100.0, "USD": 50.0},
        )

    async def test_summary_workspace_isolation_switch_and_cache(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()

            # Create a second workspace for buyer
            ws_second = Workspace(
                name="Second Workspace",
                slug="buyer-second-ws",
                badge_text="S",
                badge_color="#6366F1",
                owner_user_id=buyer.id,
            )
            session.add(ws_second)
            await session.flush()
            session.add(WorkspaceMember(workspace_id=ws_second.id, user_id=buyer.id, role="owner"))

            # Add account to second workspace
            acc_second = Account(
                account_id="act_second_ws_999",
                name="Second WS Account",
                access_token="second_token",
                owner_user_id=buyer.id,
                workspace_id=ws_second.id,
                currency="USD",
                is_active=True,
            )
            session.add(acc_second)
            await session.commit()

            ws1_id = buyer.active_workspace_id
            ws2_id = ws_second.id

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)

        async def insights_router(account_id, access_token, date_preset):
            if account_id == "act_second_ws_999":
                return {
                    "spend": 250.0,
                    "clicks": 100,
                    "impressions": 5000,
                    "reach": 3000,
                    "leads": 20,
                    "registrations": 10,
                    "purchases": 5,
                }
            return {
                "spend": 100.0,
                "clicks": 40,
                "impressions": 2000,
                "reach": 1500,
                "leads": 8,
                "registrations": 4,
                "purchases": 2,
            }

        with patch.object(
            self.app.state.meta_client,
            "get_account_insights_summary",
            new=AsyncMock(side_effect=insights_router),
        ) as mocked_insights:
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. Fetch in Workspace 1 (live)
                resp1_live = await client.get("/api/summary?period=today&force=true", headers=headers)
                self.assertEqual(resp1_live.status_code, 200)
                data1_live = resp1_live.json()
                self.assertEqual(data1_live["total_spend"], 100.0)
                self.assertEqual(data1_live["cache"]["workspace_id"], ws1_id)
                self.assertEqual(data1_live["cache"]["origin"], "live")

                # 2. Fetch in Workspace 1 (memory cache)
                resp1_mem = await client.get("/api/summary?period=today", headers=headers)
                self.assertEqual(resp1_mem.status_code, 200)
                data1_mem = resp1_mem.json()
                self.assertEqual(data1_mem["total_spend"], 100.0)
                self.assertEqual(data1_mem["cache"]["origin"], "memory")
                self.assertEqual(data1_mem["cache"]["workspace_id"], ws1_id)

                # 3. Switch to Workspace 2
                switch_resp = await client.post(
                    "/api/workspaces/switch",
                    json={"workspace_id": ws2_id},
                    headers=headers,
                )
                self.assertEqual(switch_resp.status_code, 200)

                # 4. Fetch in Workspace 2 (must NOT hit WS1 cache/snapshot!)
                resp2_live = await client.get("/api/summary?period=today", headers=headers)
                self.assertEqual(resp2_live.status_code, 200)
                data2_live = resp2_live.json()
                self.assertEqual(data2_live["total_spend"], 250.0)
                self.assertEqual(data2_live["cache"]["workspace_id"], ws2_id)
                self.assertEqual(len(data2_live["accounts"]), 1)
                self.assertEqual(data2_live["accounts"][0]["account_id"], "act_second_ws_999")

                # 5. Switch back to Workspace 1
                await client.post(
                    "/api/workspaces/switch",
                    json={"workspace_id": ws1_id},
                    headers=headers,
                )

                # 6. Fetch in Workspace 1 (must get WS1 data, NOT WS2!)
                resp1_back = await client.get("/api/summary?period=today", headers=headers)
                self.assertEqual(resp1_back.status_code, 200)
                data1_back = resp1_back.json()
                self.assertEqual(data1_back["total_spend"], 100.0)
                self.assertEqual(data1_back["cache"]["workspace_id"], ws1_id)
                self.assertEqual(data1_back["accounts"][0]["account_id"], "act_1018756607700064")

        # Verify DB snapshots have proper workspace_id
        async with self.test_session_maker() as session:
            snapshots = (
                await session.execute(
                    select(SummarySnapshot).order_by(SummarySnapshot.id)
                )
            ).scalars().all()
            for sn in snapshots:
                self.assertIsNotNone(sn.workspace_id)
                self.assertIn(sn.workspace_id, [ws1_id, ws2_id])

    async def test_summary_financial_consistency_on_account_membership_change(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            ws_id = buyer.active_workspace_id

            # Add account 2 to same workspace
            acc2 = Account(
                account_id="act_temp_bonus",
                name="Temp Account",
                access_token="temp_token",
                owner_user_id=buyer.id,
                workspace_id=ws_id,
                currency="USD",
                is_active=True,
            )
            session.add(acc2)
            await session.commit()

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)

        async def insights_2acc(account_id, access_token, date_preset):
            return {
                "spend": 50.0,
                "clicks": 10,
                "impressions": 500,
                "reach": 400,
                "leads": 1,
                "registrations": 1,
                "purchases": 0,
            }

        with patch.object(
            self.app.state.meta_client,
            "get_account_insights_summary",
            new=AsyncMock(side_effect=insights_2acc),
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. Fetch summary with 2 accounts -> total spend = 100
                res = await client.get("/api/summary?period=today&force=true", headers=headers)
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.json()["total_spend"], 100.0)
                self.assertEqual(len(res.json()["accounts"]), 2)

                # 2. Delete acc2
                del_resp = await client.delete("/api/accounts/act_temp_bonus", headers=headers)
                self.assertEqual(del_resp.status_code, 200)

                # 3. Clear memory cache to test DB snapshot stale detection
                api_routes_module._summary_cache.clear()

                # 4. Fetch summary non-force: the saved snapshot had 2 accounts, but workspace now has 1 account.
                # It should detect mismatch, invalidate stale snapshot, and refresh fresh with 1 account!
                res_after_del = await client.get("/api/summary?period=today", headers=headers)
                self.assertEqual(res_after_del.status_code, 200)
                data_after_del = res_after_del.json()
                self.assertEqual(data_after_del["total_spend"], 50.0)
                self.assertEqual(len(data_after_del["accounts"]), 1)
                self.assertEqual(data_after_del["accounts"][0]["account_id"], "act_1018756607700064")

    async def test_summary_empty_workspace_returns_valid_payload_and_snapshot(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            ws_empty = Workspace(
                name="Empty Workspace",
                slug="buyer-empty-ws",
                badge_text="E",
                badge_color="#EF4444",
                owner_user_id=buyer.id,
            )
            session.add(ws_empty)
            await session.flush()
            session.add(WorkspaceMember(workspace_id=ws_empty.id, user_id=buyer.id, role="owner"))
            await session.commit()
            empty_ws_id = ws_empty.id

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Switch to empty workspace
            await client.post("/api/workspaces/switch", json={"workspace_id": empty_ws_id}, headers=headers)

            # Get summary
            resp = await client.get("/api/summary?period=today", headers=headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["total_spend"], 0.0)
            self.assertEqual(data["accounts_count"], 0)
            self.assertEqual(data["accounts"], [])
            self.assertEqual(data["data_quality"]["status"], "unavailable")
            self.assertEqual(data["cache"]["workspace_id"], empty_ws_id)
            self.assertTrue(data["snapshot"]["persisted"])

            # Verify subsequent cached load
            cached_resp = await client.get("/api/summary?period=today", headers=headers)
            self.assertEqual(cached_resp.status_code, 200)
            self.assertEqual(cached_resp.json()["total_spend"], 0.0)

    async def test_summary_previous_comparison_isolated_per_workspace(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            ws_other = Workspace(
                name="Other Workspace",
                slug="buyer-other-ws",
                badge_text="O",
                badge_color="#EC4899",
                owner_user_id=buyer.id,
            )
            session.add(ws_other)
            await session.flush()
            session.add(WorkspaceMember(workspace_id=ws_other.id, user_id=buyer.id, role="owner"))
            acc_other = Account(
                account_id="act_other_ws_111",
                name="Other WS Account",
                access_token="other_token",
                owner_user_id=buyer.id,
                workspace_id=ws_other.id,
                currency="USD",
                is_active=True,
            )
            session.add(acc_other)
            await session.commit()
            ws1_id = buyer.active_workspace_id
            ws2_id = ws_other.id

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)

        insights_mock = AsyncMock()
        with patch.object(self.app.state.meta_client, "get_account_insights_summary", new=insights_mock):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. WS1 first refresh -> spend=100
                insights_mock.return_value = {"spend": 100.0, "clicks": 10, "impressions": 100}
                res1_1 = await client.get("/api/summary?period=today&force=true", headers=headers)
                self.assertIsNone(res1_1.json()["snapshot"]["previous"])

                # 2. WS1 second refresh -> spend=120 (previous is 100)
                insights_mock.return_value = {"spend": 120.0, "clicks": 12, "impressions": 120}
                res1_2 = await client.get("/api/summary?period=today&force=true", headers=headers)
                self.assertEqual(res1_2.json()["snapshot"]["previous"]["total_spend"], 100.0)

                # 3. Switch to WS2, refresh -> spend=999
                await client.post("/api/workspaces/switch", json={"workspace_id": ws2_id}, headers=headers)
                insights_mock.return_value = {"spend": 999.0, "clicks": 90, "impressions": 900}
                res2_1 = await client.get("/api/summary?period=today&force=true", headers=headers)
                self.assertEqual(res2_1.json()["total_spend"], 999.0)
                self.assertIsNone(res2_1.json()["snapshot"]["previous"])

                # 4. Switch back to WS1, refresh -> spend=150 (previous MUST be 120 from WS1, not 999 from WS2!)
                await client.post("/api/workspaces/switch", json={"workspace_id": ws1_id}, headers=headers)
                insights_mock.return_value = {"spend": 150.0, "clicks": 15, "impressions": 150}
                res1_3 = await client.get("/api/summary?period=today&force=true", headers=headers)
                self.assertEqual(res1_3.json()["total_spend"], 150.0)
                self.assertEqual(res1_3.json()["snapshot"]["previous"]["total_spend"], 120.0)

    async def test_settings_endpoint(self):
        admin_info = {"id": 8634201356, "first_name": "Admin", "username": "admin_user"}
        admin_auth = await session_headers(self.test_session_maker, admin_info)

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {**admin_auth}

            # Get settings
            s_resp = await client.get("/api/settings", headers=headers)
            self.assertEqual(s_resp.status_code, 200)
            self.assertEqual(s_resp.json()["poll_interval_minutes"], 15)
            self.assertEqual(s_resp.json()["critical_rule_interval_minutes"], 2)
            self.assertEqual(s_resp.json()["stop_confirmation_minutes"], 10)
            self.assertEqual(s_resp.json()["usage_hard_limit_percent"], 80)

            missing_password = await client.post(
                "/api/settings/interval",
                headers=headers,
                json={"minutes": 30},
            )
            wrong_password = await client.post(
                "/api/settings/interval",
                headers=headers,
                json={"minutes": 30, "current_password": "wrong"},
            )
            set_resp = await client.post(
                "/api/settings/interval",
                headers=headers,
                json={"minutes": 30, "current_password": "admin-password"},
            )

            automation_resp = await client.post(
                "/api/settings/automation",
                headers=headers,
                json={
                    "current_password": "admin-password",
                    "poll_interval_minutes": 15,
                    "critical_rule_interval_minutes": 1,
                    "stop_confirmation_minutes": 7,
                    "inventory_cache_minutes": 5,
                    "account_health_interval_minutes": 30,
                    "max_concurrent_accounts": 2,
                    "max_concurrent_actions": 4,
                    "usage_soft_limit_percent": 55,
                    "usage_hard_limit_percent": 78,
                    "adaptive_polling_enabled": True,
                },
            )

            invalid_thresholds = await client.post(
                "/api/settings/automation",
                headers=headers,
                json={
                    "current_password": "admin-password",
                    "poll_interval_minutes": 15,
                    "critical_rule_interval_minutes": 1,
                    "stop_confirmation_minutes": 7,
                    "inventory_cache_minutes": 5,
                    "account_health_interval_minutes": 30,
                    "max_concurrent_accounts": 2,
                    "max_concurrent_actions": 4,
                    "usage_soft_limit_percent": 80,
                    "usage_hard_limit_percent": 70,
                    "adaptive_polling_enabled": True,
                },
            )

            refreshed = await client.get("/api/settings", headers=headers)

        self.assertEqual(missing_password.status_code, 422)
        self.assertEqual(wrong_password.status_code, 403)
        self.assertEqual(set_resp.status_code, 200)
        self.assertEqual(set_resp.json()["poll_interval_minutes"], 30)
        self.assertEqual(automation_resp.status_code, 200)
        self.assertEqual(invalid_thresholds.status_code, 422)
        self.assertEqual(refreshed.json()["critical_rule_interval_minutes"], 1)
        self.assertEqual(refreshed.json()["stop_confirmation_minutes"], 7)
        self.assertEqual(refreshed.json()["max_concurrent_actions"], 4)
        self.assertEqual(refreshed.json()["usage_hard_limit_percent"], 78)

    async def test_buyer_cannot_dismiss_another_users_stopped_adset(self):
        async with self.test_session_maker() as session:
            admin = (await session.execute(select(User).where(User.telegram_id == "8634201356"))).scalar_one()
            session.add(
                Account(
                    account_id="act_admin_account",
                    name="Admin account",
                    access_token="admin_mock_token",
                    owner_user_id=admin.id,
                    workspace_id=admin.active_workspace_id,
                    timezone_name="UTC",
                )
            )
            session.add(
                StoppedAdSet(
                    account_id="act_admin_account",
                    adset_id="admin_adset_1",
                    adset_name="Admin ad set",
                    stop_spend=10.0,
                )
            )
            await session.commit()

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        admin_data = await session_headers(self.test_session_maker, {"id": 8634201356, "first_name": "Admin", "username": "admin_user"})
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            forbidden = await client.post(
                "/api/adsets/admin_adset_1/dismiss",
                headers={**buyer_data},
            )
            allowed = await client.post(
                "/api/adsets/admin_adset_1/dismiss",
                headers={**admin_data},
            )

        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(allowed.status_code, 200)

        async with self.test_session_maker() as session:
            audit_event = (
                await session.execute(
                    select(AuditEvent).where(AuditEvent.event_type == "HIDE_STOPPED_NOTIFICATION")
                )
            ).scalar_one()
            self.assertEqual(audit_event.actor_type, "user")
            self.assertEqual(audit_event.actor_id, "8634201356")
            self.assertEqual(audit_event.adset_id, "admin_adset_1")
            self.assertEqual(audit_event.action, "HIDE_NOTIFICATION")

    async def test_audit_history_is_owner_isolated_filterable_and_paginated(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            admin = (await session.execute(select(User).where(User.telegram_id == "8634201356"))).scalar_one()
            session.add_all(
                [
                    AuditEvent(
                        owner_user_id=buyer.id,
                        workspace_id=buyer.active_workspace_id,
                        category="RULE_ACTION",
                        event_type="STOP",
                        status="SUCCESS",
                        account_id="act_1018756607700064",
                        account_name="Buyer account",
                        adset_id="buyer_adset",
                        adset_name="Buyer ad set",
                        rule_name="Buyer stop rule",
                        action="STOP",
                        message="Buyer event",
                        correlation_id="buyer-cycle",
                    ),
                    AuditEvent(
                        owner_user_id=admin.id,
                        workspace_id=admin.active_workspace_id,
                        category="ACCOUNT_HEALTH",
                        event_type="TOKEN_EXPIRED",
                        status="ERROR",
                        account_id="act_admin_account",
                        account_name="Admin account",
                        message="Admin event",
                        correlation_id="admin-cycle",
                    ),
                    AuditEvent(
                        owner_user_id=admin.id,
                        workspace_id=admin.active_workspace_id,
                        category="RULE_ACTION",
                        event_type="STOP",
                        status="SUCCESS",
                        account_id="act_admin_account_2",
                        account_name="Admin account 2",
                        message="Admin event 2",
                        correlation_id="admin-cycle-2",
                    ),
                ]
            )
            await session.commit()

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        admin_data = await session_headers(self.test_session_maker, {"id": 8634201356, "first_name": "Admin", "username": "admin_user"})
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            buyer_response = await client.get(
                "/api/audit-events?category=rule_action&search=Buyer",
                headers={**buyer_data},
            )
            buyer_error_filter = await client.get(
                "/api/audit-events?status=ERROR",
                headers={**buyer_data},
            )
            admin_response = await client.get(
                "/api/audit-events?page_size=1",
                headers={**admin_data},
            )

        self.assertEqual(buyer_response.status_code, 200)
        self.assertEqual(buyer_response.json()["total"], 1)
        self.assertEqual(buyer_response.json()["items"][0]["adset_id"], "buyer_adset")
        self.assertIsNone(buyer_response.json()["items"][0]["owner_user_id"])
        self.assertEqual(buyer_response.json()["status_counts"]["SUCCESS"], 1)
        self.assertEqual(buyer_error_filter.json()["total"], 0)
        self.assertEqual(buyer_error_filter.json()["status_counts"]["SUCCESS"], 1)

        self.assertEqual(admin_response.status_code, 200)
        self.assertEqual(admin_response.json()["total"], 2)
        self.assertEqual(admin_response.json()["total_pages"], 2)
        self.assertEqual(len(admin_response.json()["items"]), 1)
        self.assertIsNotNone(admin_response.json()["items"][0]["owner_user_id"])

    async def test_failed_manual_reactivation_is_audited_without_exposing_secret(self):
        async with self.test_session_maker() as session:
            session.add(
                StoppedAdSet(
                    account_id="act_1018756607700064",
                    adset_id="buyer_failed_adset",
                    adset_name="Buyer failed ad set",
                    stop_spend=8.0,
                )
            )
            await session.commit()

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        transport = httpx.ASGITransport(app=self.app)
        with patch.object(
            self.app.state.meta_client,
            "set_adset_status",
            new=AsyncMock(side_effect=RuntimeError("access_token=private-secret")),
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/adsets/buyer_failed_adset/reactivate",
                    headers={**buyer_data},
                )

        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private-secret", response.text)
        async with self.test_session_maker() as session:
            event = (
                await session.execute(
                    select(AuditEvent).where(AuditEvent.adset_id == "buyer_failed_adset")
                )
            ).scalar_one()
            stopped = (
                await session.execute(
                    select(StoppedAdSet).where(StoppedAdSet.adset_id == "buyer_failed_adset")
                )
            ).scalar_one()
            self.assertEqual(event.status, "ERROR")
            self.assertIn("access_token=[REDACTED]", event.message)
            self.assertFalse(stopped.is_resolved)

    async def test_stop_undo_is_guarded_idempotent_and_append_only(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            source = AuditEvent(
                owner_user_id=buyer.id,
                workspace_id=buyer.active_workspace_id,
                actor_type="system",
                actor_id="monitoring_worker",
                category="RULE_ACTION",
                event_type="STOP",
                status="SUCCESS",
                account_id="act_1018756607700064",
                account_name="Швеция 1",
                adset_id="undo_stop_adset",
                adset_name="Undo stop",
                action="STOP",
                before_state={"status":"ACTIVE"},
                after_state={"status":"PAUSED"},
                correlation_id="source-stop",
            )
            session.add(source)
            session.add(
                StoppedAdSet(
                    account_id="act_1018756607700064",
                    adset_id="undo_stop_adset",
                    adset_name="Undo stop",
                    stop_spend=12.0,
                )
            )
            await session.commit()
            await session.refresh(source)
            source_id = source.id

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)
        current_state = {
            "adset_id": "undo_stop_adset",
            "adset_name": "Undo stop",
            "status": "PAUSED",
            "effective_status": "PAUSED",
            "daily_budget": 50.0,
        }
        with (
            patch.object(
                self.app.state.meta_client,
                "get_adset_state",
                new=AsyncMock(return_value=current_state),
            ) as get_state,
            patch.object(
                self.app.state.meta_client,
                "set_adset_status",
                new=AsyncMock(return_value=True),
            ) as set_status,
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                first = await client.post(f"/api/audit-events/{source_id}/undo", headers=headers)
                second = await client.post(f"/api/audit-events/{source_id}/undo", headers=headers)
                history = await client.get("/api/audit-events?page_size=100", headers=headers)

        self.assertEqual(first.status_code, 200)
        self.assertFalse(first.json()["already_reverted"])
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["already_reverted"])
        get_state.assert_awaited_once_with("undo_stop_adset", "mock_token", currency="USD")
        set_status.assert_awaited_once_with(
            "undo_stop_adset", "mock_token", "ACTIVE", account_id="act_1018756607700064"
        )
        source_item = next(item for item in history.json()["items"] if item["id"] == source_id)
        self.assertEqual(source_item["display_status"], "REVERTED")
        self.assertFalse(source_item["can_undo"])
        self.assertIsNotNone(source_item["reverted_by_event_id"])

        async with self.test_session_maker() as session:
            source_row = await session.get(AuditEvent, source_id)
            reversal = (
                await session.execute(
                    select(AuditEvent).where(AuditEvent.reverts_event_id == source_id)
                )
            ).scalar_one()
            undo_state = (
                await session.execute(
                    select(ActionUndoState).where(
                        ActionUndoState.original_event_id == source_id
                    )
                )
            ).scalar_one()
            stopped = (
                await session.execute(
                    select(StoppedAdSet).where(StoppedAdSet.adset_id == "undo_stop_adset")
                )
            ).scalar_one()
            self.assertEqual(source_row.status, "SUCCESS")
            self.assertEqual(reversal.event_type, "UNDO_ACTION")
            self.assertIsInstance(undo_state.expected_state, dict)
            self.assertIsInstance(undo_state.desired_state, dict)
            after_st = json.loads(reversal.after_state) if isinstance(reversal.after_state, str) else reversal.after_state
            self.assertEqual(after_st["status"], "ACTIVE")
            self.assertTrue(stopped.is_resolved)

    async def _seed_entity_stop_event(self, *, entity_level, entity_id, entity_name):
        """One successful STOP recorded against a campaign or an ad."""
        async with self.test_session_maker() as session:
            buyer = (
                await session.execute(
                    select(User).where(User.telegram_id == "8948797431")
                )
            ).scalar_one()
            source = AuditEvent(
                owner_user_id=buyer.id,
                workspace_id=buyer.active_workspace_id,
                actor_type="system",
                actor_id="monitoring_worker",
                category="RULE_ACTION",
                event_type="STOP",
                status="SUCCESS",
                account_id="act_1018756607700064",
                account_name="Швеция 1",
                # The worker leaves the ad set columns empty above ad set level.
                adset_id="",
                adset_name="",
                entity_level=entity_level,
                entity_id=entity_id,
                entity_name=entity_name,
                action="STOP",
                before_state={"status": "ACTIVE"},
                after_state={"status": "PAUSED"},
                correlation_id=f"source-stop-{entity_level}",
            )
            session.add(source)
            await session.commit()
            await session.refresh(source)
            return source.id

    async def test_a_campaign_stop_can_be_undone(self):
        source_id = await self._seed_entity_stop_event(
            entity_level="campaign",
            entity_id="camp_undo_1",
            entity_name="Sweden scale",
        )
        auth = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**auth}
        transport = httpx.ASGITransport(app=self.app)

        with (
            patch.object(
                self.app.state.meta_client,
                "get_entity_state",
                new=AsyncMock(
                    return_value={
                        "entity_id": "camp_undo_1",
                        "entity_name": "Sweden scale",
                        "status": "PAUSED",
                        "effective_status": "PAUSED",
                        "daily_budget": 0.0,
                    }
                ),
            ) as get_state,
            patch.object(
                self.app.state.meta_client,
                "set_entity_status",
                new=AsyncMock(return_value=True),
            ) as set_status,
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/audit-events/{source_id}/undo", headers=headers
                )
                history = await client.get(
                    "/api/audit-events?page_size=100", headers=headers
                )

        self.assertEqual(response.status_code, 200)
        get_state.assert_awaited_once_with(
            "camp_undo_1", "mock_token", entity_level="campaign", currency="USD"
        )
        set_status.assert_awaited_once_with(
            "camp_undo_1",
            "mock_token",
            "ACTIVE",
            entity_level="campaign",
            account_id="act_1018756607700064",
        )

        source_item = next(
            item for item in history.json()["items"] if item["id"] == source_id
        )
        self.assertEqual(source_item["display_status"], "REVERTED")

        async with self.test_session_maker() as session:
            reversal = (
                await session.execute(
                    select(AuditEvent).where(AuditEvent.reverts_event_id == source_id)
                )
            ).scalar_one()
            self.assertEqual(reversal.entity_level, "campaign")
            self.assertEqual(reversal.entity_id, "camp_undo_1")
            # A campaign reversal must not claim an ad set.
            self.assertEqual(reversal.adset_id, "")
            self.assertEqual(
                (await session.execute(select(StoppedAdSet))).scalars().all(), []
            )

    async def test_an_ad_stop_can_be_undone(self):
        source_id = await self._seed_entity_stop_event(
            entity_level="ad",
            entity_id="ad_undo_1",
            entity_name="Creative A",
        )
        auth = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**auth}
        transport = httpx.ASGITransport(app=self.app)

        with (
            patch.object(
                self.app.state.meta_client,
                "get_entity_state",
                new=AsyncMock(
                    return_value={
                        "entity_id": "ad_undo_1",
                        "entity_name": "Creative A",
                        "status": "PAUSED",
                        "effective_status": "PAUSED",
                        "daily_budget": 0.0,
                    }
                ),
            ),
            patch.object(
                self.app.state.meta_client,
                "set_entity_status",
                new=AsyncMock(return_value=True),
            ) as set_status,
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/audit-events/{source_id}/undo", headers=headers
                )

        self.assertEqual(response.status_code, 200)
        set_status.assert_awaited_once_with(
            "ad_undo_1",
            "mock_token",
            "ACTIVE",
            entity_level="ad",
            account_id="act_1018756607700064",
        )

    async def test_undo_refuses_when_meta_state_no_longer_matches(self):
        source_id = await self._seed_entity_stop_event(
            entity_level="campaign",
            entity_id="camp_undo_2",
            entity_name="Already resumed",
        )
        auth = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**auth}
        transport = httpx.ASGITransport(app=self.app)

        with (
            patch.object(
                self.app.state.meta_client,
                "get_entity_state",
                new=AsyncMock(
                    return_value={
                        "entity_id": "camp_undo_2",
                        "entity_name": "Already resumed",
                        # Someone turned it back on in Meta already.
                        "status": "ACTIVE",
                        "effective_status": "ACTIVE",
                        "daily_budget": 0.0,
                    }
                ),
            ),
            patch.object(
                self.app.state.meta_client,
                "set_entity_status",
                new=AsyncMock(return_value=True),
            ) as set_status,
        ):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/audit-events/{source_id}/undo", headers=headers
                )

        self.assertEqual(response.status_code, 409)
        set_status.assert_not_awaited()

    async def test_undo_rejects_a_stale_action_after_a_newer_mutation(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            source = AuditEvent(
                owner_user_id=buyer.id,
                workspace_id=buyer.active_workspace_id,
                category="RULE_ACTION",
                event_type="STOP",
                status="SUCCESS",
                account_id="act_1018756607700064",
                adset_id="newer_action_adset",
                action="STOP",
                before_state={"status":"ACTIVE"},
                after_state={"status":"PAUSED"},
                correlation_id="old-action",
            )
            session.add(source)
            await session.flush()
            session.add(
                AuditEvent(
                    owner_user_id=buyer.id,
                    workspace_id=buyer.active_workspace_id,
                    category="MANUAL_ACTION",
                    event_type="MANUAL_REACTIVATE",
                    status="SUCCESS",
                    account_id="act_1018756607700064",
                    adset_id="newer_action_adset",
                    action="REACTIVATE_ADSET",
                    before_state={"status":"PAUSED"},
                    after_state={"status":"ACTIVE"},
                    correlation_id="new-action",
                )
            )
            await session.commit()
            source_id = source.id

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        with patch.object(
            self.app.state.meta_client,
            "get_adset_state",
            new=AsyncMock(),
        ) as get_state:
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/audit-events/{source_id}/undo",
                    headers={**buyer_data},
                )

        self.assertEqual(response.status_code, 409)
        self.assertIn("has changed since this event", response.json()["detail"])
        get_state.assert_not_awaited()

    async def test_budget_undo_restores_the_exact_previous_value(self):
        async with self.test_session_maker() as session:
            buyer = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
            source = AuditEvent(
                owner_user_id=buyer.id,
                workspace_id=buyer.active_workspace_id,
                category="RULE_ACTION",
                event_type="INCREASE_BUDGET",
                status="SUCCESS",
                account_id="act_1018756607700064",
                adset_id="undo_budget_adset",
                action="INCREASE_BUDGET",
                before_state={"daily_budget":50.0},
                after_state={"daily_budget":60.0},
                correlation_id="budget-action",
            )
            session.add(source)
            await session.commit()
            await session.refresh(source)
            source_id = source.id

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        with (
            patch.object(
                self.app.state.meta_client,
                "get_adset_state",
                new=AsyncMock(return_value={"status": "ACTIVE", "daily_budget": 60.0}),
            ),
            patch.object(
                self.app.state.meta_client,
                "update_entity_budget",
                new=AsyncMock(return_value=True),
            ) as update_budget,
        ):
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/audit-events/{source_id}/undo",
                    headers={**buyer_data},
                )

        self.assertEqual(response.status_code, 200)
        update_budget.assert_awaited_once_with(
            "undo_budget_adset", "mock_token", 50.0, currency="USD",
            entity_level="adset", account_id="act_1018756607700064"
        )

    async def test_account_cannot_attach_another_owners_preset(self):
        async with self.test_session_maker() as session:
            admin = (await session.execute(select(User).where(User.telegram_id == "8634201356"))).scalar_one()
            foreign_preset = RulePreset(
                owner_user_id=admin.id,
                workspace_id=admin.active_workspace_id,
                name="Admin-only preset",
                action="turn_off",
                conditions=[],
            )
            session.add(foreign_preset)
            await session.commit()
            await session.refresh(foreign_preset)
            preset_id = foreign_preset.id

        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/accounts/act_1018756607700064/assign-rule",
                headers={**buyer_data},
                json={"preset_id": preset_id},
            )

        self.assertEqual(response.status_code, 404)

    async def test_delete_account(self):
        user_info = {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"}
        auth = await session_headers(self.test_session_maker, user_info)

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {**auth}

            del_resp = await client.delete("/api/accounts/act_1018756607700064", headers=headers)
            self.assertEqual(del_resp.status_code, 200)

            # Verify it's gone
            acc_resp = await client.get("/api/accounts", headers=headers)
            self.assertEqual(len(acc_resp.json()), 0)

    async def test_unauthorized_direct_access_blocked(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Request without a session
            resp = await client.get("/api/me")
            self.assertEqual(resp.status_code, 401)

    async def test_security_headers_present(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health/live")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.headers.get("x-content-type-options"), "nosniff")
            self.assertEqual(resp.headers.get("referrer-policy"), "strict-origin-when-cross-origin")
            self.assertEqual(resp.headers.get("x-xss-protection"), "1; mode=block")

    async def test_otp_request_rate_limiting(self):
        async with self.test_session_maker() as session:
            session.add(AllowedEmail(email="ratelimit@example.com", added_by="test"))
            await session.commit()

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("api.routers.auth.send_otp_verification_email", new=AsyncMock()):
                first = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": "ratelimit@example.com"},
                )
                self.assertEqual(first.status_code, 200)

                second = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": "ratelimit@example.com"},
                )
                self.assertEqual(second.status_code, 429)

    async def test_otp_request_delivery_failure_raises_502(self):
        async with self.test_session_maker() as session:
            session.add(AllowedEmail(email="deliveryfail@example.com", added_by="test"))
            await session.commit()

        transport = httpx.ASGITransport(app=self.app)
        orig_key = settings.RESEND_API_KEY
        settings.RESEND_API_KEY = "re_test_dummy_key"
        try:
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                with patch("api.routers.auth.send_otp_verification_email", new=AsyncMock(return_value=False)):
                    resp = await client.post(
                        "/api/auth/request-temporary-password",
                        json={"email": "deliveryfail@example.com"},
                    )
                    self.assertEqual(resp.status_code, 502)
                    self.assertIn("could not be delivered", resp.json()["detail"])
            async with self.test_session_maker() as session:
                user = (
                    await session.execute(
                        select(User).where(User.username == "deliveryfail@example.com")
                    )
                ).scalar_one_or_none()
                self.assertIsNone(user)
                otp = (
                    await session.execute(
                        select(EmailVerificationCode).where(
                            EmailVerificationCode.email == "deliveryfail@example.com"
                        )
                    )
                ).scalar_one()
                self.assertTrue(otp.is_used)
                self.assertIsNone(otp.delivered_at)
                self.assertEqual(otp.code, "")
                self.assertEqual(len(otp.code_hash), 64)
        finally:
            settings.RESEND_API_KEY = orig_key

    async def test_otp_brute_force_lockout(self):
        async with self.test_session_maker() as session:
            session.add(AllowedEmail(email="bruteforce@example.com", added_by="test"))
            await session.commit()

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("api.routers.auth.send_otp_verification_email", new=AsyncMock()):
                req = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": "bruteforce@example.com"},
                )
                self.assertEqual(req.status_code, 200)

            # 4 failed attempts
            for _ in range(4):
                failed = await client.post(
                    "/api/auth/verify-temporary-password",
                    json={"email": "bruteforce@example.com", "code": "000000"},
                )
                self.assertEqual(failed.status_code, 401)

            # 5th failed attempt locks out the OTP
            fifth = await client.post(
                "/api/auth/verify-temporary-password",
                json={"email": "bruteforce@example.com", "code": "000000"},
            )
            self.assertEqual(fifth.status_code, 401)
            self.assertIn("Too many incorrect code attempts", fifth.json()["detail"])

            # Verify the code is now marked is_used in the database
            async with self.test_session_maker() as session:
                code_record = (
                    await session.execute(
                        select(EmailVerificationCode).where(
                            EmailVerificationCode.email == "bruteforce@example.com"
                        )
                    )
                ).scalar_one()
                self.assertTrue(code_record.is_used)

    async def test_otp_is_consumed_once_and_user_is_created_only_after_verification(self):
        async with self.test_session_maker() as session:
            session.add(AllowedEmail(email="atomic@example.com", added_by="test"))
            await session.commit()

        delivered = {}

        async def capture_code(email, code, login_link):
            delivered[email] = code
            delivered["login_link"] = login_link
            return True

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("api.routers.auth.send_otp_verification_email", new=capture_code):
                requested = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": "atomic@example.com"},
                )
            self.assertEqual(requested.status_code, 200)

            async with self.test_session_maker() as session:
                pending_user = (
                    await session.execute(select(User).where(User.username == "atomic@example.com"))
                ).scalar_one_or_none()
                self.assertIsNone(pending_user)

            payload = {"email": "atomic@example.com", "code": delivered["atomic@example.com"]}
            first, second = await asyncio.gather(
                client.post("/api/auth/verify-temporary-password", json=payload),
                client.post("/api/auth/verify-temporary-password", json=payload),
            )
            self.assertEqual(sorted((first.status_code, second.status_code)), [200, 401])

            async with self.test_session_maker() as session:
                users = (
                    await session.execute(select(User).where(User.username == "atomic@example.com"))
                ).scalars().all()
                self.assertEqual(len(users), 1)
                self.assertIsNotNone(users[0].email_verified_at)

            # The code and link are two ways to consume the same credential.
            client.cookies.clear()
            link_token = urllib.parse.parse_qs(
                urllib.parse.urlsplit(delivered["login_link"]).query
            )["token"][0]
            replay = await client.post(
                "/api/auth/verify-email-link",
                json={"token": link_token},
            )
            self.assertEqual(replay.status_code, 401)

    async def test_magic_link_is_consumed_once_and_never_stored_in_plaintext(self):
        async with self.test_session_maker() as session:
            session.add(AllowedEmail(email="magic@example.com", added_by="test"))
            await session.commit()

        delivered = {}

        async def capture_message(email, code, login_link):
            delivered.update(email=email, code=code, login_link=login_link)
            return True

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("api.routers.auth.send_otp_verification_email", new=capture_message):
                requested = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": "magic@example.com"},
                )
            self.assertEqual(requested.status_code, 200)
            token = urllib.parse.parse_qs(
                urllib.parse.urlsplit(delivered["login_link"]).query
            )["token"][0]

            async with self.test_session_maker() as session:
                record = (
                    await session.execute(
                        select(EmailVerificationCode).where(
                            EmailVerificationCode.email == "magic@example.com"
                        )
                    )
                ).scalar_one()
                self.assertNotEqual(record.link_token_hash, token)
                self.assertEqual(len(record.link_token_hash), 64)

            verified = await client.post(
                "/api/auth/verify-email-link",
                json={"token": token},
            )
            self.assertEqual(verified.status_code, 200)
            self.assertIsNone(verified.json()["redirect_url"])

            client.cookies.clear()
            replay = await client.post(
                "/api/auth/verify-email-link",
                json={"token": token},
            )
            self.assertEqual(replay.status_code, 401)

    async def test_revoked_invite_invalidates_already_issued_login(self):
        token = "inv_login_context_1234567890"
        email = "invite-login@example.com"
        async with self.test_session_maker() as session:
            owner = (
                await session.execute(
                    select(User).where(User.telegram_id == "8948797431")
                )
            ).scalar_one()
            invite = WorkspaceInvite(
                workspace_id=self.ws_buyer_id,
                token=token,
                email=email,
                role="buyer",
                inviter_user_id=owner.id,
                status="pending",
                max_uses=1,
                used_count=0,
            )
            session.add(invite)
            await session.commit()

        delivered = {}

        async def capture_message(_email, code, _login_link):
            delivered["code"] = code
            return True

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("api.routers.auth.send_otp_verification_email", new=capture_message):
                requested = await client.post(
                    "/api/auth/request-temporary-password",
                    json={"email": email, "invite_token": token},
                )
            self.assertEqual(requested.status_code, 200)

            async with self.test_session_maker() as session:
                invite = (
                    await session.execute(
                        select(WorkspaceInvite).where(WorkspaceInvite.token == token)
                    )
                ).scalar_one()
                invite.status = "revoked"
                await session.commit()

            denied = await client.post(
                "/api/auth/verify-temporary-password",
                json={"email": email, "code": delivered["code"]},
            )
            self.assertEqual(denied.status_code, 403)

            async with self.test_session_maker() as session:
                user = (
                    await session.execute(select(User).where(User.username == email))
                ).scalar_one_or_none()
                self.assertIsNone(user)

    async def test_avatar_and_logo_disallow_svg(self):
        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            avatar_svg = await client.post(
                "/api/onboarding/avatar",
                headers=headers,
                files={"file": ("avatar.svg", b"<svg onload=alert(1)>", "image/svg+xml")},
            )
            self.assertEqual(avatar_svg.status_code, 400)

            logo_svg = await client.post(
                "/api/onboarding/workspace/logo",
                headers=headers,
                files={"file": ("logo.svg", b"<svg onload=alert(1)>", "image/svg+xml")},
            )
            self.assertEqual(logo_svg.status_code, 400)

            disguised_text = await client.post(
                "/api/onboarding/avatar",
                headers=headers,
                files={"file": ("avatar.png", b"this is not a png", "image/png")},
            )
            self.assertEqual(disguised_text.status_code, 400)

    async def test_image_uploads_are_canonical_owned_and_cleaned(self):
        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)

        png_buffer = io.BytesIO()
        png_metadata = PngImagePlugin.PngInfo()
        png_metadata.add_text("Comment", "must-be-removed")
        Image.new("RGBA", (48, 32), (20, 40, 60, 128)).save(
            png_buffer,
            format="PNG",
            pnginfo=png_metadata,
        )
        png_bytes = png_buffer.getvalue()

        with tempfile.TemporaryDirectory() as upload_root:
            with patch("services.image_uploads.UPLOADS_ROOT", Path(upload_root)):
                async with httpx.AsyncClient(
                    transport=transport,
                    base_url="http://test",
                ) as client:
                    mismatched = await client.post(
                        "/api/onboarding/avatar",
                        headers=headers,
                        files={"file": ("avatar.jpg", png_bytes, "image/jpeg")},
                    )
                    self.assertEqual(mismatched.status_code, 400)

                    first_avatar = await client.post(
                        "/api/onboarding/avatar",
                        headers=headers,
                        files={"file": ("avatar.png", png_bytes, "image/png")},
                    )
                    self.assertEqual(first_avatar.status_code, 200)
                    first_avatar_path = (
                        Path(upload_root)
                        / first_avatar.json()["avatar_url"].removeprefix("/uploads/")
                    )
                    self.assertTrue(first_avatar_path.is_file())
                    with Image.open(first_avatar_path) as stored_avatar:
                        self.assertEqual(stored_avatar.format, "PNG")
                        self.assertNotIn("Comment", stored_avatar.info)

                    second_avatar = await client.post(
                        "/api/onboarding/avatar",
                        headers=headers,
                        files={"file": ("avatar.png", png_bytes, "image/png")},
                    )
                    self.assertEqual(second_avatar.status_code, 200)
                    self.assertFalse(first_avatar_path.exists())

                    first_logo = await client.post(
                        "/api/onboarding/workspace/logo",
                        headers=headers,
                        files={"file": ("logo.png", png_bytes, "image/png")},
                    )
                    self.assertEqual(first_logo.status_code, 200)
                    first_logo_url = first_logo.json()["logo_url"]
                    first_logo_path = (
                        Path(upload_root) / first_logo_url.removeprefix("/uploads/")
                    )
                    os.utime(first_logo_path, (0, 0))

                    second_logo = await client.post(
                        "/api/onboarding/workspace/logo",
                        headers=headers,
                        files={"file": ("logo.png", png_bytes, "image/png")},
                    )
                    self.assertEqual(second_logo.status_code, 200)
                    self.assertFalse(first_logo_path.exists())
                    second_logo_url = second_logo.json()["logo_url"]
                    second_logo_path = (
                        Path(upload_root) / second_logo_url.removeprefix("/uploads/")
                    )

                    attach_logo = await client.patch(
                        f"/api/workspaces/{self.ws_buyer_id}",
                        headers=headers,
                        json={"logo_url": second_logo_url},
                    )
                    self.assertEqual(attach_logo.status_code, 200)
                    self.assertTrue(second_logo_path.exists())

                    third_logo = await client.post(
                        "/api/onboarding/workspace/logo",
                        headers=headers,
                        files={"file": ("logo.png", png_bytes, "image/png")},
                    )
                    self.assertEqual(third_logo.status_code, 200)
                    third_logo_url = third_logo.json()["logo_url"]
                    third_logo_path = (
                        Path(upload_root) / third_logo_url.removeprefix("/uploads/")
                    )
                    replace_logo = await client.patch(
                        f"/api/workspaces/{self.ws_buyer_id}",
                        headers=headers,
                        json={"logo_url": third_logo_url},
                    )
                    self.assertEqual(replace_logo.status_code, 200)
                    self.assertFalse(second_logo_path.exists())

                    foreign_logo = await client.patch(
                        f"/api/workspaces/{self.ws_buyer_id}",
                        headers=headers,
                        json={"logo_url": "/uploads/workspaces/logo_999_stolen.png"},
                    )
                    self.assertEqual(foreign_logo.status_code, 400)

                    unsafe_logo = await client.patch(
                        f"/api/workspaces/{self.ws_buyer_id}",
                        headers=headers,
                        json={"logo_url": "javascript:alert(1)"},
                    )
                    self.assertEqual(unsafe_logo.status_code, 422)

                    clear_logo = await client.patch(
                        f"/api/workspaces/{self.ws_buyer_id}",
                        headers=headers,
                        json={"logo_url": ""},
                    )
                    self.assertEqual(clear_logo.status_code, 200)
                    self.assertFalse(third_logo_path.exists())

    async def test_update_profile_avatar_url_validation(self):
        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Malicious schemes and XSS payloads must be rejected with 422
            for bad_avatar in (
                "javascript:alert(1)",
                "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
                'x" onerror="alert(1)',
                "<script>alert(1)</script>",
                "//evil.com/avatar.png",
                "ftp://example.com/avatar.png",
            ):
                res = await client.post(
                    "/api/auth/update-profile",
                    headers=headers,
                    json={"avatar_url": bad_avatar},
                )
                self.assertEqual(res.status_code, 422, f"Failed to reject bad avatar: {bad_avatar}")

            # 2. Valid remote URLs and empty string must succeed
            for good_avatar in (
                "https://cdn.example.com/avatar.png",
                "http://cdn.example.com/avatar.jpg",
                "",
            ):
                res = await client.post(
                    "/api/auth/update-profile",
                    headers=headers,
                    json={"avatar_url": good_avatar},
                )
                self.assertEqual(res.status_code, 200, f"Failed to accept good avatar: {good_avatar}")
                self.assertEqual(res.json()["avatar_url"], good_avatar)

            unowned_local_avatar = await client.post(
                "/api/auth/update-profile",
                headers=headers,
                json={"avatar_url": "/uploads/avatars/avatar_123_abc.webp"},
            )
            self.assertEqual(unowned_local_avatar.status_code, 400)

    async def test_update_profile_cannot_bypass_email_verification(self):
        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Direct modification of email in update-profile must be rejected
            res = await client.post(
                "/api/auth/update-profile",
                headers=headers,
                json={"email": "attacker@evil.com"},
            )
            self.assertEqual(res.status_code, 400)
            self.assertIn("Changing the email directly without confirmation is not allowed", res.json()["detail"])

    async def test_email_change_verify_before_activate_flow(self):
        buyer_data = await session_headers(self.test_session_maker, {"id": 8948797431, "first_name": "Nick", "username": "buyer_nick"})
        headers = {**buyer_data}
        delivered = {}

        async def capture_code(email, code):
            delivered[email] = code
            return True

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Request email change
            with patch("api.routers.auth.send_otp_verification_email", new=capture_code):
                req_res = await client.post(
                    "/api/auth/request-email-change",
                    headers=headers,
                    json={"new_email": "nick_new@example.com"},
                )
                self.assertEqual(req_res.status_code, 200)
                self.assertTrue(req_res.json()["ok"])
                self.assertEqual(req_res.json()["unconfirmed_email"], "nick_new@example.com")

            # Verify unconfirmed_email is saved on user
            async with self.test_session_maker() as session:
                user = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
                self.assertEqual(user.unconfirmed_email, "nick_new@example.com")
                self.assertIsNone(user.email_verified_at)

                otp = (
                    await session.execute(
                        select(EmailVerificationCode)
                        .where(EmailVerificationCode.email == "nick_new@example.com")
                        .order_by(EmailVerificationCode.id.desc())
                    )
                ).scalar_one()
                self.assertEqual(otp.code, "")
                self.assertEqual(len(otp.code_hash), 64)
                code = delivered["nick_new@example.com"]

            # 2. Try invalid code -> 400
            bad_verify = await client.post(
                "/api/auth/verify-email-change",
                headers=headers,
                json={"code": "999999"},
            )
            self.assertEqual(bad_verify.status_code, 400)

            # 3. Submit valid code -> 200 OK, email activated
            good_verify = await client.post(
                "/api/auth/verify-email-change",
                headers=headers,
                json={"code": code},
            )
            self.assertEqual(good_verify.status_code, 200)
            self.assertEqual(good_verify.json()["email"], "nick_new@example.com")
            self.assertTrue(good_verify.json()["email_verified"])

            # Verify DB state
            async with self.test_session_maker() as session:
                user = (await session.execute(select(User).where(User.telegram_id == "8948797431"))).scalar_one()
                self.assertEqual(user.email, "nick_new@example.com")
                self.assertIsNotNone(user.email_verified_at)
                self.assertIsNone(user.unconfirmed_email)

            # 4. Check /api/me returns email_verified = True
            me_res = await client.get("/api/me", headers=headers)
            self.assertEqual(me_res.status_code, 200)
            self.assertEqual(me_res.json()["email"], "nick_new@example.com")
            self.assertTrue(me_res.json()["email_verified"])

    async def test_existing_user_request_email_verification(self):
        async with self.test_session_maker() as session:
            old_user = User(
                telegram_id="8948797999",
                username="old_buyer",
                email="existing_unverified@corp.com",
                email_verified_at=None,
                role="buyer",
                is_approved=True,
            )
            session.add(old_user)
            await session.commit()

        user_data = await session_headers(self.test_session_maker, {"id": 8948797999, "first_name": "Old", "username": "old_buyer"})
        headers = {**user_data}
        delivered = {}

        async def capture_code(email, code):
            delivered[email] = code
            return True

        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch("api.routers.auth.send_otp_verification_email", new=capture_code):
                req_res = await client.post("/api/auth/request-email-verification", headers=headers)
                self.assertEqual(req_res.status_code, 200)

            async with self.test_session_maker() as session:
                otp = (
                    await session.execute(
                        select(EmailVerificationCode)
                        .where(EmailVerificationCode.email == "existing_unverified@corp.com")
                    )
                ).scalar_one()
                self.assertEqual(otp.code, "")
                code = delivered["existing_unverified@corp.com"]

            verify_res = await client.post(
                "/api/auth/verify-email-change",
                headers=headers,
                json={"code": code},
            )
            self.assertEqual(verify_res.status_code, 200)
            self.assertTrue(verify_res.json()["email_verified"])

            async with self.test_session_maker() as session:
                db_u = (await session.execute(select(User).where(User.username == "old_buyer"))).scalar_one()
                self.assertIsNotNone(db_u.email_verified_at)

    async def test_email_uniqueness_and_case_normalization(self):
        async with self.test_session_maker() as session:
            user1 = User(
                telegram_id="8948797111",
                username="user_one",
                email="unique_user@corp.com",
                email_verified_at=datetime.now(timezone.utc),
                role="buyer",
                is_approved=True,
            )
            user2 = User(
                telegram_id="8948797222",
                username="user_two",
                email="user2@corp.com",
                email_verified_at=datetime.now(timezone.utc),
                role="buyer",
                is_approved=True,
            )
            session.add_all([user1, user2])
            await session.commit()

        user2_data = await session_headers(self.test_session_maker, {"id": 8948797222, "first_name": "Two", "username": "user_two"})
        headers = {**user2_data}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # User 2 tries to claim User 1's email with different case / spaces -> 409 Conflict
            collision_res = await client.post(
                "/api/auth/request-email-change",
                headers=headers,
                json={"new_email": "  Unique_User@Corp.com  "},
            )
            self.assertEqual(collision_res.status_code, 409)
            self.assertIn("already in use by another user", collision_res.json()["detail"])
