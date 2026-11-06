import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Build the public changelog (#435) from changelog/*.md (#611, stage 5; port
// of scripts/build_changelog.py, byte for byte the same pages).
//
// Each entry is one release: front matter (date, title, summary), a lead
// paragraph, `## ` sub-headings for the smaller changes of the same release and
// `### Improvements` / `### Fixes` lists that the page shows collapsed, as
// linear.app/changelog does. The script writes:
//
// - frontend/public/changelog.html: every release, newest first;
// - frontend/public/changelog/<slug>.html: one page per release;
// - the four Changelog cards on frontend/public/landing.html;
// - frontend/src/lib/changelogLatest.json: the two newest releases, for the
//   Help menu's "What's new" in the app, as Linear's.
//
// The header, footer and <head> come from landing.html, so every public page
// shares them. `--check` fails when a built file is out of date (CI runs it
// through server/test/scripts/build-changelog.test.ts).
//
//   node server/src/scripts/build-changelog.ts [--check]
//
// Plain erasable TypeScript, so Node 24 runs it without a build.

const ROOT = path.resolve(import.meta.dirname, '../../..');
const ENTRIES_DIR = path.join(ROOT, 'changelog');
const PUBLIC_DIR = path.join(ROOT, 'frontend', 'public');
const LANDING = path.join(PUBLIC_DIR, 'landing.html');
const LANDING_CARDS = 4;
const APP_LATEST = path.join(ROOT, 'frontend', 'src', 'lib', 'changelogLatest.json');
const APP_LATEST_COUNT = 2;
const COLLAPSIBLE = ['Improvements', 'Fixes'];
const CARDS_START = '<!-- changelog:cards -->';
const CARDS_END = '<!-- /changelog:cards -->';

type Block = { kind: 'p'; text: string } | { kind: 'h'; text: string } | { kind: 'list'; name: string; items: string[] };

export interface Entry {
  slug: string;
  date: string; // YYYY-MM-DD
  title: string;
  summary: string;
  body: Block[];
  url: string;
}

// html.escape
function escapeHtml(text: string, quote = true): string {
  const out = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return quote ? out.replace(/"/g, '&quot;').replace(/'/g, '&#x27;') : out;
}

// Escape text and render [links](url) and *emphasis*.
function inline(text: string): string {
  const out = escapeHtml(text, false).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_all, label: string, url: string) => `<a href="${escapeHtml(url)}">${label}</a>`);
  return out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

const anchor = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function parse(file: string): Entry {
  const name = path.basename(file);
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(readFileSync(file, 'utf8'));
  if (!match) throw new Error(`${name}: front matter is missing`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(': ');
    if (at < 0) throw new Error(`${name}: bad front matter line ${JSON.stringify(line)}`);
    meta[line.slice(0, at)] = line.slice(at + 2);
  }
  const slug = path.basename(file, '.md');
  const date = meta.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || Number.isNaN(Date.parse(date))) throw new Error(`${name}: bad date ${String(date)}`);
  if (!slug.startsWith(`${date}-`)) throw new Error(`${name}: the file name must start with its date`);
  const entry: Entry = { slug, date, title: meta.title, summary: meta.summary, body: [], url: `/changelog/${slug}` };
  for (const block of match[2].trim().split(/\n\s*\n/)) {
    const lines = block.trim().split(/\r?\n/);
    const last = entry.body.at(-1);
    if (lines[0].startsWith('### ')) {
      const listName = lines[0].slice(4).trim();
      if (!COLLAPSIBLE.includes(listName)) throw new Error(`${name}: unknown list '${listName}'`);
      entry.body.push({ kind: 'list', name: listName, items: [] });
    } else if (lines[0].startsWith('## ')) {
      entry.body.push({ kind: 'h', text: lines[0].slice(3).trim() });
    } else if (lines.every((line) => line.startsWith('- '))) {
      if (last?.kind !== 'list') throw new Error(`${name}: a list must follow ### Improvements or ### Fixes`);
      last.items.push(...lines.map((line) => line.slice(2).trim()));
    } else {
      entry.body.push({ kind: 'p', text: lines.map((line) => line.trim()).join(' ') });
    }
  }
  return entry;
}

