import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendError, sendJson } from '../http.js';
import { buildStatusHistory, computeStatus } from '../lifecycle.js';
import type { AuthContext } from '../router.js';
import type { ServerConfig } from '../server.js';
import type { ClaimInput, StoredClaim } from '../store.js';
import type { ClaimStatus, LifecycleConfig, StatusHistoryEntry } from '../types.js';
import { validateCreateClaim } from '../validation.js';

export interface ClaimResponse {
  id: string;
  policyId: string;
  claimType: string;
  diagnosisCode: string;
  treatmentDate: string;
  amount: number;
  currency: string;
  status: ClaimStatus;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export function toClaimResponse(claim: StoredClaim, nowMs: number, cfg: LifecycleConfig): ClaimResponse {
  const history = buildStatusHistory(claim.createdAtMs, claim.amount, nowMs, cfg);
  const last = history[history.length - 1];
  return {
    id: claim.id,
    policyId: claim.policyId,
    claimType: claim.claimType,
    diagnosisCode: claim.diagnosisCode,
    treatmentDate: claim.treatmentDate,
    amount: claim.amount,
    currency: claim.currency,
    status: computeStatus(claim.createdAtMs, claim.amount, nowMs, cfg),
    statusHistory: history,
    createdAt: new Date(claim.createdAtMs).toISOString(),
    updatedAt: last?.at ?? new Date(claim.createdAtMs).toISOString(),
  };
}

export async function handleCreateClaim(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  auth: AuthContext,
): Promise<void> {
  const body = await readJsonBody(req);
  if (body === undefined) {
    sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    return;
  }
  const now = config.now();
  const idempotencyKey = req.headers['idempotency-key'];
  const bodyHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');

  if (typeof idempotencyKey === 'string' && idempotencyKey !== '') {
    const existing = config.store.getIdempotent(auth.apiKey, idempotencyKey);
    if (existing !== undefined) {
      if (existing.bodyHash !== bodyHash) {
        sendError(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different body');
        return;
      }
      sendJson(res, existing.status, existing.response);
      return;
    }
  }

  const errors = validateCreateClaim(body, now);
  if (Object.keys(errors).length > 0) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', errors);
    return;
  }

  const claim = config.store.createClaim(auth.apiKey, body as ClaimInput, now);
  const response = toClaimResponse(claim, now, config.lifecycle);
  if (typeof idempotencyKey === 'string' && idempotencyKey !== '') {
    config.store.setIdempotent(auth.apiKey, idempotencyKey, { bodyHash, status: 201, response });
  }
  sendJson(res, 201, response);
}

export function handleGetClaim(
  res: ServerResponse,
  config: ServerConfig,
  auth: AuthContext,
  claimId: string,
): void {
  const claim = config.store.getClaim(auth.apiKey, claimId);
  if (claim === undefined) {
    sendError(res, 404, 'CLAIM_NOT_FOUND', `Claim ${claimId} was not found`);
    return;
  }
  sendJson(res, 200, toClaimResponse(claim, config.now(), config.lifecycle));
}

export function handleListClaims(
  res: ServerResponse,
  config: ServerConfig,
  auth: AuthContext,
  query: URLSearchParams,
): void {
  const now = config.now();
  const status = query.get('status');
  const page = Math.max(1, Number.parseInt(query.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.get('pageSize') ?? '20', 10) || 20));

  const all = config.store
    .listClaims(auth.apiKey)
    .map((claim) => toClaimResponse(claim, now, config.lifecycle))
    .filter((claim) => status === null || claim.status === status);

  const start = (page - 1) * pageSize;
  sendJson(res, 200, {
    data: all.slice(start, start + pageSize),
    pagination: { page, pageSize, total: all.length, totalPages: Math.ceil(all.length / pageSize) },
  });
}
