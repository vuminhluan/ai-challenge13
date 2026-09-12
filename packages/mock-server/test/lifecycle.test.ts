import { describe, expect, it } from 'vitest';
import { buildStatusHistory, computeStatus } from '../src/lifecycle.js';
import type { LifecycleConfig } from '../src/types.js';

const CFG: LifecycleConfig = { reviewMs: 5000, decisionMs: 10_000, rejectAboveAmount: 100_000 };
const CREATED = 1_700_000_000_000;

describe('lifecycle', () => {
  it('mới tạo thì PENDING', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 4999, CFG)).toBe('PENDING');
  });

  it('quá mốc review thì IN_REVIEW', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 5000, CFG)).toBe('IN_REVIEW');
  });

  it('quá mốc quyết định và số tiền hợp lệ thì APPROVED', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 10_000, CFG)).toBe('APPROVED');
  });

  it('quá mốc quyết định và số tiền vượt ngưỡng thì REJECTED', () => {
    expect(computeStatus(CREATED, 100_001, CREATED + 10_000, CFG)).toBe('REJECTED');
  });

  it('statusHistory chỉ chứa các trạng thái đã đi qua', () => {
    expect(buildStatusHistory(CREATED, 15_000, CREATED + 6000, CFG)).toEqual([
      { status: 'PENDING', at: new Date(CREATED).toISOString() },
      { status: 'IN_REVIEW', at: new Date(CREATED + 5000).toISOString() },
    ]);
  });
});
