import { describe, expect, it } from 'vitest';
import { InsuranceSDK, ValidationError } from '../src/index.js';
import { FakeClock, FakeTransport, jsonReply } from './helpers.js';

const TOKEN = jsonReply(200, { accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 3600 });
const CLAIM = {
  id: 'CLM-000001',
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
  status: 'PENDING',
  statusHistory: [],
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

describe('InsuranceSDK', () => {
  it('wires the resources together and works end to end with a fake transport', async () => {
    const transport = new FakeTransport().queue(TOKEN, jsonReply(201, CLAIM));
    const sdk = new InsuranceSDK(
      { apiKey: 'pk_test_abc', baseUrl: 'http://api.test' },
      { transport, clock: new FakeClock(Date.parse('2024-06-01T00:00:00.000Z')), random: () => 0.5 },
    );

    const claim = await sdk.claims.create({
      policyId: 'POL-123',
      claimType: 'OUTPATIENT',
      diagnosisCode: 'J06.9',
      treatmentDate: '2024-03-15',
      amount: 15000,
      currency: 'THB',
    });

    expect(claim.id).toBe('CLM-000001');
    expect(sdk.documents).toBeDefined();
    expect(typeof sdk.claims.onStatusChange).toBe('function');
  });

  it('throws ValidationError at construction time for a bad config', () => {
    expect(() => new InsuranceSDK({ apiKey: '' })).toThrow(ValidationError);
  });
});
