"""Public changelog (#435): entries in changelog/*.md, pages built by scripts/build_changelog.py."""

from html.parser import HTMLParser
from pathlib import Path
import importlib.util
import re
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "frontend" / "public"
BUILD_ROOT = PROJECT_ROOT / "frontend" / "dist"

spec = importlib.util.spec_from_file_location("build_changelog", PROJECT_ROOT / "scripts" / "build_changelog.py")
build_changelog = importlib.util.module_from_spec(spec)
sys.modules["build_changelog"] = build_changelog  # dataclasses look the module up
spec.loader.exec_module(build_changelog)


class Ids(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []

    def handle_starttag(self, tag, attrs):
        if "id" in dict(attrs):
            self.ids.append(dict(attrs)["id"])


class TestChangelogFiles(unittest.TestCase):
    def test_built_pages_match_the_entries(self):
        for path, text in build_changelog.outputs().items():
            self.assertEqual(path.read_text(encoding="utf-8"), text, f"run scripts/build_changelog.py: {path}")
        built = {path.name for path in (PUBLIC_ROOT / "changelog").glob("*.html")}
        self.assertEqual(built, {f"{entry.slug}.html" for entry in build_changelog.load()})

    def test_releases_are_newest_first_with_one_latest(self):
        entries = build_changelog.load()
        self.assertEqual([e.date for e in entries], sorted((e.date for e in entries), reverse=True))
        index = (PUBLIC_ROOT / "changelog.html").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r'<article class="changelog-release[^"]*" id="([^"]+)"', index), [e.slug for e in entries])
        self.assertEqual(index.count("is-latest"), 1)
        self.assertIn(f'class="changelog-release is-latest" id="{entries[0].slug}"', index)
        parser = Ids()
        parser.feed(index)
        self.assertEqual(len(parser.ids), len(set(parser.ids)))

    def test_landing_shows_the_four_latest_and_view_all(self):
        landing = (PUBLIC_ROOT / "landing.html").read_text(encoding="utf-8")
        cards = re.findall(r'<a class="changelog-item[^"]*" href="([^"]+)">', landing)
        self.assertEqual(cards, [e.url for e in build_changelog.load()[:4]])
        self.assertIn('<a class="changelog-all" href="/changelog"><span>View all</span>', landing)

    def test_every_release_page_shares_the_site_frame(self):
        landing = (PUBLIC_ROOT / "landing.html").read_text(encoding="utf-8")
        header = re.search(r"<header\b.*?</header>", landing, re.S)[0]
        footer = re.search(r"<footer\b.*?</footer>", landing, re.S)[0]
        for entry in build_changelog.load():
            page = (PUBLIC_ROOT / "changelog" / f"{entry.slug}.html").read_text(encoding="utf-8")
            self.assertIn(header, page)
            self.assertIn(footer.replace('href="/changelog"', 'href="/changelog" aria-current="page"'), page)
            self.assertEqual(page.count("<script"), 1)
            self.assertIn(f'<h1 class="changelog-release-title">{entry.title}</h1>', page)
            self.assertIn('<a class="changelog-back" href="/changelog">', page)

    def test_changelog_is_a_reserved_root(self):
        from core.workspace_slugs import RESERVED_WORKSPACE_SLUGS

        self.assertIn("changelog", RESERVED_WORKSPACE_SLUGS)
        routing = (PROJECT_ROOT / "frontend" / "src" / "lib" / "routing.ts").read_text(encoding="utf-8")
        self.assertIn("  'changelog',\n", routing)


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
                for entry in build_changelog.load():
                    response = await client.get(entry.url)
                    self.assertEqual(response.status_code, 200, entry.url)
                    self.assertEqual(response.headers["cache-control"], "public, max-age=300")
                    self.assertEqual(response.content, (BUILD_ROOT / "changelog" / f"{entry.slug}.html").read_bytes())
                for missing in ("/changelog/nope", "/changelog/..%2Flanding"):
                    self.assertEqual((await client.get(missing)).status_code, 404, missing)
        finally:
            settings.SERVE_STATIC = previous


if __name__ == "__main__":
    unittest.main()
