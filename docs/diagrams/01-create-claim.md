# Tạo claim — luồng thành công

```mermaid
sequenceDiagram
    autonumber
    actor Partner as Ứng dụng đối tác
    participant Claims as ClaimsResource
    participant Valid as validation.ts
    participant Pipe as RequestPipeline
    participant Auth as AuthManager
    participant Tr as NodeHttpTransport
    participant Srv as Mock server

    Partner->>Claims: create(input)
    Claims->>Valid: validateCreateClaim(input, now)
    Valid-->>Claims: không có lỗi

    Note over Claims,Valid: Nếu có lỗi thì ném ValidationError ngay tại đây<br/>và không phát sinh request HTTP nào

    Claims->>Pipe: execute(POST /api/v1/claims)
    Pipe->>Pipe: idempotencyKey = randomUUID()
    Pipe->>Auth: getToken()

    Note over Auth: Chưa có token trong cache

    Auth->>Tr: POST /api/v1/auth/token
    Tr->>Srv: apiKey = pk_test_demo
    Srv->>Srv: chaos delay 200-500ms
    Srv->>Srv: kiểm tra tiền tố pk_test_
    Srv->>Srv: ký JWT HS256, hạn 1 giờ
    Srv-->>Tr: 200 accessToken, expiresIn 3600
    Tr-->>Auth: token
    Auth->>Auth: cache token, epoch = 1
    Auth-->>Pipe: token epoch 1

    Pipe->>Tr: POST /api/v1/claims
    Note right of Pipe: headers gồm authorization Bearer,<br/>idempotency-key và defaultHeaders
    Tr->>Srv: body JSON
    Srv->>Srv: chaos delay, không hỏng lần này
    Srv->>Srv: xác minh JWT, lấy apiKey từ sub
    Srv->>Srv: tra Idempotency-Key, chưa từng thấy
    Srv->>Srv: validate body lần nữa phía server
    Srv->>Srv: store.createClaim, sinh CLM-000001
    Srv->>Srv: lưu response theo Idempotency-Key
    Srv-->>Tr: 201 Claim status PENDING
    Tr-->>Pipe: response thô
    Pipe->>Pipe: JSON.parse
    Pipe-->>Claims: Claim
    Claims-->>Partner: Claim
```

## Đọc gì từ sơ đồ này

- **Validation client chạy trước tất cả.** Bước 2 đứng trước cả bước lấy token. Đây là lý do `create({})` ném lỗi mà transport không được gọi lần nào, và cũng là điều test khẳng định bằng `expect(transport.requests).toHaveLength(0)`.
- **Đối tác không phải biết gì về token.** Toàn bộ đoạn từ bước 6 đến bước 13 là do SDK tự lo.
- **Validate hai lần là cố ý.** Client validate để phản hồi tức thì và tiết kiệm một vòng mạng; server validate vì backend mới là nguồn sự thật, và không bao giờ được tin dữ liệu do client gửi lên.
- **Idempotency-Key sinh một lần ở bước 5**, trước vòng lặp thử lại, nên mọi lần gửi lại đều mang đúng key đó.
