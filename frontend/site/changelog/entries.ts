import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The public changelog's entries (#435), read from changelog/*.md.
//
// Each entry is one release: front matter (date, title, summary), a lead
// paragraph, `## ` sub-headings for the smaller changes of the same release and
// `### Improvements` / `### Fixes` lists that the page shows collapsed, as
// linear.app/changelog does. Text may hold [links](url) and *emphasis*.
//
// Plain erasable TypeScript: Node runs it without a build (latest.ts), and
// the site's Vite plugin loads it to render the pages.

export const ENTRIES_DIR = path.resolve(import.meta.dirname, '../../../changelog');
const COLLAPSIBLE = ['Improvements', 'Fixes'];

export type Block = { kind: 'p'; text: string } | { kind: 'h'; text: string } | { kind: 'list'; name: string; items: string[] };

export interface Entry {
  slug: string;
  date: string; // YYYY-MM-DD
  title: string;
  summary: string;
  body: Block[];
  url: string;
}

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
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${name}: the file name may hold only a-z, 0-9 and -`);
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

/** Every release, newest first. */
export function load(dir: string = ENTRIES_DIR): Entry[] {
  const entries = readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => parse(path.join(dir, file)));
  return entries.sort((a, b) => (a.date === b.date ? (a.slug < b.slug ? 1 : -1) : a.date < b.date ? 1 : -1));
}
