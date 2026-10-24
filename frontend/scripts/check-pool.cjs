// Execute the production model pool (#488) with controlled, delayed answers:
// one request per key at a time, nothing read while held data is current,
// stale data read again only after a paint, records shared and replaced in
// place, and nothing of a previous workspace surviving a reset.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { reaction } = require('mobx');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const requireSource = name => name.startsWith('.') || name.startsWith('@/')
    ? load(path.resolve(name.startsWith('@/') ? root : path.dirname(file), name.replace(/^@\//, '') + '.ts'))
    : require(name);
  new Function('require', 'module', 'exports', code)(requireSource, module, module.exports);
  return module.exports;
}
// A paint is a frame then a task: run them by hand.
const frames = [];
global.requestAnimationFrame = (run) => frames.push(run);
const paint = async () => {
  frames.splice(0).forEach((run) => run());
  await new Promise((resolve) => setTimeout(resolve, 0));
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

const { BuyerlyPool, STALE_AFTER_MS } = load(path.join(root, 'models/pool.ts'));

function server() {
  const calls = [];
  return {
    calls,
    query: (key, type = 'team') => ({
      kind: 'list', key, type, id: (record) => record.id,
      load: () => new Promise((resolve, reject) => calls.push({ key, resolve, reject })),
    }),
  };
}

async function main() {
  const pool = new BuyerlyPool();
  pool.reset('olga:7:alpha');
  const api = server();
  const teams = api.query('teams');

  // Nothing held: read now; everyone asking meanwhile shares the request.
  assert.deepEqual(pool.result('teams'), { data: undefined, error: '', loading: true });
  pool.ensure(teams); pool.ensure(teams); void pool.fetch(teams);
  assert.equal(api.calls.length, 1, 'one request for concurrent reads');
  api.calls[0].resolve([{ id: 1, name: 'Growth' }, { id: 2, name: 'Media' }]);
  await settle();
  const first = pool.result('teams');
  assert.deepEqual(first.data.map((team) => team.name), ['Growth', 'Media']);
  assert.equal(pool.result('teams'), first, 'an unchanged query hands out the same object');

  // Held and current: no request at all.
  pool.ensure(teams); await paint();
  assert.equal(api.calls.length, 1, 'current data is not read again');

  // Held and stale: nothing before the paint, one read after it; an equal answer changes nothing.
  const realNow = Date.now;
  Date.now = () => realNow() + STALE_AFTER_MS + 1;
  pool.ensure(teams);
  await settle();
  assert.equal(api.calls.length, 1, 'stale data is read again only after a paint');
  await paint();
  assert.equal(api.calls.length, 2);
  api.calls[1].resolve([{ id: 1, name: 'Growth' }, { id: 2, name: 'Media' }]);
  await settle();
  Date.now = realNow;
  assert.equal(pool.result('teams'), first, 'the same answer keeps the same objects');

  // One record per id, shared by every list that holds it; a change is a new object everywhere.
  const mine = api.query('teams:mine');
  void pool.fetch(mine); api.calls[2].resolve([{ id: 2, name: 'Media' }]); await settle();
  assert.equal(pool.result('teams:mine').data[0], pool.result('teams').data[1], 'one record per id');
  const changes = [];
  const stop = reaction(() => pool.result('teams:mine'), (value) => changes.push(value));
  pool.patch('team', 2, { name: 'Media buying' });
  assert.equal(pool.result('teams').data[1].name, 'Media buying');
  assert.equal(pool.result('teams:mine').data[0].name, 'Media buying');
  assert.notEqual(pool.result('teams').data, first.data, 'a changed list is a new array');
  assert.equal(first.data[1].name, 'Media', 'records are replaced, never edited');
  assert.equal(changes.length, 1, 'readers hear the change');
  pool.remove('team', 2);
  assert.deepEqual(pool.result('teams').data.map((team) => team.id), [1]);
  assert.deepEqual(pool.result('teams:mine').data, []);
  pool.append(teams, { id: 3, name: 'New' }, { first: true });
  assert.deepEqual(pool.result('teams').data.map((team) => team.id), [3, 1]);
  stop();

  // A failed first read says why; a failed read behind held data keeps the data.
  const members = api.query('members', 'member');
  void pool.fetch(members); api.calls[3].reject(new Error('Members unavailable')); await settle();
  assert.deepEqual(pool.result('members'), { data: undefined, error: 'Members unavailable', loading: false });
  void pool.fetch(teams, { afterWrite: true }); api.calls[4].reject(new Error('down')); await settle();
  assert.deepEqual(pool.result('teams').data.map((team) => team.id), [3, 1]);

  // After a write the newest request wins, even over an older one answering later.
  const older = pool.fetch(teams); const newer = pool.fetch(teams, { afterWrite: true });
  assert.equal(api.calls.length, 7, 'a read after a write does not wait for the one on its way');
  api.calls[6].resolve([{ id: 9, name: 'Written' }]); await newer;
  api.calls[5].resolve([{ id: 8, name: 'Before the write' }]); await older;
  assert.deepEqual(pool.result('teams').data.map((team) => team.name), ['Written']);

  // Another workspace: nothing of the previous one is drawn, and its late answers are dropped.
  const late = pool.fetch(api.query('documents', 'teamDocument'));
  const heard = [];
  const stopTeams = reaction(() => pool.result('teams'), (value) => heard.push(value));
  pool.reset('olga:8:beta');
  assert.deepEqual(pool.result('teams'), { data: undefined, error: '', loading: true });
  assert.equal(heard.length, 1, 'readers hear the reset');
  assert.equal(pool.record('team', 9), undefined);
  api.calls[7].resolve([{ id: 1, title: 'Alpha plan' }]); await late;
  assert.equal(pool.result('documents').data, undefined, "a late answer never lands in the next workspace");
  stopTeams();
  pool.reset('olga:8:beta');
  assert.equal(pool.scope, 'olga:8:beta');

  console.log('Model pool: shared reads, current data kept, stale data read after paint, records replaced in place, workspaces kept apart');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
