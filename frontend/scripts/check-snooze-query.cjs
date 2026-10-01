// Linear's snooze search rows, as read off Linear itself on Fri, 2 Oct 2026 at 12:38 AM (#246).
process.env.TZ = 'Asia/Yekaterinburg';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/snoozeQuery.ts'), 'utf8');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(loaded, loaded.exports);
const { parseSnoozeQuery } = loaded.exports;

const now = new Date(2026, 9, 2, 0, 38, 51);
const rows = (query, at = now) => parseSnoozeQuery(query, at).map(row => `${row.label} / ${row.hint}`);
const expect = {
  'next month': ['Sunday, November 1, 9:00 AM / in 30 days'],
  'next month 3pm': ['Sunday, November 1, 3:00 PM / in 30 days'],
  'end of month': ['Saturday, October 31, 9:00 AM / in 29 days'],
  'end of next month': ['Monday, November 30, 9:00 AM / in 59 days'],
  'this month': ['Friday, October 1, 2027, 9:00 AM / in 1 year'],
  'in 2 months': ['In 2 months / Wed, 2 Dec, 9:00 AM'],
  'in a month': ['In 1 month / Mon, 2 Nov, 9:00 AM'],
  month: ['In 1 month / Mon, 2 Nov, 9:00 AM'],
  '2 days': ['In 2 days / Sun, 4 Oct, 9:00 AM'],
  tomorrow: ['Tomorrow at 9:00 AM / in 1 day'],
  'today 5pm': ['Today at 5:00 PM / in 16 hours'],
  'next week': ['Monday at 9:00 AM / in 3 days'],
  'next week 3pm': ['Monday at 3:00 PM / in 3 days'],
  'end of week': ['Sunday at 9:00 AM / in 2 days'],
  'next year': ['Friday, January 1, 2027, 9:00 AM / in 3 months'],
  friday: ['Today at 9:00 AM / in 8 hours'],
  'this friday': ['Today at 9:00 AM / in 8 hours'],
  'next fri': ['Friday, October 9, 9:00 AM / in 7 days'],
  'next friday': ['Friday, October 9, 9:00 AM / in 7 days'],
  'next mon': ['Monday at 9:00 AM / in 3 days'],
  'this monday': ['Monday at 9:00 AM / in 3 days'],
  'next tues': ['Tuesday at 9:00 AM / in 4 days'],
  1: [
    'Today at 1:00 AM / Fri, 2 Oct, 1:00 AM',
    'Sunday, November 1, 9:00 AM / in 30 days',
    'In 1 minute / Fri, 2 Oct, 12:39 AM',
    'In 1 hour / Fri, 2 Oct, 1:38 AM',
    'In 1 day / Sat, 3 Oct, 12:38 AM',
    'In 1 week / Fri, 9 Oct, 12:38 AM',
  ],
  2: [
    'Today at 2:00 AM / Fri, 2 Oct, 2:00 AM',
    'Today at 9:00 AM / in 8 hours',
    'In 2 minutes / Fri, 2 Oct, 12:40 AM',
    'In 2 hours / Fri, 2 Oct, 2:38 AM',
    'In 2 days / Sun, 4 Oct, 12:38 AM',
    'In 2 weeks / Fri, 16 Oct, 12:38 AM',
  ],
  5: [
    'Today at 5:00 AM / Fri, 2 Oct, 5:00 AM',
    'Monday at 9:00 AM / in 3 days',
    'In 5 minutes / Fri, 2 Oct, 12:43 AM',
    'In 5 hours / Fri, 2 Oct, 5:38 AM',
    'In 5 days / Wed, 7 Oct, 12:38 AM',
    'In 5 weeks / Fri, 6 Nov, 12:38 AM',
  ],
  12: [
    'Today at 12:00 PM / Fri, 2 Oct, 12:00 PM',
    'Monday, October 12, 9:00 AM / in 10 days',
    'In 12 minutes / Fri, 2 Oct, 12:50 AM',
    'In 12 hours / Fri, 2 Oct, 12:38 PM',
    'In 12 days / Wed, 14 Oct, 12:38 AM',
    'In 12 weeks / Fri, 25 Dec, 12:38 AM',
  ],
  13: [
    'Today at 1:00 PM / Fri, 2 Oct, 1:00 PM',
    'Tuesday, October 13, 9:00 AM / in 11 days',
    'In 13 minutes / Fri, 2 Oct, 12:51 AM',
    'In 13 hours / Fri, 2 Oct, 1:38 PM',
    'In 13 days / Thu, 15 Oct, 12:38 AM',
    'In 13 weeks / Fri, 1 Jan, 12:38 AM',
  ],
  24: [
    'Today at 2:04 AM / Fri, 2 Oct, 2:04 AM',
    'Saturday, October 24, 9:00 AM / in 22 days',
    'In 24 minutes / Fri, 2 Oct, 1:02 AM',
    'In 24 hours / Sat, 3 Oct, 12:38 AM',
    'In 24 days / Mon, 26 Oct, 12:38 AM',
    'In 24 weeks / Fri, 19 Mar, 12:38 AM',
  ],
  59: [
    'Saturday, November 28, 9:00 AM / in 57 days',
    'In 59 minutes / Fri, 2 Oct, 1:37 AM',
    'In 59 hours / Sun, 4 Oct, 11:38 AM',
    'In 59 days / Mon, 30 Nov, 12:38 AM',
  ],
  60: [
    'Today at 6:00 AM / Fri, 2 Oct, 6:00 AM',
    'Sunday, November 29, 9:00 AM / in 58 days',
    'In 60 minutes / Fri, 2 Oct, 1:38 AM',
    'In 60 hours / Sun, 4 Oct, 12:38 PM',
    'In 60 days / Tue, 1 Dec, 12:38 AM',
  ],
  99: [
    'Thursday, January 7, 2027, 9:00 AM / in 3 months',
    'In 99 minutes / Fri, 2 Oct, 2:17 AM',
    'In 99 hours / Tue, 6 Oct, 3:38 AM',
    'In 99 days / Sat, 9 Jan, 12:38 AM',
  ],
  123: [
    'Today at 12:03 PM / Fri, 2 Oct, 12:03 PM',
    'Sunday, January 31, 2027, 9:00 AM / in 4 months',
    'In 123 minutes / Fri, 2 Oct, 2:41 AM',
    'In 123 hours / Wed, 7 Oct, 3:38 AM',
    'In 123 days / Tue, 2 Feb, 12:38 AM',
  ],
  959: ['Today at 9:59 AM / Fri, 2 Oct, 9:59 AM', 'In 959 minutes / Fri, 2 Oct, 4:37 PM', 'In 959 hours / Tue, 10 Nov, 11:38 PM'],
  1230: ['Today at 12:30 PM / Fri, 2 Oct, 12:30 PM'],
  2359: ['Today at 11:59 PM / Fri, 2 Oct, 11:59 PM'],
  weekend: [],
  'nov 15': ['Sunday, November 15, 9:00 AM / in 44 days'],
  'nov 30': ['Monday, November 30, 9:00 AM / in 59 days'],
  'dec 1': ['Tuesday, December 1, 9:00 AM / in 2 months'],
  'dec 15': ['Tuesday, December 15, 9:00 AM / in 2 months'],
  'dec 20': ['Sunday, December 20, 9:00 AM / in 3 months'],
  'jan 5': ['Tuesday, January 5, 2027, 9:00 AM / in 3 months'],
  'feb 14': ['Sunday, February 14, 2027, 9:00 AM / in 5 months'],
  'mar 20': ['Saturday, March 20, 2027, 9:00 AM / in 6 months'],
  'apr 30': ['Friday, April 30, 2027, 9:00 AM / in 7 months'],
  'jun 1': ['Tuesday, June 1, 2027, 9:00 AM / in 8 months'],
  'sep 1': ['Wednesday, September 1, 2027, 9:00 AM / in 11 months'],
  'oct 1': ['Friday, October 1, 2027, 9:00 AM / in 1 year'],
};
for (const [query, want] of Object.entries(expect)) assert.deepEqual(rows(query), want, query);

// On Sep 30 in the evening "1" had no 1 o'clock row: both have passed, and the 1st is tomorrow.
assert.equal(rows('1', new Date(2026, 8, 30, 20, 0))[0], 'Tomorrow at 9:00 AM / in 1 day');
console.log(`snooze query: ${Object.keys(expect).length + 1} checks match Linear`);
