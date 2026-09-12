import type { ClaimType, DocumentType } from './types.js';

export const CLAIM_TYPES: readonly ClaimType[] = ['OUTPATIENT', 'INPATIENT', 'DENTAL', 'MATERNITY'];
export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'medical_receipt',
  'discharge_summary',
  'prescription',
  'lab_result',
  'id_document',
  'other',
];
export const CURRENCIES: readonly string[] = ['THB', 'VND', 'USD', 'SGD', 'MYR', 'IDR', 'PHP'];

const POLICY_ID = /^POL-\d+$/;
const ICD10 = /^[A-Z]\d{2}(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateCreateClaim(body: unknown, nowMs: number): Record<string, string> {
  const errors: Record<string, string> = {};
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const requireString = (field: string): string | undefined => {
    const value = input[field];
    if (value === undefined || value === null || value === '') {
      errors[field] = 'required';
      return undefined;
    }
    if (typeof value !== 'string') {
      errors[field] = 'must be a string';
      return undefined;
    }
    return value;
  };

  const policyId = requireString('policyId');
  if (policyId !== undefined && !POLICY_ID.test(policyId)) errors.policyId = 'must match POL-<digits>';

  const claimType = requireString('claimType');
  if (claimType !== undefined && !CLAIM_TYPES.includes(claimType as ClaimType)) {
    errors.claimType = `must be one of ${CLAIM_TYPES.join(', ')}`;
  }

  const diagnosisCode = requireString('diagnosisCode');
  if (diagnosisCode !== undefined && !ICD10.test(diagnosisCode)) {
    errors.diagnosisCode = 'must be a valid ICD-10 code';
  }

  const treatmentDate = requireString('treatmentDate');
  if (treatmentDate !== undefined) {
    const parsed = Date.parse(`${treatmentDate}T00:00:00.000Z`);
    if (!DATE.test(treatmentDate) || Number.isNaN(parsed)) errors.treatmentDate = 'must be a valid YYYY-MM-DD date';
    else if (parsed > nowMs) errors.treatmentDate = 'must not be in the future';
  }

  const amount = input.amount;
  if (amount === undefined || amount === null) errors.amount = 'required';
  else if (typeof amount !== 'number' || !Number.isFinite(amount)) errors.amount = 'must be a number';
  else if (amount <= 0) errors.amount = 'must be positive';
  else if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9) {
    errors.amount = 'must have at most 2 decimal places';
  }

  const currency = requireString('currency');
  if (currency !== undefined && !CURRENCIES.includes(currency)) {
    errors.currency = `must be one of ${CURRENCIES.join(', ')}`;
  }

  return errors;
}
