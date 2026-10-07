/**
 * Linear's snooze search: "4 pm", "2 days", "in 5 weeks", "friday 3pm", "dec 25".
 * A duration ("In 2 days") is labelled by itself with the exact time beside it;
 * a point in time ("Tomorrow at 4:00 PM") is labelled by the time with how far
 * away it is beside it. Days, weeks, months and years land at 9:00, as Linear's.
 */

export interface SnoozeSuggestion {
  id: string;
  label: string;
  /** Right-hand hint: the exact time for a duration, the distance for a time. */
  hint: string;
  until: Date;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

type Unit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const UNIT_WORDS: Record<string, Unit> = {
  m: 'minute', min: 'minute', mins: 'minute', minute: 'minute', minutes: 'minute',
  h: 'hour', hr: 'hour', hrs: 'hour', hour: 'hour', hours: 'hour',
  d: 'day', day: 'day', days: 'day',
  w: 'week', wk: 'week', wks: 'week', week: 'week', weeks: 'week',
  mo: 'month', month: 'month', months: 'month',
  y: 'year', yr: 'year', yrs: 'year', year: 'year', years: 'year',
};

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / (24 * HOUR));
}

function atTime(date: Date, hours: number, minutes: number): Date {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Linear's parser puts a bare day at its 9:00 AM; once that has passed, phrases like "tonight"
 * or "end of the month" fall through to its word-by-word reading. So they change at 9:00.
 */
function beforeNine(now: Date): boolean {
  return now < atTime(now, 9, 0);
}

function addUnits(now: Date, amount: number, unit: Unit, keepTime: boolean): Date {
  if (unit === 'minute') return new Date(now.getTime() + amount * MINUTE);
  if (unit === 'hour') return new Date(now.getTime() + amount * HOUR);
  const result = new Date(now);
  if (unit === 'day') result.setDate(result.getDate() + amount);
  if (unit === 'week') result.setDate(result.getDate() + amount * 7);
  if (unit === 'month') result.setMonth(result.getMonth() + amount);
  if (unit === 'year') result.setFullYear(result.getFullYear() + amount);
  return keepTime ? result : atTime(result, 9, 0);
}

function plural(amount: number, word: string): string {
  return `${amount} ${word}${amount === 1 ? '' : 's'}`;
}

/** "Wed, 30 Sep, 4:05 AM", as Linear labels a snooze time. */
export function formatSnoozeTime(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${weekday}, ${date.getDate()} ${month}, ${time}`;
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** "Today at 11:59 PM", "Tomorrow at 4:00 PM", "Monday at 9:00 AM", "Friday, December 25, 10:00 AM". */
export function formatSnoozePoint(date: Date, now: Date): string {
  const days = calendarDaysBetween(now, date);
  if (days === 0) return `Today at ${formatClock(date)}`;
  if (days === 1) return `Tomorrow at ${formatClock(date)}`;
  if (days < 7) {
    return `${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date)} at ${formatClock(date)}`;
  }
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return `${new Intl.DateTimeFormat('en-US', options).format(date)}, ${formatClock(date)}`;
}

/** "in 5 hours", "in 1 day", "in 32 days", "in 3 months", "in 1 year". */
export function formatSnoozeDistance(date: Date, now: Date): string {
  const days = calendarDaysBetween(now, date);
  if (days <= 0) {
    // Rounded, as Linear's: 1 h 40 min is "in 2 hours" (7 Oct 10:19 PM, "tonight").
    const exact = (date.getTime() - now.getTime()) / MINUTE;
    if (exact < 60) return `in ${plural(Math.max(1, Math.round(exact)), 'minute')}`;
    return `in ${plural(Math.round(exact / 60), 'hour')}`;
  }
  // Linear counts days up to 59 ("Nov 30" on Oct 2), then 30-day months: Dec 15 is 2, Dec 20 is 3.
  if (days < 60) return `in ${plural(days, 'day')}`;
  const months = Math.round(days / 30);
  if (months < 12) return `in ${plural(months, 'month')}`;
  return `in ${plural(Math.round(days / 365.25), 'year')}`;
}

function durationSuggestion(now: Date, amount: number, unit: Unit, keepTime: boolean): SnoozeSuggestion {
  const until = addUnits(now, amount, unit, keepTime);
  return {
    id: `in-${amount}-${unit}`,
    label: `In ${plural(amount, unit)}`,
    hint: formatSnoozeTime(until),
    until,
  };
}

function pointSuggestion(now: Date, until: Date): SnoozeSuggestion {
  return {
    id: `at-${until.getTime()}`,
    label: formatSnoozePoint(until, now),
    hint: formatSnoozeDistance(until, now),
    until,
  };
}

interface ClockTime {
  hours: number;
  minutes: number;
  /** A bare hour without am/pm: the next one of the two that is still ahead. */
  ambiguous: boolean;
}

/** Pulls a time of day out of the text: "4 pm", "4:30pm", "16:30", "noon". */
function takeClock(text: string): { clock: ClockTime | null; rest: string } {
  const named: Record<string, ClockTime> = {
    noon: { hours: 12, minutes: 0, ambiguous: false },
    evening: { hours: 18, minutes: 0, ambiguous: false },
  };
  for (const [word, clock] of Object.entries(named)) {
    const match = new RegExp(`(^|\\s)(this\\s+)?${word}(\\s|$)`).exec(text);
    if (match) return { clock, rest: text.replace(match[0], ' ') };
  }
  const meridiem = /(^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s|$)/.exec(text);
  if (meridiem) {
    const hour = Number(meridiem[2]);
    const minutes = Number(meridiem[3] ?? 0);
    if (hour < 1 || hour > 12 || minutes > 59) return { clock: null, rest: '\0' };
    const pm = meridiem[4].startsWith('p');
    return {
      clock: { hours: (hour % 12) + (pm ? 12 : 0), minutes, ambiguous: false },
      rest: text.replace(meridiem[0], ' '),
    };
  }
  const twentyFour = /(^|\s)(\d{1,2}):(\d{2})(?=\s|$)/.exec(text);
  if (twentyFour) {
    const hours = Number(twentyFour[2]);
    const minutes = Number(twentyFour[3]);
    if (hours > 23 || minutes > 59) return { clock: null, rest: '\0' };
    return {
      clock: { hours, minutes, ambiguous: hours >= 1 && hours <= 12 },
      rest: text.replace(twentyFour[0], ' '),
    };
  }
  return { clock: null, rest: text };
}

interface DayPart {
  date: Date;
  /** "today" and weekdays roll forward when the time on them has passed. */
  rolls: 'day' | 'week' | 'year' | null;
}

function monthIndex(word: string): number {
  if (word.length < 3) return -1;
  return MONTHS.findIndex((month) => month.startsWith(word));
}

function weekdayIndex(word: string): number {
  if (word.length < 3) return -1;
  return WEEKDAYS.findIndex((day) => day.startsWith(word) || (word === 'tues' && day === 'tuesday') || (word === 'thurs' && day === 'thursday'));
}

function validDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day);
  return date.getMonth() === month && date.getDate() === day ? date : null;
}

/** Pulls a day out of the text: "tomorrow", "friday", "next week", "oct 5", "10/15", "2026-12-01". */
function takeDay(text: string, now: Date): { day: DayPart | null; rest: string; failed?: boolean } {
  const today = startOfDay(now);
  const relative: Array<[RegExp, (match: RegExpExecArray) => DayPart]> = [
    // "tonight 8pm" after 8 PM is tomorrow, like "today 5pm" (Linear, Wed 7 Oct 2026 10:19 PM).
    [/(^|\s)tonight(\s|$)/, () => ({ date: today, rolls: 'day' })],
    [/(^|\s)today(\s|$)/, () => ({ date: today, rolls: 'day' })],
    [/(^|\s)(tomorrow|tmrw|tmr)(\s|$)/, () => {
      const date = new Date(today);
      date.setDate(date.getDate() + 1);
      return { date, rolls: null };
    }],
    [/(^|\s)next\s+week(\s|$)/, () => {
      const date = new Date(today);
      date.setDate(date.getDate() + (((8 - date.getDay()) % 7) || 7));
      return { date, rolls: null };
    }],
    // "next weekend" is the Saturday of next week (Mon–Sun), "this weekend" the coming one, as Linear's.
    [/(^|\s)next\s+weekend(\s|$)/, () => {
      const date = new Date(today);
      date.setDate(date.getDate() + (((8 - date.getDay()) % 7) || 7) + 5);
      return { date, rolls: null };
    }],
    [/(^|\s)this\s+weekend(\s|$)/, () => {
      const date = new Date(today);
      const ahead = (6 - date.getDay() + 7) % 7;
      date.setDate(date.getDate() + ahead);
      return { date, rolls: ahead === 0 ? 'week' : null };
    }],
    // "2 days at 5pm" is that day; "in 2 days at 5pm" reads otherwise (see parseSnoozeQuery).
    [/(^|\s)(\d{1,3})\s+days?(\s|$)/, (match) => {
      const date = new Date(today);
      date.setDate(date.getDate() + Number(match[2]));
      return { date, rolls: null };
    }],
    [/(^|\s)end\s+of\s+week(\s|$)/, () => {
      const date = new Date(today);
      date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
      return { date, rolls: 'week' };
    }],
    [/(^|\s)end\s+of\s+next\s+month(\s|$)/, () => ({ date: new Date(today.getFullYear(), today.getMonth() + 2, 0), rolls: null })],
    [/(^|\s)end\s+of\s+month(\s|$)/, () => ({ date: new Date(today.getFullYear(), today.getMonth() + 1, 0), rolls: null })],
    // "next month" is the 1st of it, as Linear's.
    [/(^|\s)next\s+month(\s|$)/, () => ({ date: new Date(today.getFullYear(), today.getMonth() + 1, 1), rolls: null })],
    [/(^|\s)this\s+month(\s|$)/, () => ({ date: new Date(today.getFullYear(), today.getMonth(), 1), rolls: 'year' })],
    [/(^|\s)next\s+year(\s|$)/, () => ({ date: new Date(today.getFullYear() + 1, 0, 1), rolls: null })],
  ];
  for (const [pattern, build] of relative) {
    const match = pattern.exec(text);
    if (match) return { day: build(match), rest: text.replace(match[0], ' ') };
  }

  const iso = /(^|\s)(\d{4})-(\d{1,2})-(\d{1,2})(?=\s|$)/.exec(text);
  if (iso) {
    const date = validDate(Number(iso[2]), Number(iso[3]) - 1, Number(iso[4]));
    if (!date) return { day: null, rest: text, failed: true };
    return { day: { date, rolls: null }, rest: text.replace(iso[0], ' ') };
  }

  const slash = /(^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?=\s|$)/.exec(text);
  if (slash) {
    const year = slash[4] ? Number(slash[4].length === 2 ? `20${slash[4]}` : slash[4]) : now.getFullYear();
    const date = validDate(year, Number(slash[2]) - 1, Number(slash[3]));
    if (!date) return { day: null, rest: text, failed: true };
    return { day: { date, rolls: slash[4] ? null : 'year' }, rest: text.replace(slash[0], ' ') };
  }

  // "oct 5", "october 5th", "5 oct", "dec 25 2027", "nov".
  const words = /(^|\s)(?:(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)|([a-z]+)(?:\s+(\d{1,2})(?:st|nd|rd|th)?(?!\s*(?:am|pm|:)))?)(?:,?\s+(\d{4}))?(?=\s|$)/g;
  for (const match of text.matchAll(words)) {
    const monthWord = match[3] ?? match[4];
    const month = monthIndex(monthWord);
    if (month < 0) continue;
    const dayNumber = Number(match[2] ?? match[5] ?? 1);
    const year = match[6] ? Number(match[6]) : now.getFullYear();
    const date = validDate(year, month, dayNumber);
    if (!date) return { day: null, rest: text, failed: true };
    return { day: { date, rolls: match[6] ? null : 'year' }, rest: text.replace(match[0], ' ') };
  }

  const weekday = /(^|\s)(?:(next|this)\s+)?([a-z]+)(?=\s|$)/g;
  for (const match of text.matchAll(weekday)) {
    const index = weekdayIndex(match[3]);
    if (index < 0) continue;
    const date = new Date(today);
    // "next friday" on a Friday is the one a week on, as Linear's.
    const ahead = (index - date.getDay() + 7) % 7 || (match[2] === 'next' ? 7 : 0);
    date.setDate(date.getDate() + ahead);
    return { day: { date, rolls: ahead === 0 ? 'week' : null }, rest: text.replace(match[0], ' ') };
  }

  return { day: null, rest: text };
}

function resolvePoint(now: Date, day: DayPart | null, clock: ClockTime | null): Date | null {
  const hours = clock?.hours ?? 9;
  const minutes = clock?.minutes ?? 0;
  if (!day) {
    // A time alone: the next time the clock shows it.
    let until = atTime(now, hours, minutes);
    if (clock?.ambiguous && until <= now) {
      const later = atTime(now, hours + 12, minutes);
      if (later > now && hours < 12) until = later;
    }
    if (until <= now) until.setDate(until.getDate() + 1);
    return until;
  }
  let until = atTime(day.date, hours, minutes);
  if (!clock && day.rolls !== 'week' && calendarDaysBetween(now, day.date) === 0 && !beforeNine(now)) {
    // "tonight" and "today" alone are today's 9:00 AM until it passes, then the end of today
    // (Linear: 9:00 AM at 12:38 AM, 11:59 PM at 4:30 PM and 10:19 PM).
    until = atTime(day.date, 23, 59);
  }
  if (until <= now && day.rolls === 'day') until.setDate(until.getDate() + 1);
  if (until <= now && day.rolls === 'week') until.setDate(until.getDate() + 7);
  if (until <= now && day.rolls === 'year') until.setFullYear(until.getFullYear() + 1);
  return until > now ? until : null;
}

const FILLER = /^(at|on|in|next|this|,)$/;

function parsePoint(query: string, now: Date): Date | null {
  let text = ` ${query} `;
  const clockPart = takeClock(text);
  if (clockPart.rest === '\0') return null;
  text = clockPart.rest;
  const dayPart = takeDay(text, now);
  if (dayPart.failed) return null;
  text = dayPart.rest;
  if (!clockPart.clock && !dayPart.day) return null;
  const leftover = text.split(/\s+/).filter(Boolean);
  if (leftover.some((word) => !FILLER.test(word))) return null;
  return resolvePoint(now, dayPart.day, clockPart.clock);
}

function parseDuration(query: string): { amount: number; unit: Unit } | null {
  const match = /^(?:in\s+)?(?:(a|an|one|\d+)\s*)?([a-z]+)$/.exec(query);
  if (!match) return null;
  const unit = UNIT_WORDS[match[2]];
  if (!unit) return null;
  if (!match[1]) {
    // "week" alone reads as a week; a bare "m" or "h" is still being typed.
    return match[2].length > 2 ? { amount: 1, unit } : null;
  }
  const amount = /^\d+$/.test(match[1]) ? Number(match[1]) : 1;
  return amount > 0 ? { amount, unit } : null;
}

/**
 * The time a bare number reads as, as Linear's: "9" and "13" are hours, "24" is 2:04,
 * "959" is 9:59, "1230" is 12:30. A lone minute digit is the tens one, so "59" is no time.
 */
function bareClock(digits: string): ClockTime | null {
  const whole = Number(digits);
  // "0", "00" and "000" read as nine o'clock, whichever is next (Linear, 2 Oct 12:38 AM and 7 Oct 4:30 PM).
  if (/^0{1,3}$/.test(digits)) return { hours: 9, minutes: 0, ambiguous: true };
  if (digits.length <= 2 && whole >= 1 && whole <= 23) return { hours: whole, minutes: 0, ambiguous: whole <= 12 };
  for (const hourLength of [2, 1]) {
    const hours = Number(digits.slice(0, hourLength));
    const minuteDigits = digits.slice(hourLength);
    if (hourLength >= digits.length || minuteDigits.length > 2 || hours < 1 || hours > 23) continue;
    if (Number(minuteDigits) > (minuteDigits.length === 1 ? 5 : 59)) continue;
    return { hours, minutes: Number(minuteDigits), ambiguous: hours <= 12 };
  }
  return null;
}

/** "Today at 2:00 AM", the Nth day counted from the 1st, then In N minutes/hours/days/weeks, up to a year ahead. */
function bareNumberRows(digits: string, now: Date): SnoozeSuggestion[] {
  const amount = Number(digits);
  const rows: SnoozeSuggestion[] = [];
  const clock = bareClock(digits);
  if (clock) {
    // Only later today: once 1:00 AM and 1:00 PM have both passed, Linear has no "1 o'clock" row.
    const hours = [clock.hours, ...(clock.ambiguous && clock.hours < 12 ? [clock.hours + 12] : [])]
      .find((hour) => atTime(now, hour, clock.minutes) > now);
    if (hours !== undefined) {
      const until = atTime(now, hours, clock.minutes);
      // Linear gives this row the exact time rather than the distance.
      rows.push({ ...pointSuggestion(now, until), hint: formatSnoozeTime(until) });
    }
  }
  if (digits.length <= 3 && amount > 0) {
    // From the 1st of this month, or of the next once that day has passed: "1" on Sep 30 is Oct 1.
    let date = new Date(now.getFullYear(), now.getMonth(), amount, 9, 0);
    if (date <= now) date = new Date(now.getFullYear(), now.getMonth() + 1, amount, 9, 0);
    rows.push(pointSuggestion(now, date));
    for (const unit of ['minute', 'hour', 'day', 'week'] as const) {
      rows.push(durationSuggestion(now, amount, unit, true));
    }
  }
  const yearAhead = new Date(now);
  yearAhead.setFullYear(yearAhead.getFullYear() + 1);
  const seen = new Set<number>();
  return rows.filter((row) => {
    if (row.until > yearAhead || seen.has(row.until.getTime())) return false;
    seen.add(row.until.getTime());
    return true;
  });
}

/**
 * "in 2 days at 3pm": Linear ignores the duration and offers the next 9:00 AM and the next
 * 3:00 PM (2 Oct 12:38 AM: both today; 7 Oct 4:30 PM: both tomorrow, "at 5pm" today;
 * 7 Oct 10:19 PM: both tomorrow). "at" may be left out ("in 2 days 11pm").
 */
function inDurationAtRows(query: string, now: Date): SnoozeSuggestion[] | null {
  const match = /^in (?:a|an|one|\d+) ?([a-z]+)(?: at)? (.+)$/.exec(query);
  if (!match || !UNIT_WORDS[match[1]]) return null;
  const { clock, rest } = takeClock(` ${match[2]} `);
  if (!clock || rest.trim()) return null;
  const nine = atTime(now, 9, 0);
  if (nine <= now) nine.setDate(nine.getDate() + 1);
  const rows = [pointSuggestion(now, nine)];
  const until = resolvePoint(now, null, clock);
  // Linear's parser clamps a time after 5:00 PM (its day end) to 9:00 AM, which then merges with the
  // first row: "at 5pm" and "at 4:59pm" give a row, "at 5:01pm", "at 6pm" … "at 11pm" don't (7 Oct 10:24 PM).
  const minuteOfDay = clock.hours * 60 + clock.minutes;
  if (until && minuteOfDay <= 17 * 60 && minuteOfDay !== 9 * 60) rows.push(pointSuggestion(now, until));
  return rows;
}

/**
 * "this week" is this week's Monday (at 9:00 or the time given). Once passed: a year on if that
 * Monday is in this month (7 Oct: Tuesday, October 5, 2027), "In 1 week" if it is in last month
 * (Fri 2 Oct: Monday was Sep 28), and on the Monday itself the next day with a time, else "In 1 week".
 */
function thisWeekRows(query: string, now: Date): SnoozeSuggestion[] | null {
  const match = /^this week(?: (.+))?$/.exec(query);
  if (!match) return null;
  let clock: ClockTime | null = null;
  if (match[1]) {
    const taken = takeClock(` ${match[1]} `);
    if (!taken.clock || taken.rest.split(/\s+/).some((word) => word && !FILLER.test(word))) return [];
    clock = taken.clock;
  }
  const hours = clock?.hours ?? 9;
  const minutes = clock?.minutes ?? 0;
  const monday = atTime(now, hours, minutes);
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
  if (monday > now) return [pointSuggestion(now, monday)];
  const sameDay = calendarDaysBetween(now, monday) === 0;
  if (sameDay && clock) {
    monday.setDate(monday.getDate() + 1);
    return [pointSuggestion(now, monday)];
  }
  if (!sameDay && monday.getMonth() === now.getMonth()) {
    monday.setFullYear(monday.getFullYear() + 1);
    return [pointSuggestion(now, monday)];
  }
  const until = atTime(now, hours, minutes);
  until.setDate(until.getDate() + 7);
  return [{ id: 'in-1-week', label: 'In 1 week', hint: formatSnoozeTime(until), until }];
}

/** Linear's rows for what was typed in the snooze search; empty when it means nothing. */
export function parseSnoozeQuery(raw: string, now: Date = new Date()): SnoozeSuggestion[] {
  const query = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!query) return [];

  // A bare number could be several things; Linear offers each of them.
  if (/^\d{1,4}$/.test(query)) return bareNumberRows(query, now);

  // "end of the week" is "In 1 week", not "end of week" (Linear, Wed 7 Oct 2026 4:30 PM and 10:19 PM);
  // before 9:00 AM it is today's 9:00 AM (2 Oct 12:38 AM).
  const endOfThe = /^end of the (week|month)$/.exec(query);
  if (endOfThe) {
    if (beforeNine(now)) return [pointSuggestion(now, atTime(now, 9, 0))];
    return [durationSuggestion(now, 1, endOfThe[1] as Unit, false)];
  }

  const inAt = inDurationAtRows(query, now);
  if (inAt) return inAt;

  const thisWeek = thisWeekRows(query, now);
  if (thisWeek) return thisWeek;

  const duration = parseDuration(query);
  if (duration) return [durationSuggestion(now, duration.amount, duration.unit, false)];

  const point = parsePoint(query, now);
  return point ? [pointSuggestion(now, point)] : [];
}
