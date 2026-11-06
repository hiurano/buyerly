// How the rules engine's shadow run stands (#611 stage 4): per UTC day, the
// captures compared, how many were clean, the match rate, and every recent
// mismatch with the input that produced it. Read-only.
//
//   docker compose exec worker-ts node server/dist/rules/shadow-report.js [--days 14] [--mismatches 20] [--replay]
//
// --replay runs this release's engine again on each kept mismatch, which
// shows whether a fix since then makes it match.

import { Redis } from 'ioredis';
import { pathToFileURL } from 'node:url';
import { MISMATCHES_KEY, SINCE_KEY, compareCapture, matchRate, readDay, type Capture, type DaySummary, type Difference } from './shadow.ts';

interface Options {
  days: number;
  mismatches: number;
  replay: boolean;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { days: 14, mismatches: 20, replay: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--replay') options.replay = true;
    else if (flag === '--days') options.days = Number(argv[++index]);
    else if (flag === '--mismatches') options.mismatches = Number(argv[++index]);
    else throw new Error(`Unknown option ${flag}`);
  }
  return options;
}

const percent = (rate: number | null): string => (rate === null ? '—' : `${(rate * 100).toFixed(3)}%`);

export async function report(redis: Redis, options: Options, now = new Date()): Promise<string> {
  const lines: string[] = [];
  const since = await redis.get(SINCE_KEY);
  lines.push(`Rules shadow run: ${since ? `first capture compared ${new Date(Number(since) * 1000).toISOString()}` : 'no capture compared yet'}`);
  const days: DaySummary[] = [];
  for (let back = options.days - 1; back >= 0; back -= 1) {
    const day = new Date(now.getTime() - back * 24 * 3600_000).toISOString().slice(0, 10);
    const summary = await readDay(redis, day);
    if (summary.captures || summary.capture_errors) days.push(summary);
  }
  lines.push('');
  lines.push('day         cycles captures markers  clean partial outcomes  matched actions(py/ts/=)  unexplained explained errors  match');
  const total: DaySummary = { day: 'total', captures: 0, markers: 0, cycles: 0, clean: 0, partial: 0, capture_errors: 0, outcomes: 0, outcomes_matched: 0, actions_python: 0, actions_ts: 0, actions_matched: 0, unexplained: 0, explained: 0 };
  for (const summary of [...days, total]) {
    if (summary !== total) {
      const sums = total as unknown as Record<string, number>;
      const adding = summary as unknown as Record<string, number>;
      for (const key of Object.keys(total)) if (key !== 'day') sums[key] += adding[key];
    }
    lines.push(
      [
        summary.day.padEnd(10),
        String(summary.cycles).padStart(7),
        String(summary.captures).padStart(8),
        String(summary.markers).padStart(7),
        String(summary.clean).padStart(6),
        String(summary.partial).padStart(7),
        String(summary.outcomes).padStart(8),
        String(summary.outcomes_matched).padStart(8),
        `${summary.actions_python}/${summary.actions_ts}/${summary.actions_matched}`.padStart(18),
        String(summary.unexplained).padStart(12),
        String(summary.explained).padStart(9),
        String(summary.capture_errors).padStart(6),
        percent(matchRate(summary)).padStart(9),
      ].join(' '),
    );
  }
  const kept = await redis.lrange(MISMATCHES_KEY, 0, Math.max(0, options.mismatches - 1));
  lines.push('');
  lines.push(`Mismatches kept: ${await redis.llen(MISMATCHES_KEY)} (newest ${kept.length} below)`);
  for (const raw of kept) {
    const item = JSON.parse(raw) as { at: number; cycle_id: string; account_id: string; entity_id: string; differences: Difference[]; capture: Capture };
    lines.push('');
    lines.push(`— ${new Date(item.at * 1000).toISOString()} cycle ${item.cycle_id} account ${item.account_id} entity ${item.entity_id}`);
    for (const difference of item.differences) {
      lines.push(`  ${difference.kind} ${difference.key} ${difference.field}: python=${JSON.stringify(difference.python)} ts=${JSON.stringify(difference.ts)}`);
    }
    if (options.replay && item.capture.entities.length) {
      const replay = compareCapture(item.capture).differences.filter((difference) => !difference.explained);
      lines.push(`  replay on this release: ${replay.length ? `${replay.length} difference(s) left` : 'matches now'}`);
    }
    lines.push(`  input: ${JSON.stringify({ now: item.capture.now, account: item.capture.account, due_rules: item.capture.due_rules, entities: item.capture.entities, entity_windows: item.capture.entity_windows, undone_actions: item.capture.undone_actions, manual_enables: item.capture.manual_enables, execution_states: item.capture.execution_states, stop_confirmation_minutes: item.capture.stop_confirmation_minutes, critical_interval: item.capture.critical_interval })}`);
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = (process.env.REDIS_URL ?? '').trim();
  if (!url) {
    console.error('REDIS_URL is not set');
    process.exit(2);
  }
  const redis = new Redis(url, { maxRetriesPerRequest: 1 });
  report(redis, parseOptions(process.argv.slice(2)))
    .then((text) => console.log(text))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => redis.disconnect());
}
