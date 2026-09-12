const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Giá trị mặc định cho thuật toán full jitter. */
export const DEFAULT_BACKOFF = { baseMs: 250, capMs: 8000 } as const;

/** Lượng ngẫu nhiên cộng thêm khi server có chỉ định Retry-After. */
const RETRY_AFTER_JITTER_MS = 250;

/** Tuỳ chọn tính backoff. `random` được inject để test deterministic. */
export interface BackoffOptions {
  baseMs: number;
  capMs: number;
  random: () => number;
}

/** Status nào đáng thử lại. */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** Đọc header Retry-After ở cả hai dạng: số giây hoặc HTTP date. */
export function parseRetryAfter(header: string | undefined, nowMs: number): number | undefined {
  if (header === undefined) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const target = Date.parse(header);
  if (Number.isNaN(target)) return undefined;
  return Math.max(0, target - nowMs);
}

/**
 * Tính thời gian chờ trước lần thử tiếp theo theo công thức full jitter:
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
