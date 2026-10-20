from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
from urllib.parse import urlsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "frontend" / "public"
BUILD_ROOT = PROJECT_ROOT / "frontend" / "dist"
DOCUMENTS = {
    "landing.html": ("The operations system", "for Meta Ads teams", "Rules read like a sentence"),
    "about.html": ("About", "Company", "Get in touch"),
    "privacy.html": ("Privacy", "Data we use", "Your choices and deletion"),
    "terms.html": ("Terms", "Advertising and automation", "Ending access and changes"),
    "data-deletion.html": ("Data deletion", "Send a deletion request", "What happens next"),
    "changelog.html": ("Changelog", "Sign up for Buyerly", "Rules in Ads Manager"),
}
# Links into the React app rather than to public documents.
APP_ROUTES = {"/login", "/signup"}
BUSINESS_NAME = "individual entrepreneur ARTEM PETRUCHENKO"
BUSINESS_ADDRESS = "Georgia, Tbilisi, Vake District, Besarion Zhgenti Street, No. 49, Apartment 20"


class AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()
        self.links = []
        self.ids = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        value = attrs.get("src") if tag == "img" else attrs.get("href") if tag == "link" else None
        if value and value.startswith("/"):
            self.urls.add(value)
        if tag == "a":
            self.links.append(attrs.get("href", ""))
        if "id" in attrs:
            self.ids.append(attrs["id"])


