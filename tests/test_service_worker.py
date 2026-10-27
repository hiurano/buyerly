"""The app's service worker (#499): how the server serves it, and its kill switch."""

from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_ROOT = PROJECT_ROOT / "frontend" / "dist"
WORKER_SOURCE = PROJECT_ROOT / "frontend" / "sw" / "sw.ts"


class TestServiceWorkerSource(unittest.TestCase):
    def test_the_worker_leaves_to_the_server_exactly_the_roots_it_serves(self):
        """A navigation the worker answers with the app would hide a server page; one it misses goes to the network."""
        from core.workspace_slugs import RESERVED_WORKSPACE_SLUGS

        server = (PROJECT_ROOT / "api" / "server.py").read_text()
        app_roots = set(re.findall(r'"([a-z-]+)"', re.search(r"app_roots = \{([^}]*)\}", server).group(1)))
        source = WORKER_SOURCE.read_text()
        listed = re.search(r"const SERVER_ROOTS = new Set\(\[(.*?)\]\)", source, re.S).group(1)
        self.assertEqual(set(re.findall(r"'([a-z-]+)'", listed)), set(RESERVED_WORKSPACE_SLUGS) - app_roots)

    def test_the_worker_never_caches_api_responses(self):
        source = WORKER_SOURCE.read_text()
        self.assertNotIn("cache.put", source)
        self.assertIn("if (request.method !== 'GET') return;", source)


class TestServiceWorkerRoute(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from core.config import settings

        self.settings = settings
        self.previous = (settings.SERVE_STATIC, settings.SERVICE_WORKER)
        settings.SERVE_STATIC = True

    async def asyncTearDown(self):
        self.settings.SERVE_STATIC, self.settings.SERVICE_WORKER = self.previous

    async def fetch_worker(self):
        import httpx
        from api.server import create_app

        transport = httpx.ASGITransport(app=create_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/sw.js")

    async def test_the_worker_is_never_cached_on_the_way(self):
        self.settings.SERVICE_WORKER = True
        response = await self.fetch_worker()
        self.assertEqual(response.status_code, 200)
        self.assertIn("javascript", response.headers["content-type"])
        self.assertEqual(response.headers["cache-control"], "no-cache, no-store")
        self.assertEqual(response.content, (BUILD_ROOT / "sw.js").read_bytes())
        # The build wrote its files into it: the app shell and its entry chunk.
        self.assertIn('"/index.html"', response.text)
        entry = re.search(r'src="(/assets/index-[\w-]+\.js)"', (BUILD_ROOT / "index.html").read_text()).group(1)
        self.assertIn(f'"{entry}"', response.text)
        self.assertNotIn("export {}", response.text)

    async def test_the_kill_switch_serves_the_worker_that_unregisters(self):
        self.settings.SERVICE_WORKER = False
        response = await self.fetch_worker()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-cache, no-store")
        self.assertEqual(response.content, (BUILD_ROOT / "sw-off.js").read_bytes())
        self.assertIn("registration.unregister()", response.text)


if __name__ == "__main__":
    unittest.main()
