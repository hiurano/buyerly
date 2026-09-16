import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from database.db import Base
from database.models import Account, AppSettings, AuditEvent, MetaConnection, User, Workspace, WorkspaceMember
from meta_api.client import (
    META_TOKEN_SUBCODE_MAP,
    MetaClient,
    MetaTokenAuthError,
    classify_meta_token_error,
)
from bot.notifier import TelegramNotifier
from scheduler.worker import MonitoringWorker


class TestMetaErrorSubcodesClassification(unittest.TestCase):
    """Tests for Meta API error subcode classification and MetaTokenAuthError creation."""

    def test_known_subcodes_mapping(self):
        """Every key Meta subcode is classified correctly."""
        expected_subcodes = {
            458: "APP_REVOKED",
            459: "CHECKPOINT",
            460: "PASSWORD_CHANGED",
            463: "SESSION_EXPIRED",
            464: "UNCONFIRMED_USER",
            467: "ACCESS_TOKEN_INVALIDATED",
            490: "LOGIN_APPROVAL_NEEDED",
            492: "DEVICE_SESSION_EXPIRED",
            1348001: "ACCOUNT_PERMISSION_DENIED",
        }
        for subcode, expected_key in expected_subcodes.items():
            error_data = {
                "code": 190,
                "error_subcode": subcode,
                "message": f"Test error for {subcode}",
                "error_user_msg": f"User message for {subcode}",
                "fbtrace_id": "test_trace_123",
            }
            err = classify_meta_token_error(error_data)
            self.assertIsInstance(err, PermissionError)
            self.assertIsInstance(err, MetaTokenAuthError)
            self.assertEqual(err.subcode, subcode)
            self.assertEqual(err.subcode_key, expected_key)
            self.assertTrue(bool(err.title))
            self.assertTrue(bool(err.description))
            self.assertTrue(bool(err.action_hint))
            self.assertEqual(err.error_user_msg, f"User message for {subcode}")
            self.assertEqual(err.fbtrace_id, "test_trace_123")

    def test_string_and_none_subcodes(self):
        """Type coercion is safe: a string subcode and None."""
        # String subcode "459"
        err_str = classify_meta_token_error({"code": 190, "error_subcode": "459", "message": "Checkpoint"})
        self.assertEqual(err_str.subcode, 459)
        self.assertEqual(err_str.subcode_key, "CHECKPOINT")

        # Missing subcode (None)
        err_none = classify_meta_token_error({"code": 190, "message": "Generic token error"})
        self.assertIsNone(err_none.subcode)
        self.assertEqual(err_none.subcode_key, "TOKEN_INVALID")

        # Invalid string in the subcode ("invalid")
        err_invalid = classify_meta_token_error({"code": 190, "error_subcode": "invalid"})
        self.assertIsNone(err_invalid.subcode)
        self.assertEqual(err_invalid.subcode_key, "TOKEN_INVALID")

    def test_permission_error_codes_10_and_200(self):
        """Codes 10 and 200 are classified as permission errors."""
        err_10 = classify_meta_token_error({"code": 10, "message": "Permission Denied"})
        self.assertEqual(err_10.code, 10)
        self.assertEqual(err_10.subcode_key, "ACCOUNT_PERMISSION_DENIED")
        self.assertIn("No permissions", err_10.title)

        err_200 = classify_meta_token_error({"code": 200, "message": "Permission Denied"})
        self.assertEqual(err_200.code, 200)
        self.assertEqual(err_200.subcode_key, "ACCOUNT_PERMISSION_DENIED")

    def test_code_102_api_session_invalid(self):
        """Code 102 is classified as an API session error."""
        err_102 = classify_meta_token_error({"code": 102, "message": "API Session Error"})
        self.assertEqual(err_102.code, 102)
        self.assertEqual(err_102.subcode_key, "API_SESSION_INVALID")


