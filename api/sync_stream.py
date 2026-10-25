"""The sync engine's live stream, as Linear's WebSocket to sync.linear.app (#506).

One `SyncHub` per API process LISTENs on the change log's NOTIFY channel and,
on each committed write, reads the new `sync_actions` rows in sync-id order and
hands them to every open socket of that process. Each process has its own
LISTEN connection, so several API workers fan out without anything but
PostgreSQL. The hub also polls, so a lost notification or a dropped LISTEN
connection only delays a change, never loses it.

A socket (`serve_socket`) first catches up from the client's last sync id with
`changes_since`, then forwards the hub's rows its member's sync groups may
see. It subscribes before catching up and skips what it already sent by sync
id, so the hand-over from catch-up to live has no gap and no duplicate. A
change to the member's own membership, teams or role recomputes the groups
before the next row is sent; a member taken out of the workspace is
disconnected at that row.

Messages, all JSON objects with a `type`:
- `delta`: `{"actions": [...], "last_sync_id": N}`, actions in sync-id order;
- `caught_up`: `{"last_sync_id": N}`, once, after the missed changes;
- `sync_groups`: `{"sync_groups", "added", "removed"}` when they change, so the
  client can bootstrap what it newly sees;
- `ping` every `HEARTBEAT_SECONDS`; the client may send `ping` and gets `pong`.
"""

import asyncio
import json
import logging
from contextlib import suppress
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from starlette.websockets import WebSocket, WebSocketDisconnect

from database.models import SyncAction, WebSession
from database.sync_bootstrap import bootstrap_sync_groups
from database.sync_log import NOTIFY_CHANNEL, changes_since, last_sync_id, needs_bootstrap

logger = logging.getLogger(__name__)

BATCH = 500
# The hub reads the log this often even without a notification.
POLL_SECONDS = 5.0
HEARTBEAT_SECONDS = 25.0
READY_TIMEOUT_SECONDS = 10.0
# A socket this far behind is closed; the client reconnects and catches up from the database.
MAX_PENDING_BATCHES = 1000
# Entries of these models may change who sees what: the socket recomputes its member's groups.
REGROUP_MODELS = {"WorkspaceMember", "Team", "TeamMember"}

# Close codes, in the 4000–4999 range left to applications.
CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404
CLOSE_BOOTSTRAP = 4410
CLOSE_TOO_SLOW = 4429


@dataclass(frozen=True)
class Change:
    sync_id: int
    model: str
    groups: frozenset
    data: dict
    message: dict


def action_message(row: SyncAction) -> dict:
    """One change as the client receives it, over the socket and from /sync/delta alike."""
    return {
        "sync_id": row.sync_id,
        "model": row.model,
        "model_id": row.model_id,
        "action": row.action,
        "data": row.data,
    }


def _change(row: SyncAction) -> Change:
    return Change(row.sync_id, row.model, frozenset(row.sync_groups), row.data or {}, action_message(row))


class Subscription:
    def __init__(self, hub: "SyncHub"):
        self.hub = hub
        self.queue: asyncio.Queue = asyncio.Queue()
        self.overflowed = False

    def push(self, changes: list[Change]) -> None:
        if self.overflowed:
            return
        if self.queue.qsize() >= MAX_PENDING_BATCHES:
            self.overflowed = True
            self.queue.put_nowait(None)
            return
        self.queue.put_nowait(changes)

    def close(self) -> None:
        self.hub.subscriptions.discard(self)


class SyncHub:
    """This process's reader of the change log; sockets subscribe to it."""

    def __init__(self, sessions):
        self.sessions = sessions
        self.subscriptions: set[Subscription] = set()
        self.cursor: Optional[int] = None
        self._wake = asyncio.Event()
        self._ready = asyncio.Event()
        self._task: Optional[asyncio.Task] = None

    async def subscribe(self) -> Subscription:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="sync-hub")
        # A database that is down fails the connect instead of leaving it waiting.
        await asyncio.wait_for(self._ready.wait(), READY_TIMEOUT_SECONDS)
        subscription = Subscription(self)
        self.subscriptions.add(subscription)
        return subscription

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    def _notified(self, *_args) -> None:
        self._wake.set()

    async def _run(self) -> None:
        engine = self.sessions.kw["bind"]
        while True:
            try:
                async with engine.connect() as conn:
                    raw = (await conn.get_raw_connection()).driver_connection
                    await raw.add_listener(NOTIFY_CHANNEL, self._notified)
                    try:
                        # LISTEN comes first: a write committed after this read still wakes the hub.
                        if self.cursor is None:
                            async with self.sessions() as session:
                                self.cursor = await last_sync_id(session)
                        self._ready.set()
                        while True:
                            await self._read()
                            with suppress(asyncio.TimeoutError):
                                await asyncio.wait_for(self._wake.wait(), POLL_SECONDS)
                            self._wake.clear()
                    finally:
                        with suppress(Exception):
                            await raw.remove_listener(NOTIFY_CHANNEL, self._notified)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Sync hub lost its connection; reconnecting")
                await asyncio.sleep(1)

    async def _read(self) -> None:
        """Hand every row committed since the cursor to the subscribers, in sync-id order.

        Sync ids are assigned and committed under one lock, so nothing below a row already read can appear later.
        """
        while True:
            async with self.sessions() as session:
                rows = (
                    await session.execute(
                        select(SyncAction)
                        .where(SyncAction.sync_id > self.cursor)
                        .order_by(SyncAction.sync_id)
                        .limit(BATCH)
                    )
                ).scalars().all()
            if not rows:
                return
            changes = [_change(row) for row in rows]
            self.cursor = changes[-1].sync_id
            for subscription in list(self.subscriptions):
                subscription.push(changes)
            if len(rows) < BATCH:
                return


