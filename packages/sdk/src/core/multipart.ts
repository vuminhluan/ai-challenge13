import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

/** Một field dạng text trong body multipart. */
export interface MultipartField {
  name: string;
  value: string;
}

/** Phần file trong body multipart. */
export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  size: number;
  /** Tạo một stream mới mỗi lần gọi, để retry gửi lại được. */
  createStream: () => Readable;
}

/** Body multipart đã biết trước độ dài, nhờ vậy tính được phần trăm tiến độ. */
export interface MultipartBody {
  contentType: string;
  contentLength: number;
  create: () => Readable;
}

/** Dựng body multipart/form-data và tính chính xác Content-Length. */
export function buildMultipart(
  fields: MultipartField[],
  file: MultipartFile,
  boundary: string = `----insurance-sdk-${randomUUID()}`,
): MultipartBody {
  const head = Buffer.from(
    fields
      .map((field) => `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`)
      .join('') +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength: head.length + file.size + tail.length,
    create: () =>
      Readable.from(
        (async function* stream() {
          yield head;
          for await (const chunk of file.createStream()) yield chunk as Buffer;
          yield tail;
        })(),
      ),
  };
}
