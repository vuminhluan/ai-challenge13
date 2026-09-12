import { resolveConfig } from './config.js';
import { systemClock, type Clock } from './core/clock.js';
import { RequestPipeline } from './core/pipeline.js';
import { NodeHttpTransport, type Transport } from './core/transport.js';
import { ClaimsResource } from './resources/claims.js';
import { DocumentsResource } from './resources/documents.js';
import type { InsuranceSDKConfig } from './types.js';

/** Các thành phần thay thế được, chủ yếu phục vụ test. */
export interface SdkDependencies {
  transport?: Transport;
  clock?: Clock;
  random?: () => number;
}

/**
 * Điểm vào của SDK.
 *
 * ```ts
 * const sdk = new InsuranceSDK({ apiKey: 'pk_test_xxx', environment: 'sandbox' });
 * const claim = await sdk.claims.create({ ... });
 * ```
 */
export class InsuranceSDK {
  /** Thao tác với hồ sơ bồi thường. */
  readonly claims: ClaimsResource;
  /** Thao tác với tài liệu đính kèm. */
  readonly documents: DocumentsResource;

  constructor(config: InsuranceSDKConfig, deps: SdkDependencies = {}) {
    const resolved = resolveConfig(config);
    const clock = deps.clock ?? systemClock;
    const pipeline = new RequestPipeline({
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
      timeoutMs: resolved.timeout,
      maxRetries: resolved.maxRetries,
      defaultHeaders: resolved.defaultHeaders,
      transport: deps.transport ?? new NodeHttpTransport(),
      clock,
      random: deps.random ?? Math.random,
      ...(resolved.logger === undefined ? {} : { logger: resolved.logger }),
    });
    this.claims = new ClaimsResource(pipeline, clock);
    this.documents = new DocumentsResource(pipeline);
  }
}
