# Upload tài liệu kèm tiến độ

```mermaid
sequenceDiagram
    autonumber
    actor Partner as Ứng dụng đối tác
    participant Docs as DocumentsResource
    participant Valid as validation.ts
    participant MP as buildMultipart
    participant Pipe as RequestPipeline
    participant Tr as NodeHttpTransport
    participant Srv as Mock server
    participant FC as file-content.ts

    Partner->>Docs: upload(claimId, file, type và onProgress)
    Docs->>Docs: resolveFileInput(file)

    Note over Docs: Buffer hoặc đường dẫn thì retryable = true.<br/>Stream thô thì retryable = false vì stream đã đọc không tua lại được

    Docs->>Valid: validateUpload(type, filename, size)
    Valid-->>Docs: không có lỗi
    Note over Docs,Valid: Kiểm tra trước khi mở file:<br/>type thuộc enum, đuôi thuộc pdf jpg jpeg png, kích thước 1 tới 10MB

    Docs->>MP: buildMultipart(fields, file)
    MP-->>Docs: contentLength đã biết chính xác
    Note over MP: Biết trước độ dài mới tính được phần trăm

    Docs->>Pipe: execute(POST documents, body stream, retryable)
    Pipe->>Tr: send request

    Tr->>Partner: onProgress(0 phần trăm)
    loop mỗi chunk ghi được ra socket
        Tr->>Srv: chunk
        Tr->>Tr: bytesSent cộng dồn, tính phần trăm
        Tr->>Partner: onProgress(phần trăm) nếu con số thay đổi
    end
    Tr->>Partner: onProgress(100 phần trăm)

    Srv->>Srv: chaos delay, xác minh JWT
    Srv->>Srv: claim có tồn tại không
    Srv->>Srv: busboy parse, giữ lại 8 byte đầu, đếm size, chặn quá 10MB
    Srv->>Srv: type thuộc enum, contentType thuộc danh sách

    Srv->>FC: matchesDeclaredType(8 byte đầu, contentType)
    FC-->>Srv: true nếu magic bytes khớp
    Note over FC: %PDF- cho PDF, FF D8 FF cho JPEG,<br/>89 50 4E 47 0D 0A 1A 0A cho PNG

    Srv->>FC: scanFileContent(head, contentType)
    FC-->>Srv: ok true, LUÔN LUÔN
    Note over FC: MOCKUP. Đây là chỗ hệ thống thật cắm quét virus<br/>và kiểm tra cấu trúc PDF. Mock server không làm gì cả

    Srv->>Srv: store.addDocument, sinh DOC-000001
    Srv-->>Tr: 201 metadata tài liệu
    Tr-->>Pipe: 201
    Pipe-->>Docs: ClaimDocument
    Docs-->>Partner: ClaimDocument
```

## Đọc gì từ sơ đồ này

- **Ba quy tắc của progress:** luôn phát 0% lúc bắt đầu và 100% khi xong, không phát trùng một con số phần trăm, và nếu request bị thử lại thì quay về 0 cho lần thử mới.
- **Progress đo theo byte đã ghi ra socket**, lấy từ callback của `req.write`, chứ không phải byte đã đọc từ file. Có backpressure nên hai con số này lệch nhau.
- **`retryable` được quyết định từ bước 2**, dựa trên nguồn file. Với stream thô, SDK thà báo lỗi trung thực còn hơn âm thầm gửi lên một file bị cụt.
- **Hai tầng kiểm tra file ở server có tính chất khác hẳn nhau.** `matchesDeclaredType` là kiểm tra thật và chặn được trò đổi tên file. `scanFileContent` là hàm giả luôn cho qua, tồn tại để lộ ra chỗ cắm cho hệ thống thật. Chi tiết ở mục "Kiểm tra file phía server" trong README.
