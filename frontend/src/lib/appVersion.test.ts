// When an open tab may say "New version available" (#303).
import { describe, expect, it, vi } from 'vitest';
import { BUILD_VERSION, isNewerRelease } from './appVersion';

// The hook and the toast are not exercised here, so their imports are stand-ins.
vi.mock('@/ui/toast', () => ({}));
vi.mock('./serviceWorker', () => ({}));

describe('app version comparison', () => {
  it('reads "local" outside a Vite build, and such a tab never asks', () => {
    expect(BUILD_VERSION).toBe('local');
  });

  it('says a different release is newer', () => {
    expect(isNewerRelease('aaa111', 'bbb222')).toBe(true);
    expect(isNewerRelease('aaa111', ' bbb222 ')).toBe(true);
    expect(isNewerRelease('aaa111', 'aaa111')).toBe(false);
  });

  it('never counts a dev build, or a server that cannot name its release, as newer', () => {
    for (const server of ['local', 'unknown', '', '   ', null, undefined, 42, {}]) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the label of the case, an object included
      expect(isNewerRelease('aaa111', server as never), String(server)).toBe(false);
    }
    for (const build of ['local', '', 'unknown']) {
      expect(isNewerRelease(build, 'bbb222'), build).toBe(false);
    }
  });
});
