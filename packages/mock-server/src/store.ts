import type { ClaimType, DocumentType } from './types.js';

export interface ClaimInput {
  policyId: string;
  claimType: ClaimType;
  diagnosisCode: string;
  treatmentDate: string;
  amount: number;
  currency: string;
}

export interface StoredClaim extends ClaimInput {
  id: string;
  apiKey: string;
  createdAtMs: number;
}

export interface DocumentInput {
  type: DocumentType;
  filename: string;
  contentType: string;
  size: number;
}

export interface StoredDocument extends DocumentInput {
  id: string;
  claimId: string;
  uploadedAtMs: number;
}

export interface IdempotentRecord {
  bodyHash: string;
  status: number;
  response: unknown;
}

const pad = (value: number): string => String(value).padStart(6, '0');

export class Store {
  private claims = new Map<string, StoredClaim>();
  private documents = new Map<string, StoredDocument[]>();
  private idempotency = new Map<string, IdempotentRecord>();
  private claimSeq = 0;
  private documentSeq = 0;

  createClaim(apiKey: string, input: ClaimInput, nowMs: number): StoredClaim {
    this.claimSeq += 1;
    const claim: StoredClaim = { ...input, id: `CLM-${pad(this.claimSeq)}`, apiKey, createdAtMs: nowMs };
    this.claims.set(claim.id, claim);
    return claim;
  }

  getClaim(apiKey: string, id: string): StoredClaim | undefined {
    const claim = this.claims.get(id);
    return claim !== undefined && claim.apiKey === apiKey ? claim : undefined;
  }

  listClaims(apiKey: string): StoredClaim[] {
    return [...this.claims.values()]
      .filter((claim) => claim.apiKey === apiKey)
      .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id));
  }

  addDocument(claimId: string, input: DocumentInput, nowMs: number): StoredDocument {
    this.documentSeq += 1;
    const doc: StoredDocument = { ...input, id: `DOC-${pad(this.documentSeq)}`, claimId, uploadedAtMs: nowMs };
    const list = this.documents.get(claimId) ?? [];
    list.push(doc);
    this.documents.set(claimId, list);
    return doc;
  }

  listDocuments(claimId: string): StoredDocument[] {
    return this.documents.get(claimId) ?? [];
  }

  getIdempotent(apiKey: string, key: string): IdempotentRecord | undefined {
    return this.idempotency.get(`${apiKey}:${key}`);
  }

  setIdempotent(apiKey: string, key: string, record: IdempotentRecord): void {
    this.idempotency.set(`${apiKey}:${key}`, record);
  }
}
