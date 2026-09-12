# Insurance Partner Integration SDK

SDK TypeScript giúp đối tác bảo hiểm (bệnh viện, môi giới, doanh nghiệp) nhúng chức năng nộp hồ sơ bồi thường vào ứng dụng của mình: tạo claim, upload tài liệu kèm tiến độ, và theo dõi trạng thái. Repo gồm cả một mock API server để chạy thử ngay, không cần backend thật. Yêu cầu Node.js 20 trở lên.

## Quickstart trong 5 phút

```bash
pnpm install
pnpm build              # SDK build ra dist, examples import từ đó
pnpm mock-server        # terminal 1
pnpm example:1          # terminal 2
```

API key của môi trường sandbox là bất kỳ chuỗi nào bắt đầu bằng `pk_test_`, ví dụ `pk_test_demo`.

Tạo claim đầu tiên:

```ts
import { InsuranceSDK } from '@insurance/sdk';

const sdk = new InsuranceSDK({ apiKey: 'pk_test_demo', environment: 'sandbox' });

const claim = await sdk.claims.create({
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
});
console.log(claim.id, claim.status); // CLM-000001 PENDING
```

SDK tự lo phần xác thực: bạn không cần gọi endpoint token, không cần lưu JWT, không cần theo dõi hạn token.

## Cấu hình

| Tuỳ chọn | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `apiKey` | `string` | bắt buộc | API key của đối tác. Sandbox dùng tiền tố `pk_test_` |
| `environment` | `'sandbox' \| 'production'` | `'sandbox'` | Quyết định URL API |
| `timeout` | `number` | `30000` | Timeout tính cho **mỗi lần thử**, đơn vị ms |
| `maxRetries` | `number` | `3` | Số lần thử lại tối đa, tức tối đa 4 lần gửi |
| `baseUrl` | `string` | theo `environment` | Ghi đè URL, tiện khi chạy mock server ở cổng khác |
| `defaultHeaders` | `Record<string, string>` | `{}` | Header gắn vào mọi request |
| `logger` | `{ debug(msg, meta?) }` | không có | Nhận log debug về refresh token và backoff. Token không bao giờ bị ghi ra |

## Xử lý lỗi

```ts
import { ApiError, AuthError, NetworkError, ValidationError } from '@insurance/sdk';

try {
  await sdk.claims.create(input);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.fields); // { policyId: 'required', amount: 'must be positive' }
  } else if (error instanceof AuthError) {
    console.log('Cần xác thực lại:', error.reason);
  } else if (error instanceof NetworkError) {
    console.log(`Thử lại sau, đã thử ${error.attempts} lần`);
  } else if (error instanceof ApiError) {
    console.log(error.status, error.code);
  }
}
```

| Lỗi | Sinh ra khi | Thuộc tính riêng |
|---|---|---|
| `ValidationError` | Client tự bắt được dữ liệu sai (`code: 'CLIENT_VALIDATION'`), hoặc server trả 400 (`code: 'VALIDATION_ERROR'`) | `fields` |
| `AuthError` | API key sai, token hết hạn không cứu được, hoặc 403 | `reason` |
| `NetworkError` | Không kết nối được, hoặc đã hết số lần thử lại | `attempts`, `cause` |
| `TimeoutError` | Một lần thử vượt `timeout`. Là lớp con của `NetworkError` | `timeoutMs` |
| `ApiError` | Các lỗi HTTP còn lại: 404, 409, 413, 5xx | `status`, `retryable` |

Mọi lỗi đều kế thừa `InsuranceSDKError` và có `code`, phần lớn có thêm `requestId` để đối chiếu log với bên vận hành API.

## Retry hoạt động ra sao

Mock server cố tình trả 503 cho khoảng 10% request. SDK tự thử lại mà đối tác không phải viết dòng nào.

