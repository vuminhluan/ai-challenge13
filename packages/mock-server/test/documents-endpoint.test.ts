import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, defaultConfig } from '../src/server.js';

let server: Server;
let baseUrl: string;
let token: string;
let claimId: string;

beforeAll(async () => {
  server = createServer(defaultConfig({ failureRate: 0, minDelayMs: 0, maxDelayMs: 0 }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const tokenRes = await fetch(`${baseUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: 'pk_test_abc' }),
  });
  token = ((await tokenRes.json()) as { accessToken: string }).accessToken;

  const claimRes = await fetch(`${baseUrl}/api/v1/claims`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      policyId: 'POL-123',
      claimType: 'OUTPATIENT',
      diagnosisCode: 'J06.9',
      treatmentDate: '2024-03-15',
      amount: 15000,
      currency: 'THB',
    }),
  });
  claimId = ((await claimRes.json()) as { id: string }).id;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

const upload = (
  targetClaimId: string,
  type: string,
  filename: string,
  contentType: string,
  content: Buffer = Buffer.from('%PDF-1.4 nội dung giả'),
): Promise<Response> => {
  const form = new FormData();
  form.set('type', type);
  form.set('file', new Blob([content], { type: contentType }), filename);
  return fetch(`${baseUrl}/api/v1/claims/${targetClaimId}/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
};

describe('document endpoints', () => {
  it('upload thành công trả 201 kèm metadata', async () => {
    const res = await upload(claimId, 'medical_receipt', 'receipt.pdf', 'application/pdf');
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { id: string; type: string; filename: string; size: number };
    expect(doc.id).toMatch(/^DOC-\d{6}$/);
    expect(doc.type).toBe('medical_receipt');
    expect(doc.filename).toBe('receipt.pdf');
    expect(doc.size).toBeGreaterThan(0);
  });

  it('từ chối loại tài liệu ngoài danh sách', async () => {
    const res = await upload(claimId, 'selfie', 'receipt.pdf', 'application/pdf');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { fields: Record<string, string> } };
    expect(body.error.fields.type).toContain('must be one of');
  });

  it('từ chối định dạng file không hỗ trợ', async () => {
    const res = await upload(claimId, 'other', 'note.txt', 'text/plain');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { fields: Record<string, string> } }).error.fields.file).toContain('must be');
  });

  it('upload vào claim không tồn tại thì trả 404', async () => {
    const res = await upload('CLM-999999', 'medical_receipt', 'receipt.pdf', 'application/pdf');
    expect(res.status).toBe(404);
  });

  it('từ chối file khai là PDF nhưng nội dung không phải PDF', async () => {
    const res = await upload(claimId, 'medical_receipt', 'receipt.pdf', 'application/pdf', Buffer.from('đây chỉ là văn bản thường'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields.file).toContain('content does not match');
  });

  it('chấp nhận file PDF thật đọc từ đĩa', async () => {
    const real = await readFile(fileURLToPath(new URL('../../../examples/fixtures/receipt.pdf', import.meta.url)));
    const res = await upload(claimId, 'medical_receipt', 'receipt.pdf', 'application/pdf', real);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { size: number }).size).toBe(real.length);
  });

  it('liệt kê tài liệu của claim', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims/${claimId}/documents`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { claimId: string }[] };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every((doc) => doc.claimId === claimId)).toBe(true);
  });
});
