import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Readable } from 'node:stream';
import { NetworkError, TimeoutError } from '../errors.js';
import type { ProgressHandler } from '../types.js';

/** Body của một request ở tầng transport. */
export type TransportBody =
  | { kind: 'json'; value: unknown }
  | {
      kind: 'stream';
      create: () => { stream: Readable; contentLength: number; contentType: string };
      onProgress?: ProgressHandler;
    };

/** Một request đã sẵn sàng để gửi đi. */
export interface TransportRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: TransportBody;
  signal?: AbortSignal;
  timeoutMs: number;
}

/** Response thô, chưa parse. */
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Tầng gửi byte. Thay được khi test. */
export interface Transport {
  send(request: TransportRequest): Promise<TransportResponse>;
}

/** Transport thật, dựng trên node:http và node:https. */
export class NodeHttpTransport implements Transport {
  send(req: TransportRequest): Promise<TransportResponse> {
    return new Promise<TransportResponse>((resolve, reject) => {
      const url = new URL(req.url);
      const doRequest = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const headers: Record<string, string> = { ...req.headers };

      let payload: Buffer | undefined;
      if (req.body?.kind === 'json') {
        payload = Buffer.from(JSON.stringify(req.body.value));
        headers['content-type'] = 'application/json';
        headers['content-length'] = String(payload.length);
      }
      let streamSource: { stream: Readable; contentLength: number } | undefined;
      if (req.body?.kind === 'stream') {
        const created = req.body.create();
        streamSource = { stream: created.stream, contentLength: created.contentLength };
        headers['content-type'] = created.contentType;
        headers['content-length'] = String(created.contentLength);
      }

      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
        fn();
      };

      const clientRequest = doRequest(
        { protocol: url.protocol, hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, method: req.method, headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const responseHeaders: Record<string, string> = {};
            for (const [key, value] of Object.entries(res.headers)) {
              if (typeof value === 'string') responseHeaders[key] = value;
              else if (Array.isArray(value)) responseHeaders[key] = value.join(', ');
            }
            finish(() =>
              resolve({ status: res.statusCode ?? 0, headers: responseHeaders, body: Buffer.concat(chunks).toString('utf8') }),
            );
          });
        },
      );

      const timer = setTimeout(() => {
        clientRequest.destroy();
        finish(() => reject(new TimeoutError(`Request timed out after ${req.timeoutMs}ms`, req.timeoutMs, 1)));
      }, req.timeoutMs);

      const onAbort = (): void => {
        clientRequest.destroy();
        finish(() => reject(new NetworkError('Request was aborted', 1, 'REQUEST_ABORTED')));
      };
      req.signal?.addEventListener('abort', onAbort, { once: true });

      clientRequest.on('error', (error: NodeJS.ErrnoException) => {
        finish(() => reject(new NetworkError(error.message, 1, error.code ?? 'NETWORK_ERROR', error)));
      });

      if (streamSource !== undefined) {
        const { stream, contentLength } = streamSource;
        const onProgress = req.body?.kind === 'stream' ? req.body.onProgress : undefined;
        let bytesSent = 0;
        let lastPercent = -1;
        const report = (): void => {
          const percent = contentLength === 0 ? 100 : Math.floor((bytesSent / contentLength) * 100);
          if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress?.(percent, { bytesSent, totalBytes: contentLength });
          }
        };
        report();

        stream.on('data', (chunk: Buffer) => {
          const ok = clientRequest.write(chunk, () => {
            bytesSent += chunk.length;
            report();
          });
          if (!ok) {
            stream.pause();
            clientRequest.once('drain', () => stream.resume());
          }
        });
        stream.on('error', (error: Error) => {
          clientRequest.destroy();
          finish(() => reject(new NetworkError(error.message, 1, 'STREAM_ERROR', error)));
        });
        stream.on('end', () => {
          clientRequest.end(() => {
            bytesSent = contentLength;
            report();
          });
        });
        return;
      }

      if (payload !== undefined) clientRequest.write(payload);
      clientRequest.end();
    });
  }
}
