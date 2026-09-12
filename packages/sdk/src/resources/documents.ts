import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Readable } from 'node:stream';
import { buildMultipart } from '../core/multipart.js';
import type { RequestPipeline } from '../core/pipeline.js';
import type { ClaimDocument, FileInput, RequestOptions, UploadOptions } from '../types.js';
import { assertValid, validateUpload } from '../validation.js';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/** File đã được chuẩn hoá về dạng dựng lại được. */
export interface ResolvedFile {
  filename: string;
  contentType: string;
  size: number;
  createStream: () => Readable;
  /** false khi nguồn là stream thô, vì stream đã đọc không tua lại được. */
  retryable: boolean;
}

/** Chuẩn hoá Buffer, đường dẫn hoặc stream thành một nguồn thống nhất. */
export async function resolveFileInput(
  file: FileInput,
  options: { filename?: string; contentType?: string },
): Promise<ResolvedFile> {
  if (Buffer.isBuffer(file)) {
    const filename = options.filename ?? 'upload.pdf';
    return {
      filename,
      contentType: options.contentType ?? CONTENT_TYPES[extname(filename).toLowerCase()] ?? 'application/octet-stream',
      size: file.length,
      createStream: () => Readable.from([file]),
      retryable: true,
    };
  }

  if (typeof file === 'string') {
    const stats = await stat(file);
    const filename = options.filename ?? basename(file);
    return {
      filename,
      contentType: options.contentType ?? CONTENT_TYPES[extname(filename).toLowerCase()] ?? 'application/octet-stream',
      size: stats.size,
      createStream: () => createReadStream(file),
      retryable: true,
    };
  }

  const filename = options.filename ?? file.filename;
  return {
    filename,
    contentType:
      options.contentType ?? file.contentType ?? CONTENT_TYPES[extname(filename).toLowerCase()] ?? 'application/octet-stream',
    size: file.size,
    createStream: () => file.stream,
    retryable: false,
  };
}

/** Các thao tác với tài liệu đính kèm hồ sơ. */
export class DocumentsResource {
  private readonly pipeline: RequestPipeline;

  constructor(pipeline: RequestPipeline) {
    this.pipeline = pipeline;
  }

  /**
   * Upload một tài liệu cho hồ sơ. `file` nhận Buffer, đường dẫn file, hoặc
   * `{ stream, size, filename }`. Với stream thô, SDK tắt retry vì stream đã đọc
   * không tua lại được.
   */
  async upload(claimId: string, file: FileInput, options: UploadOptions): Promise<ClaimDocument> {
    assertValid(claimId === '' ? { claimId: 'required' } : {}, 'Invalid claim id');
    const resolved = await resolveFileInput(file, {
      ...(options.filename === undefined ? {} : { filename: options.filename }),
      ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
    });
    assertValid(validateUpload(options.type, resolved.filename, resolved.size), 'Invalid document upload');

    const body = buildMultipart([{ name: 'type', value: options.type }], {
      fieldName: 'file',
      filename: resolved.filename,
      contentType: resolved.contentType,
      size: resolved.size,
      createStream: resolved.createStream,
    });

    return this.pipeline.execute<ClaimDocument>({
      method: 'POST',
      path: `/api/v1/claims/${encodeURIComponent(claimId)}/documents`,
      retryable: resolved.retryable,
      body: {
        kind: 'stream',
        create: () => ({ stream: body.create(), contentLength: body.contentLength, contentType: body.contentType }),
        ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      },
      ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }

  /** Liệt kê tài liệu đã upload cho một hồ sơ. */
  async list(claimId: string, options: RequestOptions = {}): Promise<ClaimDocument[]> {
    const result = await this.pipeline.execute<{ data: ClaimDocument[] }>({
      method: 'GET',
      path: `/api/v1/claims/${encodeURIComponent(claimId)}/documents`,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return result.data;
  }
}
