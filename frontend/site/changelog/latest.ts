import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { load } from './entries.ts';

// `npm run changelog` (#435, #700): checks the entries in changelog/*.md and
// writes frontend/src/lib/changelogLatest.json, the two newest releases that
// the Help menu's "What's new" lists in the app, as Linear's. The pages
// themselves are rendered by the frontend build (site/plugin.ts); `npm run dev`
// in frontend/ shows them at /changelog. `--check` fails when the JSON is out
// of date; site/site.test.ts checks the same in CI.
//
//   node frontend/site/changelog/latest.ts [--check]

export const LATEST_FILE = path.resolve(import.meta.dirname, '../../src/lib/changelogLatest.json');
const COUNT = 2;

export function latestJson(): string {
  const latest = load().slice(0, COUNT).map((entry) => ({ title: entry.title, url: entry.url }));
  return `${JSON.stringify(latest, null, 2)}\n`;
}

function main(): number {
  const text = latestJson();
  let current = '';
  try {
    current = readFileSync(LATEST_FILE, 'utf8');
  } catch {
    // written below
  }
  const relative = path.relative(process.cwd(), LATEST_FILE);
  if (process.argv.includes('--check')) {
    if (current === text) return 0;
    console.error(`out of date: ${relative}\nrun: npm run changelog`);
    return 1;
  }
  if (current !== text) {
    writeFileSync(LATEST_FILE, text, 'utf8');
    console.log(`wrote ${relative}`);
  }
  return 0;
}

if (import.meta.filename === process.argv[1]) process.exitCode = main();
