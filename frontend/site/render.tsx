// The public site's pages, rendered to static HTML at build time (#700).
// site/plugin.ts builds this module for Node and calls renderPages; the pages
// carry no React on the client, only their HTML and one stylesheet.

// The stylesheet keeps the cascade order of the hand-written one it replaced:
// the element base first, then each component's CSS Module in this order.
import './base.css';
import './ui/Site.module.css';
import './ui/SiteHeader.module.css';
import './landing/Hero.module.css';
import './landing/Mockup.module.css';
import './landing/Manifesto.module.css';
import './landing/Landing.module.css';
import './landing/Feature.module.css';
import './landing/ChangelogCards.module.css';
import './landing/Cta.module.css';
import './ui/SiteFooter.module.css';
import './legal/Legal.module.css';
import './changelog/Changelog.module.css';

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangelogIndex, ChangelogRelease } from './changelog/ChangelogPages';
import type { Entry } from './changelog/entries';
import { Landing } from './landing/Landing';
import { About } from './legal/About';
import { DataDeletion } from './legal/DataDeletion';
import { Privacy } from './legal/Privacy';
import { Terms } from './legal/Terms';

export interface RenderInput {
  /** The built stylesheet's address. */
  stylesheet: string;
  /** Every release, newest first (site/changelog/entries.ts). */
  entries: Entry[];
}

const html = (page: ReactElement): string => `<!doctype html>\n${renderToStaticMarkup(page)}\n`;

/** Every page by its file in the build: landing.html, changelog/<slug>.html and so on. */
export function renderPages({ stylesheet, entries }: RenderInput): Record<string, string> {
  const pages: Record<string, string> = {
    'landing.html': html(<Landing stylesheet={stylesheet} entries={entries} />),
    'about.html': html(<About stylesheet={stylesheet} />),
    'privacy.html': html(<Privacy stylesheet={stylesheet} />),
    'terms.html': html(<Terms stylesheet={stylesheet} />),
    'data-deletion.html': html(<DataDeletion stylesheet={stylesheet} />),
    'changelog.html': html(<ChangelogIndex stylesheet={stylesheet} entries={entries} />),
  };
  for (const entry of entries) pages[`changelog/${entry.slug}.html`] = html(<ChangelogRelease stylesheet={stylesheet} entry={entry} />);
  return pages;
}
