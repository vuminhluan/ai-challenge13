# Tổng thể các thành phần

Sequence diagram trong thư mục này mô tả thứ tự theo thời gian. Sơ đồ dưới đây bổ sung phần còn thiếu: các lớp có những gì và phụ thuộc vào nhau ra sao.

```mermaid
graph TD
    Partner["Ứng dụng đối tác"]

    subgraph SDK["packages/sdk — không có runtime dependency"]
        Client["InsuranceSDK<br/>client.ts"]
        Claims["ClaimsResource<br/>resources/claims.ts"]
        Docs["DocumentsResource<br/>resources/documents.ts"]
        Watcher["watchClaimStatus<br/>status-watcher.ts"]
        Validation["validateCreateClaim, validateUpload<br/>validation.ts"]
        Pipeline["RequestPipeline<br/>core/pipeline.ts"]
        Auth["AuthManager<br/>core/auth.ts"]
        Retry["isRetryableStatus, computeDelayMs<br/>core/retry.ts"]
        Multipart["buildMultipart<br/>core/multipart.ts"]
        Transport["NodeHttpTransport<br/>core/transport.ts"]
        Clock["Clock<br/>core/clock.ts"]
        Errors["Cây lỗi<br/>errors.ts"]
    end

    subgraph Server["packages/mock-server"]
        Chaos["chaos.ts<br/>delay, 503 ngẫu nhiên, hook ép status"]
        Router["router.ts<br/>khớp route, xác thực JWT"]
        Handlers["handlers/<br/>auth, claims, documents"]
        FileContent["file-content.ts<br/>magic bytes + hàm quét mockup"]
        Lifecycle["lifecycle.ts<br/>tính trạng thái theo tuổi claim"]
        Store["store.ts<br/>Map trong bộ nhớ"]
    end

    Partner --> Client
    Client --> Claims
    Client --> Docs
    Claims --> Watcher
    Claims --> Validation
    Docs --> Validation
    Docs --> Multipart
    Claims --> Pipeline
    Docs --> Pipeline
    Watcher --> Claims
    Pipeline --> Auth
    Pipeline --> Retry
    Pipeline --> Transport
    Pipeline --> Errors
    Auth --> Clock
    Pipeline --> Clock
    Watcher --> Clock
    Transport -->|HTTP| Chaos
    Chaos --> Router
    Router --> Handlers
    Handlers --> FileContent
    Handlers --> Lifecycle
    Handlers --> Store
```

## Đọc gì từ sơ đồ này

- **Mọi request đều đi qua đúng một chỗ.** `RequestPipeline` là nơi duy nhất biết về token, retry, idempotency và map lỗi. Resource chỉ lo dựng request và kiểm tra dữ liệu, `Transport` chỉ lo gửi byte.
- **`Clock` được ba nơi dùng chung.** Nhờ inject được nó, test kiểm tra backoff và polling mà không phải chờ thật một giây nào.
- **`Transport` là ranh giới thay thế được.** Unit test cắm `FakeTransport` vào đây để dựng 503, lỗi mạng hay token hết hạn một cách chính xác.
- **Chaos nằm trước router.** Vì thế một response 503 không bao giờ để lại tác dụng phụ, và retry của client luôn an toàn.
