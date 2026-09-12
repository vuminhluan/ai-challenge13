import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { ValidationError } from '../src/errors.js';

describe('resolveConfig', () => {
  it('điền giá trị mặc định', () => {
    const config = resolveConfig({ apiKey: 'pk_test_abc' });
    expect(config.baseUrl).toBe('http://localhost:4000');
    expect(config.timeout).toBe(30_000);
    expect(config.maxRetries).toBe(3);
    expect(config.defaultHeaders).toEqual({});
  });

  it('environment production trỏ tới url production', () => {
    expect(resolveConfig({ apiKey: 'pk_test_abc', environment: 'production' }).baseUrl).toContain('https://');
  });

  it('baseUrl ghi đè environment và bị cắt dấu gạch chéo cuối', () => {
    expect(resolveConfig({ apiKey: 'pk_test_abc', environment: 'production', baseUrl: 'http://127.0.0.1:9999/' }).baseUrl).toBe('http://127.0.0.1:9999');
  });

  it('thiếu apiKey thì ném ValidationError', () => {
    expect(() => resolveConfig({ apiKey: '' })).toThrow(ValidationError);
    try {
      resolveConfig({ apiKey: '' });
    } catch (error) {
      expect((error as ValidationError).fields).toEqual({ apiKey: 'required' });
      expect((error as ValidationError).code).toBe('CLIENT_VALIDATION');
    }
  });

  it('timeout và maxRetries không hợp lệ thì ném ValidationError', () => {
    expect(() => resolveConfig({ apiKey: 'pk_test_abc', timeout: 0 })).toThrow(ValidationError);
    expect(() => resolveConfig({ apiKey: 'pk_test_abc', maxRetries: -1 })).toThrow(ValidationError);
  });
});
