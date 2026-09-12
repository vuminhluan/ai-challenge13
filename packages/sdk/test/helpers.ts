import type { Clock } from '../src/core/clock.js';
import type { Transport, TransportRequest, TransportResponse } from '../src/core/transport.js';

/** Clock giả: thời gian chỉ nhích khi test gọi advance, sleep không chờ thật. */
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

/** Một phản hồi đã lập trình sẵn cho FakeTransport. */
export type FakeReply = TransportResponse | Error;

/** Transport giả: trả về lần lượt các phản hồi đã nạp và ghi lại mọi request. */
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
    if (reply === undefined) throw new Error(`FakeTransport hết phản hồi cho ${request.method} ${request.url}`);
    if (reply instanceof Error) throw reply;
    return reply;
  }
}

/** Tạo nhanh một TransportResponse dạng JSON. */
export function jsonReply(status: number, payload: unknown, headers: Record<string, string> = {}): TransportResponse {
  return { status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) };
}
