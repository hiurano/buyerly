"""Guard tests use fake engines only; no application imports or database I/O."""

import os
import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy.engine import make_url

from tests.test_db_helper import create_test_engine, get_test_db_url, init_test_db


SAFE_URL = "postgresql+asyncpg://buyerly:fake-password@localhost:5432/buyerly_test"
SAFE_ENV = {
    "TEST_DATABASE_URL": SAFE_URL,
    "TEST_DATABASE_DISPOSABLE": "buyerly_test",
}


class TestDatabaseGuard(unittest.IsolatedAsyncioTestCase):
    async def test_rejected_configuration_never_creates_or_connects_engine(self):
        cases = [
            {},
            {"DATABASE_URL": SAFE_URL},
            {"TEST_DATABASE_URL": SAFE_URL},
            {**SAFE_ENV, "TEST_DATABASE_DISPOSABLE": "true"},
            {**SAFE_ENV, "TEST_DATABASE_URL": ""},
        ]
        for value in (
            SAFE_URL.replace("buyerly_test", "buyerly"),
            SAFE_URL.replace("localhost", "production.example.com"),
            SAFE_URL.replace("5432", "6432"),
            SAFE_URL.replace("5432", "invalid-port"),
            SAFE_URL.replace("buyerly:fake", "postgres:fake"),
            SAFE_URL.replace("postgresql+asyncpg", "sqlite"),
            SAFE_URL + "?host=production.example.com",
            SAFE_URL + "?database=buyerly",
            "not-a-url-with-fake-password",
        ):
            cases.append({**SAFE_ENV, "TEST_DATABASE_URL": value})
        for env in cases:
            with self.subTest(env_keys=sorted(env)), patch.dict(os.environ, env, clear=True):
                engine = MagicMock(url=make_url(SAFE_URL))
                with patch("tests.test_db_helper.create_async_engine") as factory:
                    with self.assertRaises(RuntimeError) as caught:
                        create_test_engine()
                    self.assertNotIn("fake-password", str(caught.exception))
                    self.assertNotIn("production.example.com", str(caught.exception))
                    factory.assert_not_called()
                with self.assertRaises(RuntimeError):
                    await init_test_db(engine)
                engine.begin.assert_not_called()

    def test_explicit_disposable_target_reaches_factory(self):
        for host in ("localhost", "127.0.0.1", "[::1]"):
            url = SAFE_URL.replace("localhost", host)
            with self.subTest(host=host), patch.dict(
                os.environ, {**SAFE_ENV, "TEST_DATABASE_URL": url}, clear=True
            ), patch("tests.test_db_helper.create_async_engine") as factory:
                self.assertEqual(get_test_db_url(), url)
                self.assertIs(create_test_engine(), factory.return_value)
                factory.assert_called_once_with(url, echo=False)

    async def test_actual_engine_is_checked_before_ddl(self):
        for url in (
            SAFE_URL.replace("buyerly_test", "buyerly"),
            SAFE_URL.replace("localhost", "production.example.com"),
            SAFE_URL.replace("localhost", "127.0.0.1"),
            SAFE_URL.replace("fake-password", "other-password"),
            SAFE_URL + "?host=production.example.com",
        ):
            with self.subTest(target="rejected"), patch.dict(os.environ, SAFE_ENV, clear=True):
                engine = MagicMock(url=make_url(url))
                with self.assertRaises(RuntimeError):
                    await init_test_db(engine)
                engine.begin.assert_not_called()

    async def test_confirmation_revoked_after_engine_creation(self):
        engine = MagicMock(url=make_url(SAFE_URL))
        with patch.dict(os.environ, SAFE_ENV, clear=True), patch(
            "tests.test_db_helper.create_async_engine", return_value=engine
        ):
            created = create_test_engine()
            del os.environ["TEST_DATABASE_DISPOSABLE"]
            with self.assertRaises(RuntimeError):
                await init_test_db(created)
            engine.begin.assert_not_called()
