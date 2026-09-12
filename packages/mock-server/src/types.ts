export type ClaimStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export type ClaimType = 'OUTPATIENT' | 'INPATIENT' | 'DENTAL' | 'MATERNITY';
export type DocumentType =
  | 'medical_receipt'
  | 'discharge_summary'
  | 'prescription'
  | 'lab_result'
  | 'id_document'
  | 'other';

export interface StatusHistoryEntry {
  status: ClaimStatus;
  at: string;
}

export interface LifecycleConfig {
  reviewMs: number;
  decisionMs: number;
  rejectAboveAmount: number;
}
