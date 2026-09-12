import { resolveConfig } from './config.js';
import { systemClock, type Clock } from './core/clock.js';
import { RequestPipeline } from './core/pipeline.js';
import { NodeHttpTransport, type Transport } from './core/transport.js';
import { ClaimsResource } from './resources/claims.js';
import { DocumentsResource } from './resources/documents.js';
import type { InsuranceSDKConfig } from './types.js';

/** Substitutable components, mainly for tests. */
export interface SdkDependencies {
  transport?: Transport;
  clock?: Clock;
  random?: () => number;
}

/**
 * Entry point of the SDK.
 *
 * ```ts
 * const sdk = new InsuranceSDK({ apiKey: 'pk_test_xxx', environment: 'sandbox' });
 * const claim = await sdk.claims.create({ ... });
 * ```
 */
export class InsuranceSDK {
  /** Claim operations. */
  readonly claims: ClaimsResource;
  /** Document operations. */
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
