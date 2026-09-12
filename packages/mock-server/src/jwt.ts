import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

export type VerifyResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const sign = (data: string, secret: string): Buffer => createHmac('sha256', secret).update(data).digest();

export function signToken(sub: string, secret: string, ttlSeconds: number, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub, iat, exp: iat + ttlSeconds } satisfies JwtPayload);
  const signature = sign(`${header}.${payload}`, secret).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string, secret: string, nowMs: number): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, payload, signature] = parts as [string, string, string];

  const expected = sign(`${header}.${payload}`, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let decoded: JwtPayload;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof decoded.exp !== 'number' || typeof decoded.sub !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  if (decoded.exp * 1000 <= nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, payload: decoded };
}
