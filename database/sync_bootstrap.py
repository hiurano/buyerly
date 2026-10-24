"""The sync engine's bootstrap, as Linear's /sync/bootstrap and /sync/archived_models (#505).

A fresh client asks once for every synced model its member may see in the
workspace, plus the sync id that data is current to, and then catches up from
that id with the change log (#504, `changes_since`) or the WebSocket (#506).

Two rules keep bootstrap and the log in agreement:

- visibility is the log's: a row is returned when `sync_log_groups`, the very
  function the triggers use, gives it a group the member has, and its fields
  are the log's (`to_jsonb` of the row less the excluded and private columns);
- everything is read in one REPEATABLE READ snapshot, the sync id included.
  A write is in the snapshot with all its log entries or not at all, and sync
  ids follow commit order, so every write with a sync id up to the returned
  one is in the data and every write after it is not.

Archived rows (deleted teams with what was on them, Inbox notifications the
member deleted, rules and labels in Recently deleted) stay out of bootstrap and
come from `archived_models`, which the client loads when it opens them.

Each model is aggregated to JSON inside PostgreSQL and joined into the
response as text, so Python never parses the rows.
"""

import json

from sqlalchemy import Integer, Text, bindparam, select, text
from sqlalchemy.dialects.postgresql import ARRAY

from database.sync_log import SYNCED_TABLES, last_sync_id, member_sync_groups

# Which rows of a synced table could be the workspace's: a cheap prefilter on indexed columns, so the groups
# function runs only on them. `sync_log_groups` still decides. `:ws` is the workspace, `:member` the member's
# row id (NULL for support access), `:user` their user id.
_ACTIVE_TEAMS = "SELECT id FROM teams WHERE workspace_id = :ws AND deleted_at IS NULL"
_DELETED_TEAMS = "SELECT id FROM teams WHERE workspace_id = :ws AND deleted_at IS NOT NULL"
_EVENTS = "SELECT id FROM audit_events WHERE workspace_id = :ws"

ACTIVE_SCOPES = {
    "workspaces": "t.id = :ws",
    "workspace_members": "t.workspace_id = :ws",
    "users": "t.id IN (SELECT user_id FROM workspace_members WHERE workspace_id = :ws)",
    "teams": "t.workspace_id = :ws AND t.deleted_at IS NULL",
    "team_members": f"t.team_id IN ({_ACTIVE_TEAMS})",
    "team_accounts": f"t.team_id IN ({_ACTIVE_TEAMS})",
    "team_documents": f"t.team_id IN ({_ACTIVE_TEAMS})",
    "accounts": "t.workspace_id = :ws",
    "rule_presets": "t.workspace_id = :ws",
    "rule_groups": "t.workspace_id = :ws",
    "rule_group_items": "t.preset_id IN (SELECT id FROM rule_presets WHERE workspace_id = :ws)",
    "audit_events": "t.workspace_id = :ws",
    "inbox_notification_states": f"t.user_id = :user AND t.deleted_at IS NULL AND t.audit_event_id IN ({_EVENTS})",
    "favorites": "t.member_id = :member",
    "view_settings": "t.member_id = :member",
    "workspace_view_defaults": "t.workspace_id = :ws",
    "account_notification_settings": "t.member_id = :member",
}

ARCHIVED_SCOPES = {
    "teams": "t.workspace_id = :ws AND t.deleted_at IS NOT NULL",
    "team_members": f"t.team_id IN ({_DELETED_TEAMS})",
    "team_accounts": f"t.team_id IN ({_DELETED_TEAMS})",
    "team_documents": f"t.team_id IN ({_DELETED_TEAMS})",
    "inbox_notification_states": (
        f"t.user_id = :user AND t.deleted_at IS NOT NULL AND t.audit_event_id IN ({_EVENTS})"
    ),
}

assert set(ACTIVE_SCOPES) == set(SYNCED_TABLES), "every synced table needs a bootstrap scope"

# Recently deleted rules and labels, the models they were, as the rules list's own visibility (workspace:<id>:members).
DELETED_ITEM_MODELS = {"rule": "Rule", "rule_group": "Label"}


async def begin_snapshot(session) -> None:
    """Start the session's transaction in REPEATABLE READ: every read after this sees one moment.

    Call it before anything else touches the session; the snapshot is taken by the first query.
    """
    await session.connection(execution_options={"isolation_level": "REPEATABLE READ"})


