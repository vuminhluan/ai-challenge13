# Thiết kế: Insurance Partner Integration SDK

- Ngày: 2026-09-12
- Trạng thái: đã duyệt, sẵn sàng lập kế hoạch triển khai
- Nguồn yêu cầu: `AI_Engineering_Challenges/AI_Challenge_13.md`

## 1. Mục tiêu

Xây dựng một SDK TypeScript để các đối tác bảo hiểm (bệnh viện, môi giới, doanh nghiệp) nhúng chức năng nộp hồ sơ bồi thường vào ứng dụng của họ, kèm một mock API server để chạy thử. Đối tác tích hợp được trong vài phút thay vì vài ngày.

Tiêu chí thành công:

1. Cả ba example chạy thông suốt end-to-end với mock server.
2. Validation phía client chặn dữ liệu sai trước khi phát sinh request.
3. Retry xử lý được lỗi 503 ngẫu nhiên của mock server.
4. Type chính xác, autocomplete hữu ích, không dùng `any`.
5. Tài liệu đủ để một lập trình viên tự tích hợp mà không cần hỏi thêm.
6. Test phủ các luồng chính và các nhánh lỗi.

## 2. Các quyết định nền tảng

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Runtime | Chỉ Node.js | Vừa với khung thời gian; `file` nhận Buffer, đường dẫn hoặc stream; examples chạy trực tiếp |
| Repo | Monorepo pnpm | Tách bạch package đối tác cài với mock server |
| Mock server | `node:http` thuần, một dependency là busboy | Không giấu logic HTTP sau framework |
| Định dạng upload | `multipart/form-data` | Chuẩn công nghiệp, API trông như thật |
| Theo dõi trạng thái | Server tự chuyển trạng thái, SDK polling | Đúng với bảng endpoint của đề, không cần thêm kênh push |
| An toàn khi retry | Header `Idempotency-Key` | Retry `POST` không tạo bản ghi trùng |
| Validation | Tự viết, SDK không có runtime dependency | Interface viết tay cho hover đẹp; server validate độc lập |
| Kiến trúc SDK | Chia lớp, transport thay được khi test | Luồng lỗi test được một cách deterministic |

## 3. Cấu trúc repo

```
ai-challenge13/
├─ packages/
│  ├─ sdk/
│  │  ├─ src/
│  │  │  ├─ index.ts                 # export công khai
│  │  │  ├─ client.ts                # class InsuranceSDK
│  │  │  ├─ config.ts                # resolve config, map environment sang baseUrl
│  │  │  ├─ errors.ts                # cây lỗi
│  │  │  ├─ types.ts                 # type công khai
│  │  │  ├─ validation.ts            # validator phía client
│  │  │  ├─ core/
│  │  │  │  ├─ transport.ts          # interface Transport + bản dựng trên node:http
│  │  │  │  ├─ pipeline.ts           # RequestPipeline: timeout, idempotency, retry, map lỗi
│  │  │  │  ├─ auth.ts               # AuthManager
│  │  │  │  ├─ retry.ts              # phân loại lỗi + tính backoff
│  │  │  │  └─ multipart.ts          # dựng body multipart, đếm byte
│  │  │  ├─ resources/
│  │  │  │  ├─ claims.ts
│  │  │  │  └─ documents.ts
│  │  │  └─ status-watcher.ts
│  │  └─ test/
│  └─ mock-server/
│     ├─ src/
│     │  ├─ server.ts, router.ts, jwt.ts, store.ts,
│     │  ├─ validation.ts, chaos.ts, lifecycle.ts
│     │  └─ handlers/{auth,claims,documents}.ts
│     └─ test/
├─ examples/
│  ├─ 01-simple-claim.ts
│  ├─ 02-claim-with-document.ts
│  ├─ 03-poll-status.ts
│  └─ fixtures/receipt.pdf
├─ docs/api-reference.md
└─ README.md
```

Công cụ: TypeScript ở chế độ `strict` kèm `noUncheckedIndexedAccess`, build bằng tsup (ESM + CJS + `.d.ts`), test bằng Vitest, chạy script bằng tsx.

## 4. Mock server

