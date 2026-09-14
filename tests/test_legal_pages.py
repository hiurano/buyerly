from html.parser import HTMLParser
from pathlib import Path
import unittest
from urllib.parse import urlsplit

import httpx

from api.server import create_app
from core.config import settings


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "frontend" / "public"
DOCUMENTS = {
    "privacy.html": ("Privacy Policy", "Information we do not collect", "Meta Platform data"),
    "terms.html": ("Terms of Service", "Authority to connect assets", "Responsible automation"),
    "data-deletion.html": ("Data Deletion Instructions", "Send a deletion request", "What we delete"),
}


class AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        value = attrs.get("src") if tag == "img" else attrs.get("href") if tag == "link" else None
        if value and value.startswith("/"):
            self.urls.add(value)


class TestLegalPageFiles(unittest.TestCase):
    def test_required_meta_documents_are_public_build_assets(self):
        dockerfile = (PROJECT_ROOT / "frontend" / "Dockerfile").read_text()
        nginx = (PROJECT_ROOT / "frontend" / "nginx.conf").read_text()
        self.assertIn("COPY frontend/public ./public", dockerfile)
        self.assertIn("COPY --from=build /app/dist /usr/share/nginx/html", dockerfile)
        self.assertIn("^/(privacy|terms|data-deletion)/?$", nginx)
        self.assertIn("location /static/", nginx)
        # CI builds Vite before running this suite: verify the shipped artifact,
        # including each resource referenced by the unchanged legal documents.
        for filename in DOCUMENTS:
            source = PUBLIC_ROOT / filename
            built = PROJECT_ROOT / "frontend" / "dist" / filename
            self.assertEqual(built.read_bytes(), source.read_bytes())
            parser = AssetReferences()
            parser.feed(source.read_text())
            self.assertTrue(parser.urls)
            for url in parser.urls:
                path = urlsplit(url).path.lstrip("/")
                self.assertEqual(
                    (PROJECT_ROOT / "frontend" / "dist" / path).read_bytes(),
                    (PUBLIC_ROOT / path).read_bytes(),
                )

    def test_documents_identify_purpose_contact_and_deletion_process(self):
        for filename, required_text in DOCUMENTS.items():
            content = (PUBLIC_ROOT / filename).read_text()
            for text in required_text:
                self.assertIn(text, content)
            self.assertIn("contact@buyerly.app", content)
            self.assertNotIn("fonts.googleapis.com", content)
            for route in ("/privacy", "/terms", "/data-deletion"):
                self.assertIn(f'href="{route}"', content)


class TestLegalPageRoutes(unittest.IsolatedAsyncioTestCase):
    async def test_documents_and_assets_are_available_without_authentication(self):
        previous = settings.SERVE_STATIC
        settings.SERVE_STATIC = True
        try:
            app = create_app()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                for filename, headings in DOCUMENTS.items():
                    response = await client.get('/' + filename.removesuffix('.html'))
                    self.assertEqual(response.status_code, 200)
                    self.assertIn("text/html", response.headers["content-type"])
                    self.assertEqual(response.headers["cache-control"], "public, max-age=300")
                    self.assertIn(headings[0], response.text)
                    parser = AssetReferences()
                    parser.feed(response.text)
                    for url in parser.urls:
                        asset = await client.get(url)
                        self.assertEqual(asset.status_code, 200, url)
                        self.assertNotIn("text/html", asset.headers["content-type"])
                        self.assertEqual(asset.content, (PUBLIC_ROOT / urlsplit(url).path.lstrip('/')).read_bytes())
                for url in ('/static/js/app.js', '/static/css/styles.css', '/static/missing.svg'):
                    self.assertEqual((await client.get(url)).status_code, 404)
        finally:
            settings.SERVE_STATIC = previous


if __name__ == "__main__":
    unittest.main()
