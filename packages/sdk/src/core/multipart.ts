import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

/** A text field inside a multipart body. */
export interface MultipartField {
  name: string;
  value: string;
}

/** The file part of a multipart body. */
export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  size: number;
  /** Creates a fresh stream on every call, so a retry can resend. */
  createStream: () => Readable;
}

/** A multipart body whose length is known up front, which is what makes a percentage possible. */
export interface MultipartBody {
  contentType: string;
  contentLength: number;
  create: () => Readable;
}

/** Builds a multipart/form-data body and computes an exact Content-Length. */
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