- **Thử lại với:** 429, 502, 503, 504, lỗi socket (`ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`), và timeout của một lần thử.
- **Không thử lại với:** 400, 403, 404, 409, 413, 422. Thử lại cũng không đổi kết quả.
- **401 đi đường riêng:** refresh token rồi gửi lại đúng một lần.
- **Công thức chờ (full jitter):** `random(0, min(8000, 250 × 2^attempt))`. Với `maxRetries: 3`, ba khoảng chờ nằm trong 0–250ms, 0–500ms và 0–1000ms.
- **Tôn trọng `Retry-After`:** nếu server có gửi, SDK chờ đúng khoảng đó cộng thêm 0–250ms ngẫu nhiên, để nhiều client không cùng thức dậy một lúc.

Phần ngẫu nhiên là điểm quan trọng nhất. Backoff cố định khiến mọi client cùng thử lại đúng một nhịp và dồn tải vào server đang yếu.

**Idempotency.** Mỗi lời gọi `create` hoặc `upload` được gắn một `Idempotency-Key` (UUID) và key đó giữ nguyên qua mọi lần thử lại. Nếu request đầu đã tới server rồi mới rớt kết nối, lần thử sau nhận lại đúng claim cũ chứ không tạo bản trùng. Bạn cũng có thể tự đặt key qua `options.idempotencyKey`.

## Tự động refresh token

- Token được coi là hết hạn **sớm hơn 60 giây** so với `exp` thật, nên không bao giờ gửi đi một token sắp chết.
- Nhiều request song song gặp lúc token hết hạn chỉ tạo **một** lần gọi endpoint token, không phải mỗi request một lần.
- Nếu vẫn gặp 401 `TOKEN_EXPIRED` (lệch đồng hồ, server restart, request bay lâu), SDK làm mới token và gửi lại **đúng một lần**. 401 lần nữa thì ném `AuthError` chứ không lặp vô hạn.
- API key sai thì ném `AuthError` ngay, không thử lại.

## Theo dõi trạng thái

```ts
const stop = sdk.claims.onStatusChange(claim.id, (status, updated) => {
  console.log(`${updated.id} chuyển sang ${status}`);
  if (status === 'APPROVED' || status === 'REJECTED') stop();
});
```

> **Luôn giữ và gọi hàm unsubscribe.** Vòng poll là một timer đang hoạt động, mà timer đang hoạt động giữ event loop của Node sống. Bỏ quên nó thì script không bao giờ thoát, còn server dài hạn sẽ tích luỹ vô hạn vòng poll. Watcher tự dừng khi claim vào trạng thái cuối và khi vượt `maxDurationMs` (mặc định 5 phút), nhưng hàm dừng vẫn là cách duy nhất để huỷ giữa chừng.

## Giới hạn đã biết

