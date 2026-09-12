import { describe, expect, it } from 'vitest';
import { validateCreateClaim } from '../src/validation.js';

const NOW = Date.parse('2024-06-01T00:00:00.000Z');
const VALID = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

describe('validateCreateClaim', () => {
  it('không báo lỗi với body hợp lệ', () => {
    expect(validateCreateClaim(VALID, NOW)).toEqual({});
  });

  it('báo tất cả field bắt buộc còn thiếu', () => {
    expect(validateCreateClaim({}, NOW)).toEqual({
      policyId: 'required',
      claimType: 'required',
      diagnosisCode: 'required',
      treatmentDate: 'required',
      amount: 'required',
      currency: 'required',
    });
  });

  it('bắt lỗi định dạng policyId', () => {
    expect(validateCreateClaim({ ...VALID, policyId: '123' }, NOW).policyId).toBe('must match POL-<digits>');
  });

  it('bắt lỗi claimType ngoài danh sách', () => {
    expect(validateCreateClaim({ ...VALID, claimType: 'SURGERY' }, NOW).claimType).toContain('must be one of');
  });

  it('bắt lỗi mã ICD-10 sai định dạng', () => {
    expect(validateCreateClaim({ ...VALID, diagnosisCode: 'j069' }, NOW).diagnosisCode).toBe('must be a valid ICD-10 code');
  });

  it('bắt lỗi ngày điều trị trong tương lai', () => {
    expect(validateCreateClaim({ ...VALID, treatmentDate: '2024-06-02' }, NOW).treatmentDate).toBe('must not be in the future');
  });

  it('bắt lỗi số tiền không dương và quá 2 chữ số thập phân', () => {
    expect(validateCreateClaim({ ...VALID, amount: 0 }, NOW).amount).toBe('must be positive');
    expect(validateCreateClaim({ ...VALID, amount: 10.123 }, NOW).amount).toBe('must have at most 2 decimal places');
  });

  it('bắt lỗi đơn vị tiền tệ không hỗ trợ', () => {
    expect(validateCreateClaim({ ...VALID, currency: 'XYZ' }, NOW).currency).toContain('must be one of');
  });
});
