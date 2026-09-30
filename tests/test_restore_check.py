"""Restore drill verdicts on a real disposable PostgreSQL (#204).

database.restore_check decides whether a restored backup is a database this
release can run on. The first class calls it directly on the test database;
the second runs the real backup_db.sh, restore_db.sh and drill_restore.sh
against local PostgreSQL through a narrow docker adapter (pg_dump and psql
run locally, the API container is this checkout's Python), so it needs
pg_dump, psql, gzip and openssl on PATH.
"""

import asyncio
import contextlib
import io
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from alembic import command
from alembic.script import ScriptDirectory
from cryptography.fernet import Fernet
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from core.config import settings
from core.meta_tokens import encrypt_meta_token
from database.migrations import alembic_config
from database.models import (
    Account,
    AuditEvent,
    RulePreset,
    User,
    Workspace,
    WorkspaceMember,
)
from database.restore_check import check_restored_database, main
from tests.test_db_helper import create_test_engine, get_test_db_url, init_test_db


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TOKEN_KEY = Fernet.generate_key().decode()
# Tables, revision and payload exactly as in the #204 reproduction: names
# are right, nothing else is.
FICTITIOUS_SCHEMA = [
    *(
        f"CREATE TABLE {table} (id SERIAL PRIMARY KEY, marker TEXT)"
        for table in (
            "accounts",
            "rule_presets",
            "rule_groups",
            "audit_events",
            "analytics_entity_daily_facts",
            "users",
            "workspaces",
        )
    ),
    "CREATE TABLE automation_runtime_states "
    "(state_key VARCHAR PRIMARY KEY, payload JSONB, updated_at TIMESTAMPTZ)",
    "INSERT INTO automation_runtime_states VALUES ('control', '{\"marker\": 1}', now())",
    "INSERT INTO users (marker) VALUES ('control')",
    "INSERT INTO workspaces (marker) VALUES ('control')",
    "CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)",
    "INSERT INTO alembic_version VALUES ('deliberately_not_real_revision')",
]


def head_revision() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


async def reset_schema(engine) -> None:
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))


async def upgrade(engine, revision: str = "head") -> None:
    await reset_schema(engine)
    await asyncio.to_thread(command.upgrade, alembic_config(), revision)


async def add_control_records(engine) -> dict:
    """A user who owns a workspace with an ad account, a rule and an event."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        user = User(username="restore-control", email="restore-control@example.test")
        session.add(user)
        await session.flush()
        workspace = Workspace(name="Restore control", slug="restore-control", owner_user_id=user.id)
        session.add(workspace)
        await session.flush()
        session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
        account = Account(
            workspace_id=workspace.id,
            owner_user_id=user.id,
            account_id="act_204",
            name="Restore control account",
            access_token_encrypted=encrypt_meta_token("control-token"),
        )
        preset = RulePreset(workspace_id=workspace.id, owner_user_id=user.id, name="Restore control rule")
        session.add_all([account, preset])
        await session.flush()
        session.add(
            AuditEvent(
                workspace_id=workspace.id,
                account_id=account.account_id,
                event_type="RESTORE_CONTROL",
                action="restore_control",
            )
        )
        await session.commit()
        return {"user": user.id, "workspace": workspace.id, "account": account.id, "preset": preset.id}


CONTROL_SQL = """
    SELECT u.username, w.slug, m.role, a.account_id, a.access_token_encrypted, p.name, e.action
    FROM users u
    JOIN workspaces w ON w.owner_user_id = u.id
    JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = u.id
    JOIN accounts a ON a.workspace_id = w.id AND a.owner_user_id = u.id
    JOIN rule_presets p ON p.workspace_id = w.id
    JOIN audit_events e ON e.workspace_id = w.id AND e.account_id = a.account_id
    WHERE u.username = 'restore-control'
