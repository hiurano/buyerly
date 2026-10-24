import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { transformAsync } from '@babel/core';
import stylexBabel from '@stylexjs/babel-plugin';
import stylex from '@stylexjs/unplugin';

// The design tokens are StyleX variables in src/styles/tokens.stylex.ts (#512).
// Their keys keep their CSS names, so Tailwind classes, index.css and the
// public website read the same var(--…) as before. This compiles that file into
// their CSS: the defaults on :root, and each theme on the data-theme that the
// boot script in index.html sets from Settings or the system, as before.
const tokensModule = path.resolve(__dirname, 'src/styles/tokens.stylex.ts');
const themeSelectors: Record<string, string> = { lightColors: "html[data-theme='light']" };
type StylexRule = [string, { ltr: string }, number];

interface Tokens { code: string; map: unknown; css: string }

async function compileTokens(): Promise<Tokens> {
  const result = await transformAsync(fs.readFileSync(tokensModule, 'utf8'), {
    filename: tokensModule,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    parserOpts: { plugins: ['typescript'] },
    plugins: [[stylexBabel, { dev: false, unstable_moduleResolution: { type: 'commonJS', rootDir: __dirname } }]],
  });
  const code = result?.code ?? '';
  // A compiled theme reads `export const lightColors = { <vars>: "<theme> <vars>", ...`.
  const themes = new Map<string, string>();
  for (const [, name, className] of code.matchAll(/export const (\w+) = \{\s*\w+: "(\w+) \w+"/g)) {
    if (!themeSelectors[name]) throw new Error(`tokens.stylex.ts: no data-theme for the theme ${name}`);
    themes.set(className, themeSelectors[name]);
  }
  const rules = ((result?.metadata ?? {}) as { stylex?: StylexRule[] }).stylex ?? [];
  const css = rules.map(([className, { ltr }]) => {
    const selector = ltr.startsWith(':root') ? ':root' : themes.get(className);
    if (!selector) throw new Error(`tokens.stylex.ts: unexpected rule ${ltr.slice(0, 80)}`);
    const declarations = ltr.slice(ltr.indexOf('{') + 1, ltr.lastIndexOf('}')).split(';').filter(Boolean);
    return `${selector} {\n${declarations.map((item) => `  ${item.replace(':', ': ')};`).join('\n')}\n}\n`;
  }).join('\n');
  return { code, map: result?.map ?? null, css };
}

// The app imports the token CSS as virtual:buyerly-tokens.css, ahead of index.css.
// The tokens module itself is compiled here, before StyleX's plugin sees it, so
// StyleX does not add a second copy of every variable to its own CSS.
function buyerlyTokens(): Plugin {
  const id = 'virtual:buyerly-tokens.css';
  const resolved = `\0${id}`;
  return {
    name: 'buyerly-tokens',
    enforce: 'pre',
    resolveId: (source) => (source === id ? resolved : null),
    async load(source) {
      if (source !== resolved) return null;
      this.addWatchFile(tokensModule);
      return (await compileTokens()).css;
    },
    async transform(_code, source) {
      if (source.split('?')[0] !== tokensModule) return null;
      const { code, map } = await compileTokens();
      return { code, map: map as never };
    },
  };
}

// Public HTML works without React, a session or client-side JavaScript.
// Keep source documents in public/ and fingerprint their shared CSS at build time.
function publicWebsite(): Plugin {
  const routes: Record<string, string> = {
    '/': 'landing.html',
    '/about': 'about.html',
    '/privacy': 'privacy.html',
    '/terms': 'terms.html',
    '/data-deletion': 'data-deletion.html',
    '/changelog': 'changelog.html',
  };
  const stylesheet = '/static/css/legal.css';
  const publicDir = path.resolve(__dirname, 'public');
  // One page per release, built by scripts/build_changelog.py (#435).
  for (const file of fs.readdirSync(path.join(publicDir, 'changelog'))) {
    if (file.endsWith('.html')) routes[`/changelog/${file.slice(0, -5)}`] = `changelog/${file}`;
  }
  const tokensPath = path.resolve(__dirname, 'src/styles/tokens.css');
  const cssPath = path.join(publicDir, stylesheet.slice(1));
  const css = async () =>
    `${fs.readFileSync(tokensPath, 'utf8')}\n${(await compileTokens()).css}\n${fs.readFileSync(cssPath, 'utf8')}`;
  const filenameFor = (url: string) => routes[url.split('?')[0].replace(/\/$/, '') || '/'];
  return {
    name: 'buyerly-public-website',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '/';
        const filename = filenameFor(url);
        if (url.split('?')[0] === stylesheet) {
          res.setHeader('Content-Type', 'text/css');
          res.end(await css());
        } else if (filename) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(fs.readFileSync(path.join(publicDir, filename), 'utf8'));
        } else next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const filename = filenameFor(req.url || '/');
        if (filename) req.url = `/${filename}`;
        next();
      });
    },
    buildStart() {
      this.addWatchFile(tokensPath);
      this.addWatchFile(tokensModule);
      this.addWatchFile(cssPath);
    },
    async generateBundle() {
      // Fonts are emitted with the stylesheet so FastAPI and nginx use the same
      // immutable asset URLs, without reserving another workspace root segment.
      const builtCss = (await css()).replace(/\/fonts\/([\w-]+\.woff2)/g, (_match, name: string) => {
        const fontPath = path.join(publicDir, 'fonts', name);
        this.addWatchFile(fontPath);
        const reference = this.emitFile({ type: 'asset', name, source: fs.readFileSync(fontPath) });
        return `/${this.getFileName(reference)}`;
      });
      const cssReference = this.emitFile({ type: 'asset', name: 'public-website.css', source: builtCss });
      const builtStylesheet = `/${this.getFileName(cssReference)}`;
      for (const filename of Object.values(routes)) {
        const sourcePath = path.join(publicDir, filename);
        this.addWatchFile(sourcePath);
        this.emitFile({
          type: 'asset',
          fileName: filename,
          source: fs.readFileSync(sourcePath, 'utf8').replace(stylesheet, builtStylesheet),
        });
      }
    },
  };
}

