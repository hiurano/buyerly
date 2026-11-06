"""Public changelog (#435): entries in changelog/*.md; the pages are built by
server/src/scripts/build-changelog.ts and checked by
server/test/scripts/build-changelog.test.ts. This file checks that the API serves them."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_ROOT = PROJECT_ROOT / "frontend" / "dist"
SLUGS = sorted(path.stem for path in (PROJECT_ROOT / "changelog").glob("*.md"))


class TestChangelogRoutes(unittest.IsolatedAsyncioTestCase):
    async def test_release_pages_are_served_without_authentication(self):
        import httpx
        from api.server import create_app
        from core.config import settings

        previous = settings.SERVE_STATIC
        settings.SERVE_STATIC = True
        try:
            transport = httpx.ASGITransport(app=create_app())
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                for slug in SLUGS:
                    url = f"/changelog/{slug}"
                    response = await client.get(url)
                    self.assertEqual(response.status_code, 200, url)
                    self.assertEqual(response.headers["cache-control"], "public, max-age=300")
                    self.assertEqual(response.content, (BUILD_ROOT / "changelog" / f"{slug}.html").read_bytes())
                for missing in ("/changelog/nope", "/changelog/..%2Flanding"):
                    self.assertEqual((await client.get(missing)).status_code, 404, missing)
        finally:
            settings.SERVE_STATIC = previous


if __name__ == "__main__":
    unittest.main()
