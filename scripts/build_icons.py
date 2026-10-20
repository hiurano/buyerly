"""Raster icons of the Buyerly mark, drawn from the same path as favicon.svg (#432).

The SVG favicon follows the system theme (#222326 in light, white in dark).
Raster icons cannot, so like Linear's favicon.ico they put the white mark on
a #222326 tile, which reads on light and dark tab bars alike.

    python3 scripts/build_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "frontend" / "public"
BRANDING_DIR = ROOT / "docs" / "branding" / "buyerly"

INK = (0x22, 0x23, 0x26, 255)
WHITE = (255, 255, 255, 255)
SUPERSAMPLE = 16

# frontend/public/static/icons/favicon.svg, 512 frame, evenodd.
BODY = [(192, 464), (192, 336), (112, 336), (80, 224), (192, 224), (192, 192),
        (288, 192), (288, 48), (320, 48), (432, 464)]
NOTCH = [(288, 224), (224, 256), (288, 256)]
FLAG = [(192, 176), (192, 48), (224, 48), (256, 176)]


def mark(size: int, color: tuple, scale: float = 1.0) -> Image.Image:
    """The mark on a transparent square, `scale` of the 512 frame, centred."""
    big = size * SUPERSAMPLE
    alpha = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(alpha)
    k = big * scale / 512
    offset = big * (1 - scale) / 2

    def points(polygon):
        return [(offset + x * k, offset + y * k) for x, y in polygon]

    draw.polygon(points(BODY), fill=255)
    draw.polygon(points(FLAG), fill=255)
    draw.polygon(points(NOTCH), fill=0)
    image = Image.new("RGBA", (size, size), color)
    image.putalpha(alpha.resize((size, size), Image.LANCZOS))
    return image


def tile(size: int, radius: float) -> Image.Image:
    """White mark on a #222326 square with rounded corners (`radius` of size)."""
    big = size * SUPERSAMPLE
    shape = Image.new("L", (big, big), 0)
    ImageDraw.Draw(shape).rounded_rectangle((0, 0, big - 1, big - 1), radius=big * radius, fill=255)
    image = Image.new("RGBA", (size, size), INK)
    image.putalpha(shape.resize((size, size), Image.LANCZOS))
    return Image.alpha_composite(image, mark(size, WHITE, scale=0.8))


def main() -> None:
    # Each size drawn on its own grid rather than shrunk from the largest.
    sizes = [(16, 16), (32, 32), (48, 48)]
    favicon = tile(48, radius=0.125)
    smaller = [tile(16, radius=0.125), tile(32, radius=0.125)]
    for directory in (PUBLIC_DIR, BRANDING_DIR):
        favicon.save(directory / "favicon.ico", sizes=sizes, append_images=smaller)
    # iOS rounds the corners of the home screen icon itself.
    touch = tile(180, radius=0)
    touch.save(PUBLIC_DIR / "apple-touch-icon.png", optimize=True)
    touch.save(BRANDING_DIR / "apple-touch-icon.png", optimize=True)
    favicon_32 = tile(32, radius=0.125)
    favicon_32.save(PUBLIC_DIR / "static" / "icons" / "favicon-32x32.png", optimize=True)
    favicon_32.save(BRANDING_DIR / "favicon-32x32.png", optimize=True)
    favicon_32.save(BRANDING_DIR / "favicon.png", optimize=True)
    # Also the CSS mask of the public pages, where only its alpha counts.
    mark(1024, INK).save(PUBLIC_DIR / "buyerly-logo.png", optimize=True)


if __name__ == "__main__":
    main()
