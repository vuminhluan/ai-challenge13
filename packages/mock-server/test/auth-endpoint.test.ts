import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, defaultConfig } from '../src/server.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(defaultConfig({ failureRate: 0, minDelayMs: 0, maxDelayMs: 0 }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

const postToken = (body: unknown): Promise<Response> =>
  fetch(`${baseUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/v1/auth/token', () => {
  it('đổi API key hợp lệ lấy được JWT', async () => {
    const res = await postToken({ apiKey: 'pk_test_abc' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; expiresIn: number; tokenType: string };
    expect(body.tokenType).toBe('Bearer');
    expect(body.expiresIn).toBe(3600);
    expect(body.accessToken.split('.')).toHaveLength(3);
  });

  it('từ chối API key sai tiền tố', async () => {
    const res = await postToken({ apiKey: 'sk_live_abc' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_API_KEY');
  });

  it('báo lỗi validation khi thiếu apiKey', async () => {
    const res = await postToken({});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields.apiKey).toBe('required');
  });

  it('trả 404 cho route không tồn tại', async () => {
    const res = await fetch(`${baseUrl}/api/v1/không-có`);
    expect(res.status).toBe(404);
  });

  it('header x-mock-force-status ép response đầu tiên thành 503', async () => {
    const headers = { 'content-type': 'application/json', 'x-mock-force-status': '503', 'x-mock-scenario': 'auth-forced' };
    const first = await fetch(`${baseUrl}/api/v1/auth/token`, { method: 'POST', headers, body: JSON.stringify({ apiKey: 'pk_test_abc' }) });
    expect(first.status).toBe(503);
    expect(first.headers.get('retry-after')).toBe('1');
    const second = await fetch(`${baseUrl}/api/v1/auth/token`, { method: 'POST', headers, body: JSON.stringify({ apiKey: 'pk_test_abc' }) });
    expect(second.status).toBe(200);
  });
});
