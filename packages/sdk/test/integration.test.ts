import type { Server } from 'node:http';
import { createServer, defaultConfig } from '@insurance/mock-server/src/server.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InsuranceSDK } from '../src/index.js';
import type { ClaimStatus, CreateClaimInput } from '../src/types.js';

let server: Server;
let baseUrl: string;

const INPUT: CreateClaimInput = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

const makeSdk = (defaultHeaders: Record<string, string> = {}): InsuranceSDK =>
  new InsuranceSDK({ apiKey: 'pk_test_integration', baseUrl, defaultHeaders, timeout: 5000 });

beforeAll(async () => {
  server = createServer(
    defaultConfig({
      failureRate: 0,
      minDelayMs: 0,
      maxDelayMs: 0,
      lifecycle: { reviewMs: 40, decisionMs: 80, rejectAboveAmount: 100_000 },
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('SDK với mock server thật', () => {
  it('tạo, lấy và liệt kê claim', async () => {
    const sdk = makeSdk();
    const created = await sdk.claims.create(INPUT);
    expect(created.id).toMatch(/^CLM-\d{6}$/);

    const fetched = await sdk.claims.get(created.id);
    expect(fetched.id).toBe(created.id);

    const list = await sdk.claims.list({ page: 1, pageSize: 10 });
    expect(list.data.some((claim) => claim.id === created.id)).toBe(true);
    expect(list.pagination.pageSize).toBe(10);
  });

  it('upload tài liệu và báo tiến độ tới 100', async () => {
    const sdk = makeSdk();
    const claim = await sdk.claims.create(INPUT);
    const percents: number[] = [];

    const doc = await sdk.documents.upload(claim.id, Buffer.from('%PDF-1.4 hoá đơn giả'.repeat(200)), {
      type: 'medical_receipt',
      filename: 'receipt.pdf',
      onProgress: (percent) => percents.push(percent),
    });

    expect(doc.id).toMatch(/^DOC-\d{6}$/);
    expect(percents[percents.length - 1]).toBe(100);
    const docs = await sdk.documents.list(claim.id);
    expect(docs.map((item) => item.id)).toContain(doc.id);
  });

  it('tự thử lại khi server trả 503 hai lần liên tiếp', async () => {
    const sdk = makeSdk({ 'x-mock-force-status': '503,503', 'x-mock-scenario': `retry-${Date.now()}` });
    const claim = await sdk.claims.create(INPUT);
    expect(claim.id).toMatch(/^CLM-\d{6}$/);
  });

  it('validation phía client chặn dữ liệu sai trước khi gọi server', async () => {
    const sdk = makeSdk();
    const error = await sdk.claims.create({ ...INPUT, treatmentDate: '2099-01-01' }).catch((err: unknown) => err);
    expect(error).toMatchObject({ name: 'ValidationError', code: 'CLIENT_VALIDATION' });
    expect((error as { fields: Record<string, string> }).fields.treatmentDate).toBe('must not be in the future');
  });

  it('claim không tồn tại thì thành ApiError 404', async () => {
    const sdk = makeSdk();
    await expect(sdk.claims.get('CLM-999999')).rejects.toMatchObject({ name: 'ApiError', status: 404 });
  });

  it('API key sai thì ném AuthError', async () => {
    const sdk = new InsuranceSDK({ apiKey: 'sk_live_sai', baseUrl });
    await expect(sdk.claims.list()).rejects.toMatchObject({ name: 'AuthError', reason: 'invalid_api_key' });
  });

  it('onStatusChange nhận đủ chuyển tiếp rồi tự dừng', async () => {
    const sdk = makeSdk();
    const claim = await sdk.claims.create(INPUT);
    const seen: ClaimStatus[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('watcher không dừng đúng hạn')), 5000);
      sdk.claims.onStatusChange(
        claim.id,
        (status) => {
          seen.push(status);
          if (status === 'APPROVED' || status === 'REJECTED') {
            clearTimeout(timeout);
            resolve();
          }
        },
        { intervalMs: 20, initialStatus: claim.status, maxDurationMs: 4000 },
      );
    });

    expect(seen[seen.length - 1]).toBe('APPROVED');
  });
});
