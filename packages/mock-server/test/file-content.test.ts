import { describe, expect, it } from 'vitest';
import { HEAD_BYTES, matchesDeclaredType, scanFileContent } from '../src/file-content.js';

const pdf = Buffer.from('%PDF-1.4\n');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const text = Buffer.from('this is just plain text');

describe('matchesDeclaredType', () => {
  it('accepts a file whose magic bytes match the declared content type', () => {
    expect(matchesDeclaredType(pdf, 'application/pdf')).toBe(true);
    expect(matchesDeclaredType(jpeg, 'image/jpeg')).toBe(true);
    expect(matchesDeclaredType(png, 'image/png')).toBe(true);
  });

  it('rejects content that is not the declared type', () => {
    expect(matchesDeclaredType(text, 'application/pdf')).toBe(false);
    expect(matchesDeclaredType(pdf, 'image/png')).toBe(false);
    expect(matchesDeclaredType(png, 'application/pdf')).toBe(false);
  });

  it('rejects an empty file or one too short to identify', () => {
    expect(matchesDeclaredType(Buffer.alloc(0), 'application/pdf')).toBe(false);
    expect(matchesDeclaredType(Buffer.from('%PD'), 'application/pdf')).toBe(false);
  });

  it('rejects a content type outside the supported list', () => {
    expect(matchesDeclaredType(text, 'text/plain')).toBe(false);
  });

  it('the first HEAD_BYTES bytes are enough to identify a file', () => {
    expect(HEAD_BYTES).toBeGreaterThanOrEqual(8);
    expect(matchesDeclaredType(pdf.subarray(0, HEAD_BYTES), 'application/pdf')).toBe(true);
  });
});

describe('scanFileContent', () => {
  it('is a stub, so it always passes', () => {
    expect(scanFileContent(pdf, 'application/pdf')).toEqual({ ok: true });
    expect(scanFileContent(text, 'application/pdf')).toEqual({ ok: true });
  });
});
