import json
import unittest

from cryptography.fernet import Fernet
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from database.rule_workspace_contract import (
    WORKSPACE_REVIEW_REASON,
    scope_runtime_rule_snapshots,
)
from core.config import settings
from core.meta_tokens import decrypt_meta_token
from database.models import User, Workspace
from tests.test_db_helper import create_test_engine, init_test_db


def alembic_head_revision() -> str:
    """Revision the migration chain ends at, so no test pins a version number."""
    from alembic.script import ScriptDirectory

    from database.migrations import alembic_config

    return ScriptDirectory.from_config(alembic_config()).get_current_head()


class TestRuleWorkspaceMigration(unittest.IsolatedAsyncioTestCase):
    async def test_snapshot_helper_stamps_safe_rules_and_disables_unsafe_rules(self):
        rules, changed, disabled = scope_runtime_rule_snapshots(
            [
                {"preset_id": 10, "name": "safe"},
                {"preset_id": 20, "name": "cross"},
                {"preset_id": 999, "name": "missing"},
                "malformed",
            ],
            account_workspace_id=1,
            preset_workspaces={10: 1, 20: 2},
        )

        self.assertTrue(changed)
        self.assertEqual(disabled, 2)
        self.assertEqual(rules[0]["workspace_id"], 1)
        self.assertNotIn("needs_review", rules[0])
        self.assertFalse(rules[1]["enabled"])
        self.assertTrue(rules[1]["needs_review"])
        self.assertEqual(rules[1]["review_reason"], WORKSPACE_REVIEW_REASON)
        self.assertFalse(rules[2]["enabled"])
        self.assertEqual(len(rules), 3)

