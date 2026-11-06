import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESERVED_WORKSPACE_SLUGS } from '../../src/workspaces/slugs.ts';
import { load, outOfDate, outputs, stalePages } from '../../src/scripts/build-changelog.ts';

// Public changelog (#435): entries in changelog/*.md, pages built by
// src/scripts/build-changelog.ts. Ported from tests/test_changelog.py (the
// route test stays there while the Python API serves the pages).

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PUBLIC_ROOT = path.join(ROOT, 'frontend', 'public');
const read = (...parts: string[]): string => readFileSync(path.join(PUBLIC_ROOT, ...parts), 'utf8');

describe('the changelog', () => {
  it('has built pages that match the entries', () => {
    const files = outputs();
    expect(outOfDate(files), 'run: node server/src/scripts/build-changelog.ts').toEqual([]);
    expect(stalePages(files)).toEqual([]);
    const built = readdirSync(path.join(PUBLIC_ROOT, 'changelog')).filter((file) => file.endsWith('.html')).sort();
    expect(built).toEqual(load().map((entry) => `${entry.slug}.html`).sort());
  });

  it('lists releases newest first with one latest and unique ids', () => {
    const entries = load();
    expect(entries.map((e) => e.date)).toEqual(entries.map((e) => e.date).sort().reverse());
    const index = read('changelog.html');
    expect([...index.matchAll(/<article class="changelog-release[^"]*" id="([^"]+)"/g)].map((m) => m[1])).toEqual(entries.map((e) => e.slug));
    expect(index.split('is-latest').length - 1).toBe(1);
    expect(index).toContain(`class="changelog-release is-latest" id="${entries[0].slug}"`);
    const ids = [...index.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows the four latest on the landing page with a view-all link', () => {
    const landing = read('landing.html');
    const cards = [...landing.matchAll(/<a class="changelog-item[^"]*" href="([^"]+)">/g)].map((m) => m[1]);
    expect(cards).toEqual(load().slice(0, 4).map((e) => e.url));
    expect(landing).toContain('<a class="changelog-all" href="/changelog"><span>View all</span>');
  });

  it('gives every release page the site frame', () => {
    const landing = read('landing.html');
    const header = /<header\b[\s\S]*?<\/header>/.exec(landing)![0];
    const footer = /<footer\b[\s\S]*?<\/footer>/.exec(landing)![0];
    for (const entry of load()) {
      const page = read('changelog', `${entry.slug}.html`);
      expect(page).toContain(header);
      expect(page).toContain(footer.replace('href="/changelog"', 'href="/changelog" aria-current="page"'));
      expect(page.split('<script').length - 1).toBe(1);
      expect(page).toContain(`<h1 class="changelog-release-title">${entry.title}</h1>`);
      expect(page).toContain('<a class="changelog-back" href="/changelog">');
    }
  });

  it('is a reserved root for workspace slugs, in the server and the frontend', () => {
    expect(RESERVED_WORKSPACE_SLUGS.has('changelog')).toBe(true);
    expect(readFileSync(path.join(ROOT, 'frontend', 'src', 'lib', 'routing.ts'), 'utf8')).toContain("  'changelog',\n");
  });
});