export function load(): Entry[] {
  const entries = readdirSync(ENTRIES_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => parse(path.join(ENTRIES_DIR, file)));
  return entries.sort((a, b) => (a.date === b.date ? (a.slug < b.slug ? 1 : -1) : a.date < b.date ? 1 : -1));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateParts = (day: string): [number, number, number] => {
  const [year, month, date] = day.split('-').map(Number);
  return [year, month - 1, date];
};
const longDate = (day: string): string => {
  const [year, month, date] = dateParts(day);
  return `${MONTHS[month]} ${date}, ${year}`;
};
const shortDate = (day: string): string => {
  const [year, month, date] = dateParts(day);
  return `${MONTHS[month].slice(0, 3)} ${date}, ${year}`;
};

const CHEVRON =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<path d="M5.47 11.47a.75.75 0 1 0 1.06 1.06l4-4a.75.75 0 0 0 .01-1.05l-3.9-4a.75.75 0 1 0-1.08 1.04L8.94 8l-3.47 3.47Z"/></svg>';
const BACK_ICON =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<path d="M10.53 11.47a.75.75 0 1 1-1.06 1.06l-4-4a.75.75 0 0 1-.01-1.05l3.9-4a.75.75 0 1 1 1.08 1.04L7.06 8l3.47 3.47Z"/></svg>';
const LINK_ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<path d="M8.47 3.53a3.25 3.25 0 0 1 4.6 4.6l-1.5 1.5a.75.75 0 1 1-1.07-1.06l1.5-1.5a1.75 1.75 0 0 0-2.47-2.48l-1.5 1.5a.75.75 0 0 1-1.06-1.06l1.5-1.5Zm-1.94 9.94a3.25 3.25 0 0 1-4.6-4.6l1.5-1.5a.75.75 0 0 1 1.07 1.06l-1.5 1.5a1.75 1.75 0 0 0 2.47 2.48l1.5-1.5a.75.75 0 1 1 1.06 1.06l-1.5 1.5Zm3-7a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.06-1.06l3-3a.75.75 0 0 1 1.06 0Z"/></svg>';

function releaseBody(entry: Entry, indent: string): string {
  const parts: string[] = [];
  const lists: string[] = [];
  for (const block of entry.body) {
    if (block.kind === 'p') {
      parts.push(`<p>${inline(block.text)}</p>`);
    } else if (block.kind === 'h') {
      const slug = anchor(block.text);
      parts.push(
        `<h3 id="${entry.slug}-${slug}">${inline(block.text)}` +
          `<a class="changelog-anchor" href="${entry.url}#${entry.slug}-${slug}" aria-label="Link to ${escapeHtml(block.text)}">${LINK_ICON}</a></h3>`,
      );
    } else {
      const rows = block.items.map((item) => `<li>${inline(item)}</li>`).join('');
      lists.push(
        `<details class="changelog-more"><summary>${block.name}<span class="changelog-chevron">${CHEVRON}</span></summary>` + `<ul>${rows}</ul></details>`,
      );
    }
  }
  if (lists.length) parts.push(`<div class="changelog-more-group">${lists.join('')}</div>`);
  return parts.map((part) => indent + part).join('\n');
}

interface Frame {
  head: string;
  header: string;
  footer: string;
}

function page(frame: Frame, title: string, description: string, main: string): string {
  const head = frame.head
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${escapeHtml(description)}">`)
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
  return (
    '<!doctype html>\n<html lang="en" data-theme="light">\n' +
    `${head}\n<body class="changelog-body">\n` +
    '  <a class="skip-link" href="#main">Skip to content</a>\n' +
    `  ${frame.header}\n${main}\n  ${frame.footer}\n</body>\n</html>\n`
  );
}

function sharedParts(): Frame {
  const landing = readFileSync(LANDING, 'utf8');
  const take = (pattern: RegExp): string => {
    const found = pattern.exec(landing);
    if (!found) throw new Error(`landing.html has no ${pattern.source}`);
    return found[0];
  };
  const footer = take(/<footer class="site-footer">[\s\S]*?<\/footer>/).replace(
    '<a href="/changelog">Changelog</a>',
    '<a href="/changelog" aria-current="page">Changelog</a>',
  );
  return { head: take(/<head>[\s\S]*?<\/head>/), header: take(/<header class="site-header">[\s\S]*?<\/header>/), footer };
}

function buildIndex(entries: Entry[], frame: Frame): string {
  const releases = entries.map((entry, number) => {
    const latest = number === 0 ? ' is-latest' : '';
    return (
      `    <article class="changelog-release${latest}" id="${entry.slug}">\n` +
      `      <div class="changelog-release-date"><time datetime="${entry.date}">${longDate(entry.date)}</time></div>\n` +
      '      <div class="changelog-release-body">\n' +
      `        <h2 class="changelog-release-title"><a href="${entry.url}">${inline(entry.title)}</a></h2>\n` +
      `${releaseBody(entry, '        ')}\n` +
      '      </div>\n' +
      '    </article>'
    );
  });
  const main =
    '  <main id="main" class="changelog-page site-container" tabindex="-1">\n' +
    '    <h1 class="changelog-page-title">Changelog</h1>\n' +
    '    <hr class="changelog-divider">\n' +
    releases.join('\n') +
    '\n  </main>';
  return page(frame, 'Changelog — Buyerly', 'New features and improvements in Buyerly.', main);
}

function buildRelease(entry: Entry, frame: Frame): string {
  const main =
    '  <main id="main" class="changelog-page changelog-permalink site-container" tabindex="-1">\n' +
    '    <div class="changelog-permalink-bar">\n' +
    `      <a class="changelog-back" href="/changelog">${BACK_ICON}<span>Changelog</span></a>\n` +
    `      <a class="changelog-permalink-date" href="${entry.url}"><time datetime="${entry.date}">${longDate(entry.date)}</time></a>\n` +
    '    </div>\n' +
    `    <article class="changelog-release" id="${entry.slug}">\n` +
    '      <div class="changelog-release-body">\n' +
    `        <h1 class="changelog-release-title">${inline(entry.title)}</h1>\n` +
    `${releaseBody(entry, '        ')}\n` +
    '      </div>\n' +
    '    </article>\n' +
    '  </main>';
  return page(frame, `${entry.title} — Changelog — Buyerly`, entry.summary, main);
}

function landingCards(entries: Entry[], landing: string): string {
  const cards = entries.slice(0, LANDING_CARDS).map((entry, number) => {
    const latest = number === 0 ? ' is-latest' : '';
    return (
      `        <a class="changelog-item${latest}" href="${entry.url}">\n` +
      '          <span class="changelog-dot" aria-hidden="true"></span>\n' +
      `          <h3>${inline(entry.title)}</h3>\n` +
      `          <p>${inline(entry.summary)}</p>\n` +
      `          <time datetime="${entry.date}">${shortDate(entry.date)}</time>\n` +
      '        </a>'
    );
  });
  const block = `${CARDS_START}\n${cards.join('\n')}\n        ${CARDS_END}`;
  const start = landing.indexOf(CARDS_START);
  const end = landing.indexOf(CARDS_END) + CARDS_END.length;
  if (start < 0 || end < CARDS_END.length) throw new Error('landing.html has no changelog card markers');
  return landing.slice(0, start) + block + landing.slice(end);
}

// Every file the changelog is built into, with its content.
export function outputs(): Map<string, string> {
  const entries = load();
  const frame = sharedParts();
  const files = new Map<string, string>();
  files.set(path.join(PUBLIC_DIR, 'changelog.html'), buildIndex(entries, frame));
  for (const entry of entries) files.set(path.join(PUBLIC_DIR, 'changelog', `${entry.slug}.html`), buildRelease(entry, frame));
  files.set(LANDING, landingCards(entries, readFileSync(LANDING, 'utf8')));
  const latest = entries.slice(0, APP_LATEST_COUNT).map((entry) => ({ title: entry.title, url: entry.url }));
  files.set(APP_LATEST, `${JSON.stringify(latest, null, 2)}\n`);
  return files;
}

// Built release pages with no entry any more.
export function stalePages(files: Map<string, string>): string[] {
  const dir = path.join(PUBLIC_DIR, 'changelog');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => path.join(dir, file))
    .filter((file) => !files.has(file))
    .sort();
}

export function outOfDate(files: Map<string, string>): string[] {
  return [...files].filter(([file, text]) => !existsSync(file) || readFileSync(file, 'utf8') !== text).map(([file]) => file);
}

function main(): number {
  const check = process.argv.includes('--check');
  const files = outputs();
  const stale = stalePages(files);
  const changed = outOfDate(files);
  const relative = (file: string): string => path.relative(ROOT, file);
  if (check) {
    for (const file of [...changed, ...stale]) console.error(`out of date: ${relative(file)}`);
    if (changed.length || stale.length) {
      console.error('run: node server/src/scripts/build-changelog.ts');
      return 1;
    }
    return 0;
  }
  for (const file of stale) unlinkSync(file);
  for (const file of changed) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, files.get(file)!, 'utf8');
    console.log(`wrote ${relative(file)}`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
