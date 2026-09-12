import { ValidationError } from './errors.js';
import type { ClaimType, CreateClaimInput, DocumentType } from './types.js';

/** Các loại hồ sơ được chấp nhận. */
export const CLAIM_TYPES: readonly ClaimType[] = ['OUTPATIENT', 'INPATIENT', 'DENTAL', 'MATERNITY'];

/** Các loại tài liệu được chấp nhận. */
export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'medical_receipt',
  'discharge_summary',
  'prescription',
  'lab_result',
  'id_document',
  'other',
];

/** Các mã tiền tệ được chấp nhận. */
export const CURRENCIES: readonly string[] = ['THB', 'VND', 'USD', 'SGD', 'MYR', 'IDR', 'PHP'];

/** Đuôi file được chấp nhận khi upload. */
export const ALLOWED_EXTENSIONS: readonly string[] = ['.pdf', '.jpg', '.jpeg', '.png'];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const POLICY_ID = /^POL-\d+$/;
const ICD10 = /^[A-Z]\d{2}(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Kiểm tra dữ liệu tạo claim ngay tại client, trước khi gửi request nào. */
export function validateCreateClaim(input: CreateClaimInput, nowMs: number): Record<string, string> {
  const fields: Record<string, string> = {};
  const value = input as Partial<CreateClaimInput> | undefined;

  const requireString = (
    key: 'policyId' | 'claimType' | 'diagnosisCode' | 'treatmentDate' | 'currency',
  ): string | undefined => {
    const raw = value?.[key];
    if (raw === undefined || raw === null || raw === '') {
      fields[key] = 'required';
      return undefined;
    }
    if (typeof raw !== 'string') {
      fields[key] = 'must be a string';
      return undefined;
    }
    return raw;
  };

  const policyId = requireString('policyId');
  if (policyId !== undefined && !POLICY_ID.test(policyId)) fields.policyId = 'must match POL-<digits>';

  const claimType = requireString('claimType');
  if (claimType !== undefined && !CLAIM_TYPES.includes(claimType as ClaimType)) {
    fields.claimType = `must be one of ${CLAIM_TYPES.join(', ')}`;
  }

  const diagnosisCode = requireString('diagnosisCode');
  if (diagnosisCode !== undefined && !ICD10.test(diagnosisCode)) fields.diagnosisCode = 'must be a valid ICD-10 code';

  const treatmentDate = requireString('treatmentDate');
  if (treatmentDate !== undefined) {
    const parsed = Date.parse(`${treatmentDate}T00:00:00.000Z`);
    if (!DATE.test(treatmentDate) || Number.isNaN(parsed)) fields.treatmentDate = 'must be a valid YYYY-MM-DD date';
    else if (parsed > nowMs) fields.treatmentDate = 'must not be in the future';
  }

  const amount = value?.amount;
  if (amount === undefined || amount === null) fields.amount = 'required';
  else if (typeof amount !== 'number' || !Number.isFinite(amount)) fields.amount = 'must be a number';
  else if (amount <= 0) fields.amount = 'must be positive';
  else if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9) fields.amount = 'must have at most 2 decimal places';

  const currency = requireString('currency');
  if (currency !== undefined && !CURRENCIES.includes(currency)) {
    fields.currency = `must be one of ${CURRENCIES.join(', ')}`;
  }

  return fields;
}

/** Kiểm tra thông tin file trước khi mở file và gửi đi. */
export function validateUpload(type: string, filename: string, size: number): Record<string, string> {
  const fields: Record<string, string> = {};

  if (!DOCUMENT_TYPES.includes(type as DocumentType)) {
    fields.type = `must be one of ${DOCUMENT_TYPES.join(', ')}`;
  }

  const lower = filename.toLowerCase();
  if (size <= 0) fields.file = 'must not be empty';
  else if (size > MAX_FILE_BYTES) fields.file = 'must not exceed 10MB';
  else if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    fields.file = `must be one of ${ALLOWED_EXTENSIONS.join(', ')}`;
  }

  return fields;
}

/** Ném ValidationError nếu có bất kỳ lỗi nào. */
export function assertValid(fields: Record<string, string>, message: string): void {
  if (Object.keys(fields).length > 0) {
    throw new ValidationError(message, fields, 'CLIENT_VALIDATION');
  }
}
