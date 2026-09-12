import { describe, expect, it, vi } from 'vitest';
import { watchClaimStatus } from '../src/status-watcher.js';
import type { Claim, ClaimStatus } from '../src/types.js';
import { FakeClock } from './helpers.js';

const claimWith = (status: ClaimStatus): Claim => ({
  id: 'CLM-000001',
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
  status,
  statusHistory: [{ status: 'PENDING', at: '2024-06-01T00:00:00.000Z' }],
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
};

describe('watchClaimStatus', () => {
  it('calls the listener only on a real change, then stops at a terminal status', async () => {
    const clock = new FakeClock();
    const statuses: ClaimStatus[] = ['PENDING', 'PENDING', 'IN_REVIEW', 'IN_REVIEW', 'APPROVED'];
    let index = 0;
    const fetchClaim = vi.fn(async () => claimWith(statuses[index++] ?? 'APPROVED'));
    const seen: ClaimStatus[] = [];

    watchClaimStatus({ fetchClaim, clock }, (status) => seen.push(status), { intervalMs: 1000 });
    await flush();

    expect(seen).toEqual(['IN_REVIEW', 'APPROVED']);
    expect(fetchClaim).toHaveBeenCalledTimes(5);
  });

  it('emits immediately when the first poll is already terminal', async () => {
    const clock = new FakeClock();
    const seen: ClaimStatus[] = [];

    watchClaimStatus({ fetchClaim: async () => claimWith('REJECTED'), clock }, (status) => seen.push(status), { intervalMs: 1000 });
    await flush();

    expect(seen).toEqual(['REJECTED']);
  });

  it('compares against initialStatus when one is supplied', async () => {
    const clock = new FakeClock();
    const seen: ClaimStatus[] = [];

    watchClaimStatus({ fetchClaim: async () => claimWith('IN_REVIEW'), clock }, (status) => seen.push(status), {
      intervalMs: 1000,
      initialStatus: 'PENDING',
      maxDurationMs: 3000,
    });
    await flush();

    expect(seen).toEqual(['IN_REVIEW']);
  });

  it('unsubscribing stops the polling loop', async () => {
    const clock = new FakeClock();
    const fetchClaim = vi.fn(async () => claimWith('PENDING'));

    const stop = watchClaimStatus({ fetchClaim, clock }, () => {}, { intervalMs: 1000, maxDurationMs: 1_000_000 });
    await Promise.resolve();
    stop();
    stop();
    await flush();

    expect(fetchClaim.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('stops once maxDurationMs elapses', async () => {
    const clock = new FakeClock();
    const fetchClaim = vi.fn(async () => claimWith('PENDING'));

    watchClaimStatus({ fetchClaim, clock }, () => {}, { intervalMs: 1000, maxDurationMs: 5000 });
    await flush();

    expect(fetchClaim.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('polling errors go to onError without breaking the loop', async () => {
    const clock = new FakeClock();
    const errors: unknown[] = [];
    let call = 0;
    const fetchClaim = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('network failure');
      return claimWith('APPROVED');
    });

    watchClaimStatus({ fetchClaim, clock }, () => {}, { intervalMs: 1000, onError: (error) => errors.push(error) });
    await flush();

    expect(errors).toHaveLength(1);
    expect(fetchClaim).toHaveBeenCalledTimes(2);
  });
});
