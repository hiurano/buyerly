"""Build the public changelog (#435) from changelog/*.md.

Each entry is one release: front matter (date, title, summary), a lead
paragraph, `## ` sub-headings for the smaller changes of the same release and
`### Improvements` / `### Fixes` lists that the page shows collapsed, as
linear.app/changelog does. The script writes:

- frontend/public/changelog.html — every release, newest first;
- frontend/public/changelog/<slug>.html — one page per release;
- the four Changelog cards on frontend/public/landing.html.

The header, footer and <head> come from landing.html, so every public page
shares them. `--check` fails when a built file is out of date (CI runs it
through tests/test_changelog.py).

    python3 scripts/build_changelog.py [--check]
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRIES_DIR = ROOT / "changelog"
PUBLIC_DIR = ROOT / "frontend" / "public"
LANDING = PUBLIC_DIR / "landing.html"
LANDING_CARDS = 4
COLLAPSIBLE = ("Improvements", "Fixes")
CARDS_START = "<!-- changelog:cards -->"
CARDS_END = "<!-- /changelog:cards -->"


@dataclass
class Entry:
    slug: str
    date: dt.date
    title: str
    summary: str
    body: list[tuple[str, object]] = field(default_factory=list)

    @property
    def url(self) -> str:
        return f"/changelog/{self.slug}"


def inline(text: str) -> str:
    """Escape text and render [links](url) and *emphasis*."""
    out = html.escape(text, quote=False)
    out = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        lambda m: f'<a href="{html.escape(m[2])}">{m[1]}</a>',
        out,
    )
    return re.sub(r"\*([^*]+)\*", r"<em>\1</em>", out)


def anchor(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def parse(path: Path) -> Entry:
    match = re.fullmatch(r"---\n(.*?)\n---\n(.*)", path.read_text(encoding="utf-8"), re.S)
    if not match:
        raise ValueError(f"{path.name}: front matter is missing")
    meta = dict(line.split(": ", 1) for line in match[1].splitlines())
    slug = path.stem
    date = dt.date.fromisoformat(meta["date"])
    if not slug.startswith(f"{date.isoformat()}-"):
        raise ValueError(f"{path.name}: the file name must start with its date")
    entry = Entry(slug=slug, date=date, title=meta["title"], summary=meta["summary"])
    for block in re.split(r"\n\s*\n", match[2].strip()):
        lines = block.strip().splitlines()
        if lines[0].startswith("### "):
            name = lines[0][4:].strip()
            if name not in COLLAPSIBLE:
                raise ValueError(f"{path.name}: unknown list {name!r}")
            entry.body.append(("list", (name, [])))
        elif lines[0].startswith("## "):
            entry.body.append(("h", lines[0][3:].strip()))
        elif all(line.startswith("- ") for line in lines):
            if not entry.body or entry.body[-1][0] != "list":
                raise ValueError(f"{path.name}: a list must follow ### Improvements or ### Fixes")
            entry.body[-1][1][1].extend(line[2:].strip() for line in lines)
        else:
            entry.body.append(("p", " ".join(line.strip() for line in lines)))
    return entry


def load() -> list[Entry]:
    entries = [parse(path) for path in ENTRIES_DIR.glob("*.md")]
    return sorted(entries, key=lambda e: (e.date, e.slug), reverse=True)


def long_date(day: dt.date) -> str:
    return f"{day:%B} {day.day}, {day.year}"


def short_date(day: dt.date) -> str:
    return f"{day:%b} {day.day}, {day.year}"


CHEVRON = (
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M5.47 11.47a.75.75 0 1 0 1.06 1.06l4-4a.75.75 0 0 0 .01-1.05l-3.9-4a.75.75 0 1 0-1.08 1.04L8.94 8l-3.47 3.47Z"/></svg>'
)
BACK_ICON = (
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M10.53 11.47a.75.75 0 1 1-1.06 1.06l-4-4a.75.75 0 0 1-.01-1.05l3.9-4a.75.75 0 1 1 1.08 1.04L7.06 8l3.47 3.47Z"/></svg>'
)
LINK_ICON = (
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M8.47 3.53a3.25 3.25 0 0 1 4.6 4.6l-1.5 1.5a.75.75 0 1 1-1.07-1.06l1.5-1.5a1.75 1.75 0 0 0-2.47-2.48l-1.5 1.5a.75.75 0 0 1-1.06-1.06l1.5-1.5Zm-1.94 9.94a3.25 3.25 0 0 1-4.6-4.6l1.5-1.5a.75.75 0 0 1 1.07 1.06l-1.5 1.5a1.75 1.75 0 0 0 2.47 2.48l1.5-1.5a.75.75 0 1 1 1.06 1.06l-1.5 1.5Zm3-7a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.06-1.06l3-3a.75.75 0 0 1 1.06 0Z"/></svg>'
)


def release_body(entry: Entry, indent: str) -> str:
    parts: list[str] = []
    lists: list[str] = []
    for kind, value in entry.body:
        if kind == "p":
            parts.append(f"<p>{inline(value)}</p>")
        elif kind == "h":
            slug = anchor(value)
            parts.append(
                f'<h3 id="{entry.slug}-{slug}">{inline(value)}'
                f'<a class="changelog-anchor" href="{entry.url}#{entry.slug}-{slug}" aria-label="Link to {html.escape(value)}">{LINK_ICON}</a></h3>'
            )
        else:
            name, items = value
            rows = "".join(f"<li>{inline(item)}</li>" for item in items)
            lists.append(
                f'<details class="changelog-more"><summary>{name}<span class="changelog-chevron">{CHEVRON}</span></summary>'
                f"<ul>{rows}</ul></details>"
            )
    if lists:
        parts.append('<div class="changelog-more-group">' + "".join(lists) + "</div>")
    return "\n".join(indent + part for part in parts)


def page(head: str, header: str, footer: str, title: str, description: str, main: str) -> str:
    head = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{html.escape(description)}">', head)
    head = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)}</title>", head)
    return (
        '<!doctype html>\n<html lang="en" data-theme="light">\n'
        f'{head}\n<body class="changelog-body">\n'
        '  <a class="skip-link" href="#main">Skip to content</a>\n'
        f"  {header}\n{main}\n  {footer}\n</body>\n</html>\n"
    )


def shared_parts() -> tuple[str, str, str]:
    landing = LANDING.read_text(encoding="utf-8")
    head = re.search(r"<head>.*?</head>", landing, re.S)[0]
    header = re.search(r'<header class="site-header">.*?</header>', landing, re.S)[0]
    footer = re.search(r'<footer class="site-footer">.*?</footer>', landing, re.S)[0]
    footer = footer.replace('<a href="/changelog">Changelog</a>', '<a href="/changelog" aria-current="page">Changelog</a>')
    return head, header, footer


def build_index(entries: list[Entry], head: str, header: str, footer: str) -> str:
    releases = []
    for number, entry in enumerate(entries):
        latest = " is-latest" if number == 0 else ""
        releases.append(
            f'    <article class="changelog-release{latest}" id="{entry.slug}">\n'
            f'      <div class="changelog-release-date"><time datetime="{entry.date.isoformat()}">{long_date(entry.date)}</time></div>\n'
            '      <div class="changelog-release-body">\n'
            f'        <h2 class="changelog-release-title"><a href="{entry.url}">{inline(entry.title)}</a></h2>\n'
            f"{release_body(entry, '        ')}\n"
            "      </div>\n"
            "    </article>"
        )
    main = (
        '  <main id="main" class="changelog-page site-container" tabindex="-1">\n'
        '    <h1 class="changelog-page-title">Changelog</h1>\n'
        '    <hr class="changelog-divider">\n'
        + "\n".join(releases)
        + "\n  </main>"
    )
    return page(head, header, footer, "Changelog — Buyerly", "New features and improvements in Buyerly.", main)


def build_release(entry: Entry, head: str, header: str, footer: str) -> str:
    main = (
        '  <main id="main" class="changelog-page changelog-permalink site-container" tabindex="-1">\n'
        '    <div class="changelog-permalink-bar">\n'
        f'      <a class="changelog-back" href="/changelog">{BACK_ICON}<span>Changelog</span></a>\n'
        f'      <a class="changelog-permalink-date" href="{entry.url}"><time datetime="{entry.date.isoformat()}">{long_date(entry.date)}</time></a>\n'
        "    </div>\n"
        f'    <article class="changelog-release" id="{entry.slug}">\n'
        '      <div class="changelog-release-body">\n'
        f'        <h1 class="changelog-release-title">{inline(entry.title)}</h1>\n'
        f"{release_body(entry, '        ')}\n"
        "      </div>\n"
        "    </article>\n"
        "  </main>"
    )
    return page(head, header, footer, f"{entry.title} — Changelog — Buyerly", entry.summary, main)


def landing_cards(entries: list[Entry], landing: str) -> str:
    cards = []
    for number, entry in enumerate(entries[:LANDING_CARDS]):
        latest = " is-latest" if number == 0 else ""
        cards.append(
            f'        <a class="changelog-item{latest}" href="{entry.url}">\n'
            '          <span class="changelog-dot" aria-hidden="true"></span>\n'
            f"          <h3>{inline(entry.title)}</h3>\n"
            f"          <p>{inline(entry.summary)}</p>\n"
            f'          <time datetime="{entry.date.isoformat()}">{short_date(entry.date)}</time>\n'
            "        </a>"
        )
    block = f"{CARDS_START}\n" + "\n".join(cards) + f"\n        {CARDS_END}"
    start, end = landing.index(CARDS_START), landing.index(CARDS_END) + len(CARDS_END)
    return landing[:start] + block + landing[end:]


def outputs() -> dict[Path, str]:
    entries = load()
    head, header, footer = shared_parts()
    files = {PUBLIC_DIR / "changelog.html": build_index(entries, head, header, footer)}
    for entry in entries:
        files[PUBLIC_DIR / "changelog" / f"{entry.slug}.html"] = build_release(entry, head, header, footer)
    files[LANDING] = landing_cards(entries, LANDING.read_text(encoding="utf-8"))
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail when a built file is out of date")
    args = parser.parse_args()
    files = outputs()
    expected = set(files)
    stale = sorted((PUBLIC_DIR / "changelog").glob("*.html"))
    stale = [path for path in stale if path not in expected]
    changed = [path for path, text in files.items() if not path.is_file() or path.read_text(encoding="utf-8") != text]
    if args.check:
        for path in changed + stale:
            print(f"out of date: {path.relative_to(ROOT)}", file=sys.stderr)
        if changed or stale:
            print("run: python3 scripts/build_changelog.py", file=sys.stderr)
            return 1
        return 0
    for path in stale:
        path.unlink()
    for path in changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(files[path], encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