### 4.1 Endpoint

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/auth/token` | Đổi API key lấy JWT, mặc định hạn 1 giờ |
| POST | `/api/v1/claims` | Tạo claim |
| GET | `/api/v1/claims/:id` | Lấy chi tiết và trạng thái claim |
| GET | `/api/v1/claims` | Liệt kê claim, có phân trang và lọc theo trạng thái |
| POST | `/api/v1/claims/:id/documents` | Upload tài liệu |
| GET | `/api/v1/claims/:id/documents` | Liệt kê tài liệu của claim |

### 4.2 Xác thực

- `POST /auth/token` nhận `{ apiKey }`. Key hợp lệ có tiền tố `pk_test_`.
- JWT ký HS256 bằng `node:crypto`, không dùng thư viện ngoài.
- TTL mặc định 3600 giây, chỉnh qua `TOKEN_TTL_SECONDS` để demo refresh.
- Response: `{ accessToken, tokenType: 'Bearer', expiresIn, expiresAt }`.
- Thiếu token trả 401 `UNAUTHORIZED`; token hết hạn hoặc sai chữ ký trả 401 `TOKEN_EXPIRED`; API key sai trả 401 `INVALID_API_KEY`.

### 4.3 Định dạng lỗi

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "policyId": "required" }, "requestId": "req_..." } }
```

### 4.4 Chaos

Chạy trước handler nên phản hồi 503 không để lại tác dụng phụ.

- Delay ngẫu nhiên 200–500ms.
- 10% request trả 503 kèm header `Retry-After`.
- Biến môi trường: `FAILURE_RATE`, `MIN_DELAY_MS`, `MAX_DELAY_MS`.
- Hook chỉ dành cho test: header `x-mock-force-status: 503,503` ép các response đầu tiên theo danh sách rồi trở lại bình thường.

### 4.5 Lưu trữ

- `Map` trong bộ nhớ cho claims, documents và idempotency key.
- Mỗi claim thuộc về một API key; `list` chỉ trả claim của đối tác đó.
- Idempotency: cùng key và cùng body thì trả lại response đã lưu; cùng key nhưng khác body thì trả 409 `IDEMPOTENCY_KEY_REUSED`.
- ID dạng `CLM-000001`, `DOC-000001`.

### 4.6 Vòng đời claim

`PENDING → IN_REVIEW → APPROVED | REJECTED`

- Trạng thái được tính lúc đọc dựa trên `createdAt`, không dùng timer, không cần dọn dẹp, test được bằng cách inject clock.
- Mặc định: 5 giây sang `IN_REVIEW`, 10 giây ra kết quả cuối. Chỉnh qua `LIFECYCLE_REVIEW_MS`, `LIFECYCLE_DECISION_MS`.
- Kết quả cuối theo quy tắc cố định để example dễ đoán: `amount > 100000` thì `REJECTED`, còn lại `APPROVED`.
- Response kèm `statusHistory`.

### 4.7 Quy tắc validate

Claim:

| Field | Quy tắc |
|---|---|
| `policyId` | bắt buộc, khớp `^POL-\d+$` |
| `claimType` | bắt buộc, thuộc `OUTPATIENT \| INPATIENT \| DENTAL \| MATERNITY` |
| `diagnosisCode` | bắt buộc, ICD-10, khớp `^[A-Z]\d{2}(\.\d{1,4})?$` |
| `treatmentDate` | bắt buộc, `YYYY-MM-DD` hợp lệ, không ở tương lai |
| `amount` | bắt buộc, lớn hơn 0, tối đa 2 chữ số thập phân |
| `currency` | bắt buộc, mã ISO 4217 (THB, VND, USD, SGD…) |

Document: `type` thuộc `medical_receipt | discharge_summary | prescription | lab_result | id_document | other`; chỉ nhận pdf, jpeg, png; tối đa 10MB, vượt quá trả 413; claim không tồn tại trả 404.

List: `page` từ 1, `pageSize` tối đa 100, trả `{ data, pagination: { page, pageSize, total, totalPages } }`.

## 5. API công khai của SDK

```ts
const sdk = new InsuranceSDK({
  apiKey: 'pk_test_xxx',
  environment: 'sandbox',   // mặc định 'sandbox'
  timeout: 30000,           // mặc định 30s, áp cho mỗi lần thử
  maxRetries: 3,            // mặc định 3
  baseUrl,                  // tuỳ chọn, ghi đè environment
  logger,                   // tuỳ chọn
});

const claim = await sdk.claims.create(input, { idempotencyKey?, signal? });
const claim = await sdk.claims.get('CLM-000001');
const page  = await sdk.claims.list({ status: 'PENDING', page: 1, pageSize: 20 });

const doc  = await sdk.documents.upload(claimId, file, {
  type: 'medical_receipt',
  onProgress: (percent, { bytesSent, totalBytes }) => {},
});
const docs = await sdk.documents.list(claimId);

const unsubscribe = sdk.claims.onStatusChange(claimId, (newStatus, claim) => {}, {
  intervalMs: 2000,        // mặc định 2s
  maxDurationMs: 300000,   // mặc định 5 phút
  onError: (err) => {},
});
```

