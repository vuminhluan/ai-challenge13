# Sơ đồ kiến trúc

Sơ đồ vẽ bằng Mermaid, GitHub render trực tiếp trong trang, không cần cài gì thêm.

| Sơ đồ | Loại | Trả lời câu hỏi |
|---|---|---|
| [00 — Tổng thể các thành phần](00-components.md) | graph | Hệ thống có những lớp nào, phụ thuộc vào nhau ra sao |
| [01 — Tạo claim](01-create-claim.md) | sequence | Một lời gọi `claims.create` đi qua những đâu |
| [02 — Retry khi gặp 503](02-retry-503.md) | sequence | SDK che lỗi tạm thời của server bằng cách nào |
| [03 — Xác thực và refresh token](03-token-refresh.md) | sequence | Token được lấy, cache và làm mới lúc nào |
| [04 — Upload tài liệu](04-upload-document.md) | sequence | Multipart, tiến độ và kiểm tra file phía server |
| [05 — Theo dõi trạng thái](05-status-watcher.md) | sequence | Vòng poll chạy và dừng thế nào |

## Đọc theo thứ tự nào

Muốn nắm nhanh thì đọc **00** rồi **01**: hai sơ đồ này đủ để hiểu đường đi của một request bình thường.

Ba sơ đồ còn lại là ba tình huống mà SDK xử lý thay cho đối tác: server hỏng tạm thời (**02**), token hết hạn (**03**), và trạng thái claim thay đổi theo thời gian (**05**). **04** là luồng phức tạp nhất vì có thêm phần stream và tiến độ.

## Quy ước trong các sơ đồ

- Participant được đặt tên theo đúng class hoặc file trong mã nguồn, để từ sơ đồ tìm thẳng được tới code.
- Khối `Note` giải thích **vì sao** thiết kế như vậy, không lặp lại thứ mà mũi tên đã nói.
- Mọi sơ đồ đều dừng ở ranh giới HTTP của mock server và không vẽ chi tiết bên trong `node:http`.