async def bootstrap_sync_groups(session, member) -> list[str]:
    """The member's sync groups; support access without a membership row sees the workspace as an admin would,
    every team included, and has no private data of its own."""
    if member.id is not None:
        return await member_sync_groups(session, member)
    from database.models import Team

    ws = member.workspace_id
    teams = (await session.execute(select(Team.id).where(Team.workspace_id == ws))).scalars()
    return sorted({f"workspace:{ws}", f"workspace:{ws}:members", *(f"team:{team_id}" for team_id in teams)})


_PARAM_TYPES = {"groups": ARRAY(Text), "excluded": ARRAY(Text), "private": ARRAY(Text),
                "ws": Integer, "member": Integer, "user": Integer}
_ALWAYS = ("groups", "excluded", "private")


async def _model_json(session, table: str, scope: str, params: dict) -> str:
    """The rows of `table` in `scope` the groups may see, as a JSON array, in id order."""
    synced = SYNCED_TABLES[table]
    # Private columns go to the row's own member group, as the log sends them.
    statement = text(
        f"""
        SELECT CAST(coalesce(jsonb_agg(
                   CASE WHEN 'member:' || (r.rec->>'id') = ANY(CAST(:groups AS text[]))
                        THEN r.rec - CAST(:excluded AS text[])
                        ELSE r.rec - CAST(:excluded AS text[]) - CAST(:private AS text[]) END
                   ORDER BY r.id), '[]') AS text)
        FROM (SELECT t.id, to_jsonb(t) AS rec FROM {table} t WHERE {scope}) r
        WHERE sync_log_groups('{table}', r.rec) && CAST(:groups AS text[])
        """
    )
    # text() refuses a bindparam it doesn't contain, and scopes use different ones.
    statement = statement.bindparams(
        *(bindparam(name, type_=kind) for name, kind in _PARAM_TYPES.items() if name in _ALWAYS or f":{name}" in scope)
    )
    return (
        await session.execute(
            statement, {**params, "excluded": list(synced.excluded), "private": list(synced.private)}
        )
    ).scalar_one()


def _params(member, groups: list[str]) -> dict:
    return {"groups": groups, "ws": member.workspace_id, "member": member.id, "user": member.user_id}


async def _models_json(session, scopes: dict, params: dict) -> list[tuple[str, str]]:
    # Several tables can be one model in principle; today each is its own.
    return [
        (SYNCED_TABLES[table].model, await _model_json(session, table, scope, params))
        for table, scope in scopes.items()
    ]


def _object(fields: list[tuple[str, str]]) -> str:
    """A JSON object from keys and values already encoded as JSON."""
    return "{" + ",".join(f'"{key}":{value}' for key, value in fields) + "}"


async def bootstrap_json(session, member) -> str:
    """Everything `member` may see, as `{"last_sync_id", "sync_groups", "models": {Model: [rows]}}`.

    Run inside `begin_snapshot`, or the sync id and the rows may come from different moments.
    """
    groups = await bootstrap_sync_groups(session, member)
    sync_id = await last_sync_id(session)
    models = await _models_json(session, ACTIVE_SCOPES, _params(member, groups))
    return _object([
        ("last_sync_id", str(sync_id)),
        ("sync_groups", json.dumps(groups)),
        ("models", _object(models)),
    ])


async def archived_json(session, member) -> str:
    """Archived and recently deleted models `member` may see, in the same shape as bootstrap."""
    from database.models import DeletedItem

    groups = await bootstrap_sync_groups(session, member)
    sync_id = await last_sync_id(session)
    models = await _models_json(session, ARCHIVED_SCOPES, _params(member, groups))
    deleted: dict[str, list] = {model: [] for model in DELETED_ITEM_MODELS.values()}
    if f"workspace:{member.workspace_id}:members" in groups:
        rows = (
            await session.execute(
                select(DeletedItem).where(DeletedItem.workspace_id == member.workspace_id).order_by(DeletedItem.id)
            )
        ).scalars()
        for item in rows:
            model = DELETED_ITEM_MODELS.get(item.kind)
            if model:
                deleted[model].append({
                    "id": item.entity_id,
                    "deleted_item_id": item.id,
                    "name": item.name,
                    "deleted_at": item.deleted_at.isoformat(),
                    "deleted_by_user_id": item.deleted_by_user_id,
                })
    models += [(model, json.dumps(rows)) for model, rows in deleted.items()]
    return _object([
        ("last_sync_id", str(sync_id)),
        ("sync_groups", json.dumps(groups)),
        ("models", _object(models)),
    ])
