import { describe, expect, it } from 'vitest';
import { buildStatusHistory, computeStatus } from '../src/lifecycle.js';
import type { LifecycleConfig } from '../src/types.js';

const CFG: LifecycleConfig = { reviewMs: 5000, decisionMs: 10_000, rejectAboveAmount: 100_000 };
const CREATED = 1_700_000_000_000;

describe('lifecycle', () => {
  it('is PENDING right after creation', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 4999, CFG)).toBe('PENDING');
  });

  it('moves to IN_REVIEW past the review mark', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 5000, CFG)).toBe('IN_REVIEW');
  });

  it('is APPROVED past the decision mark when the amount is acceptable', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 10_000, CFG)).toBe('APPROVED');
  });

  it('is REJECTED past the decision mark when the amount is over the threshold', () => {
    expect(computeStatus(CREATED, 100_001, CREATED + 10_000, CFG)).toBe('REJECTED');
  });

  it('statusHistory only contains statuses already passed', () => {
    expect(buildStatusHistory(CREATED, 15_000, CREATED + 6000, CFG)).toEqual([
      { status: 'PENDING', at: new Date(CREATED).toISOString() },
      { status: 'IN_REVIEW', at: new Date(CREATED + 5000).toISOString() },
    ]);
  });
});
