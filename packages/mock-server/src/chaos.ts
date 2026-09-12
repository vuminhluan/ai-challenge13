import type { IncomingMessage } from 'node:http';

export interface ChaosOptions {
  failureRate: number;
  minDelayMs: number;
  maxDelayMs: number;
  random: () => number;
}

const forcedCounters = new Map<string, number>();

/** Trả về status bị ép cho request này, hoặc undefined nếu không bị ép. */
export function nextForcedStatus(req: IncomingMessage): number | undefined {
  const header = req.headers['x-mock-force-status'];
  if (typeof header !== 'string' || header === '') return undefined;
  const scenario = req.headers['x-mock-scenario'];
  const key = typeof scenario === 'string' ? scenario : header;
  const statuses = header.split(',').map((value) => Number.parseInt(value.trim(), 10));
  const attempt = forcedCounters.get(key) ?? 0;
  forcedCounters.set(key, attempt + 1);
  return statuses[attempt];
}

export function resetForcedStatuses(): void {
  forcedCounters.clear();
}

export async function applyDelay(options: ChaosOptions): Promise<void> {
  const span = Math.max(0, options.maxDelayMs - options.minDelayMs);
  const delay = options.minDelayMs + Math.floor(options.random() * (span + 1));
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

export function shouldFail(options: ChaosOptions): boolean {
  return options.random() < options.failureRate;
}