`environment` ánh xạ: `sandbox` sang `http://localhost:4000`, `production` sang URL giả. `baseUrl` ghi đè cả hai.

`file` nhận một trong ba dạng: `Buffer`, đường dẫn file, hoặc `{ stream, size, filename }`.

`onProgress` nhận hai tham số: phần trăm theo đúng yêu cầu đề bài, và một object chi tiết byte cho ai cần.

`onStatusChange` trả về hàm unsubscribe. Đây là yêu cầu bắt buộc chứ không phải tiện ích: vòng poll là một timer đang hoạt động, mà timer đang hoạt động giữ event loop của Node sống, nên không có cách dừng thì script không bao giờ thoát và server dài hạn sẽ tích luỹ vô hạn vòng poll. Ba lớp bảo vệ: hàm unsubscribe clear timer và abort request đang chờ (gọi nhiều lần vẫn an toàn); watcher tự dừng khi claim vào trạng thái cuối; và `maxDurationMs` chặn trường hợp trạng thái kẹt. Timer dùng `setTimeout` đệ quy chứ không `setInterval`, để hai lần poll không chồng lên nhau khi một request bị chậm.

### 5.1 Cây lỗi

```
InsuranceSDKError                    message, code, requestId?
├─ ValidationError    fields: Record<string, string>
├─ AuthError          reason: 'invalid_api_key' | 'token_expired' | 'forbidden'
├─ NetworkError       cause, attempts
│  └─ TimeoutError    timeoutMs
└─ ApiError           status, code, retryable
```

`ValidationError` dùng chung cho cả lỗi client-side và 400 từ server, phân biệt bằng `code`: `CLIENT_VALIDATION` hay `VALIDATION_ERROR`. Đối tác chỉ cần một nhánh `catch` cho cùng một loại vấn đề.

`TimeoutError` là lớp con của `NetworkError` nên `error instanceof NetworkError` vẫn bắt được timeout, đồng thời ai cần phân biệt vẫn phân biệt được.

Map lỗi: 400 sang `ValidationError`; 401 và 403 sang `AuthError`; các mã 4xx khác và 5xx còn lại sang `ApiError`; lỗi tầng socket hoặc hết retry sang `NetworkError`.

## 6. Cơ chế bên trong

### 6.1 Thứ tự xử lý một request

```
resource.create(input)
 1. Validate phía client        → ValidationError, không phát sinh request nào
 2. Dựng request                → path, query, headers, body factory
 3. Gắn Idempotency-Key         → crypto.randomUUID(), giữ nguyên qua mọi lần thử
 4. Vòng lặp thử (tối đa 1 + maxRetries lần):
      a. token = await auth.getToken()
      b. transport.send(req, AbortSignal.any([signal người dùng, signal timeout]))
      c. phân loại: thành công | đáng retry | cần refresh token | lỗi dừng hẳn
 5. Map sang lỗi có kiểu
```

Validation chạy trước bước 2, nên `create({})` ném `ValidationError` mà không gọi HTTP lần nào. Test khẳng định điều này bằng cách kiểm tra transport không được gọi.

### 6.2 AuthManager

