/**
 * Kiểm tra nội dung file upload.
 *
 * Gồm hai tầng tách bạch:
 *
 * 1. `matchesDeclaredType` — kiểm tra THẬT. Đối chiếu magic bytes ở đầu file với
 *    content type mà client khai trong phần multipart. Chặn được trường hợp đổi
 *    tên file rồi khai bừa content type, vì header multipart là do client viết
 *    nên tự nó không đáng tin.
 *
 * 2. `scanFileContent` — MOCKUP, luôn trả về `{ ok: true }`. Đây là chỗ mà hệ
 *    thống thật sẽ cắm quét virus, kiểm tra cấu trúc PDF, phát hiện ảnh trắng
 *    hoặc ảnh chụp màn hình giả mạo. Mock server không làm những việc đó.
 */

/** Số byte đầu file cần giữ lại để nhận dạng định dạng. */
export const HEAD_BYTES = 8;

/** Magic bytes của từng định dạng được chấp nhận. */
const SIGNATURES: Record<string, readonly number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/** Nội dung file có đúng là định dạng mà client khai hay không. */
export function matchesDeclaredType(head: Buffer, declaredContentType: string): boolean {
  const signature = SIGNATURES[declaredContentType];
  if (signature === undefined) return false;
  if (head.length < signature.length) return false;
  return signature.every((byte, index) => head[index] === byte);
}

/** Kết quả của tầng quét sâu. */
export interface ScanResult {
  ok: boolean;
  reason?: string;
}

/**
 * MOCKUP — luôn cho qua.
 *
 * Trong hệ thống thật, đây là nơi gọi dịch vụ quét virus và kiểm tra sâu cấu
 * trúc file. Mock server giữ lại đúng chữ ký hàm và vị trí gọi để chỗ cắm đó
 * hiện rõ, nhưng không thực hiện kiểm tra nào cả. Xem mục "Kiểm tra file phía
 * server" trong README.
 */
export function scanFileContent(_head: Buffer, _contentType: string): ScanResult {
  return { ok: true };
}
