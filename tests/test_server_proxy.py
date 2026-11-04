import logging
import unittest

import httpx
from fastapi import FastAPI

from api import server_proxy


def upstream_app(seen: list[httpx.Request]) -> httpx.MockTransport:
    """The TypeScript server, as far as the proxy can tell."""

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/health/server/down":
            raise httpx.ConnectError("refused", request=request)
        headers = [
            ("content-type", "application/json"),
            ("set-cookie", "a=1; Path=/"),
            ("set-cookie", "b=2; Path=/"),
            ("connection", "keep-alive"),
        ]
        return httpx.Response(201, headers=headers, content=b'{"from":"server"}')

    return httpx.MockTransport(handle)


class ServerProxyTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Alembic's fileConfig, run in-process by earlier tests, disables
        # loggers that already exist; production migrates in its own container.
        logging.getLogger("api.server_proxy").disabled = False
        self.seen: list[httpx.Request] = []
        self.app = FastAPI()

        @self.app.get("/health/live")
        async def python_health():
            return {"from": "python"}

        @self.app.get("/health/server/live")
        async def shadowed():
            return {"from": "python"}

        server_proxy.install(
            self.app,
            base_url="http://server:8090/",
            paths="/health/server/",
            transport=upstream_app(self.seen),
        )
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app, client=("203.0.113.7", 1234)),
            base_url="http://test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        await server_proxy.close(self.app)

    async def test_owned_path_goes_to_the_server_before_python_routes(self):
        response = await self.client.post(
            "/health/server/live?x=1",
            content=b"payload",
            headers={"authorization": "Bearer t", "connection": "close"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {"from": "server"})
        forwarded = self.seen[-1]
        self.assertEqual(str(forwarded.url), "http://server:8090/health/server/live?x=1")
        self.assertEqual(forwarded.method, "POST")
        self.assertEqual(forwarded.content, b"payload")
        self.assertEqual(forwarded.headers["authorization"], "Bearer t")
        self.assertEqual(forwarded.headers["x-forwarded-for"], "203.0.113.7")
        self.assertNotEqual(forwarded.headers.get("connection"), "close")

    async def test_response_keeps_repeated_headers_and_drops_hop_headers(self):
        response = await self.client.get("/health/server/live")
        self.assertEqual(response.headers.get_list("set-cookie"), ["a=1; Path=/", "b=2; Path=/"])
        self.assertNotIn("keep-alive", response.headers.get("connection", ""))
        self.assertEqual(response.headers["content-length"], str(len(b'{"from":"server"}')))

    async def test_other_paths_stay_with_python(self):
        response = await self.client.get("/health/live")
        self.assertEqual(response.json(), {"from": "python"})
        self.assertEqual(self.seen, [])

    async def test_prefix_without_trailing_slash_is_owned(self):
        await self.client.get("/health/server")
        self.assertEqual(self.seen[-1].url.path, "/health/server")

    async def test_lookalike_path_is_not_owned(self):
        await self.client.get("/health/serverless")
        self.assertEqual(self.seen, [])

    async def test_unreachable_server_is_502_without_query_in_log(self):
        with self.assertLogs("api.server_proxy", level="ERROR") as logs:
            response = await self.client.get("/health/server/down?access_token=SECRET")
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("SECRET", "\n".join(logs.output))
        self.assertNotIn("SECRET", response.text)


class ServerProxySettingsTest(unittest.TestCase):
    def test_nothing_installed_without_a_url(self):
        app = FastAPI()
        before = len(app.user_middleware)
        server_proxy.install(app, base_url="", paths="/health/server/")
        self.assertEqual(len(app.user_middleware), before)

    def test_prefixes_must_be_whole_segments(self):
        self.assertEqual(server_proxy.owned_prefixes(" /a/ , /b/c/ ,"), ("/a/", "/b/c/"))
        with self.assertRaises(ValueError):
            server_proxy.owned_prefixes("/health/server")
        with self.assertRaises(ValueError):
            server_proxy.owned_prefixes("health/")


if __name__ == "__main__":
    unittest.main()
