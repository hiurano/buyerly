"""The sync engine's change log, as Linear's sync actions (#504).

Every write to a synced model leaves one row in `sync_actions`: the model, its
id, the action (insert / update / archive / delete), the fields it changed with
their new values, and the sync groups that may see it. A client that holds sync
id N catches up with the rows after N in its member's groups (`changes_since`);
#505 bootstraps from scratch and #506 pushes the same rows over a WebSocket.

The rows are written by PostgreSQL triggers on the synced tables, so ORM
writes, bulk `update()` / `delete()` statements and foreign-key cascades are
logged alike, always in the transaction of the write: a rolled-back write
leaves nothing behind.

Sync ids follow commit order, not write order. A row gets its sync id from a
deferred trigger that runs at commit under a transaction-level advisory lock,
so a reader that has seen sync id X will never later find a smaller one
committed after it. The lock is held only from that trigger to the end of the
commit, never while a request or a worker cycle is still running.

Sync groups are strings, Linear's are UUIDs of the organization, a team or a
user:

- `workspace:<id>`: everyone in the workspace, guests too (the workspace,
  its members and their profiles, labels, default views);
- `workspace:<id>:members`: everyone but guests (rules, ad accounts on no
  team, events on no ad account);
- `team:<id>`: a team's data (the team, its members, ad accounts, documents);
  every non-guest has every public team's group, everyone has their own teams';
- `member:<id>`: one workspace member's private data (favorites, view
  settings, the bell on an ad account, Inbox state and options).

An ad account goes to the groups of the teams it is on, or to
`workspace:<id>:members` when it is on none, which is `core.account_access`'s
rule in sync groups. Changing the triggers takes a migration that runs
`install_statements()` again: it only replaces functions and triggers.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select, text

SYNC_LOG_RETENTION_DAYS = 30
# Linear's client bootstraps again when its last sync id is older than what the server still has.
STATE_KEY = "sync_log"
# pg_advisory_xact_lock key that orders sync ids by commit; any constant unused elsewhere.
COMMIT_ORDER_LOCK = 504_000_504

ACTIONS = ("insert", "update", "archive", "delete")


class Synced:
    """How one table is logged: its model name, columns kept out, and its soft-delete column."""

    def __init__(self, model: str, excluded: tuple = (), archive: str = "", private: tuple = ()):
        self.model = model
        self.excluded = excluded
        self.archive = archive
        self.private = private


# Every synced table. `excluded` are secrets and worker bookkeeping nobody's client holds; an update that
# changes only those leaves no entry. `private` (workspace members only) goes to the member's own group.
SYNCED_TABLES = {
    "workspaces": Synced("Workspace"),
    "workspace_members": Synced(
        "WorkspaceMember",
        private=("inbox_read_before", "inbox_deleted_before", "inbox_display", "notification_channels"),
    ),
    "users": Synced(
        "User",
        excluded=(
            "telegram_id", "email_verified_at", "unconfirmed_email", "onboarding_step",
            "onboarding_completed", "auth_token", "role", "is_approved", "active_workspace_id",
        ),
    ),
    "teams": Synced("Team", archive="deleted_at"),
    "team_members": Synced("TeamMember"),
    "team_accounts": Synced("TeamAccount"),
    "team_documents": Synced("TeamDocument"),
    "accounts": Synced(
        "Account",
        excluded=("access_token", "access_token_encrypted", "last_started_date", "last_day_start_date"),
    ),
    "rule_presets": Synced("Rule"),
    "rule_groups": Synced("Label"),
    "rule_group_items": Synced("RuleLabel"),
    "audit_events": Synced("InboxEvent"),
    "inbox_notification_states": Synced("InboxNotificationState"),
    "favorites": Synced("Favorite"),
    "view_settings": Synced("ViewSetting"),
    "workspace_view_defaults": Synced("WorkspaceViewDefault"),
    "account_notification_settings": Synced("AccountNotificationSetting"),
}


_ACCOUNT_GROUPS_SQL = """
CREATE OR REPLACE FUNCTION sync_log_account_groups(account_pk integer, ws integer) RETURNS text[]
LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN count(*) = 0 THEN ARRAY['workspace:' || ws || ':members']
                ELSE array_agg('team:' || ta.team_id ORDER BY ta.team_id) END
    FROM team_accounts ta JOIN teams t ON t.id = ta.team_id
    WHERE ta.account_id = account_pk AND t.deleted_at IS NULL
