import asyncio
import os
import time
import unittest
import uuid
from unittest.mock import AsyncMock, patch

import httpx
from starlette.requests import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
from api.server import create_app
from core.config import settings
from core.rate_limit import (
    RateLimitBackendUnavailable,
    RateLimiter,
    get_client_ip,
    get_client_location,
    limiter,
)
from database.db import Base, hash_password
from database.models import User, Workspace


class TestRateLimiterCore(unittest.IsolatedAsyncioTestCase):

    async def test_sliding_window_rate_limiting(self):
        custom_limiter = RateLimiter(cleanup_interval_seconds=60)

        # 3 requests allowed with limit=3 in window=1s
        for i in range(3):
            allowed, retry_after = await custom_limiter.is_allowed("user_test", limit=3, window_seconds=1)
            self.assertTrue(allowed)
            self.assertEqual(retry_after, 0)

        # 4th request within 1s should be rejected with retry_after >= 1
        allowed, retry_after = await custom_limiter.is_allowed("user_test", limit=3, window_seconds=1)
        self.assertFalse(allowed)
        self.assertGreaterEqual(retry_after, 1)

        # Key reset enables immediate access
        await custom_limiter.reset("user_test")
        allowed, retry_after = await custom_limiter.is_allowed("user_test", limit=3, window_seconds=1)
        self.assertTrue(allowed)

    async def test_stale_records_cleanup(self):
        custom_limiter = RateLimiter(cleanup_interval_seconds=0)
        # Populate with simulated past timestamp
        custom_limiter._records["old_key"] = [time.time() - 700]
        custom_limiter._records["recent_key"] = [time.time()]

        # Trigger cleanup
        custom_limiter._cleanup_stale(time.time())
        self.assertNotIn("old_key", custom_limiter._records)
        self.assertIn("recent_key", custom_limiter._records)

    def test_forwarded_headers_require_a_trusted_direct_peer(self):
        original = settings.TRUSTED_PROXY_CIDRS
        try:
            settings.TRUSTED_PROXY_CIDRS = "10.0.0.0/8"
            spoofed = Request({
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [(b"x-forwarded-for", b"203.0.113.8")],
                "client": ("198.51.100.10", 1234),
            })
            self.assertEqual(get_client_ip(spoofed), "198.51.100.10")

            trusted_chain = Request({
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [(b"x-forwarded-for", b"203.0.113.8, 10.1.2.3")],
                "client": ("10.9.8.7", 1234),
            })
            self.assertEqual(get_client_ip(trusted_chain), "203.0.113.8")

            malformed = Request({
                "type": "http",
                "method": "GET",
                "path": "/",
                "headers": [(b"x-forwarded-for", b"not-an-ip")],
                "client": ("10.9.8.7", 1234),
            })
            self.assertEqual(get_client_ip(malformed), "10.9.8.7")
        finally:
            settings.TRUSTED_PROXY_CIDRS = original

    @staticmethod
    def _request(peer: str, headers: dict[str, bytes]) -> Request:
        return Request({
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(name.lower().encode("latin-1"), value) for name, value in headers.items()],
            "client": (peer, 1234),
        })

    def test_cloudflare_headers_count_only_from_cloudflare(self):
        original = settings.TRUSTED_PROXY_CIDRS
        original_cloudflare = settings.CLOUDFLARE_IP_CIDRS
        cloudflare_headers = {
            "CF-Connecting-IP": b"203.0.113.8",
            "cf-ipcity": b"Helsinki",
            "cf-region-code": b"18",
            "cf-ipcountry": b"FI",
        }
        try:
            settings.TRUSTED_PROXY_CIDRS = "10.0.0.0/8"

            # Cloudflare (162.158.0.0/15) -> our nginx (10.9.8.7) -> API.
            through_cloudflare = self._request("10.9.8.7", {
                **cloudflare_headers,
                "X-Forwarded-For": b"203.0.113.8, 162.158.1.2",
            })
            self.assertEqual(get_client_ip(through_cloudflare), "203.0.113.8")
            self.assertEqual(get_client_location(through_cloudflare), "Helsinki, 18, FI")

            # A direct hit on the server may send any CF-* header: it is ignored.
            direct = self._request("198.51.100.10", cloudflare_headers)
            self.assertEqual(get_client_ip(direct), "198.51.100.10")
            self.assertEqual(get_client_location(direct), "")

            # So is a direct hit through nginx that pretends Cloudflare forwarded it.
            spoofed = self._request("10.9.8.7", {
                **cloudflare_headers,
                "X-Forwarded-For": b"162.158.1.2, 198.51.100.10",
            })
            self.assertEqual(get_client_ip(spoofed), "198.51.100.10")
            self.assertEqual(get_client_location(spoofed), "")

            # Cloudflare's own address is used when it sends no visitor address.
            no_visitor = self._request("10.9.8.7", {"X-Forwarded-For": b"162.158.1.2"})
            self.assertEqual(get_client_ip(no_visitor), "162.158.1.2")
            self.assertEqual(get_client_location(no_visitor), "")

            # Turning the Cloudflare networks off turns the headers off.
            settings.CLOUDFLARE_IP_CIDRS = "off"
            self.assertEqual(get_client_ip(through_cloudflare), "162.158.1.2")
            self.assertEqual(get_client_location(through_cloudflare), "")
        finally:
            settings.TRUSTED_PROXY_CIDRS = original
            settings.CLOUDFLARE_IP_CIDRS = original_cloudflare

    def test_cloudflare_tunnel_counts_only_from_its_local_address(self):
        original = settings.TRUSTED_PROXY_CIDRS
        original_cloudflare = settings.CLOUDFLARE_IP_CIDRS
        original_tunnel = settings.CLOUDFLARE_TUNNEL_CIDRS
        cloudflare_headers = {
            "CF-Connecting-IP": b"203.0.113.8",
            "cf-ipcity": b"Helsinki",
            "cf-region-code": b"18",
            "cf-ipcountry": b"FI",
        }
        try:
            # Production: cloudflared on the host -> Docker gateway 172.18.0.1
            # -> nginx (172.18.0.3) -> API; both settings are the Docker networks.
            settings.TRUSTED_PROXY_CIDRS = "172.16.0.0/12"
            settings.CLOUDFLARE_TUNNEL_CIDRS = "172.16.0.0/12"
            settings.CLOUDFLARE_IP_CIDRS = ""

            through_tunnel = self._request("172.18.0.3", {
                **cloudflare_headers,
                "X-Forwarded-For": b"203.0.113.8, 172.18.0.1",
            })
            self.assertEqual(get_client_ip(through_tunnel), "203.0.113.8")
            self.assertEqual(get_client_location(through_tunnel), "Helsinki, 18, FI")

            # The tunnel's address is enough even without Cloudflare's own X-Forwarded-For.
            tunnel_only = self._request("172.18.0.3", {
                **cloudflare_headers,
                "X-Forwarded-For": b"172.18.0.1",
            })
            self.assertEqual(get_client_ip(tunnel_only), "203.0.113.8")
            self.assertEqual(get_client_location(tunnel_only), "Helsinki, 18, FI")

            # Without a visitor address the tunnel's own address is used.
            no_visitor = self._request("172.18.0.3", {"X-Forwarded-For": b"172.18.0.1"})
            self.assertEqual(get_client_ip(no_visitor), "172.18.0.1")

            # A direct hit from the internet through nginx: its own address, no city,
            # even when it pretends the tunnel or Cloudflare forwarded it.
            for forwarded in (b"198.51.100.10", b"172.18.0.1, 198.51.100.10", b"162.158.1.2, 198.51.100.10"):
                direct = self._request("172.18.0.3", {**cloudflare_headers, "X-Forwarded-For": forwarded})
                self.assertEqual(get_client_ip(direct), "198.51.100.10")
                self.assertEqual(get_client_location(direct), "")

            # Our own proxy is never taken for the tunnel, though it is in the same network.
            proxy_itself = self._request("172.18.0.3", cloudflare_headers)
            self.assertEqual(get_client_ip(proxy_itself), "172.18.0.3")
            self.assertEqual(get_client_location(proxy_itself), "")

            # A public peer is not the tunnel either.
            public_peer = self._request("198.51.100.10", cloudflare_headers)
            self.assertEqual(get_client_ip(public_peer), "198.51.100.10")
            self.assertEqual(get_client_location(public_peer), "")

            # 'off' turns the tunnel off as well.
            settings.CLOUDFLARE_IP_CIDRS = "off"
            self.assertEqual(get_client_location(through_tunnel), "")
            self.assertEqual(get_client_ip(tunnel_only), "172.18.0.1")
            settings.CLOUDFLARE_IP_CIDRS = ""

            # Without the setting the tunnel is not trusted.
            settings.CLOUDFLARE_TUNNEL_CIDRS = ""
            self.assertEqual(get_client_location(through_tunnel), "")
            self.assertEqual(get_client_ip(tunnel_only), "172.18.0.1")

            # cloudflared connecting to the app directly on the same host.
            settings.TRUSTED_PROXY_CIDRS = ""
            settings.CLOUDFLARE_TUNNEL_CIDRS = "127.0.0.1/32,::1/128"
            local_tunnel = self._request("127.0.0.1", cloudflare_headers)
            self.assertEqual(get_client_ip(local_tunnel), "203.0.113.8")
            self.assertEqual(get_client_location(local_tunnel), "Helsinki, 18, FI")
        finally:
            settings.TRUSTED_PROXY_CIDRS = original
            settings.CLOUDFLARE_IP_CIDRS = original_cloudflare
            settings.CLOUDFLARE_TUNNEL_CIDRS = original_tunnel

    def test_cloudflare_location_is_cleaned(self):
        original = settings.TRUSTED_PROXY_CIDRS
        try:
            settings.TRUSTED_PROXY_CIDRS = ""
            # A UTF-8 city, a missing region and Cloudflare's "unknown country".
            unknown_country = self._request("2606:4700::1", {
                "cf-ipcity": "Malmö".encode("utf-8"),
                "cf-ipcountry": b"XX",
            })
            self.assertEqual(get_client_location(unknown_country), "Malmö")

            country_only = self._request("104.16.0.1", {"cf-ipcountry": b"se"})
            self.assertEqual(get_client_location(country_only), "SE")

            commas = self._request("104.16.0.1", {
                "cf-ipcity": b"Washington, D.C.\x01",
                "cf-region-code": b"DC",
                "cf-ipcountry": b"US",
            })
            self.assertEqual(get_client_location(commas), "Washington D.C., DC, US")

            nothing = self._request("104.16.0.1", {})
            self.assertEqual(get_client_location(nothing), "")
        finally:
            settings.TRUSTED_PROXY_CIDRS = original


