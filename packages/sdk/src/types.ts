import type { Readable } from 'node:stream';

/** Trạng thái của một hồ sơ bồi thường. */
export type ClaimStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

/** Trạng thái cuối, khi đã có quyết định. */
export type TerminalClaimStatus = Extract<ClaimStatus, 'APPROVED' | 'REJECTED'>;

/** Loại hình điều trị của hồ sơ. */
export type ClaimType = 'OUTPATIENT' | 'INPATIENT' | 'DENTAL' | 'MATERNITY';

/** Loại tài liệu đính kèm hồ sơ. */
export type DocumentType =
  | 'medical_receipt'
  | 'discharge_summary'
  | 'prescription'
  | 'lab_result'
  | 'id_document'
  | 'other';

/** Dữ liệu cần có để tạo một hồ sơ mới. */
export interface CreateClaimInput {
  /** Mã hợp đồng bảo hiểm, dạng POL-<số>. */
  policyId: string;
  /** Loại hình điều trị. */
  claimType: ClaimType;
  /** Mã chẩn đoán ICD-10, ví dụ J06.9. */
  diagnosisCode: string;
  /** Ngày điều trị theo định dạng YYYY-MM-DD, không được ở tương lai. */
  treatmentDate: string;
  /** Số tiền yêu cầu chi trả, lớn hơn 0, tối đa 2 chữ số thập phân. */
  amount: number;
  /** Mã tiền tệ ISO 4217, ví dụ THB. */
  currency: string;
}

/** Một mốc trong lịch sử trạng thái của hồ sơ. */
export interface StatusHistoryEntry {
  status: ClaimStatus;
  /** Thời điểm theo ISO 8601. */
  at: string;
}

/** Hồ sơ bồi thường trả về từ API. */
export interface Claim extends CreateClaimInput {
  id: string;
  status: ClaimStatus;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/** Bộ lọc khi liệt kê hồ sơ. */
export interface ListClaimsParams {
  status?: ClaimStatus;
  /** Trang bắt đầu từ 1. */
  page?: number;
  /** Số bản ghi mỗi trang, tối đa 100. */
  pageSize?: number;
}

/** Thông tin phân trang. */
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Kết quả có phân trang. */
export interface PaginatedResult<T> {
  data: T[];
  pagination: Pagination;
}

/** Tài liệu đã upload cho một hồ sơ. */
export interface ClaimDocument {
  id: string;
  claimId: string;
  type: DocumentType;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

/** Chi tiết tiến độ upload. */
export interface ProgressDetail {
  bytesSent: number;
  totalBytes: number;
}

/** Callback nhận tiến độ upload. */
export type ProgressHandler = (percent: number, detail: ProgressDetail) => void;

/** Nguồn file để upload: buffer, đường dẫn, hoặc stream kèm kích thước. */
export type FileInput =
  | Buffer
  | string
  | { stream: Readable; size: number; filename: string; contentType?: string };

/** Tuỳ chọn cho mỗi lời gọi API. */
export interface RequestOptions {
  /** Khoá idempotency tự đặt. Nếu bỏ trống, SDK tự sinh cho request POST. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Tuỳ chọn khi upload tài liệu. */
export interface UploadOptions extends RequestOptions {
  type: DocumentType;
  onProgress?: ProgressHandler;
  /** Ghi đè tên file suy ra từ đường dẫn. */
  filename?: string;
  /** Ghi đè content type suy ra từ đuôi file. */
  contentType?: string;
}

/** Callback nhận thay đổi trạng thái. */
export type StatusListener = (newStatus: ClaimStatus, claim: Claim) => void;

/** Tuỳ chọn khi theo dõi trạng thái. */
export interface WatchOptions {
  /** Khoảng cách giữa hai lần poll, mặc định 2000ms. */
  intervalMs?: number;
  /** Thời gian theo dõi tối đa, mặc định 300000ms. */
  maxDurationMs?: number;
  /** Trạng thái đã biết trước khi bắt đầu theo dõi. */
  initialStatus?: ClaimStatus;
  onError?: (error: unknown) => void;
}

/** Hàm dừng theo dõi. Gọi nhiều lần vẫn an toàn. */
export type Unsubscribe = () => void;

/** Logger tối giản để debug. */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
}

/** Cấu hình khởi tạo SDK. */
export interface InsuranceSDKConfig {
  apiKey: string;
  /** Mặc định 'sandbox'. */
  environment?: 'sandbox' | 'production';
  /** Timeout cho mỗi lần thử, mặc định 30000ms. */
  timeout?: number;
  /** Số lần thử lại tối đa, mặc định 3. */
  maxRetries?: number;
  /** Ghi đè URL suy ra từ environment. */
  baseUrl?: string;
  /** Header gắn vào mọi request. */
  defaultHeaders?: Record<string, string>;
  logger?: Logger;
}
