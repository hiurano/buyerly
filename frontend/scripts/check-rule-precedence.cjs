// What the rule picker says about several rules on one entity (#323), checked
// against decision #47 as RuleEngine.evaluate_all and the worker implement it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/rulePrecedence.ts'), 'utf8');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(loaded, loaded.exports);
const { explainRulePrecedence } = loaded.exports;

const rule = (id, name, action) => ({ id: String(id), name, action });
const lines = (rules) =>
  explainRulePrecedence(rules).map((line) => `${line.rule.name} | ${line.role} | ${line.note}`);

// One rule has nobody to compete with.
assert.deepEqual(lines([rule(1, 'Stop', 'turn_off')]), []);

// Stored order: a raise first, then an alert, then two cuts. The first cut
// wins over the raise even though the raise is listed earlier; the second cut
// takes over while the first one waits to repeat; the alert fires anyway.
assert.deepEqual(
  lines([
    rule(1, 'Scale', 'increase_budget'),
    rule(2, 'Alert', 'notify_only'),
    rule(3, 'Cut', 'decrease_budget'),
    rule(4, 'Cut more', 'decrease_budget'),
  ]),
  [
    'Cut | wins | Acts first: lowering budget',
    'Cut more | next | Acts if "Cut" waits to repeat',
    'Scale | gives_way | Gives way to "Cut": lowering budget goes first',
    'Alert | alerts | Alerts on its own',
  ],
);

// Turning off beats every other change.
assert.deepEqual(
  lines([rule(1, 'Revive', 'turn_on'), rule(2, 'Stop', 'turn_off')]),
  [
    'Stop | wins | Acts first: turning off',
    'Revive | gives_way | Gives way to "Stop": turning off goes first',
  ],
);

// Alerts never compete with each other (#296).
assert.deepEqual(
  lines([rule(1, 'Spend alert', 'notify_only'), rule(2, 'CPL alert', 'notify_only')]),
  ['Spend alert | alerts | Alerts on its own', 'CPL alert | alerts | Alerts on its own'],
);

// One change next to alerts: it simply acts.
assert.deepEqual(
  lines([rule(1, 'Alert', 'notify_only'), rule(2, 'Stop', 'turn_off')]),
  ['Stop | wins | The only one that changes it', 'Alert | alerts | Alerts on its own'],
);

console.log('rule precedence: ok');
