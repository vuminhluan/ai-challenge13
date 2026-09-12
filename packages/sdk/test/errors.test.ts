import { describe, expect, it } from 'vitest';
import { ApiError, AuthError, mapHttpError, NetworkError, TimeoutError, ValidationError } from '../src/errors.js';

const body = (payload: unknown): string => JSON.stringify(payload);

describe('error hierarchy', () => {
  it('TimeoutError is still a NetworkError', () => {
    const error = new TimeoutError('timed out', 30_000, 3);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.timeoutMs).toBe(30_000);
    expect(error.attempts).toBe(3);
  });

  it('every error keeps its class name through inheritance', () => {
    expect(new ValidationError('invalid', { a: 'required' }, 'CLIENT_VALIDATION').name).toBe('ValidationError');
    expect(new AuthError('bad key', 'invalid_api_key').name).toBe('AuthError');
    expect(new ApiError('failure', 500, 'INTERNAL_ERROR', false).name).toBe('ApiError');
  });
});

describe('mapHttpError', () => {
  it('maps 400 to ValidationError with fields', () => {
    const error = mapHttpError(400, body({ error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { amount: 'must be positive' }, requestId: 'req_1' } }), 1);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toEqual({ amount: 'must be positive' });
    expect(error.requestId).toBe('req_1');
  });

  it('maps 401 TOKEN_EXPIRED to AuthError with reason token_expired', () => {
    const error = mapHttpError(401, body({ error: { code: 'TOKEN_EXPIRED', message: 'expired' } }), 1);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).reason).toBe('token_expired');
  });

  it('maps 401 INVALID_API_KEY to AuthError with reason invalid_api_key', () => {
    const error = mapHttpError(401, body({ error: { code: 'INVALID_API_KEY', message: 'sai key' } }), 1);
    expect((error as AuthError).reason).toBe('invalid_api_key');
  });

  it('maps 403 to AuthError with reason forbidden', () => {
    expect((mapHttpError(403, body({ error: { code: 'FORBIDDEN', message: 'forbidden' } }), 1) as AuthError).reason).toBe('forbidden');
  });

  it('maps 404 to a non-retryable ApiError', () => {
    const error = mapHttpError(404, body({ error: { code: 'CLAIM_NOT_FOUND', message: 'not found' } }), 1) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.retryable).toBe(false);
  });

  it('maps 503 to a retryable ApiError', () => {
    expect((mapHttpError(503, body({ error: { code: 'SERVICE_UNAVAILABLE', message: 'busy' } }), 4) as ApiError).retryable).toBe(true);
  });

  it('still builds an ApiError when the body is not JSON', () => {
    const error = mapHttpError(500, '<html>error</html>', 1) as ApiError;
    expect(error.status).toBe(500);
    expect(error.code).toBe('UNKNOWN_ERROR');
  });
});