"""


class RestoreCheckTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_test_engine()
        patcher = mock.patch.object(settings, "META_TOKEN_ENCRYPTION_KEY", TOKEN_KEY)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def asyncTearDown(self):
        await init_test_db(self.engine)
        await self.engine.dispose()

    async def run_check(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            ok = await check_restored_database(get_test_db_url())
        return ok, output.getvalue()

    async def execute(self, *statements):
        async with self.engine.begin() as conn:
            for statement in statements:
                await conn.execute(text(statement))

    async def test_real_schema_with_control_records_passes_every_stage(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)

        ok, output = await self.run_check()

        self.assertTrue(ok, output)
        for stage in ("schema version", "schema contract", "data", "application read"):
            self.assertIn(f"[OK]   {stage}:", output)
        self.assertIn(f"revision {head_revision()} is this release's head", output)
        self.assertIn("Meta tokens decrypt: 1 of 1", output)
        self.assertNotIn("control-token", output)

    async def test_fictitious_schema_from_the_issue_fails(self):
        await reset_schema(self.engine)
        await self.execute(*FICTITIOUS_SCHEMA)

        ok, output = await self.run_check()

        self.assertFalse(ok)
        self.assertIn("[FAIL] schema version: revision 'deliberately_not_real_revision'", output)
        self.assertNotIn("[OK]", output)

    async def test_fictitious_schema_fails_the_contract_even_with_a_real_revision(self):
        await reset_schema(self.engine)
        await self.execute(
            *FICTITIOUS_SCHEMA[:-1],
            f"INSERT INTO alembic_version VALUES ('{head_revision()}')",
        )

        ok, output = await self.run_check()

        self.assertFalse(ok)
        self.assertIn("[FAIL] schema contract: missing table", output)
        self.assertIn("missing columns accounts:", output)

    async def test_unknown_revision_on_a_real_schema_fails(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)
        await self.execute("UPDATE alembic_version SET version_num = '9999_from_the_future'")

        ok, output = await self.run_check()

        self.assertFalse(ok)
        self.assertIn("'9999_from_the_future' is not in this release's migration history", output)

    async def test_empty_or_duplicated_version_table_fails(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)
        await self.execute("DELETE FROM alembic_version")
        ok, output = await self.run_check()
        self.assertFalse(ok)
        self.assertIn("alembic_version has 0 rows", output)

        await self.execute(
            f"INSERT INTO alembic_version VALUES ('{head_revision()}'), ('0001_initial_schema')"
        )
        ok, output = await self.run_check()
        self.assertFalse(ok)
        self.assertIn("alembic_version has 2 rows", output)

    async def test_backup_from_an_older_release_is_upgraded_in_the_sandbox(self):
        head = head_revision()
        previous = ScriptDirectory.from_config(alembic_config()).get_revision(head).down_revision
        await upgrade(self.engine, previous)
        # The models match the previous revision for users and workspaces.
        async with AsyncSession(self.engine) as session:
            user = User(username="old", email="old@example.test")
            session.add(user)
            await session.flush()
            session.add(Workspace(name="Old", slug="old", owner_user_id=user.id))
            await session.commit()

        ok, output = await self.run_check()

        self.assertTrue(ok, output)
        self.assertIn(f"revision {previous} is older than head; upgraded to {head}", output)
        async with self.engine.connect() as conn:
            self.assertEqual(
                (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one(),
                head,
            )

    async def test_missing_column_fails_the_schema_contract(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)
        await self.execute("ALTER TABLE rule_presets DROP COLUMN level")

        ok, output = await self.run_check()

        self.assertFalse(ok)
        self.assertIn("[FAIL] schema contract: missing columns rule_presets: level", output)

    async def test_missing_foreign_key_fails_the_schema_contract(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)
        await self.execute("ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_user_id_fkey")

        ok, output = await self.run_check()

        self.assertFalse(ok)
        self.assertIn("missing foreign key workspace_members(user_id) -> users", output)

    async def test_orphaned_rows_behind_an_unvalidated_foreign_key_fail_the_data_stage(self):
        await upgrade(self.engine)
        ids = await add_control_records(self.engine)
        await self.execute(
            "ALTER TABLE workspace_members DROP CONSTRAINT workspace_members_user_id_fkey",
            f"INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) "
            f"SELECT {ids['workspace']}, 424242, 'buyer', now()",
            "ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_user_id_fkey "
            "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID",
        )

        ok, output = await self.run_check()

        self.assertFalse(ok)
        self.assertIn("[OK]   schema contract:", output)
        self.assertIn("[FAIL] data: 1 of", output)

    async def test_database_without_users_fails_the_data_stage(self):
        await upgrade(self.engine)

        ok, output = await self.run_check()

        self.assertFalse(ok)
        self.assertIn("[FAIL] data: users 0, workspaces 0", output)

    async def test_tokens_the_release_cannot_decrypt_fail_the_application_read(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)

        with mock.patch.object(settings, "META_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode()):
            ok, output = await self.run_check()

        self.assertFalse(ok)
        self.assertIn("[FAIL] application read: 1 of 1 Meta tokens do not decrypt", output)

    async def test_column_of_the_wrong_type_fails_the_schema_contract(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)
        # Same name, and the rows still load: only the type contract sees
        # that the app would get text instead of a timestamp.
        await self.execute("ALTER TABLE workspaces ALTER COLUMN created_at TYPE text")

        ok, output = await self.run_check()

        self.assertFalse(ok, output)
        self.assertIn(
            "[FAIL] schema contract: wrong type workspaces.created_at: TEXT, expected date and time",
            output,
        )

    def test_the_database_the_app_serves_is_refused(self):
        live = make_url(settings.DATABASE_URL).database
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(main(["--database", live]), 2)
        self.assertIn("is the database this app serves", output.getvalue())


# pg_dump/psql run locally against the test server; "buyerly" (hardcoded in
# backup_db.sh) is the source database given in SOURCE_DB. The API container
# is this checkout's Python.
FAKE_DOCKER = """#!/usr/bin/env bash
case "$1" in
    inspect) echo running ;;
    exec)
        shift
        [[ "$1" == "-i" ]] && shift
        container="$1"
        shift
        if [[ "${container}" == "buyerly-api" ]]; then
            cd "${PROJECT_ROOT}"
            shift
            exec "${APP_PYTHON}" "$@"
        fi
        args=()
        for arg in "$@"; do
            [[ "${arg}" == "--dbname=buyerly" ]] && arg="--dbname=${SOURCE_DB}"
            args+=("${arg}")
        done
        exec "${args[@]}"
        ;;
