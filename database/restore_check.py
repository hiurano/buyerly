"""Check that a restored backup is a database this release can run on (#204).

scripts/drill_restore.sh restores a backup into a throwaway database and then
runs this module inside the API container, so the check uses the deployed
code's own migrations and models:

    python -m database.restore_check --database buyerly_restore_drill

The database the container serves is refused: the check may upgrade the
schema it inspects. Stages are reported separately and the first failed one
stops the check, because each later stage relies on the earlier ones:

1. Schema version. Policy: the restored Alembic revision must be one of this
   release's revisions. The head is accepted as is; an older known revision
   (a backup taken before the last deploy) is upgraded to head in the
   throwaway database, exactly as the migrate step would do after a real
   restore. An empty or multi-row version table, or a revision this release
   does not know (made up, or from a newer release), fails.
2. Schema contract: every table and column of the models with its type
   family (text, number, date and time, JSON...) and every foreign key the
   models declare.
3. Data: all foreign keys in the database are validated, so every restored
   row points at an existing parent; there is at least one user and one
   workspace.
4. Application read: rows of every model load through the ORM and every
   stored Meta token decrypts with this release's key.

Prints counts and revisions only, never row contents or secrets.
"""

import argparse
import asyncio
import sys

from alembic import command
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from alembic.util import CommandError
from sqlalchemy import inspect, select, text, types
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from core.config import settings
from core.meta_tokens import MetaTokenError, decrypt_meta_token
from database.db import Base
from database.migrations import (
    _contract_errors,
    _schema_snapshot,
    _type_contract_errors,
    alembic_config,
)
import database.models  # noqa: F401

APP_READ_ROW_LIMIT = 200


class StageFailed(Exception):
    pass


def _report(ok: bool, stage: str, message: str) -> None:
    label = "[OK]  " if ok else "[FAIL]"
    print(f"  {label} {stage}: {message}", flush=True)


def _fail(stage: str, message: str) -> None:
    _report(False, stage, message)
    raise StageFailed(stage)


def _version_rows(sync_connection) -> list[str] | None:
    if "alembic_version" not in inspect(sync_connection).get_table_names():
        return None
    return [
        row[0]
        for row in sync_connection.execute(text("SELECT version_num FROM alembic_version"))
    ]


async def _check_schema_version(engine, database_url: str) -> None:
    stage = "schema version"
    script = ScriptDirectory.from_config(alembic_config())
    heads = script.get_heads()
    if len(heads) != 1:
        _fail(stage, f"this release has {len(heads)} Alembic heads, expected one")
    head = heads[0]

    async with engine.connect() as connection:
        rows = await connection.run_sync(_version_rows)
    if rows is None:
        _fail(stage, "no alembic_version table")
    if len(rows) != 1:
        _fail(stage, f"alembic_version has {len(rows)} rows, expected one")
    revision = rows[0]
    try:
        known = script.get_revision(revision) is not None
    except CommandError:
        known = False
    if not known:
        _fail(
            stage,
            f"revision {revision!r} is not in this release's migration history "
            f"(head {head}); a made-up revision or a backup from a newer release",
        )
    if revision == head:
        _report(True, stage, f"revision {revision} is this release's head")
        return

    # A backup older than the deployed code: prove the upgrade path works
    # on the throwaway copy. env.py reads the URL from settings.
    previous_url = settings.DATABASE_URL
    settings.DATABASE_URL = database_url
    try:
        await asyncio.to_thread(command.upgrade, alembic_config(), "head")
    except Exception as exc:
        _fail(stage, f"upgrade from {revision} to {head} failed: {type(exc).__name__}")
    finally:
        settings.DATABASE_URL = previous_url
    async with engine.connect() as connection:
        current = await connection.run_sync(
            lambda sync_connection: set(
                MigrationContext.configure(sync_connection).get_current_heads()
            )
        )
    if current != {head}:
        _fail(stage, f"after upgrade the database is at {sorted(current)}, expected {head}")
    _report(True, stage, f"revision {revision} is older than head; upgraded to {head}")


# Coarse type families: a legacy VARCHAR/TEXT or FLOAT/DOUBLE difference is
# harmless, a date stored as text or a number stored as a string is not.
# Float and Double are listed apart from Numeric: SQLAlchemy 2.1 no longer
# derives them from it.
TYPE_FAMILIES = (
    ("boolean", (types.Boolean,)),
    ("integer", (types.Integer,)),
    ("number", (types.Numeric, types.Float, getattr(types, "Double", types.Float))),
    ("date and time", (types.DateTime,)),
    ("date", (types.Date,)),
    ("JSON", (types.JSON,)),
    ("binary", (types.LargeBinary,)),
    ("text", (types.String,)),
)


def _type_family(column_type) -> str:
    for name, classes in TYPE_FAMILIES:
        if isinstance(column_type, classes):
            return name
    return type(column_type).__name__


def _column_type_errors(sync_connection) -> list[str]:
    inspector = inspect(sync_connection)
    table_names = set(inspector.get_table_names())
    errors = []
    for table_name, table in sorted(Base.metadata.tables.items()):
        if table_name not in table_names:
            continue
        actual = {
            column["name"]: column["type"] for column in inspector.get_columns(table_name)
        }
        for column in table.columns:
            if column.name not in actual:
                continue
            expected_family = _type_family(column.type)
            actual_family = _type_family(actual[column.name])
            if expected_family != actual_family:
                errors.append(
                    f"wrong type {table_name}.{column.name}: {actual[column.name]}, "
                    f"expected {expected_family}"
                )
    return errors


