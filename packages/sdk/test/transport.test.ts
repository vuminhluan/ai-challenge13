import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NetworkError, TimeoutError } from '../src/errors.js';
import { NodeHttpTransport } from '../src/core/transport.js';

let server: Server;
let baseUrl: string;
const transport = new NodeHttpTransport();

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/slow') {
      setTimeout(() => res.end('late'), 2000);
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(201, { 'content-type': 'application/json', 'x-echo-method': req.method ?? '' });
      res.end(JSON.stringify({ body: Buffer.concat(chunks).toString('utf8'), auth: req.headers.authorization ?? null }));
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

describe('NodeHttpTransport', () => {
  it('sends a JSON body with headers and reads the response back', async () => {
    const res = await transport.send({
      method: 'POST',
      url: `${baseUrl}/echo`,
      headers: { authorization: 'Bearer abc' },
      body: { kind: 'json', value: { hello: 'world' } },
      timeoutMs: 5000,
    });
    expect(res.status).toBe(201);
    expect(res.headers['x-echo-method']).toBe('POST');
    const payload = JSON.parse(res.body) as { body: string; auth: string };
    expect(JSON.parse(payload.body)).toEqual({ hello: 'world' });
    expect(payload.auth).toBe('Bearer abc');
  });

  it('throws TimeoutError past the timeout', async () => {
    await expect(
      transport.send({ method: 'GET', url: `${baseUrl}/slow`, headers: {}, timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('throws NetworkError when the host is unreachable', async () => {
    await expect(
      transport.send({ method: 'GET', url: 'http://127.0.0.1:1/unreachable', headers: {}, timeoutMs: 2000 }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws NetworkError with code REQUEST_ABORTED when aborted', async () => {
    const controller = new AbortController();
    const promise = transport.send({ method: 'GET', url: `${baseUrl}/slow`, headers: {}, timeoutMs: 5000, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  });
});

describe('systemClock', () => {
  it('rejects when the sleep is aborted', async () => {
    const { systemClock } = await import('../src/core/clock.js');
    const controller = new AbortController();
    const promise = systemClock.sleep(5000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toBeDefined();
  });
});
