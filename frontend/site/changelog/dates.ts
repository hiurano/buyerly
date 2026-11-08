// Dates on the public pages, written out in English whatever the build machine's locale.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number);
  return [year, month - 1, date];
}

/** "October 20, 2026" from 2026-10-20. */
export function longDate(day: string): string {
  const [year, month, date] = parts(day);
  return `${MONTHS[month]} ${date}, ${year}`;
}

/** "Oct 20, 2026" from 2026-10-20. */
export function shortDate(day: string): string {
  const [year, month, date] = parts(day);
  return `${MONTHS[month].slice(0, 3)} ${date}, ${year}`;
}
