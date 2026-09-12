import { describe, expect, it } from 'vitest';
import { RequestPipeline } from '../src/core/pipeline.js';
import { ValidationError } from '../src/errors.js';
import { ClaimsResource } from '../src/resources/claims.js';
import type { Claim, CreateClaimInput } from '../src/types.js';
import { FakeClock, FakeTransport, jsonReply } from './helpers.js';

const TOKEN = jsonReply(200, { accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 3600 });

const VALID: CreateClaimInput = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

const CLAIM: Claim = {
  ...VALID,
  id: 'CLM-000001',
  status: 'PENDING',
  statusHistory: [{ status: 'PENDING', at: '2024-06-01T00:00:00.000Z' }],
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

const setup = (): { claims: ClaimsResource; transport: FakeTransport } => {
  const transport = new FakeTransport();
  const clock = new FakeClock(Date.parse('2024-06-01T00:00:00.000Z'));
  const pipeline = new RequestPipeline({
    baseUrl: 'http://api.test',
    apiKey: 'pk_test_abc',
    timeoutMs: 30_000,
    maxRetries: 3,
    transport,
    clock,
    random: () => 0.5,
    defaultHeaders: {},
  });
  return { claims: new ClaimsResource(pipeline, clock), transport };
};

describe('ClaimsResource.create', () => {
  it('sends POST /api/v1/claims with the right body', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, CLAIM));

    const claim = await claims.create(VALID);

    expect(claim.id).toBe('CLM-000001');
    expect(claim.status).toBe('PENDING');
    const request = transport.requests[1];
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('http://api.test/api/v1/claims');
    expect(request?.body).toEqual({ kind: 'json', value: VALID });
  });

  it('throws ValidationError on bad input without touching the transport', async () => {
    const { claims, transport } = setup();

    await expect(claims.create({ ...VALID, policyId: '', amount: -1 })).rejects.toBeInstanceOf(ValidationError);
    expect(transport.requests).toHaveLength(0);
  });

  it('reports every invalid field in a single throw', async () => {
    const { claims } = setup();
    const error = await claims.create({} as CreateClaimInput).catch((err: unknown) => err);
    expect((error as ValidationError).fields).toEqual({
      policyId: 'required',
      claimType: 'required',
      diagnosisCode: 'required',
      treatmentDate: 'required',
      amount: 'required',
      currency: 'required',
    });
  });

  it('passes through a caller-supplied idempotencyKey', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, CLAIM));

    await claims.create(VALID, { idempotencyKey: 'key-do-toi-dat' });

    expect(transport.requests[1]?.headers['idempotency-key']).toBe('key-do-toi-dat');
  });
});

describe('ClaimsResource.get', () => {
  it('sends GET to the right path', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, CLAIM));

    const claim = await claims.get('CLM-000001');

    expect(claim.id).toBe('CLM-000001');
    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims/CLM-000001');
  });

  it('throws ValidationError for an empty id without touching the transport', async () => {
    const { claims, transport } = setup();
    await expect(claims.get('')).rejects.toBeInstanceOf(ValidationError);
    expect(transport.requests).toHaveLength(0);
  });
});

describe('ClaimsResource.list', () => {
  it('builds the query string from the filters', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, { data: [CLAIM], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));

    const result = await claims.list({ status: 'PENDING', page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims?status=PENDING&page=1&pageSize=20');
  });

  it('omits the query string when no parameters are given', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));

    await claims.list();

    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims');
  });
});
