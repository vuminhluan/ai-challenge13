import { describe, expect, it } from 'vitest';
import { computeDelayMs, DEFAULT_BACKOFF, isRetryableStatus, parseRetryAfter } from '../src/core/retry.js';

const options = (random: number) => ({ ...DEFAULT_BACKOFF, random: () => random });

describe('isRetryableStatus', () => {
  it('retries on 429, 502, 503 and 504', () => {
    for (const status of [429, 502, 503, 504]) expect(isRetryableStatus(status)).toBe(true);
  });

  it('does not retry on 400, 401, 403, 404, 409, 413, 422 or 500', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422, 500]) expect(isRetryableStatus(status)).toBe(false);
  });
});

describe('computeDelayMs', () => {
  it('doubles the ceiling with each attempt', () => {
    expect(computeDelayMs(0, undefined, options(1))).toBe(250);
    expect(computeDelayMs(1, undefined, options(1))).toBe(500);
    expect(computeDelayMs(2, undefined, options(1))).toBe(1000);
  });

  it('spreads evenly between 0 and the ceiling', () => {
    expect(computeDelayMs(1, undefined, options(0))).toBe(0);
    expect(computeDelayMs(1, undefined, options(0.5))).toBe(250);
  });

  it('never exceeds the 8000ms cap', () => {
    expect(computeDelayMs(20, undefined, options(1))).toBe(8000);
  });

  it('prefers Retry-After and adds a little randomness', () => {
    expect(computeDelayMs(0, 2000, options(0))).toBe(2000);
    expect(computeDelayMs(0, 2000, options(1))).toBe(2250);
  });
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2024-06-01T00:00:00.000Z');

  it('parses the delay-seconds form', () => {
    expect(parseRetryAfter('3', now)).toBe(3000);
  });

  it('parses the HTTP-date form', () => {
    expect(parseRetryAfter('Sat, 01 Jun 2024 00:00:05 GMT', now)).toBe(5000);
  });

  it('returns undefined when the header is missing or unparsable', () => {
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
    expect(parseRetryAfter('not-a-number', now)).toBeUndefined();
  });

  it('never returns a negative value for a date in the past', () => {
    expect(parseRetryAfter('Sat, 01 Jun 2024 00:00:00 GMT', now + 10_000)).toBe(0);
  });
});
