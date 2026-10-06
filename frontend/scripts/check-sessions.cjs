// Session names and "Last seen" as Linear shows them in Security & access (#226).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/sessions.ts'), 'utf8');
const loaded = { exports: {} };
// The requests and the toast are not exercised here, so their imports are stand-ins.
new Function('module', 'exports', 'require', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(loaded, loaded.exports, () => ({}));
const { browserOf, describeUserAgent, formatLastSeen } = loaded.exports;

const agents = {
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Safari/537.36':
    'Chrome on Linux',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Safari/537.36 Edg/129.0.2792.65':
    'Edge on Windows',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15':
    'Safari on macOS',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0':
    'Firefox on macOS',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1':
    'Safari on iPhone',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1':
    'Chrome on iPhone',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36':
    'Chrome on Android',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.186 YaBrowser/24.10.1.598 Safari/537.36':
    'Yandex Browser on Windows',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Safari/537.36 OPR/114.0.5282.21':
    'Opera on Windows',
  'curl/8.5.0': 'Unknown device',
  '': 'Unknown device',
};
for (const [agent, expected] of Object.entries(agents)) {
  assert.equal(describeUserAgent(agent), expected, agent);
  // The tile shows the browser's mark: the name before " on ".
  assert.equal(browserOf(agent), expected === 'Unknown device' ? '' : expected.split(' on ')[0], agent);
}

const now = Date.parse('2026-10-03T12:00:00Z');
const ago = (ms) => new Date(now - ms).toISOString();
// date-fns formatDistance, which Linear uses: "about 14 hours ago", "2 days ago".
const lastSeen = {
  [ago(10_000)]: 'Last seen less than a minute ago',
  [ago(60_000)]: 'Last seen 1 minute ago',
  [ago(25 * 60_000)]: 'Last seen 25 minutes ago',
  [ago(60 * 60_000)]: 'Last seen about 1 hour ago',
  [ago(14 * 60 * 60_000)]: 'Last seen about 14 hours ago',
  [ago(24 * 60 * 60_000)]: 'Last seen 1 day ago',
  [ago(2 * 24 * 60 * 60_000)]: 'Last seen 2 days ago',
  [ago(29 * 24 * 60 * 60_000)]: 'Last seen 29 days ago',
  [ago(40 * 24 * 60 * 60_000)]: 'Last seen about 1 month ago',
};
for (const [timestamp, expected] of Object.entries(lastSeen)) {
  assert.equal(formatLastSeen(timestamp, now), expected, timestamp);
}

// Original sign in in the details is the date alone.
assert.equal(loaded.exports.formatSignedIn('2026-09-25T12:00:00Z'), 'Sep 25, 2026');
assert.equal(loaded.exports.formatSignedIn('not a date'), '');

// A session not seen for more than a month is dimmed; the most recently seen comes first.
const { isStale, byLastSeen } = loaded.exports;
const seen = (ms) => ({ last_seen_at: ago(ms) });
assert.equal(isStale(seen(29 * 24 * 60 * 60_000), now), false);
assert.equal(isStale(seen(31 * 24 * 60 * 60_000), now), true);
const ordered = [seen(2 * 24 * 60 * 60_000), seen(60_000), seen(40 * 24 * 60 * 60_000)].sort(byLastSeen);
assert.deepEqual(ordered.map((session) => session.last_seen_at), [ago(60_000), ago(2 * 24 * 60 * 60_000), ago(40 * 24 * 60 * 60_000)]);

console.log(`sessions: ${Object.keys(agents).length} user agents and ${Object.keys(lastSeen).length} last-seen labels match`);
