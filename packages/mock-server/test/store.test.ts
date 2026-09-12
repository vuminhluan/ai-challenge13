import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import type { ClaimInput } from '../src/store.js';

const NOW = 1_700_000_000_000;
const INPUT: ClaimInput = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

describe('Store', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store();
  });

  it('sinh ID claim tuần tự có padding', () => {
    expect(store.createClaim('pk_test_a', INPUT, NOW).id).toBe('CLM-000001');
    expect(store.createClaim('pk_test_a', INPUT, NOW).id).toBe('CLM-000002');
  });

  it('claim của đối tác này thì đối tác khác không đọc được', () => {
    const claim = store.createClaim('pk_test_a', INPUT, NOW);
    expect(store.getClaim('pk_test_a', claim.id)).toBeDefined();
    expect(store.getClaim('pk_test_b', claim.id)).toBeUndefined();
  });

  it('listClaims chỉ trả claim của đúng đối tác, mới nhất trước', () => {
    store.createClaim('pk_test_a', INPUT, NOW);
    store.createClaim('pk_test_b', INPUT, NOW);
    const second = store.createClaim('pk_test_a', INPUT, NOW + 1000);
    const list = store.listClaims('pk_test_a');
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(second.id);
  });

  it('lưu và đọc lại được document theo claim', () => {
    const claim = store.createClaim('pk_test_a', INPUT, NOW);
    const doc = store.addDocument(claim.id, { type: 'medical_receipt', filename: 'r.pdf', contentType: 'application/pdf', size: 120 }, NOW);
    expect(doc.id).toBe('DOC-000001');
    expect(store.listDocuments(claim.id)).toEqual([doc]);
    expect(store.listDocuments('CLM-999999')).toEqual([]);
  });

  it('idempotency record tách biệt theo từng API key', () => {
    store.setIdempotent('pk_test_a', 'key-1', { bodyHash: 'h1', status: 201, response: { id: 'CLM-000001' } });
    expect(store.getIdempotent('pk_test_a', 'key-1')?.bodyHash).toBe('h1');
    expect(store.getIdempotent('pk_test_b', 'key-1')).toBeUndefined();
  });
});
