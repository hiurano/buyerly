import unittest

from core.config import settings
from core.email import send_otp_verification_email


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
