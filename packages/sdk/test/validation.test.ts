import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.js';
import { assertValid, validateCreateClaim, validateUpload } from '../src/validation.js';
import type { CreateClaimInput } from '../src/types.js';

const NOW = Date.parse('2024-06-01T00:00:00.000Z');
const VALID: CreateClaimInput = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

describe('validateCreateClaim', () => {
  it('input hợp lệ thì không có lỗi', () => {
    expect(validateCreateClaim(VALID, NOW)).toEqual({});
  });

  it('gom tất cả field bắt buộc còn thiếu vào một lần', () => {
    expect(validateCreateClaim({} as CreateClaimInput, NOW)).toEqual({
      policyId: 'required',
      claimType: 'required',
      diagnosisCode: 'required',
      treatmentDate: 'required',
      amount: 'required',
      currency: 'required',
    });
  });

  it('bắt lỗi định dạng policyId', () => {
    expect(validateCreateClaim({ ...VALID, policyId: 'POLICY-1' }, NOW).policyId).toBe('must match POL-<digits>');
  });

  it('bắt lỗi claimType ngoài danh sách', () => {
    expect(validateCreateClaim({ ...VALID, claimType: 'SURGERY' as CreateClaimInput['claimType'] }, NOW).claimType).toContain('must be one of');
  });

  it('bắt lỗi mã ICD-10 sai', () => {
    expect(validateCreateClaim({ ...VALID, diagnosisCode: 'JO6.9' }, NOW).diagnosisCode).toBe('must be a valid ICD-10 code');
  });

  it('bắt lỗi ngày điều trị sai định dạng và ở tương lai', () => {
    expect(validateCreateClaim({ ...VALID, treatmentDate: '15/03/2024' }, NOW).treatmentDate).toBe('must be a valid YYYY-MM-DD date');
    expect(validateCreateClaim({ ...VALID, treatmentDate: '2024-06-02' }, NOW).treatmentDate).toBe('must not be in the future');
  });

  it('bắt lỗi số tiền', () => {
    expect(validateCreateClaim({ ...VALID, amount: -5 }, NOW).amount).toBe('must be positive');
    expect(validateCreateClaim({ ...VALID, amount: 10.999 }, NOW).amount).toBe('must have at most 2 decimal places');
  });

  it('bắt lỗi tiền tệ không hỗ trợ', () => {
    expect(validateCreateClaim({ ...VALID, currency: 'thb' }, NOW).currency).toContain('must be one of');
  });
});

describe('validateUpload', () => {
  it('file hợp lệ thì không có lỗi', () => {
    expect(validateUpload('medical_receipt', 'receipt.pdf', 1024)).toEqual({});
  });

  it('bắt lỗi loại tài liệu, đuôi file và kích thước', () => {
    expect(validateUpload('selfie', 'receipt.pdf', 1024).type).toContain('must be one of');
    expect(validateUpload('other', 'note.txt', 1024).file).toContain('must be one of');
    expect(validateUpload('other', 'big.pdf', 11 * 1024 * 1024).file).toBe('must not exceed 10MB');
    expect(validateUpload('other', 'empty.pdf', 0).file).toBe('must not be empty');
  });
});

describe('assertValid', () => {
  it('ném ValidationError với code CLIENT_VALIDATION khi có lỗi', () => {
    expect(() => assertValid({ amount: 'must be positive' }, 'Invalid claim')).toThrow(ValidationError);
    try {
      assertValid({ amount: 'must be positive' }, 'Invalid claim');
    } catch (error) {
      expect((error as ValidationError).code).toBe('CLIENT_VALIDATION');
      expect((error as ValidationError).fields).toEqual({ amount: 'must be positive' });
    }
  });

  it('không ném gì khi không có lỗi', () => {
    expect(() => assertValid({}, 'Invalid claim')).not.toThrow();
  });
});
