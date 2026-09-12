import type { Clock } from '../core/clock.js';
import type { RequestPipeline } from '../core/pipeline.js';
import type { Claim, CreateClaimInput, ListClaimsParams, PaginatedResult, RequestOptions } from '../types.js';
import { assertValid, validateCreateClaim } from '../validation.js';

/** Các thao tác với hồ sơ bồi thường. */
export class ClaimsResource {
  protected readonly pipeline: RequestPipeline;
  protected readonly clock: Clock;

  constructor(pipeline: RequestPipeline, clock: Clock) {
    this.pipeline = pipeline;
    this.clock = clock;
  }

  /**
   * Tạo một hồ sơ mới. Dữ liệu được kiểm tra tại client trước, nên input sai
   * sẽ ném `ValidationError` mà không phát sinh request nào.
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

  /** Lấy chi tiết và trạng thái hiện tại của một hồ sơ. */
  async get(claimId: string, options: RequestOptions = {}): Promise<Claim> {
    assertValid(claimId === '' ? { claimId: 'required' } : {}, 'Invalid claim id');
    return this.pipeline.execute<Claim>({
      method: 'GET',
      path: `/api/v1/claims/${encodeURIComponent(claimId)}`,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }

  /** Liệt kê hồ sơ, có phân trang và lọc theo trạng thái. */
  async list(params: ListClaimsParams = {}, options: RequestOptions = {}): Promise<PaginatedResult<Claim>> {
    return this.pipeline.execute<PaginatedResult<Claim>>({
      method: 'GET',
      path: '/api/v1/claims',
      query: { status: params.status, page: params.page, pageSize: params.pageSize },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }
}
