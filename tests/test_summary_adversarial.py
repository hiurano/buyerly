import asyncio
import time
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.config import settings
from database.db import Base
from database.models import Account, AppSettings, SummarySnapshot, TelegramUser
from tests.test_api import generate_valid_telegram_init_data


class TestSummaryAdversarialStress(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        api_routes_module._summary_cache.clear()
        self.test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        self.test_session_maker = async_sessionmaker(self.test_engine, class_=AsyncSession, expire_on_commit=False)

        async with self.test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        api_routes_module.async_session_maker = self.test_session_maker
        api_auth_module.async_session_maker = self.test_session_maker
        api_server_module.async_session_maker = self.test_session_maker

        settings.BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        settings.ADMIN_CHAT_ID = "8634201356"

        self.app = create_app()

        async with self.test_session_maker() as session:
            self.user1 = TelegramUser(
                telegram_id="987654321",
                username="adversary_user_1",
                full_name="Red",
                role="buyer",
                is_approved=True,
            )
            self.user2 = TelegramUser(
                telegram_id="123456789",
                username="adversary_user_2",
                full_name="Blue",
                role="buyer",
                is_approved=True,
            )
            session.add_all([self.user1, self.user2])
            await session.commit()
            await session.refresh(self.user1)
            await session.refresh(self.user2)

            self.acc_normal_1 = Account(
                account_id="act_adv_101",
                name="Adv Normal 1",
                access_token="mock_token_1",
                currency="USD",
                timezone_name="UTC",
                account_status=1,
                is_active=True,
                owner_user_id=self.user1.id,
                owner_id=str(self.user1.telegram_id),
            )
            self.acc_normal_2 = Account(
                account_id="act_adv_102",
                name="Adv Normal 2",
                access_token="mock_token_2",
                currency="USD",
                timezone_name="UTC",
                account_status=1,
                is_active=True,
                owner_user_id=self.user1.id,
                owner_id=str(self.user1.telegram_id),
            )
            self.acc_blocked = Account(
                account_id="act_adv_blocked",
                name="Adv Blocked",
                access_token="mock_token_3",
                currency="USD",
                timezone_name="UTC",
                account_status=2,
                is_active=False,
                owner_user_id=self.user1.id,
                owner_id=str(self.user1.telegram_id),
            )
            self.acc_exploding = Account(
                account_id="act_adv_explode",
                name="Adv Exploding",
                access_token="mock_token_4",
                currency="USD",
                timezone_name="UTC",
                account_status=1,
                is_active=True,
                owner_user_id=self.user1.id,
                owner_id=str(self.user1.telegram_id),
            )
            session.add_all([
                self.acc_normal_1,
                self.acc_normal_2,
                self.acc_blocked,
                self.acc_exploding,
            ])
            await session.commit()

    async def asyncTearDown(self):
        await self.test_engine.dispose()

    async def test_concurrent_summary_requests_and_isolated_users(self):
        """Stress-test: concurrent force=true and force=false requests across multiple users."""
        call_counter = 0

        async def mocked_insights(account_id, access_token, date_preset):
            nonlocal call_counter
            call_counter += 1
            if account_id == "act_adv_explode":
                raise httpx.ConnectTimeout("Meta API timeout simulated")
            return {
                "spend": 50.0,
                "clicks": 25,
                "impressions": 500,
                "leads": 2,
                "registrations": 1,
                "purchases": 1,
            }

        user1_auth = generate_valid_telegram_init_data(
            settings.BOT_TOKEN,
            {"id": int(self.user1.telegram_id), "first_name": "Red", "username": "adversary_user_1"},
        )
        user2_auth = generate_valid_telegram_init_data(
            settings.BOT_TOKEN,
            {"id": int(self.user2.telegram_id), "first_name": "Blue", "username": "adversary_user_2"},
        )

        transport = httpx.ASGITransport(app=self.app)
        with patch.object(api_routes_module.meta_client, "get_account_insights_summary", side_effect=mocked_insights):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                tasks = [
                    client.get("/api/summary?period=today&force=true", headers={"Authorization": f"tma {user1_auth}"}),
                    client.get("/api/summary?period=today&force=true", headers={"Authorization": f"tma {user1_auth}"}),
                    client.get("/api/summary?period=yesterday&force=true", headers={"Authorization": f"tma {user1_auth}"}),
                    client.get("/api/summary?period=today", headers={"Authorization": f"tma {user1_auth}"}),
                    client.get("/api/summary?period=today&force=true", headers={"Authorization": f"tma {user2_auth}"}),
                    client.get("/api/summary?period=today", headers={"Authorization": f"tma {user2_auth}"}),
                ]
                responses = await asyncio.gather(*tasks)

        for idx, resp in enumerate(responses):
            self.assertEqual(resp.status_code, 200, f"Request {idx} failed: {resp.text}")

        u1_data = responses[0].json()
        self.assertEqual(u1_data["data_quality"]["accounts_total"], 4)
        self.assertEqual(u1_data["data_quality"]["accounts_synced"], 3)
        self.assertEqual(u1_data["data_quality"]["accounts_failed"], 1)

        u2_data = responses[4].json()
        self.assertEqual(u2_data["accounts_count"], 0)
        self.assertEqual(u2_data["total_spend"], 0.0)

    async def test_summary_handles_all_accounts_failing_gracefully(self):
        """Stress-test: all accounts fail or timeout -> returns 502 Bad Gateway and preserves snapshot."""
        async def always_failing_insights(account_id, access_token, date_preset):
            raise httpx.HTTPStatusError(
                "500 Internal Server Error",
                request=httpx.Request("GET", "https://graph.facebook.com"),
                response=httpx.Response(500, text='{"error":{"message":"Meta is down"}}'),
            )

        user1_auth = generate_valid_telegram_init_data(
            settings.BOT_TOKEN,
            {"id": int(self.user1.telegram_id), "first_name": "Red", "username": "adversary_user_1"},
        )
        transport = httpx.ASGITransport(app=self.app)
        with patch.object(api_routes_module.meta_client, "get_account_insights_summary", side_effect=always_failing_insights):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    "/api/summary?period=today&force=true",
                    headers={"Authorization": f"tma {user1_auth}"},
                )

        self.assertEqual(resp.status_code, 502)
        data = resp.json()
        self.assertIn("Meta не вернула данные ни по одному кабинету", data["detail"])

        # Verify no corrupted snapshot was saved to DB
        async with self.test_session_maker() as session:
            snapshot_count = (
                await session.execute(select(func.count()).select_from(SummarySnapshot))
            ).scalar_one()
        self.assertEqual(snapshot_count, 0)


if __name__ == "__main__":
    unittest.main()
