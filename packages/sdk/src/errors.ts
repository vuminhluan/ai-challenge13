/** Base class for every error the SDK throws. */
export class InsuranceSDKError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(message: string, code: string, requestId?: string) {
    super(message);
    this.name = 'InsuranceSDKError';
    this.code = code;
    this.requestId = requestId;
  }
}

/** Invalid data, caught by client-side validation or returned as 400 by the server. */
export class ValidationError extends InsuranceSDKError {
  readonly fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string>, code = 'VALIDATION_ERROR', requestId?: string) {
    super(message, code, requestId);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/** Authentication failed. Check the API key or re-authenticate. */
export class AuthError extends InsuranceSDKError {
  readonly reason: 'invalid_api_key' | 'token_expired' | 'forbidden';

  constructor(message: string, reason: 'invalid_api_key' | 'token_expired' | 'forbidden', requestId?: string) {
    super(message, 'AUTH_ERROR', requestId);
    this.name = 'AuthError';
    this.reason = reason;
  }
}

/** The API could not be reached, or retries were exhausted. */
export class NetworkError extends InsuranceSDKError {
  readonly attempts: number;
  /** The underlying socket error, if any. Overrides the ES2022 `Error.cause`. */
  override readonly cause: unknown;

  constructor(message: string, attempts: number, code = 'NETWORK_ERROR', cause?: unknown) {
    super(message, code);
    this.name = 'NetworkError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

/** A single attempt exceeded the timeout. */
export class TimeoutError extends NetworkError {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, attempts: number) {
    super(message, attempts, 'TIMEOUT');
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** Any other error returned by the API. */
export class ApiError extends InsuranceSDKError {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, code: string, retryable: boolean, requestId?: string) {
    super(message, code, requestId);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Turns an API error response into the matching typed error. */
export function mapHttpError(status: number, rawBody: string, attempts: number): InsuranceSDKError {
  let envelope: ErrorEnvelope = {};
  try {
    envelope = JSON.parse(rawBody) as ErrorEnvelope;
  } catch {
    envelope = {};
  }
  const code = envelope.error?.code ?? 'UNKNOWN_ERROR';
  const message = envelope.error?.message ?? `Request failed with status ${status}`;
  const requestId = envelope.error?.requestId;

  if (status === 400) {
    return new ValidationError(message, envelope.error?.fields ?? {}, code, requestId);
  }
  if (status === 401) {
    return new AuthError(message, code === 'INVALID_API_KEY' ? 'invalid_api_key' : 'token_expired', requestId);
  }
  if (status === 403) {
    return new AuthError(message, 'forbidden', requestId);
  }
  return new ApiError(`${message} (attempts: ${attempts})`, status, code, RETRYABLE_STATUSES.has(status), requestId);
}
