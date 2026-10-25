"""The sync engine's endpoints, as Linear's /sync/bootstrap, /sync/archived_models, /sync/delta and its socket.

`GET /api/sync/bootstrap` gives a fresh client every synced model the member
may see in the active workspace and the sync id it is current to; the client
then catches up from that id. `GET /api/sync/archived-models` gives archived
and recently deleted ones, loaded when the client opens them. Both are one
round trip, gzipped when the client accepts it. See database/sync_bootstrap.py.

`WS /api/sync/ws?since=<id>` sends the changes after that id, then every new
one as it commits (#506, api/sync_stream.py). `GET /api/sync/delta?since=<id>`
is the same catch-up over HTTP. Either says when the id is older than the log
keeps, and the client bootstraps again.
"""

import gzip
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket

from api.auth import ACCOUNT_HEADER_NAME, get_authenticated_user, get_current_user
from api.deps import get_user_workspace_member
from api.sync_stream import (
    BATCH,
    CLOSE_BOOTSTRAP,
    CLOSE_FORBIDDEN,
    CLOSE_NOT_FOUND,
    CLOSE_UNAUTHORIZED,
    SyncHub,
    action_message,
    serve_socket,
)
from core.config import settings
from database.db import async_session_maker
from database.models import User
from database.sync_bootstrap import archived_json, begin_snapshot, bootstrap_json, bootstrap_sync_groups
from database.sync_log import changes_since, last_sync_id, needs_bootstrap

router = APIRouter(prefix="/sync", tags=["Sync"])

# Below this a gzip frame costs more than it saves.
GZIP_MIN_BYTES = 1024


def _json_response(request: Request, body: str) -> Response:
    data = body.encode()
    headers = {"Cache-Control": "no-store", "Vary": "Accept-Encoding"}
    if len(data) >= GZIP_MIN_BYTES and "gzip" in request.headers.get("accept-encoding", ""):
        data = gzip.compress(data, compresslevel=6)
        headers["Content-Encoding"] = "gzip"
    return Response(content=data, media_type="application/json", headers=headers)


async def _snapshot_of(build, request: Request, user: User) -> Response:
    async with async_session_maker() as session:
        # The workspace and member are read in the same snapshot as the models.
        await begin_snapshot(session)
        ws, member = await get_user_workspace_member(session, user)
        if not ws or not member:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        body = await build(session, member)
    return _json_response(request, body)


@router.get("/bootstrap")
async def bootstrap(request: Request, user: User = Depends(get_current_user)):
    """Every synced model the member may see in the active workspace, as of `last_sync_id`."""
    return await _snapshot_of(bootstrap_json, request, user)


@router.get("/archived-models")
async def archived_models(request: Request, user: User = Depends(get_current_user)):
    """Deleted teams with what was on them, deleted Inbox notifications, and Recently deleted rules and labels."""
    return await _snapshot_of(archived_json, request, user)


@router.get("/delta")
async def delta(
    since: int = Query(..., ge=0),
    limit: int = Query(BATCH, ge=1, le=5000),
    user: User = Depends(get_current_user),
):
    """The member's changes after sync id `since`, oldest first; 410 when the log no longer reaches back that far."""
    async with async_session_maker() as session:
        await begin_snapshot(session)
        ws, member = await get_user_workspace_member(session, user)
        if not ws or not member:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        if await needs_bootstrap(session, since):
            raise HTTPException(status_code=410, detail="bootstrap")
        groups = await bootstrap_sync_groups(session, member)
        rows = await changes_since(session, groups, since, limit + 1)
        newest = await last_sync_id(session)
    has_more = len(rows) > limit
    rows = rows[:limit]
    # With nothing more to send the client is current to the newest id, not just its last change.
    through = rows[-1].sync_id if has_more else max(newest, since)
    return {
        "actions": [action_message(row) for row in rows],
        "last_sync_id": through,
        "has_more": has_more,
        "sync_groups": groups,
    }


def _origin_allowed(websocket: WebSocket) -> bool:
    """Browsers send cookies with any page's socket, so only the app's own pages may open one."""
    origin = (websocket.headers.get("origin") or "").rstrip("/")
    if not origin:
        return True
    allowed = {o.strip().rstrip("/") for o in settings.CORS_ORIGINS.split(",") if o.strip()}
    if settings.WEBAPP_URL:
        allowed.add(settings.WEBAPP_URL.rstrip("/"))
    return origin in allowed or urlsplit(origin).netloc == websocket.headers.get("host", "")


async def _socket_user(websocket: WebSocket) -> tuple[User, Optional[str], list]:
    """The session check of every request, on the upgrade request.

    A browser socket cannot send headers, so the account and workspace come as `?account=` and `?workspace=`.
    Returns the user, its web session id and the Set-Cookie headers of a rotated session.
    """
    params = websocket.query_params
    headers = [(k, v) for k, v in websocket.scope["headers"] if k != ACCOUNT_HEADER_NAME.encode()]
    if params.get("account"):
        headers.append((ACCOUNT_HEADER_NAME.encode(), params["account"].encode()))
    request = Request({**websocket.scope, "type": "http", "method": "GET", "headers": headers})
    response = Response()
    user = await get_authenticated_user(
        request,
        response,
        authorization=websocket.headers.get("authorization"),
        x_auth_token=websocket.headers.get("x-auth-token"),
        dev_user_id=params.get("dev_user_id"),
    )
    user = await get_current_user(user, x_workspace_slug=params.get("workspace"))
    cookies = [(k, v) for k, v in response.raw_headers if k == b"set-cookie"]
    return user, getattr(request.state, "web_session_id", None), cookies


def sync_hub(app) -> SyncHub:
    hub = getattr(app.state, "sync_hub", None)
    if hub is None:
        hub = app.state.sync_hub = SyncHub(async_session_maker)
    return hub


@router.websocket("/ws")
async def sync_socket(websocket: WebSocket):
    """Changes after `?since=` in the member's sync groups, then each new one as it commits.

    Refusals are close codes after the handshake, which a browser can read: 4401 not signed in, 4403 no access or
    taken out of the workspace, 4404 no workspace, 4410 bootstrap again.
    """
    if not _origin_allowed(websocket):
        await websocket.close(code=CLOSE_FORBIDDEN)
        return
    since = websocket.query_params.get("since", "")
    try:
        user, web_session_id, cookies = await _socket_user(websocket)
    except HTTPException as error:
        await websocket.accept()
        await websocket.close(code=CLOSE_UNAUTHORIZED if error.status_code == 401 else CLOSE_FORBIDDEN,
                              reason=str(error.detail)[:120])
        return
    await websocket.accept(headers=cookies)
    if not since.isdigit():
        await websocket.close(code=CLOSE_BOOTSTRAP, reason="since")
        return
    async with async_session_maker() as session:
        ws, member = await get_user_workspace_member(session, user)
    if not ws or not member:
        await websocket.close(code=CLOSE_NOT_FOUND, reason="workspace")
        return
    await serve_socket(websocket, async_session_maker, sync_hub(websocket.app), user, member, web_session_id, int(since))
