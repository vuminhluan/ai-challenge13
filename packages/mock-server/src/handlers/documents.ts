import type { IncomingMessage, ServerResponse } from 'node:http';
import busboy from 'busboy';
import { sendError, sendJson } from '../http.js';
import type { AuthContext } from '../router.js';
import type { ServerConfig } from '../server.js';
import type { StoredDocument } from '../store.js';
import type { DocumentType } from '../types.js';
import { DOCUMENT_TYPES } from '../validation.js';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

interface ParsedUpload {
  type?: string;
  filename?: string;
  contentType?: string;
  size: number;
  tooLarge: boolean;
}

function parseMultipart(req: IncomingMessage): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const parsed: ParsedUpload = { size: 0, tooLarge: false };
    const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES, files: 1 } });

    bb.on('field', (name, value) => {
      if (name === 'type') parsed.type = value;
    });
    bb.on('file', (_name, stream, info) => {
      parsed.filename = info.filename;
      parsed.contentType = info.mimeType;
      stream.on('data', (chunk: Buffer) => {
        parsed.size += chunk.length;
      });
      stream.on('limit', () => {
        parsed.tooLarge = true;
      });
      stream.resume();
    });
    bb.on('close', () => resolve(parsed));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

export async function handleUploadDocument(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  auth: AuthContext,
  claimId: string,
): Promise<void> {
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.startsWith('multipart/form-data')) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', { file: 'must be sent as multipart/form-data' });
    return;
  }
  if (config.store.getClaim(auth.apiKey, claimId) === undefined) {
    req.resume();
    sendError(res, 404, 'CLAIM_NOT_FOUND', `Claim ${claimId} was not found`);
    return;
  }

  const parsed = await parseMultipart(req);
  if (parsed.tooLarge) {
    sendError(res, 413, 'FILE_TOO_LARGE', 'File exceeds the 10MB limit');
    return;
  }

  const fields: Record<string, string> = {};
  if (parsed.type === undefined || !DOCUMENT_TYPES.includes(parsed.type as DocumentType)) {
    fields.type = `must be one of ${DOCUMENT_TYPES.join(', ')}`;
  }
  if (parsed.filename === undefined || parsed.size === 0) {
    fields.file = 'required';
  } else if (parsed.contentType === undefined || !ALLOWED_CONTENT_TYPES.includes(parsed.contentType)) {
    fields.file = `must be ${ALLOWED_CONTENT_TYPES.join(', ')}`;
  }
  if (Object.keys(fields).length > 0) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', fields);
    return;
  }

  const doc = config.store.addDocument(
    claimId,
    {
      type: parsed.type as DocumentType,
      filename: parsed.filename as string,
      contentType: parsed.contentType as string,
      size: parsed.size,
    },
    config.now(),
  );
  sendJson(res, 201, toDocumentResponse(doc));
}

export function handleListDocuments(
  res: ServerResponse,
  config: ServerConfig,
  auth: AuthContext,
  claimId: string,
): void {
  if (config.store.getClaim(auth.apiKey, claimId) === undefined) {
    sendError(res, 404, 'CLAIM_NOT_FOUND', `Claim ${claimId} was not found`);
    return;
  }
  sendJson(res, 200, { data: config.store.listDocuments(claimId).map(toDocumentResponse) });
}

function toDocumentResponse(doc: StoredDocument): Record<string, unknown> {
  return {
    id: doc.id,
    claimId: doc.claimId,
    type: doc.type,
    filename: doc.filename,
    contentType: doc.contentType,
    size: doc.size,
    uploadedAt: new Date(doc.uploadedAtMs).toISOString(),
  };
}
