import { createServer as createHttpServer, type Server } from 'node:http';
import { applyDelay, nextForcedStatus, shouldFail } from './chaos.js';
import { sendError } from './http.js';
import { route } from './router.js';
import { Store } from './store.js';
import type { LifecycleConfig } from './types.js';

export interface ServerConfig {
  secret: string;
  apiKeyPrefix: string;
  tokenTtlSeconds: number;
  failureRate: number;
  minDelayMs: number;
  maxDelayMs: number;
  lifecycle: LifecycleConfig;
  now: () => number;
  random: () => number;
  store: Store;
}

export function defaultConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    secret: 'mock-server-secret',
    apiKeyPrefix: 'pk_test_',
    tokenTtlSeconds: 3600,
    failureRate: 0.1,
    minDelayMs: 200,
    maxDelayMs: 500,
    lifecycle: { reviewMs: 5000, decisionMs: 10_000, rejectAboveAmount: 100_000 },
    now: () => Date.now(),
    random: () => Math.random(),
    store: new Store(),
    ...overrides,
  };
}

export function createServer(config: ServerConfig): Server {
  return createHttpServer((req, res) => {
    void (async () => {
      try {
        await applyDelay(config);
        const forced = nextForcedStatus(req);
        if (forced !== undefined) {
          req.resume();
          res.setHeader('retry-after', '1');
          sendError(res, forced, 'SERVICE_UNAVAILABLE', 'Forced failure for testing');
          return;
        }
        if (shouldFail(config)) {
          req.resume();
          res.setHeader('retry-after', '1');
          sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable, please retry');
          return;
        }
        await route(req, res, config);
      } catch (error) {
        if (!res.headersSent) {
          sendError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    })();
  });
}
