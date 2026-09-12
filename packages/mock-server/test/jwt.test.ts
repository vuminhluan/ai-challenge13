import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../src/jwt.js';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;

describe('jwt', () => {
  it('signs a token that verifies back', () => {
    const token = signToken('pk_test_abc', SECRET, 3600, NOW);
    const result = verifyToken(token, SECRET, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('pk_test_abc');
      expect(result.payload.exp).toBe(Math.floor(NOW / 1000) + 3600);
    }
  });

  it('rejects an expired token', () => {
    const token = signToken('pk_test_abc', SECRET, 60, NOW);
    const result = verifyToken(token, SECRET, NOW + 61_000);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token with a tampered signature', () => {
    const token = signToken('pk_test_abc', SECRET, 3600, NOW);
    const result = verifyToken(`${token}tampered`, SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a malformed token', () => {
    expect(verifyToken('not-a-jwt', SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signToken('pk_test_abc', 'another-secret', 3600, NOW);
    expect(verifyToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