$$
"""

_GROUPS_SQL = """
CREATE OR REPLACE FUNCTION sync_log_groups(tbl text, rec jsonb) RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
    groups text[];
BEGIN
    CASE tbl
    WHEN 'workspaces' THEN
        groups := ARRAY['workspace:' || (rec->>'id')];
    WHEN 'workspace_members', 'workspace_view_defaults', 'rule_groups' THEN
        groups := ARRAY['workspace:' || (rec->>'workspace_id')];
    WHEN 'users' THEN
        SELECT array_agg('workspace:' || m.workspace_id ORDER BY m.workspace_id) INTO groups
        FROM workspace_members m WHERE m.user_id = (rec->>'id')::integer;
    WHEN 'rule_presets' THEN
        groups := ARRAY['workspace:' || (rec->>'workspace_id') || ':members'];
    WHEN 'rule_group_items' THEN
        SELECT ARRAY['workspace:' || p.workspace_id || ':members'] INTO groups
        FROM rule_presets p WHERE p.id = (rec->>'preset_id')::integer;
    WHEN 'accounts' THEN
        groups := sync_log_account_groups((rec->>'id')::integer, (rec->>'workspace_id')::integer);
    WHEN 'teams' THEN
        groups := ARRAY['team:' || (rec->>'id')];
    WHEN 'team_members' THEN
        -- The member hears of their own membership even when it takes them off a private team.
        groups := ARRAY['team:' || (rec->>'team_id'), 'member:' || (rec->>'member_id')];
    WHEN 'team_documents' THEN
        groups := ARRAY['team:' || (rec->>'team_id')];
    WHEN 'team_accounts' THEN
        SELECT ARRAY['team:' || (rec->>'team_id')] || sync_log_account_groups(a.id, a.workspace_id) INTO groups
        FROM accounts a WHERE a.id = (rec->>'account_id')::integer;
        groups := coalesce(groups, ARRAY['team:' || (rec->>'team_id')]);
    WHEN 'audit_events' THEN
        IF coalesce(rec->>'account_id', '') <> '' THEN
            SELECT sync_log_account_groups(a.id, a.workspace_id) INTO groups
            FROM accounts a WHERE a.account_id = rec->>'account_id';
        END IF;
        groups := coalesce(groups, ARRAY['workspace:' || (rec->>'workspace_id') || ':members']);
    WHEN 'inbox_notification_states' THEN
        SELECT ARRAY['member:' || m.id] INTO groups
        FROM audit_events e JOIN workspace_members m ON m.workspace_id = e.workspace_id
        WHERE e.id = (rec->>'audit_event_id')::integer AND m.user_id = (rec->>'user_id')::integer;
    WHEN 'favorites', 'view_settings', 'account_notification_settings' THEN
        groups := ARRAY['member:' || (rec->>'member_id')];
    ELSE
        RAISE EXCEPTION 'sync_log_groups: % is not a synced table', tbl;
    END CASE;
    -- A legacy row with no workspace yields NULL groups: nobody receives it.
    RETURN array_remove(groups, NULL);
END
$$
"""

_RECORD_SQL = """
CREATE OR REPLACE FUNCTION sync_log_record() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    model text := TG_ARGV[0];
    excluded text[] := TG_ARGV[1]::text[];
    archive_column text := TG_ARGV[2];
    private_columns text[] := TG_ARGV[3]::text[];
    rec jsonb;
    data jsonb;
    private_data jsonb := '{}';
    action text;
    groups text[];
