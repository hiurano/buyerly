// Session names and "Last seen" as Linear shows them in Security & access (#226).
import { describe, expect, it, vi } from 'vitest';
import { browserOf, byLastSeen, describeUserAgent, formatLastSeen, formatSignedIn, isStale } from './sessions';

// The requests and the toast are not exercised here, so their imports are stand-ins.
vi.mock('@/ui/toast', () => ({}));
vi.mock('@/models/pool', () => ({}));
vi.mock('@/models/localDatabase', () => ({}));
vi.mock('./graphql', () => ({}));
vi.mock('./accounts', () => ({}));

const now = Date.parse('2026-10-03T12:00:00Z');

const ago = (ms: any) => new Date(now - ms).toISOString();

describe('sessions', () => {
  // date-fns formatDistance, which Linear uses: "about 14 hours ago", "2 days ago".
  it('date-fns formatDistance, which Linear uses: "about 14 hours ago", "2 days ago"', () => {
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
      expect(describeUserAgent(agent), agent).toBe(expected);
      // The tile shows the browser's mark: the name before " on ".
      expect(browserOf(agent), agent).toBe(expected === 'Unknown device' ? '' : expected.split(' on ')[0]);
    }
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
      expect(formatLastSeen(timestamp, now), timestamp).toBe(expected);
    }
  });

  // Original sign in in the details is the date alone.
  it('Original sign in in the details is the date alone', () => {
    expect(formatSignedIn('2026-09-25T12:00:00Z')).toBe('Sep 25, 2026');
    expect(formatSignedIn('not a date')).toBe('');
  });

  // A session not seen for more than a month is dimmed; the most recently seen comes first.
  it('A session not seen for more than a month is dimmed; the most recently seen comes first', () => {
    const seen = (ms: any) => ({ last_seen_at: ago(ms) });
    expect(isStale(seen(29 * 24 * 60 * 60_000) as never, now)).toBe(false);
    expect(isStale(seen(31 * 24 * 60 * 60_000) as never, now)).toBe(true);
    const ordered = [seen(2 * 24 * 60 * 60_000), seen(60_000), seen(40 * 24 * 60 * 60_000)].sort(byLastSeen as never);
    expect(ordered.map((session) => session.last_seen_at)).toStrictEqual([ago(60_000), ago(2 * 24 * 60 * 60_000), ago(40 * 24 * 60 * 60_000)]);
  });
});
