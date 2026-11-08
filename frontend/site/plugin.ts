import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, type Plugin, type Rolldown } from 'vite';
import { ENTRIES_DIR, load } from './changelog/entries.ts';
import type { RenderInput } from './render.tsx';

// The public site (#700): /, /about, /privacy, /terms, /data-deletion,
// /changelog and a page per release, written as TSX components in site/ and
// rendered to static HTML at build time, as linear.app's public pages are.
// They work without React, a session or client-side JavaScript.
//
// A Vite build of site/render.tsx for Node compiles the components and their
// CSS Modules into one stylesheet; its renderPages then writes every page.
// The dev server renders them the same way on request, again after a change.

const siteDir = import.meta.dirname;
const frontendDir = path.dirname(siteDir);
const publicDir = path.join(frontendDir, 'public');
const cacheDir = path.join(frontendDir, 'node_modules/.cache/buyerly-site');
// The stylesheet's address in dev; the build fingerprints it under assets/.
const devStylesheet = '/static/css/site.css';

interface Rendered {
  css: string;
  renderPages: (input: RenderInput) => Record<string, string>;
}

interface Options {
  /** The token CSS (fonts, colour scheme and the design tokens) the site's stylesheet starts with. */
  tokensCss: () => Promise<string>;
  /** The files tokensCss reads, so a change to them renders again. */
  tokensFiles: string[];
}

export async function compileSite(): Promise<Omit<Rendered, 'css'> & { siteCss: string }> {
  const result = await build({
    configFile: false,
    root: frontendDir,
    logLevel: 'warn',
    plugins: [react()],
    build: {
      ssr: path.join(siteDir, 'render.tsx'),
      ssrEmitAssets: true,
      write: false,
      copyPublicDir: false,
      cssCodeSplit: false,
      // The CSS goes out as written, as the hand-written stylesheet did.
      cssMinify: false,
      minify: false,
    },
  });
  const output = (Array.isArray(result) ? result[0] : result as Rolldown.RolldownOutput).output;
  const chunk = output.find((item): item is Rolldown.OutputChunk => item.type === 'chunk' && item.isEntry);
  const siteCss = output
    .filter((item): item is Rolldown.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
    .map((item) => String(item.source).replace(/\/\*\$vite\$:\d+\*\/\n?/g, ''))
    .join('\n');
  if (!chunk) throw new Error('site/render.tsx built no module');
  // Node imports the module from a file, where it finds React in node_modules.
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `render-${crypto.createHash('sha256').update(chunk.code).digest('hex').slice(0, 16)}.mjs`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, chunk.code);
  const module = (await import(pathToFileURL(file).href)) as Pick<Rendered, 'renderPages'>;
  return { renderPages: module.renderPages, siteCss };
}

async function render(options: Options): Promise<Rendered> {
  const { renderPages, siteCss } = await compileSite();
  return { renderPages, css: `${await options.tokensCss()}\n${siteCss}` };
}

/** The page's address for each file renderPages writes: landing.html is /, changelog/<slug>.html is /changelog/<slug>. */
function routeOf(file: string): string {
  return file === 'landing.html' ? '/' : `/${file.slice(0, -'.html'.length)}`;
}

function routes(): Map<string, string> {
  const files = ['landing.html', 'about.html', 'privacy.html', 'terms.html', 'data-deletion.html', 'changelog.html'];
  for (const entry of load()) files.push(`changelog/${entry.slug}.html`);
  return new Map(files.map((file) => [routeOf(file), file]));
}

const pathOf = (url: string): string => url.split('?')[0].replace(/\/$/, '') || '/';

export function publicSite(options: Options): Plugin {
  return {
    name: 'buyerly-public-site',
    configureServer(server) {
      let rendered: Promise<Rendered> | null = null;
      const watched = [siteDir, ENTRIES_DIR, ...options.tokensFiles];
      server.watcher.add([ENTRIES_DIR, ...options.tokensFiles]);
      server.watcher.on('all', (_event, file) => {
        if (watched.some((item) => file === item || file.startsWith(item + path.sep))) rendered = null;
      });
      server.middlewares.use((req, res, next) => {
        const url = pathOf(req.url || '/');
        const file = url === devStylesheet ? null : routes().get(url);
        if (url !== devStylesheet && !file) return next();
        rendered ??= render(options);
        rendered.then(({ css, renderPages }) => {
          if (file) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(renderPages({ stylesheet: devStylesheet, entries: load() })[file]);
          } else {
            res.setHeader('Content-Type', 'text/css');
            res.end(css);
          }
        }).catch((error: unknown) => {
          rendered = null;
          next(error);
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const file = routes().get(pathOf(req.url || '/'));
        if (file) req.url = `/${file}`;
        next();
      });
    },
    buildStart() {
      for (const file of options.tokensFiles) this.addWatchFile(file);
    },
    async generateBundle() {
      const { css, renderPages } = await render(options);
      // Fonts are emitted with the stylesheet so the server and any proxy use the
      // same immutable asset URLs, without reserving another workspace root segment.
      const builtCss = css.replace(/\/fonts\/([\w-]+\.woff2)/g, (_match, name: string) => {
        const reference = this.emitFile({ type: 'asset', name, source: fs.readFileSync(path.join(publicDir, 'fonts', name)) });
        return `/${this.getFileName(reference)}`;
      });
      const stylesheet = `/${this.getFileName(this.emitFile({ type: 'asset', name: 'public-website.css', source: builtCss }))}`;
      for (const [fileName, source] of Object.entries(renderPages({ stylesheet, entries: load() }))) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}
