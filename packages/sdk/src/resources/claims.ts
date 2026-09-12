import type { Clock } from '../core/clock.js';
import type { RequestPipeline } from '../core/pipeline.js';
import { watchClaimStatus } from '../status-watcher.js';
import type {
  Claim,
  CreateClaimInput,
  ListClaimsParams,
  PaginatedResult,
  RequestOptions,
  StatusListener,
  Unsubscribe,
  WatchOptions,
} from '../types.js';
import { assertValid, validateCreateClaim } from '../validation.js';

/** Operations on insurance claims. */
export class ClaimsResource {
  protected readonly pipeline: RequestPipeline;
  protected readonly clock: Clock;

  constructor(pipeline: RequestPipeline, clock: Clock) {
    this.pipeline = pipeline;
    this.clock = clock;
  }

  /**
   * Creates a claim. Input is validated on the client first, so bad data throws
   * `ValidationError` without a single request being made.
   */
  async create(input: CreateClaimInput, options: RequestOptions = {}): Promise<Claim> {
    assertValid(validateCreateClaim(input, this.clock.now()), 'Invalid claim payload');
    return this.pipeline.execute<Claim>({
      method: 'POST',
      path: '/api/v1/claims',
      body: { kind: 'json', value: input },
      ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }

  /** Fetches a claim with its current status. */
  async get(claimId: string, options: RequestOptions = {}): Promise<Claim> {
    assertValid(claimId === '' ? { claimId: 'required' } : {}, 'Invalid claim id');
    return this.pipeline.execute<Claim>({
      method: 'GET',
      path: `/api/v1/claims/${encodeURIComponent(claimId)}`,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }

  /** Lists claims, with pagination and status filtering. */
  async list(params: ListClaimsParams = {}, options: RequestOptions = {}): Promise<PaginatedResult<Claim>> {
    return this.pipeline.execute<PaginatedResult<Claim>>({
      method: 'GET',
      path: '/api/v1/claims',
      query: { status: params.status, page: params.page, pageSize: params.pageSize },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }

  /**
   * Watches a claim for status changes by polling at a fixed interval.
   *
   * Always call the returned function once you are done: the polling loop keeps the
   * Node process alive, so forgetting it means your script never exits.
   */
  onStatusChange(claimId: string, listener: StatusListener, options: WatchOptions = {}): Unsubscribe {
    return watchClaimStatus(
      { clock: this.clock, fetchClaim: (signal) => this.get(claimId, { signal }) },
      listener,
      options,
    );
  }
}
