# API Reference

Mọi ví dụ dưới đây đều chạy được với mock server đang bật (`pnpm mock-server`).

## Mục lục

- [`new InsuranceSDK(config)`](#new-insurancesdkconfig)
- [`sdk.claims.create(input, options?)`](#sdkclaimscreateinput-options)
- [`sdk.claims.get(claimId, options?)`](#sdkclaimsgetclaimid-options)
- [`sdk.claims.list(params?, options?)`](#sdkclaimslistparams-options)
- [`sdk.claims.onStatusChange(claimId, listener, options?)`](#sdkclaimsonstatuschangeclaimid-listener-options)
- [`sdk.documents.upload(claimId, file, options)`](#sdkdocumentsuploadclaimid-file-options)
- [`sdk.documents.list(claimId, options?)`](#sdkdocumentslistclaimid-options)
- [Phụ lục A: Type](#phụ-lục-a-type)
- [Phụ lục B: Lỗi](#phụ-lục-b-lỗi)
- [Phụ lục C: Quy tắc validate phía client](#phụ-lục-c-quy-tắc-validate-phía-client)

---

## `new InsuranceSDK(config)`

```ts
constructor(config: InsuranceSDKConfig, deps?: SdkDependencies)
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `config.apiKey` | `string` | có | API key của đối tác |
| `config.environment` | `'sandbox' \| 'production'` | không | Mặc định `'sandbox'` |
| `config.timeout` | `number` | không | Timeout mỗi lần thử, mặc định `30000` ms |
| `config.maxRetries` | `number` | không | Mặc định `3` |
| `config.baseUrl` | `string` | không | Ghi đè URL của environment |
| `config.defaultHeaders` | `Record<string, string>` | không | Header gắn vào mọi request |
| `config.logger` | `Logger` | không | Nhận log debug |
| `deps` | `SdkDependencies` | không | Thay `transport`, `clock`, `random`. Dùng khi viết test |

**Trả về:** instance có hai resource là `claims` và `documents`.

**Ném:** `ValidationError` (`code: 'CLIENT_VALIDATION'`) nếu thiếu `apiKey`, hoặc `timeout`/`maxRetries` không hợp lệ.

```ts
const sdk = new InsuranceSDK({
  apiKey: 'pk_test_demo',
  environment: 'sandbox',
  timeout: 30_000,
  maxRetries: 3,
});
```

---

## `sdk.claims.create(input, options?)`

```ts
create(input: CreateClaimInput, options?: RequestOptions): Promise<Claim>
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `input.policyId` | `string` | có | Khớp `POL-<số>` |
| `input.claimType` | `ClaimType` | có | `OUTPATIENT`, `INPATIENT`, `DENTAL`, `MATERNITY` |
| `input.diagnosisCode` | `string` | có | Mã ICD-10, ví dụ `J06.9` |
| `input.treatmentDate` | `string` | có | `YYYY-MM-DD`, không ở tương lai |
| `input.amount` | `number` | có | Lớn hơn 0, tối đa 2 chữ số thập phân |
| `input.currency` | `string` | có | `THB`, `VND`, `USD`, `SGD`, `MYR`, `IDR`, `PHP` |
| `options.idempotencyKey` | `string` | không | Tự đặt khoá idempotency. Bỏ trống thì SDK sinh UUID |
| `options.signal` | `AbortSignal` | không | Huỷ request |

**Trả về:** `Claim` với `status` là `PENDING`.

**Ném:** `ValidationError` (client hoặc server), `AuthError`, `NetworkError`, `ApiError`.

**Lưu ý:** dữ liệu được kiểm tra tại client trước, nên input sai không phát sinh request nào.

```ts
const claim = await sdk.claims.create({
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
});
```

---

## `sdk.claims.get(claimId, options?)`

```ts
get(claimId: string, options?: RequestOptions): Promise<Claim>
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `claimId` | `string` | có | Ví dụ `CLM-000001` |
| `options.signal` | `AbortSignal` | không | Huỷ request |

**Trả về:** `Claim` kèm `status` hiện tại và `statusHistory`.

**Ném:** `ValidationError` nếu `claimId` rỗng; `ApiError` với `status: 404` nếu không tìm thấy; `AuthError`; `NetworkError`.

```ts
const claim = await sdk.claims.get('CLM-000001');
console.log(claim.status, claim.statusHistory.length);
```

---

## `sdk.claims.list(params?, options?)`

```ts
list(params?: ListClaimsParams, options?: RequestOptions): Promise<PaginatedResult<Claim>>
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `params.status` | `ClaimStatus` | không | Lọc theo trạng thái |
| `params.page` | `number` | không | Bắt đầu từ 1, mặc định 1 |
| `params.pageSize` | `number` | không | Mặc định 20, tối đa 100 |
| `options.signal` | `AbortSignal` | không | Huỷ request |

**Trả về:** `{ data: Claim[], pagination: { page, pageSize, total, totalPages } }`.

**Ném:** `AuthError`, `NetworkError`, `ApiError`.

```ts
const page = await sdk.claims.list({ status: 'PENDING', page: 1, pageSize: 20 });
console.log(`${page.data.length}/${page.pagination.total}`);
```

---

## `sdk.claims.onStatusChange(claimId, listener, options?)`

```ts
onStatusChange(claimId: string, listener: StatusListener, options?: WatchOptions): Unsubscribe
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `claimId` | `string` | có | Hồ sơ cần theo dõi |
| `listener` | `(status: ClaimStatus, claim: Claim) => void` | có | Chỉ được gọi khi trạng thái thật sự đổi |
| `options.intervalMs` | `number` | không | Mặc định `2000` |
| `options.maxDurationMs` | `number` | không | Mặc định `300000` |
| `options.initialStatus` | `ClaimStatus` | không | Trạng thái đã biết. Truyền vào để nghe được thay đổi ngay từ lần poll đầu |
| `options.onError` | `(error: unknown) => void` | không | Nhận lỗi khi poll. Không có thì lỗi bị bỏ qua và vòng poll vẫn chạy tiếp |

**Trả về:** hàm dừng. Gọi nhiều lần vẫn an toàn.

**Ném:** không ném. Mọi lỗi đi vào `onError`.

**Hành vi:** watcher tự dừng khi claim vào `APPROVED` hoặc `REJECTED`, và khi vượt `maxDurationMs`. Nếu không truyền `initialStatus`, lần poll đầu chỉ dùng để lấy mốc so sánh, trừ khi trạng thái đó đã là trạng thái cuối.

> Vòng poll giữ tiến trình Node sống. Luôn gọi hàm dừng khi không cần theo dõi nữa.

```ts
const stop = sdk.claims.onStatusChange(
  claim.id,
  (status) => {
    if (status === 'APPROVED' || status === 'REJECTED') stop();
  },
  { intervalMs: 1000, initialStatus: claim.status },
);
```

---

## `sdk.documents.upload(claimId, file, options)`

```ts
upload(claimId: string, file: FileInput, options: UploadOptions): Promise<ClaimDocument>
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `claimId` | `string` | có | Hồ sơ nhận tài liệu |
| `file` | `Buffer \| string \| { stream, size, filename, contentType? }` | có | Buffer, đường dẫn file, hoặc stream kèm kích thước |
| `options.type` | `DocumentType` | có | `medical_receipt`, `discharge_summary`, `prescription`, `lab_result`, `id_document`, `other` |
| `options.onProgress` | `(percent: number, detail: ProgressDetail) => void` | không | Luôn phát 0% lúc bắt đầu và 100% khi xong, không phát trùng số |
| `options.filename` | `string` | không | Ghi đè tên file. Bắt buộc khi truyền `Buffer` nếu muốn đúng đuôi file |
| `options.contentType` | `string` | không | Ghi đè content type suy ra từ đuôi file |
| `options.idempotencyKey` | `string` | không | Tự đặt khoá idempotency |
| `options.signal` | `AbortSignal` | không | Huỷ upload |

**Trả về:** `ClaimDocument`.

**Ném:** `ValidationError` nếu `type` sai, đuôi file ngoài pdf/jpg/jpeg/png, file rỗng hoặc quá 10MB (bắt tại client); `ValidationError` với `fields.file = 'content does not match declared type ...'` nếu server thấy magic bytes không khớp content type được khai; `ApiError` 404 nếu claim không tồn tại, 413 nếu server từ chối kích thước; `AuthError`; `NetworkError`.

**Kiểm tra phía server:** ngoài các quy tắc client đã chặn, server đối chiếu 8 byte đầu của file với content type được khai. Tầng quét sâu (virus, cấu trúc PDF) là hàm mockup luôn cho qua — xem mục "Kiểm tra file phía server" trong README.

**Retry:** bật khi nguồn là `Buffer` hoặc đường dẫn file, tắt khi là stream thô.

```ts
const doc = await sdk.documents.upload(claim.id, './receipt.pdf', {
  type: 'medical_receipt',
  onProgress: (percent, { bytesSent, totalBytes }) => {
    console.log(`${percent}% (${bytesSent}/${totalBytes})`);
  },
});
```

---

## `sdk.documents.list(claimId, options?)`

```ts
list(claimId: string, options?: RequestOptions): Promise<ClaimDocument[]>
```

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `claimId` | `string` | có | Hồ sơ cần liệt kê tài liệu |
| `options.signal` | `AbortSignal` | không | Huỷ request |

**Trả về:** mảng `ClaimDocument`, có thể rỗng.

**Ném:** `ApiError` 404 nếu claim không tồn tại; `AuthError`; `NetworkError`.

```ts
const docs = await sdk.documents.list('CLM-000001');
console.log(docs.map((doc) => `${doc.type}: ${doc.filename}`));
```

---

## Phụ lục A: Type

```ts
type ClaimStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
type TerminalClaimStatus = 'APPROVED' | 'REJECTED';
type ClaimType = 'OUTPATIENT' | 'INPATIENT' | 'DENTAL' | 'MATERNITY';
type DocumentType =
  | 'medical_receipt' | 'discharge_summary' | 'prescription'
  | 'lab_result' | 'id_document' | 'other';

interface CreateClaimInput {
  policyId: string;
  claimType: ClaimType;
  diagnosisCode: string;
  treatmentDate: string;
  amount: number;
  currency: string;
}

interface Claim extends CreateClaimInput {
  id: string;
  status: ClaimStatus;
  statusHistory: { status: ClaimStatus; at: string }[];
  createdAt: string;
  updatedAt: string;
}

interface ClaimDocument {
  id: string;
  claimId: string;
  type: DocumentType;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

interface PaginatedResult<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

type FileInput =
  | Buffer
  | string
  | { stream: Readable; size: number; filename: string; contentType?: string };

interface ProgressDetail { bytesSent: number; totalBytes: number }
type Unsubscribe = () => void;
```

## Phụ lục B: Lỗi

| Class | Kế thừa | Khi nào xảy ra | Thuộc tính | Nên làm gì |
|---|---|---|---|---|
| `InsuranceSDKError` | `Error` | Lớp cơ sở, không ném trực tiếp | `code`, `requestId?` | Dùng để bắt gộp mọi lỗi của SDK |
| `ValidationError` | `InsuranceSDKError` | Dữ liệu sai. `code` là `CLIENT_VALIDATION` khi client tự bắt, `VALIDATION_ERROR` khi server trả 400 | `fields` | Hiển thị lỗi theo từng ô nhập |
| `AuthError` | `InsuranceSDKError` | 401 hoặc 403 | `reason`: `invalid_api_key`, `token_expired`, `forbidden` | Kiểm tra lại API key hoặc quyền truy cập |
| `NetworkError` | `InsuranceSDKError` | Không kết nối được, hoặc hết số lần thử lại | `attempts`, `cause` | Thử lại sau, hoặc đưa vào hàng đợi |
| `TimeoutError` | `NetworkError` | Một lần thử vượt `timeout` | `timeoutMs` | Cân nhắc nâng `timeout` |
| `ApiError` | `InsuranceSDKError` | Các lỗi HTTP còn lại | `status`, `retryable` | Xử lý theo `status` |

Vì `TimeoutError` kế thừa `NetworkError`, một nhánh `catch` bắt `NetworkError` là đủ cho cả hai.

## Phụ lục C: Quy tắc validate phía client

Đây là các quy tắc cài trong `packages/sdk/src/validation.ts`, chạy trước khi phát sinh bất kỳ request nào.

**`claims.create`**

| Field | Quy tắc | Thông báo khi sai |
|---|---|---|
| `policyId` | bắt buộc, khớp `^POL-\d+$` | `required`, `must match POL-<digits>` |
| `claimType` | bắt buộc, thuộc `CLAIM_TYPES` | `required`, `must be one of OUTPATIENT, INPATIENT, DENTAL, MATERNITY` |
| `diagnosisCode` | bắt buộc, khớp `^[A-Z]\d{2}(\.\d{1,4})?$` | `required`, `must be a valid ICD-10 code` |
| `treatmentDate` | bắt buộc, `YYYY-MM-DD` hợp lệ, không ở tương lai | `required`, `must be a valid YYYY-MM-DD date`, `must not be in the future` |
| `amount` | bắt buộc, là số, lớn hơn 0, tối đa 2 chữ số thập phân | `required`, `must be a number`, `must be positive`, `must have at most 2 decimal places` |
| `currency` | bắt buộc, thuộc `CURRENCIES` | `required`, `must be one of THB, VND, USD, SGD, MYR, IDR, PHP` |

**`documents.upload`**

| Field | Quy tắc | Thông báo khi sai |
|---|---|---|
| `type` | thuộc `DOCUMENT_TYPES` | `must be one of medical_receipt, discharge_summary, prescription, lab_result, id_document, other` |
| `file` | không rỗng, tối đa 10MB, đuôi thuộc `.pdf`, `.jpg`, `.jpeg`, `.png` | `must not be empty`, `must not exceed 10MB`, `must be one of .pdf, .jpg, .jpeg, .png` |

Riêng nội dung file thì client không kiểm tra: SDK không đọc byte trước khi gửi. Việc đối chiếu magic bytes với content type được khai do server làm, và trả về cùng dạng `ValidationError` để đối tác chỉ cần một nhánh `catch`.

Mọi lỗi của cùng một lời gọi được gom vào **một** `ValidationError` duy nhất, nên người dùng thấy hết vấn đề trong một lần thay vì sửa từng cái một.

Các hằng `CLAIM_TYPES`, `CURRENCIES` và `DOCUMENT_TYPES` được export từ `@insurance/sdk` để bạn dựng dropdown mà không phải chép tay danh sách.
