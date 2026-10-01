import json
import unittest
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.config import settings
from core.rate_limit import limiter
from database.models import AuditEvent, InboxNotificationState, User, Workspace, WorkspaceMember
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

    async def snooze(self, event_id, until):
        return await self.client.post(
            f"/api/inbox/{event_id}/snooze",
            headers=self.owner_headers,
            json={"until": until.isoformat() if until else None},
        )

    async def test_snooze_hides_until_the_time_and_keeps_read_state(self):
        await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/read", headers=self.owner_headers, json={"read": True}
        )
        response = await self.snooze(self.rule_stop.id, datetime.now(timezone.utc) + timedelta(hours=1))
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("rule stop", self.read_map(await self.inbox(self.owner_headers)))
        snoozed = await self.inbox(self.owner_headers, show_snoozed="true")
        item = next(entry for entry in snoozed["items"] if entry["message"] == "rule stop")
        # Linear leaves a snoozed notification as read or unread as it was.
        self.assertTrue(item["is_read"])
        self.assertIsNotNone(item["snoozed_until"])
        self.assertIsNone(item["unsnoozed_at"])
        self.assertEqual(snoozed["unread_count"], 1)

        refused = await self.snooze(self.rule_stop.id, datetime.now(timezone.utc) - timedelta(minutes=1))
        self.assertEqual(refused.status_code, 400)

    async def test_unsnooze_puts_it_back_in_place_as_it_was(self):
        await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/read", headers=self.owner_headers, json={"read": True}
        )
        await self.snooze(self.rule_stop.id, datetime.now(timezone.utc) + timedelta(days=2))
        response = await self.snooze(self.rule_stop.id, None)
        self.assertEqual(response.status_code, 200)
        body = await self.inbox(self.owner_headers)
        self.assertEqual(
            [item["message"] for item in body["items"]],
            ["owner change", "rule alert", "rule stop", "before mark"],
        )
        item = body["items"][2]
        self.assertTrue(item["is_read"])
        self.assertIsNone(item["snoozed_until"])
        self.assertIsNone(item["unsnoozed_at"])

    async def run_out_snooze(self, event_id, minutes_ago):
        """Snooze, then move the clock: the snooze ended minutes_ago."""
        await self.snooze(event_id, datetime.now(timezone.utc) + timedelta(hours=1))
        ended = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
        async with self.session_maker() as session:
            await session.execute(
                update(InboxNotificationState)
                .where(InboxNotificationState.audit_event_id == event_id)
                .values(snoozed_until=ended, updated_at=ended - timedelta(hours=1))
            )
            await session.commit()
        return ended

    async def test_run_out_snooze_comes_back_on_top_and_unread(self):
        await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/read", headers=self.owner_headers, json={"read": True}
        )
        await self.run_out_snooze(self.rule_stop.id, minutes_ago=2)
        body = await self.inbox(self.owner_headers)
        self.assertEqual(
            [item["message"] for item in body["items"]],
            ["rule stop", "owner change", "rule alert", "before mark"],
        )
        item = body["items"][0]
        self.assertFalse(item["is_read"])
        self.assertIsNone(item["snoozed_until"])
        self.assertIsNotNone(item["unsnoozed_at"])
        self.assertEqual(body["unread_count"], 2)
        oldest = await self.inbox(self.owner_headers, ordering="oldest")
        self.assertEqual(oldest["items"][-1]["message"], "rule stop")

        # "Delete all read" goes by what the member sees: it is unread now.
        await self.client.post("/api/inbox/delete-all-read", headers=self.owner_headers)
        self.assertIn("rule stop", self.read_map(await self.inbox(self.owner_headers)))

        # Reading it ends "Unsnoozed …" even though it was stored as read already.
        response = await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/read", headers=self.owner_headers, json={"read": True}
        )
        self.assertEqual(response.json()["unread_count"], 1)
        body = await self.inbox(self.owner_headers)
        self.assertEqual(body["items"][0]["message"], "rule stop")
        self.assertTrue(body["items"][0]["is_read"])
        self.assertIsNone(body["items"][0]["unsnoozed_at"])

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

    async def test_from_leaves_out_authors_nobody_can_be_named_for(self):
        # Manual actions saved before the author was always recorded.
        async with self.session_maker() as session:
            session.add(AuditEvent(
                workspace_id=self.rule_stop.workspace_id, event_type="MANUAL_PAUSE",
                account_id="act_1", account_name="Account", message="no author",
                actor_type="user", actor_id="None",
            ))
            await session.commit()
        facets = (await self.client.get("/api/inbox/facets", headers=self.owner_headers)).json()
        self.assertEqual(
            {entry["label"] for entry in facets["from"]}, {"Owner", "Buyerly"}
        )
        # The notification itself stays in the list.
        self.assertIn("no author", self.read_map(await self.inbox(self.owner_headers)))

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

    async def test_display_options_are_saved_per_member(self):
        defaults = {
            "unread_only": False, "ordering": "newest", "show_snoozed": False, "unread_first": False,
            "grouping": "none", "priority_inbox": False, "badge_count": "all", "priority_rules": [],
            "priority_kinds": [
                "urgent", "rule_alerts", "rule_actions", "assistant", "manual", "team", "system",
            ],
        }
        response = await self.client.get("/api/inbox/display", headers=self.owner_headers)
        self.assertEqual(response.json(), defaults)

        chosen = {
            **defaults, "unread_only": True, "ordering": "oldest", "show_snoozed": True, "unread_first": True,
        }
        response = await self.client.put("/api/inbox/display", headers=self.owner_headers, json=chosen)
        self.assertEqual(response.status_code, 200, response.text)
        response = await self.client.get("/api/inbox/display", headers=self.owner_headers)
        self.assertEqual(response.json(), chosen)

        # Another member of the same workspace keeps Linear's defaults.
        response = await self.client.get("/api/inbox/display", headers=self.buyer_headers)
        self.assertEqual(response.json(), defaults)

        response = await self.client.put(
            "/api/inbox/display", headers=self.owner_headers, json={**chosen, "ordering": "priority"}
        )
        self.assertEqual(response.status_code, 422)

    async def test_notifications_carry_their_kind_and_unread_counts_by_kind(self):
        async with self.session_maker() as session:
            workspace_id = (
                await session.execute(select(Workspace.id).where(Workspace.slug == "inbox-ws"))
            ).scalar_one()
            now = datetime.now(timezone.utc)
            for event_type, values in (
                ("TOKEN_EXPIRED", {}),
                ("STOP", {"status": "ERROR", "message": "failed stop"}),
                ("ASSISTANT_CREATE_RULE", {"actor_type": "user", "actor_id": str(BUYER["id"])}),
                ("INVITE_SEND", {"category": "WORKSPACE_INVITE", "actor_type": "user", "actor_id": str(BUYER["id"])}),
                ("ACCOUNT_DAY_STARTED", {}),
            ):
                session.add(AuditEvent(
                    workspace_id=workspace_id,
                    event_type=event_type,
                    account_id="act_1",
                    message=values.pop("message", event_type),
                    created_at=now - timedelta(minutes=1),
                    **values,
                ))
            await session.commit()

        body = await self.inbox(self.owner_headers)
        kinds = {item["message"]: item["kind"] for item in body["items"]}
        self.assertEqual(kinds["TOKEN_EXPIRED"], "urgent")
        self.assertEqual(kinds["failed stop"], "urgent")
        self.assertEqual(kinds["rule alert"], "rule_alerts")
        self.assertEqual(kinds["rule stop"], "rule_actions")
        self.assertEqual(kinds["ASSISTANT_CREATE_RULE"], "assistant")
        self.assertEqual(kinds["owner change"], "manual")
        self.assertEqual(kinds["INVITE_SEND"], "team")
        self.assertEqual(kinds["ACCOUNT_DAY_STARTED"], "system")
        # The owner's own change is read; everything newer than the mark is not.
        self.assertEqual(body["unread_count"], 7)
        # Linear starts with every kind in the priority inbox.
        self.assertEqual(body["priority_unread_count"], 7)
        response = await self.client.get("/api/inbox/unread-count", headers=self.owner_headers)
        self.assertEqual(response.json(), {"unread_count": 7, "priority_unread_count": 7})

        # Priority shows the chosen kinds, Other everything else.
        chosen = json.dumps({"kinds": ["urgent", "rule_alerts"]})
        priority = await self.inbox(self.owner_headers, tab="priority", priority=chosen)
        self.assertEqual(
            {item["kind"] for item in priority["items"]}, {"urgent", "rule_alerts"}
        )
        self.assertEqual(priority["priority_unread_count"], 3)
        other = await self.inbox(self.owner_headers, tab="other", priority=chosen)
        self.assertEqual(
            len(priority["items"]) + len(other["items"]), len(body["items"])
        )
        self.assertNotIn("urgent", {item["kind"] for item in other["items"]})
        # Nothing chosen for Priority means an empty Priority tab.
        nothing = json.dumps({"kinds": []})
        self.assertEqual((await self.inbox(self.owner_headers, tab="priority", priority=nothing))["items"], [])
        facets = await self.client.get(
            "/api/inbox/facets",
            headers=self.owner_headers,
            params={"tab": "priority", "priority": json.dumps({"kinds": ["team"]})},
        )
        self.assertEqual([entry["value"] for entry in facets.json()["type"]], ["INVITE_SEND"])
        response = await self.client.get(
            "/api/inbox",
            headers=self.owner_headers,
            params={"tab": "priority", "priority": json.dumps({"kinds": ["mentions"]})},
        )
        self.assertEqual(response.status_code, 400)

    async def test_custom_filters_add_to_the_priority_inbox(self):
        rule = [
            {"field": "type", "operator": "is", "values": ["STOP"]},
            {"field": "from", "operator": "is", "values": ["buyerly"]},
        ]
        display = {
            **(await self.client.get("/api/inbox/display", headers=self.owner_headers)).json(),
            "priority_inbox": True,
            "priority_kinds": ["rule_alerts"],
            "priority_rules": [rule],
        }
        response = await self.client.put("/api/inbox/display", headers=self.owner_headers, json=display)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["priority_rules"], [rule])

        # Without "priority" the member's saved priority inbox applies: Rule
        # alerts, plus any STOP that Buyerly itself did.
        priority = await self.inbox(self.owner_headers, tab="priority")
        self.assertEqual(self.read_map(priority), {"rule alert": False, "rule stop": False, "before mark": True})
        self.assertEqual(priority["priority_unread_count"], 2)
        other = await self.inbox(self.owner_headers, tab="other")
        self.assertEqual(self.read_map(other), {"owner change": True})
        # Every condition of a custom filter has to match.
        only_users = [{**rule[0]}, {"field": "from", "operator": "is", "values": [f"user:{OWNER['id']}"]}]
        priority = await self.inbox(
            self.owner_headers,
            tab="priority",
            priority=json.dumps({"kinds": [], "rules": [only_users]}),
        )
        self.assertEqual(self.read_map(priority), {"owner change": True})
        # Mark read and the badge use the saved priority inbox too.
        response = await self.client.post(
            f"/api/inbox/{self.rule_stop.id}/read", headers=self.owner_headers, json={"read": True}
        )
        self.assertEqual(response.json()["priority_unread_count"], 1)
        # Another member's priority inbox is their own.
        buyer = await self.inbox(self.buyer_headers, tab="priority")
        self.assertEqual(buyer["priority_unread_count"], 3)

        for bad in (
            [[]],
            [[rule[0], rule[0]]],
            [[{"field": "account", "operator": "is", "values": ["act_1"]}]],
            [[{"field": "type", "operator": "is", "values": []}]],
        ):
            response = await self.client.put(
                "/api/inbox/display", headers=self.owner_headers, json={**display, "priority_rules": bad}
            )
            self.assertEqual(response.status_code, 422, bad)
            response = await self.client.get(
                "/api/inbox",
                headers=self.owner_headers,
                params={"tab": "priority", "priority": json.dumps({"kinds": [], "rules": bad})},
            )
            self.assertEqual(response.status_code, 400, bad)

    async def test_priority_and_grouping_options_are_saved(self):
        chosen = {
            "unread_only": False, "ordering": "newest", "show_snoozed": False, "unread_first": False,
            "grouping": "focus", "priority_inbox": True,
            "priority_kinds": ["team", "urgent", "team"], "badge_count": "priority",
        }
        response = await self.client.put("/api/inbox/display", headers=self.owner_headers, json=chosen)
        self.assertEqual(response.status_code, 200, response.text)
        saved = (await self.client.get("/api/inbox/display", headers=self.owner_headers)).json()
        # Kinds come back once each, in Focus order.
        self.assertEqual(saved["priority_kinds"], ["urgent", "team"])
        self.assertEqual((saved["grouping"], saved["priority_inbox"], saved["badge_count"]), ("focus", True, "priority"))

        # Options saved before #240 keep working, with Linear's defaults for the new ones.
        async with self.session_maker() as session:
            await session.execute(
                update(WorkspaceMember).values(
                    inbox_display={"unread_only": True, "ordering": "oldest", "show_snoozed": False, "unread_first": False}
                )
            )
            await session.commit()
        saved = (await self.client.get("/api/inbox/display", headers=self.owner_headers)).json()
        self.assertEqual(saved["ordering"], "oldest")
        self.assertEqual(saved["grouping"], "none")
        self.assertFalse(saved["priority_inbox"])
        self.assertEqual(len(saved["priority_kinds"]), 7)
        self.assertEqual(saved["badge_count"], "all")

    async def test_unreadable_saved_display_falls_back_to_defaults(self):
        async with self.session_maker() as session:
            await session.execute(
                update(WorkspaceMember).values(inbox_display={"ordering": "sideways"})
            )
            await session.commit()
        response = await self.client.get("/api/inbox/display", headers=self.owner_headers)
        self.assertEqual(response.json()["ordering"], "newest")

    async def test_email_notification_settings_are_saved_per_member(self):
        all_kinds = ["urgent", "rule_alerts", "rule_actions", "assistant", "manual", "team", "system"]
        defaults = {
            "email": {"enabled": True, "priority_only": False, "kinds": all_kinds},
        }
        response = await self.client.get("/api/notifications/channels", headers=self.owner_headers)
        self.assertEqual(response.json(), defaults)

        chosen = {"email": {"enabled": False, "priority_only": True, "kinds": ["team", "urgent", "team"]}}
        response = await self.client.put("/api/notifications/channels", headers=self.owner_headers, json=chosen)
        self.assertEqual(response.status_code, 200, response.text)
        saved = (await self.client.get("/api/notifications/channels", headers=self.owner_headers)).json()
        # Kinds come back once each, in Focus order.
        self.assertEqual(saved["email"], {"enabled": False, "priority_only": True, "kinds": ["urgent", "team"]})

        # Another member of the same workspace keeps Linear's defaults.
        response = await self.client.get("/api/notifications/channels", headers=self.buyer_headers)
        self.assertEqual(response.json(), defaults)

        response = await self.client.put(
            "/api/notifications/channels",
            headers=self.owner_headers,
            json={"email": {"enabled": True, "kinds": ["mentions"]}},
        )
        self.assertEqual(response.status_code, 422)

        async with self.session_maker() as session:
            await session.execute(
                update(WorkspaceMember).values(notification_channels={"email": {"enabled": "sometimes"}})
            )
            await session.commit()
        response = await self.client.get("/api/notifications/channels", headers=self.owner_headers)
        self.assertEqual(response.json(), defaults)


if __name__ == "__main__":
    unittest.main()
