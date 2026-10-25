"""The sync engine's live stream (#506): catch-up from a sync id, live changes, sync groups, auth and reconnects."""

import asyncio
import json
import socket
import sys
import time
import unittest
from datetime import datetime, timezone

import httpx
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.sync_stream as sync_stream
from api.server import create_app
from core.rate_limit import limiter
from database.models import (
    AutomationRuntimeState,
    RuleGroup,
    RulePreset,
    Team,
    TeamMember,
    User,
    WebSession,
    Workspace,
    WorkspaceMember,
)
from database.sync_log import STATE_KEY, changes_since, last_sync_id, member_sync_groups
from tests.test_db_helper import create_test_engine, init_test_db, session_headers


class Closed(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


class Socket:
    """A WebSocket client driving the ASGI app in this event loop, as uvicorn would."""

    def __init__(self, app, query: str = "", headers: dict | None = None):
        self.app = app
        self.query = query
        self.headers = {"host": "test", **{k.lower(): v for k, v in (headers or {}).items()}}
        self.to_app: asyncio.Queue = asyncio.Queue()
        self.from_app: asyncio.Queue = asyncio.Queue()
        self.task = None
        self.close_code = None

    async def connect(self) -> "Socket":
        scope = {
            "type": "websocket",
            "asgi": {"version": "3.0"},
            "scheme": "ws",
            "http_version": "1.1",
            "path": "/api/sync/ws",
            "raw_path": b"/api/sync/ws",
            "root_path": "",
            "query_string": self.query.encode(),
            "headers": [(k.encode(), v.encode()) for k, v in self.headers.items()],
            "client": ("127.0.0.1", 50000),
            "server": ("test", 80),
            "subprotocols": [],
        }
        self.task = asyncio.create_task(self.app(scope, self.to_app.get, self.from_app.put))
        await self.to_app.put({"type": "websocket.connect"})
        message = await asyncio.wait_for(self.from_app.get(), 10)
        if message["type"] == "websocket.close":
            raise Closed(message.get("code", 1000))
        assert message["type"] == "websocket.accept", message
        self.accept = message
        return self

    async def receive(self, timeout: float = 5) -> dict:
        message = await asyncio.wait_for(self.from_app.get(), timeout)
        if message["type"] == "websocket.close":
            self.close_code = message.get("code", 1000)
            raise Closed(self.close_code)
        return json.loads(message["text"])

    async def receive_type(self, kind: str, timeout: float = 5) -> dict:
        """The next message of `kind`, skipping heartbeats."""
        while True:
            message = await self.receive(timeout)
            if message["type"] != "ping" or kind == "ping":
                if message["type"] != kind:
                    raise AssertionError(f"expected {kind}, got {message}")
                return message

    async def silent(self, seconds: float = 0.5) -> bool:
        try:
            message = await self.receive(seconds)
        except asyncio.TimeoutError:
            return True
        return message["type"] == "ping" and await self.silent(seconds)

    async def send(self, message: dict) -> None:
        await self.to_app.put({"type": "websocket.receive", "text": json.dumps(message)})

    async def close(self) -> None:
        if self.task is None:
            return
        await self.to_app.put({"type": "websocket.disconnect", "code": 1000})
        try:
            await asyncio.wait_for(self.task, 5)
        except asyncio.TimeoutError:
            self.task.cancel()
        self.task = None


def cookie_of(headers: dict) -> dict:
    return {"cookie": headers["Cookie"]}


class TestSyncStream(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        for name, module in list(sys.modules.items()):
            if name.startswith("api.") and hasattr(module, "async_session_maker"):
                module.async_session_maker = self.sessions

        async with self.sessions() as session:
            owner = User(telegram_id="970000001", username="owner", full_name="Olga Owner",
                         role="buyer", is_approved=True)
            buyer = User(telegram_id="970000002", username="buyer", full_name="Boris Buyer",
                         role="buyer", is_approved=True)
            guest = User(telegram_id="970000003", username="guest", full_name="Gina Guest",
                         role="buyer", is_approved=True)
            stranger = User(telegram_id="970000004", username="stranger", full_name="Sam Stranger",
                            role="buyer", is_approved=True)
            session.add_all([owner, buyer, guest, stranger])
            await session.flush()
            ws = Workspace(name="Buyerly", slug="buyerly", owner_user_id=owner.id)
            other = Workspace(name="Other", slug="other", owner_user_id=stranger.id)
            session.add_all([ws, other])
            await session.flush()
            owner_member = WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role="owner")
            buyer_member = WorkspaceMember(workspace_id=ws.id, user_id=buyer.id, role="member")
            guest_member = WorkspaceMember(workspace_id=ws.id, user_id=guest.id, role="guest")
            stranger_member = WorkspaceMember(workspace_id=other.id, user_id=stranger.id, role="owner")
            session.add_all([owner_member, buyer_member, guest_member, stranger_member])
            for user in (owner, buyer, guest):
                user.active_workspace_id = ws.id
            stranger.active_workspace_id = other.id
            await session.flush()
            public = Team(workspace_id=ws.id, name="Media", key="MED")
            private = Team(workspace_id=ws.id, name="Secret", key="SEC", private=True)
            elsewhere = Team(workspace_id=other.id, name="Elsewhere", key="ELS")
            session.add_all([public, private, elsewhere])
            await session.flush()
            session.add_all([
                TeamMember(team_id=public.id, member_id=buyer_member.id),
                TeamMember(team_id=public.id, member_id=guest_member.id),
                TeamMember(team_id=private.id, member_id=owner_member.id, is_owner=True),
            ])
            await session.commit()
            self.ws_id, self.other_ws_id = ws.id, other.id
            self.owner_id, self.buyer_id, self.stranger_id = owner.id, buyer.id, stranger.id
            self.members = {"owner": owner_member.id, "buyer": buyer_member.id,
                            "guest": guest_member.id, "stranger": stranger_member.id}
            self.public_id, self.private_id, self.elsewhere_id = public.id, private.id, elsewhere.id

        self.headers = {}
        for name, telegram_id in (("owner", 970000001), ("buyer", 970000002), ("guest", 970000003),
                                  ("stranger", 970000004)):
            self.headers[name] = await session_headers(self.sessions, {"id": telegram_id, "username": name})
        self.app = create_app()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")
        self.sockets: list[Socket] = []

    async def asyncTearDown(self):
        for sock in self.sockets:
            await sock.close()
        hub = getattr(self.app.state, "sync_hub", None)
        if hub is not None:
            await hub.stop()
        await self.client.aclose()
        await self.engine.dispose()

    async def sync_id(self) -> int:
        async with self.sessions() as session:
            return await last_sync_id(session)

    async def open(self, who: str, since: int | None = None, **extra) -> Socket:
        since = await self.sync_id() if since is None else since
        query = f"since={since}" + "".join(f"&{k}={v}" for k, v in extra.items())
        sock = Socket(self.app, query, cookie_of(self.headers[who]))
        self.sockets.append(sock)
        return await sock.connect()

    async def rename(self, table, row_id: int, name: str) -> None:
        async with self.sessions() as session:
            await session.execute(update(table).where(table.id == row_id).values(name=name))
            await session.commit()

    async def deltas_until(self, sock: Socket, done, timeout: float = 5) -> list[dict]:
        """Actions from `delta` messages until `done(actions)` holds."""
        actions = []
        deadline = time.monotonic() + timeout
        while not done(actions):
            message = await sock.receive(max(0.05, deadline - time.monotonic()))
            if message["type"] == "delta":
                actions += message["actions"]
        return actions

    # Catch-up

    async def test_catch_up_sends_every_missed_change_in_order_then_caught_up(self):
        since = await self.sync_id()
        await self.rename(Team, self.public_id, "Media buying")
        await self.rename(Team, self.private_id, "Hidden")
        await self.rename(Team, self.public_id, "Media 2")
        sock = await self.open("buyer", since)

        delta = await sock.receive_type("delta")
        names = [(a["model"], a["model_id"], a["data"].get("name")) for a in delta["actions"]]
        # The private team is not the buyer's.
        self.assertEqual(names, [("Team", str(self.public_id), "Media buying"), ("Team", str(self.public_id), "Media 2")])
        ids = [a["sync_id"] for a in delta["actions"]]
        self.assertEqual(ids, sorted(ids))
        self.assertGreater(ids[0], since)
        caught_up = await sock.receive_type("caught_up")
        self.assertEqual(caught_up["last_sync_id"], ids[-1])

    async def test_catch_up_pages_through_more_than_one_batch(self):
        since = await self.sync_id()
        original = sync_stream.BATCH
        sync_stream.BATCH = 3
        try:
            for n in range(7):
                await self.rename(Team, self.public_id, f"Media {n}")
            sock = await self.open("buyer", since)
            actions = await self.deltas_until(sock, lambda a: len(a) >= 7)
            self.assertEqual([a["data"]["name"] for a in actions], [f"Media {n}" for n in range(7)])
            await sock.receive_type("caught_up")
        finally:
            sync_stream.BATCH = original

    async def test_a_current_client_gets_caught_up_alone(self):
        sock = await self.open("buyer")
        caught_up = await sock.receive_type("caught_up")
        self.assertEqual(caught_up["last_sync_id"], await self.sync_id())

    async def test_an_id_older_than_the_log_keeps_asks_for_a_bootstrap(self):
        async with self.sessions() as session:
            session.add(AutomationRuntimeState(state_key=STATE_KEY, payload={"compacted_through": 10**9}))
            await session.commit()
        sock = await self.open("buyer", 5)
        with self.assertRaises(Closed) as closed:
            await sock.receive()
        self.assertEqual(closed.exception.code, sync_stream.CLOSE_BOOTSTRAP)

    async def test_a_socket_without_since_is_told_to_bootstrap(self):
        sock = Socket(self.app, "", cookie_of(self.headers["buyer"]))
        self.sockets.append(sock)
        await sock.connect()
        with self.assertRaises(Closed) as closed:
            await sock.receive()
        self.assertEqual(closed.exception.code, sync_stream.CLOSE_BOOTSTRAP)

    # Live delivery

    async def test_a_change_made_through_the_api_reaches_another_members_socket_within_a_second(self):
        sock = await self.open("buyer")
        await sock.receive_type("caught_up")
        started = time.monotonic()
        res = await self.client.patch(
            f"/api/workspaces/{self.ws_id}/teams/{self.public_id}", json={"name": "Media live"},
            headers=self.headers["owner"],
        )
        self.assertEqual(res.status_code, 200, res.text)
        delta = await sock.receive_type("delta", timeout=1)
        self.assertLess(time.monotonic() - started, 1)
        action = next(a for a in delta["actions"] if a["model"] == "Team")
        self.assertEqual((action["action"], action["model_id"], action["data"]["name"]),
                         ("update", str(self.public_id), "Media live"))
        self.assertEqual(delta["last_sync_id"], delta["actions"][-1]["sync_id"])

    async def test_every_open_socket_of_the_workspace_gets_the_change(self):
        owner = await self.open("owner")
        buyer = await self.open("buyer")
        guest = await self.open("guest")
        for sock in (owner, buyer, guest):
            await sock.receive_type("caught_up")
        await self.rename(Team, self.public_id, "Everyone sees")
        for sock in (owner, buyer, guest):
            delta = await sock.receive_type("delta")
            self.assertEqual(delta["actions"][0]["data"]["name"], "Everyone sees")

    async def test_ping_gets_pong_and_quiet_sockets_get_heartbeats(self):
        original = sync_stream.HEARTBEAT_SECONDS
        sync_stream.HEARTBEAT_SECONDS = 0.2
        try:
            sock = await self.open("buyer")
            await sock.receive_type("caught_up")
            await sock.send({"type": "ping"})
            self.assertEqual((await sock.receive())["type"], "pong")
            self.assertEqual((await sock.receive(2))["type"], "ping")
        finally:
            sync_stream.HEARTBEAT_SECONDS = original

    async def test_the_hub_polls_when_a_notification_is_missed(self):
        original = sync_stream.POLL_SECONDS
        sync_stream.POLL_SECONDS = 0.3
        try:
            sock = await self.open("buyer")
            await sock.receive_type("caught_up")
            hub = self.app.state.sync_hub

            class Deaf(asyncio.Event):
                def set(self):
                    pass

            # Notifications no longer wake the hub; only its poll reads the log.
            hub._wake = Deaf()
            await self.rename(Team, self.public_id, "Polled")
            delta = await sock.receive_type("delta", timeout=3)
            self.assertEqual(delta["actions"][0]["data"]["name"], "Polled")
        finally:
            sync_stream.POLL_SECONDS = original

    # Sync groups

    async def test_a_member_never_sees_another_workspaces_changes(self):
        stranger = await self.open("stranger")
        buyer = await self.open("buyer")
        await stranger.receive_type("caught_up")
        await buyer.receive_type("caught_up")

        await self.rename(Team, self.public_id, "Ours")
        async with self.sessions() as session:
            session.add(RulePreset(workspace_id=self.ws_id, owner_user_id=self.owner_id, name="Our rule"))
            session.add(RuleGroup(workspace_id=self.ws_id, owner_user_id=self.owner_id, name="Our label"))
            await session.commit()
        await self.rename(Team, self.elsewhere_id, "Theirs")

        # The first thing the stranger hears is their own workspace's change.
        delta = await stranger.receive_type("delta")
        self.assertEqual([(a["model"], a["model_id"]) for a in delta["actions"]], [("Team", str(self.elsewhere_id))])
        self.assertTrue(await stranger.silent(0.3))
        actions = await self.deltas_until(buyer, lambda a: {"Team", "Rule", "Label"} <= {x["model"] for x in a})
        self.assertNotIn(str(self.elsewhere_id), {a["model_id"] for a in actions if a["model"] == "Team"})

    async def test_a_guest_gets_neither_rules_nor_private_teams(self):
        guest = await self.open("guest")
        await guest.receive_type("caught_up")
        async with self.sessions() as session:
            session.add(RulePreset(workspace_id=self.ws_id, owner_user_id=self.owner_id, name="Members only"))
            await session.commit()
        await self.rename(Team, self.private_id, "Still secret")
        await self.rename(Team, self.public_id, "Guest sees this")
        delta = await guest.receive_type("delta")
        self.assertEqual([(a["model"], a["model_id"]) for a in delta["actions"]], [("Team", str(self.public_id))])

    async def test_catch_up_is_filtered_by_groups_too(self):
        since = await self.sync_id()
        await self.rename(Team, self.elsewhere_id, "Not yours")
        await self.rename(Team, self.private_id, "Not yours either")
        sock = await self.open("buyer", since)
        self.assertEqual((await sock.receive())["type"], "caught_up")

    async def test_a_removed_member_stops_receiving_at_once(self):
        buyer = await self.open("buyer")
        await buyer.receive_type("caught_up")
        async with self.sessions() as session:
            await session.execute(delete(TeamMember).where(TeamMember.member_id == self.members["buyer"]))
            await session.execute(delete(WorkspaceMember).where(WorkspaceMember.id == self.members["buyer"]))
            await session.commit()
        await self.rename(Team, self.public_id, "After you left")

        actions = []
        with self.assertRaises(Closed) as closed:
            while True:
                message = await buyer.receive()
                if message["type"] == "delta":
                    actions += message["actions"]
        self.assertEqual(closed.exception.code, sync_stream.CLOSE_FORBIDDEN)
        # They hear of their own removal, and nothing after it.
        self.assertIn(("WorkspaceMember", str(self.members["buyer"]), "delete"),
                      {(a["model"], a["model_id"], a["action"]) for a in actions})
        self.assertNotIn("After you left", [a["data"].get("name") for a in actions])

    async def test_a_removal_in_one_transaction_with_other_changes_leaks_none_of_them(self):
        buyer = await self.open("buyer")
        await buyer.receive_type("caught_up")
        async with self.sessions() as session:
            await session.execute(delete(TeamMember).where(TeamMember.member_id == self.members["buyer"]))
            await session.execute(delete(WorkspaceMember).where(WorkspaceMember.id == self.members["buyer"]))
            await session.execute(update(Team).where(Team.id == self.public_id).values(name="Same commit"))
            session.add(RulePreset(workspace_id=self.ws_id, owner_user_id=self.owner_id, name="Same commit"))
            await session.commit()
        actions = []
        with self.assertRaises(Closed) as closed:
            while True:
                message = await buyer.receive()
                if message["type"] == "delta":
                    actions += message["actions"]
        self.assertEqual(closed.exception.code, sync_stream.CLOSE_FORBIDDEN)
        self.assertNotIn("Same commit", [a["data"].get("name") for a in actions])

    async def test_joining_a_private_team_opens_its_group_on_the_open_socket(self):
        buyer = await self.open("buyer")
        await buyer.receive_type("caught_up")
        await self.rename(Team, self.private_id, "Before joining")
        async with self.sessions() as session:
            session.add(TeamMember(team_id=self.private_id, member_id=self.members["buyer"]))
            await session.commit()
        await self.rename(Team, self.private_id, "After joining")

        groups = None
        actions = []
        while not any(a["data"].get("name") == "After joining" for a in actions):
            message = await buyer.receive()
            if message["type"] == "sync_groups":
                groups = message
            elif message["type"] == "delta":
                actions += message["actions"]
        self.assertEqual(groups["added"], [f"team:{self.private_id}"])
        self.assertNotIn("Before joining", [a["data"].get("name") for a in actions])
        self.assertIn("TeamMember", {a["model"] for a in actions})

    async def test_a_role_change_to_guest_takes_effect_on_the_open_socket(self):
        buyer = await self.open("buyer")
        await buyer.receive_type("caught_up")
        async with self.sessions() as session:
            await session.execute(update(WorkspaceMember).where(WorkspaceMember.id == self.members["buyer"])
                                  .values(role="guest"))
            await session.commit()
        delta = await buyer.receive_type("delta")
        self.assertEqual((delta["actions"][0]["model"], delta["actions"][0]["data"]["role"]), ("WorkspaceMember", "guest"))
        groups = await buyer.receive_type("sync_groups")
        self.assertIn(f"workspace:{self.ws_id}:members", groups["removed"])
        async with self.sessions() as session:
            session.add(RulePreset(workspace_id=self.ws_id, owner_user_id=self.owner_id, name="Now hidden"))
            await session.commit()
        self.assertTrue(await buyer.silent(0.5))

    async def test_a_new_public_team_reaches_members_but_not_guests(self):
        buyer = await self.open("buyer")
        guest = await self.open("guest")
        await buyer.receive_type("caught_up")
        await guest.receive_type("caught_up")
        async with self.sessions() as session:
            team = Team(workspace_id=self.ws_id, name="New", key="NEW")
            session.add(team)
            await session.commit()
        groups = await buyer.receive_type("sync_groups")
        self.assertEqual(groups["added"], [f"team:{team.id}"])
        created = (await buyer.receive_type("delta"))["actions"]
        self.assertEqual([(a["model"], a["action"], a["model_id"]) for a in created], [("Team", "insert", str(team.id))])
        await self.rename(Team, team.id, "New and renamed")
        delta = await buyer.receive_type("delta")
        self.assertEqual(delta["actions"][0]["data"]["name"], "New and renamed")
        self.assertTrue(await guest.silent(0.5))

    # Auth

    async def test_a_socket_without_a_session_is_refused(self):
        sock = Socket(self.app, "since=0")
        self.sockets.append(sock)
        await sock.connect()
        with self.assertRaises(Closed) as closed:
            await sock.receive()
        self.assertEqual(closed.exception.code, sync_stream.CLOSE_UNAUTHORIZED)

    async def test_a_forged_cookie_is_refused(self):
        sock = Socket(self.app, "since=0", {"cookie": "buyerly_session=not-a-session"})
        self.sockets.append(sock)
        await sock.connect()
        with self.assertRaises(Closed) as closed:
            await sock.receive()
        self.assertEqual(closed.exception.code, sync_stream.CLOSE_UNAUTHORIZED)

    async def test_another_sites_page_cannot_open_a_socket_with_the_cookie(self):
        sock = Socket(self.app, "since=0", {**cookie_of(self.headers["buyer"]), "origin": "https://evil.example"})
        self.sockets.append(sock)
        with self.assertRaises(Closed) as closed:
            await sock.connect()
        self.assertEqual(closed.exception.code, sync_stream.CLOSE_FORBIDDEN)

    async def test_the_apps_own_page_may_open_one(self):
        sock = Socket(self.app, f"since={await self.sync_id()}",
                      {**cookie_of(self.headers["buyer"]), "origin": "http://test"})
        self.sockets.append(sock)
        await sock.connect()
        await sock.receive_type("caught_up")

    async def test_a_workspace_the_user_is_not_in_is_refused(self):
        sock = await self.open("buyer", 0, workspace="other")
        with self.assertRaises(Closed) as closed:
            await sock.receive()
        self.assertEqual(closed.exception.code, sync_stream.CLOSE_FORBIDDEN)

    async def test_a_signed_out_session_is_closed_at_the_next_heartbeat(self):
        original = sync_stream.HEARTBEAT_SECONDS
        sync_stream.HEARTBEAT_SECONDS = 0.2
        try:
            sock = await self.open("buyer")
            await sock.receive_type("caught_up")
            async with self.sessions() as session:
                await session.execute(update(WebSession).values(revoked_at=datetime.now(timezone.utc)))
                await session.commit()
            with self.assertRaises(Closed) as closed:
                while True:
                    await sock.receive(2)
            self.assertEqual(closed.exception.code, sync_stream.CLOSE_UNAUTHORIZED)
        finally:
            sync_stream.HEARTBEAT_SECONDS = original

    # Reconnects

    async def test_reconnecting_from_the_last_sync_id_misses_and_repeats_nothing(self):
        sock = await self.open("buyer")
        await sock.receive_type("caught_up")
        await self.rename(Team, self.public_id, "Seen live")
        last = (await sock.receive_type("delta"))["last_sync_id"]
        await sock.close()

        await self.rename(Team, self.public_id, "While away 1")
        await self.rename(Team, self.public_id, "While away 2")
        again = await self.open("buyer", last)
        delta = await again.receive_type("delta")
        self.assertEqual([a["data"]["name"] for a in delta["actions"]], ["While away 1", "While away 2"])
        await again.receive_type("caught_up")
        await self.rename(Team, self.public_id, "Live again")
        delta = await again.receive_type("delta")
        self.assertEqual([a["data"]["name"] for a in delta["actions"]], ["Live again"])

    async def test_writes_during_catch_up_arrive_exactly_once_in_order(self):
        since = await self.sync_id()
        for n in range(20):
            await self.rename(Team, self.public_id, f"Before {n}")

        async def writer():
            for n in range(40):
                await self.rename(Team, self.public_id, f"During {n}")
                await asyncio.sleep(0)

        writing = asyncio.create_task(writer())
        original = sync_stream.BATCH
        sync_stream.BATCH = 7
        try:
            sock = await self.open("buyer", since)
            actions = await self.deltas_until(sock, lambda a: any(x["data"].get("name") == "During 39" for x in a),
                                              timeout=20)
        finally:
            sync_stream.BATCH = original
            await writing

        ids = [a["sync_id"] for a in actions]
        self.assertEqual(ids, sorted(set(ids)), "no duplicates, in order")
        async with self.sessions() as session:
            member = await session.get(WorkspaceMember, self.members["buyer"])
            expected = [row.sync_id for row in await changes_since(
                session, await member_sync_groups(session, member), since, 10_000)]
        self.assertEqual(ids, expected, "no gaps")
        self.assertEqual([a["data"]["name"] for a in actions],
                         [f"Before {n}" for n in range(20)] + [f"During {n}" for n in range(40)])

    async def test_a_socket_that_falls_too_far_behind_is_closed_to_reconnect(self):
        original = sync_stream.MAX_PENDING_BATCHES
        sync_stream.MAX_PENDING_BATCHES = 0
        try:
            sock = await self.open("buyer")
            await sock.receive_type("caught_up")
            await self.rename(Team, self.public_id, "Too much")
            with self.assertRaises(Closed) as closed:
                while True:
                    await sock.receive()
            self.assertEqual(closed.exception.code, sync_stream.CLOSE_TOO_SLOW)
        finally:
            sync_stream.MAX_PENDING_BATCHES = original

    # HTTP catch-up

    async def test_delta_returns_the_members_changes_since_an_id(self):
        since = await self.sync_id()
        await self.rename(Team, self.public_id, "One")
        await self.rename(Team, self.private_id, "Hidden")
        await self.rename(Team, self.public_id, "Two")
        res = await self.client.get(f"/api/sync/delta?since={since}", headers=self.headers["buyer"])
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual([a["data"]["name"] for a in body["actions"]], ["One", "Two"])
        self.assertFalse(body["has_more"])
        # Current to the newest id, the private team's change included.
        self.assertEqual(body["last_sync_id"], await self.sync_id())

    async def test_delta_pages_with_has_more(self):
        since = await self.sync_id()
        for n in range(5):
            await self.rename(Team, self.public_id, f"Page {n}")
        names, cursor = [], since
        while True:
            res = await self.client.get(f"/api/sync/delta?since={cursor}&limit=2", headers=self.headers["buyer"])
            body = res.json()
            names += [a["data"]["name"] for a in body["actions"]]
            cursor = body["last_sync_id"]
            if not body["has_more"]:
                break
        self.assertEqual(names, [f"Page {n}" for n in range(5)])

    async def test_delta_too_old_tells_the_client_to_bootstrap(self):
        async with self.sessions() as session:
            session.add(AutomationRuntimeState(state_key=STATE_KEY, payload={"compacted_through": 10**9}))
            await session.commit()
        res = await self.client.get("/api/sync/delta?since=1", headers=self.headers["buyer"])
        self.assertEqual(res.status_code, 410)

    async def test_delta_needs_a_session(self):
        res = await self.client.get("/api/sync/delta?since=0")
        self.assertEqual(res.status_code, 401)


class TestSyncSocketOverUvicorn(unittest.IsolatedAsyncioTestCase):
    """The same socket through a real server and WebSocket client: the handshake, the cookie and a live change."""

    async def asyncSetUp(self):
        import uvicorn

        await limiter.reset()
        self.engine = create_test_engine()
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        for name, module in list(sys.modules.items()):
            if name.startswith("api.") and hasattr(module, "async_session_maker"):
                module.async_session_maker = self.sessions
        async with self.sessions() as session:
            owner = User(telegram_id="971000001", username="owner", full_name="Olga Owner",
                         role="buyer", is_approved=True)
            session.add(owner)
            await session.flush()
            ws = Workspace(name="Buyerly", slug="buyerly", owner_user_id=owner.id)
            session.add(ws)
            await session.flush()
            session.add(WorkspaceMember(workspace_id=ws.id, user_id=owner.id, role="owner"))
            owner.active_workspace_id = ws.id
            team = Team(workspace_id=ws.id, name="Media", key="MED")
            session.add(team)
            await session.commit()
            self.team_id = team.id
        self.headers = await session_headers(self.sessions, {"id": 971000001, "username": "owner"})

        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        self.port = sock.getsockname()[1]
        sock.close()
        self.app = create_app()
        self.server = uvicorn.Server(uvicorn.Config(self.app, host="127.0.0.1", port=self.port, log_level="warning",
                                                    lifespan="off", ws="websockets"))
        self.serving = asyncio.create_task(self.server.serve())
        while not self.server.started:
            await asyncio.sleep(0.02)

    async def asyncTearDown(self):
        self.server.should_exit = True
        await self.serving
        hub = getattr(self.app.state, "sync_hub", None)
        if hub is not None:
            await hub.stop()
        await self.engine.dispose()

    async def test_a_live_change_over_a_real_socket(self):
        from websockets.asyncio.client import connect

        async with self.sessions() as session:
            since = await last_sync_id(session)
        url = f"ws://127.0.0.1:{self.port}/api/sync/ws?since={since}"
        async with connect(url, additional_headers={"Cookie": self.headers["Cookie"]}) as ws:
            self.assertEqual(json.loads(await ws.recv())["type"], "caught_up")
            async with self.sessions() as session:
                await session.execute(update(Team).where(Team.id == self.team_id).values(name="Over the wire"))
                await session.commit()
            message = json.loads(await asyncio.wait_for(ws.recv(), 2))
            self.assertEqual(message["type"], "delta")
            self.assertEqual(message["actions"][0]["data"]["name"], "Over the wire")


if __name__ == "__main__":
    unittest.main()
