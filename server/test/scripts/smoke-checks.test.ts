import { describe, expect, it } from 'vitest';
import { normalizeSyntheticMetrics } from '../../src/scripts/smoke-checks.ts';

// The smoke's measurements as services/reliability_metrics.py stored them.
const SHA = 'a'.repeat(40);

describe('synthetic metrics', () => {
  it('keeps the counters, rounds availability and stamps the time', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    expect(normalizeSyntheticMetrics({ release_sha: SHA, availability_percent: 66.66666, latency_p95_ms: 12.7, checks_total: 3, checks_passed: 2 }, now)).toEqual({
      release_sha: SHA,
      measured_at: '2026-11-07T12:00:00.000Z',
      availability_percent: 66.667,
      latency_p95_ms: 12,
      checks_total: 3,
      checks_passed: 2,
      ok: false,
    });
  });

  it('refuses what is not a measurement', () => {
    expect(() => normalizeSyntheticMetrics([])).toThrow('must be an object');
    expect(() => normalizeSyntheticMetrics({ release_sha: 'abc' })).toThrow('full lowercase git SHA');
    expect(() => normalizeSyntheticMetrics({ release_sha: SHA, availability_percent: 101, checks_total: 1 })).toThrow('availability_percent');
    expect(() => normalizeSyntheticMetrics({ release_sha: SHA, latency_p95_ms: 200_000, checks_total: 1 })).toThrow('latency_p95_ms');
    expect(() => normalizeSyntheticMetrics({ release_sha: SHA, checks_total: 1, checks_passed: 2 })).toThrow('counters');
  });
});
