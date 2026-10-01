import re
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import services.inbox_email as inbox_email
from core.config import settings
from database.models import (
    AuditEvent,
    InboxEmailDelivery,
    InboxNotificationState,
    User,
    Workspace,
    WorkspaceMember,
)
from tests.test_db_helper import create_test_engine, init_test_db

ROOT = Path(__file__).resolve().parent.parent


class FakeMail:
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    async def __call__(self, **email):
        if self.fail:
            raise RuntimeError("mail service is down")
        self.sent.append(email)
        return True


class TestInboxEmail(unittest.IsolatedAsyncioTestCase):
    """Emails go only about notifications still unread after the pause, per member settings."""

    async def asyncSetUp(self):
        self.engine = create_test_engine()
        self.session_maker = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        self.webapp_url = settings.WEBAPP_URL
        settings.WEBAPP_URL = "https://app.example.test/"
        self.now = datetime.now(timezone.utc)
        async with self.session_maker() as session:
            self.owner = User(username="mail_owner", email="owner@example.test", is_approved=True)
            self.buyer = User(username="mail_buyer", email="buyer@example.test", is_approved=True)
            self.no_email = User(username="mail_none", email=None, is_approved=True)
            session.add_all([self.owner, self.buyer, self.no_email])
            await session.flush()
            self.workspace = Workspace(name="Uncle", slug="uncle", owner_user_id=self.owner.id)
            session.add(self.workspace)
            await session.flush()
            old_mark = self.now - timedelta(days=1)
            self.owner_member = WorkspaceMember(
                workspace_id=self.workspace.id, user_id=self.owner.id, role="owner", inbox_read_before=old_mark
            )
            self.buyer_member = WorkspaceMember(
                workspace_id=self.workspace.id, user_id=self.buyer.id, role="buyer", inbox_read_before=old_mark
            )
            session.add_all([
                self.owner_member,
                self.buyer_member,
                WorkspaceMember(
                    workspace_id=self.workspace.id, user_id=self.no_email.id, role="buyer", inbox_read_before=old_mark
                ),
            ])
            await session.commit()

    async def asyncTearDown(self):
        settings.WEBAPP_URL = self.webapp_url
        await self.engine.dispose()

    async def add_event(self, minutes_ago=10, **values):
        async with self.session_maker() as session:
            event = AuditEvent(
                workspace_id=self.workspace.id,
                event_type=values.pop("event_type", "NOTIFY_ONLY"),
                account_id="act_1",
                account_name=values.pop("account_name", "Main account"),
                entity_name=values.pop("entity_name", "Ad set 7"),
                message=values.pop("message", "CPL above 3"),
                created_at=self.now - timedelta(minutes=minutes_ago),
                **values,
            )
            session.add(event)
            await session.commit()
            return event

    async def set_member(self, member, **values):
        async with self.session_maker() as session:
            await session.execute(
                update(WorkspaceMember).where(WorkspaceMember.id == member.id).values(**values)
            )
            await session.commit()

    async def set_state(self, user, event, **values):
        async with self.session_maker() as session:
            session.add(InboxNotificationState(user_id=user.id, audit_event_id=event.id, **values))
            await session.commit()

    async def run_delivery(self, mail=None):
        mail = mail or FakeMail()
        await inbox_email.deliver_inbox_emails(
            session_maker=self.session_maker, send=mail, pause_seconds=0
        )
        return mail

    def recipients(self, mail):
        return sorted(email["to_email"] for email in mail.sent)

    async def test_unread_notification_is_emailed_once_with_a_link_to_it(self):
        event = await self.add_event(event_type="NOTIFY_ONLY", rule_id=None, rule_name="CPL guard")
        mail = await self.run_delivery()
        # The member without an email address is skipped.
        self.assertEqual(self.recipients(mail), ["buyer@example.test", "owner@example.test"])
        email = next(item for item in mail.sent if item["to_email"] == "owner@example.test")
        self.assertEqual(email["title"], "Rule alert")
        self.assertEqual(email["target"], "Ad set 7")
        self.assertEqual(email["account_name"], "Main account")
        self.assertEqual(email["message"], "CPL above 3")
        self.assertEqual(email["workspace_name"], "Uncle")
        self.assertEqual(email["url"], f"https://app.example.test/uncle/inbox/{event.id}")
        self.assertEqual(email["settings_url"], "https://app.example.test/uncle/settings/account/notifications/email")

        again = await self.run_delivery()
        self.assertEqual(again.sent, [])
        async with self.session_maker() as session:
            rows = (await session.execute(select(InboxEmailDelivery))).scalars().all()
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row.sent_at is not None for row in rows))

    async def test_waits_before_sending_and_skips_stale_events(self):
        await self.add_event(minutes_ago=1, message="too fresh")
        stale = inbox_email.EMAIL_DELAY + inbox_email.EMAIL_LOOKBACK + timedelta(minutes=1)
        await self.add_event(minutes_ago=stale.total_seconds() / 60, message="stale")
        self.assertEqual((await self.run_delivery()).sent, [])

    async def test_read_deleted_or_snoozed_notifications_are_not_emailed(self):
        read = await self.add_event(message="read")
        deleted = await self.add_event(message="deleted")
        snoozed = await self.add_event(message="snoozed")
        await self.set_state(self.owner, read, is_read=True)
        await self.set_state(self.owner, deleted, deleted_at=self.now)
        await self.set_state(self.owner, snoozed, snoozed_until=self.now + timedelta(days=1))
        mail = await self.run_delivery()
        owner_messages = [item["message"] for item in mail.sent if item["to_email"] == "owner@example.test"]
        self.assertEqual(owner_messages, [])
        # The buyer has not touched them, so all three reach the buyer.
        buyer_messages = sorted(item["message"] for item in mail.sent if item["to_email"] == "buyer@example.test")
        self.assertEqual(buyer_messages, ["deleted", "read", "snoozed"])

    async def test_own_actions_and_events_before_the_read_mark_are_not_emailed(self):
        await self.add_event(actor_type="user", actor_id=str(self.owner.id), event_type="MANUAL_PAUSE")
        await self.set_member(self.buyer_member, inbox_read_before=self.now)
        self.assertEqual((await self.run_delivery()).sent, [])

    async def test_email_switched_off_or_kind_switched_off(self):
        await self.add_event(event_type="NOTIFY_ONLY", message="alert")
        await self.add_event(event_type="ACCOUNT_HEALTH_ALERT", message="urgent")
        await self.set_member(
            self.owner_member,
            notification_channels={"email": {"enabled": False, "priority_only": False, "kinds": ["urgent", "rule_alerts"]}},
        )
        await self.set_member(
            self.buyer_member,
            notification_channels={"email": {"enabled": True, "priority_only": False, "kinds": ["urgent"]}},
        )
        mail = await self.run_delivery()
        self.assertEqual([(item["to_email"], item["message"]) for item in mail.sent], [("buyer@example.test", "urgent")])

        await self.set_member(
            self.buyer_member,
            notification_channels={"email": {"enabled": True, "priority_only": False, "kinds": []}},
        )
        await self.add_event(event_type="ACCOUNT_HEALTH_ALERT", message="urgent again")
        self.assertEqual((await self.run_delivery()).sent, [])

    async def test_only_priority_notifications_follows_the_priority_inbox(self):
        await self.add_event(event_type="NOTIFY_ONLY", message="alert")
        await self.add_event(event_type="MANUAL_PAUSE", actor_type="user", actor_id="someone", message="manual")
        await self.add_event(event_type="ACCOUNT_DAY_STARTED", message="system")
        only_priority = {"email": {"enabled": True, "priority_only": True, "kinds": ["system"]}}
        # Priority inbox on: rule alerts by type, manual pauses by a custom filter; the email kinds do not apply.
        await self.set_member(
            self.owner_member,
            notification_channels=only_priority,
            inbox_display={
                "priority_inbox": True,
                "priority_kinds": ["rule_alerts"],
                "priority_rules": [[{"field": "type", "operator": "is", "values": ["MANUAL_PAUSE"]}]],
            },
        )
        # Priority inbox off: "Only deliver priority notifications" does not count, the kinds do.
        await self.set_member(
            self.buyer_member,
            notification_channels=only_priority,
            inbox_display={"priority_inbox": False, "priority_kinds": ["rule_alerts"]},
        )
        mail = await self.run_delivery()
        by_member = {
            email: sorted(item["message"] for item in mail.sent if item["to_email"] == email)
            for email in ("owner@example.test", "buyer@example.test")
        }
        self.assertEqual(by_member, {"owner@example.test": ["alert", "manual"], "buyer@example.test": ["system"]})

    async def test_mail_failure_is_retried_later_and_never_raises(self):
        await self.add_event()
        failing = await self.run_delivery(FakeMail(fail=True))
        self.assertEqual(failing.sent, [])
        async with self.session_maker() as session:
            self.assertEqual((await session.execute(select(InboxEmailDelivery))).scalars().all(), [])
        mail = await self.run_delivery()
        self.assertEqual(self.recipients(mail), ["buyer@example.test", "owner@example.test"])

    async def test_tick_swallows_errors(self):
        async def broken(**_):
            raise RuntimeError("database is down")

        original = inbox_email.deliver_inbox_emails
        inbox_email.deliver_inbox_emails = broken
        try:
            await inbox_email.run_inbox_email_tick()
        finally:
            inbox_email.deliver_inbox_emails = original


