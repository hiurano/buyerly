// The public site's pages (#435, #700), rendered as the build renders them.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { load } from './changelog/entries.ts';
import { LATEST_FILE, latestJson } from './changelog/latest.ts';
import { compileSite } from './plugin.ts';

const frontendDir = path.dirname(import.meta.dirname);
const entries = load();
const stylesheet = '/assets/public-website-test.css';
let pages: Record<string, string> = {};
let siteCss = '';

// Text as React writes it into HTML.
const html = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

beforeAll(async () => {
  const site = await compileSite();
  pages = site.renderPages({ stylesheet, entries });
  siteCss = site.siteCss;
}, 60_000);

describe('the public site', () => {
  it('is rendered from site/, not kept as HTML in public/', () => {
    expect(readdirSync(path.join(frontendDir, 'public')).filter((file) => file.endsWith('.html'))).toEqual([]);
    expect(existsSync(path.join(frontendDir, 'public', 'changelog'))).toBe(false);
    expect(existsSync(path.join(frontendDir, 'public', 'static', 'css'))).toBe(false);
    expect(Object.keys(pages).sort()).toEqual(
      ['about.html', 'changelog.html', 'data-deletion.html', 'landing.html', 'privacy.html', 'terms.html', ...entries.map((entry) => `changelog/${entry.slug}.html`)].sort(),
    );
  });

  it('gives every page the head, the header and the footer, and no script but the theme', () => {
    const header = /<header\b[\s\S]*?<\/header>/.exec(pages['landing.html'])![0];
    const footer = /<footer\b[\s\S]*?<\/footer>/.exec(pages['landing.html'])![0];
    for (const [file, page] of Object.entries(pages)) {
      expect(page.startsWith('<!doctype html>\n<html lang="en" data-theme="light"><head><meta charSet="utf-8"/>'), file).toBe(true);
      expect(page, file).toContain(header);
      expect(/<footer\b[\s\S]*?<\/footer>/.exec(page.replace(/ aria-current="page"/, ''))?.[0], file).toBe(footer);
      expect(page.split('<script').length - 1, file).toBe(1);
      expect(page, file).toContain(`<link rel="stylesheet" href="${stylesheet}"/>`);
      const ids = [...page.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1]);
      expect(new Set(ids).size, file).toBe(ids.length);
    }
  });

  it('marks the page itself in the footer', () => {
    for (const [file, link] of [['about.html', 'About'], ['privacy.html', 'Privacy'], ['terms.html', 'Terms'], ['changelog.html', 'Changelog']]) {
      expect(pages[file]).toContain(`aria-current="page">${link}</a>`);
    }
    expect(pages['landing.html']).not.toContain('aria-current');
  });

  it('lists the releases newest first, the first as the latest', () => {
    expect(entries.map((entry) => entry.date)).toEqual(entries.map((entry) => entry.date).sort().reverse());
    const articles = [...pages['changelog.html'].matchAll(/<article class="([^"]+)" id="([^"]+)">/g)];
    expect(articles.map((match) => match[2])).toEqual(entries.map((entry) => entry.slug));
    // The latest carries one class more than the others.
    expect(articles.map((match) => match[1].split(' ').length)).toEqual(articles.map((_, index) => (index === 0 ? 2 : 1)));
  });

  it('gives each release its own page with the way back', () => {
    for (const entry of entries) {
      const page = pages[`changelog/${entry.slug}.html`];
      expect(page).toContain(`">${html(entry.title)}</h1>`);
      expect(page).toMatch(/<a class="[^"]+" href="\/changelog"><svg/);
      expect(page).toContain(`<title>${html(entry.title)} — Changelog — Buyerly</title>`);
      expect(page).toContain(`<meta name="description" content="${html(entry.summary)}"/>`);
    }
  });

  it('shows the four newest releases on the landing, with a view-all link', () => {
    const landing = pages['landing.html'];
    const cards = [...landing.matchAll(/<a class="[^"]+" href="(\/changelog\/[^"]+)"><span/g)].map((match) => match[1]);
    expect(cards).toEqual(entries.slice(0, 4).map((entry) => entry.url));
    expect(landing).toMatch(/<a class="[^"]+" href="\/changelog"><span>View all<\/span>/);
  });

  it('renders the entries’ links and emphasis', () => {
    const index = pages['changelog.html'];
    expect(index).toContain('<a href="/signup">buyerly.app/signup</a>');
    expect(index).toContain('<em>when</em>');
  });

  it('builds one stylesheet from the CSS Modules, the element base first', () => {
    expect(siteCss.trimStart().startsWith('/* The public site')).toBe(true);
    expect(siteCss).not.toContain(':global');
    expect(siteCss).toContain("html[data-theme='light'] ._changelogBody_");
  });

  it("keeps the Help menu's What's new up to date (npm run changelog)", () => {
    expect(readFileSync(LATEST_FILE, 'utf8')).toBe(latestJson());
  });

  it('keeps changelog a reserved root for workspace slugs in the frontend', () => {
    expect(readFileSync(path.join(frontendDir, 'src', 'lib', 'routing.ts'), 'utf8')).toContain("  'changelog',\n");
  });
});
