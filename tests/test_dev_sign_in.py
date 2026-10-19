import unittest

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import scripts.dev_seed as dev_seed_module
from core.config import settings
from core.email import send_otp_verification_email
from database.models import User, Workspace, WorkspaceMember
from tests.test_db_helper import create_test_engine, init_test_db


class TestDevSeedUser(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_test_engine()
        await init_test_db(self.engine)
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        self.original_sessions = dev_seed_module.async_session_maker
        dev_seed_module.async_session_maker = self.sessions

    async def asyncTearDown(self):
        dev_seed_module.async_session_maker = self.original_sessions
        await self.engine.dispose()

    async def test_local_stack_gets_one_dev_user_who_signs_in_by_email(self):
        await dev_seed_module.seed()
        await dev_seed_module.seed()

        async with self.sessions() as session:
            users = (await session.execute(select(User))).scalars().all()
            self.assertEqual(
                [(u.username, u.email, u.role, u.is_approved) for u in users],
                [("dev", "dev@buyerly.localhost", "admin", True)],
            )
            self.assertIsNotNone(users[0].email_verified_at)
            workspace = (await session.execute(select(Workspace))).scalar_one()
            member = (await session.execute(select(WorkspaceMember))).scalar_one()
            self.assertEqual((workspace.slug, member.user_id, member.role), ("dev", users[0].id, "owner"))

    async def test_an_old_local_dev_user_without_email_gets_one(self):
        async with self.sessions() as session:
            session.add(User(username="dev", full_name="dev", role="admin", is_approved=True))
            await session.commit()

        await dev_seed_module.seed()

        async with self.sessions() as session:
            user = (await session.execute(select(User))).scalar_one()
            self.assertEqual(user.email, "dev@buyerly.localhost")
            self.assertIsNotNone(user.email_verified_at)


class TestDevEmailLog(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original = (settings.RESEND_API_KEY, settings.DEV_EMAIL_LOG)
        settings.RESEND_API_KEY = ""

    async def asyncTearDown(self):
        settings.RESEND_API_KEY, settings.DEV_EMAIL_LOG = self.original

    async def test_code_reaches_the_log_only_on_the_local_stack(self):
        for enabled in (False, True):
            settings.DEV_EMAIL_LOG = enabled
            with self.assertLogs("core.email", level="INFO") as logs:
                sent = await send_otp_verification_email(
                    "dev@buyerly.localhost", "KQZMRTWPDA", "http://localhost:5173/auth/email/verify?token=t"
                )
            self.assertTrue(sent)
            self.assertEqual("KQZMRTWPDA" in "\n".join(logs.output), enabled)

    def test_production_default_is_off(self):
        from core.config import Settings

        self.assertIs(Settings.model_fields["DEV_EMAIL_LOG"].default, False)


if __name__ == "__main__":
    unittest.main()