1. **Stream thô không được thử lại.** Khi truyền `{ stream, size, filename }`, SDK tắt retry cho request đó vì stream đã đọc thì không tua lại được, và gửi một file cụt còn tệ hơn báo lỗi. Cần retry thì truyền `Buffer` hoặc đường dẫn file.
2. **Progress quay về 0 khi thử lại.** Nếu một lần upload bị 503 và SDK gửi lại, `onProgress` bắt đầu lại từ 0%. Thanh progress trên giao diện nên chấp nhận việc phần trăm tụt về 0.
3. **Quét file sâu là hàm giả.** Mock server đối chiếu magic bytes thật, nhưng hàm quét sâu luôn trả về hợp lệ. Xem mục [Kiểm tra file phía server](#kiểm-tra-file-phía-server).

## Kiểm tra file phía server

Header `Content-Type` trong phần multipart là do client tự khai, nên tự nó không đáng tin: đổi tên `note.txt` thành `receipt.pdf` rồi khai `application/pdf` là qua được mọi kiểm tra dựa trên tên và header. Mock server vì vậy kiểm tra theo hai tầng, đặt trong [`packages/mock-server/src/file-content.ts`](packages/mock-server/src/file-content.ts):

| Tầng | Hàm | Thật hay mockup | Làm gì |
|---|---|---|---|
| 1 | `matchesDeclaredType(head, contentType)` | **kiểm tra thật** | Đối chiếu magic bytes 8 byte đầu file với content type được khai: `%PDF-` cho PDF, `FF D8 FF` cho JPEG, `89 50 4E 47 0D 0A 1A 0A` cho PNG. Sai thì trả 400 với `fields.file = 'content does not match declared type ...'` |
| 2 | `scanFileContent(head, contentType)` | **MOCKUP, luôn trả `{ ok: true }`** | Không kiểm tra gì cả |

> **Nói rõ về tầng 2:** `scanFileContent` là hàm giả, luôn cho qua. Nó tồn tại để lộ ra đúng vị trí mà hệ thống thật sẽ cắm vào: quét virus, kiểm tra cấu trúc PDF có đọc được không, phát hiện ảnh trắng hoặc ảnh chụp màn hình giả mạo, đối chiếu OCR với số tiền trên claim. Mock server không làm những việc đó và không nên được coi là đã bảo vệ trước file độc hại.

Những thứ **vẫn chưa** được kiểm tra, kể cả ở tầng 1: nội dung sau 8 byte đầu (một file PDF hợp lệ ở phần đầu nhưng hỏng ở giữa vẫn qua), sự khớp giữa đuôi file và nội dung (server chỉ soi content type được khai; phần đuôi file do SDK kiểm ở client), và mọi thứ liên quan tới ý nghĩa nghiệp vụ của tài liệu.

File mẫu `examples/fixtures/receipt.pdf` là một PDF 1.4 hợp lệ thật, có bảng `xref`, page tree và một trang A4 mở được bằng Preview. Nó cố tình được viết bằng ASCII thuần để đọc và so sánh diff trực tiếp trong git.

## Mock server

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `4000` | Cổng lắng nghe |
| `TOKEN_TTL_SECONDS` | `3600` | Hạn của JWT. Đặt nhỏ để xem refresh hoạt động |
| `FAILURE_RATE` | `0.1` | Tỉ lệ request bị trả 503 |
| `MIN_DELAY_MS` | `200` | Độ trễ tối thiểu |
| `MAX_DELAY_MS` | `500` | Độ trễ tối đa |
| `LIFECYCLE_REVIEW_MS` | `5000` | Sau bao lâu claim chuyển sang `IN_REVIEW` |
| `LIFECYCLE_DECISION_MS` | `10000` | Sau bao lâu có quyết định cuối |
| `LIFECYCLE_REJECT_ABOVE` | `100000` | Claim vượt ngưỡng này thì bị `REJECTED` |

Ví dụ chạy nhanh để xem vòng đời claim: `LIFECYCLE_REVIEW_MS=1000 LIFECYCLE_DECISION_MS=2000 pnpm mock-server`.

Server còn nhận header chỉ dùng cho test: `x-mock-force-status: 503,503` kèm `x-mock-scenario: <id duy nhất>` để ép các response đầu tiên hỏng theo ý muốn.

## Lệnh phát triển

```bash
pnpm test                    # chạy toàn bộ test
pnpm vitest run --coverage   # test kèm báo cáo coverage
pnpm build                   # build SDK ra dist (ESM + CJS + .d.ts)
pnpm mock-server             # chạy mock API
pnpm example:1               # nộp claim đơn giản
pnpm example:2               # nộp claim kèm upload có thanh tiến độ
pnpm example:3               # theo dõi trạng thái tới khi có quyết định
```

## Cấu trúc repo

```
packages/sdk/           SDK, không có runtime dependency nào
packages/mock-server/   Mock API dựng trên node:http, chỉ dùng busboy để parse multipart
examples/               Ba script tích hợp chạy được ngay
docs/api-reference.md   Tài liệu tham chiếu đầy đủ
```

Tài liệu chi tiết từng phương thức: [docs/api-reference.md](docs/api-reference.md).
