import { describe, expect, it } from 'vitest';
import { computeDelayMs, DEFAULT_BACKOFF, isRetryableStatus, parseRetryAfter } from '../src/core/retry.js';

const options = (random: number) => ({ ...DEFAULT_BACKOFF, random: () => random });

describe('isRetryableStatus', () => {
  it('retry với 429, 502, 503, 504', () => {
    for (const status of [429, 502, 503, 504]) expect(isRetryableStatus(status)).toBe(true);
  });

  it('không retry với 400, 401, 403, 404, 409, 413, 422, 500', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422, 500]) expect(isRetryableStatus(status)).toBe(false);
  });
});

describe('computeDelayMs', () => {
  it('nhân đôi trần theo số lần thử', () => {
    expect(computeDelayMs(0, undefined, options(1))).toBe(250);
    expect(computeDelayMs(1, undefined, options(1))).toBe(500);
    expect(computeDelayMs(2, undefined, options(1))).toBe(1000);
  });

  it('rải đều trong khoảng từ 0 tới trần', () => {
    expect(computeDelayMs(1, undefined, options(0))).toBe(0);
    expect(computeDelayMs(1, undefined, options(0.5))).toBe(250);
  });

  it('không vượt quá cap 8000ms', () => {
    expect(computeDelayMs(20, undefined, options(1))).toBe(8000);
  });

  it('ưu tiên Retry-After và cộng thêm chút ngẫu nhiên', () => {
    expect(computeDelayMs(0, 2000, options(0))).toBe(2000);
    expect(computeDelayMs(0, 2000, options(1))).toBe(2250);
  });
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2024-06-01T00:00:00.000Z');

  it('đọc được dạng số giây', () => {
    expect(parseRetryAfter('3', now)).toBe(3000);
  });

  it('đọc được dạng HTTP date', () => {
    expect(parseRetryAfter('Sat, 01 Jun 2024 00:00:05 GMT', now)).toBe(5000);
  });

  it('trả undefined khi thiếu header hoặc không đọc được', () => {
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
    expect(parseRetryAfter('không-phải-số', now)).toBeUndefined();
  });

  it('không trả giá trị âm khi mốc thời gian đã qua', () => {
    expect(parseRetryAfter('Sat, 01 Jun 2024 00:00:00 GMT', now + 10_000)).toBe(0);
  });
});
