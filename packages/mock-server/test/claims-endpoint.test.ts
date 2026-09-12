import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, defaultConfig } from '../src/server.js';

let server: Server;
let baseUrl: string;
let token: string;

const VALID = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  ...extra,
});

beforeAll(async () => {
  server = createServer(defaultConfig({ failureRate: 0, minDelayMs: 0, maxDelayMs: 0 }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;
  const res = await fetch(`${baseUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: 'pk_test_abc' }),
  });
  token = ((await res.json()) as { accessToken: string }).accessToken;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('claims endpoints', () => {
  it('tạo claim trả về 201 và trạng thái PENDING', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(VALID) });
    expect(res.status).toBe(201);
    const claim = (await res.json()) as { id: string; status: string; statusHistory: unknown[] };
    expect(claim.id).toMatch(/^CLM-\d{6}$/);
    expect(claim.status).toBe('PENDING');
    expect(claim.statusHistory).toHaveLength(1);
  });

  it('thiếu token thì trả 401 UNAUTHORIZED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('body sai thì trả 400 kèm lỗi từng field', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...VALID, policyId: 'x', amount: -1 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.error.fields).sort()).toEqual(['amount', 'policyId']);
  });

  it('dùng lại Idempotency-Key với cùng body thì trả lại claim cũ', async () => {
    const headers = authHeaders({ 'idempotency-key': 'key-abc' });
    const first = await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers, body: JSON.stringify(VALID) });
    const second = await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers, body: JSON.stringify(VALID) });
    expect(second.status).toBe(201);
    expect(((await second.json()) as { id: string }).id).toBe(((await first.json()) as { id: string }).id);
  });

  it('dùng lại Idempotency-Key với body khác thì trả 409', async () => {
    const headers = authHeaders({ 'idempotency-key': 'key-conflict' });
    await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers, body: JSON.stringify(VALID) });
    const res = await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers, body: JSON.stringify({ ...VALID, amount: 999 }) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('lấy claim không tồn tại thì trả 404', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims/CLM-999999`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it('liệt kê claim có phân trang và lọc theo status', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims?status=PENDING&page=1&pageSize=2`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { status: string }[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.data.every((claim) => claim.status === 'PENDING')).toBe(true);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(2);
    expect(body.pagination.totalPages).toBe(Math.ceil(body.pagination.total / 2));
  });
});