def _foreign_key_errors(sync_connection) -> list[str]:
    inspector = inspect(sync_connection)
    table_names = set(inspector.get_table_names())
    errors = []
    for table_name, table in sorted(Base.metadata.tables.items()):
        if table_name not in table_names:
            continue
        actual = {
            (tuple(fk["constrained_columns"]), fk["referred_table"], tuple(fk["referred_columns"]))
            for fk in inspector.get_foreign_keys(table_name)
        }
        for constraint in table.foreign_key_constraints:
            elements = constraint.elements
            expected = (
                tuple(element.parent.name for element in elements),
                constraint.referred_table.name,
                tuple(element.column.name for element in elements),
            )
            if expected not in actual:
                errors.append(
                    f"missing foreign key {table_name}({', '.join(expected[0])}) "
                    f"-> {expected[1]}"
                )
    return errors


async def _check_schema_contract(engine) -> None:
    stage = "schema contract"
    async with engine.connect() as connection:
        errors = _contract_errors(await connection.run_sync(_schema_snapshot))
        errors.extend(await connection.run_sync(_type_contract_errors))
        errors.extend(await connection.run_sync(_column_type_errors))
        errors.extend(await connection.run_sync(_foreign_key_errors))
    if errors:
        more = f" (+{len(errors) - 10} more)" if len(errors) > 10 else ""
        _fail(stage, "; ".join(errors[:10]) + more)
    columns = sum(len(table.columns) for table in Base.metadata.tables.values())
    _report(
        True,
        stage,
        f"all {len(Base.metadata.tables)} model tables, {columns} columns with "
        "their types, and the models' foreign keys are present",
    )


async def _check_data(engine) -> None:
    stage = "data"
    async with engine.connect() as connection:
        total, not_validated = (
            await connection.execute(
                text(
                    "SELECT count(*), count(*) FILTER (WHERE NOT convalidated) "
                    "FROM pg_constraint WHERE contype = 'f' "
                    "AND connamespace = 'public'::regnamespace"
                )
            )
        ).one()
        users = (await connection.execute(text("SELECT count(*) FROM users"))).scalar_one()
        workspaces = (
            await connection.execute(text("SELECT count(*) FROM workspaces"))
        ).scalar_one()
    if not_validated:
        _fail(stage, f"{not_validated} of {total} foreign keys are not validated")
    if users == 0 or workspaces == 0:
        _fail(stage, f"{users} users and {workspaces} workspaces; an empty database is not a usable restore")
    _report(
        True,
        stage,
        f"{users} users, {workspaces} workspaces; all {total} foreign keys hold",
    )


async def _check_application_read(engine) -> None:
    stage = "application read"
    loaded = 0
    models = sorted(Base.registry.mappers, key=lambda mapper: mapper.class_.__name__)
    async with AsyncSession(engine) as session:
        for mapper in models:
            model = mapper.class_
            try:
                result = await session.execute(select(model).limit(APP_READ_ROW_LIMIT))
                loaded += len(result.scalars().all())
            except Exception as exc:
                _fail(stage, f"{model.__name__} rows do not load: {type(exc).__name__}")
            session.expunge_all()

        tokens = (
            await session.execute(
                text(
                    "SELECT access_token_encrypted FROM meta_connections "
                    "WHERE coalesce(access_token_encrypted, '') <> '' "
                    "UNION ALL "
                    "SELECT access_token_encrypted FROM accounts "
                    "WHERE coalesce(access_token_encrypted, '') <> ''"
                )
            )
        ).scalars().all()
    unreadable = 0
    for token in tokens:
        try:
            decrypt_meta_token(token)
        except MetaTokenError:
            unreadable += 1
    if unreadable:
        _fail(
            stage,
            f"{unreadable} of {len(tokens)} Meta tokens do not decrypt with this "
            "release's META_TOKEN_ENCRYPTION_KEY",
        )
    _report(
        True,
        stage,
        f"{loaded} rows of {len(models)} models loaded; "
        f"{len(tokens)} Meta tokens decrypt",
    )


async def check_restored_database(database_url: str) -> bool:
    """Run every stage against ``database_url``; True when all of them pass."""
    engine = create_async_engine(database_url, poolclass=NullPool)
    try:
        await _check_schema_version(engine, database_url)
        await _check_schema_contract(engine)
        await _check_data(engine)
        await _check_application_read(engine)
    except StageFailed:
        return False
    finally:
        await engine.dispose()
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--database", required=True, help="throwaway database with the restored backup")
    args = parser.parse_args(argv)

    live_url = make_url(settings.DATABASE_URL)
    if args.database == live_url.database:
        print(f"[FATAL] {args.database!r} is the database this app serves; use a throwaway copy.")
        return 2
    drill_url = live_url.set(database=args.database).render_as_string(hide_password=False)
    return 0 if asyncio.run(check_restored_database(drill_url)) else 1


if __name__ == "__main__":
    sys.exit(main())