- Refresh chủ động: token bị coi là hết hạn sớm hơn 60 giây so với `exp`.
- Gộp refresh đồng thời: giữ một `inflight: Promise<Token> | null`; nhiều request song song chỉ tạo một lần gọi `POST /auth/token`.
- Refresh bị động: gặp 401 `TOKEN_EXPIRED` thì vô hiệu token, refresh, gửi lại request đúng một lần, có cờ `authRetried`. Cần thiết vì ba tình huống mà refresh chủ động không phủ được: lệch đồng hồ giữa client và server; token bị vô hiệu từ phía server (mock server restart là sinh lại khoá HMAC); và request bay lâu hơn dự kiến do backoff hoặc upload file lớn.
- Cờ `authRetried` là bắt buộc. Không có nó, khi server luôn trả 401 (API key bị thu hồi) sẽ thành vòng lặp vô hạn không có backoff: gửi, 401, refresh, gửi lại, 401… lời gọi không bao giờ trả về và server nhận hàng trăm request mỗi giây.
- `invalidate` nhận epoch. AuthManager giữ bộ đếm `epoch` tăng sau mỗi lần refresh thành công, mỗi request nhớ epoch của token mình dùng, và `invalidate(epoch)` chỉ xoá khi epoch khớp epoch hiện tại. Không có chi tiết này thì N request cùng gặp 401 sẽ tạo chuỗi refresh dây chuyền, mỗi request vứt bỏ token mà request trước vừa lấy. Có epoch thì N request chỉ tốn một lần refresh.
- Lần gửi lại giữ nguyên `Idempotency-Key` của lần đầu.
- API key sai ném `AuthError` ngay, không retry.
- Bản thân lời gọi lấy token cũng đi qua retry policy.
- Token không bao giờ vào log; logger chỉ thấy `Bearer ***`.

### 6.3 Retry và backoff

| Tình huống | Xử lý |
|---|---|
| 502, 503, 504, 429 | Retry, ưu tiên `Retry-After` nếu có |
| Lỗi socket (`ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`) | Retry |
| Timeout của một lần thử | Retry |
| 400, 403, 404, 409, 413, 422 | Không retry |
| 401 | Không retry, đi đường refresh token |

Công thức full jitter: `delay = random(0, min(8000, 250 × 2^attempt))`.

Với `maxRetries: 3`, các khoảng chờ là ngẫu nhiên trong 0–250ms, 0–500ms, 0–1000ms. Tổng chờ xấu nhất 1.75 giây, trung bình khoảng 0.9 giây.

Ngẫu nhiên là phần quan trọng nhất, không phải phần nhân đôi. Khi nhiều đối tác cùng gặp 503 một lúc, backoff cố định khiến tất cả thức dậy cùng thời điểm và lặp lại đúng một nhịp, tức thundering herd; nhân đôi chỉ giãn khoảng cách theo thời gian chứ không phá được sự đồng pha. Chọn `random(0, cap)` thay vì `random(cap/2, cap)` vì phân bố rộng hơn nên rải tải tốt hơn; cái giá là thỉnh thoảng có một lần thử lại hơi sớm, không đáng kể ở tỉ lệ hỏng 10%.

Khi server trả `Retry-After`, khoảng chờ là `retryAfterMs + random(0, 250)`; phần ngẫu nhiên nhỏ này tránh việc mọi client cùng thức dậy tại đúng mốc giây mà server chỉ định.

Hàm sleep giữa các lần thử lắng nghe abort signal, nên huỷ có tác dụng ngay chứ không phải chờ hết backoff. Khi hết retry, lỗi ném ra mang theo `attempts`.

### 6.4 Luồng upload

File đầu vào được chuẩn hoá thành body factory thay vì một stream có sẵn, vì đây là điều kiện để retry hoạt động:

| Đầu vào | Kích thước lấy từ | Retry |
|---|---|---|
| `Buffer` | `buffer.length` | Có, dựng lại body từ buffer |
| Đường dẫn file | `fs.stat` | Có, `createReadStream` mới mỗi lần thử |
| `{ stream, size, filename }` | do người gọi cung cấp | Không, stream đã đọc không tua lại được |

Với stream thô, SDK tắt retry cho request đó và ghi rõ trong tài liệu: báo lỗi trung thực tốt hơn âm thầm gửi lên một file bị cụt.

SDK tự dựng multipart nên tính được `Content-Length` chính xác bằng tổng phần header, kích thước file và phần đóng. Có `Content-Length` mới có `totalBytes`, có `totalBytes` mới tính được phần trăm.

Progress đo theo số byte đã ghi ra socket, dùng callback của `req.write` cùng sự kiện `drain`. Ba quy tắc: luôn phát 0% lúc bắt đầu và 100% khi hoàn tất; không phát trùng một con số phần trăm; nếu request bị thử lại thì progress quay về 0 cho lần thử mới, và README ghi rõ điều này vì đối tác vẽ thanh progress cần biết.

Validation phía client cho upload chạy trước khi mở file: `type` thuộc enum, đuôi file nằm trong pdf/jpg/png, kích thước không quá 10MB.

## 7. Chiến lược test

### 7.1 Unit test với `FakeTransport` (~32 test)

