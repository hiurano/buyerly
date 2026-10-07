// When an open tab may say "New version available" (#303).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/appVersion.ts'), 'utf8');
const loaded = { exports: {} };
// The hook and the toast are not exercised here, so their imports are stand-ins.
new Function('module', 'exports', 'require', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(loaded, loaded.exports, () => ({}));
const { BUILD_VERSION, isNewerRelease } = loaded.exports;

// Outside a Vite build nothing is baked in, and such a tab never asks.
assert.equal(BUILD_VERSION, 'local');

assert.equal(isNewerRelease('aaa111', 'bbb222'), true);
assert.equal(isNewerRelease('aaa111', ' bbb222 '), true);
assert.equal(isNewerRelease('aaa111', 'aaa111'), false);
// A dev build, or a server that cannot name its release, never counts as newer.
for (const server of ['local', 'unknown', '', '   ', null, undefined, 42, {}]) {
  assert.equal(isNewerRelease('aaa111', server), false, String(server));
}
for (const build of ['local', '', 'unknown']) {
  assert.equal(isNewerRelease(build, 'bbb222'), false, build);
}

console.log('App version comparison passed');
