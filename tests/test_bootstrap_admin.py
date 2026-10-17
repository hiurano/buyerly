import unittest

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import database.db as database_db_module
from core.config import settings
from database.models import AllowedEmail, User
from tests.test_db_helper import create_test_engine, init_test_db


class TestBootstrapAdmin(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_test_engine()
        await init_test_db(self.engine)
        self.sessions = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        self.original_sessions = database_db_module.async_session_maker
        self.original_settings = (
            settings.BOOTSTRAP_ADMIN_USERNAME,
            settings.BOOTSTRAP_ADMIN_PASSWORD,
        )
        database_db_module.async_session_maker = self.sessions
        settings.BOOTSTRAP_ADMIN_USERNAME = "dev"
        settings.BOOTSTRAP_ADMIN_PASSWORD = "local-password"

    async def asyncTearDown(self):
        database_db_module.async_session_maker = self.original_sessions
        (
            settings.BOOTSTRAP_ADMIN_USERNAME,
            settings.BOOTSTRAP_ADMIN_PASSWORD,
        ) = self.original_settings
        await self.engine.dispose()

    async def test_first_admin_is_allowlisted_once(self):
        # Without the grant an empty installation could not create its first workspace.
        await database_db_module.ensure_bootstrap_admin()
        await database_db_module.ensure_bootstrap_admin()

        async with self.sessions() as session:
            admin = (await session.execute(select(User).where(User.username == "dev"))).scalar_one()
            grants = (await session.execute(select(AllowedEmail))).scalars().all()
        self.assertEqual([grant.user_id for grant in grants], [admin.id])
        self.assertEqual(grants[0].added_by, "bootstrap")


if __name__ == "__main__":
    unittest.main()