// Every component and hook goes through the React Compiler, as Linear's does
// (#492). A function it would have to leave as written fails the build, with
// the line and the reason. Babel is slow: a cold dev page took ~4x longer, and
// each browser check starts its own server, so the output is cached on disk by
// file contents and compiler version and only a changed file is compiled again.
type Loc = { start?: { line: number } };
type CompilerDetail = { reason?: string; loc?: Loc | null; details?: { loc?: Loc | null }[]; options?: CompilerDetail };
interface Compiled { code: string; map: unknown; skips: string[] }

function reactCompiler(): Plugin {
  const require = createRequire(import.meta.url);
  const version = (require('babel-plugin-react-compiler/package.json') as { version: string }).version;
  const cacheDir = path.resolve(__dirname, 'node_modules/.cache/buyerly-react-compiler');
  const skips = new Map<string, string[]>();
  const compile = async (code: string, id: string): Promise<Compiled> => {
    const found: string[] = [];
    const result = await transformAsync(code, {
      filename: id,
      babelrc: false,
      configFile: false,
      sourceMaps: true,
      parserOpts: { plugins: ['jsx', 'typescript'] },
      plugins: [['babel-plugin-react-compiler', {
        logger: {
          logEvent(_filename: string | null, event: { kind: string; detail?: unknown; fnLoc?: Loc | null }) {
            if (event.kind !== 'CompileError' && event.kind !== 'PipelineError') return;
            const detail = (event.detail ?? {}) as CompilerDetail;
            const options = detail.options ?? detail;
            const loc = options.loc ?? options.details?.find((item) => item.loc)?.loc ?? event.fnLoc;
            found.push(`${path.relative(__dirname, id)}:${loc?.start?.line ?? '?'} ${options.reason ?? String(event.detail)}`);
          },
        },
      }]],
    });
    return { code: result?.code ?? code, map: result?.map ?? null, skips: found };
  };
  return {
    name: 'buyerly-react-compiler',
    enforce: 'pre',
    async transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || !id.startsWith(path.resolve(__dirname, 'src') + path.sep)) return null;
      const key = crypto.createHash('sha256').update(`${version}\0${id}\0${code}`).digest('hex');
      const file = path.join(cacheDir, `${key}.json`);
      let compiled: Compiled;
      try {
        compiled = JSON.parse(fs.readFileSync(file, 'utf8')) as Compiled;
      } catch {
        compiled = await compile(code, id);
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(compiled));
      }
      skips.set(id, compiled.skips);
      return { code: compiled.code, map: compiled.map as never };
    },
    buildEnd() {
      const all = [...skips.values()].flat();
      if (this.meta.watchMode || all.length === 0) return;
      this.error(`React Compiler left ${all.length} function(s) as written:\n${all.join('\n')}`);
    },
  };
}

// Where the dev server forwards API calls; compose.dev.yaml points it at its api service.
const apiOrigin = process.env.VITE_API_ORIGIN || 'http://127.0.0.1:8080';

// https://vitejs.dev/config/
export default defineConfig({
  // StyleX compiles a component's styles before the React Compiler sees it, and
  // its CSS joins index.css's in the build; dev serves it at /virtual:stylex.css.
  plugins: [
    publicWebsite(),
    buyerlyTokens(),
    stylex.vite({
      aliases: { '@/*': [path.resolve(__dirname, 'src/*')] },
      unstable_moduleResolution: { type: 'commonJS', rootDir: __dirname },
      // Vite's default build target, so StyleX's CSS keeps lch() as index.css does
      // instead of lowering it to hex and lab() for older browsers.
      lightningcssOptions: { targets: { chrome: 111 << 16, edge: 111 << 16, firefox: 114 << 16, safari: (16 << 16) | (4 << 8) } },
    }),
    reactCompiler(),
    react(),
  ],
  // The release this bundle belongs to; an open tab compares it with /health/live (#303).
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || 'local'),
  },
  // Compiled components import the compiler's runtime, which the dependency
  // scan of the sources cannot see: found on the first page instead, it
  // re-bundled React mid-load and left the page with two copies (#492).
  optimizeDeps: {
    include: ['react/compiler-runtime'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    // compose.dev.yaml runs the API in its own container and the source on a
    // Windows bind mount, where file events do not arrive: it polls instead.
    watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      '/api': apiOrigin,
      '/health': apiOrigin,
      '/uploads': apiOrigin,
    },
  },
});
