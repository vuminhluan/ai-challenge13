import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { ValidationError } from '../src/errors.js';

describe('resolveConfig', () => {
  it('fills in the defaults', () => {
    const config = resolveConfig({ apiKey: 'pk_test_abc' });
    expect(config.baseUrl).toBe('http://localhost:4000');
    expect(config.timeout).toBe(30_000);
    expect(config.maxRetries).toBe(3);
    expect(config.defaultHeaders).toEqual({});
  });

  it('the production environment points at the production url', () => {
    expect(resolveConfig({ apiKey: 'pk_test_abc', environment: 'production' }).baseUrl).toContain('https://');
  });

  it('baseUrl overrides environment and has its trailing slash trimmed', () => {
    expect(resolveConfig({ apiKey: 'pk_test_abc', environment: 'production', baseUrl: 'http://127.0.0.1:9999/' }).baseUrl).toBe('http://127.0.0.1:9999');
  });

  it('throws ValidationError when apiKey is missing', () => {
    expect(() => resolveConfig({ apiKey: '' })).toThrow(ValidationError);
    try {
      resolveConfig({ apiKey: '' });
    } catch (error) {
      expect((error as ValidationError).fields).toEqual({ apiKey: 'required' });
      expect((error as ValidationError).code).toBe('CLIENT_VALIDATION');
    }
  });

  it('throws ValidationError for an invalid timeout or maxRetries', () => {
    expect(() => resolveConfig({ apiKey: 'pk_test_abc', timeout: 0 })).toThrow(ValidationError);
    expect(() => resolveConfig({ apiKey: 'pk_test_abc', maxRetries: -1 })).toThrow(ValidationError);
  });
});
