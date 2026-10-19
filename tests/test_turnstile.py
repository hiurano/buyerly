import unittest
from unittest.mock import patch

import httpx

from core.config import settings
from services import turnstile
from services.turnstile import SITEVERIFY_URL, verify_turnstile


class TestVerifyTurnstile(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.original_secret = settings.TURNSTILE_SECRET_KEY
        settings.TURNSTILE_SECRET_KEY = "test-turnstile-secret"
        self.requests = []

    def tearDown(self):
        settings.TURNSTILE_SECRET_KEY = self.original_secret

    def _cloudflare(self, handler):
        real_client = httpx.AsyncClient

        def make_client(**kwargs):
            return real_client(transport=httpx.MockTransport(handler), **kwargs)

        return patch.object(turnstile.httpx, "AsyncClient", side_effect=make_client)

    async def test_without_secret_the_check_is_off(self):
        settings.TURNSTILE_SECRET_KEY = ""
        self.assertTrue(await verify_turnstile(None))

    async def test_missing_token_fails_without_asking_cloudflare(self):
        with self._cloudflare(lambda request: self.fail("Cloudflare must not be called")):
            self.assertFalse(await verify_turnstile(None))
            self.assertFalse(await verify_turnstile(""))

    async def test_cloudflare_answer_decides(self):
        for answer, expected in (
            ({"success": True}, True),
            ({"success": False, "error-codes": ["invalid-input-response"]}, False),
            ({}, False),
        ):
            def handler(request, answer=answer):
                self.requests.append(request)
                return httpx.Response(200, json=answer)

            with self._cloudflare(handler):
                self.assertEqual(await verify_turnstile("cf-token", "203.0.113.7"), expected)

        request = self.requests[0]
        self.assertEqual(str(request.url), SITEVERIFY_URL)
        form = dict(httpx.QueryParams(request.content.decode()))
        self.assertEqual(
            form,
            {"secret": "test-turnstile-secret", "response": "cf-token", "remoteip": "203.0.113.7"},
        )

    async def test_errors_fail_closed(self):
        def broken(request):
            raise httpx.ConnectError("down", request=request)

        for handler in (
            broken,
            lambda request: httpx.Response(500, json={"success": True}),
            lambda request: httpx.Response(200, text="not json"),
        ):
            with self._cloudflare(handler):
                self.assertFalse(await verify_turnstile("cf-token", "unknown"))


if __name__ == "__main__":
    unittest.main()
