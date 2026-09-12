# Theo dõi trạng thái claim

```mermaid
sequenceDiagram
    autonumber
    actor Partner as Ứng dụng đối tác
    participant Claims as ClaimsResource
    participant W as watchClaimStatus
    participant Clock as Clock
    participant Srv as Mock server

    Partner->>Claims: onStatusChange(claimId, listener, options)
    Claims->>W: khởi động vòng poll
    W->>W: tạo AbortController, ghi lại mốc bắt đầu
    W-->>Partner: trả về hàm stop

    Note over W,Partner: Trả về hàm dừng là bắt buộc chứ không phải tiện ích.<br/>Vòng poll là timer đang hoạt động, mà timer đang hoạt động<br/>giữ event loop của Node sống

    loop tới khi có quyết định cuối, hoặc bị dừng
        W->>Claims: get(claimId, signal)
        Claims->>Srv: GET /api/v1/claims/CLM-000001
        Srv->>Srv: computeStatus theo tuổi của claim
        Srv-->>Claims: Claim kèm status
        Claims-->>W: Claim

        alt status khác lần poll trước
            W->>Partner: listener(status, claim)
        else status không đổi
            W->>W: im lặng, không gọi listener
        end

        alt status là APPROVED hoặc REJECTED
            W->>W: stop, abort signal
            Note over W: Đây là lý do example 3 chạy xong tự thoát
        else còn PENDING hoặc IN_REVIEW
            W->>W: quá maxDurationMs chưa
            W->>Clock: sleep(intervalMs, signal)
            Clock-->>W: hết giờ chờ
        end
    end

    Note over Partner,W: Partner gọi stop() bất cứ lúc nào:<br/>abort cắt luôn request đang bay và cắt luôn giấc ngủ backoff.<br/>Gọi stop nhiều lần vẫn an toàn
```

## Ba lớp bảo vệ chống rò rỉ vòng poll

| Lớp | Kích hoạt khi | Kết quả |
|---|---|---|
| Hàm `stop()` | Đối tác chủ động gọi | Clear timer, abort request đang chờ |
| Tự dừng ở trạng thái cuối | Claim vào `APPROVED` hoặc `REJECTED` | Vòng lặp thoát, script kết thúc được |
| `maxDurationMs` | Mặc định sau 5 phút | Dừng cả khi trạng thái bị kẹt vì server lỗi |

## Đọc gì từ sơ đồ này

- **Chỉ phát khi trạng thái thật sự đổi.** Poll mỗi 2 giây nhưng claim đứng yên ở `PENDING` thì listener không bị gọi lần nào.
- **Lần poll đầu tiên chỉ để lấy mốc so sánh**, trừ khi trạng thái đó đã là trạng thái cuối. Truyền `initialStatus` từ claim vừa tạo thì nghe được thay đổi ngay từ lần poll đầu.
- **Dùng `setTimeout` đệ quy chứ không `setInterval`.** Server có delay 200–500ms và 10% trả 503 kèm retry, nên nếu dùng `setInterval` thì hai lần poll có thể chồng lên nhau.
- **Lỗi khi poll đi vào `onError`**, không làm vỡ vòng lặp và không tạo unhandled rejection.
