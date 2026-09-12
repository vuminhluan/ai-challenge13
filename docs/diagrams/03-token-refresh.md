# Xác thực và tự động refresh token

## Gộp nhiều lần refresh đồng thời thành một

```mermaid
sequenceDiagram
    autonumber
    participant R1 as Request 1
    participant R2 as Request 2
    participant R3 as Request 3
    participant Auth as AuthManager
    participant Tr as NodeHttpTransport
    participant Srv as Mock server

    Note over Auth: Cache rỗng, hoặc token còn dưới 60 giây

    R1->>Auth: getToken()
    Auth->>Auth: inflight đang rỗng, tạo promise mới
    Auth->>Tr: POST /api/v1/auth/token

    R2->>Auth: getToken()
    Auth-->>R2: trả lại chính promise inflight đó
    R3->>Auth: getToken()
    Auth-->>R3: trả lại chính promise inflight đó

    Tr->>Srv: apiKey
    Srv-->>Tr: 200 accessToken, expiresIn 3600
    Tr-->>Auth: token
    Auth->>Auth: epoch tăng lên 1, lưu cache, xoá inflight
    Auth-->>R1: token epoch 1
    Auth-->>R2: token epoch 1
    Auth-->>R3: token epoch 1

    Note over Auth,Srv: Ba request song song nhưng chỉ MỘT lần gọi endpoint token
```

## Token hết hạn giữa chừng, refresh bị động

```mermaid
sequenceDiagram
    autonumber
    participant Pipe as RequestPipeline
    participant Auth as AuthManager
    participant Tr as NodeHttpTransport
    participant Srv as Mock server

    Pipe->>Auth: getToken()
    Auth-->>Pipe: token A, epoch 1

    Note over Auth,Srv: SDK tưởng token còn hạn, nhưng server không nghĩ vậy:<br/>lệch đồng hồ, server restart nên đổi khoá HMAC,<br/>hoặc request bay lâu hơn dự kiến

    Pipe->>Tr: GET /api/v1/claims kèm token A
    Tr->>Srv: authorization Bearer token A
    Srv-->>Tr: 401 TOKEN_EXPIRED
    Tr-->>Pipe: 401

    Pipe->>Pipe: authRetried đang là false
    Pipe->>Auth: invalidate(epoch 1)
    Auth->>Auth: epoch khớp epoch hiện tại nên xoá cache

    Note over Auth: invalidate nhận epoch là có lý do.<br/>N request cùng gặp 401 sẽ gọi invalidate với epoch CŨ,<br/>nên không xoá nhầm token mà request đầu vừa lấy về

    Pipe->>Auth: getToken()
    Auth->>Tr: POST /api/v1/auth/token
    Tr->>Srv: apiKey
    Srv-->>Tr: 200 accessToken mới
    Tr-->>Auth: token B
    Auth->>Auth: epoch tăng lên 2
    Auth-->>Pipe: token B, epoch 2

    Pipe->>Tr: gửi lại CÙNG request, kèm token B
    Note right of Pipe: authRetried chuyển thành true,<br/>Idempotency-Key giữ nguyên như lần đầu
    Tr->>Srv: authorization Bearer token B
    Srv-->>Tr: 200
    Tr-->>Pipe: 200

    Note over Pipe: Nếu lại 401 lần nữa thì ném AuthError.<br/>Không có cờ authRetried, vòng lặp này chạy vô hạn<br/>khi API key bị thu hồi
```

## Đọc gì từ sơ đồ này

- **Refresh chủ động là tuyến phòng thủ thứ nhất.** Token bị coi là hết hạn sớm hơn 60 giây so với `exp` thật, nên bình thường chẳng bao giờ gửi đi token sắp chết.
- **Refresh bị động là tuyến thứ hai, và nó cần thiết.** Riêng việc mock server restart là đã sinh khoá HMAC mới, làm mọi token cũ thành chữ ký sai mà SDK không có cách nào biết trước.
- **Cờ `authRetried` chặn vòng lặp vô hạn.** Khi API key bị thu hồi và server luôn trả 401, không có cờ này thì lời gọi không bao giờ trả về còn server nhận hàng trăm request mỗi giây.
- **Sai API key thì khác hẳn.** Server trả 401 `INVALID_API_KEY` ngay ở bước đổi token, SDK ném `AuthError` luôn và không thử lại.
