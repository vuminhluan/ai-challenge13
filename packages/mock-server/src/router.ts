import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleToken } from './handlers/auth.js';
import { sendError } from './http.js';
import { verifyToken } from './jwt.js';
import type { ServerConfig } from './server.js';

export interface AuthContext {
  apiKey: string;
}

export function authenticate(req: IncomingMessage, res: ServerResponse, config: ServerConfig): AuthContext | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing bearer token');
    return undefined;
  }
  const result = verifyToken(header.slice('Bearer '.length), config.secret, config.now());
  if (!result.ok) {
    sendError(res, 401, 'TOKEN_EXPIRED', `Token is ${result.reason}`);
    return undefined;
  }
  return { apiKey: result.payload.sub };
}

export async function route(req: IncomingMessage, res: ServerResponse, config: ServerConfig): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';

  if (method === 'POST' && url.pathname === '/api/v1/auth/token') {
    await handleToken(req, res, config);
    return;
  }

  sendError(res, 404, 'NOT_FOUND', `No route for ${method} ${url.pathname}`);
}