Không chạm mạng, không dùng timer thật. Ba thứ được inject để kết quả ổn định: `transport`, `clock` (thời gian và sleep), `random` (cho jitter).

| Nhóm | Số test | Nội dung |
|---|---|---|
| Validation phía client | 7 | Thiếu field gộp chung một lỗi; sai `policyId`, `diagnosisCode`, `treatmentDate` tương lai, `amount` âm; upload sai `type` hoặc quá 10MB. Mọi test khẳng định transport không được gọi |
| Luồng thành công | 6 | `create` gửi đúng body và header; `get`; `list` dựng đúng query string; map phân trang; `upload`; `documents.list` |
| Auth | 6 | Lần đầu tự lấy token; dùng lại token cache; refresh chủ động khi còn dưới 60s; nhiều request song song chỉ một lần gọi token; 401 dẫn tới refresh và gửi lại đúng một lần; 401 lần hai ném `AuthError`; API key sai không retry |
| Retry | 7 | 503 rồi thành công; hết retry ném lỗi kèm `attempts`; không retry 400 và 404; tôn trọng `Retry-After`; khoảng chờ đúng công thức với RNG đã inject; abort giữa lúc backoff; `Idempotency-Key` giữ nguyên qua các lần thử |
| Lỗi | 5 | 400 sang `ValidationError` có `fields`; 401 sang `AuthError`; 404 sang `ApiError`; `ECONNREFUSED` sang `NetworkError`; timeout sang `TimeoutError` và vẫn `instanceof NetworkError` |
| Upload | 4 | Progress tăng dần 0 tới 100 không lùi; cấu trúc multipart và `Content-Length` đúng; ba kiểu input; stream thô không retry |
| StatusWatcher | 5 | Chỉ gọi callback khi status đổi thật; tự dừng ở trạng thái cuối; `unsubscribe` clear timer và abort; lỗi vào `onError`; dừng khi quá `maxDurationMs` |

### 7.2 Integration test với mock server thật (~6 test)

Server khởi động trong `beforeAll` ở cổng ngẫu nhiên, `FAILURE_RATE=0`, mốc vòng đời rút xuống mili-giây. Test retry dùng header `x-mock-force-status: 503,503` để ép hai request đầu hỏng, nên deterministic thay vì trông chờ tỉ lệ 10%.

Tổng khoảng 38 test, vượt yêu cầu 20. Ngưỡng coverage 85% cho `packages/sdk/src`.

## 8. Tài liệu và example

- **README.md**: quickstart trong 5 phút (cài đặt, chạy mock server, lấy API key, tạo claim đầu tiên, bắt lỗi); giải thích retry và auto-refresh; mục giới hạn đã biết nêu rõ stream thô không retry và progress quay về 0 khi thử lại.
- **docs/api-reference.md**: mọi phương thức công khai kèm chữ ký, bảng tham số, giá trị trả về, các lỗi có thể ném, và một đoạn code chạy được.
- **Ba example** chạy bằng `pnpm example:1|2|3`: nộp claim đơn giản; nộp claim kèm upload có thanh progress; theo dõi trạng thái tới kết quả cuối. Cả ba chạy với `FAILURE_RATE` mặc định 10% để chứng minh retry hoạt động thật.

## 9. Timeline

| Giai đoạn | Thời gian |
|---|---|
| Brainstorm và lên kế hoạch | 1.5h |
| Implement logic | sẽ bổ sung |
| Chạy thử và kiểm thử | sẽ bổ sung |

Giai đoạn brainstorm và lên kế hoạch đã hoàn thành, gồm phân tích đề, chốt các quyết định nền tảng, thiết kế kiến trúc và viết spec này.

Hạng mục thuộc **Implement logic**: dựng monorepo và tooling; mock server đầy đủ endpoint kèm chaos và vòng đời; SDK core gồm transport, pipeline, auth, retry, errors, types, validation; resources, multipart kèm progress, StatusWatcher; README, API reference và ba example.

Hạng mục thuộc **Chạy thử và kiểm thử**: bộ unit test, bộ integration test, chạy ba example end-to-end với mock server và chỉnh sửa theo kết quả.

## 10. Nằm ngoài phạm vi

- Hỗ trợ trình duyệt và bundle cho web.
- Webhook hay Server-Sent Events cho cập nhật trạng thái.
- Cơ chế hết hạn hoặc lưu bền cho idempotency key ngoài bộ nhớ.
- Sửa, huỷ hay xoá claim.
- Rate limiting phía client.
