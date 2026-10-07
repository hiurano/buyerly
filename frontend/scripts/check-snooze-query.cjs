// Linear's snooze search rows, as read off Linear itself on Fri, 2 Oct 2026 at 12:38 AM (#246)
// and on Wed, 7 Oct 2026 at 4:30 PM and 10:19–10:24 PM (#267).
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
  0: ['Today at 9:00 AM / Fri, 2 Oct, 9:00 AM'],
  '00': ['Today at 9:00 AM / Fri, 2 Oct, 9:00 AM'],
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
// Only the labels were written down on 2 Oct at 12:38 AM (#267).
assert.deepEqual(parseSnoozeQuery('in 2 days at 3pm', now).map(row => row.label), ['Today at 9:00 AM', 'Today at 3:00 PM']);
assert.deepEqual(parseSnoozeQuery('tonight', now).map(row => row.label), ['Today at 9:00 AM']);
assert.deepEqual(parseSnoozeQuery('end of the month', now).map(row => row.label), ['Today at 9:00 AM']);
assert.deepEqual(parseSnoozeQuery('this week', now).map(row => row.label), ['In 1 week']);
// Not read off Linear after midnight, but how its code reads them (#267): a bare day is its 9:00 AM
// until that passes, so "today" and "end of the week" are like "tonight" and "end of the month".
assert.deepEqual(rows('today'), ['Today at 9:00 AM / in 8 hours']);
assert.deepEqual(rows('end of the week'), ['Today at 9:00 AM / in 8 hours']);
assert.deepEqual(rows('this week'), ['In 1 week / Fri, 9 Oct, 9:00 AM']);
assert.deepEqual(rows('tonight 8pm'), ['Today at 8:00 PM / in 19 hours']);

// Read off Linear on Wed, 7 Oct 2026 at 4:29–4:30 PM (#267). Linear rounds the distance, so the
// seconds matter: "tonight 8pm" read "in 3 hours" (3 h 29 min) and "today 5pm" "in 30 minutes".
const afternoon = new Date(2026, 9, 7, 16, 30, 20);
const afternoonExpect = {
  0: ['Today at 9:00 PM / Wed, 7 Oct, 9:00 PM'],
  '00': ['Today at 9:00 PM / Wed, 7 Oct, 9:00 PM'],
  '000': ['Today at 9:00 PM / Wed, 7 Oct, 9:00 PM'],
  tonight: ['Today at 11:59 PM / in 7 hours'],
  'tonight 8pm': ['Today at 8:00 PM / in 3 hours'],
  today: ['Today at 11:59 PM / in 7 hours'],
  'today 5pm': ['Today at 5:00 PM / in 30 minutes'],
  'today 3pm': ['Tomorrow at 3:00 PM / in 1 day'],
  'end of month': ['Saturday, October 31, 9:00 AM / in 24 days'],
  'end of the month': ['In 1 month / Sat, 7 Nov, 9:00 AM'],
  'end of week': ['Sunday at 9:00 AM / in 4 days'],
  'end of the week': ['In 1 week / Wed, 14 Oct, 9:00 AM'],
  'in 2 days': ['In 2 days / Fri, 9 Oct, 9:00 AM'],
  '2 days at 3pm': ['Friday at 3:00 PM / in 2 days'],
  '2 days at 5pm': ['Friday at 5:00 PM / in 2 days'],
  'in 2 days at 3pm': ['Tomorrow at 9:00 AM / in 1 day', 'Tomorrow at 3:00 PM / in 1 day'],
  'in 1 day at 3pm': ['Tomorrow at 9:00 AM / in 1 day', 'Tomorrow at 3:00 PM / in 1 day'],
  'in 3 days at 3pm': ['Tomorrow at 9:00 AM / in 1 day', 'Tomorrow at 3:00 PM / in 1 day'],
  'in 10 days at 3pm': ['Tomorrow at 9:00 AM / in 1 day', 'Tomorrow at 3:00 PM / in 1 day'],
  'in 2 weeks at 3pm': ['Tomorrow at 9:00 AM / in 1 day', 'Tomorrow at 3:00 PM / in 1 day'],
  'in 5 days at 10am': ['Tomorrow at 9:00 AM / in 1 day', 'Tomorrow at 10:00 AM / in 1 day'],
  'in 2 days at 9pm': ['Tomorrow at 9:00 AM / in 1 day'],
  'this week': ['Tuesday, October 5, 2027, 9:00 AM / in 1 year'],
  'this week 3pm': ['Tuesday, October 5, 2027, 3:00 PM / in 1 year'],
  'this weekend': ['Saturday at 9:00 AM / in 3 days'],
  'next weekend': ['Saturday, October 17, 9:00 AM / in 10 days'],
  'next weekend 3pm': ['Saturday, October 17, 3:00 PM / in 10 days'],
  weekend: [],
  friday: ['Friday at 9:00 AM / in 2 days'],
};
for (const [query, want] of Object.entries(afternoonExpect)) assert.deepEqual(rows(query, afternoon), want, `${query} (afternoon)`);
// A few seconds later, as Linear showed it at 4:30:53 PM.
assert.deepEqual(rows('in 2 days at 5pm', new Date(2026, 9, 7, 16, 30, 53)), ['Tomorrow at 9:00 AM / in 1 day', 'Today at 5:00 PM / in 29 minutes']);

