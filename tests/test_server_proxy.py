import asyncio
import logging
import unittest

import httpx
from fastapi import FastAPI, WebSocket

from api import server_proxy


class Body(httpx.AsyncByteStream):
    def __init__(self, data: bytes):
        self.data = data

    async def __aiter__(self):
        yield self.data


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
            ("content-length", "17"),
        ]
        # A stream, as from the network: content=bytes would be read up front.
        return httpx.Response(201, headers=headers, stream=Body(b'{"from":"server"}'))

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

    async def test_a_request_the_server_passed_back_stays_with_python(self):
        response = await self.client.get("/health/server/live", headers={"x-buyerly-server-hop": "1"})
        self.assertEqual(response.json(), {"from": "python"})
        self.assertEqual(self.seen, [])

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


class SocketForwardingTest(unittest.IsolatedAsyncioTestCase):
    """WebSockets on owned paths, through a real server on each side of the API."""

    async def asyncSetUp(self):
        import socket

        import uvicorn
        from websockets.asyncio.server import serve
        from websockets.http11 import Response
        from websockets.datastructures import Headers

        self.upstream_seen = []

        async def upstream(ws):
            self.upstream_seen.append(ws.request)
            async for message in ws:
                if message == "close":
                    await ws.close(4410, "bootstrap")
                    return
                await ws.send(f"echo:{message}")

        def handshake(connection, request):
            if request.path.startswith("/health/server/refused"):
                return connection.respond(403, "Forbidden\n")
            return None

        def cookies(connection, request, response):
            response.headers["Set-Cookie"] = "buyerly_session=new; Path=/"
            response.headers["Set-Cookie"] = "buyerly_csrf=x; Path=/"

        self.upstream = await serve(upstream, "127.0.0.1", 0, process_request=handshake, process_response=cookies)
        upstream_port = self.upstream.sockets[0].getsockname()[1]

        self.app = FastAPI()

        @self.app.websocket("/health/python")
        async def python_socket(ws: WebSocket):
            await ws.accept()
            await ws.send_text("python")
            await ws.close()

        server_proxy.install(self.app, base_url=f"http://127.0.0.1:{upstream_port}", paths="/health/server/")
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        self.port = sock.getsockname()[1]
        sock.close()
        self.server = uvicorn.Server(uvicorn.Config(self.app, host="127.0.0.1", port=self.port, log_level="warning",
                                                    lifespan="off", ws="websockets"))
        self.serving = asyncio.create_task(self.server.serve())
        while not self.server.started:
            await asyncio.sleep(0.02)

    async def asyncTearDown(self):
        self.server.should_exit = True
        await self.serving
        self.upstream.close()
        await self.upstream.wait_closed()

    def url(self, path: str) -> str:
        return f"ws://127.0.0.1:{self.port}{path}"

    async def test_frames_cookies_and_close_pass_through(self):
        from websockets.asyncio.client import connect
        from websockets.exceptions import ConnectionClosed

        async with connect(self.url("/health/server/ws?since=5&workspace=w"),
                           additional_headers={"Cookie": "buyerly_session=old", "Origin": "https://buyerly.test"},
                           user_agent_header="Browser/1") as ws:
            self.assertEqual(ws.response.headers.get_all("set-cookie"),
                             ["buyerly_session=new; Path=/", "buyerly_csrf=x; Path=/"])
            await ws.send("ping")
            self.assertEqual(await ws.recv(), "echo:ping")
            await ws.send("close")
            with self.assertRaises(ConnectionClosed):
                await ws.recv()
            self.assertEqual((ws.close_code, ws.close_reason), (4410, "bootstrap"))
        request = self.upstream_seen[-1]
        self.assertEqual(request.path, "/health/server/ws?since=5&workspace=w")
        self.assertEqual(request.headers["cookie"], "buyerly_session=old")
        self.assertEqual(request.headers["origin"], "https://buyerly.test")
        self.assertEqual(request.headers["user-agent"], "Browser/1")
        self.assertEqual(request.headers["x-forwarded-for"], "127.0.0.1")
        self.assertEqual(request.headers["x-forwarded-host"], f"127.0.0.1:{self.port}")

    async def test_a_refused_handshake_is_refused_alike(self):
        from websockets.asyncio.client import connect
        from websockets.exceptions import InvalidStatus

        with self.assertRaises(InvalidStatus) as refused:
            async with connect(self.url("/health/server/refused")):
                pass
        self.assertEqual(refused.exception.response.status_code, 403)

    async def test_an_unreachable_server_is_502_without_query_in_log(self):
        from websockets.asyncio.client import connect
        from websockets.exceptions import InvalidStatus

        self.upstream.close()
        await self.upstream.wait_closed()
        with self.assertLogs("api.server_proxy", level="ERROR") as logs:
            with self.assertRaises(InvalidStatus) as refused:
                async with connect(self.url("/health/server/ws?account=SECRET")):
                    pass
        self.assertEqual(refused.exception.response.status_code, 502)
        self.assertNotIn("SECRET", "\n".join(logs.output))

    async def test_other_sockets_stay_with_python(self):
        from websockets.asyncio.client import connect

        async with connect(self.url("/health/python")) as ws:
            self.assertEqual(await ws.recv(), "python")
        self.assertEqual(self.upstream_seen, [])


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
