import unittest
from unittest.mock import AsyncMock, MagicMock
from cryptography.fernet import Fernet
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from core.config import settings
from core.meta_tokens import (
    MetaTokenError,
    decrypt_meta_token,
    encrypt_meta_token,
    rotate_meta_token,
    rotate_stored_meta_tokens,
    resolve_account_access_token,
)
from database.models import Account, MetaConnection, User
from database.db import migrate_manual_meta_tokens_contract
from tests.test_db_helper import create_test_engine, init_test_db


class TestMetaTokenEncryption(unittest.TestCase):
    def setUp(self):
        self.original_key = settings.META_TOKEN_ENCRYPTION_KEY
        settings.META_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode("ascii")

    def tearDown(self):
        settings.META_TOKEN_ENCRYPTION_KEY = self.original_key

    def test_token_round_trip_is_encrypted(self):
        encrypted = encrypt_meta_token("EAAB-secret-test-token")

        self.assertNotIn("EAAB-secret-test-token", encrypted)
        self.assertEqual(decrypt_meta_token(encrypted), "EAAB-secret-test-token")

    def test_invalid_ciphertext_fails_closed(self):
        with self.assertRaises(MetaTokenError):
            decrypt_meta_token("not-a-fernet-token")

    def test_empty_token_fails_closed(self):
        with self.assertRaises(MetaTokenError):
            encrypt_meta_token("")

    def test_missing_key_fails_closed(self):
        settings.META_TOKEN_ENCRYPTION_KEY = ""
        with self.assertRaises(MetaTokenError):
            encrypt_meta_token("EAAB-token")
        with self.assertRaises(MetaTokenError):
            decrypt_meta_token("gAAAAAB...")

    def test_rotate_meta_token(self):
        old_key = settings.META_TOKEN_ENCRYPTION_KEY
        old_ciphertext = encrypt_meta_token("rotate-me-token")

        new_key = Fernet.generate_key().decode("ascii")
        settings.META_TOKEN_ENCRYPTION_KEY = f"{new_key},{old_key}"

        rotated_ciphertext = rotate_meta_token(old_ciphertext)
        self.assertNotEqual(rotated_ciphertext, old_ciphertext)
        self.assertEqual(decrypt_meta_token(rotated_ciphertext), "rotate-me-token")

        # Must decrypt with only new_key
        self.assertEqual(
            Fernet(new_key.encode("ascii")).decrypt(rotated_ciphertext.encode("ascii")),
            b"rotate-me-token",
        )

    def test_rotation_decrypts_old_tokens_and_encrypts_with_new_key(self):
        old_key = settings.META_TOKEN_ENCRYPTION_KEY
        old_ciphertext = encrypt_meta_token("old-token")
        new_key = Fernet.generate_key().decode("ascii")
        settings.META_TOKEN_ENCRYPTION_KEY = f"{new_key},{old_key}"

        new_ciphertext = encrypt_meta_token("new-token")

        self.assertEqual(decrypt_meta_token(old_ciphertext), "old-token")
        self.assertEqual(decrypt_meta_token(new_ciphertext), "new-token")
        self.assertEqual(
            Fernet(new_key.encode("ascii")).decrypt(new_ciphertext.encode("ascii")),
            b"new-token",
        )


