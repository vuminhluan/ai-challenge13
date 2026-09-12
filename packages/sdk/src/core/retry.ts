const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Defaults for the full jitter algorithm. */
export const DEFAULT_BACKOFF = { baseMs: 250, capMs: 8000 } as const;

/** Extra randomness added when the server dictates a Retry-After. */
const RETRY_AFTER_JITTER_MS = 250;

/** Backoff options. `random` is injected to keep tests deterministic. */
export interface BackoffOptions {
  baseMs: number;
  capMs: number;
  random: () => number;
}

/** Which statuses are worth retrying. */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** Parses the Retry-After header in both forms: delay-seconds or HTTP-date. */
export function parseRetryAfter(header: string | undefined, nowMs: number): number | undefined {
  if (header === undefined) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const target = Date.parse(header);
  if (Number.isNaN(target)) return undefined;
  return Math.max(0, target - nowMs);
}

/**
 * Computes how long to wait before the next attempt, using full jitter:
 * `random(0, min(cap, base * 2^attempt))`.
 */
export function computeDelayMs(
  attempt: number,
  retryAfterMs: number | undefined,
  options: BackoffOptions,
): number {
  if (retryAfterMs !== undefined) {
    return Math.round(retryAfterMs + options.random() * RETRY_AFTER_JITTER_MS);
  }
  const ceiling = Math.min(options.capMs, options.baseMs * 2 ** attempt);
  return Math.round(options.random() * ceiling);
}
