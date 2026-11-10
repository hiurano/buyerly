/*
 * The global stylesheet is gone (#699): a component's look lives in its StyleX
 * or a CSS Module, the layer stylesheets only hold the reset, tokens, page base
 * and keyframes, and the classes a browser check reads are plain data hooks.
 * This guard keeps a new index.css — or a stray, unstyled global class — from
 * creeping back.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesDir = fileURLToPath(new URL('.', import.meta.url));
const srcDir = fileURLToPath(new URL('..', import.meta.url));
const frontendDir = fileURLToPath(new URL('../..', import.meta.url));
const scriptsDir = fileURLToPath(new URL('../../../scripts/', import.meta.url));

/** The layer stylesheets src/styles holds: the reset, tokens and page base. */
const layerStylesheets = ['app.css', 'base.css', 'reset.css', 'tokens.css'];

/**
 * The global classes a plain stylesheet may still define besides the hooks a
 * browser check reads. Each is global for a reason StyleX and a CSS Module
 * cannot cover:
 * - an `animation` naming a @keyframes in base.css (a Module would scope the
 *   name to a keyframe that does not exist): animate-scale-in,
 *   selection-dock-enter, toast-enter, buyerly-command-menu-motion and the
 *   menu/panel/bell motion classes;
 * - a descendant of an element a primitive draws itself, which StyleX cannot
 *   reach: cmdk's group heading (buyerly-command-group) and a sidebar row's
 *   hover (buyerly-favorite-remove, buyerly-favorite-star);
 * - a CSS custom property (or `!important`) set on a primitive to override what
 *   its StyleX leaves unset: buyerly-row-menu-*, buyerly-bell-*,
 *   buyerly-shortcuts-*, buyerly-favorite-number,
 *   buyerly-workspace-switcher-group.
 */
const globalClasses = new Set([
  'animate-scale-in',
  'buyerly-bell-name',
  'buyerly-bell-popover',
  'buyerly-bell-row',
  'buyerly-bell-rows',
  'buyerly-bell-section',
  'buyerly-bell-title',
  'buyerly-command-group',
  'buyerly-command-menu-motion',
  'buyerly-command-theme-badge',
  'buyerly-favorite-number',
  'buyerly-favorite-remove',
  'buyerly-favorite-star',
  'buyerly-menu',
  'buyerly-row-menu',
  'buyerly-row-menu-chevron',
  'buyerly-row-menu-icon',
  'buyerly-row-menu-keys',
  'buyerly-row-menu-main',
  'buyerly-row-menu-separator',
  'buyerly-row-menu-trail',
  'buyerly-shortcuts-backdrop',
  'buyerly-shortcuts-close',
  'buyerly-shortcuts-group',
  'buyerly-shortcuts-groups',
  'buyerly-shortcuts-header',
  'buyerly-shortcuts-keys',
  'buyerly-shortcuts-list',
  'buyerly-shortcuts-panel',
  'buyerly-shortcuts-row',
  'buyerly-shortcuts-search',
  'buyerly-shortcuts-search-icon',
  'buyerly-shortcuts-title',
  'buyerly-workspace-switcher-group',
  'selection-dock-enter',
  'toast-enter',
]);

/** Every file under `dir`, recursively. */
function walk(dir: string, extension: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, 'utf8');
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const escapeRegExp = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The class names a stylesheet mentions, a module's or a plain one's. */
const classNames = (css: string) => [
  ...withoutComments(css).matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g),
].map((match) => match[1]);

/** The class selectors a plain stylesheet defines, where a class starts a selector. */
const classSelectors = (css: string) => [
  ...withoutComments(css).matchAll(/(?:^|[\s,{>+~])\.([A-Za-z_][A-Za-z0-9_-]*)/g),
].map((match) => match[1]);

const cssFiles = walk(srcDir, '.css');

/** The class names any stylesheet — module or plain — defines. */
const definedClasses = new Set(cssFiles.flatMap((file) => classNames(read(file))));

const scripts = walk(scriptsDir, '.ts').map(read).join('\n');
const html = read(join(frontendDir, 'index.html'));

/** Whether a browser check reads this class name, in its scripts or the splash. */
const isAHook = (name: string) => (
  new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(name)}([^A-Za-z0-9_-]|$)`).test(scripts)
  || new RegExp(`\\.${escapeRegExp(name)}([^A-Za-z0-9_-]|$)`).test(html)
);

/** The argument text of every `withClassName(...)` call, after its first argument. */
function withClassNameArguments(source: string): string[] {
  const args: string[] = [];
  for (const call of source.matchAll(/withClassName\(/g)) {
    let i = call.index + call[0].length;
    let depth = 1;
    let quote: string | null = null;
    const start = i;
    for (; i < source.length && depth > 0; i++) {
      const char = source[i];
      if (quote) {
        if (char === '\\') i++;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') depth--;
    }
    // Split on the top-level commas, then drop the first argument (stylex.props).
    args.push(...splitTopLevel(source.slice(start, i - 1)).slice(1));
  }
  return args;
}

/** Split on the commas at bracket depth 0, ignoring commas inside strings. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      current += char;
      if (char === '\\') current += text[++i];
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
    } else if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** The class tokens a `withClassName(...)` call passes as string literals. */
const withClassNameClasses = (source: string) => withClassNameArguments(source)
  .flatMap((argument) => [...argument.matchAll(/'([^'\\]*)'|"([^"\\]*)"|`([^`]*)`/g)])
  .flatMap((match) => (match[1] ?? match[2] ?? match[3]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/));

/** The class tokens a `className={`…`}` template writes outside its `${…}` placeholders. */
const classNameTemplateClasses = (source: string) => [
  ...source.matchAll(/className=\{\s*`([^`]*)`/g),
].flatMap((match) => match[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/));

describe('the global stylesheets', () => {
  it('leaves src/styles with only the layer stylesheets', () => {
    expect(readdirSync(stylesDir).filter((name) => name.endsWith('.css')).sort()).toEqual([
      'app.css', 'base.css', 'reset.css', 'tokens.css',
    ]);
  });

  it('defines no class selector in a layer stylesheet', () => {
    for (const name of layerStylesheets) {
      const classes = classSelectors(read(join(stylesDir, name)));
      expect(classes, `${name} defines a global class`).toEqual([]);
    }
  });

  it('keeps every other global class a hook a check reads', () => {
    const stray: string[] = [];
    for (const file of cssFiles) {
      const name = basename(file);
      const isLayer = dirname(file) === stylesDir && layerStylesheets.includes(name);
      if (name.endsWith('.module.css') || isLayer) continue;
      for (const className of classSelectors(read(file))) {
        if (!isAHook(className) && !globalClasses.has(className)) {
          stray.push(`${relative(srcDir, file)}: .${className}`);
        }
      }
    }
    expect([...new Set(stray)].sort()).toEqual([]);
  });
});

describe('a className in the markup', () => {
  it('comes from StyleX or a module, or is a class a check reads', () => {
    const stray: string[] = [];
    for (const file of walk(srcDir, '.tsx')) {
      const source = read(file);
      const names = [
        ...[...source.matchAll(/className="([^"{]*?)"/g)].flatMap((match) => match[1].split(/\s+/)),
        ...classNameTemplateClasses(source),
        ...withClassNameClasses(source),
      ].filter((name) => /^[a-z][a-z0-9_-]*$/.test(name) && !name.endsWith('-'));
      for (const name of names) {
        if (!definedClasses.has(name) && !isAHook(name)) {
          stray.push(`${relative(srcDir, file)}: ${name}`);
        }
      }
    }
    expect([...new Set(stray)].sort()).toEqual([]);
  });
});