class TestInboxEmailTitles(unittest.TestCase):
    def test_titles_match_the_inbox_rows(self):
        source = (ROOT / "frontend/src/lib/audit.ts").read_text()
        block = source.split("const AUDIT_EVENT_TITLES: Record<string, string> = {", 1)[1].split("};", 1)[0]
        frontend = {
            key: value
            for key, value in re.findall(r"^\s*([A-Z_]+): ['\"](.+?)['\"],$", block, re.MULTILINE)
        }
        self.assertEqual(frontend, inbox_email.EVENT_TITLES)

    def test_unknown_types_are_humanized_like_the_frontend(self):
        event = AuditEvent(event_type="META_INVITE_SENT", action="", category="TEAM")
        self.assertEqual(inbox_email.event_title(event), "Meta Invite Sent")


class TestInboxEmailLayout(unittest.IsolatedAsyncioTestCase):
    async def test_email_names_the_event_escapes_text_and_links_to_it(self):
        import core.email as email_module

        captured = {}

        async def fake_send(to_email, subject, html_content, text_content=None):
            captured.update(to=to_email, subject=subject, html=html_content, text=text_content)
            return True

        original = email_module.send_email
        email_module.send_email = fake_send
        try:
            await email_module.send_inbox_notification_email(
                to_email="uncle@example.test",
                workspace_name="Uncle",
                title="Rule alert",
                target="Ad set <7>",
                account_name="Main account",
                message="CPL above 3 & rising",
                url="https://app.example.test/uncle/inbox/5",
                settings_url="https://app.example.test/uncle/settings/account/notifications/email",
            )
        finally:
            email_module.send_email = original
        # As in Linear, the subject is the heading.
        self.assertEqual(captured["subject"], "Rule alert: Ad set <7>")
        self.assertIn("Rule alert: Ad set &lt;7&gt;</h1>", captured["html"])
        self.assertIn("Main account · Uncle", captured["html"])
        self.assertIn("CPL above 3 &amp; rising", captured["html"])
        self.assertIn('href="https://app.example.test/uncle/inbox/5"', captured["html"])
        self.assertIn(">Open your Inbox</a>", captured["html"])
        self.assertIn(">Unsubscribe</a>", captured["html"])
        self.assertIn("Open your Inbox: https://app.example.test/uncle/inbox/5", captured["text"])


if __name__ == "__main__":
    unittest.main()
