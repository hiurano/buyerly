"""Raster icons of the Buyerly mark, drawn from the same path as favicon.svg (#432).

The tab icons are Linear's favicon (#557): a white mark at 3/4 on a black
square with corners rounded 2/16, the same on light and dark tab bars, so it
reads at 16px in Chrome and Safari alike. The home screen icon is a full
#222326 tile (iOS rounds its corners). buyerly-logo.png stays the bare mark,
the CSS mask of the public pages' header.

    python3 scripts/build_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "frontend" / "public"
BRANDING_DIR = ROOT / "docs" / "branding" / "buyerly"

INK = (0x22, 0x23, 0x26, 255)
BLACK = (0, 0, 0, 255)
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


def tile(size: int, radius: float, color: tuple, scale: float) -> Image.Image:
    """White mark at `scale` on a `color` square with corners rounded `radius` of size."""
    big = size * SUPERSAMPLE
    shape = Image.new("L", (big, big), 0)
    ImageDraw.Draw(shape).rounded_rectangle((0, 0, big - 1, big - 1), radius=big * radius, fill=255)
    image = Image.new("RGBA", (size, size), color)
    image.putalpha(shape.resize((size, size), Image.LANCZOS))
    return Image.alpha_composite(image, mark(size, WHITE, scale=scale))


def tab_icon(size: int) -> Image.Image:
    """favicon.svg: rect rx 2/16, mark at translate(64 64) scale(0.75)."""
    return tile(size, radius=2 / 16, color=BLACK, scale=0.75)


def main() -> None:
    # Each size drawn on its own grid rather than shrunk from the largest.
    sizes = [(16, 16), (32, 32), (48, 48)]
    favicon = tab_icon(48)
    smaller = [tab_icon(16), tab_icon(32)]
    for directory in (PUBLIC_DIR, BRANDING_DIR):
        favicon.save(directory / "favicon.ico", sizes=sizes, append_images=smaller)
    # iOS rounds the corners of the home screen icon itself.
    touch = tile(180, radius=0, color=INK, scale=0.8)
    touch.save(PUBLIC_DIR / "apple-touch-icon.png", optimize=True)
    touch.save(BRANDING_DIR / "apple-touch-icon.png", optimize=True)
    favicon_32 = tab_icon(32)
    favicon_32.save(PUBLIC_DIR / "static" / "icons" / "favicon-32x32.png", optimize=True)
    favicon_32.save(BRANDING_DIR / "favicon-32x32.png", optimize=True)
    favicon_32.save(BRANDING_DIR / "favicon.png", optimize=True)
    # Also the CSS mask of the public pages, where only its alpha counts.
    mark(1024, INK).save(PUBLIC_DIR / "buyerly-logo.png", optimize=True)


if __name__ == "__main__":
    main()
