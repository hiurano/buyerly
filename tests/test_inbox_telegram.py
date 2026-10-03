import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
import core.telegram as telegram
import database.db as database_db
import services.inbox_telegram as inbox_telegram
from api.server import create_app
from core.config import settings
from core.rate_limit import limiter
from database.models import (
    AuditEvent,
    InboxNotificationState,
    InboxTelegramDelivery,
    TelegramConnection,
    TelegramLinkToken,
    User,
    Workspace,
    WorkspaceMember,
)
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

OWNER = {"id": 7200000001, "first_name": "Owner", "username": "tg_owner"}
BUYER = {"id": 7200000002, "first_name": "Buyer", "username": "tg_buyer"}
ALL_KINDS = ["urgent", "rule_alerts", "rule_actions", "assistant", "manual", "team", "system"]


class FakeTelegram:
    def __init__(self, result=None):
        self.sent = []
        self.result = result or telegram.SendResult(ok=True)

    async def __call__(self, chat_id, text, button=None):
        self.sent.append({"chat_id": chat_id, "text": text, "button": button})
        return self.result


class TestTelegram(unittest.IsolatedAsyncioTestCase):
    """Connect a personal Telegram by a one-time link, then get unread Inbox notifications there."""

    async def asyncSetUp(self):
        api_routes_module._summary_cache.clear()
        await limiter.reset()
        self.engine = create_test_engine()
        self.session_maker = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        api_routes_module.async_session_maker = self.session_maker
        api_auth_module.async_session_maker = self.session_maker
        api_server_module.async_session_maker = self.session_maker
        settings.ADMIN_CHAT_ID = "1"
        self.saved = (settings.TELEGRAM_BOT_TOKEN, settings.WEBAPP_URL, telegram._bot_username)
        settings.TELEGRAM_BOT_TOKEN = "123:test-token"
        settings.WEBAPP_URL = "https://app.example.test"
        telegram._bot_username = "buyerly_test_bot"

        self.replies = FakeTelegram()
        original_send = telegram.send_message
        telegram.send_message = self.replies
        self.addCleanup(setattr, telegram, "send_message", original_send)
        original_webhook = telegram.register_webhook

        async def no_webhook():
            return False

        telegram.register_webhook = no_webhook
        self.addCleanup(setattr, telegram, "register_webhook", original_webhook)

        self.owner_headers = await session_headers(self.session_maker, OWNER)
        self.buyer_headers = await session_headers(self.session_maker, BUYER)
        self.now = datetime.now(timezone.utc)
        async with self.session_maker() as session:
            users = {user.username: user for user in (await session.execute(select(User))).scalars().all()}
            self.owner, self.buyer = users["tg_owner"], users["tg_buyer"]
            self.workspace = Workspace(name="Acme", slug="acme", owner_user_id=self.owner.id)
            session.add(self.workspace)
            await session.flush()
            old_mark = self.now - timedelta(days=1)
            self.owner_member = WorkspaceMember(
                workspace_id=self.workspace.id, user_id=self.owner.id, role="owner", inbox_read_before=old_mark
            )
            self.buyer_member = WorkspaceMember(
                workspace_id=self.workspace.id, user_id=self.buyer.id, role="buyer", inbox_read_before=old_mark
            )
            session.add_all([self.owner_member, self.buyer_member])
            for user in (self.owner, self.buyer):
                user.active_workspace_id = self.workspace.id
                user.is_approved = True
            await session.commit()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://test")

    async def asyncTearDown(self):
        settings.TELEGRAM_BOT_TOKEN, settings.WEBAPP_URL, telegram._bot_username = self.saved
        await self.client.aclose()
        await self.engine.dispose()
        # The routers' own pool would otherwise carry connections into the next test's loop.
        await database_db.engine.dispose()

    async def webhook(self, update_body, secret=None):
        return await self.client.post(
            "/api/telegram/webhook",
            json=update_body,
            headers={"X-Telegram-Bot-Api-Secret-Token": secret or telegram.webhook_secret()},
        )

    def start(self, text, chat_id=555, username="acme_tg", chat_type="private"):
        return {
            "update_id": 1,
            "message": {
                "message_id": 1,
                "chat": {"id": chat_id, "type": chat_type},
                "from": {"id": chat_id, "username": username, "first_name": "Acme"},
                "text": text,
            },
        }

    async def link_token(self, headers):
        response = await self.client.post("/api/telegram/link", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        url = urlparse(response.json()["url"])
        self.assertEqual(url.netloc + url.path, "t.me/buyerly_test_bot")
        return parse_qs(url.query)["start"][0]

    async def connect(self, headers=None, chat_id=555):
        token = await self.link_token(headers or self.owner_headers)
        response = await self.webhook(self.start(f"/start {token}", chat_id=chat_id))
        self.assertEqual(response.status_code, 200)
        return token

    async def connection(self, headers=None):
        response = await self.client.get("/api/telegram/connection", headers=headers or self.owner_headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_start_with_the_link_connects_once_and_turns_the_channel_on(self):
        self.assertEqual(
            await self.connection(),
            {
                "available": True, "connected": False, "username": None, "first_name": None,
                "connected_at": None, "error": None,
            },
        )
        token = await self.connect()
        body = await self.connection()
        self.assertTrue(body["connected"])
        self.assertEqual((body["username"], body["first_name"], body["error"]), ("acme_tg", "Acme", None))
        self.assertIn("connected to <b>Acme</b>", self.replies.sent[-1]["text"])
        channels = (await self.client.get("/api/notifications/channels", headers=self.owner_headers)).json()
        self.assertEqual(channels["telegram"], {"enabled": True, "priority_only": False, "kinds": ALL_KINDS})
        # Only this member is connected.
        self.assertFalse((await self.connection(self.buyer_headers))["connected"])

        # The same link a second time: nothing changes, the bot says it expired.
        await self.webhook(self.start(f"/start {token}", chat_id=999, username="someone_else"))
        self.assertEqual((await self.connection())["username"], "acme_tg")
        self.assertIn("expired or was already used", self.replies.sent[-1]["text"])

    async def test_expired_and_replaced_links_do_not_connect(self):
        old = await self.link_token(self.owner_headers)
        newer = await self.link_token(self.owner_headers)
        await self.webhook(self.start(f"/start {old}"))
        self.assertFalse((await self.connection())["connected"])

        async with self.session_maker() as session:
            await session.execute(
                update(TelegramLinkToken).values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
            )
            await session.commit()
        await self.webhook(self.start(f"/start {newer}"))
        self.assertFalse((await self.connection())["connected"])

    async def test_bot_ignores_everything_but_links_and_strangers_without_the_secret(self):
        token = await self.link_token(self.owner_headers)
        for text in ("hello", "/start", "/help"):
            await self.webhook(self.start(text))
        # A link sent from a group is not a personal account.
        await self.webhook(self.start(f"/start {token}", chat_type="group"))
        self.assertEqual(self.replies.sent, [])
        self.assertFalse((await self.connection())["connected"])

        response = await self.webhook(self.start(f"/start {token}"), secret="wrong")
        self.assertEqual(response.status_code, 404)
        self.assertFalse((await self.connection())["connected"])

    async def test_disconnect_forgets_the_account(self):
        await self.connect()
        response = await self.client.delete("/api/telegram/connection", headers=self.owner_headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse((await self.connection())["connected"])

    async def test_without_a_bot_token_there_is_nothing_to_connect(self):
        settings.TELEGRAM_BOT_TOKEN = ""
        self.assertFalse((await self.connection())["available"])
        response = await self.client.post("/api/telegram/link", headers=self.owner_headers)
        self.assertEqual(response.status_code, 503)

    async def add_event(self, minutes_ago=1, **values):
        async with self.session_maker() as session:
            event = AuditEvent(
                workspace_id=self.workspace.id,
                event_type=values.pop("event_type", "NOTIFY_ONLY"),
                account_id="act_1",
                account_name="Main <account>",
                entity_name="Ad set 7",
                message=values.pop("message", "CPL above 3"),
                created_at=self.now - timedelta(minutes=minutes_ago),
                **values,
            )
            session.add(event)
            await session.commit()
            return event

    async def deliver(self, result=None):
        fake = FakeTelegram(result)
        await inbox_telegram.deliver_inbox_telegram(session_maker=self.session_maker, send=fake, pause_seconds=0)
        return fake

    async def test_unread_notification_goes_to_telegram_once_right_away(self):
        await self.connect()
        event = await self.add_event(minutes_ago=0)
        fake = await self.deliver()
        self.assertEqual(len(fake.sent), 1)
        message = fake.sent[0]
        self.assertEqual(message["chat_id"], 555)
        self.assertEqual(
            message["text"], "<b>Rule alert</b> · Ad set 7\nCPL above 3\nMain &lt;account&gt; · Acme"
        )
        self.assertEqual(
            message["button"], ("Open in Buyerly", f"https://app.example.test/acme/inbox/{event.id}")
        )
        self.assertEqual((await self.deliver()).sent, [])
        async with self.session_maker() as session:
            row = (await session.execute(select(InboxTelegramDelivery))).scalar_one()
        self.assertIsNotNone(row.sent_at)

    async def test_follows_the_telegram_settings_and_read_state(self):
        # Not connected: nothing, even with the channel on.
        await self.client.put(
            "/api/notifications/channels",
            headers=self.buyer_headers,
            json={"telegram": {"enabled": True, "kinds": ALL_KINDS}},
        )
        await self.add_event(message="for nobody yet")
        self.assertEqual((await self.deliver()).sent, [])

        await self.connect()
        await self.client.put(
            "/api/notifications/channels",
            headers=self.owner_headers,
            json={"telegram": {"enabled": True, "kinds": ["urgent"]}},
        )
        await self.add_event(event_type="NOTIFY_ONLY", message="alert is off")
        await self.add_event(event_type="TOKEN_EXPIRED", message="urgent")
        read = await self.add_event(event_type="TOKEN_EXPIRED", message="already read")
        async with self.session_maker() as session:
            session.add(InboxNotificationState(user_id=self.owner.id, audit_event_id=read.id, is_read=True))
            await session.commit()
        fake = await self.deliver()
        self.assertEqual([item["text"].split("\n")[1] for item in fake.sent], ["urgent"])

        await self.client.put(
            "/api/notifications/channels", headers=self.owner_headers, json={"telegram": {"enabled": False}}
        )
        await self.add_event(event_type="TOKEN_EXPIRED", message="channel off")
        self.assertEqual((await self.deliver()).sent, [])

    async def test_blocked_bot_is_shown_and_delivery_resumes_after_unblock(self):
        await self.connect()
        await self.add_event(message="first")
        await self.add_event(message="second")
        fake = await self.deliver(telegram.SendResult(ok=False, unreachable=True, error="Forbidden: bot was blocked"))
        # It stops at the first failure and keeps nothing as sent.
        self.assertEqual(len(fake.sent), 1)
        self.assertEqual((await self.connection())["error"], "blocked")
        self.assertEqual((await self.deliver()).sent, [])

        await self.webhook({
            "update_id": 2,
            "my_chat_member": {
                "chat": {"id": 555, "type": "private"},
                "new_chat_member": {"status": "member"},
            },
        })
        self.assertIsNone((await self.connection())["error"])
        self.assertEqual(len((await self.deliver()).sent), 2)

        await self.webhook({
            "update_id": 3,
            "my_chat_member": {
                "chat": {"id": 555, "type": "private"},
                "new_chat_member": {"status": "kicked"},
            },
        })
        self.assertEqual((await self.connection())["error"], "blocked")

    async def test_failed_send_is_retried_later(self):
        await self.connect()
        await self.add_event()
        fake = await self.deliver(telegram.SendResult(ok=False, error="Too Many Requests", retry_after=3))
        self.assertEqual(len(fake.sent), 1)
        async with self.session_maker() as session:
            self.assertEqual((await session.execute(select(InboxTelegramDelivery))).all(), [])
            connection = (await session.execute(select(TelegramConnection))).scalar_one()
        self.assertIsNone(connection.delivery_error)
        self.assertEqual(len((await self.deliver()).sent), 1)


if __name__ == "__main__":
    unittest.main()
