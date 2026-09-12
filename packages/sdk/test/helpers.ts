import type { Clock } from '../src/core/clock.js';
import type { Transport, TransportRequest, TransportResponse } from '../src/core/transport.js';

/** Fake clock: time only moves when the test calls advance, and sleep never really waits. */
export class FakeClock implements Clock {
  readonly sleeps: number[] = [];
  private current: number;

  constructor(start = 1_700_000_000_000) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) throw signal.reason ?? new Error('Aborted');
    this.sleeps.push(ms);
    this.current += ms;
  }
}

/** A pre-programmed reply for FakeTransport. */
export type FakeReply = TransportResponse | Error;

/** Fake transport: returns queued replies in order and records every request. */
export class FakeTransport implements Transport {
  readonly requests: TransportRequest[] = [];
  private replies: FakeReply[] = [];

  queue(...replies: FakeReply[]): this {
    this.replies.push(...replies);
    return this;
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    this.requests.push(request);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error(`FakeTransport ran out of replies for ${request.method} ${request.url}`);
    if (reply instanceof Error) throw reply;
    return reply;
  }
}

/** Builds a JSON TransportResponse quickly. */
export function jsonReply(status: number, payload: unknown, headers: Record<string, string> = {}): TransportResponse {
  return { status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) };
}
