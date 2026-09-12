/**
 * Validation of uploaded file content.
 *
 * Two clearly separated tiers:
 *
 * 1. `matchesDeclaredType` — a REAL check. Compares the magic bytes at the start of
 *    the file against the content type the client declared in the multipart part.
 *    It defeats the rename-the-file-and-declare-anything trick, because the multipart
 *    header is written by the client and therefore proves nothing on its own.
 *
 * 2. `scanFileContent` — a STUB that always returns `{ ok: true }`. This is the seam
 *    where a real system would plug in virus scanning, PDF structure checks, and
 *    blank-page or screenshot-forgery detection. The mock server does none of that.
 */

/** Number of leading bytes kept in order to identify the format. */
export const HEAD_BYTES = 8;

/** Magic bytes for each accepted format. */
const SIGNATURES: Record<string, readonly number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/** Whether the file content really is the format the client declared. */
export function matchesDeclaredType(head: Buffer, declaredContentType: string): boolean {
  const signature = SIGNATURES[declaredContentType];
  if (signature === undefined) return false;
  if (head.length < signature.length) return false;
  return signature.every((byte, index) => head[index] === byte);
}

/** Result of the deep-scan tier. */
export interface ScanResult {
  ok: boolean;
  reason?: string;
}

/**
 * STUB — always passes.
 *
 * In a real system this is where a virus scanner and deep structural checks would be
 * called. The mock server keeps the signature and the call site so the seam stays
 * visible, but performs no check whatsoever. See "Server-side file validation" in
 * the README.
 */
export function scanFileContent(_head: Buffer, _contentType: string): ScanResult {
  return { ok: true };
}
