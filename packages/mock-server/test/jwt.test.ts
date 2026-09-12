import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../src/jwt.js';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;

describe('jwt', () => {
  it('ký rồi xác minh lại được', () => {
    const token = signToken('pk_test_abc', SECRET, 3600, NOW);
    const result = verifyToken(token, SECRET, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('pk_test_abc');
      expect(result.payload.exp).toBe(Math.floor(NOW / 1000) + 3600);
    }
  });

  it('từ chối token đã hết hạn', () => {
    const token = signToken('pk_test_abc', SECRET, 60, NOW);
    const result = verifyToken(token, SECRET, NOW + 61_000);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('từ chối token bị sửa chữ ký', () => {
    const token = signToken('pk_test_abc', SECRET, 3600, NOW);
    const result = verifyToken(`${token}tampered`, SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('từ chối token sai định dạng', () => {
    expect(verifyToken('không-phải-jwt', SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('từ chối token ký bằng secret khác', () => {
    const token = signToken('pk_test_abc', 'secret-khác', 3600, NOW);
    expect(verifyToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
