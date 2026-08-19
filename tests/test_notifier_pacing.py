import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock
from aiogram.exceptions import TelegramRetryAfter

from bot.notifier import TelegramNotifier
from rules.engine import RuleEvaluationResult, RuleAction


class TestTelegramNotifierPacing(unittest.IsolatedAsyncioTestCase):
    async def test_retry_after_handling(self):
        bot = MagicMock()
        # First call raises TelegramRetryAfter, second succeeds
        bot.send_message = AsyncMock(
            side_effect=[
                TelegramRetryAfter(method=MagicMock(), message="Too many requests", retry_after=0.05),
                MagicMock(),
            ]
        )
        notifier = TelegramNotifier(bot=bot, target_chat_id="12345")
        
        eval_res = RuleEvaluationResult(
            action=RuleAction.STOP,
            adset_id="adset_123",
            adset_name="Test AdSet",
            spend=15.0,
            leads=0,
            registrations=0,
            purchases=0,
            cpl=None,
            cpreg=None,
            cpp=None,
            reason="High spend without leads",
            currency="USD",
        )

        await notifier.send_alert(
            event_type="STOP",
            account_name="Account Alpha",
            account_id="act_111",
            target_chat_id="12345",
            eval_result=eval_res,
        )

        self.assertEqual(bot.send_message.call_count, 2)

    async def test_pacing_between_rapid_sends(self):
        bot = MagicMock()
        bot.send_message = AsyncMock(return_value=MagicMock())
        notifier = TelegramNotifier(bot=bot, target_chat_id="12345")

        start = asyncio.get_event_loop().time()
        for i in range(3):
            await notifier.send_alert(
                event_type="ACCOUNT_ISSUE",
                account_name=f"Account {i}",
                account_id=f"act_{i}",
                target_chat_id="12345",
                local_time="Status Check",
            )
        elapsed = asyncio.get_event_loop().time() - start

        self.assertEqual(bot.send_message.call_count, 3)
        # 3 calls with 0.1s minimum gap between sends should take at least 0.15s
        self.assertGreaterEqual(elapsed, 0.15)


if __name__ == "__main__":
    unittest.main()
