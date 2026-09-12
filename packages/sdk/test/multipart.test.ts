import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMultipart } from '../src/core/multipart.js';
import { NodeHttpTransport } from '../src/core/transport.js';

const fileContent = Buffer.from('%PDF-1.4 sample content'.repeat(500));

const makeBody = (): ReturnType<typeof buildMultipart> =>
  buildMultipart(
    [{ name: 'type', value: 'medical_receipt' }],
    {
      fieldName: 'file',
      filename: 'receipt.pdf',
      contentType: 'application/pdf',
      size: fileContent.length,
      createStream: () => Readable.from([fileContent]),
    },
    'test-boundary',
  );

describe('buildMultipart', () => {
  it('contentLength matches the bytes actually emitted', async () => {
    const body = makeBody();
    const chunks: Buffer[] = [];
    for await (const chunk of body.create()) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).length).toBe(body.contentLength);
  });

  it('contains the boundary, field name, filename and closing part', async () => {
    const body = makeBody();
    const chunks: Buffer[] = [];
    for await (const chunk of body.create()) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    expect(body.contentType).toBe('multipart/form-data; boundary=test-boundary');
    expect(text).toContain('name="type"');
    expect(text).toContain('name="file"; filename="receipt.pdf"');
    expect(text).toContain('Content-Type: application/pdf');
    expect(text.endsWith('--test-boundary--\r\n')).toBe(true);
  });

  it('calling create twice yields two independent streams, so a retry can resend', async () => {
    const body = makeBody();
    const read = async (): Promise<number> => {
      let total = 0;
      for await (const chunk of body.create()) total += (chunk as Buffer).length;
      return total;
    };
    expect(await read()).toBe(body.contentLength);
    expect(await read()).toBe(body.contentLength);
  });
});

describe('NodeHttpTransport with a stream body', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let received = 0;
      req.on('data', (chunk: Buffer) => {
        received += chunk.length;
      });
      req.on('end', () => {
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ received, contentLength: req.headers['content-length'], contentType: req.headers['content-type'] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('could not read the port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('sends every byte and reports progress rising to 100', async () => {
    const body = makeBody();
    const percents: number[] = [];
    const res = await new NodeHttpTransport().send({
      method: 'POST',
      url: `${baseUrl}/upload`,
      headers: {},
      timeoutMs: 5000,
      body: {
        kind: 'stream',
        create: () => ({ stream: body.create(), contentLength: body.contentLength, contentType: body.contentType }),
        onProgress: (percent) => percents.push(percent),
      },
    });

    const payload = JSON.parse(res.body) as { received: number; contentLength: string; contentType: string };
    expect(res.status).toBe(201);
    expect(payload.received).toBe(body.contentLength);
    expect(payload.contentLength).toBe(String(body.contentLength));
    expect(payload.contentType).toBe(body.contentType);
    expect(percents[0]).toBe(0);
    expect(percents[percents.length - 1]).toBe(100);
    expect([...percents].sort((a, b) => a - b)).toEqual(percents);
    expect(new Set(percents).size).toBe(percents.length);
  });
});
