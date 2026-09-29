import unittest
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.config import settings
from core.rate_limit import limiter
from database.models import AuditEvent, User, Workspace, WorkspaceMember
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

OWNER = {"id": 7100000001, "first_name": "Owner", "username": "inbox_owner"}
BUYER = {"id": 7100000002, "first_name": "Buyer", "username": "inbox_buyer"}
OUTSIDER = {"id": 7100000003, "first_name": "Outsider", "username": "inbox_outsider"}


class TestInbox(unittest.IsolatedAsyncioTestCase):
    """Inbox read, delete and snooze state is per member, on top of shared audit events."""

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

        self.owner_headers = await session_headers(self.session_maker, OWNER)
        self.buyer_headers = await session_headers(self.session_maker, BUYER)
        self.outsider_headers = await session_headers(self.session_maker, OUTSIDER)
        now = datetime.now(timezone.utc)
        async with self.session_maker() as session:
            users = {
                user.username: user
                for user in (await session.execute(select(User))).scalars().all()
            }
            owner, buyer, outsider = (
                users["inbox_owner"], users["inbox_buyer"], users["inbox_outsider"]
            )
            workspace = Workspace(name="Inbox", slug="inbox-ws", owner_user_id=owner.id)
            other = Workspace(name="Other", slug="other-ws", owner_user_id=outsider.id)
            session.add_all([workspace, other])
            await session.flush()
            old_mark = now - timedelta(days=2)
            session.add_all([
                WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="owner", inbox_read_before=old_mark),
                WorkspaceMember(workspace_id=workspace.id, user_id=buyer.id, role="buyer", inbox_read_before=old_mark),
                WorkspaceMember(workspace_id=other.id, user_id=outsider.id, role="owner", inbox_read_before=old_mark),
            ])
            for user, ws in ((owner, workspace), (buyer, workspace), (outsider, other)):
                user.active_workspace_id = ws.id
                user.is_approved = True

            def event(minutes_ago, **values):
                return AuditEvent(
                    workspace_id=values.pop("workspace_id", workspace.id),
                    event_type=values.pop("event_type", "STOP"),
                    account_id="act_1",
                    account_name="Account",
                    message=values.pop("message", ""),
                    created_at=now - timedelta(minutes=minutes_ago),
                    **values,
                )

            self.before_mark = event(60 * 72, message="before mark")
            self.rule_stop = event(30, message="rule stop")
            self.rule_alert = event(20, event_type="NOTIFY_ONLY", message="rule alert")
            self.own_change = event(
                10, actor_type="user", actor_id=str(OWNER["id"]), message="owner change"
            )
            self.other_workspace = event(5, workspace_id=other.id, message="other workspace")
            session.add_all([
                self.before_mark, self.rule_stop, self.rule_alert, self.own_change, self.other_workspace,
            ])
            await session.commit()
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=create_app()), base_url="http://test"
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def inbox(self, headers, **params):
        response = await self.client.get("/api/inbox", headers=headers, params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def read_map(self, body):
        return {item["message"]: item["is_read"] for item in body["items"]}

    async def test_new_events_are_unread_except_old_ones_and_your_own(self):
        body = await self.inbox(self.owner_headers)
        self.assertEqual(
            self.read_map(body),
            {"owner change": True, "rule alert": False, "rule stop": False, "before mark": True},
        )
        self.assertEqual(body["unread_count"], 2)
        # The buyer did not make the owner's change, so it is unread for them.
        buyer = await self.inbox(self.buyer_headers)
        self.assertEqual(buyer["unread_count"], 3)

    async def test_read_state_is_per_member(self):
        response = await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/read", headers=self.owner_headers, json={"read": True}
        )
        self.assertEqual(response.json()["unread_count"], 1)
        self.assertEqual((await self.inbox(self.buyer_headers))["unread_count"], 3)

        await self.client.post(
            f"/api/inbox/{self.before_mark.id}/read", headers=self.owner_headers, json={"read": False}
        )
        body = await self.inbox(self.owner_headers, unread_only="true")
        self.assertEqual([item["message"] for item in body["items"]], ["rule alert", "before mark"])

    async def test_delete_hides_only_for_that_member_and_keeps_the_event(self):
        await self.client.post(f"/api/inbox/{self.rule_alert.id}/delete", headers=self.owner_headers)
        owner = await self.inbox(self.owner_headers)
        self.assertNotIn("rule alert", self.read_map(owner))
        self.assertEqual(owner["unread_count"], 1)
        self.assertIn("rule alert", self.read_map(await self.inbox(self.buyer_headers)))
        history = await self.client.get("/api/audit-events", headers=self.owner_headers)
        self.assertIn("rule alert", [item["message"] for item in history.json()["items"]])

    async def test_snooze_hides_until_the_time_and_returns_unread(self):
        await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/read", headers=self.owner_headers, json={"read": True}
        )
        until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        response = await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/snooze", headers=self.owner_headers, json={"until": until}
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("rule stop", self.read_map(await self.inbox(self.owner_headers)))
        snoozed = await self.inbox(self.owner_headers, show_snoozed="true")
        item = next(entry for entry in snoozed["items"] if entry["message"] == "rule stop")
        self.assertFalse(item["is_read"])
        self.assertIsNotNone(item["snoozed_until"])
        # Snoozed notifications stay out of the unread count until they come back.
        self.assertEqual(snoozed["unread_count"], 1)

        past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        refused = await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/snooze", headers=self.owner_headers, json={"until": past}
        )
        self.assertEqual(refused.status_code, 400)

    async def test_delete_all_read_keeps_unread(self):
        await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/read", headers=self.owner_headers, json={"read": True}
        )
        await self.client.post(
            f"/api/inbox/{self.before_mark.id}/read", headers=self.owner_headers, json={"read": False}
        )
        response = await self.client.post("/api/inbox/delete-all-read", headers=self.owner_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.read_map(await self.inbox(self.owner_headers)),
            {"rule alert": False, "before mark": False},
        )
        # Reading one afterwards must not make it vanish with the old read ones.
        await self.client.post(
            f"/api/inbox/{self.before_mark.id}/read", headers=self.owner_headers, json={"read": True}
        )
        self.assertIn("before mark", self.read_map(await self.inbox(self.owner_headers)))

    async def test_delete_all_empties_inbox_but_new_events_arrive_unread(self):
        await self.client.post("/api/inbox/delete-all", headers=self.owner_headers)
        body = await self.inbox(self.owner_headers)
        self.assertEqual(body["items"], [])
        self.assertEqual(body["unread_count"], 0)
        async with self.session_maker() as session:
            session.add(AuditEvent(
                workspace_id=self.rule_stop.workspace_id,
                event_type="STOP",
                message="after clear",
                created_at=datetime.now(timezone.utc) + timedelta(seconds=1),
            ))
            await session.commit()
        self.assertEqual(self.read_map(await self.inbox(self.owner_headers)), {"after clear": False})

    async def test_ordering_and_unread_first(self):
        await self.client.post(
            f"/api/inbox/{self.rule_alert.id}/read", headers=self.owner_headers, json={"read": True}
        )
        oldest = await self.inbox(self.owner_headers, ordering="oldest")
        self.assertEqual(oldest["items"][0]["message"], "before mark")
        unread_first = await self.inbox(self.owner_headers, unread_first="true")
        self.assertEqual(unread_first["items"][0]["message"], "rule stop")

    async def test_pages_report_has_more(self):
        first = await self.inbox(self.owner_headers, limit=2)
        self.assertTrue(first["has_more"])
        rest = await self.inbox(self.owner_headers, limit=2, offset=2)
        self.assertFalse(rest["has_more"])
        self.assertEqual(len(first["items"]) + len(rest["items"]), 4)

    async def test_filter_by_type_and_from_reports_hidden_count(self):
        import json

        only_alerts = json.dumps([{"field": "type", "operator": "is", "values": ["NOTIFY_ONLY"]}])
        body = await self.inbox(self.owner_headers, filter=only_alerts)
        self.assertEqual([item["message"] for item in body["items"]], ["rule alert"])
        self.assertEqual(body["hidden_by_filters"], 3)

        not_owner = json.dumps([{"field": "from", "operator": "is_not", "values": [f"user:{OWNER['id']}"]}])
        body = await self.inbox(self.owner_headers, filter=not_owner)
        self.assertNotIn("owner change", self.read_map(body))
        self.assertEqual(body["hidden_by_filters"], 1)

        refused = await self.client.get(
            "/api/inbox", headers=self.owner_headers,
            params={"filter": json.dumps([{"field": "message", "operator": "is", "values": ["x"]}])},
        )
        self.assertEqual(refused.status_code, 400)

    async def test_facets_count_values_and_name_senders(self):
        response = await self.client.get("/api/inbox/facets", headers=self.owner_headers)
        self.assertEqual(response.status_code, 200)
        facets = response.json()
        self.assertEqual(
            {entry["value"]: entry["count"] for entry in facets["type"]},
            {"STOP": 3, "NOTIFY_ONLY": 1},
        )
        senders = {entry["value"]: (entry["label"], entry["count"]) for entry in facets["from"]}
        self.assertEqual(senders[f"user:{OWNER['id']}"], ("Owner", 1))
        self.assertEqual(senders["buyerly"], ("Buyerly", 3))
        self.assertEqual(facets["account"], [{"value": "act_1", "label": "Account", "count": 4}])
        # Other workspaces never leak into the counts.
        self.assertNotIn("other workspace", str(facets))

        unread = (await self.client.get(
            "/api/inbox/facets", headers=self.owner_headers, params={"unread_only": "true"}
        )).json()
        self.assertEqual(sum(entry["count"] for entry in unread["type"]), 2)

    async def test_cannot_touch_another_workspace_event(self):
        for path, body in (
            ("read", {"read": True}),
            ("delete", None),
            ("snooze", {"until": None}),
        ):
            response = await self.client.post(
                f"/api/inbox/{self.other_workspace.id}/{path}",
                headers=self.owner_headers,
                json=body,
            )
            self.assertEqual(response.status_code, 404, path)
        self.assertNotIn("other workspace", self.read_map(await self.inbox(self.owner_headers)))


if __name__ == "__main__":
    unittest.main()
