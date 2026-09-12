import { randomUUID } from 'node:crypto';
import { AuthError, mapHttpError, NetworkError } from '../errors.js';
import type { Logger } from '../types.js';
import { AuthManager, type TokenResponse } from './auth.js';
import type { Clock } from './clock.js';
import { computeDelayMs, DEFAULT_BACKOFF, isRetryableStatus, parseRetryAfter } from './retry.js';
import type { Transport, TransportBody, TransportResponse } from './transport.js';

export interface PipelineOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  transport: Transport;
  clock: Clock;
  random: () => number;
  defaultHeaders: Record<string, string>;
  logger?: Logger;
}

export interface PipelineRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: TransportBody;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Defaults to true. Set false for requests that cannot be resent, such as a raw stream body. */
  retryable?: boolean;
}

interface TokenPayload {
  accessToken: string;
  expiresIn: number;
}

/** Joins auth, retries, idempotency, timeouts and error mapping into a single path. */
export class RequestPipeline {
  private readonly options: PipelineOptions;
  private readonly auth: AuthManager;

  constructor(options: PipelineOptions) {
    this.options = options;
    this.auth = new AuthManager({
      clock: options.clock,
      requestToken: (signal) => this.requestToken(signal),
    });
  }

  /** Sends a request, handling tokens, retries and error mapping along the way. */
  async execute<T>(request: PipelineRequest): Promise<T> {
    const url = this.buildUrl(request.path, request.query);
    const idempotencyKey = request.method === 'POST' ? request.idempotencyKey ?? randomUUID() : undefined;
    const retryable = request.retryable ?? true;
    const maxAttempts = retryable ? this.options.maxRetries + 1 : 1;

    let authRetried = false;
    let attempt = 0;

    for (;;) {
      const token = await this.auth.getToken(request.signal);
      const headers: Record<string, string> = {
        ...this.options.defaultHeaders,
        accept: 'application/json',
        authorization: `Bearer ${token.accessToken}`,
      };
      if (idempotencyKey !== undefined) headers['idempotency-key'] = idempotencyKey;

      attempt += 1;
      let response: TransportResponse;
      try {
        response = await this.options.transport.send({
          method: request.method,
          url,
          headers,
          ...(request.body === undefined ? {} : { body: request.body }),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
          timeoutMs: this.options.timeoutMs,
        });
      } catch (error) {
        const isAborted = error instanceof NetworkError && error.code === 'REQUEST_ABORTED';
        if (isAborted || attempt >= maxAttempts) {
          throw error instanceof NetworkError
            ? new NetworkError(error.message, attempt, error.code, error.cause)
            : error;
        }
        await this.backoff(attempt - 1, undefined, request.signal);
        continue;
      }

      if (response.status >= 200 && response.status < 300) {
        return (response.body === '' ? undefined : JSON.parse(response.body)) as T;
      }

      if (response.status === 401 && !authRetried) {
        const error = mapHttpError(response.status, response.body, attempt);
        if (error instanceof AuthError && error.reason === 'token_expired') {
          authRetried = true;
          this.auth.invalidate(token.epoch);
          this.options.logger?.debug('token expired, refreshing', { path: request.path });
          continue;
        }
      }

      if (retryable && isRetryableStatus(response.status) && attempt < maxAttempts) {
        const retryAfter = parseRetryAfter(response.headers['retry-after'], this.options.clock.now());
        await this.backoff(attempt - 1, retryAfter, request.signal);
        continue;
      }

      throw mapHttpError(response.status, response.body, attempt);
    }
  }

  private async backoff(attemptIndex: number, retryAfterMs: number | undefined, signal?: AbortSignal): Promise<void> {
    const delay = computeDelayMs(attemptIndex, retryAfterMs, { ...DEFAULT_BACKOFF, random: this.options.random });
    this.options.logger?.debug('waiting before retry', { attemptIndex, delay });
    await this.options.clock.sleep(delay, signal);
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) search.set(key, String(value));
    }
    const suffix = search.toString();
    return `${this.options.baseUrl}${path}${suffix === '' ? '' : `?${suffix}`}`;
  }

  private async requestToken(signal?: AbortSignal): Promise<TokenResponse> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      let response: TransportResponse;
      try {
        response = await this.options.transport.send({
          method: 'POST',
          url: `${this.options.baseUrl}/api/v1/auth/token`,
          headers: { ...this.options.defaultHeaders, accept: 'application/json' },
          body: { kind: 'json', value: { apiKey: this.options.apiKey } },
          ...(signal === undefined ? {} : { signal }),
          timeoutMs: this.options.timeoutMs,
        });
      } catch (error) {
        const isAborted = error instanceof NetworkError && error.code === 'REQUEST_ABORTED';
        if (isAborted || attempt >= this.options.maxRetries + 1) throw error;
        await this.backoff(attempt - 1, undefined, signal);
        continue;
      }

      if (response.status === 200) {
        const payload = JSON.parse(response.body) as TokenPayload;
        return { accessToken: payload.accessToken, expiresAtMs: this.options.clock.now() + payload.expiresIn * 1000 };
      }

      if (isRetryableStatus(response.status) && attempt < this.options.maxRetries + 1) {
        const retryAfter = parseRetryAfter(response.headers['retry-after'], this.options.clock.now());
        await this.backoff(attempt - 1, retryAfter, signal);
        continue;
      }

      throw mapHttpError(response.status, response.body, attempt);
    }
  }
}