esac
"""


@unittest.skipUnless(
    all(shutil.which(tool) for tool in ("pg_dump", "psql", "gzip", "openssl")),
    "pg_dump, psql, gzip and openssl are required",
)
class DrillScriptTests(unittest.IsolatedAsyncioTestCase):
    DRILL_DB = "buyerly_restore_drill_test"
    COPY_DB = "buyerly_restore_copy_test"

    async def asyncSetUp(self):
        self.engine = create_test_engine()
        self.url = make_url(get_test_db_url())
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        app = self.tmp / "app"
        (app / "scripts").mkdir(parents=True)
        for name in ("backup_db.sh", "backup_env.sh", "restore_db.sh", "drill_restore.sh"):
            shutil.copy(PROJECT_ROOT / "scripts" / name, app / "scripts" / name)
        self.scripts = app / "scripts"
        fake_bin = self.tmp / "bin"
        fake_bin.mkdir()
        docker = fake_bin / "docker"
        docker.write_text(FAKE_DOCKER)
        docker.chmod(docker.stat().st_mode | stat.S_IEXEC)
        self.env = {
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "HOME": str(self.tmp),
            "BACKUP_DIR": str(self.tmp / "backups"),
            "BACKUP_LOCK_FILE": str(self.tmp / "backup.lock"),
            "DRILL_DB": self.DRILL_DB,
            "SOURCE_DB": self.url.database,
            "PGHOST": self.url.host,
            "PGPORT": str(self.url.port or 5432),
            "PGPASSWORD": self.url.password,
            "PROJECT_ROOT": str(PROJECT_ROOT),
            "APP_PYTHON": sys.executable,
            "DATABASE_URL": self.url.render_as_string(hide_password=False),
            "META_TOKEN_ENCRYPTION_KEY": TOKEN_KEY,
        }
        patcher = mock.patch.object(settings, "META_TOKEN_ENCRYPTION_KEY", TOKEN_KEY)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def asyncTearDown(self):
        await self.admin(f"DROP DATABASE IF EXISTS {self.COPY_DB} WITH (FORCE)")
        await self.admin(f"DROP DATABASE IF EXISTS {self.DRILL_DB} WITH (FORCE)")
        await init_test_db(self.engine)
        await self.engine.dispose()

    async def admin(self, statement):
        engine = create_async_engine(
            self.url.set(database="postgres"), poolclass=NullPool, isolation_level="AUTOCOMMIT"
        )
        try:
            async with engine.connect() as conn:
                await conn.execute(text(statement))
        finally:
            await engine.dispose()

    def run_script(self, name, *args, key=""):
        env = dict(self.env, BACKUP_ENCRYPTION_KEY=key)
        return subprocess.run(
            ["bash", str(self.scripts / name), *args],
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )

    def backup(self, key=""):
        result = self.run_script("backup_db.sh", key=key)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        made = sorted((self.tmp / "backups").glob("buyerly_postgres_*"))
        self.assertTrue(made, result.stdout)
        return made[-1]

    async def test_real_schema_restores_with_control_records_and_passes_the_drill(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)
        async with self.engine.connect() as conn:
            expected = (await conn.execute(text(CONTROL_SQL))).all()
        self.assertEqual(len(expected), 1)
        backup = self.backup(key="drill key")

        await self.admin(f"CREATE DATABASE {self.COPY_DB}")
        restored = self.run_script(
            "restore_db.sh", "--file", str(backup), "--target-db", self.COPY_DB, "--yes", key="drill key"
        )
        self.assertEqual(restored.returncode, 0, restored.stdout + restored.stderr)
        copy = create_async_engine(self.url.set(database=self.COPY_DB), poolclass=NullPool)
        try:
            async with copy.connect() as conn:
                self.assertEqual((await conn.execute(text(CONTROL_SQL))).all(), expected)
        finally:
            await copy.dispose()

        drill = self.run_script("drill_restore.sh", str(backup), key="drill key")

        output = drill.stdout + drill.stderr
        self.assertEqual(drill.returncode, 0, output)
        for stage in ("archive", "schema version", "schema contract", "data", "application read"):
            self.assertIn(f"[OK]   {stage}:", output)
        self.assertIn("[SUCCESS] The backup restores", output)
        # One line per stage: restore_db.sh's log and psql's query results
        # (a setval per sequence) stay out of a passing drill.
        self.assertNotIn("setval", output)
        self.assertNotIn("Target database:", output)

    async def test_fictitious_schema_from_the_issue_fails_the_drill(self):
        await reset_schema(self.engine)
        async with self.engine.begin() as conn:
            for statement in FICTITIOUS_SCHEMA:
                await conn.execute(text(statement))

        for key in ("", "drill key"):
            with self.subTest(encrypted=bool(key)):
                backup = self.backup(key=key)
                drill = self.run_script("drill_restore.sh", str(backup), key=key)

                output = drill.stdout + drill.stderr
                self.assertNotEqual(drill.returncode, 0, output)
                self.assertIn("[OK]   archive:", output)
                self.assertIn("[FAIL] schema version:", output)
                self.assertNotIn("[SUCCESS] The backup restores", output)
                backup.unlink()

    async def test_damaged_archive_fails_the_drill_and_shows_why(self):
        await upgrade(self.engine)
        await add_control_records(self.engine)
        backup = self.backup(key="drill key")
        backup.write_bytes(backup.read_bytes()[: backup.stat().st_size // 2])

        drill = self.run_script("drill_restore.sh", str(backup), key="drill key")

        output = drill.stdout + drill.stderr
        self.assertNotEqual(drill.returncode, 0, output)
        self.assertIn("[FAIL] archive:", output)
        self.assertIn("Target database was not changed", output)
        self.assertNotIn("[SUCCESS]", output)


if __name__ == "__main__":
    unittest.main()