class TestTelegramNotifierSubcodes(unittest.IsolatedAsyncioTestCase):
    """Tests for TelegramNotifier message formatting with subcodes and XSS/HTML injection protection."""

    async def test_telegram_alert_formatting_with_checkpoint(self):
        """A checkpoint alert (subcode 459) is built with useful detail."""
        bot_mock = MagicMock()
        bot_mock.send_message = AsyncMock()
        notifier = TelegramNotifier(bot=bot_mock, target_chat_id="123456")
        notifier._save_event_log = AsyncMock()

        await notifier.send_alert(
            event_type="TOKEN_EXPIRED",
            account_name="Profit Ads 1",
            account_id="act_111222333",
            target_chat_id="123456",
            subcode=459,
            subcode_title="🔒 Checkpoint / profile ban",
            subcode_description="The Facebook profile was sent for a security review (selfie / documents)",
            action_hint="Open the profile in an antidetect browser and clear the checkpoint",
            user_msg="Your account has been temporarily locked.",
        )

        self.assertEqual(bot_mock.send_message.call_count, 1)
        _, kwargs = bot_mock.send_message.call_args
        text = kwargs["text"]
        self.assertIn("🔒 Checkpoint / profile ban", text)
        self.assertIn("(Subcode 459)", text)
        self.assertIn("antidetect browser", text)
        self.assertIn("temporarily locked", text)
        self.assertIn("Profit Ads 1", text)
        self.assertEqual(kwargs["parse_mode"], "HTML")

    async def test_telegram_alert_html_injection_safety(self):
        """HTML special characters are escaped in account_name and user_msg."""
        bot_mock = MagicMock()
        bot_mock.send_message = AsyncMock()
        notifier = TelegramNotifier(bot=bot_mock, target_chat_id="123456")
        notifier._save_event_log = AsyncMock()

        dangerous_name = "Agency <Media> & Co <script>alert(1)</script>"
        dangerous_msg = "Error validating <Token> & Session for user <12345>"

        await notifier.send_alert(
            event_type="TOKEN_EXPIRED",
            account_name=dangerous_name,
            account_id="act_999",
            target_chat_id="123456",
            subcode=463,
            subcode_title="⏳ Token expired",
            subcode_description="The 60-day lifetime expired",
            action_hint="Refresh the token",
            user_msg=dangerous_msg,
        )

        self.assertEqual(bot_mock.send_message.call_count, 1)
        _, kwargs = bot_mock.send_message.call_args
        text = kwargs["text"]
        self.assertNotIn("<script>", text)
        self.assertNotIn("<Token>", text)
        self.assertIn("&lt;script&gt;", text)
        self.assertIn("&lt;Media&gt;", text)
        self.assertIn("&amp; Co", text)
        self.assertIn("&lt;Token&gt; &amp; Session", text)

    async def test_telegram_alert_long_message_truncation(self):
        """An over-long Meta response is truncated (guarding the 4096-character limit)."""
        bot_mock = MagicMock()
        bot_mock.send_message = AsyncMock()
        notifier = TelegramNotifier(bot=bot_mock, target_chat_id="123456")
        notifier._save_event_log = AsyncMock()

        huge_error_msg = "A" * 1000

        await notifier.send_alert(
            event_type="TOKEN_EXPIRED",
            account_name="Test Account",
            account_id="act_123",
            target_chat_id="123456",
            subcode=460,
            subcode_title="🔑 Password changed",
            subcode_description="The password was changed",
            action_hint="Sign in again",
            user_msg=huge_error_msg,
        )

        _, kwargs = bot_mock.send_message.call_args
        text = kwargs["text"]
        # user_msg is truncated to 350 characters
        self.assertNotIn("A" * 500, text)
        self.assertIn("A" * 350, text)


from cryptography.fernet import Fernet
from core.config import settings
from core.meta_tokens import encrypt_meta_token
from tests.test_db_helper import create_test_engine, init_test_db
from sqlalchemy.ext.asyncio import AsyncSession


