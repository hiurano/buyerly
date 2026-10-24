"""The sync engine's bootstrap endpoints, as Linear's /sync/bootstrap and /sync/archived_models (#505).

`GET /api/sync/bootstrap` gives a fresh client every synced model the member
may see in the active workspace and the sync id it is current to; the client
then catches up from that id. `GET /api/sync/archived-models` gives archived
and recently deleted ones, loaded when the client opens them. Both are one
round trip, gzipped when the client accepts it. See database/sync_bootstrap.py.
"""

import gzip

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from api.auth import get_current_user
from api.deps import get_user_workspace_member
from database.db import async_session_maker
from database.models import User
from database.sync_bootstrap import archived_json, begin_snapshot, bootstrap_json

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