@unittest.skipUnless(os.getenv("REDIS_URL"), "REDIS_URL is required")
class TestSharedRedisRateLimiter(unittest.IsolatedAsyncioTestCase):

    async def test_limit_is_shared_atomically_between_instances(self):
        namespace = f"buyerly:test-rate-limit:{uuid.uuid4()}"
        first = RateLimiter(redis_url=os.environ["REDIS_URL"], namespace=namespace)
        second = RateLimiter(redis_url=os.environ["REDIS_URL"], namespace=namespace)
        await first.reset()
        try:
            results = await asyncio.gather(*(
                (first if index % 2 == 0 else second).is_allowed("shared", 5, 60)
                for index in range(20)
            ))
            self.assertEqual(sum(1 for allowed, _ in results if allowed), 5)
            self.assertTrue(all(retry >= 1 for allowed, retry in results if not allowed))
        finally:
            await first.reset()
            await second.reset()


from tests.test_db_helper import create_test_engine, init_test_db


class TestApiRateLimitingAndDosProtection(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        await limiter.reset()
        self.test_engine = create_test_engine()
        self.test_session_maker = async_sessionmaker(self.test_engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.test_engine)

        api_routes_module.async_session_maker = self.test_session_maker
        api_auth_module.async_session_maker = self.test_session_maker
        api_server_module.async_session_maker = self.test_session_maker
        settings.ADMIN_CHAT_ID = "8634201356"

        async with self.test_session_maker() as session:
            user = User(
                telegram_id="8634201356",
                username="test_buyer",
                full_name="Test Buyer",
                email="buyer@test.com",
                password_hash=hash_password("correct-password"),
                role="buyer",
                is_approved=True,
                auth_token="test-valid-auth-token-12345",
            )
            session.add(user)
            ws = Workspace(
                name="Test Workspace",
                slug="test-workspace",
                owner_user_id=1,
            )
            session.add(ws)
            await session.commit()

        self.app = create_app()

    async def asyncTearDown(self):
        await limiter.reset()
        await self.test_engine.dispose()

    async def test_login_rate_limiting(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Send 10 failed login requests (limit is 10/min)
            for _ in range(10):
                res = await client.post(
                    "/api/auth/login",
                    json={"username": "test_buyer", "password": "wrong-password"},
                )
                self.assertEqual(res.status_code, 401)

            # 11th request must be rate-limited (HTTP 429)
            rate_limited_res = await client.post(
                "/api/auth/login",
                json={"username": "test_buyer", "password": "correct-password"},
            )
            self.assertEqual(rate_limited_res.status_code, 429)
            self.assertIn("Retry-After", rate_limited_res.headers)
            self.assertIn("Too many requests", rate_limited_res.json()["detail"])

    async def test_login_identity_limit_cannot_be_bypassed_by_rotating_ips(self):
        original = settings.TRUSTED_PROXY_CIDRS
        settings.TRUSTED_PROXY_CIDRS = "127.0.0.1/32"
        try:
            transport = httpx.ASGITransport(app=self.app, client=("127.0.0.1", 123))
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                for index in range(10):
                    response = await client.post(
                        "/api/auth/login",
                        headers={"X-Forwarded-For": f"203.0.113.{index + 1}"},
                        json={"username": "test_buyer", "password": "wrong-password"},
                    )
                    self.assertEqual(response.status_code, 401)

                blocked = await client.post(
                    "/api/auth/login",
                    headers={"X-Forwarded-For": "198.51.100.200"},
                    json={"username": "test_buyer", "password": "correct-password"},
                )
                self.assertEqual(blocked.status_code, 429)
        finally:
            settings.TRUSTED_PROXY_CIDRS = original

    async def test_protected_endpoint_fails_closed_when_redis_is_unavailable(self):
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch.object(
                limiter,
                "is_allowed",
                new=AsyncMock(side_effect=RateLimitBackendUnavailable()),
            ):
                response = await client.post(
                    "/api/auth/login",
                    json={"username": "test_buyer", "password": "correct-password"},
                )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers.get("Retry-After"), "1")

    async def test_check_slug_rate_limiting(self):
        headers = {"Authorization": "Bearer test-valid-auth-token-12345"}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 30 requests allowed
            for i in range(30):
                res = await client.get(f"/api/onboarding/check-slug?slug=test-slug-{i}", headers=headers)
                self.assertEqual(res.status_code, 200)

            # 31st request exceeds rate limit -> 429
            blocked_res = await client.get("/api/onboarding/check-slug?slug=test-slug-blocked", headers=headers)
            self.assertEqual(blocked_res.status_code, 429)

    async def test_parse_raw_max_payload_length_validation(self):
        headers = {"Authorization": "Bearer test-valid-auth-token-12345"}
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Valid string within 64KB
            valid_res = await client.post(
                "/api/accounts/parse-raw",
                json={"raw_text": "act_1000000000000001"},
                headers=headers,
            )
            self.assertEqual(valid_res.status_code, 200)
            self.assertEqual(len(valid_res.json()), 1)

            # Oversized string > 65536 characters -> 422 Unprocessable Entity
            oversized_res = await client.post(
                "/api/accounts/parse-raw",
                json={"raw_text": "A" * 70000},
                headers=headers,
            )
            self.assertEqual(oversized_res.status_code, 422)

    async def test_request_body_size_limit_middleware(self):
        # 1MB limit for standard API routes -> HTTP 413
        headers = {
            "Authorization": "Bearer test-valid-auth-token-12345",
            "Content-Length": "2000000",
            "Content-Type": "application/json",
        }
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/accounts/parse-raw",
                content=b"{}",
                headers=headers,
            )
            self.assertEqual(res.status_code, 413)
            self.assertIn("The request body exceeds", res.json()["detail"])