class TestResolveAccountAccessToken(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_key = settings.META_TOKEN_ENCRYPTION_KEY
        self.primary_key = Fernet.generate_key().decode("ascii")
        settings.META_TOKEN_ENCRYPTION_KEY = self.primary_key

        self.test_engine = create_test_engine()
        self.test_session_maker = async_sessionmaker(
            self.test_engine, class_=AsyncSession, expire_on_commit=False
        )
        await init_test_db(self.test_engine)

    async def asyncTearDown(self):
        settings.META_TOKEN_ENCRYPTION_KEY = self.original_key
        await self.test_engine.dispose()

    async def test_resolve_from_encrypted_account_token(self):
        raw_token = "EAAB-manual-system-user-token-123"
        encrypted = encrypt_meta_token(raw_token)

        async with self.test_session_maker() as session:
            acc = Account(
                account_id="act_manual_1",
                name="Manual 1",
                access_token_encrypted=encrypted,
                access_token="",
            )
            session.add(acc)
            await session.commit()

            resolved = await resolve_account_access_token(session, acc)
            self.assertEqual(resolved, raw_token)

    async def test_resolve_from_meta_connection(self):
        raw_token = "EAAB-oauth-token-456"
        encrypted = encrypt_meta_token(raw_token)

        async with self.test_session_maker() as session:
            user = User(username="meta_user_1", password_hash="pass")
            session.add(user)
            await session.flush()

            conn = MetaConnection(
                owner_user_id=user.id,
                provider_user_id="fb_123",
                access_token_encrypted=encrypted,
                status="active",
            )
            session.add(conn)
            await session.flush()

            acc = Account(
                account_id="act_oauth_1",
                name="OAuth 1",
                owner_user_id=user.id,
                meta_connection_id=conn.id,
                access_token="",
            )
            session.add(acc)
            await session.commit()

            resolved = await resolve_account_access_token(session, acc)
            self.assertEqual(resolved, raw_token)

    async def test_resolve_connection_mismatch_fails_closed(self):
        async with self.test_session_maker() as session:
            user1 = User(username="user_1", password_hash="pass")
            user2 = User(username="user_2", password_hash="pass")
            session.add_all([user1, user2])
            await session.flush()

            conn = MetaConnection(
                owner_user_id=user1.id,
                provider_user_id="fb_user1",
                access_token_encrypted=encrypt_meta_token("token"),
                status="active",
            )
            session.add(conn)
            await session.flush()

            acc = Account(
                account_id="act_mismatch",
                name="Mismatch",
                owner_user_id=user2.id,
                meta_connection_id=conn.id,
            )
            session.add(acc)
            await session.commit()

            with self.assertRaises(MetaTokenError) as ctx:
                await resolve_account_access_token(session, acc)
            self.assertIn("mismatch", str(ctx.exception).lower())

    async def test_resolve_connection_error_status_fails_closed(self):
        async with self.test_session_maker() as session:
            user = User(username="error_user", password_hash="pass")
            session.add(user)
            await session.flush()

            conn = MetaConnection(
                owner_user_id=user.id,
                provider_user_id="fb_err",
                access_token_encrypted=encrypt_meta_token("token"),
                status="error",
            )
            session.add(conn)
            await session.flush()

            acc = Account(
                account_id="act_err_conn",
                name="Err Conn",
                owner_user_id=user.id,
                meta_connection_id=conn.id,
            )
            session.add(acc)
            await session.commit()

            with self.assertRaises(MetaTokenError) as ctx:
                await resolve_account_access_token(session, acc)
            self.assertIn("reconnection", str(ctx.exception).lower())

    async def test_resolve_corrupted_account_token_fails_closed(self):
        async with self.test_session_maker() as session:
            acc = Account(
                account_id="act_corrupted",
                name="Corrupted",
                access_token_encrypted="corrupted-non-fernet-string",
            )
            session.add(acc)
            await session.commit()

            with self.assertRaises(MetaTokenError) as ctx:
                await resolve_account_access_token(session, acc)
            self.assertIn("cannot be decrypted", str(ctx.exception).lower())

    async def test_resolve_missing_token_fails_closed(self):
        async with self.test_session_maker() as session:
            acc = Account(
                account_id="act_empty",
                name="Empty",
                access_token_encrypted="",
                access_token="",
            )
            session.add(acc)
            await session.commit()

            with self.assertRaises(MetaTokenError) as ctx:
                await resolve_account_access_token(session, acc)
            self.assertIn("missing", str(ctx.exception).lower())


class TestRotateStoredMetaTokens(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_key = settings.META_TOKEN_ENCRYPTION_KEY
        self.key_v1 = Fernet.generate_key().decode("ascii")
        settings.META_TOKEN_ENCRYPTION_KEY = self.key_v1

        self.test_engine = create_test_engine()
        self.test_session_maker = async_sessionmaker(
            self.test_engine, class_=AsyncSession, expire_on_commit=False
        )
        await init_test_db(self.test_engine)

    async def asyncTearDown(self):
        settings.META_TOKEN_ENCRYPTION_KEY = self.original_key
        await self.test_engine.dispose()

    async def test_rotate_stored_meta_tokens_updates_all_records(self):
        async with self.test_session_maker() as session:
            user = User(username="rot_user", password_hash="pass")
            session.add(user)
            await session.flush()

            conn = MetaConnection(
                owner_user_id=user.id,
                provider_user_id="fb_rot",
                access_token_encrypted=encrypt_meta_token("conn_secret_v1"),
                status="active",
            )
            session.add(conn)

            acc = Account(
                account_id="act_rot_1",
                name="Rot 1",
                owner_user_id=user.id,
                access_token_encrypted=encrypt_meta_token("acc_secret_v1"),
                access_token="",
            )
            session.add(acc)
            await session.commit()

            old_conn_enc = conn.access_token_encrypted
            old_acc_enc = acc.access_token_encrypted

        # Now introduce key_v2
        key_v2 = Fernet.generate_key().decode("ascii")
        settings.META_TOKEN_ENCRYPTION_KEY = f"{key_v2},{self.key_v1}"

        async with self.test_session_maker() as session:
            stats = await rotate_stored_meta_tokens(session)
            self.assertEqual(stats["connections_rotated"], 1)
            self.assertEqual(stats["accounts_rotated"], 1)

        # Verify records can be decrypted with key_v2 directly
        async with self.test_session_maker() as session:
            updated_conn = (
                await session.execute(
                    select(MetaConnection).where(MetaConnection.provider_user_id == "fb_rot")
                )
            ).scalar_one()
            updated_acc = (
                await session.execute(
                    select(Account).where(Account.account_id == "act_rot_1")
                )
            ).scalar_one()

            self.assertNotEqual(updated_conn.access_token_encrypted, old_conn_enc)
            self.assertNotEqual(updated_acc.access_token_encrypted, old_acc_enc)

            # Check that only key_v2 is needed
            f2 = Fernet(key_v2.encode("ascii"))
            self.assertEqual(
                f2.decrypt(updated_conn.access_token_encrypted.encode("ascii")),
                b"conn_secret_v1",
            )
            self.assertEqual(
                f2.decrypt(updated_acc.access_token_encrypted.encode("ascii")),
                b"acc_secret_v1",
            )


class TestMigrationManualMetaTokens(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_key = settings.META_TOKEN_ENCRYPTION_KEY
        self.primary_key = Fernet.generate_key().decode("ascii")
        settings.META_TOKEN_ENCRYPTION_KEY = self.primary_key

        self.test_engine = create_test_engine()
        self.test_session_maker = async_sessionmaker(
            self.test_engine, class_=AsyncSession, expire_on_commit=False
        )
        await init_test_db(self.test_engine)

    async def asyncTearDown(self):
        settings.META_TOKEN_ENCRYPTION_KEY = self.original_key
        await self.test_engine.dispose()

    async def test_migration_encrypts_plaintext_and_clears_column(self):
        async with self.test_session_maker() as session:
            # Seed legacy rows directly with raw SQL
            await session.execute(
                text(
                    "INSERT INTO accounts (account_id, name, access_token, access_token_encrypted, currency, timezone_name, active_rules, is_active) "
                    "VALUES ('act_plain_1', 'Plain 1', 'EAAB_legacy_token', '', 'USD', 'UTC', '[]', true)"
                )
            )
            # Row with existing ciphertext
            existing_cipher = encrypt_meta_token("already_encrypted")
            await session.execute(
                text(
                    "INSERT INTO accounts (account_id, name, access_token, access_token_encrypted, currency, timezone_name, active_rules, is_active) "
                    "VALUES ('act_enc_2', 'Enc 2', 'legacy_residual', :enc, 'USD', 'UTC', '[]', true)"
                ),
                {"enc": existing_cipher},
            )
            await session.commit()

        # Run startup migration
        async with self.test_engine.begin() as conn:
            migrated_count = await migrate_manual_meta_tokens_contract(conn)

        self.assertEqual(migrated_count, 1)

        async with self.test_session_maker() as session:
            row1 = (
                await session.execute(
                    select(Account).where(Account.account_id == "act_plain_1")
                )
            ).scalar_one()
            self.assertEqual(row1.access_token, "")
            self.assertEqual(decrypt_meta_token(row1.access_token_encrypted), "EAAB_legacy_token")

            row2 = (
                await session.execute(
                    select(Account).where(Account.account_id == "act_enc_2")
                )
            ).scalar_one()
            self.assertEqual(row2.access_token, "")
            self.assertEqual(row2.access_token_encrypted, existing_cipher)

        # Idempotency check: running again should change 0 rows
        async with self.test_engine.begin() as conn:
            second_run = await migrate_manual_meta_tokens_contract(conn)
        self.assertEqual(second_run, 0)


if __name__ == "__main__":
    unittest.main()
