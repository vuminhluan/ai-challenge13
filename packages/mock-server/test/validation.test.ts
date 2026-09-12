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
  it('reports no errors for a valid body', () => {
    expect(validateCreateClaim(VALID, NOW)).toEqual({});
  });

  it('reports every missing required field', () => {
    expect(validateCreateClaim({}, NOW)).toEqual({
      policyId: 'required',
      claimType: 'required',
      diagnosisCode: 'required',
      treatmentDate: 'required',
      amount: 'required',
      currency: 'required',
    });
  });

  it('catches a malformed policyId', () => {
    expect(validateCreateClaim({ ...VALID, policyId: '123' }, NOW).policyId).toBe('must match POL-<digits>');
  });

  it('catches a claimType outside the enum', () => {
    expect(validateCreateClaim({ ...VALID, claimType: 'SURGERY' }, NOW).claimType).toContain('must be one of');
  });

  it('catches a malformed ICD-10 code', () => {
    expect(validateCreateClaim({ ...VALID, diagnosisCode: 'j069' }, NOW).diagnosisCode).toBe('must be a valid ICD-10 code');
  });

  it('catches a treatment date in the future', () => {
    expect(validateCreateClaim({ ...VALID, treatmentDate: '2024-06-02' }, NOW).treatmentDate).toBe('must not be in the future');
  });

  it('catches a non-positive amount and more than 2 decimal places', () => {
    expect(validateCreateClaim({ ...VALID, amount: 0 }, NOW).amount).toBe('must be positive');
    expect(validateCreateClaim({ ...VALID, amount: 10.123 }, NOW).amount).toBe('must have at most 2 decimal places');
  });

  it('catches an unsupported currency', () => {
    expect(validateCreateClaim({ ...VALID, currency: 'XYZ' }, NOW).currency).toContain('must be one of');
  });
});
