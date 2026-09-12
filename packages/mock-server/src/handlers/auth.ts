import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendError, sendJson } from '../http.js';
import { signToken } from '../jwt.js';
import type { ServerConfig } from '../server.js';

export async function handleToken(req: IncomingMessage, res: ServerResponse, config: ServerConfig): Promise<void> {
  const body = (await readJsonBody(req)) as { apiKey?: unknown } | undefined;
  if (body === undefined) {
    sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    return;
  }
  if (typeof body.apiKey !== 'string' || body.apiKey === '') {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', { apiKey: 'required' });
    return;
  }
  if (!body.apiKey.startsWith(config.apiKeyPrefix)) {
    sendError(res, 401, 'INVALID_API_KEY', 'API key is not valid for this environment');
    return;
  }
  const now = config.now();
  sendJson(res, 200, {
    accessToken: signToken(body.apiKey, config.secret, config.tokenTtlSeconds, now),
    tokenType: 'Bearer',
    expiresIn: config.tokenTtlSeconds,
    expiresAt: new Date(now + config.tokenTtlSeconds * 1000).toISOString(),
  });
}
