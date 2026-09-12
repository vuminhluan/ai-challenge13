import type { ClaimStatus, LifecycleConfig, StatusHistoryEntry } from './types.js';

export function computeStatus(
  createdAtMs: number,
  amount: number,
  nowMs: number,
  cfg: LifecycleConfig,
): ClaimStatus {
  const age = nowMs - createdAtMs;
  if (age < cfg.reviewMs) return 'PENDING';
  if (age < cfg.decisionMs) return 'IN_REVIEW';
  return amount > cfg.rejectAboveAmount ? 'REJECTED' : 'APPROVED';
}

export function buildStatusHistory(
  createdAtMs: number,
  amount: number,
  nowMs: number,
  cfg: LifecycleConfig,
): StatusHistoryEntry[] {
  const history: StatusHistoryEntry[] = [{ status: 'PENDING', at: new Date(createdAtMs).toISOString() }];
  if (nowMs - createdAtMs >= cfg.reviewMs) {
    history.push({ status: 'IN_REVIEW', at: new Date(createdAtMs + cfg.reviewMs).toISOString() });
  }
  if (nowMs - createdAtMs >= cfg.decisionMs) {
    history.push({
      status: amount > cfg.rejectAboveAmount ? 'REJECTED' : 'APPROVED',
      at: new Date(createdAtMs + cfg.decisionMs).toISOString(),
    });
  }
  return history;
}
