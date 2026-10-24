"""Linear's bell on an ad account: /api/accounts/{id}/notifications decides which of its events reach Inbox."""

import unittest
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.rate_limit import limiter
from database.models import (
    Account,
    AccountNotificationSetting,
    AuditEvent,
    User,
    Workspace,
    WorkspaceMember,
)
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

OWNER = {"id": 7200000001, "first_name": "Owner", "username": "bell_owner"}
BUYER = {"id": 7200000002, "first_name": "Buyer", "username": "bell_buyer"}
ALL_KINDS = ["urgent", "rule_alerts", "rule_actions", "assistant", "manual", "system"]
ACCOUNT_EVENTS = {"account issue", "rule alert", "rule stop", "manual pause"}


class TestAccountNotifications(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        api_routes_module._summary_cache.clear()
        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        api_routes_module.async_session_maker = self.sessions
        api_auth_module.async_session_maker = self.sessions
        api_server_module.async_session_maker = self.sessions

        self.owner = await session_headers(self.sessions, OWNER)
        self.buyer = await session_headers(self.sessions, BUYER)
        now = datetime.now(timezone.utc)
        async with self.sessions() as session:
            users = {user.username: user for user in (await session.execute(select(User))).scalars().all()}
            owner, buyer = users["bell_owner"], users["bell_buyer"]
            ws = Workspace(name="Bell", slug="bell-ws", owner_user_id=owner.id)
            session.add(ws)
            await session.flush()
            buyer_member = WorkspaceMember(workspace_id=ws.id, user_id=buyer.id, role="buyer")
            session.add_all([WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role="owner"), buyer_member])
            for user in (owner, buyer):
                user.active_workspace_id = ws.id
                user.is_approved = True
            # The owner leads act_1, so by Inbox's own rule its events are theirs alone.
            session.add(Account(account_id="act_1", name="Nutra US", workspace_id=ws.id,
                                owner_user_id=owner.id, lead_user_id=owner.id))

            def event(message, event_type, **values):
                return AuditEvent(workspace_id=ws.id, event_type=event_type, message=message,
                                  created_at=now - timedelta(minutes=1), **values)

            session.add_all([
                event("account issue", "ACCOUNT_ISSUE", account_id="act_1", account_name="Nutra US"),
                event("rule alert", "NOTIFY_ONLY", account_id="act_1", account_name="Nutra US"),
                event("rule stop", "STOP", account_id="act_1", account_name="Nutra US"),
                event("manual pause", "MANUAL_PAUSE", account_id="act_1", account_name="Nutra US",
                      category="MANUAL_ACTION"),
                # On no account: everyone's, whatever the bell says.
                event("workspace note", "SYNC_DONE", account_id=""),
            ])
            await session.commit()
            self.ws_id = ws.id
            self.buyer_member_id = buyer_member.id

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def inbox(self, headers):
        response = await self.client.get("/api/inbox", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        return {item["message"] for item in response.json()["items"]}

    async def bell(self, headers, kinds=None, account="act_1"):
        url = f"/api/accounts/{account}/notifications"
        if kinds is None:
            return await self.client.get(url, headers=headers)
        return await self.client.put(url, headers=headers, json={"kinds": kinds})

    async def test_without_a_choice_the_bell_shows_inboxs_own_rule(self):
        owner = (await self.bell(self.owner)).json()
        self.assertEqual(owner, {"account_id": "act_1", "kinds": ALL_KINDS, "custom": False})
        buyer = (await self.bell(self.buyer)).json()
        self.assertEqual(buyer, {"account_id": "act_1", "kinds": [], "custom": False})
        self.assertEqual(await self.inbox(self.owner), ACCOUNT_EVENTS | {"workspace note"})
        self.assertEqual(await self.inbox(self.buyer), {"workspace note"})

    async def test_a_member_who_does_not_lead_the_account_follows_the_kinds_they_pick(self):
        saved = await self.bell(self.buyer, ["urgent", "rule_alerts"])
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json(), {"account_id": "act_1", "kinds": ["urgent", "rule_alerts"], "custom": True})
        self.assertEqual(await self.inbox(self.buyer), {"account issue", "rule alert", "workspace note"})
        # Their choice is theirs: the lead still gets everything.
        self.assertEqual(await self.inbox(self.owner), ACCOUNT_EVENTS | {"workspace note"})

        response = await self.client.get("/api/inbox/unread-count", headers=self.buyer)
        self.assertEqual(response.status_code, 200, response.text)

    async def test_the_lead_can_mute_kinds_and_events_on_no_account_stay(self):
        await self.bell(self.owner, ["urgent"])
        self.assertEqual(await self.inbox(self.owner), {"account issue", "workspace note"})
        await self.bell(self.owner, [])
        self.assertEqual((await self.bell(self.owner)).json()["kinds"], [])
        self.assertEqual(await self.inbox(self.owner), {"workspace note"})

        # Picking again replaces the earlier choice, one row per kind.
        await self.bell(self.owner, ["manual", "rule_actions"])
        self.assertEqual(await self.inbox(self.owner), {"rule stop", "manual pause", "workspace note"})
        async with self.sessions() as session:
            rows = (await session.execute(select(AccountNotificationSetting))).scalars().all()
        self.assertEqual(len(rows), len(ALL_KINDS))

    async def test_rejects_unknown_kinds_and_accounts(self):
        self.assertEqual((await self.bell(self.owner, ["team"])).status_code, 422)
        self.assertEqual((await self.bell(self.owner, ["everything"])).status_code, 422)
        self.assertEqual((await self.bell(self.owner, account="act_404")).status_code, 404)
        self.assertEqual((await self.bell(self.owner, ["urgent"], account="act_404")).status_code, 404)
        # Without the prefix it is the same account, as the other account routes accept.
        self.assertEqual((await self.bell(self.owner, account="1")).json()["account_id"], "act_1")

    async def test_leaving_the_workspace_drops_the_choice(self):
        await self.bell(self.buyer, ["urgent"])
        response = await self.client.post(f"/api/workspaces/{self.ws_id}/leave", json={}, headers=self.buyer)
        self.assertEqual(response.status_code, 200, response.text)
        async with self.sessions() as session:
            left = (
                await session.execute(
                    select(AccountNotificationSetting).where(
                        AccountNotificationSetting.member_id == self.buyer_member_id
                    )
                )
            ).scalars().all()
        self.assertEqual(left, [])


if __name__ == "__main__":
    unittest.main()
