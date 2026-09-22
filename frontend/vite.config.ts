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
  };
  const stylesheet = '/static/css/legal.css';
  const publicDir = path.resolve(__dirname, 'public');
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [publicWebsite(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/health': 'http://127.0.0.1:8080',
      '/uploads': 'http://127.0.0.1:8080',
    },
  },
});
