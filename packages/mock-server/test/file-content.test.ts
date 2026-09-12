import { describe, expect, it } from 'vitest';
import { HEAD_BYTES, matchesDeclaredType, scanFileContent } from '../src/file-content.js';

const pdf = Buffer.from('%PDF-1.4\n');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const text = Buffer.from('đây chỉ là văn bản thường');

describe('matchesDeclaredType', () => {
  it('chấp nhận khi magic bytes khớp content type được khai', () => {
    expect(matchesDeclaredType(pdf, 'application/pdf')).toBe(true);
    expect(matchesDeclaredType(jpeg, 'image/jpeg')).toBe(true);
    expect(matchesDeclaredType(png, 'image/png')).toBe(true);
  });

  it('từ chối khi nội dung không phải loại được khai', () => {
    expect(matchesDeclaredType(text, 'application/pdf')).toBe(false);
    expect(matchesDeclaredType(pdf, 'image/png')).toBe(false);
    expect(matchesDeclaredType(png, 'application/pdf')).toBe(false);
  });

  it('từ chối file rỗng hoặc quá ngắn để nhận dạng', () => {
    expect(matchesDeclaredType(Buffer.alloc(0), 'application/pdf')).toBe(false);
    expect(matchesDeclaredType(Buffer.from('%PD'), 'application/pdf')).toBe(false);
  });

  it('từ chối content type không nằm trong danh sách hỗ trợ', () => {
    expect(matchesDeclaredType(text, 'text/plain')).toBe(false);
  });

  it('chỉ cần HEAD_BYTES byte đầu là đủ để nhận dạng', () => {
    expect(HEAD_BYTES).toBeGreaterThanOrEqual(8);
    expect(matchesDeclaredType(pdf.subarray(0, HEAD_BYTES), 'application/pdf')).toBe(true);
  });
});

describe('scanFileContent', () => {
  it('là mockup nên luôn cho qua', () => {
    expect(scanFileContent(pdf, 'application/pdf')).toEqual({ ok: true });
    expect(scanFileContent(text, 'application/pdf')).toEqual({ ok: true });
  });
});