class _Closed(Exception):
    def __init__(self, code: int, reason: str):
        self.code, self.reason = code, reason


class SocketSession:
    """One client's socket: catch-up, then live changes in its member's groups."""

    def __init__(self, websocket: WebSocket, sessions, hub: SyncHub, user, member, web_session_id):
        self.websocket = websocket
        self.sessions = sessions
        self.hub = hub
        self.user = user
        self.member = member
        self.web_session_id = web_session_id
        self.groups: set[str] = set()
        # The highest sync id accounted for: sent, or not for this member.
        self.through = 0

    async def send(self, message: dict) -> None:
        await self.websocket.send_text(json.dumps(message, separators=(",", ":"), default=str))

    async def run(self, after: int) -> None:
        async with self.sessions() as session:
            if await needs_bootstrap(session, after):
                raise _Closed(CLOSE_BOOTSTRAP, "bootstrap")
            self.groups = set(await bootstrap_sync_groups(session, self.member))
        subscription = await self.hub.subscribe()
        try:
            await self._catch_up(after)
            listener = asyncio.create_task(self._listen())
            pump = asyncio.create_task(self._pump(subscription))
            try:
                done, _ = await asyncio.wait({listener, pump}, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in (listener, pump):
                    task.cancel()
                    with suppress(asyncio.CancelledError, WebSocketDisconnect, _Closed):
                        await task
        finally:
            subscription.close()

    async def _catch_up(self, after: int) -> None:
        self.through = after
        while True:
            async with self.sessions() as session:
                rows = await changes_since(session, sorted(self.groups), self.through, BATCH)
            if rows:
                self.through = rows[-1].sync_id
                await self.send(
                    {"type": "delta", "actions": [action_message(row) for row in rows], "last_sync_id": self.through}
                )
            if len(rows) < BATCH:
                break
        await self.send({"type": "caught_up", "last_sync_id": self.through})

    async def _listen(self) -> None:
        while True:
            text = await self.websocket.receive_text()
            with suppress(ValueError, AttributeError):
                if json.loads(text).get("type") == "ping":
                    await self.send({"type": "pong"})

    async def _pump(self, subscription: Subscription) -> None:
        while True:
            try:
                changes = await asyncio.wait_for(subscription.queue.get(), HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                await self._check_session()
                await self.send({"type": "ping"})
                continue
            if changes is None:
                raise _Closed(CLOSE_TOO_SLOW, "behind")
            await self._deliver(changes)

    async def _deliver(self, changes: list[Change]) -> None:
        pending = []
        for change in changes:
            if change.sync_id <= self.through:
                continue
            self.through = change.sync_id
            visible = bool(change.groups & self.groups)
            if visible:
                pending.append(change.message)
            if self._may_regroup(change):
                # Rows before the change go out under the old groups, rows after it under the new ones.
                await self._flush(pending)
                pending = []
                await self._regroup()
                if not visible and change.groups & self.groups:
                    # The new public team itself opens its group.
                    pending.append(change.message)
        await self._flush(pending)

    def _may_regroup(self, change: Change) -> bool:
        if change.model == "Team":
            # A new team, or one made private or public; its group may not be this member's yet. A rename is not.
            workspace_id = change.data.get("workspace_id")
            if workspace_id is not None:
                return workspace_id == self.member.workspace_id
            return "private" in change.data
        return change.model in REGROUP_MODELS and bool(change.groups & self.groups)

    async def _flush(self, actions: list[dict]) -> None:
        if actions:
            await self.send({"type": "delta", "actions": actions, "last_sync_id": self.through})

    async def _regroup(self) -> None:
        from api.deps import get_user_workspace_member

        async with self.sessions() as session:
            _ws, member = await get_user_workspace_member(session, self.user, workspace_id=self.member.workspace_id)
            if member is None:
                raise _Closed(CLOSE_FORBIDDEN, "removed")
            groups = set(await bootstrap_sync_groups(session, member))
        self.member = member
        if groups != self.groups:
            added, removed = sorted(groups - self.groups), sorted(self.groups - groups)
            self.groups = groups
            await self.send({"type": "sync_groups", "sync_groups": sorted(groups), "added": added, "removed": removed})

    async def _check_session(self) -> None:
        """A signed-out browser session ends its sockets at the next heartbeat."""
        if self.web_session_id is None:
            return
        from api.auth import _as_utc, _utc_now

        async with self.sessions() as session:
            web_session = await session.get(WebSession, self.web_session_id)
        if web_session is None or web_session.revoked_at is not None or _as_utc(web_session.expires_at) <= _utc_now():
            raise _Closed(CLOSE_UNAUTHORIZED, "signed out")


async def serve_socket(websocket: WebSocket, sessions, hub: SyncHub, user, member, web_session_id, after: int):
    """Run an accepted socket until the client leaves or the server closes it."""
    try:
        await SocketSession(websocket, sessions, hub, user, member, web_session_id).run(after)
    except _Closed as closed:
        with suppress(Exception):
            await websocket.close(code=closed.code, reason=closed.reason)
    except WebSocketDisconnect:
        pass
