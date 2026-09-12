/** Phiên bản SDK, dùng trong header User-Agent. */
export const VERSION = '0.1.0';

export { InsuranceSDK, type SdkDependencies } from './client.js';
export { ENVIRONMENT_BASE_URLS, type ResolvedConfig } from './config.js';
export {
  ApiError,
  AuthError,
  InsuranceSDKError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from './errors.js';
export { CLAIM_TYPES, CURRENCIES, DOCUMENT_TYPES } from './validation.js';
export type { Clock } from './core/clock.js';
export type { Transport, TransportRequest, TransportResponse } from './core/transport.js';
export type {
  Claim,
  ClaimDocument,
  ClaimStatus,
  ClaimType,
  CreateClaimInput,
  DocumentType,
  FileInput,
  InsuranceSDKConfig,
  ListClaimsParams,
  Logger,
  PaginatedResult,
  Pagination,
  ProgressDetail,
  ProgressHandler,
  RequestOptions,
  StatusHistoryEntry,
  StatusListener,
  TerminalClaimStatus,
  Unsubscribe,
  UploadOptions,
  WatchOptions,
} from './types.js';