// Read off Linear on Wed, 7 Oct 2026 at 10:19–10:24 PM (#267).
const evening = new Date(2026, 9, 7, 22, 19, 40);
const nineAm = 'Tomorrow at 9:00 AM / in 1 day';
const eveningExpect = {
  0: [],
  '00': [],
  '000': [],
  tonight: ['Today at 11:59 PM / in 2 hours'],
  today: ['Today at 11:59 PM / in 2 hours'],
  'tonight 8pm': ['Tomorrow at 8:00 PM / in 1 day'],
  'tonight 9pm': ['Tomorrow at 9:00 PM / in 1 day'],
  'tonight 11pm': ['Today at 11:00 PM / in 40 minutes'],
  'tonight 11:30pm': ['Today at 11:30 PM / in 1 hour'],
  'today 5pm': ['Tomorrow at 5:00 PM / in 1 day'],
  'today 10pm': ['Tomorrow at 10:00 PM / in 1 day'],
  'today 11pm': ['Today at 11:00 PM / in 40 minutes'],
  'today at 11pm': ['Today at 11:00 PM / in 40 minutes'],
  'tomorrow 11pm': ['Tomorrow at 11:00 PM / in 1 day'],
  'end of the month': ['In 1 month / Sat, 7 Nov, 9:00 AM'],
  'end of month': ['Saturday, October 31, 9:00 AM / in 24 days'],
  'end of the week': ['In 1 week / Wed, 14 Oct, 9:00 AM'],
  'end of week': ['Sunday at 9:00 AM / in 4 days'],
  'in 2 days at 3pm': [nineAm, 'Tomorrow at 3:00 PM / in 1 day'],
  'in 1 day at 3pm': [nineAm, 'Tomorrow at 3:00 PM / in 1 day'],
  'in 10 days at 3pm': [nineAm, 'Tomorrow at 3:00 PM / in 1 day'],
  'in 2 weeks at 3pm': [nineAm, 'Tomorrow at 3:00 PM / in 1 day'],
  'in 2 days at 10am': [nineAm, 'Tomorrow at 10:00 AM / in 1 day'],
  'in 2 days at 11am': [nineAm, 'Tomorrow at 11:00 AM / in 1 day'],
  'in 2 days at 12pm': [nineAm, 'Tomorrow at 12:00 PM / in 1 day'],
  'in 2 days at 12am': [nineAm, 'Tomorrow at 12:00 AM / in 1 day'],
  'in 2 days at 1am': [nineAm, 'Tomorrow at 1:00 AM / in 1 day'],
  'in 2 days at 8am': [nineAm, 'Tomorrow at 8:00 AM / in 1 day'],
  'in 2 days at 9:30am': [nineAm, 'Tomorrow at 9:30 AM / in 1 day'],
  'in 2 days at 4:59pm': [nineAm, 'Tomorrow at 4:59 PM / in 1 day'],
  'in 2 days at 5pm': [nineAm, 'Tomorrow at 5:00 PM / in 1 day'],
  'in 2 days at 5:01pm': [nineAm],
  'in 2 days at 5:30pm': [nineAm],
  'in 2 days at 6pm': [nineAm],
  'in 2 days at 9pm': [nineAm],
  'in 2 days at 10:30pm': [nineAm],
  'in 2 days at 11pm': [nineAm],
  'in 2 days at 22:30': [nineAm],
  'in 2 days at 9am': [nineAm],
  'in 2 days 11pm': [nineAm],
  'in 3 hours at 11pm': [nineAm],
  '2 days at 3pm': ['Friday at 3:00 PM / in 2 days'],
  'this week': ['Tuesday, October 5, 2027, 9:00 AM / in 1 year'],
  'this week 3pm': ['Tuesday, October 5, 2027, 3:00 PM / in 1 year'],
  'this weekend': ['Saturday at 9:00 AM / in 3 days'],
  'next weekend': ['Saturday, October 17, 9:00 AM / in 10 days'],
  weekend: [],
  friday: ['Friday at 9:00 AM / in 2 days'],
  tomorrow: ['Tomorrow at 9:00 AM / in 1 day'],
  'in 2 days': ['In 2 days / Fri, 9 Oct, 9:00 AM'],
  9: [
    'Friday at 9:00 AM / in 2 days',
    'In 9 minutes / Wed, 7 Oct, 10:28 PM',
    'In 9 hours / Thu, 8 Oct, 7:19 AM',
    'In 9 days / Fri, 16 Oct, 10:19 PM',
    'In 9 weeks / Wed, 9 Dec, 10:19 PM',
  ],
  21: [
    'Wednesday, October 21, 9:00 AM / in 14 days',
    'In 21 minutes / Wed, 7 Oct, 10:40 PM',
    'In 21 hours / Thu, 8 Oct, 7:19 PM',
    'In 21 days / Wed, 28 Oct, 10:19 PM',
    'In 21 weeks / Wed, 3 Mar, 10:19 PM',
  ],
};
for (const [query, want] of Object.entries(eveningExpect)) assert.deepEqual(rows(query, evening), want, `${query} (evening)`);
// At 10:20:04 PM.
assert.deepEqual(rows('11', new Date(2026, 9, 7, 22, 20, 4)), [
  'Today at 11:00 PM / Wed, 7 Oct, 11:00 PM',
  'Sunday at 9:00 AM / in 4 days',
  'In 11 minutes / Wed, 7 Oct, 10:31 PM',
  'In 11 hours / Thu, 8 Oct, 9:20 AM',
  'In 11 days / Sun, 18 Oct, 10:20 PM',
  'In 11 weeks / Wed, 23 Dec, 10:20 PM',
]);

const total = Object.keys(expect).length + Object.keys(afternoonExpect).length + Object.keys(eveningExpect).length + 11;
console.log(`snooze query: ${total} checks match Linear`);
