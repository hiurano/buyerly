import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';

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
  const css = () => `${fs.readFileSync(tokensPath, 'utf8')}\n${fs.readFileSync(cssPath, 'utf8')}`;
  const filenameFor = (url: string) => routes[url.split('?')[0].replace(/\/$/, '') || '/'];
  return {
    name: 'buyerly-public-website',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '/';
        const filename = filenameFor(url);
        if (url.split('?')[0] === stylesheet) {
          res.setHeader('Content-Type', 'text/css');
          res.end(css());
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
      this.addWatchFile(cssPath);
    },
    generateBundle() {
      // Fonts are emitted with the stylesheet so FastAPI and nginx use the same
      // immutable asset URLs, without reserving another workspace root segment.
      const builtCss = css().replace(/\/fonts\/([\w-]+\.woff2)/g, (_match, name: string) => {
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
// the line and the reason.
type Loc = { start?: { line: number } };
type CompilerDetail = { reason?: string; loc?: Loc | null; details?: { loc?: Loc | null }[]; options?: CompilerDetail };
const compilerSkips: string[] = [];
const reactCompiler = ['babel-plugin-react-compiler', {
  logger: {
    logEvent(filename: string | null, event: { kind: string; detail?: unknown; fnLoc?: Loc | null }) {
      if (event.kind !== 'CompileError' && event.kind !== 'PipelineError') return;
      const detail = (event.detail ?? {}) as CompilerDetail;
      const options = detail.options ?? detail;
      const loc = options.loc ?? options.details?.find((item) => item.loc)?.loc ?? event.fnLoc;
      const where = `${path.relative(__dirname, filename ?? '?')}:${loc?.start?.line ?? '?'}`;
      compilerSkips.push(`${where} ${options.reason ?? String(event.detail)}`);
    },
  },
}];

function reactCompilerReport(): Plugin {
  return {
    name: 'buyerly-react-compiler-report',
    apply: 'build',
    buildEnd() {
      if (compilerSkips.length === 0) return;
      this.error(`React Compiler left ${compilerSkips.length} function(s) as written:\n${compilerSkips.join('\n')}`);
    },
  };
}

// Where the dev server forwards API calls; compose.dev.yaml points it at its api service.
const apiOrigin = process.env.VITE_API_ORIGIN || 'http://127.0.0.1:8080';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [publicWebsite(), react({ babel: { plugins: [reactCompiler] } }), reactCompilerReport()],
  // The release this bundle belongs to; an open tab compares it with /health/live (#303).
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || 'local'),
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
