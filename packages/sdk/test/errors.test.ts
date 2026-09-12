import { describe, expect, it } from 'vitest';
import { ApiError, AuthError, mapHttpError, NetworkError, TimeoutError, ValidationError } from '../src/errors.js';

const body = (payload: unknown): string => JSON.stringify(payload);

describe('cây lỗi', () => {
  it('TimeoutError vẫn là NetworkError', () => {
    const error = new TimeoutError('hết thời gian', 30_000, 3);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.timeoutMs).toBe(30_000);
    expect(error.attempts).toBe(3);
  });

  it('mọi lỗi đều giữ đúng tên class sau khi kế thừa', () => {
    expect(new ValidationError('sai', { a: 'required' }, 'CLIENT_VALIDATION').name).toBe('ValidationError');
    expect(new AuthError('sai key', 'invalid_api_key').name).toBe('AuthError');
    expect(new ApiError('lỗi', 500, 'INTERNAL_ERROR', false).name).toBe('ApiError');
  });
});

describe('mapHttpError', () => {
  it('400 thành ValidationError kèm fields', () => {
    const error = mapHttpError(400, body({ error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { amount: 'must be positive' }, requestId: 'req_1' } }), 1);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toEqual({ amount: 'must be positive' });
    expect(error.requestId).toBe('req_1');
  });

  it('401 TOKEN_EXPIRED thành AuthError với reason token_expired', () => {
    const error = mapHttpError(401, body({ error: { code: 'TOKEN_EXPIRED', message: 'hết hạn' } }), 1);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).reason).toBe('token_expired');
  });

  it('401 INVALID_API_KEY thành AuthError với reason invalid_api_key', () => {
    const error = mapHttpError(401, body({ error: { code: 'INVALID_API_KEY', message: 'sai key' } }), 1);
    expect((error as AuthError).reason).toBe('invalid_api_key');
  });

  it('403 thành AuthError với reason forbidden', () => {
    expect((mapHttpError(403, body({ error: { code: 'FORBIDDEN', message: 'cấm' } }), 1) as AuthError).reason).toBe('forbidden');
  });

  it('404 thành ApiError không đáng retry', () => {
    const error = mapHttpError(404, body({ error: { code: 'CLAIM_NOT_FOUND', message: 'không thấy' } }), 1) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.retryable).toBe(false);
  });

  it('503 thành ApiError đáng retry', () => {
    expect((mapHttpError(503, body({ error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }), 4) as ApiError).retryable).toBe(true);
  });

  it('body không phải JSON vẫn tạo được ApiError', () => {
    const error = mapHttpError(500, '<html>lỗi</html>', 1) as ApiError;
    expect(error.status).toBe(500);
    expect(error.code).toBe('UNKNOWN_ERROR');
  });
});