class TestLegalPageFiles(unittest.TestCase):
    def test_public_pages_ship_with_fingerprinted_styles_and_local_fonts(self):
        server = (PROJECT_ROOT / "api" / "server.py").read_text()
        self.assertIn('"/": "landing.html"', server)
        for filename in DOCUMENTS:
            if filename != "landing.html":
                self.assertIn(f'"/{filename.removesuffix(".html")}": "{filename}"', server)
        for filename in DOCUMENTS:
            source = (PUBLIC_ROOT / filename).read_text()
            built = (BUILD_ROOT / filename).read_text()
            css_url = re.search(r'href="(/assets/public-website-[^\"]+\.css)"', built)
            self.assertIsNotNone(css_url, filename)
            self.assertEqual(built.replace(css_url[1], "/static/css/legal.css"), source)
            css = (BUILD_ROOT / css_url[1].lstrip("/")).read_text()
            self.assertIn("--site-reading-width: 624px", css)
            fonts = re.findall(r"url\('(/assets/[^']+\.woff2)'\)", css)
            self.assertEqual(len(fonts), 3)
            for font in fonts:
                self.assertTrue((BUILD_ROOT / font.lstrip("/")).is_file())
            parser = AssetReferences()
            parser.feed(built)
            for url in parser.urls:
                self.assertTrue((BUILD_ROOT / urlsplit(url).path.lstrip("/")).is_file(), url)

    def test_theme_is_set_before_first_paint_like_the_app(self):
        # The only script is the app's theme bootstrap: the saved Settings choice,
        # otherwise the system theme. Without JavaScript the page stays light.
        app_html = (PROJECT_ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
        theme_script = re.search(r"<script>.*?</script>", app_html, re.S)[0]
        self.assertIn("buyerly-interface-theme", theme_script)
        self.assertIn("prefers-color-scheme: dark", theme_script)
        self.assertLess(app_html.index(theme_script), app_html.index('src="/src/main.tsx"'))
        for filename in DOCUMENTS:
            content = (PUBLIC_ROOT / filename).read_text(encoding="utf-8")
            self.assertIn('<html lang="en" data-theme="light">', content)
            self.assertEqual(re.findall(r"<script\b.*?</script>", content, re.S), [theme_script], filename)
            self.assertLess(content.index(theme_script), content.index('rel="stylesheet"'), filename)

    def test_identity_navigation_and_anchors_are_consistent(self):
        shared_header = shared_footer = None
        for filename, required_text in DOCUMENTS.items():
            content = (PUBLIC_ROOT / filename).read_text()
            for text in (*required_text, BUSINESS_NAME, BUSINESS_ADDRESS, "Identification Number: 305879234", "contact@buyerly.app"):
                self.assertIn(text, content)
            self.assertEqual(content.count("<script"), 1)
            # Sign up opens the app's sign-up screen (#436), as Log in opens its login.
            self.assertIn('<a class="site-button-invert" href="/signup">Sign up</a>', content)
            self.assertNotIn("fonts.googleapis.com", content)
            header = re.search(r'<header\b.*?</header>', content, re.S)[0]
            footer = re.search(r'<footer\b.*?</footer>', content, re.S)[0].replace(' aria-current="page"', '')
            if shared_header is None:
                shared_header, shared_footer = header, footer
            self.assertEqual(header, shared_header)
            self.assertEqual(footer, shared_footer)
            self.assertNotIn('/data-deletion', footer)
            for route in ("/privacy", "/terms"):
                self.assertIn(f'href="{route}"', footer)
            parser = AssetReferences()
            parser.feed(content)
            self.assertEqual(len(parser.ids), len(set(parser.ids)))
            for link in parser.links:
                if link.startswith('#'):
                    self.assertIn(link[1:], parser.ids, filename)
                elif link.startswith('/') and link not in APP_ROUTES:
                    route, _, anchor = link.partition('#')
                    target = 'landing.html' if route == '/' else route[1:] + '.html'
                    self.assertTrue((PUBLIC_ROOT / target).is_file(), link)
                    if anchor:
                        target_parser = AssetReferences()
                        target_parser.feed((PUBLIC_ROOT / target).read_text())
                        self.assertIn(anchor, target_parser.ids, link)
        privacy = (PUBLIC_ROOT / "privacy.html").read_text()
        self.assertIn('href="/data-deletion"', privacy)
        self.assertIn('It does not erase stored advertising history', privacy)
        self.assertIn('email address', privacy)
        self.assertNotIn('securely hashed web password', privacy)

    def test_every_page_links_the_monochrome_icons(self):
        # Issue #432: no yellow icon anywhere. `?v=2` drops browsers' cached
        # yellow favicon, and /favicon.ico is a real file, not the app shell.
        icons = (
            '<link rel="icon" href="/favicon.ico?v=2" sizes="32x32"',
            '<link rel="icon" type="image/svg+xml" href="/static/icons/favicon.svg?v=2"',
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" sizes="180x180"',
        )
        pages = [PROJECT_ROOT / "frontend" / "index.html", *(PUBLIC_ROOT / name for name in DOCUMENTS)]
        pages += sorted((PUBLIC_ROOT / "changelog").glob("*.html"))
        for page in pages:
            head = re.search(r"<head>.*?</head>", page.read_text(), re.S)[0]
            for icon in icons:
                self.assertIn(icon, head, page.name)
            self.assertEqual(len(re.findall(r'rel="(?:icon|apple-touch-icon)"', head)), 3, page.name)
        from PIL import Image

        for path in ("favicon.ico", "apple-touch-icon.png", "static/icons/favicon-32x32.png", "buyerly-logo.png"):
            with Image.open(PUBLIC_ROOT / path) as image:
                pixels = image.convert("RGBA").getdata()
                colours = {(r, g, b) for r, g, b, a in pixels if a > 32}
            # Grey only: #222326, white and the shades between them.
            self.assertTrue(all(max(c) - min(c) <= 4 for c in colours), path)
        svg = (PUBLIC_ROOT / "static" / "icons" / "favicon.svg").read_text()
        self.assertIn("fill: #222326", svg)
        self.assertIn("@media (prefers-color-scheme: dark) { path { fill: #fff; } }", svg)

    def test_public_pages_promise_only_delivered_notification_channels(self):
        # Issue #196: alerts reach people through the Inbox and, if they turn it
        # on, email (services/inbox_email.py) or Telegram (services/inbox_telegram.py).
        # There are no scheduled reports and no other channels to promise.
        landing = (PUBLIC_ROOT / "landing.html").read_text()
        self.assertIn("lands in each teammate’s Inbox, and by email or Telegram for those who turn it on", landing)
        for filename in DOCUMENTS:
            content = (PUBLIC_ROOT / filename).read_text().lower()
            for claim in ("scheduled report", "channels they already use", "team reporting", "slack"):
                self.assertNotIn(claim, content, filename)


class TestLegalPageRoutes(unittest.IsolatedAsyncioTestCase):
    async def test_public_pages_and_assets_are_available_without_authentication(self):
        # Keep the file/build checks runnable without API dependencies or a DB.
        import httpx
        from api.server import create_app
        from core.config import settings

        previous = settings.SERVE_STATIC
        settings.SERVE_STATIC = True
        try:
            app = create_app()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                for filename in DOCUMENTS:
                    route = '/' if filename == 'landing.html' else '/' + filename.removesuffix('.html')
                    response = await client.get(route)
                    self.assertEqual(response.status_code, 200)
                    self.assertIn("text/html", response.headers["content-type"])
                    self.assertEqual(response.headers["cache-control"], "public, max-age=300")
                    self.assertEqual(response.content, (BUILD_ROOT / filename).read_bytes())
                    parser = AssetReferences()
                    parser.feed(response.text)
                    for url in parser.urls:
                        asset = await client.get(url)
                        self.assertEqual(asset.status_code, 200, url)
                        self.assertNotIn("text/html", asset.headers["content-type"])
                        self.assertEqual(asset.content, (BUILD_ROOT / urlsplit(url).path.lstrip('/')).read_bytes())
                login = await client.get('/login')
                self.assertEqual(login.content, (BUILD_ROOT / 'index.html').read_bytes())
                for url in ('/static/js/app.js', '/static/css/styles.css', '/static/missing.svg'):
                    self.assertEqual((await client.get(url)).status_code, 404)
        finally:
            settings.SERVE_STATIC = previous


if __name__ == "__main__":
    unittest.main()