class TestAlembicMigrations(unittest.IsolatedAsyncioTestCase):
    async def test_account_groups_are_scoped_by_0012_and_dropped_by_0047(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            config = Config(
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
            )
            config.set_main_option(
                "script_location",
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic"),
            )
            command.upgrade(config, "0011_workspace_slugs")
            # This old revision still has users.password_hash (NOT NULL, no database
            # default); the model lost it in 0041, so the column gets a default here.
            async with engine.begin() as conn:
                await conn.execute(text("ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT ''"))

            session_maker = async_sessionmaker(
                engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
            async with session_maker() as session:
                first_owner = User(username="group-owner-one")
                second_owner = User(username="group-owner-two")
                session.add_all([first_owner, second_owner])
                await session.flush()
                workspace = Workspace(
                    name="Group Workspace",
                    slug="group-workspace",
                    owner_user_id=first_owner.id,
                )
                session.add(workspace)
                await session.flush()
                # Raw SQL: the model now has columns this old revision lacks.
                await session.execute(
                    text(
                        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) "
                        "VALUES (:workspace_id, :user_id, 'owner', NOW())"
                    ),
                    {"workspace_id": workspace.id, "user_id": first_owner.id},
                )
                first_owner.active_workspace_id = workspace.id
                # Raw SQL too: account groups have no model any more (#469).
                for workspace_id, owner_user_id, name in [
                    (workspace.id, first_owner.id, "  Alpha  "),
                    (workspace.id, second_owner.id, "alpha"),
                    (None, first_owner.id, "Legacy"),
                ]:
                    await session.execute(
                        text(
                            "INSERT INTO account_groups (workspace_id, owner_user_id, name, description, created_at, updated_at) "
                            "VALUES (:workspace_id, :owner_user_id, :name, '', NOW(), NOW())"
                        ),
                        {"workspace_id": workspace_id, "owner_user_id": owner_user_id, "name": name},
                    )
                await session.commit()

            command.upgrade(config, "0012_group_ws_unique")

            async with engine.connect() as conn:
                rows = (
                    await conn.execute(
                        text(
                            "SELECT workspace_id, name FROM account_groups ORDER BY id ASC"
                        )
                    )
                ).all()
                self.assertEqual(
                    [(row.workspace_id, row.name) for row in rows],
                    [
                        (workspace.id, "Alpha"),
                        (workspace.id, "alpha (2)"),
                        (workspace.id, "Legacy"),
                    ],
                )

            insert_group = text(
                "INSERT INTO account_groups (workspace_id, owner_user_id, name, description, created_at, updated_at) "
                "VALUES (:workspace_id, :owner_user_id, :name, '', NOW(), NOW())"
            )
            async with session_maker() as session:
                second_workspace = Workspace(
                    name="Second Group Workspace",
                    slug="second-group-workspace",
                    owner_user_id=first_owner.id,
                )
                session.add(second_workspace)
                await session.flush()
                await session.execute(
                    insert_group,
                    {"workspace_id": second_workspace.id, "owner_user_id": first_owner.id, "name": "Alpha"},
                )
                await session.commit()

            async with session_maker() as session:
                with self.assertRaises(Exception):
                    await session.execute(
                        insert_group,
                        {"workspace_id": workspace.id, "owner_user_id": first_owner.id, "name": "ALPHA"},
                    )
                await session.rollback()

            def table_names(sync_conn):
                return set(inspect(sync_conn).get_table_names())

            command.upgrade(config, "head")
            async with engine.connect() as conn:
                tables = await conn.run_sync(table_names)
            self.assertNotIn("account_groups", tables)
            self.assertNotIn("account_group_members", tables)

            # Downgrading brings the tables back empty, still unique per workspace.
            command.downgrade(config, "0046_private_teams")
            async with engine.connect() as conn:
                tables = await conn.run_sync(table_names)
                self.assertIn("account_groups", tables)
                self.assertIn("account_group_members", tables)
                self.assertEqual(
                    (await conn.execute(text("SELECT count(*) FROM account_groups"))).scalar_one(), 0
                )
            async with session_maker() as session:
                await session.execute(
                    insert_group,
                    {"workspace_id": workspace.id, "owner_user_id": first_owner.id, "name": "Alpha"},
                )
                with self.assertRaises(Exception):
                    await session.execute(
                        insert_group,
                        {"workspace_id": workspace.id, "owner_user_id": first_owner.id, "name": " alpha "},
                    )
                await session.rollback()
            command.upgrade(config, "head")
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_rule_groups_become_labels_colored_by_their_icon(self):
        from alembic import command
        from alembic.config import Config
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            config = Config(
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
            )
            config.set_main_option(
                "script_location",
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic"),
            )
            command.upgrade(config, "0037_view_settings")
            async with engine.begin() as conn:
                for name, icon in (
                    ("Safety", "shield"),
                    ("Scale", "rocket"),
                    ("Tests", "flask"),
                    ("Backlog", "backlog"),
                    ("Plain", "custom"),
                ):
                    await conn.execute(
                        text(
                            "INSERT INTO rule_groups "
                            "(name, description, icon, position, created_at, updated_at) "
                            "VALUES (:name, '', :icon, 0, NOW(), NOW())"
                        ),
                        {"name": name, "icon": icon},
                    )

            command.upgrade(config, "head")
            async with engine.connect() as conn:
                colors = dict(
                    (
                        await conn.execute(text("SELECT name, color FROM rule_groups"))
                    ).all()
                )
            self.assertEqual(
                colors,
                {
                    "Safety": "#4cb782",
                    "Scale": "#bb87fc",
                    "Tests": "#f2c94c",
                    "Backlog": "#95a2b3",
                    "Plain": "#95a2b3",
                },
            )
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_manual_token_migration_encrypts_plaintext_and_downgrades_safely(self):
        from alembic import command
        from alembic.config import Config
        import os

        original_key = settings.META_TOKEN_ENCRYPTION_KEY
        settings.META_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode("ascii")
        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            config = Config(
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
            )
            config.set_main_option(
                "script_location",
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic"),
            )
            command.upgrade(config, "0012_group_ws_unique")

            raw_token = "EAAB-legacy-manual-token"
            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        """
                        INSERT INTO accounts (
                            account_id, name, custom_name, note, access_token,
                            batch_name, currency, timezone_name, last_started_date,
                            last_day_start_date, active_rules, account_status,
                            status_label, rules_enabled, is_active, created_at
                        ) VALUES (
                            'act_legacy_manual', 'Legacy manual', '', '', :token,
                            '', 'USD', 'UTC', '', '', '[]', 1,
                            'Active (ACTIVE)', false, true, NOW()
                        )
                        """
                    ),
                    {"token": raw_token},
                )

            command.upgrade(config, "head")
            async with engine.connect() as conn:
                row = (
                    await conn.execute(
                        text(
                            "SELECT access_token, access_token_encrypted "
                            "FROM accounts WHERE account_id = 'act_legacy_manual'"
                        )
                    )
                ).one()
                self.assertEqual(row.access_token, "")
                self.assertNotIn(raw_token, row.access_token_encrypted)
                self.assertEqual(
                    decrypt_meta_token(row.access_token_encrypted),
                    raw_token,
                )

            command.downgrade(config, "0012_group_ws_unique")
            async with engine.connect() as conn:
                restored = (
                    await conn.execute(
                        text(
                            "SELECT access_token FROM accounts "
                            "WHERE account_id = 'act_legacy_manual'"
                        )
                    )
                ).scalar_one()
                self.assertEqual(restored, raw_token)
        finally:
            settings.META_TOKEN_ENCRYPTION_KEY = original_key
            await init_test_db(engine)
            await engine.dispose()

    async def test_workspace_slug_migration_normalizes_reserved_and_colliding_rows(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            config = Config(
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
            )
            config.set_main_option(
                "script_location",
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic"),
            )
            command.upgrade(config, "0010_atomic_otp")
            # This old revision still has users.password_hash (NOT NULL, no database
            # default); the model lost it in 0041, so the column gets a default here.
            async with engine.begin() as conn:
                await conn.execute(text("ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT ''"))

            session_maker = async_sessionmaker(
                engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
            async with session_maker() as session:
                owner = User(username="slug-migration-owner")
                session.add(owner)
                await session.flush()
                session.add_all(
                    [
                        Workspace(name="API", slug="api", owner_user_id=owner.id),
                        Workspace(
                            name="Canada Traffic RU",
                            slug="Канада-Трафик",
                            owner_user_id=owner.id,
                        ),
                        Workspace(
                            name="Canada Traffic",
                            slug="kanada-trafik",
                            owner_user_id=owner.id,
                        ),
                    ]
                )
                await session.commit()

            command.upgrade(config, "head")

            async with engine.connect() as conn:
                slugs = list(
                    (
                        await conn.execute(
                            text("SELECT slug FROM workspaces ORDER BY id ASC")
                        )
                    ).scalars()
                )
                self.assertEqual(slugs[0], "api-workspace")
                # A Cyrillic slug carries no ASCII letters, so it falls back to
                # a stable hash instead of being transliterated.
                self.assertTrue(slugs[1].startswith("workspace-"))
                self.assertEqual(slugs[2], "kanada-trafik")
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_runtime_payload_text_is_converted_to_native_jsonb(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            ini_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
            alembic_cfg = Config(ini_path)
            alembic_cfg.set_main_option(
                "script_location",
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic"),
            )
            command.upgrade(alembic_cfg, "0018_account_health")

            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        "ALTER TABLE automation_runtime_states "
                        "ALTER COLUMN payload TYPE TEXT USING payload::text"
                    )
                )
                await conn.execute(
                    text(
                        "INSERT INTO automation_runtime_states "
                        "(state_key, payload, updated_at) VALUES "
                        "('valid', :valid, NOW()), "
                        "('double', :double, NOW()), "
                        "('malformed', :malformed, NOW())"
                    ),
                    {
                        "valid": json.dumps({"cycle_id": "legacy"}),
                        "double": json.dumps(json.dumps({"cycle_id": "double"})),
                        "malformed": "not-json",
                    },
                )

            command.upgrade(alembic_cfg, "head")

            async with engine.connect() as conn:
                column_type = (
                    await conn.execute(
                        text(
                            "SELECT data_type FROM information_schema.columns "
                            "WHERE table_name = 'automation_runtime_states' "
                            "AND column_name = 'payload'"
                        )
                    )
                ).scalar_one()
                rows = dict(
                    (
                        await conn.execute(
                            text(
                                "SELECT state_key, payload "
                                "FROM automation_runtime_states"
                            )
                        )
                    ).all()
                )
            self.assertEqual(column_type, "jsonb")
            self.assertEqual(rows["valid"], {"cycle_id": "legacy"})
            self.assertEqual(rows["double"], {"cycle_id": "double"})
            self.assertEqual(rows["malformed"], {})
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_allowlist_user_grants_keep_existing_email_grants(self):
        from alembic.config import Config
        from alembic import command
        from sqlalchemy.exc import IntegrityError
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            root = os.path.dirname(os.path.dirname(__file__))
            alembic_cfg = Config(os.path.join(root, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(root, "alembic"))
            command.upgrade(alembic_cfg, "0026_deleted_items")

            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        "INSERT INTO allowed_emails (email, added_by, created_at) "
                        "VALUES ('kept@agency.com', 'admin', NOW())"
                    )
                )
                await conn.execute(
                    text(
                        "INSERT INTO users (username, full_name, first_name, last_name, avatar_url, "
                        "onboarding_step, onboarding_completed, password_hash, role, is_approved, created_at) "
                        "VALUES ('granted', '', '', '', '', 'workspace', false, '', 'buyer', true, NOW())"
                    )
                )

            command.upgrade(alembic_cfg, "0027_allowlist_user_grants")

            async with engine.begin() as conn:
                kept = (
                    await conn.execute(text("SELECT email, user_id FROM allowed_emails"))
                ).all()
                self.assertEqual([tuple(row) for row in kept], [("kept@agency.com", None)])
                await conn.execute(
                    text(
                        "INSERT INTO allowed_emails (user_id, created_at) "
                        "SELECT id, NOW() FROM users WHERE username = 'granted'"
                    )
                )
            for bad_row in (
                "(NULL, NULL)",
                "('both@agency.com', (SELECT id FROM users WHERE username = 'granted'))",
            ):
                with self.assertRaises(IntegrityError):
                    async with engine.begin() as conn:
                        await conn.execute(
                            text(f"INSERT INTO allowed_emails (email, user_id) VALUES {bad_row}")
                        )

            command.downgrade(alembic_cfg, "0026_deleted_items")
            async with engine.connect() as conn:
                remaining = (await conn.execute(text("SELECT email FROM allowed_emails"))).scalars().all()
            self.assertEqual(remaining, ["kept@agency.com"])
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_open_sign_up_drops_the_allowlist(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            root = os.path.dirname(os.path.dirname(__file__))
            alembic_cfg = Config(os.path.join(root, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(root, "alembic"))
            command.upgrade(alembic_cfg, "0038_rule_label_colors")
            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        "INSERT INTO allowed_emails (email, added_by, created_at) "
                        "VALUES ('old@agency.com', 'admin', NOW())"
                    )
                )

            command.upgrade(alembic_cfg, "head")
            async with engine.connect() as conn:
                tables = await conn.run_sync(lambda sync: inspect(sync).get_table_names())
            self.assertNotIn("allowed_emails", tables)

            # The way back restores the table as 0027 left it, without the grants.
            command.downgrade(alembic_cfg, "0038_rule_label_colors")
            async with engine.begin() as conn:
                self.assertEqual(
                    (await conn.execute(text("SELECT count(*) FROM allowed_emails"))).scalar_one(), 0
                )
                await conn.execute(
                    text("INSERT INTO allowed_emails (email, created_at) VALUES ('back@agency.com', NOW())")
                )
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_unconfirmed_account_emails_are_cleared(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            root = os.path.dirname(os.path.dirname(__file__))
            alembic_cfg = Config(os.path.join(root, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(root, "alembic"))
            command.upgrade(alembic_cfg, "0039_drop_allowed_emails")
            async with engine.begin() as conn:
                for username, email, verified in (
                    ("confirmed", "confirmed@agency.com", "NOW()"),
                    ("unconfirmed", "unconfirmed@agency.com", "NULL"),
                    ("no_email", "NULL", "NULL"),
                ):
                    email_sql = "NULL" if email == "NULL" else f"'{email}'"
                    await conn.execute(
                        text(
                            "INSERT INTO users (username, full_name, first_name, last_name, avatar_url, "
                            "onboarding_step, onboarding_completed, password_hash, role, is_approved, "
                            "email, email_verified_at, created_at) "
                            f"VALUES ('{username}', '', '', '', '', 'workspace', false, '', 'buyer', true, "
                            f"{email_sql}, {verified}, NOW())"
                        )
                    )

            command.upgrade(alembic_cfg, "0040_clear_unverified_emails")
            async with engine.connect() as conn:
                emails = dict(
                    (await conn.execute(text("SELECT username, email FROM users"))).all()
                )
            self.assertEqual(
                emails,
                {"confirmed": "confirmed@agency.com", "unconfirmed": None, "no_email": None},
            )
            command.downgrade(alembic_cfg, "0039_drop_allowed_emails")
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_email_only_sign_in_drops_password_hash(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            root = os.path.dirname(os.path.dirname(__file__))
            alembic_cfg = Config(os.path.join(root, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(root, "alembic"))

            async def user_columns():
                async with engine.connect() as conn:
                    return await conn.run_sync(
                        lambda sync: {column["name"] for column in inspect(sync).get_columns("users")}
                    )

            command.upgrade(alembic_cfg, "0041_drop_password_hash")
            self.assertNotIn("password_hash", await user_columns())

            # The way back brings the column back empty.
            command.downgrade(alembic_cfg, "0040_clear_unverified_emails")
            self.assertIn("password_hash", await user_columns())
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_workspaces_without_a_team_get_their_default_team(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            root = os.path.dirname(os.path.dirname(__file__))
            alembic_cfg = Config(os.path.join(root, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(root, "alembic"))

            command.upgrade(alembic_cfg, "0041_drop_password_hash")
            async with engine.begin() as conn:
                owner_id = (await conn.execute(text(
                    "INSERT INTO users (username, full_name, first_name, last_name, avatar_url, "
                    "onboarding_step, onboarding_completed, role, is_approved, created_at) "
                    "VALUES ('owner', '', '', '', '', 'completed', true, 'buyer', true, NOW()) RETURNING id"
                ))).scalar_one()
                workspace_ids = {}
                for name, slug in (("12 Media buying", "media"), ("Has team", "has-team")):
                    workspace_ids[slug] = (await conn.execute(text(
                        "INSERT INTO workspaces (name, slug, badge_text, badge_color, logo_url, owner_user_id, "
                        f"created_at, updated_at) VALUES ('{name}', '{slug}', 'M', '#F5A300', '', {owner_id}, "
                        "NOW(), NOW()) RETURNING id"
                    ))).scalar_one()
                    await conn.execute(text(
                        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at, inbox_read_before) "
                        f"VALUES ({workspace_ids[slug]}, {owner_id}, 'owner', NOW(), NOW())"
                    ))
                await conn.execute(text(
                    "INSERT INTO teams (workspace_id, name, key, description, created_at, updated_at) "
                    f"VALUES ({workspace_ids['has-team']}, 'Growth', 'GRO', '', NOW(), NOW())"
                ))

            command.upgrade(alembic_cfg, "0042_default_teams")
            async with engine.connect() as conn:
                teams = (await conn.execute(text(
                    "SELECT t.workspace_id, t.name, t.key, COUNT(m.id) FROM teams t "
                    "LEFT JOIN team_members m ON m.team_id = t.id GROUP BY t.id ORDER BY t.id"
                ))).all()
            self.assertEqual(
                [tuple(row) for row in teams],
                [
                    (workspace_ids["has-team"], "Growth", "GRO", 0),
                    (workspace_ids["media"], "12 Media buying", "MED", 1),
                ],
            )
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_roles_become_linears_and_team_creators_own_their_teams(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            root = os.path.dirname(os.path.dirname(__file__))
            alembic_cfg = Config(os.path.join(root, "alembic.ini"))
            alembic_cfg.set_main_option("script_location", os.path.join(root, "alembic"))

            command.upgrade(alembic_cfg, "0044_account_lead")
            async with engine.begin() as conn:
                ids = {}
                for name in ("creator", "watcher"):
                    ids[name] = (await conn.execute(text(
                        "INSERT INTO users (username, full_name, first_name, last_name, avatar_url, "
                        "onboarding_step, onboarding_completed, role, is_approved, created_at) "
                        f"VALUES ('{name}', '', '', '', '', 'completed', true, 'buyer', true, NOW()) RETURNING id"
                    ))).scalar_one()
                workspace_id = (await conn.execute(text(
                    "INSERT INTO workspaces (name, slug, badge_text, badge_color, logo_url, owner_user_id, "
                    f"created_at, updated_at) VALUES ('Roles', 'roles', 'R', '#F5A300', '', {ids['creator']}, "
                    "NOW(), NOW()) RETURNING id"
                ))).scalar_one()
                members = {}
                for name, role in (("creator", "buyer"), ("watcher", "viewer")):
                    members[name] = (await conn.execute(text(
                        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at, inbox_read_before) "
                        f"VALUES ({workspace_id}, {ids[name]}, '{role}', NOW(), NOW()) RETURNING id"
                    ))).scalar_one()
                team_id = (await conn.execute(text(
                    "INSERT INTO teams (workspace_id, name, key, description, created_by_user_id, created_at, updated_at) "
                    f"VALUES ({workspace_id}, 'Media', 'MED', '', {ids['creator']}, NOW(), NOW()) RETURNING id"
                ))).scalar_one()
                for name in ("creator", "watcher"):
                    await conn.execute(text(
                        f"INSERT INTO team_members (team_id, member_id, joined_at) VALUES ({team_id}, {members[name]}, NOW())"
                    ))

            command.upgrade(alembic_cfg, "0045_linear_roles")
            async with engine.connect() as conn:
                rows = (await conn.execute(text(
                    "SELECT u.username, m.role, t.is_owner FROM workspace_members m "
                    "JOIN users u ON u.id = m.user_id JOIN team_members t ON t.member_id = m.id ORDER BY u.username"
                ))).all()
            self.assertEqual([tuple(row) for row in rows], [("creator", "member", True), ("watcher", "guest", False)])
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_alembic_upgrade_head_applies_successfully(self):
        from alembic.config import Config
        from alembic import command
        import os

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            ini_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
            alembic_cfg = Config(ini_path)
            alembic_cfg.set_main_option(
                "script_location",
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic"),
            )
            command.upgrade(alembic_cfg, "head")

            async with engine.begin() as conn:
                version = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()
                self.assertEqual(version, alembic_head_revision())
                columns = {
                    row.column_name
                    for row in (
                        await conn.execute(
                            text(
                                "SELECT column_name FROM information_schema.columns "
                                "WHERE table_name = 'email_verification_codes'"
                            )
                        )
                    )
                }
                self.assertIn("link_token_hash", columns)
                self.assertIn("invite_id", columns)

            command.downgrade(alembic_cfg, "base")
        finally:
            await init_test_db(engine)
            await engine.dispose()

    async def test_production_migration_runner_is_idempotent_on_fresh_database(self):
        from database.migrations import run_production_migrations

        engine = create_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

            await run_production_migrations()
            await run_production_migrations()

            async with engine.connect() as conn:
                version = (
                    await conn.execute(text("SELECT version_num FROM alembic_version"))
                ).scalar_one()
                self.assertEqual(version, alembic_head_revision())
        finally:
            await init_test_db(engine)
            await engine.dispose()


if __name__ == "__main__":
    unittest.main()
