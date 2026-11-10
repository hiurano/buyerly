/*
 * The global stylesheet is gone (#699): a component's look lives in its StyleX
 * or a CSS Module, the layer stylesheets only hold the reset, tokens and
 * keyframes, and the classes a browser check reads are plain data hooks. This
 * guard keeps a new index.css — or a stray, unstyled global class — from
 * creeping back.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesDir = fileURLToPath(new URL('.', import.meta.url));
const srcDir = fileURLToPath(new URL('..', import.meta.url));
const frontendDir = fileURLToPath(new URL('../..', import.meta.url));
const scriptsDir = fileURLToPath(new URL('../../../scripts/', import.meta.url));

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

const cssFiles = walk(srcDir, '.css');

/** The class names any stylesheet — module or plain — defines. */
const definedClasses = new Set(cssFiles.flatMap((file) => (
  [...withoutComments(read(file)).matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1])
)));

/** The class names a browser check reads, so the markup can keep them as data hooks. */
const scriptClasses = new Set(walk(scriptsDir, '.ts').flatMap((file) => (
  [...read(file).matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1])
)));

/** The splash's classes, written in index.html's inline <style>. */
const htmlClasses = new Set(
  [...read(join(frontendDir, 'index.html')).matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1]),
);

describe('the global stylesheets', () => {
  it('leaves src/styles with only the layer stylesheets', () => {
    expect(readdirSync(stylesDir).filter((name) => name.endsWith('.css')).sort()).toEqual([
      'app.css', 'base.css', 'reset.css', 'tokens.css',
    ]);
  });

  it('defines no class selector in a layer stylesheet', () => {
    for (const name of ['app.css', 'base.css', 'reset.css', 'tokens.css']) {
      const classes = [...withoutComments(read(join(stylesDir, name))).matchAll(/(?:^|[\s,{>+~])\.([A-Za-z_][A-Za-z0-9_-]*)/g)];
      expect(classes.map((match) => match[1]), `${name} defines a global class`).toEqual([]);
    }
  });
});

describe('a className in the markup', () => {
  it('comes from StyleX or a module, or is a class a check reads', () => {
    const stray: string[] = [];
    for (const file of walk(srcDir, '.tsx')) {
      for (const match of read(file).matchAll(/className="([^"{]*?)"/g)) {
        for (const name of match[1].split(/\s+/).filter(Boolean)) {
          if (!definedClasses.has(name) && !scriptClasses.has(name) && !htmlClasses.has(name)) {
            stray.push(`${file.slice(srcDir.length + 1)}: ${name}`);
          }
        }
      }
    }
    expect([...new Set(stray)].sort()).toEqual([]);
  });
});
