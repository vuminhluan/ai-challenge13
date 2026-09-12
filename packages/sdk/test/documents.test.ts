import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { RequestPipeline } from '../src/core/pipeline.js';
import { ValidationError } from '../src/errors.js';
import { DocumentsResource } from '../src/resources/documents.js';
import type { ClaimDocument } from '../src/types.js';
import { FakeClock, FakeTransport, jsonReply } from './helpers.js';

const TOKEN = jsonReply(200, { accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 3600 });
const DOC: ClaimDocument = {
  id: 'DOC-000001',
  claimId: 'CLM-000001',
  type: 'medical_receipt',
  filename: 'receipt.pdf',
  contentType: 'application/pdf',
  size: 21,
  uploadedAt: '2024-06-01T00:00:00.000Z',
};

const setup = (): { documents: DocumentsResource; transport: FakeTransport } => {
  const transport = new FakeTransport();
  const pipeline = new RequestPipeline({
    baseUrl: 'http://api.test',
    apiKey: 'pk_test_abc',
    timeoutMs: 30_000,
    maxRetries: 3,
    transport,
    clock: new FakeClock(),
    random: () => 0.5,
    defaultHeaders: {},
  });
  return { documents: new DocumentsResource(pipeline), transport };
};

describe('DocumentsResource.upload', () => {
  it('upload từ Buffer và gửi body dạng stream retry được', async () => {
    const { documents, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, DOC));

    const doc = await documents.upload('CLM-000001', Buffer.from('%PDF-1.4 nội dung'), {
      type: 'medical_receipt',
      filename: 'receipt.pdf',
    });

    expect(doc.id).toBe('DOC-000001');
    const request = transport.requests[1];
    expect(request?.url).toBe('http://api.test/api/v1/claims/CLM-000001/documents');
    expect(request?.body?.kind).toBe('stream');
  });

  it('upload từ đường dẫn file, tự suy ra tên và content type', async () => {
    const { documents, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, DOC));
    const dir = mkdtempSync(join(tmpdir(), 'sdk-test-'));
    const path = join(dir, 'receipt.pdf');
    writeFileSync(path, Buffer.from('%PDF-1.4 nội dung'));

    await documents.upload('CLM-000001', path, { type: 'medical_receipt' });

    const body = transport.requests[1]?.body;
    if (body?.kind !== 'stream') throw new Error('body phải là stream');
    expect(body.create().contentType).toContain('multipart/form-data; boundary=');
  });

  it('loại tài liệu sai thì ném ValidationError mà không gọi transport', async () => {
    const { documents, transport } = setup();

    await expect(
      documents.upload('CLM-000001', Buffer.from('x'), { type: 'selfie' as never, filename: 'a.pdf' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transport.requests).toHaveLength(0);
  });

  it('đuôi file không hỗ trợ thì ném ValidationError trước khi gọi transport', async () => {
    const { documents, transport } = setup();

    await expect(
      documents.upload('CLM-000001', Buffer.from('x'), { type: 'other', filename: 'note.txt' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transport.requests).toHaveLength(0);
  });

  it('stream thô thì tắt retry vì không tua lại được', async () => {
    const { documents, transport } = setup();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }));

    await expect(
      documents.upload(
        'CLM-000001',
        { stream: Readable.from([Buffer.from('%PDF-1.4')]), size: 8, filename: 'receipt.pdf' },
        { type: 'medical_receipt' },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(transport.requests).toHaveLength(2);
  });

  it('truyền onProgress xuống tầng transport', async () => {
    const { documents, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, DOC));
    const onProgress = (): void => {};

    await documents.upload('CLM-000001', Buffer.from('%PDF-1.4'), { type: 'medical_receipt', filename: 'a.pdf', onProgress });

    const body = transport.requests[1]?.body;
    if (body?.kind !== 'stream') throw new Error('body phải là stream');
    expect(body.onProgress).toBe(onProgress);
  });
});

describe('DocumentsResource.list', () => {
  it('trả về mảng tài liệu', async () => {
    const { documents, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, { data: [DOC] }));

    const docs = await documents.list('CLM-000001');

    expect(docs).toHaveLength(1);
    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims/CLM-000001/documents');
  });
});