BEGIN
    IF TG_OP = 'DELETE' THEN
        rec := to_jsonb(OLD);
        action := 'delete';
        data := '{}';
    ELSIF TG_OP = 'INSERT' THEN
        rec := to_jsonb(NEW);
        action := 'insert';
        data := rec - excluded - private_columns;
    ELSE
        rec := to_jsonb(NEW);
        action := 'update';
        SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}') INTO data
        FROM jsonb_each(rec - excluded) n
        WHERE to_jsonb(OLD) -> n.key IS DISTINCT FROM n.value;
        SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}') INTO private_data
        FROM jsonb_each(data) n WHERE n.key = ANY(private_columns);
        data := data - private_columns;
        IF archive_column <> '' AND data ? archive_column
           AND to_jsonb(OLD) ->> archive_column IS NULL AND rec ->> archive_column IS NOT NULL THEN
            action := 'archive';
        END IF;
    END IF;

    -- A member's own Inbox options go to them alone, the rest of the row to the workspace.
    IF private_data <> '{}' THEN
        INSERT INTO sync_actions (model, model_id, action, data, sync_groups)
        VALUES (model, rec->>'id', 'update', private_data, ARRAY['member:' || (rec->>'id')]);
    END IF;
    IF action = 'update' AND data = '{}' THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    groups := sync_log_groups(TG_TABLE_NAME, rec);
    IF coalesce(cardinality(groups), 0) > 0 THEN
        INSERT INTO sync_actions (model, model_id, action, data, sync_groups)
        VALUES (model, rec->>'id', action, data, groups);
    END IF;
    -- BEFORE DELETE needs OLD back, or the delete would be skipped; AFTER triggers ignore it.
    RETURN coalesce(NEW, OLD);
END
$$
"""

_ASSIGN_ID_SQL = """
CREATE OR REPLACE FUNCTION sync_log_assign_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(%(lock)d);
    UPDATE sync_actions SET sync_id = nextval('sync_actions_sync_id_seq') WHERE id = NEW.id;
    RETURN NULL;
