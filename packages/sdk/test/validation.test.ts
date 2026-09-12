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
  it('reports no errors for valid input', () => {
    expect(validateCreateClaim(VALID, NOW)).toEqual({});
  });

  it('collects every missing required field at once', () => {
    expect(validateCreateClaim({} as CreateClaimInput, NOW)).toEqual({
      policyId: 'required',
      claimType: 'required',
      diagnosisCode: 'required',
      treatmentDate: 'required',
      amount: 'required',
      currency: 'required',
    });
  });

  it('catches a malformed policyId', () => {
    expect(validateCreateClaim({ ...VALID, policyId: 'POLICY-1' }, NOW).policyId).toBe('must match POL-<digits>');
  });

  it('catches a claimType outside the enum', () => {
    expect(validateCreateClaim({ ...VALID, claimType: 'SURGERY' as CreateClaimInput['claimType'] }, NOW).claimType).toContain('must be one of');
  });

  it('catches an invalid ICD-10 code', () => {
    expect(validateCreateClaim({ ...VALID, diagnosisCode: 'JO6.9' }, NOW).diagnosisCode).toBe('must be a valid ICD-10 code');
  });

  it('catches a malformed treatment date and one in the future', () => {
    expect(validateCreateClaim({ ...VALID, treatmentDate: '15/03/2024' }, NOW).treatmentDate).toBe('must be a valid YYYY-MM-DD date');
    expect(validateCreateClaim({ ...VALID, treatmentDate: '2024-06-02' }, NOW).treatmentDate).toBe('must not be in the future');
  });

  it('catches invalid amounts', () => {
    expect(validateCreateClaim({ ...VALID, amount: -5 }, NOW).amount).toBe('must be positive');
    expect(validateCreateClaim({ ...VALID, amount: 10.999 }, NOW).amount).toBe('must have at most 2 decimal places');
  });

  it('catches an unsupported currency', () => {
    expect(validateCreateClaim({ ...VALID, currency: 'thb' }, NOW).currency).toContain('must be one of');
  });
});

describe('validateUpload', () => {
  it('reports no errors for a valid file', () => {
    expect(validateUpload('medical_receipt', 'receipt.pdf', 1024)).toEqual({});
  });

  it('catches a bad document type, extension and size', () => {
    expect(validateUpload('selfie', 'receipt.pdf', 1024).type).toContain('must be one of');
    expect(validateUpload('other', 'note.txt', 1024).file).toContain('must be one of');
    expect(validateUpload('other', 'big.pdf', 11 * 1024 * 1024).file).toBe('must not exceed 10MB');
    expect(validateUpload('other', 'empty.pdf', 0).file).toBe('must not be empty');
  });
});

describe('assertValid', () => {
  it('throws ValidationError with code CLIENT_VALIDATION when there are errors', () => {
    expect(() => assertValid({ amount: 'must be positive' }, 'Invalid claim')).toThrow(ValidationError);
    try {
      assertValid({ amount: 'must be positive' }, 'Invalid claim');
    } catch (error) {
      expect((error as ValidationError).code).toBe('CLIENT_VALIDATION');
      expect((error as ValidationError).fields).toEqual({ amount: 'must be positive' });
    }
  });

  it('throws nothing when there are no errors', () => {
    expect(() => assertValid({}, 'Invalid claim')).not.toThrow();
  });
});
