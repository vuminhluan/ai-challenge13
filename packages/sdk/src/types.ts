import type { Readable } from 'node:stream';

/** Status of an insurance claim. */
export type ClaimStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

/** Terminal statuses, once a decision has been made. */
export type TerminalClaimStatus = Extract<ClaimStatus, 'APPROVED' | 'REJECTED'>;

/** Treatment category of a claim. */
export type ClaimType = 'OUTPATIENT' | 'INPATIENT' | 'DENTAL' | 'MATERNITY';

/** Type of a document attached to a claim. */
export type DocumentType =
  | 'medical_receipt'
  | 'discharge_summary'
  | 'prescription'
  | 'lab_result'
  | 'id_document'
  | 'other';

/** Data required to create a new claim. */
export interface CreateClaimInput {
  /** Policy identifier, shaped as POL-<digits>. */
  policyId: string;
  /** Treatment category. */
  claimType: ClaimType;
  /** ICD-10 diagnosis code, for example J06.9. */
  diagnosisCode: string;
  /** Treatment date as YYYY-MM-DD. Must not be in the future. */
  treatmentDate: string;
  /** Amount claimed. Must be positive, with at most 2 decimal places. */
  amount: number;
  /** ISO 4217 currency code, for example THB. */
  currency: string;
}

/** One entry in a claim's status history. */
export interface StatusHistoryEntry {
  status: ClaimStatus;
  /** Timestamp in ISO 8601 format. */
  at: string;
}

/** A claim as returned by the API. */
export interface Claim extends CreateClaimInput {
  id: string;
  status: ClaimStatus;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/** Filters for listing claims. */
export interface ListClaimsParams {
  status?: ClaimStatus;
  /** Page number, starting at 1. */
  page?: number;
  /** Records per page, capped at 100. */
  pageSize?: number;
}

/** Pagination metadata. */
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** A paginated result set. */
export interface PaginatedResult<T> {
  data: T[];
  pagination: Pagination;
}

/** A document uploaded against a claim. */
export interface ClaimDocument {
  id: string;
  claimId: string;
  type: DocumentType;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

/** Byte-level detail of upload progress. */
export interface ProgressDetail {
  bytesSent: number;
  totalBytes: number;
}

/** Callback that receives upload progress. */
export type ProgressHandler = (percent: number, detail: ProgressDetail) => void;

/** Upload source: a buffer, a file path, or a stream with its size. */
export type FileInput =
  | Buffer
  | string
  | { stream: Readable; size: number; filename: string; contentType?: string };

/** Per-call options. */
export interface RequestOptions {
  /** Your own idempotency key. Left out, the SDK generates one for POST requests. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Options for uploading a document. */
export interface UploadOptions extends RequestOptions {
  type: DocumentType;
  onProgress?: ProgressHandler;
  /** Overrides the filename inferred from the path. */
  filename?: string;
  /** Overrides the content type inferred from the extension. */
  contentType?: string;
}

/** Callback that receives status changes. */
export type StatusListener = (newStatus: ClaimStatus, claim: Claim) => void;

/** Options for watching a claim's status. */
export interface WatchOptions {
  /** Delay between polls, 2000ms by default. */
  intervalMs?: number;
  /** Maximum time to keep watching, 300000ms by default. */
  maxDurationMs?: number;
  /** Status already known before watching starts. */
  initialStatus?: ClaimStatus;
  onError?: (error: unknown) => void;
}

/** Stops the watcher. Safe to call more than once. */
export type Unsubscribe = () => void;

/** Minimal logger used for debug output. */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
}

/** Configuration passed when constructing the SDK. */
export interface InsuranceSDKConfig {
  apiKey: string;
  /** Defaults to 'sandbox'. */
  environment?: 'sandbox' | 'production';
  /** Timeout per attempt, 30000ms by default. */
  timeout?: number;
  /** Maximum number of retries, 3 by default. */
  maxRetries?: number;
  /** Overrides the URL derived from the environment. */
  baseUrl?: string;
  /** Headers attached to every request. */
  defaultHeaders?: Record<string, string>;
  logger?: Logger;
}