END
$$
""" % {"lock": COMMIT_ORDER_LOCK}


def _array(values: tuple) -> str:
    return "{" + ",".join(values) + "}"


def _table_trigger_statements(table: str, synced: Synced) -> list[str]:
    args = ", ".join(
        f"'{value}'"
        for value in (synced.model, _array(synced.excluded), synced.archive, _array(synced.private))
    )
    # Deletes are read before the row goes, while the team links an ad account's groups come from still exist.
    return [
        f"DROP TRIGGER IF EXISTS sync_log_write ON {table}",
        f"CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON {table} "
        f"FOR EACH ROW EXECUTE FUNCTION sync_log_record({args})",
        f"DROP TRIGGER IF EXISTS sync_log_delete ON {table}",
        f"CREATE TRIGGER sync_log_delete BEFORE DELETE ON {table} "
        f"FOR EACH ROW EXECUTE FUNCTION sync_log_record({args})",
    ]


def install_statements() -> list[str]:
    """Functions and triggers that fill `sync_actions`, one statement each; safe to run again over an older version.

    Run them with `exec_driver_sql`: `text()` would read `':members'` as a bind parameter.
    """
    statements = ["CREATE SEQUENCE IF NOT EXISTS sync_actions_sync_id_seq", _ACCOUNT_GROUPS_SQL, _GROUPS_SQL, _RECORD_SQL, _ASSIGN_ID_SQL]
    statements += [
        "DROP TRIGGER IF EXISTS sync_actions_assign_id ON sync_actions",
        "CREATE CONSTRAINT TRIGGER sync_actions_assign_id AFTER INSERT ON sync_actions "
        "DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sync_log_assign_id()",
    ]
    for table, synced in SYNCED_TABLES.items():
        statements += _table_trigger_statements(table, synced)
    return statements


def uninstall_statements() -> list[str]:
    statements = []
    for table in SYNCED_TABLES:
        statements += [
            f"DROP TRIGGER IF EXISTS sync_log_write ON {table}",
            f"DROP TRIGGER IF EXISTS sync_log_delete ON {table}",
        ]
    return statements + [
        "DROP TRIGGER IF EXISTS sync_actions_assign_id ON sync_actions",
        "DROP FUNCTION IF EXISTS sync_log_assign_id()",
        "DROP FUNCTION IF EXISTS sync_log_record()",
        "DROP FUNCTION IF EXISTS sync_log_groups(text, jsonb)",
        "DROP FUNCTION IF EXISTS sync_log_account_groups(integer, integer)",
    ]


async def member_sync_groups(session, member) -> list[str]:
    """The sync groups a workspace member receives, as Linear's /sync/user_sync_groups.

    Deleted teams stay in: their archive entry still has to reach the people who had the team.
    """
    from database.models import Team, TeamMember

    ws = member.workspace_id
    groups = {f"workspace:{ws}", f"member:{member.id}"}
    own = select(TeamMember.team_id).where(TeamMember.member_id == member.id)
    teams = select(Team.id).where(Team.workspace_id == ws, Team.id.in_(own))
    if member.role != "guest":
        groups.add(f"workspace:{ws}:members")
        teams = select(Team.id).where(Team.workspace_id == ws, (Team.private.is_(False)) | Team.id.in_(own))
    groups.update(f"team:{team_id}" for team_id in (await session.execute(teams)).scalars())
    return sorted(groups)


async def changes_since(session, groups: list[str], after: int = 0, limit: int = 1000):
    """Entries after sync id `after` in any of `groups`, oldest first: one query on the sync id and group indexes."""
    from database.models import SyncAction

    return (
        await session.execute(
            select(SyncAction)
            .where(SyncAction.sync_id > after, SyncAction.sync_groups.overlap(groups))
            .order_by(SyncAction.sync_id)
            .limit(limit)
        )
    ).scalars().all()


async def last_sync_id(session) -> int:
    """The newest sync id; a fresh client starts from here after bootstrapping."""
    from database.models import SyncAction

    newest = (await session.execute(select(func.max(SyncAction.sync_id)))).scalar()
    # An emptied log still remembers how far it went.
    return max(newest or 0, await compacted_through(session))


async def compacted_through(session) -> int:
    """The highest sync id already dropped; a client behind it must bootstrap again."""
    from database.models import AutomationRuntimeState

    state = await session.get(AutomationRuntimeState, STATE_KEY)
    return int((state.payload or {}).get("compacted_through", 0)) if state else 0


async def needs_bootstrap(session, after: int) -> bool:
    return after < await compacted_through(session)


async def compact_sync_log(session, now: Optional[datetime] = None) -> int:
    """Drop entries older than the retention window and remember how far; returns how many went."""
    from database.models import AutomationRuntimeState

    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=SYNC_LOG_RETENTION_DAYS)
    through = (
        await session.execute(
            text("SELECT max(sync_id) FROM sync_actions WHERE created_at < :cutoff AND sync_id IS NOT NULL"),
            {"cutoff": cutoff},
        )
    ).scalar()
    if through is None:
        return 0
    deleted = (
        await session.execute(text("DELETE FROM sync_actions WHERE sync_id <= :through"), {"through": through})
    ).rowcount
    previous = await compacted_through(session)
    state = await session.get(AutomationRuntimeState, STATE_KEY)
    if state is None:
        state = AutomationRuntimeState(state_key=STATE_KEY, payload={})
        session.add(state)
    state.payload = {**(state.payload or {}), "compacted_through": max(through, previous)}
    await session.commit()
    return deleted


async def run_sync_log_compaction_tick() -> None:
    """The worker's daily pass over the change log."""
    from database.db import async_session_maker

    async with async_session_maker() as session:
        await compact_sync_log(session)
