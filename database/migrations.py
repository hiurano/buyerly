import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from core.config import settings
from database.db import Base


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = PROJECT_ROOT / "alembic.ini"
REQUIRED_COLUMN_TYPES = {
    ("automation_runtime_states", "payload"): "JSONB",
}


def alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    return config


def _schema_snapshot(sync_connection) -> dict[str, set[str]]:
    inspector = inspect(sync_connection)
    return {
        table_name: {
            column["name"]
            for column in inspector.get_columns(table_name)
        }
        for table_name in inspector.get_table_names()
        if table_name != "alembic_version"
    }


def _contract_errors(snapshot: dict[str, set[str]]) -> list[str]:
    errors = []
    expected_tables = Base.metadata.tables
    for table_name, table in sorted(expected_tables.items()):
        actual_columns = snapshot.get(table_name)
        if actual_columns is None:
            errors.append(f"missing table {table_name}")
            continue
        expected_columns = set(table.columns.keys())
        missing_columns = sorted(expected_columns - actual_columns)
        if missing_columns:
            errors.append(
                f"missing columns {table_name}: {', '.join(missing_columns)}"
            )
    return errors


def _type_contract_errors(sync_connection) -> list[str]:
    inspector = inspect(sync_connection)
    table_names = set(inspector.get_table_names())
    errors = []
    for (table_name, column_name), expected_type in REQUIRED_COLUMN_TYPES.items():
        if table_name not in table_names:
            continue
        columns = {
            column["name"]: column
            for column in inspector.get_columns(table_name)
        }
        column = columns.get(column_name)
        if column is None:
            continue
        actual_type = str(column["type"]).upper()
        if expected_type not in actual_type:
            errors.append(
                f"wrong type {table_name}.{column_name}: "
                f"{actual_type}, expected {expected_type}"
            )
    return errors


async def _read_schema_snapshot() -> dict[str, set[str]]:
    import database.models  # noqa: F401

    migration_engine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
    )
    try:
        async with migration_engine.connect() as connection:
            return await connection.run_sync(_schema_snapshot)
    finally:
        await migration_engine.dispose()


async def _assert_database_at_head(config: Config) -> None:
    expected_heads = set(ScriptDirectory.from_config(config).get_heads())

    migration_engine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
    )
    try:
        async with migration_engine.connect() as connection:
            current_heads = set(
                await connection.run_sync(
                    lambda sync_connection: MigrationContext.configure(
                        sync_connection
                    ).get_current_heads()
                )
            )
    finally:
        await migration_engine.dispose()
    if current_heads != expected_heads:
        raise RuntimeError(
            "Alembic revision mismatch after upgrade: "
            f"database={sorted(current_heads)}, expected={sorted(expected_heads)}"
        )


async def _assert_schema_contract() -> None:
    errors = _contract_errors(await _read_schema_snapshot())
    migration_engine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
    )
    try:
        async with migration_engine.connect() as connection:
            errors.extend(
                await connection.run_sync(_type_contract_errors)
            )
    finally:
        await migration_engine.dispose()
    if errors:
        raise RuntimeError(
            "Database schema does not match application models after Alembic: "
            + "; ".join(errors[:20])
        )


async def run_production_migrations() -> None:
    """Run the sole production schema path and fail closed on schema drift."""
    config = alembic_config()
    await asyncio.to_thread(command.upgrade, config, "head")
    await _assert_database_at_head(config)
    await _assert_schema_contract()