class TestMonitoringWorkerTokenErrorHandling(unittest.IsolatedAsyncioTestCase):
    """Integration tests for MetaTokenAuthError handling in MonitoringWorker."""

    async def asyncSetUp(self):
        self.original_key = settings.META_TOKEN_ENCRYPTION_KEY
        settings.META_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode("ascii")

        self.engine = create_test_engine()
        self.session_maker = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)

        import scheduler.worker as sw
        import database.db as db
        self.orig_sw_session_maker = getattr(sw, "async_session_maker", None)
        self.orig_db_session_maker = getattr(db, "async_session_maker", None)
        sw.async_session_maker = self.session_maker
        db.async_session_maker = self.session_maker

        async with self.session_maker() as session:
            user = User(
                username="buyer1",
                telegram_id="999888",
                role="admin",
                is_approved=True,
            )
            session.add(user)
            await session.flush()

            workspace = Workspace(
                name="Main Workspace",
                slug="main",
                owner_user_id=user.id,
            )
            session.add(workspace)
            await session.flush()

            session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
            user.active_workspace_id = workspace.id

            conn = MetaConnection(
                owner_user_id=user.id,
                workspace_id=workspace.id,
                provider_user_id="fb_user_1",
                provider_user_name="Facebook User",
                access_token_encrypted=encrypt_meta_token("mock_token_123"),
                status="active",
            )
            session.add(conn)
            await session.flush()

            account = Account(
                account_id="act_777888999",
                name="Scale Campaign 1",
                owner_user_id=user.id,
                workspace_id=workspace.id,
                meta_connection_id=conn.id,
                is_active=True,
                rules_enabled=True,
                account_status=1,
                currency="USD",
                timezone_name="UTC",
            )
            session.add(account)
            await session.commit()
            self.account_id = account.id
            self.conn_id = conn.id

    async def asyncTearDown(self):
        settings.META_TOKEN_ENCRYPTION_KEY = self.original_key
        import scheduler.worker as sw
        import database.db as db
        if self.orig_sw_session_maker:
            sw.async_session_maker = self.orig_sw_session_maker
        if self.orig_db_session_maker:
            db.async_session_maker = self.orig_db_session_maker
        await self.engine.dispose()

    async def test_worker_handles_checkpoint_subcode_in_snapshot(self):
        """On subcode 459 the worker deactivates the ad account, updates MetaConnection and saves an AuditEvent."""
        mock_meta = MagicMock()
        mock_error = MetaTokenAuthError(
            "Token expired or invalid: Checkpoint",
            code=190,
            subcode=459,
            subcode_key="CHECKPOINT",
            title="🔒 Checkpoint / profile ban",
            description="The Facebook profile was sent for a security review",
            action_hint="Use an antidetect browser and clear the checkpoint",
            error_user_msg="Please log in to continue.",
        )
        mock_meta.get_account_info = AsyncMock(side_effect=mock_error)
        mock_meta.get_adsets_and_insights = AsyncMock(return_value=[])

        sent_alerts = []
        async def mock_notifier(**kwargs):
            sent_alerts.append(kwargs)

        worker = MonitoringWorker(meta_client=mock_meta, telegram_notifier=mock_notifier)
        stats = await worker.run_cycle()

        # Alert delivery
        self.assertEqual(len(sent_alerts), 1)
        self.assertEqual(sent_alerts[0]["event_type"], "TOKEN_EXPIRED")
        self.assertEqual(sent_alerts[0]["subcode"], 459)
        self.assertIn("Checkpoint", sent_alerts[0]["subcode_title"])
        self.assertIn("antidetect", sent_alerts[0]["action_hint"])

        # Database state
        async with self.session_maker() as session:
            from sqlalchemy import select
            acc = (await session.execute(select(Account).where(Account.id == self.account_id))).scalar_one()
            self.assertFalse(acc.is_active)

            conn = (await session.execute(select(MetaConnection).where(MetaConnection.id == self.conn_id))).scalar_one()
            self.assertEqual(conn.status, "error")
            self.assertIn("security review", conn.last_error)

            audit = (await session.execute(select(AuditEvent).where(AuditEvent.account_id == "act_777888999"))).scalar_one()
            self.assertEqual(audit.event_type, "TOKEN_EXPIRED")
            self.assertEqual(audit.status, "ERROR")
            details = audit.details if isinstance(audit.details, dict) else json.loads(audit.details)
            self.assertEqual(details["error_subcode"], 459)
            self.assertEqual(details["subcode_key"], "CHECKPOINT")


if __name__ == "__main__":
    unittest.main()
