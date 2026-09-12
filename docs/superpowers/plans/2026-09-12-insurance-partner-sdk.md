# Insurance Partner Integration SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng SDK TypeScript cho đối tác bảo hiểm nộp claim, upload tài liệu và theo dõi trạng thái, kèm mock API server để chạy thử.

**Architecture:** Monorepo pnpm gồm `packages/sdk` và `packages/mock-server`. SDK chia lớp: resources gọi `RequestPipeline` (timeout, idempotency, retry, map lỗi), pipeline dùng `AuthManager` và một `Transport` thay thế được khi test. Mock server dùng `node:http` thuần với chaos middleware và vòng đời claim tính lúc đọc.

**Tech Stack:** Node.js 20+, TypeScript strict, pnpm workspace, Vitest, tsup, tsx, busboy (chỉ cho mock server).

**Spec:** `docs/superpowers/specs/2026-09-12-insurance-partner-sdk-design.md`

## Global Constraints

- Node.js >= 20. Mọi package đặt `"type": "module"`.
- `packages/sdk` **không có runtime dependency nào**. Chỉ dùng module built-in của Node.
- `packages/mock-server` chỉ được có một runtime dependency: `busboy`.
- TypeScript bật `strict: true` và `noUncheckedIndexedAccess: true`. Không dùng `any` ở bất kỳ đâu, kể cả trong test.
- Mọi export công khai của SDK phải có JSDoc.
- Import nội bộ luôn kèm đuôi `.js` (yêu cầu của ESM + `moduleResolution: nodenext`).
- Tên package: `@insurance/sdk` và `@insurance/mock-server`.
- Mỗi task kết thúc bằng một commit riêng. Message dùng tiền tố `feat:`, `test:`, `docs:` hoặc `chore:`.
- Chạy test bằng `pnpm vitest run <đường dẫn>` từ thư mục gốc repo.
- Bổ sung so với spec: SDK config có thêm `defaultHeaders?: Record<string, string>` để gắn header tuỳ ý vào mọi request. Cần cho integration test (header `x-mock-scenario`) và là tính năng hợp lý cho đối tác.

## File Structure

**`packages/sdk/src`**

| File | Trách nhiệm |
|---|---|
| `types.ts` | Toàn bộ type công khai về domain. Không chứa logic |
| `errors.ts` | Cây lỗi và hàm map lỗi HTTP sang lỗi có kiểu |
| `config.ts` | Chuẩn hoá config, ánh xạ environment sang baseUrl |
| `validation.ts` | Validator phía client, trả về map field sang message |
| `core/clock.ts` | Interface `Clock` và bản dựng thật (dùng cho test không cần timer thật) |
| `core/transport.ts` | Interface `Transport` và bản dựng trên `node:http` |
| `core/multipart.ts` | Dựng body multipart và tính `Content-Length` |
| `core/retry.ts` | Phân loại lỗi đáng retry và tính backoff |
| `core/auth.ts` | `AuthManager`: cache token, gộp refresh, epoch |
| `core/pipeline.ts` | `RequestPipeline`: ghép auth, retry, idempotency, timeout, map lỗi |
| `resources/claims.ts` | `create`, `get`, `list`, `onStatusChange` |
| `resources/documents.ts` | `upload`, `list` |
| `status-watcher.ts` | Vòng poll, dedupe, tự dừng, unsubscribe |
| `client.ts` | Class `InsuranceSDK` ghép mọi thứ lại |
| `index.ts` | Điểm export công khai |

**`packages/mock-server/src`**

| File | Trách nhiệm |
|---|---|
| `types.ts` | Type nội bộ của server |
| `jwt.ts` | Ký và xác minh HS256 bằng `node:crypto` |
| `lifecycle.ts` | Tính trạng thái claim theo tuổi của nó |
| `validation.ts` | Validate body phía server |
| `store.ts` | Lưu trữ trong bộ nhớ, sinh ID, idempotency |
| `chaos.ts` | Delay, tỉ lệ hỏng, hook ép status cho test |
| `http.ts` | Tiện ích đọc body, trả JSON, trả lỗi |
| `handlers/auth.ts` | `POST /auth/token` |
| `handlers/claims.ts` | Tạo, lấy, liệt kê claim |
| `handlers/documents.ts` | Upload và liệt kê tài liệu |
| `router.ts` | Khớp route, middleware xác thực |
| `server.ts` | `createServer(config)` |
| `index.ts` | Đọc env và khởi động server |

---

### Task 1: Dựng monorepo và tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/sdk/package.json`, `packages/sdk/tsconfig.json`, `packages/sdk/src/index.ts`, `packages/sdk/test/smoke.test.ts`
- Create: `packages/mock-server/package.json`, `packages/mock-server/tsconfig.json`, `packages/mock-server/src/index.ts`

**Interfaces:**
- Consumes: không có
- Produces: workspace chạy được `pnpm vitest run`, alias `@insurance/sdk` và `@insurance/mock-server` phân giải được từ mọi package

- [ ] **Step 1: Tạo file cấu hình gốc**

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
```

`package.json`:
```json
{
  "name": "insurance-sdk-monorepo",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "build": "pnpm --filter @insurance/sdk build",
    "mock-server": "tsx packages/mock-server/src/index.ts",
    "example:1": "tsx examples/01-simple-claim.ts",
    "example:2": "tsx examples/02-claim-with-document.ts",
    "example:3": "tsx examples/03-poll-status.ts"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "declaration": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 15000,
    coverage: { provider: 'v8', include: ['packages/sdk/src/**'], thresholds: { lines: 85 } },
  },
});
```

`.gitignore`:
```
node_modules/
dist/
coverage/
*.log
```

- [ ] **Step 2: Tạo hai package con**

`packages/sdk/package.json`:
```json
{
  "name": "@insurance/sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" }
  },
  "files": ["dist"],
  "scripts": { "build": "tsup src/index.ts --format esm,cjs --dts --clean" },
  "devDependencies": { "tsup": "^8.3.0" }
}
```

`packages/mock-server/package.json`:
```json
{
  "name": "@insurance/mock-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "dependencies": { "busboy": "^1.6.0" },
  "devDependencies": { "@types/busboy": "^1.5.4" }
}
```

Cả hai `tsconfig.json` giống nhau:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`packages/sdk/src/index.ts`:
```ts
/** Phiên bản SDK, dùng trong header User-Agent. */
export const VERSION = '0.1.0';
```

`packages/mock-server/src/index.ts`:
```ts
export {};
```

- [ ] **Step 3: Viết smoke test**

`packages/sdk/test/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index.js';

describe('workspace', () => {
  it('nạp được module của sdk', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
```

- [ ] **Step 4: Cài đặt và chạy**

Run: `pnpm install && pnpm vitest run`
Expected: PASS, 1 test.

Run: `pnpm exec tsc -p packages/sdk --noEmit`
Expected: không có lỗi.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: dựng monorepo pnpm với typescript và vitest"
```

---

### Task 2: Ký và xác minh JWT trong mock server

**Files:**
- Create: `packages/mock-server/src/jwt.ts`
- Test: `packages/mock-server/test/jwt.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: `signToken(sub: string, secret: string, ttlSeconds: number, nowMs: number): string`; `verifyToken(token: string, secret: string, nowMs: number): VerifyResult` với `VerifyResult = { ok: true; payload: JwtPayload } | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }`; `interface JwtPayload { sub: string; iat: number; exp: number }`

- [ ] **Step 1: Viết test thất bại**

`packages/mock-server/test/jwt.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../src/jwt.js';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;

describe('jwt', () => {
  it('ký rồi xác minh lại được', () => {
    const token = signToken('pk_test_abc', SECRET, 3600, NOW);
    const result = verifyToken(token, SECRET, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('pk_test_abc');
      expect(result.payload.exp).toBe(Math.floor(NOW / 1000) + 3600);
    }
  });

  it('từ chối token đã hết hạn', () => {
    const token = signToken('pk_test_abc', SECRET, 60, NOW);
    const result = verifyToken(token, SECRET, NOW + 61_000);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('từ chối token bị sửa chữ ký', () => {
    const token = signToken('pk_test_abc', SECRET, 3600, NOW);
    const result = verifyToken(`${token}tampered`, SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('từ chối token sai định dạng', () => {
    expect(verifyToken('không-phải-jwt', SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('từ chối token ký bằng secret khác', () => {
    const token = signToken('pk_test_abc', 'secret-khác', 3600, NOW);
    expect(verifyToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/mock-server/test/jwt.test.ts`
Expected: FAIL với "Failed to resolve import ../src/jwt.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/mock-server/src/jwt.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

export type VerifyResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const sign = (data: string, secret: string): Buffer => createHmac('sha256', secret).update(data).digest();

export function signToken(sub: string, secret: string, ttlSeconds: number, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub, iat, exp: iat + ttlSeconds } satisfies JwtPayload);
  const signature = sign(`${header}.${payload}`, secret).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string, secret: string, nowMs: number): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, payload, signature] = parts as [string, string, string];

  const expected = sign(`${header}.${payload}`, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let decoded: JwtPayload;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof decoded.exp !== 'number' || typeof decoded.sub !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  if (decoded.exp * 1000 <= nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, payload: decoded };
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/mock-server/test/jwt.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add packages/mock-server/src/jwt.ts packages/mock-server/test/jwt.test.ts
git commit -m "feat(mock-server): ký và xác minh JWT HS256 bằng node:crypto"
```

---

### Task 3: Vòng đời claim tính lúc đọc

**Files:**
- Create: `packages/mock-server/src/types.ts`, `packages/mock-server/src/lifecycle.ts`
- Test: `packages/mock-server/test/lifecycle.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: `type ClaimStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED'`; `type ClaimType = 'OUTPATIENT' | 'INPATIENT' | 'DENTAL' | 'MATERNITY'`; `type DocumentType = 'medical_receipt' | 'discharge_summary' | 'prescription' | 'lab_result' | 'id_document' | 'other'`; `interface LifecycleConfig { reviewMs: number; decisionMs: number; rejectAboveAmount: number }`; `computeStatus(createdAtMs: number, amount: number, nowMs: number, cfg: LifecycleConfig): ClaimStatus`; `buildStatusHistory(createdAtMs: number, amount: number, nowMs: number, cfg: LifecycleConfig): StatusHistoryEntry[]` với `interface StatusHistoryEntry { status: ClaimStatus; at: string }`

- [ ] **Step 1: Viết test thất bại**

`packages/mock-server/test/lifecycle.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildStatusHistory, computeStatus } from '../src/lifecycle.js';
import type { LifecycleConfig } from '../src/types.js';

const CFG: LifecycleConfig = { reviewMs: 5000, decisionMs: 10_000, rejectAboveAmount: 100_000 };
const CREATED = 1_700_000_000_000;

describe('lifecycle', () => {
  it('mới tạo thì PENDING', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 4999, CFG)).toBe('PENDING');
  });

  it('quá mốc review thì IN_REVIEW', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 5000, CFG)).toBe('IN_REVIEW');
  });

  it('quá mốc quyết định và số tiền hợp lệ thì APPROVED', () => {
    expect(computeStatus(CREATED, 15_000, CREATED + 10_000, CFG)).toBe('APPROVED');
  });

  it('quá mốc quyết định và số tiền vượt ngưỡng thì REJECTED', () => {
    expect(computeStatus(CREATED, 100_001, CREATED + 10_000, CFG)).toBe('REJECTED');
  });

  it('statusHistory chỉ chứa các trạng thái đã đi qua', () => {
    expect(buildStatusHistory(CREATED, 15_000, CREATED + 6000, CFG)).toEqual([
      { status: 'PENDING', at: new Date(CREATED).toISOString() },
      { status: 'IN_REVIEW', at: new Date(CREATED + 5000).toISOString() },
    ]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/mock-server/test/lifecycle.test.ts`
Expected: FAIL với "Failed to resolve import ../src/lifecycle.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/mock-server/src/types.ts`:
```ts
export type ClaimStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export type ClaimType = 'OUTPATIENT' | 'INPATIENT' | 'DENTAL' | 'MATERNITY';
export type DocumentType =
  | 'medical_receipt'
  | 'discharge_summary'
  | 'prescription'
  | 'lab_result'
  | 'id_document'
  | 'other';

export interface StatusHistoryEntry {
  status: ClaimStatus;
  at: string;
}

export interface LifecycleConfig {
  reviewMs: number;
  decisionMs: number;
  rejectAboveAmount: number;
}
```

`packages/mock-server/src/lifecycle.ts`:
```ts
import type { ClaimStatus, LifecycleConfig, StatusHistoryEntry } from './types.js';

export function computeStatus(
  createdAtMs: number,
  amount: number,
  nowMs: number,
  cfg: LifecycleConfig,
): ClaimStatus {
  const age = nowMs - createdAtMs;
  if (age < cfg.reviewMs) return 'PENDING';
  if (age < cfg.decisionMs) return 'IN_REVIEW';
  return amount > cfg.rejectAboveAmount ? 'REJECTED' : 'APPROVED';
}

export function buildStatusHistory(
  createdAtMs: number,
  amount: number,
  nowMs: number,
  cfg: LifecycleConfig,
): StatusHistoryEntry[] {
  const history: StatusHistoryEntry[] = [{ status: 'PENDING', at: new Date(createdAtMs).toISOString() }];
  if (nowMs - createdAtMs >= cfg.reviewMs) {
    history.push({ status: 'IN_REVIEW', at: new Date(createdAtMs + cfg.reviewMs).toISOString() });
  }
  if (nowMs - createdAtMs >= cfg.decisionMs) {
    history.push({
      status: amount > cfg.rejectAboveAmount ? 'REJECTED' : 'APPROVED',
      at: new Date(createdAtMs + cfg.decisionMs).toISOString(),
    });
  }
  return history;
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/mock-server/test/lifecycle.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add packages/mock-server/src/types.ts packages/mock-server/src/lifecycle.ts packages/mock-server/test/lifecycle.test.ts
git commit -m "feat(mock-server): tính trạng thái claim theo tuổi thay vì dùng timer"
```

---

### Task 4: Validate body phía server

**Files:**
- Create: `packages/mock-server/src/validation.ts`
- Test: `packages/mock-server/test/validation.test.ts`

**Interfaces:**
- Consumes: `ClaimType`, `DocumentType` từ `src/types.js` (Task 3)
- Produces: `validateCreateClaim(body: unknown, nowMs: number): Record<string, string>` trả về object rỗng nếu hợp lệ; `CLAIM_TYPES: readonly ClaimType[]`; `DOCUMENT_TYPES: readonly DocumentType[]`; `CURRENCIES: readonly string[]`

- [ ] **Step 1: Viết test thất bại**

`packages/mock-server/test/validation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { validateCreateClaim } from '../src/validation.js';

const NOW = Date.parse('2024-06-01T00:00:00.000Z');
const VALID = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

describe('validateCreateClaim', () => {
  it('không báo lỗi với body hợp lệ', () => {
    expect(validateCreateClaim(VALID, NOW)).toEqual({});
  });

  it('báo tất cả field bắt buộc còn thiếu', () => {
    expect(validateCreateClaim({}, NOW)).toEqual({
      policyId: 'required',
      claimType: 'required',
      diagnosisCode: 'required',
      treatmentDate: 'required',
      amount: 'required',
      currency: 'required',
    });
  });

  it('bắt lỗi định dạng policyId', () => {
    expect(validateCreateClaim({ ...VALID, policyId: '123' }, NOW).policyId).toBe('must match POL-<digits>');
  });

  it('bắt lỗi claimType ngoài danh sách', () => {
    expect(validateCreateClaim({ ...VALID, claimType: 'SURGERY' }, NOW).claimType).toContain('must be one of');
  });

  it('bắt lỗi mã ICD-10 sai định dạng', () => {
    expect(validateCreateClaim({ ...VALID, diagnosisCode: 'j069' }, NOW).diagnosisCode).toBe('must be a valid ICD-10 code');
  });

  it('bắt lỗi ngày điều trị trong tương lai', () => {
    expect(validateCreateClaim({ ...VALID, treatmentDate: '2024-06-02' }, NOW).treatmentDate).toBe('must not be in the future');
  });

  it('bắt lỗi số tiền không dương và quá 2 chữ số thập phân', () => {
    expect(validateCreateClaim({ ...VALID, amount: 0 }, NOW).amount).toBe('must be positive');
    expect(validateCreateClaim({ ...VALID, amount: 10.123 }, NOW).amount).toBe('must have at most 2 decimal places');
  });

  it('bắt lỗi đơn vị tiền tệ không hỗ trợ', () => {
    expect(validateCreateClaim({ ...VALID, currency: 'XYZ' }, NOW).currency).toContain('must be one of');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/mock-server/test/validation.test.ts`
Expected: FAIL với "Failed to resolve import ../src/validation.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/mock-server/src/validation.ts`:
```ts
import type { ClaimType, DocumentType } from './types.js';

export const CLAIM_TYPES: readonly ClaimType[] = ['OUTPATIENT', 'INPATIENT', 'DENTAL', 'MATERNITY'];
export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'medical_receipt',
  'discharge_summary',
  'prescription',
  'lab_result',
  'id_document',
  'other',
];
export const CURRENCIES: readonly string[] = ['THB', 'VND', 'USD', 'SGD', 'MYR', 'IDR', 'PHP'];

const POLICY_ID = /^POL-\d+$/;
const ICD10 = /^[A-Z]\d{2}(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateCreateClaim(body: unknown, nowMs: number): Record<string, string> {
  const errors: Record<string, string> = {};
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const requireString = (field: string): string | undefined => {
    const value = input[field];
    if (value === undefined || value === null || value === '') {
      errors[field] = 'required';
      return undefined;
    }
    if (typeof value !== 'string') {
      errors[field] = 'must be a string';
      return undefined;
    }
    return value;
  };

  const policyId = requireString('policyId');
  if (policyId !== undefined && !POLICY_ID.test(policyId)) errors.policyId = 'must match POL-<digits>';

  const claimType = requireString('claimType');
  if (claimType !== undefined && !CLAIM_TYPES.includes(claimType as ClaimType)) {
    errors.claimType = `must be one of ${CLAIM_TYPES.join(', ')}`;
  }

  const diagnosisCode = requireString('diagnosisCode');
  if (diagnosisCode !== undefined && !ICD10.test(diagnosisCode)) {
    errors.diagnosisCode = 'must be a valid ICD-10 code';
  }

  const treatmentDate = requireString('treatmentDate');
  if (treatmentDate !== undefined) {
    const parsed = Date.parse(`${treatmentDate}T00:00:00.000Z`);
    if (!DATE.test(treatmentDate) || Number.isNaN(parsed)) errors.treatmentDate = 'must be a valid YYYY-MM-DD date';
    else if (parsed > nowMs) errors.treatmentDate = 'must not be in the future';
  }

  const amount = input.amount;
  if (amount === undefined || amount === null) errors.amount = 'required';
  else if (typeof amount !== 'number' || Number.isNaN(amount)) errors.amount = 'must be a number';
  else if (amount <= 0) errors.amount = 'must be positive';
  else if (Math.round(amount * 100) !== Number((amount * 100).toFixed(0)) || !Number.isInteger(Number((amount * 100).toFixed(4)))) {
    errors.amount = 'must have at most 2 decimal places';
  }

  const currency = requireString('currency');
  if (currency !== undefined && !CURRENCIES.includes(currency)) {
    errors.currency = `must be one of ${CURRENCIES.join(', ')}`;
  }

  return errors;
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/mock-server/test/validation.test.ts`
Expected: PASS, 8 test. Nếu test về 2 chữ số thập phân fail, thay điều kiện bằng `Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9`.

- [ ] **Step 5: Commit**

```bash
git add packages/mock-server/src/validation.ts packages/mock-server/test/validation.test.ts
git commit -m "feat(mock-server): validate body tạo claim theo từng field"
```

---

### Task 5: Lưu trữ trong bộ nhớ

**Files:**
- Create: `packages/mock-server/src/store.ts`
- Test: `packages/mock-server/test/store.test.ts`

**Interfaces:**
- Consumes: `ClaimType`, `DocumentType` từ `src/types.js` (Task 3)
- Produces: `class Store` với `createClaim(apiKey: string, input: ClaimInput, nowMs: number): StoredClaim`, `getClaim(apiKey: string, id: string): StoredClaim | undefined`, `listClaims(apiKey: string): StoredClaim[]`, `addDocument(claimId: string, doc: DocumentInput, nowMs: number): StoredDocument`, `listDocuments(claimId: string): StoredDocument[]`, `getIdempotent(apiKey: string, key: string): IdempotentRecord | undefined`, `setIdempotent(apiKey: string, key: string, record: IdempotentRecord): void`

- [ ] **Step 1: Viết test thất bại**

`packages/mock-server/test/store.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store.js';
import type { ClaimInput } from '../src/store.js';

const NOW = 1_700_000_000_000;
const INPUT: ClaimInput = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

describe('Store', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store();
  });

  it('sinh ID claim tuần tự có padding', () => {
    expect(store.createClaim('pk_test_a', INPUT, NOW).id).toBe('CLM-000001');
    expect(store.createClaim('pk_test_a', INPUT, NOW).id).toBe('CLM-000002');
  });

  it('claim của đối tác này thì đối tác khác không đọc được', () => {
    const claim = store.createClaim('pk_test_a', INPUT, NOW);
    expect(store.getClaim('pk_test_a', claim.id)).toBeDefined();
    expect(store.getClaim('pk_test_b', claim.id)).toBeUndefined();
  });

  it('listClaims chỉ trả claim của đúng đối tác, mới nhất trước', () => {
    store.createClaim('pk_test_a', INPUT, NOW);
    store.createClaim('pk_test_b', INPUT, NOW);
    const second = store.createClaim('pk_test_a', INPUT, NOW + 1000);
    const list = store.listClaims('pk_test_a');
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(second.id);
  });

  it('lưu và đọc lại được document theo claim', () => {
    const claim = store.createClaim('pk_test_a', INPUT, NOW);
    const doc = store.addDocument(claim.id, { type: 'medical_receipt', filename: 'r.pdf', contentType: 'application/pdf', size: 120 }, NOW);
    expect(doc.id).toBe('DOC-000001');
    expect(store.listDocuments(claim.id)).toEqual([doc]);
    expect(store.listDocuments('CLM-999999')).toEqual([]);
  });

  it('idempotency record tách biệt theo từng API key', () => {
    store.setIdempotent('pk_test_a', 'key-1', { bodyHash: 'h1', status: 201, response: { id: 'CLM-000001' } });
    expect(store.getIdempotent('pk_test_a', 'key-1')?.bodyHash).toBe('h1');
    expect(store.getIdempotent('pk_test_b', 'key-1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/mock-server/test/store.test.ts`
Expected: FAIL với "Failed to resolve import ../src/store.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/mock-server/src/store.ts`:
```ts
import type { ClaimType, DocumentType } from './types.js';

export interface ClaimInput {
  policyId: string;
  claimType: ClaimType;
  diagnosisCode: string;
  treatmentDate: string;
  amount: number;
  currency: string;
}

export interface StoredClaim extends ClaimInput {
  id: string;
  apiKey: string;
  createdAtMs: number;
}

export interface DocumentInput {
  type: DocumentType;
  filename: string;
  contentType: string;
  size: number;
}

export interface StoredDocument extends DocumentInput {
  id: string;
  claimId: string;
  uploadedAtMs: number;
}

export interface IdempotentRecord {
  bodyHash: string;
  status: number;
  response: unknown;
}

const pad = (value: number): string => String(value).padStart(6, '0');

export class Store {
  private claims = new Map<string, StoredClaim>();
  private documents = new Map<string, StoredDocument[]>();
  private idempotency = new Map<string, IdempotentRecord>();
  private claimSeq = 0;
  private documentSeq = 0;

  createClaim(apiKey: string, input: ClaimInput, nowMs: number): StoredClaim {
    this.claimSeq += 1;
    const claim: StoredClaim = { ...input, id: `CLM-${pad(this.claimSeq)}`, apiKey, createdAtMs: nowMs };
    this.claims.set(claim.id, claim);
    return claim;
  }

  getClaim(apiKey: string, id: string): StoredClaim | undefined {
    const claim = this.claims.get(id);
    return claim !== undefined && claim.apiKey === apiKey ? claim : undefined;
  }

  listClaims(apiKey: string): StoredClaim[] {
    return [...this.claims.values()]
      .filter((claim) => claim.apiKey === apiKey)
      .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id));
  }

  addDocument(claimId: string, input: DocumentInput, nowMs: number): StoredDocument {
    this.documentSeq += 1;
    const doc: StoredDocument = { ...input, id: `DOC-${pad(this.documentSeq)}`, claimId, uploadedAtMs: nowMs };
    const list = this.documents.get(claimId) ?? [];
    list.push(doc);
    this.documents.set(claimId, list);
    return doc;
  }

  listDocuments(claimId: string): StoredDocument[] {
    return this.documents.get(claimId) ?? [];
  }

  getIdempotent(apiKey: string, key: string): IdempotentRecord | undefined {
    return this.idempotency.get(`${apiKey}:${key}`);
  }

  setIdempotent(apiKey: string, key: string, record: IdempotentRecord): void {
    this.idempotency.set(`${apiKey}:${key}`, record);
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/mock-server/test/store.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add packages/mock-server/src/store.ts packages/mock-server/test/store.test.ts
git commit -m "feat(mock-server): lưu trữ claim, document và idempotency trong bộ nhớ"
```

---

### Task 6: Khung HTTP server, chaos và endpoint lấy token

**Files:**
- Create: `packages/mock-server/src/chaos.ts`, `packages/mock-server/src/http.ts`, `packages/mock-server/src/handlers/auth.ts`, `packages/mock-server/src/router.ts`, `packages/mock-server/src/server.ts`
- Modify: `packages/mock-server/src/index.ts`
- Test: `packages/mock-server/test/auth-endpoint.test.ts`

**Interfaces:**
- Consumes: `signToken`, `verifyToken` (Task 2); `LifecycleConfig` (Task 3); `Store` (Task 5)
- Produces: `interface ServerConfig { secret: string; apiKeyPrefix: string; tokenTtlSeconds: number; failureRate: number; minDelayMs: number; maxDelayMs: number; lifecycle: LifecycleConfig; now: () => number; random: () => number; store: Store }`; `createServer(config: ServerConfig): http.Server`; `defaultConfig(overrides?: Partial<ServerConfig>): ServerConfig`; `sendJson(res, status, payload)`; `sendError(res, status, code, message, fields?)`; `readJsonBody(req): Promise<unknown>`; `interface AuthContext { apiKey: string }`

- [ ] **Step 1: Viết test thất bại**

`packages/mock-server/test/auth-endpoint.test.ts`:
```ts
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, defaultConfig } from '../src/server.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(defaultConfig({ failureRate: 0, minDelayMs: 0, maxDelayMs: 0 }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

const postToken = (body: unknown): Promise<Response> =>
  fetch(`${baseUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/v1/auth/token', () => {
  it('đổi API key hợp lệ lấy được JWT', async () => {
    const res = await postToken({ apiKey: 'pk_test_abc' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; expiresIn: number; tokenType: string };
    expect(body.tokenType).toBe('Bearer');
    expect(body.expiresIn).toBe(3600);
    expect(body.accessToken.split('.')).toHaveLength(3);
  });

  it('từ chối API key sai tiền tố', async () => {
    const res = await postToken({ apiKey: 'sk_live_abc' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_API_KEY');
  });

  it('báo lỗi validation khi thiếu apiKey', async () => {
    const res = await postToken({});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields.apiKey).toBe('required');
  });

  it('trả 404 cho route không tồn tại', async () => {
    const res = await fetch(`${baseUrl}/api/v1/không-có`);
    expect(res.status).toBe(404);
  });

  it('header x-mock-force-status ép response đầu tiên thành 503', async () => {
    const headers = { 'content-type': 'application/json', 'x-mock-force-status': '503', 'x-mock-scenario': 'auth-forced' };
    const first = await fetch(`${baseUrl}/api/v1/auth/token`, { method: 'POST', headers, body: JSON.stringify({ apiKey: 'pk_test_abc' }) });
    expect(first.status).toBe(503);
    expect(first.headers.get('retry-after')).toBe('1');
    const second = await fetch(`${baseUrl}/api/v1/auth/token`, { method: 'POST', headers, body: JSON.stringify({ apiKey: 'pk_test_abc' }) });
    expect(second.status).toBe(200);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/mock-server/test/auth-endpoint.test.ts`
Expected: FAIL với "Failed to resolve import ../src/server.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/mock-server/src/http.ts`:
```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

export function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): void {
  sendJson(res, status, { error: { code, message, requestId: `req_${randomUUID()}`, ...(fields ? { fields } : {}) } });
}

export async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req);
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}
```

`packages/mock-server/src/chaos.ts`:
```ts
import type { IncomingMessage } from 'node:http';

export interface ChaosOptions {
  failureRate: number;
  minDelayMs: number;
  maxDelayMs: number;
  random: () => number;
}

const forcedCounters = new Map<string, number>();

/** Trả về status bị ép cho request này, hoặc undefined nếu không bị ép. */
export function nextForcedStatus(req: IncomingMessage): number | undefined {
  const header = req.headers['x-mock-force-status'];
  if (typeof header !== 'string' || header === '') return undefined;
  const scenario = req.headers['x-mock-scenario'];
  const key = typeof scenario === 'string' ? scenario : header;
  const statuses = header.split(',').map((value) => Number.parseInt(value.trim(), 10));
  const attempt = forcedCounters.get(key) ?? 0;
  forcedCounters.set(key, attempt + 1);
  return statuses[attempt];
}

export function resetForcedStatuses(): void {
  forcedCounters.clear();
}

export async function applyDelay(options: ChaosOptions): Promise<void> {
  const span = Math.max(0, options.maxDelayMs - options.minDelayMs);
  const delay = options.minDelayMs + Math.floor(options.random() * (span + 1));
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

export function shouldFail(options: ChaosOptions): boolean {
  return options.random() < options.failureRate;
}
```

`packages/mock-server/src/handlers/auth.ts`:
```ts
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
```

`packages/mock-server/src/router.ts`:
```ts
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
```

`packages/mock-server/src/server.ts`:
```ts
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
```

`packages/mock-server/src/index.ts`:
```ts
import { createServer, defaultConfig } from './server.js';

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const port = num('PORT', 4000);
const config = defaultConfig({
  tokenTtlSeconds: num('TOKEN_TTL_SECONDS', 3600),
  failureRate: num('FAILURE_RATE', 0.1),
  minDelayMs: num('MIN_DELAY_MS', 200),
  maxDelayMs: num('MAX_DELAY_MS', 500),
  lifecycle: {
    reviewMs: num('LIFECYCLE_REVIEW_MS', 5000),
    decisionMs: num('LIFECYCLE_DECISION_MS', 10_000),
    rejectAboveAmount: num('LIFECYCLE_REJECT_ABOVE', 100_000),
  },
});

createServer(config).listen(port, () => {
  console.log(`Mock insurance API đang chạy tại http://localhost:${port}`);
  console.log(`FAILURE_RATE=${config.failureRate} delay=${config.minDelayMs}-${config.maxDelayMs}ms`);
});
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/mock-server/test/auth-endpoint.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Chạy thử server thật**

Run: `pnpm mock-server` rồi ở terminal khác chạy
```bash
curl -s -X POST http://localhost:4000/api/v1/auth/token -H 'content-type: application/json' -d '{"apiKey":"pk_test_abc"}'
```
Expected: JSON có `accessToken`. Dừng server bằng Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add packages/mock-server/src packages/mock-server/test/auth-endpoint.test.ts
git commit -m "feat(mock-server): khung http, chaos middleware và endpoint lấy token"
```

---

### Task 7: Handler cho claim

**Files:**
- Create: `packages/mock-server/src/handlers/claims.ts`
- Modify: `packages/mock-server/src/router.ts`
- Test: `packages/mock-server/test/claims-endpoint.test.ts`

**Interfaces:**
- Consumes: `authenticate`, `ServerConfig`, `Store`, `validateCreateClaim`, `computeStatus`, `buildStatusHistory`
- Produces: `handleCreateClaim`, `handleGetClaim`, `handleListClaims`; hàm `toClaimResponse(claim: StoredClaim, nowMs: number, cfg: LifecycleConfig): ClaimResponse` với `ClaimResponse` gồm `id`, `policyId`, `claimType`, `diagnosisCode`, `treatmentDate`, `amount`, `currency`, `status`, `statusHistory`, `createdAt`, `updatedAt`

- [ ] **Step 1: Viết test thất bại**

`packages/mock-server/test/claims-endpoint.test.ts`:
```ts
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, defaultConfig } from '../src/server.js';

let server: Server;
let baseUrl: string;
let token: string;

const VALID = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  ...extra,
});

beforeAll(async () => {
  server = createServer(defaultConfig({ failureRate: 0, minDelayMs: 0, maxDelayMs: 0 }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;
  const res = await fetch(`${baseUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: 'pk_test_abc' }),
  });
  token = ((await res.json()) as { accessToken: string }).accessToken;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('claims endpoints', () => {
  it('tạo claim trả về 201 và trạng thái PENDING', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(VALID) });
    expect(res.status).toBe(201);
    const claim = (await res.json()) as { id: string; status: string; statusHistory: unknown[] };
    expect(claim.id).toMatch(/^CLM-\d{6}$/);
    expect(claim.status).toBe('PENDING');
    expect(claim.statusHistory).toHaveLength(1);
  });

  it('thiếu token thì trả 401 UNAUTHORIZED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('body sai thì trả 400 kèm lỗi từng field', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...VALID, policyId: 'x', amount: -1 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.error.fields).sort()).toEqual(['amount', 'policyId']);
  });

  it('dùng lại Idempotency-Key với cùng body thì trả lại claim cũ', async () => {
    const headers = authHeaders({ 'idempotency-key': 'key-abc' });
    const first = await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers, body: JSON.stringify(VALID) });
    const second = await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers, body: JSON.stringify(VALID) });
    expect(second.status).toBe(201);
    expect(((await second.json()) as { id: string }).id).toBe(((await first.json()) as { id: string }).id);
  });

  it('dùng lại Idempotency-Key với body khác thì trả 409', async () => {
    const headers = authHeaders({ 'idempotency-key': 'key-conflict' });
    await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers, body: JSON.stringify(VALID) });
    const res = await fetch(`${baseUrl}/api/v1/claims`, { method: 'POST', headers, body: JSON.stringify({ ...VALID, amount: 999 }) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('lấy claim không tồn tại thì trả 404', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims/CLM-999999`, { headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it('liệt kê claim có phân trang và lọc theo status', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims?status=PENDING&page=1&pageSize=2`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { status: string }[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.data.every((claim) => claim.status === 'PENDING')).toBe(true);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(2);
    expect(body.pagination.totalPages).toBe(Math.ceil(body.pagination.total / 2));
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/mock-server/test/claims-endpoint.test.ts`
Expected: FAIL, các request tới `/api/v1/claims` trả 404.

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/mock-server/src/handlers/claims.ts`:
```ts
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendError, sendJson } from '../http.js';
import { buildStatusHistory, computeStatus } from '../lifecycle.js';
import type { AuthContext } from '../router.js';
import type { ServerConfig } from '../server.js';
import type { ClaimInput, StoredClaim } from '../store.js';
import type { ClaimStatus, LifecycleConfig, StatusHistoryEntry } from '../types.js';
import { validateCreateClaim } from '../validation.js';

export interface ClaimResponse {
  id: string;
  policyId: string;
  claimType: string;
  diagnosisCode: string;
  treatmentDate: string;
  amount: number;
  currency: string;
  status: ClaimStatus;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export function toClaimResponse(claim: StoredClaim, nowMs: number, cfg: LifecycleConfig): ClaimResponse {
  const history = buildStatusHistory(claim.createdAtMs, claim.amount, nowMs, cfg);
  const last = history[history.length - 1];
  return {
    id: claim.id,
    policyId: claim.policyId,
    claimType: claim.claimType,
    diagnosisCode: claim.diagnosisCode,
    treatmentDate: claim.treatmentDate,
    amount: claim.amount,
    currency: claim.currency,
    status: computeStatus(claim.createdAtMs, claim.amount, nowMs, cfg),
    statusHistory: history,
    createdAt: new Date(claim.createdAtMs).toISOString(),
    updatedAt: last?.at ?? new Date(claim.createdAtMs).toISOString(),
  };
}

export async function handleCreateClaim(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  auth: AuthContext,
): Promise<void> {
  const body = await readJsonBody(req);
  if (body === undefined) {
    sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    return;
  }
  const now = config.now();
  const idempotencyKey = req.headers['idempotency-key'];
  const bodyHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');

  if (typeof idempotencyKey === 'string' && idempotencyKey !== '') {
    const existing = config.store.getIdempotent(auth.apiKey, idempotencyKey);
    if (existing !== undefined) {
      if (existing.bodyHash !== bodyHash) {
        sendError(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was already used with a different body');
        return;
      }
      sendJson(res, existing.status, existing.response);
      return;
    }
  }

  const errors = validateCreateClaim(body, now);
  if (Object.keys(errors).length > 0) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', errors);
    return;
  }

  const claim = config.store.createClaim(auth.apiKey, body as ClaimInput, now);
  const response = toClaimResponse(claim, now, config.lifecycle);
  if (typeof idempotencyKey === 'string' && idempotencyKey !== '') {
    config.store.setIdempotent(auth.apiKey, idempotencyKey, { bodyHash, status: 201, response });
  }
  sendJson(res, 201, response);
}

export function handleGetClaim(
  res: ServerResponse,
  config: ServerConfig,
  auth: AuthContext,
  claimId: string,
): void {
  const claim = config.store.getClaim(auth.apiKey, claimId);
  if (claim === undefined) {
    sendError(res, 404, 'CLAIM_NOT_FOUND', `Claim ${claimId} was not found`);
    return;
  }
  sendJson(res, 200, toClaimResponse(claim, config.now(), config.lifecycle));
}

export function handleListClaims(
  res: ServerResponse,
  config: ServerConfig,
  auth: AuthContext,
  query: URLSearchParams,
): void {
  const now = config.now();
  const status = query.get('status');
  const page = Math.max(1, Number.parseInt(query.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.get('pageSize') ?? '20', 10) || 20));

  const all = config.store
    .listClaims(auth.apiKey)
    .map((claim) => toClaimResponse(claim, now, config.lifecycle))
    .filter((claim) => status === null || claim.status === status);

  const start = (page - 1) * pageSize;
  sendJson(res, 200, {
    data: all.slice(start, start + pageSize),
    pagination: { page, pageSize, total: all.length, totalPages: Math.ceil(all.length / pageSize) },
  });
}
```

Trong `packages/mock-server/src/router.ts`, thêm import và chèn các nhánh route ngay trước nhánh 404:
```ts
import { handleCreateClaim, handleGetClaim, handleListClaims } from './handlers/claims.js';

// ... bên trong hàm route, sau nhánh /auth/token:
  const claimMatch = /^\/api\/v1\/claims\/([^/]+)$/.exec(url.pathname);

  if (method === 'POST' && url.pathname === '/api/v1/claims') {
    const auth = authenticate(req, res, config);
    if (auth === undefined) return;
    await handleCreateClaim(req, res, config, auth);
    return;
  }

  if (method === 'GET' && url.pathname === '/api/v1/claims') {
    const auth = authenticate(req, res, config);
    if (auth === undefined) return;
    handleListClaims(res, config, auth, url.searchParams);
    return;
  }

  if (method === 'GET' && claimMatch !== null) {
    const auth = authenticate(req, res, config);
    if (auth === undefined) return;
    handleGetClaim(res, config, auth, claimMatch[1] as string);
    return;
  }
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/mock-server/test/claims-endpoint.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add packages/mock-server/src packages/mock-server/test/claims-endpoint.test.ts
git commit -m "feat(mock-server): endpoint tạo, lấy và liệt kê claim kèm idempotency"
```

---

### Task 8: Handler cho tài liệu

**Files:**
- Create: `packages/mock-server/src/handlers/documents.ts`
- Modify: `packages/mock-server/src/router.ts`
- Test: `packages/mock-server/test/documents-endpoint.test.ts`

**Interfaces:**
- Consumes: `authenticate`, `ServerConfig`, `Store`, `DOCUMENT_TYPES`
- Produces: `handleUploadDocument(req, res, config, auth, claimId): Promise<void>`; `handleListDocuments(res, config, auth, claimId): void`; `DocumentResponse` gồm `id`, `claimId`, `type`, `filename`, `contentType`, `size`, `uploadedAt`

- [ ] **Step 1: Viết test thất bại**

`packages/mock-server/test/documents-endpoint.test.ts`:
```ts
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, defaultConfig } from '../src/server.js';

let server: Server;
let baseUrl: string;
let token: string;
let claimId: string;

beforeAll(async () => {
  server = createServer(defaultConfig({ failureRate: 0, minDelayMs: 0, maxDelayMs: 0 }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const tokenRes = await fetch(`${baseUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: 'pk_test_abc' }),
  });
  token = ((await tokenRes.json()) as { accessToken: string }).accessToken;

  const claimRes = await fetch(`${baseUrl}/api/v1/claims`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      policyId: 'POL-123',
      claimType: 'OUTPATIENT',
      diagnosisCode: 'J06.9',
      treatmentDate: '2024-03-15',
      amount: 15000,
      currency: 'THB',
    }),
  });
  claimId = ((await claimRes.json()) as { id: string }).id;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

const upload = (targetClaimId: string, type: string, filename: string, contentType: string): Promise<Response> => {
  const form = new FormData();
  form.set('type', type);
  form.set('file', new Blob([Buffer.from('%PDF-1.4 nội dung giả')], { type: contentType }), filename);
  return fetch(`${baseUrl}/api/v1/claims/${targetClaimId}/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
};

describe('document endpoints', () => {
  it('upload thành công trả 201 kèm metadata', async () => {
    const res = await upload(claimId, 'medical_receipt', 'receipt.pdf', 'application/pdf');
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { id: string; type: string; filename: string; size: number };
    expect(doc.id).toMatch(/^DOC-\d{6}$/);
    expect(doc.type).toBe('medical_receipt');
    expect(doc.filename).toBe('receipt.pdf');
    expect(doc.size).toBeGreaterThan(0);
  });

  it('từ chối loại tài liệu ngoài danh sách', async () => {
    const res = await upload(claimId, 'selfie', 'receipt.pdf', 'application/pdf');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { fields: Record<string, string> } };
    expect(body.error.fields.type).toContain('must be one of');
  });

  it('từ chối định dạng file không hỗ trợ', async () => {
    const res = await upload(claimId, 'other', 'note.txt', 'text/plain');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { fields: Record<string, string> } }).error.fields.file).toContain('must be');
  });

  it('upload vào claim không tồn tại thì trả 404', async () => {
    const res = await upload('CLM-999999', 'medical_receipt', 'receipt.pdf', 'application/pdf');
    expect(res.status).toBe(404);
  });

  it('liệt kê tài liệu của claim', async () => {
    const res = await fetch(`${baseUrl}/api/v1/claims/${claimId}/documents`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { claimId: string }[] };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every((doc) => doc.claimId === claimId)).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/mock-server/test/documents-endpoint.test.ts`
Expected: FAIL, các request trả 404.

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/mock-server/src/handlers/documents.ts`:
```ts
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
```

Trong `packages/mock-server/src/router.ts`, thêm import và hai nhánh route trước nhánh 404:
```ts
import { handleListDocuments, handleUploadDocument } from './handlers/documents.js';

  const documentMatch = /^\/api\/v1\/claims\/([^/]+)\/documents$/.exec(url.pathname);

  if (method === 'POST' && documentMatch !== null) {
    const auth = authenticate(req, res, config);
    if (auth === undefined) return;
    await handleUploadDocument(req, res, config, auth, documentMatch[1] as string);
    return;
  }

  if (method === 'GET' && documentMatch !== null) {
    const auth = authenticate(req, res, config);
    if (auth === undefined) return;
    handleListDocuments(res, config, auth, documentMatch[1] as string);
    return;
  }
```

Lưu ý thứ tự: nhánh `documentMatch` phải đặt **trước** nhánh `claimMatch` của Task 7, vì `claimMatch` cũng khớp với đường dẫn có hậu tố `/documents` nếu regex không neo chặt. Regex ở Task 7 đã neo bằng `$` nên không đụng nhau, nhưng vẫn giữ thứ tự này cho an toàn.

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/mock-server/test/documents-endpoint.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Chạy toàn bộ test của mock server**

Run: `pnpm vitest run packages/mock-server`
Expected: PASS, 40 test.

- [ ] **Step 6: Commit**

```bash
git add packages/mock-server/src packages/mock-server/test/documents-endpoint.test.ts
git commit -m "feat(mock-server): endpoint upload và liệt kê tài liệu bằng busboy"
```

---

### Task 9: Type công khai và cây lỗi của SDK

**Files:**
- Create: `packages/sdk/src/types.ts`, `packages/sdk/src/errors.ts`
- Test: `packages/sdk/test/errors.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: toàn bộ type domain trong `src/types.js`; các class `InsuranceSDKError`, `ValidationError`, `AuthError`, `NetworkError`, `TimeoutError`, `ApiError`; `mapHttpError(status: number, rawBody: string, attempts: number): InsuranceSDKError`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiError, AuthError, mapHttpError, NetworkError, TimeoutError, ValidationError } from '../src/errors.js';

const body = (payload: unknown): string => JSON.stringify(payload);

describe('cây lỗi', () => {
  it('TimeoutError vẫn là NetworkError', () => {
    const error = new TimeoutError('hết thời gian', 30_000, 3);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.timeoutMs).toBe(30_000);
    expect(error.attempts).toBe(3);
  });

  it('mọi lỗi đều giữ đúng tên class sau khi kế thừa', () => {
    expect(new ValidationError('sai', { a: 'required' }, 'CLIENT_VALIDATION').name).toBe('ValidationError');
    expect(new AuthError('sai key', 'invalid_api_key').name).toBe('AuthError');
    expect(new ApiError('lỗi', 500, 'INTERNAL_ERROR', false).name).toBe('ApiError');
  });
});

describe('mapHttpError', () => {
  it('400 thành ValidationError kèm fields', () => {
    const error = mapHttpError(400, body({ error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { amount: 'must be positive' }, requestId: 'req_1' } }), 1);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields).toEqual({ amount: 'must be positive' });
    expect(error.requestId).toBe('req_1');
  });

  it('401 TOKEN_EXPIRED thành AuthError với reason token_expired', () => {
    const error = mapHttpError(401, body({ error: { code: 'TOKEN_EXPIRED', message: 'hết hạn' } }), 1);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).reason).toBe('token_expired');
  });

  it('401 INVALID_API_KEY thành AuthError với reason invalid_api_key', () => {
    const error = mapHttpError(401, body({ error: { code: 'INVALID_API_KEY', message: 'sai key' } }), 1);
    expect((error as AuthError).reason).toBe('invalid_api_key');
  });

  it('403 thành AuthError với reason forbidden', () => {
    expect((mapHttpError(403, body({ error: { code: 'FORBIDDEN', message: 'cấm' } }), 1) as AuthError).reason).toBe('forbidden');
  });

  it('404 thành ApiError không đáng retry', () => {
    const error = mapHttpError(404, body({ error: { code: 'CLAIM_NOT_FOUND', message: 'không thấy' } }), 1) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.retryable).toBe(false);
  });

  it('503 thành ApiError đáng retry', () => {
    expect((mapHttpError(503, body({ error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }), 4) as ApiError).retryable).toBe(true);
  });

  it('body không phải JSON vẫn tạo được ApiError', () => {
    const error = mapHttpError(500, '<html>lỗi</html>', 1) as ApiError;
    expect(error.status).toBe(500);
    expect(error.code).toBe('UNKNOWN_ERROR');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/errors.test.ts`
Expected: FAIL với "Failed to resolve import ../src/errors.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/types.ts`:
```ts
import type { Readable } from 'node:stream';

/** Trạng thái của một hồ sơ bồi thường. */
export type ClaimStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

/** Trạng thái cuối, khi đã có quyết định. */
export type TerminalClaimStatus = Extract<ClaimStatus, 'APPROVED' | 'REJECTED'>;

/** Loại hình điều trị của hồ sơ. */
export type ClaimType = 'OUTPATIENT' | 'INPATIENT' | 'DENTAL' | 'MATERNITY';

/** Loại tài liệu đính kèm hồ sơ. */
export type DocumentType =
  | 'medical_receipt'
  | 'discharge_summary'
  | 'prescription'
  | 'lab_result'
  | 'id_document'
  | 'other';

/** Dữ liệu cần có để tạo một hồ sơ mới. */
export interface CreateClaimInput {
  /** Mã hợp đồng bảo hiểm, dạng POL-<số>. */
  policyId: string;
  /** Loại hình điều trị. */
  claimType: ClaimType;
  /** Mã chẩn đoán ICD-10, ví dụ J06.9. */
  diagnosisCode: string;
  /** Ngày điều trị theo định dạng YYYY-MM-DD, không được ở tương lai. */
  treatmentDate: string;
  /** Số tiền yêu cầu chi trả, lớn hơn 0, tối đa 2 chữ số thập phân. */
  amount: number;
  /** Mã tiền tệ ISO 4217, ví dụ THB. */
  currency: string;
}

/** Một mốc trong lịch sử trạng thái của hồ sơ. */
export interface StatusHistoryEntry {
  status: ClaimStatus;
  /** Thời điểm theo ISO 8601. */
  at: string;
}

/** Hồ sơ bồi thường trả về từ API. */
export interface Claim extends CreateClaimInput {
  id: string;
  status: ClaimStatus;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/** Bộ lọc khi liệt kê hồ sơ. */
export interface ListClaimsParams {
  status?: ClaimStatus;
  /** Trang bắt đầu từ 1. */
  page?: number;
  /** Số bản ghi mỗi trang, tối đa 100. */
  pageSize?: number;
}

/** Thông tin phân trang. */
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Kết quả có phân trang. */
export interface PaginatedResult<T> {
  data: T[];
  pagination: Pagination;
}

/** Tài liệu đã upload cho một hồ sơ. */
export interface ClaimDocument {
  id: string;
  claimId: string;
  type: DocumentType;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

/** Chi tiết tiến độ upload. */
export interface ProgressDetail {
  bytesSent: number;
  totalBytes: number;
}

/** Callback nhận tiến độ upload. */
export type ProgressHandler = (percent: number, detail: ProgressDetail) => void;

/** Nguồn file để upload: buffer, đường dẫn, hoặc stream kèm kích thước. */
export type FileInput =
  | Buffer
  | string
  | { stream: Readable; size: number; filename: string; contentType?: string };

/** Tuỳ chọn cho mỗi lời gọi API. */
export interface RequestOptions {
  /** Khoá idempotency tự đặt. Nếu bỏ trống, SDK tự sinh cho request POST. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Tuỳ chọn khi upload tài liệu. */
export interface UploadOptions extends RequestOptions {
  type: DocumentType;
  onProgress?: ProgressHandler;
  /** Ghi đè tên file suy ra từ đường dẫn. */
  filename?: string;
  /** Ghi đè content type suy ra từ đuôi file. */
  contentType?: string;
}

/** Callback nhận thay đổi trạng thái. */
export type StatusListener = (newStatus: ClaimStatus, claim: Claim) => void;

/** Tuỳ chọn khi theo dõi trạng thái. */
export interface WatchOptions {
  /** Khoảng cách giữa hai lần poll, mặc định 2000ms. */
  intervalMs?: number;
  /** Thời gian theo dõi tối đa, mặc định 300000ms. */
  maxDurationMs?: number;
  /** Trạng thái đã biết trước khi bắt đầu theo dõi. */
  initialStatus?: ClaimStatus;
  onError?: (error: unknown) => void;
}

/** Hàm dừng theo dõi. Gọi nhiều lần vẫn an toàn. */
export type Unsubscribe = () => void;

/** Logger tối giản để debug. */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
}

/** Cấu hình khởi tạo SDK. */
export interface InsuranceSDKConfig {
  apiKey: string;
  /** Mặc định 'sandbox'. */
  environment?: 'sandbox' | 'production';
  /** Timeout cho mỗi lần thử, mặc định 30000ms. */
  timeout?: number;
  /** Số lần thử lại tối đa, mặc định 3. */
  maxRetries?: number;
  /** Ghi đè URL suy ra từ environment. */
  baseUrl?: string;
  /** Header gắn vào mọi request. */
  defaultHeaders?: Record<string, string>;
  logger?: Logger;
}
```

`packages/sdk/src/errors.ts`:
```ts
/** Lớp cơ sở của mọi lỗi do SDK ném ra. */
export class InsuranceSDKError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(message: string, code: string, requestId?: string) {
    super(message);
    this.name = 'InsuranceSDKError';
    this.code = code;
    this.requestId = requestId;
  }
}

/** Dữ liệu không hợp lệ, do validate phía client hoặc server trả 400. */
export class ValidationError extends InsuranceSDKError {
  readonly fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string>, code = 'VALIDATION_ERROR', requestId?: string) {
    super(message, code, requestId);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/** Xác thực thất bại. Cần kiểm tra lại API key hoặc đăng nhập lại. */
export class AuthError extends InsuranceSDKError {
  readonly reason: 'invalid_api_key' | 'token_expired' | 'forbidden';

  constructor(message: string, reason: 'invalid_api_key' | 'token_expired' | 'forbidden', requestId?: string) {
    super(message, 'AUTH_ERROR', requestId);
    this.name = 'AuthError';
    this.reason = reason;
  }
}

/** Không gọi được tới API, hoặc đã hết số lần thử lại. */
export class NetworkError extends InsuranceSDKError {
  readonly attempts: number;
  readonly cause: unknown;

  constructor(message: string, attempts: number, code = 'NETWORK_ERROR', cause?: unknown) {
    super(message, code);
    this.name = 'NetworkError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

/** Một lần thử vượt quá timeout. */
export class TimeoutError extends NetworkError {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, attempts: number) {
    super(message, attempts, 'TIMEOUT');
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** API trả về lỗi không thuộc các nhóm trên. */
export class ApiError extends InsuranceSDKError {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, code: string, retryable: boolean, requestId?: string) {
    super(message, code, requestId);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Chuyển một response lỗi của API thành lỗi có kiểu tương ứng. */
export function mapHttpError(status: number, rawBody: string, attempts: number): InsuranceSDKError {
  let envelope: ErrorEnvelope = {};
  try {
    envelope = JSON.parse(rawBody) as ErrorEnvelope;
  } catch {
    envelope = {};
  }
  const code = envelope.error?.code ?? 'UNKNOWN_ERROR';
  const message = envelope.error?.message ?? `Request failed with status ${status}`;
  const requestId = envelope.error?.requestId;

  if (status === 400) {
    return new ValidationError(message, envelope.error?.fields ?? {}, code, requestId);
  }
  if (status === 401) {
    return new AuthError(message, code === 'INVALID_API_KEY' ? 'invalid_api_key' : 'token_expired', requestId);
  }
  if (status === 403) {
    return new AuthError(message, 'forbidden', requestId);
  }
  return new ApiError(`${message} (attempts: ${attempts})`, status, code, RETRYABLE_STATUSES.has(status), requestId);
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/errors.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/errors.ts packages/sdk/test/errors.test.ts
git commit -m "feat(sdk): type công khai và cây lỗi có kiểu"
```

---

### Task 10: Chuẩn hoá config

**Files:**
- Create: `packages/sdk/src/config.ts`
- Test: `packages/sdk/test/config.test.ts`

**Interfaces:**
- Consumes: `InsuranceSDKConfig`, `Logger` (Task 9); `ValidationError` (Task 9)
- Produces: `ENVIRONMENT_BASE_URLS: Record<'sandbox' | 'production', string>`; `interface ResolvedConfig { apiKey: string; baseUrl: string; timeout: number; maxRetries: number; defaultHeaders: Record<string, string>; logger: Logger | undefined }`; `resolveConfig(config: InsuranceSDKConfig): ResolvedConfig`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { ValidationError } from '../src/errors.js';

describe('resolveConfig', () => {
  it('điền giá trị mặc định', () => {
    const config = resolveConfig({ apiKey: 'pk_test_abc' });
    expect(config.baseUrl).toBe('http://localhost:4000');
    expect(config.timeout).toBe(30_000);
    expect(config.maxRetries).toBe(3);
    expect(config.defaultHeaders).toEqual({});
  });

  it('environment production trỏ tới url production', () => {
    expect(resolveConfig({ apiKey: 'pk_test_abc', environment: 'production' }).baseUrl).toContain('https://');
  });

  it('baseUrl ghi đè environment và bị cắt dấu gạch chéo cuối', () => {
    expect(resolveConfig({ apiKey: 'pk_test_abc', environment: 'production', baseUrl: 'http://127.0.0.1:9999/' }).baseUrl).toBe('http://127.0.0.1:9999');
  });

  it('thiếu apiKey thì ném ValidationError', () => {
    expect(() => resolveConfig({ apiKey: '' })).toThrow(ValidationError);
    try {
      resolveConfig({ apiKey: '' });
    } catch (error) {
      expect((error as ValidationError).fields).toEqual({ apiKey: 'required' });
      expect((error as ValidationError).code).toBe('CLIENT_VALIDATION');
    }
  });

  it('timeout và maxRetries không hợp lệ thì ném ValidationError', () => {
    expect(() => resolveConfig({ apiKey: 'pk_test_abc', timeout: 0 })).toThrow(ValidationError);
    expect(() => resolveConfig({ apiKey: 'pk_test_abc', maxRetries: -1 })).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/config.test.ts`
Expected: FAIL với "Failed to resolve import ../src/config.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/config.ts`:
```ts
import { ValidationError } from './errors.js';
import type { InsuranceSDKConfig, Logger } from './types.js';

/** URL mặc định cho từng môi trường. */
export const ENVIRONMENT_BASE_URLS: Record<'sandbox' | 'production', string> = {
  sandbox: 'http://localhost:4000',
  production: 'https://api.insurance.example.com',
};

/** Config đã điền đủ giá trị mặc định. */
export interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  defaultHeaders: Record<string, string>;
  logger: Logger | undefined;
}

/** Kiểm tra và chuẩn hoá config do đối tác truyền vào. */
export function resolveConfig(config: InsuranceSDKConfig): ResolvedConfig {
  const fields: Record<string, string> = {};
  if (typeof config.apiKey !== 'string' || config.apiKey === '') fields.apiKey = 'required';

  const timeout = config.timeout ?? 30_000;
  if (!Number.isFinite(timeout) || timeout <= 0) fields.timeout = 'must be a positive number of milliseconds';

  const maxRetries = config.maxRetries ?? 3;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) fields.maxRetries = 'must be an integer greater than or equal to 0';

  if (Object.keys(fields).length > 0) {
    throw new ValidationError('Invalid SDK configuration', fields, 'CLIENT_VALIDATION');
  }

  const baseUrl = config.baseUrl ?? ENVIRONMENT_BASE_URLS[config.environment ?? 'sandbox'];

  return {
    apiKey: config.apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    timeout,
    maxRetries,
    defaultHeaders: config.defaultHeaders ?? {},
    logger: config.logger,
  };
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/config.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/config.ts packages/sdk/test/config.test.ts
git commit -m "feat(sdk): chuẩn hoá config và ánh xạ environment"
```

---

### Task 11: Clock và transport trên node:http

**Files:**
- Create: `packages/sdk/src/core/clock.ts`, `packages/sdk/src/core/transport.ts`
- Test: `packages/sdk/test/transport.test.ts`

**Interfaces:**
- Consumes: `NetworkError`, `TimeoutError` (Task 9)
- Produces: `interface Clock { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> }`; `systemClock: Clock`; `type TransportBody = { kind: 'json'; value: unknown } | { kind: 'stream'; create: () => { stream: Readable; contentLength: number; contentType: string }; onProgress?: ProgressHandler }`; `interface TransportRequest { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: TransportBody; signal?: AbortSignal; timeoutMs: number }`; `interface TransportResponse { status: number; headers: Record<string, string>; body: string }`; `interface Transport { send(request: TransportRequest): Promise<TransportResponse> }`; `class NodeHttpTransport implements Transport`

Ghi chú: nhánh `kind: 'stream'` được khai báo ngay từ task này nhưng phần gửi stream sẽ được hiện thực ở Task 17. Ở task này, gọi transport với body stream sẽ ném `Error('stream body chưa được hỗ trợ')`.

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/transport.test.ts`:
```ts
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
      setTimeout(() => res.end('muộn'), 2000);
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
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('NodeHttpTransport', () => {
  it('gửi body JSON và header rồi đọc được response', async () => {
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

  it('quá timeout thì ném TimeoutError', async () => {
    await expect(
      transport.send({ method: 'GET', url: `${baseUrl}/slow`, headers: {}, timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('không kết nối được thì ném NetworkError', async () => {
    await expect(
      transport.send({ method: 'GET', url: 'http://127.0.0.1:1/unreachable', headers: {}, timeoutMs: 2000 }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('bị abort thì ném NetworkError có code REQUEST_ABORTED', async () => {
    const controller = new AbortController();
    const promise = transport.send({ method: 'GET', url: `${baseUrl}/slow`, headers: {}, timeoutMs: 5000, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  });
});

describe('systemClock', () => {
  it('sleep bị abort thì reject', async () => {
    const { systemClock } = await import('../src/core/clock.js');
    const controller = new AbortController();
    const promise = systemClock.sleep(5000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/transport.test.ts`
Expected: FAIL với "Failed to resolve import ../src/core/transport.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/core/clock.ts`:
```ts
/** Trừu tượng hoá thời gian để test không phải chờ thật. */
export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Clock dùng đồng hồ và timer thật của hệ thống. */
export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(signal.reason ?? new Error('Aborted'));
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('Aborted'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
};
```

`packages/sdk/src/core/transport.ts`:
```ts
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
      if (req.body?.kind === 'stream') {
        reject(new Error('stream body chưa được hỗ trợ'));
        return;
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

      if (payload !== undefined) clientRequest.write(payload);
      clientRequest.end();
    });
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/transport.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/core/clock.ts packages/sdk/src/core/transport.ts packages/sdk/test/transport.test.ts
git commit -m "feat(sdk): clock và transport node:http cho body JSON"
```

---

### Task 12: Phân loại retry và tính backoff

**Files:**
- Create: `packages/sdk/src/core/retry.ts`
- Test: `packages/sdk/test/retry.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: `isRetryableStatus(status: number): boolean`; `parseRetryAfter(header: string | undefined, nowMs: number): number | undefined`; `interface BackoffOptions { baseMs: number; capMs: number; random: () => number }`; `DEFAULT_BACKOFF: { baseMs: number; capMs: number }`; `computeDelayMs(attempt: number, retryAfterMs: number | undefined, options: BackoffOptions): number`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/retry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeDelayMs, DEFAULT_BACKOFF, isRetryableStatus, parseRetryAfter } from '../src/core/retry.js';

const options = (random: number) => ({ ...DEFAULT_BACKOFF, random: () => random });

describe('isRetryableStatus', () => {
  it('retry với 429, 502, 503, 504', () => {
    for (const status of [429, 502, 503, 504]) expect(isRetryableStatus(status)).toBe(true);
  });

  it('không retry với 400, 401, 403, 404, 409, 413, 422, 500', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422, 500]) expect(isRetryableStatus(status)).toBe(false);
  });
});

describe('computeDelayMs', () => {
  it('nhân đôi trần theo số lần thử', () => {
    expect(computeDelayMs(0, undefined, options(1))).toBe(250);
    expect(computeDelayMs(1, undefined, options(1))).toBe(500);
    expect(computeDelayMs(2, undefined, options(1))).toBe(1000);
  });

  it('rải đều trong khoảng từ 0 tới trần', () => {
    expect(computeDelayMs(1, undefined, options(0))).toBe(0);
    expect(computeDelayMs(1, undefined, options(0.5))).toBe(250);
  });

  it('không vượt quá cap 8000ms', () => {
    expect(computeDelayMs(20, undefined, options(1))).toBe(8000);
  });

  it('ưu tiên Retry-After và cộng thêm chút ngẫu nhiên', () => {
    expect(computeDelayMs(0, 2000, options(0))).toBe(2000);
    expect(computeDelayMs(0, 2000, options(1))).toBe(2250);
  });
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2024-06-01T00:00:00.000Z');

  it('đọc được dạng số giây', () => {
    expect(parseRetryAfter('3', now)).toBe(3000);
  });

  it('đọc được dạng HTTP date', () => {
    expect(parseRetryAfter('Sat, 01 Jun 2024 00:00:05 GMT', now)).toBe(5000);
  });

  it('trả undefined khi thiếu header hoặc không đọc được', () => {
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
    expect(parseRetryAfter('không-phải-số', now)).toBeUndefined();
  });

  it('không trả giá trị âm khi mốc thời gian đã qua', () => {
    expect(parseRetryAfter('Sat, 01 Jun 2024 00:00:00 GMT', now + 10_000)).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/retry.test.ts`
Expected: FAIL với "Failed to resolve import ../src/core/retry.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/core/retry.ts`:
```ts
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/** Giá trị mặc định cho thuật toán full jitter. */
export const DEFAULT_BACKOFF = { baseMs: 250, capMs: 8000 } as const;

/** Lượng ngẫu nhiên cộng thêm khi server có chỉ định Retry-After. */
const RETRY_AFTER_JITTER_MS = 250;

/** Tuỳ chọn tính backoff. `random` được inject để test deterministic. */
export interface BackoffOptions {
  baseMs: number;
  capMs: number;
  random: () => number;
}

/** Status nào đáng thử lại. */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** Đọc header Retry-After ở cả hai dạng: số giây hoặc HTTP date. */
export function parseRetryAfter(header: string | undefined, nowMs: number): number | undefined {
  if (header === undefined) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const target = Date.parse(header);
  if (Number.isNaN(target)) return undefined;
  return Math.max(0, target - nowMs);
}

/**
 * Tính thời gian chờ trước lần thử tiếp theo theo công thức full jitter:
 * `random(0, min(cap, base * 2^attempt))`.
 */
export function computeDelayMs(
  attempt: number,
  retryAfterMs: number | undefined,
  options: BackoffOptions,
): number {
  if (retryAfterMs !== undefined) {
    return Math.round(retryAfterMs + options.random() * RETRY_AFTER_JITTER_MS);
  }
  const ceiling = Math.min(options.capMs, options.baseMs * 2 ** attempt);
  return Math.round(options.random() * ceiling);
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/retry.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/core/retry.ts packages/sdk/test/retry.test.ts
git commit -m "feat(sdk): phân loại lỗi đáng retry và backoff full jitter"
```

---

### Task 13: AuthManager

**Files:**
- Create: `packages/sdk/src/core/auth.ts`, `packages/sdk/test/helpers.ts`
- Test: `packages/sdk/test/auth.test.ts`

**Interfaces:**
- Consumes: `Clock` (Task 11)
- Produces: `interface TokenResponse { accessToken: string; expiresAtMs: number }`; `interface Token extends TokenResponse { epoch: number }`; `interface AuthManagerOptions { requestToken: (signal?: AbortSignal) => Promise<TokenResponse>; clock: Clock; skewMs?: number }`; `class AuthManager` với `getToken(signal?: AbortSignal): Promise<Token>` và `invalidate(epoch: number): void`
- Produces (test helper): `class FakeClock implements Clock` với `advance(ms: number): void` và `sleep` resolve ngay nhưng ghi lại vào `sleeps: number[]`

- [ ] **Step 1: Viết helper và test thất bại**

`packages/sdk/test/helpers.ts`:
```ts
import type { Clock } from '../src/core/clock.js';
import type { Transport, TransportRequest, TransportResponse } from '../src/core/transport.js';

/** Clock giả: thời gian chỉ nhích khi test gọi advance, sleep không chờ thật. */
export class FakeClock implements Clock {
  readonly sleeps: number[] = [];
  private current: number;

  constructor(start = 1_700_000_000_000) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) throw signal.reason ?? new Error('Aborted');
    this.sleeps.push(ms);
    this.current += ms;
  }
}

/** Một phản hồi đã lập trình sẵn cho FakeTransport. */
export type FakeReply = TransportResponse | Error;

/** Transport giả: trả về lần lượt các phản hồi đã nạp và ghi lại mọi request. */
export class FakeTransport implements Transport {
  readonly requests: TransportRequest[] = [];
  private replies: FakeReply[] = [];

  queue(...replies: FakeReply[]): this {
    this.replies.push(...replies);
    return this;
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    this.requests.push(request);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error(`FakeTransport hết phản hồi cho ${request.method} ${request.url}`);
    if (reply instanceof Error) throw reply;
    return reply;
  }
}

/** Tạo nhanh một TransportResponse dạng JSON. */
export function jsonReply(status: number, payload: unknown, headers: Record<string, string> = {}): TransportResponse {
  return { status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) };
}
```

`packages/sdk/test/auth.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../src/core/auth.js';
import { FakeClock } from './helpers.js';

const makeManager = (expiresInMs = 3_600_000) => {
  const clock = new FakeClock();
  let counter = 0;
  const requestToken = vi.fn(async () => {
    counter += 1;
    return { accessToken: `token-${counter}`, expiresAtMs: clock.now() + expiresInMs };
  });
  return { clock, requestToken, manager: new AuthManager({ requestToken, clock }) };
};

describe('AuthManager', () => {
  it('lần đầu thì đi lấy token', async () => {
    const { manager, requestToken } = makeManager();
    expect((await manager.getToken()).accessToken).toBe('token-1');
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it('lần sau dùng lại token đã cache', async () => {
    const { manager, requestToken } = makeManager();
    await manager.getToken();
    await manager.getToken();
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it('refresh chủ động khi token còn dưới 60 giây', async () => {
    const { manager, requestToken, clock } = makeManager(120_000);
    await manager.getToken();
    clock.advance(61_000);
    expect((await manager.getToken()).accessToken).toBe('token-2');
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('nhiều lời gọi song song chỉ tạo một lần lấy token', async () => {
    const { manager, requestToken } = makeManager();
    const tokens = await Promise.all([manager.getToken(), manager.getToken(), manager.getToken(), manager.getToken(), manager.getToken()]);
    expect(requestToken).toHaveBeenCalledTimes(1);
    expect(new Set(tokens.map((token) => token.accessToken)).size).toBe(1);
  });

  it('invalidate đúng epoch thì lần sau lấy token mới', async () => {
    const { manager, requestToken } = makeManager();
    const token = await manager.getToken();
    manager.invalidate(token.epoch);
    expect((await manager.getToken()).accessToken).toBe('token-2');
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('invalidate với epoch cũ thì không xoá token mới', async () => {
    const { manager, requestToken } = makeManager();
    const first = await manager.getToken();
    manager.invalidate(first.epoch);
    const second = await manager.getToken();
    manager.invalidate(first.epoch);
    const third = await manager.getToken();
    expect(third.accessToken).toBe(second.accessToken);
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('lấy token thất bại thì không giữ lại promise hỏng', async () => {
    const clock = new FakeClock();
    const requestToken = vi
      .fn()
      .mockRejectedValueOnce(new Error('server bận'))
      .mockResolvedValueOnce({ accessToken: 'token-ok', expiresAtMs: clock.now() + 3_600_000 });
    const manager = new AuthManager({ requestToken, clock });
    await expect(manager.getToken()).rejects.toThrow('server bận');
    expect((await manager.getToken()).accessToken).toBe('token-ok');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/auth.test.ts`
Expected: FAIL với "Failed to resolve import ../src/core/auth.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/core/auth.ts`:
```ts
import type { Clock } from './clock.js';

/** Token thô do endpoint auth trả về. */
export interface TokenResponse {
  accessToken: string;
  expiresAtMs: number;
}

/** Token kèm epoch để phát hiện ai đang cầm token cũ. */
export interface Token extends TokenResponse {
  epoch: number;
}

export interface AuthManagerOptions {
  requestToken: (signal?: AbortSignal) => Promise<TokenResponse>;
  clock: Clock;
  /** Coi token là hết hạn sớm hơn thời điểm thật bấy nhiêu ms. Mặc định 60000. */
  skewMs?: number;
}

/**
 * Quản lý vòng đời JWT: cache, refresh chủ động trước khi hết hạn,
 * gộp nhiều lần refresh đồng thời thành một, và vô hiệu hoá theo epoch.
 */
export class AuthManager {
  private readonly options: Required<AuthManagerOptions>;
  private token: Token | undefined;
  private inflight: Promise<Token> | undefined;
  private epoch = 0;

  constructor(options: AuthManagerOptions) {
    this.options = { skewMs: 60_000, ...options };
  }

  /** Trả về token còn hiệu lực, tự đi lấy mới nếu cần. */
  async getToken(signal?: AbortSignal): Promise<Token> {
    const current = this.token;
    if (current !== undefined && current.expiresAtMs - this.options.skewMs > this.options.clock.now()) {
      return current;
    }
    if (this.inflight !== undefined) return this.inflight;

    this.inflight = this.options
      .requestToken(signal)
      .then((response) => {
        this.epoch += 1;
        const token: Token = { ...response, epoch: this.epoch };
        this.token = token;
        return token;
      })
      .finally(() => {
        this.inflight = undefined;
      });

    return this.inflight;
  }

  /**
   * Vô hiệu hoá token, nhưng chỉ khi epoch truyền vào đúng bằng epoch hiện tại.
   * Nhờ vậy nhiều request cùng gặp 401 không tạo ra chuỗi refresh dây chuyền.
   */
  invalidate(epoch: number): void {
    if (this.token?.epoch === epoch) this.token = undefined;
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/auth.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/core/auth.ts packages/sdk/test/helpers.ts packages/sdk/test/auth.test.ts
git commit -m "feat(sdk): AuthManager với cache, gộp refresh và epoch"
```

---

### Task 14: RequestPipeline

**Files:**
- Create: `packages/sdk/src/core/pipeline.ts`
- Test: `packages/sdk/test/pipeline.test.ts`

**Interfaces:**
- Consumes: `Transport`, `TransportBody` (Task 11); `Clock` (Task 11); `AuthManager` (Task 13); `computeDelayMs`, `isRetryableStatus`, `parseRetryAfter`, `DEFAULT_BACKOFF` (Task 12); `mapHttpError`, `AuthError`, `NetworkError` (Task 9); `Logger` (Task 9)
- Produces: `interface PipelineOptions { baseUrl: string; apiKey: string; timeoutMs: number; maxRetries: number; transport: Transport; clock: Clock; random: () => number; defaultHeaders: Record<string, string>; logger?: Logger }`; `interface PipelineRequest { method: 'GET' | 'POST'; path: string; query?: Record<string, string | number | undefined>; body?: TransportBody; idempotencyKey?: string; signal?: AbortSignal; retryable?: boolean }`; `class RequestPipeline` với `execute<T>(request: PipelineRequest): Promise<T>`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/pipeline.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiError, AuthError, NetworkError, ValidationError } from '../src/errors.js';
import { RequestPipeline } from '../src/core/pipeline.js';
import { FakeClock, FakeTransport, jsonReply } from './helpers.js';

const TOKEN = jsonReply(200, { accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 3600 });
const TOKEN_2 = jsonReply(200, { accessToken: 'jwt-2', tokenType: 'Bearer', expiresIn: 3600 });

const setup = (): { pipeline: RequestPipeline; transport: FakeTransport; clock: FakeClock } => {
  const transport = new FakeTransport();
  const clock = new FakeClock();
  const pipeline = new RequestPipeline({
    baseUrl: 'http://api.test',
    apiKey: 'pk_test_abc',
    timeoutMs: 30_000,
    maxRetries: 3,
    transport,
    clock,
    random: () => 0.5,
    defaultHeaders: { 'x-partner': 'acme' },
  });
  return { pipeline, transport, clock };
};

describe('RequestPipeline', () => {
  it('lấy token rồi gắn Authorization, default header và Idempotency-Key cho POST', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, { id: 'CLM-000001' }));

    const result = await pipeline.execute<{ id: string }>({ method: 'POST', path: '/api/v1/claims', body: { kind: 'json', value: { a: 1 } } });

    expect(result.id).toBe('CLM-000001');
    expect(transport.requests[0]?.url).toBe('http://api.test/api/v1/auth/token');
    const call = transport.requests[1];
    expect(call?.headers.authorization).toBe('Bearer jwt-1');
    expect(call?.headers['x-partner']).toBe('acme');
    expect(call?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('dựng đúng query string từ tham số list', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));

    await pipeline.execute({ method: 'GET', path: '/api/v1/claims', query: { status: 'PENDING', page: 1, pageSize: undefined } });

    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims?status=PENDING&page=1');
  });

  it('gặp 503 thì thử lại và giữ nguyên Idempotency-Key', async () => {
    const { pipeline, transport, clock } = setup();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }), jsonReply(201, { id: 'CLM-000002' }));

    const result = await pipeline.execute<{ id: string }>({ method: 'POST', path: '/api/v1/claims', body: { kind: 'json', value: {} } });

    expect(result.id).toBe('CLM-000002');
    expect(clock.sleeps).toEqual([125]);
    expect(transport.requests[1]?.headers['idempotency-key']).toBe(transport.requests[2]?.headers['idempotency-key']);
  });

  it('hết số lần thử thì ném ApiError kèm số lần đã thử', async () => {
    const { pipeline, transport, clock } = setup();
    const unavailable = (): ReturnType<typeof jsonReply> => jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } });
    transport.queue(TOKEN, unavailable(), unavailable(), unavailable(), unavailable());

    await expect(pipeline.execute({ method: 'GET', path: '/api/v1/claims/CLM-1' })).rejects.toBeInstanceOf(ApiError);
    expect(clock.sleeps).toEqual([125, 250, 500]);
  });

  it('không thử lại với lỗi 400 và trả về ValidationError', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(400, { error: { code: 'VALIDATION_ERROR', message: 'sai', fields: { amount: 'must be positive' } } }));

    await expect(pipeline.execute({ method: 'POST', path: '/api/v1/claims', body: { kind: 'json', value: {} } })).rejects.toBeInstanceOf(ValidationError);
    expect(transport.requests).toHaveLength(2);
  });

  it('gặp 401 thì refresh token và gửi lại đúng một lần', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(401, { error: { code: 'TOKEN_EXPIRED', message: 'hết hạn' } }), TOKEN_2, jsonReply(200, { id: 'CLM-000003' }));

    const result = await pipeline.execute<{ id: string }>({ method: 'GET', path: '/api/v1/claims/CLM-000003' });

    expect(result.id).toBe('CLM-000003');
    expect(transport.requests[3]?.headers.authorization).toBe('Bearer jwt-2');
  });

  it('401 lần thứ hai thì ném AuthError', async () => {
    const { pipeline, transport } = setup();
    const expired = (): ReturnType<typeof jsonReply> => jsonReply(401, { error: { code: 'TOKEN_EXPIRED', message: 'hết hạn' } });
    transport.queue(TOKEN, expired(), TOKEN_2, expired());

    await expect(pipeline.execute({ method: 'GET', path: '/api/v1/claims/CLM-1' })).rejects.toBeInstanceOf(AuthError);
  });

  it('API key sai thì ném AuthError ngay, không thử lại', async () => {
    const { pipeline, transport } = setup();
    transport.queue(jsonReply(401, { error: { code: 'INVALID_API_KEY', message: 'sai key' } }));

    await expect(pipeline.execute({ method: 'GET', path: '/api/v1/claims' })).rejects.toMatchObject({ reason: 'invalid_api_key' });
    expect(transport.requests).toHaveLength(1);
  });

  it('lỗi mạng thì thử lại rồi ném NetworkError kèm attempts', async () => {
    const { pipeline, transport } = setup();
    transport.queue(
      TOKEN,
      new NetworkError('kết nối bị đóng', 1, 'ECONNRESET'),
      new NetworkError('kết nối bị đóng', 1, 'ECONNRESET'),
      new NetworkError('kết nối bị đóng', 1, 'ECONNRESET'),
      new NetworkError('kết nối bị đóng', 1, 'ECONNRESET'),
    );

    const error = await pipeline.execute({ method: 'GET', path: '/api/v1/claims' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).attempts).toBe(4);
  });

  it('request đánh dấu retryable:false thì không thử lại dù gặp 503', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }));

    await expect(
      pipeline.execute({ method: 'POST', path: '/api/v1/claims/CLM-1/documents', retryable: false, body: { kind: 'json', value: {} } }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(transport.requests).toHaveLength(2);
  });

  it('tôn trọng Retry-After của server', async () => {
    const { pipeline, transport, clock } = setup();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }, { 'retry-after': '2' }), jsonReply(200, { ok: true }));

    await pipeline.execute({ method: 'GET', path: '/api/v1/claims' });

    expect(clock.sleeps).toEqual([2125]);
  });

  it('signal bị abort trong lúc chờ backoff thì dừng ngay', async () => {
    const { pipeline, transport } = setup();
    const controller = new AbortController();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }));
    controller.abort();

    await expect(pipeline.execute({ method: 'GET', path: '/api/v1/claims', signal: controller.signal })).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/pipeline.test.ts`
Expected: FAIL với "Failed to resolve import ../src/core/pipeline.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/core/pipeline.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { AuthError, mapHttpError, NetworkError } from '../errors.js';
import type { Logger } from '../types.js';
import { AuthManager, type TokenResponse } from './auth.js';
import type { Clock } from './clock.js';
import { computeDelayMs, DEFAULT_BACKOFF, isRetryableStatus, parseRetryAfter } from './retry.js';
import type { Transport, TransportBody, TransportResponse } from './transport.js';

export interface PipelineOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  transport: Transport;
  clock: Clock;
  random: () => number;
  defaultHeaders: Record<string, string>;
  logger?: Logger;
}

export interface PipelineRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: TransportBody;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Mặc định true. Đặt false cho request không thể gửi lại, ví dụ body là stream thô. */
  retryable?: boolean;
}

interface TokenPayload {
  accessToken: string;
  expiresIn: number;
}

/** Ghép auth, retry, idempotency, timeout và map lỗi thành một đường đi duy nhất. */
export class RequestPipeline {
  private readonly options: PipelineOptions;
  private readonly auth: AuthManager;

  constructor(options: PipelineOptions) {
    this.options = options;
    this.auth = new AuthManager({
      clock: options.clock,
      requestToken: (signal) => this.requestToken(signal),
    });
  }

  /** Gửi một request, tự xử lý token, retry và map lỗi. */
  async execute<T>(request: PipelineRequest): Promise<T> {
    const url = this.buildUrl(request.path, request.query);
    const idempotencyKey =
      request.method === 'POST' ? request.idempotencyKey ?? randomUUID() : undefined;
    const retryable = request.retryable ?? true;
    const maxAttempts = retryable ? this.options.maxRetries + 1 : 1;

    let authRetried = false;
    let attempt = 0;

    for (;;) {
      const token = await this.auth.getToken(request.signal);
      const headers: Record<string, string> = {
        ...this.options.defaultHeaders,
        accept: 'application/json',
        authorization: `Bearer ${token.accessToken}`,
      };
      if (idempotencyKey !== undefined) headers['idempotency-key'] = idempotencyKey;

      attempt += 1;
      let response: TransportResponse;
      try {
        response = await this.options.transport.send({
          method: request.method,
          url,
          headers,
          ...(request.body === undefined ? {} : { body: request.body }),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
          timeoutMs: this.options.timeoutMs,
        });
      } catch (error) {
        const isAborted = error instanceof NetworkError && error.code === 'REQUEST_ABORTED';
        if (isAborted || attempt >= maxAttempts) {
          throw error instanceof NetworkError
            ? new NetworkError(error.message, attempt, error.code, error.cause)
            : error;
        }
        await this.backoff(attempt - 1, undefined, request.signal);
        continue;
      }

      if (response.status >= 200 && response.status < 300) {
        return (response.body === '' ? undefined : JSON.parse(response.body)) as T;
      }

      if (response.status === 401 && !authRetried) {
        const error = mapHttpError(response.status, response.body, attempt);
        if (error instanceof AuthError && error.reason === 'token_expired') {
          authRetried = true;
          this.auth.invalidate(token.epoch);
          this.options.logger?.debug('token hết hạn, đang refresh', { path: request.path });
          continue;
        }
      }

      if (retryable && isRetryableStatus(response.status) && attempt < maxAttempts) {
        const retryAfter = parseRetryAfter(response.headers['retry-after'], this.options.clock.now());
        await this.backoff(attempt - 1, retryAfter, request.signal);
        continue;
      }

      throw mapHttpError(response.status, response.body, attempt);
    }
  }

  private async backoff(attemptIndex: number, retryAfterMs: number | undefined, signal?: AbortSignal): Promise<void> {
    const delay = computeDelayMs(attemptIndex, retryAfterMs, { ...DEFAULT_BACKOFF, random: this.options.random });
    this.options.logger?.debug('chờ trước khi thử lại', { attemptIndex, delay });
    await this.options.clock.sleep(delay, signal);
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) search.set(key, String(value));
    }
    const suffix = search.toString();
    return `${this.options.baseUrl}${path}${suffix === '' ? '' : `?${suffix}`}`;
  }

  private async requestToken(signal?: AbortSignal): Promise<TokenResponse> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      let response: TransportResponse;
      try {
        response = await this.options.transport.send({
          method: 'POST',
          url: `${this.options.baseUrl}/api/v1/auth/token`,
          headers: { ...this.options.defaultHeaders, accept: 'application/json' },
          body: { kind: 'json', value: { apiKey: this.options.apiKey } },
          ...(signal === undefined ? {} : { signal }),
          timeoutMs: this.options.timeoutMs,
        });
      } catch (error) {
        const isAborted = error instanceof NetworkError && error.code === 'REQUEST_ABORTED';
        if (isAborted || attempt >= this.options.maxRetries + 1) throw error;
        await this.backoff(attempt - 1, undefined, signal);
        continue;
      }

      if (response.status === 200) {
        const payload = JSON.parse(response.body) as TokenPayload;
        return { accessToken: payload.accessToken, expiresAtMs: this.options.clock.now() + payload.expiresIn * 1000 };
      }

      if (isRetryableStatus(response.status) && attempt < this.options.maxRetries + 1) {
        const retryAfter = parseRetryAfter(response.headers['retry-after'], this.options.clock.now());
        await this.backoff(attempt - 1, retryAfter, signal);
        continue;
      }

      throw mapHttpError(response.status, response.body, attempt);
    }
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/pipeline.test.ts`
Expected: PASS, 12 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/core/pipeline.ts packages/sdk/test/pipeline.test.ts
git commit -m "feat(sdk): RequestPipeline ghép auth, retry, idempotency và map lỗi"
```

---

### Task 15: Validate phía client

**Files:**
- Create: `packages/sdk/src/validation.ts`
- Test: `packages/sdk/test/validation.test.ts`

**Interfaces:**
- Consumes: `CreateClaimInput`, `DocumentType` (Task 9); `ValidationError` (Task 9)
- Produces: `CLAIM_TYPES`, `DOCUMENT_TYPES`, `CURRENCIES` (readonly array); `validateCreateClaim(input: CreateClaimInput, nowMs: number): Record<string, string>`; `validateUpload(type: string, filename: string, size: number): Record<string, string>`; `assertValid(fields: Record<string, string>, message: string): void`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/validation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.js';
import { assertValid, validateCreateClaim, validateUpload } from '../src/validation.js';
import type { CreateClaimInput } from '../src/types.js';

const NOW = Date.parse('2024-06-01T00:00:00.000Z');
const VALID: CreateClaimInput = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

describe('validateCreateClaim', () => {
  it('input hợp lệ thì không có lỗi', () => {
    expect(validateCreateClaim(VALID, NOW)).toEqual({});
  });

  it('gom tất cả field bắt buộc còn thiếu vào một lần', () => {
    expect(validateCreateClaim({} as CreateClaimInput, NOW)).toEqual({
      policyId: 'required',
      claimType: 'required',
      diagnosisCode: 'required',
      treatmentDate: 'required',
      amount: 'required',
      currency: 'required',
    });
  });

  it('bắt lỗi định dạng policyId', () => {
    expect(validateCreateClaim({ ...VALID, policyId: 'POLICY-1' }, NOW).policyId).toBe('must match POL-<digits>');
  });

  it('bắt lỗi claimType ngoài danh sách', () => {
    expect(validateCreateClaim({ ...VALID, claimType: 'SURGERY' as CreateClaimInput['claimType'] }, NOW).claimType).toContain('must be one of');
  });

  it('bắt lỗi mã ICD-10 sai', () => {
    expect(validateCreateClaim({ ...VALID, diagnosisCode: 'JO6.9' }, NOW).diagnosisCode).toBe('must be a valid ICD-10 code');
  });

  it('bắt lỗi ngày điều trị sai định dạng và ở tương lai', () => {
    expect(validateCreateClaim({ ...VALID, treatmentDate: '15/03/2024' }, NOW).treatmentDate).toBe('must be a valid YYYY-MM-DD date');
    expect(validateCreateClaim({ ...VALID, treatmentDate: '2024-06-02' }, NOW).treatmentDate).toBe('must not be in the future');
  });

  it('bắt lỗi số tiền', () => {
    expect(validateCreateClaim({ ...VALID, amount: -5 }, NOW).amount).toBe('must be positive');
    expect(validateCreateClaim({ ...VALID, amount: 10.999 }, NOW).amount).toBe('must have at most 2 decimal places');
  });

  it('bắt lỗi tiền tệ không hỗ trợ', () => {
    expect(validateCreateClaim({ ...VALID, currency: 'thb' }, NOW).currency).toContain('must be one of');
  });
});

describe('validateUpload', () => {
  it('file hợp lệ thì không có lỗi', () => {
    expect(validateUpload('medical_receipt', 'receipt.pdf', 1024)).toEqual({});
  });

  it('bắt lỗi loại tài liệu, đuôi file và kích thước', () => {
    expect(validateUpload('selfie', 'receipt.pdf', 1024).type).toContain('must be one of');
    expect(validateUpload('other', 'note.txt', 1024).file).toContain('must be one of');
    expect(validateUpload('other', 'big.pdf', 11 * 1024 * 1024).file).toBe('must not exceed 10MB');
    expect(validateUpload('other', 'empty.pdf', 0).file).toBe('must not be empty');
  });
});

describe('assertValid', () => {
  it('ném ValidationError với code CLIENT_VALIDATION khi có lỗi', () => {
    expect(() => assertValid({ amount: 'must be positive' }, 'Invalid claim')).toThrow(ValidationError);
    try {
      assertValid({ amount: 'must be positive' }, 'Invalid claim');
    } catch (error) {
      expect((error as ValidationError).code).toBe('CLIENT_VALIDATION');
      expect((error as ValidationError).fields).toEqual({ amount: 'must be positive' });
    }
  });

  it('không ném gì khi không có lỗi', () => {
    expect(() => assertValid({}, 'Invalid claim')).not.toThrow();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/validation.test.ts`
Expected: FAIL với "Failed to resolve import ../src/validation.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/validation.ts`:
```ts
import { ValidationError } from './errors.js';
import type { ClaimType, CreateClaimInput, DocumentType } from './types.js';

/** Các loại hồ sơ được chấp nhận. */
export const CLAIM_TYPES: readonly ClaimType[] = ['OUTPATIENT', 'INPATIENT', 'DENTAL', 'MATERNITY'];

/** Các loại tài liệu được chấp nhận. */
export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'medical_receipt',
  'discharge_summary',
  'prescription',
  'lab_result',
  'id_document',
  'other',
];

/** Các mã tiền tệ được chấp nhận. */
export const CURRENCIES: readonly string[] = ['THB', 'VND', 'USD', 'SGD', 'MYR', 'IDR', 'PHP'];

/** Đuôi file được chấp nhận khi upload. */
export const ALLOWED_EXTENSIONS: readonly string[] = ['.pdf', '.jpg', '.jpeg', '.png'];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const POLICY_ID = /^POL-\d+$/;
const ICD10 = /^[A-Z]\d{2}(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Kiểm tra dữ liệu tạo claim ngay tại client, trước khi gửi request nào. */
export function validateCreateClaim(input: CreateClaimInput, nowMs: number): Record<string, string> {
  const fields: Record<string, string> = {};
  const value = input as Partial<CreateClaimInput> | undefined;

  const requireString = (key: 'policyId' | 'claimType' | 'diagnosisCode' | 'treatmentDate' | 'currency'): string | undefined => {
    const raw = value?.[key];
    if (raw === undefined || raw === null || raw === '') {
      fields[key] = 'required';
      return undefined;
    }
    if (typeof raw !== 'string') {
      fields[key] = 'must be a string';
      return undefined;
    }
    return raw;
  };

  const policyId = requireString('policyId');
  if (policyId !== undefined && !POLICY_ID.test(policyId)) fields.policyId = 'must match POL-<digits>';

  const claimType = requireString('claimType');
  if (claimType !== undefined && !CLAIM_TYPES.includes(claimType as ClaimType)) {
    fields.claimType = `must be one of ${CLAIM_TYPES.join(', ')}`;
  }

  const diagnosisCode = requireString('diagnosisCode');
  if (diagnosisCode !== undefined && !ICD10.test(diagnosisCode)) fields.diagnosisCode = 'must be a valid ICD-10 code';

  const treatmentDate = requireString('treatmentDate');
  if (treatmentDate !== undefined) {
    const parsed = Date.parse(`${treatmentDate}T00:00:00.000Z`);
    if (!DATE.test(treatmentDate) || Number.isNaN(parsed)) fields.treatmentDate = 'must be a valid YYYY-MM-DD date';
    else if (parsed > nowMs) fields.treatmentDate = 'must not be in the future';
  }

  const amount = value?.amount;
  if (amount === undefined || amount === null) fields.amount = 'required';
  else if (typeof amount !== 'number' || !Number.isFinite(amount)) fields.amount = 'must be a number';
  else if (amount <= 0) fields.amount = 'must be positive';
  else if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9) fields.amount = 'must have at most 2 decimal places';

  const currency = requireString('currency');
  if (currency !== undefined && !CURRENCIES.includes(currency)) {
    fields.currency = `must be one of ${CURRENCIES.join(', ')}`;
  }

  return fields;
}

/** Kiểm tra thông tin file trước khi mở file và gửi đi. */
export function validateUpload(type: string, filename: string, size: number): Record<string, string> {
  const fields: Record<string, string> = {};

  if (!DOCUMENT_TYPES.includes(type as DocumentType)) {
    fields.type = `must be one of ${DOCUMENT_TYPES.join(', ')}`;
  }

  const lower = filename.toLowerCase();
  if (size <= 0) fields.file = 'must not be empty';
  else if (size > MAX_FILE_BYTES) fields.file = 'must not exceed 10MB';
  else if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    fields.file = `must be one of ${ALLOWED_EXTENSIONS.join(', ')}`;
  }

  return fields;
}

/** Ném ValidationError nếu có bất kỳ lỗi nào. */
export function assertValid(fields: Record<string, string>, message: string): void {
  if (Object.keys(fields).length > 0) {
    throw new ValidationError(message, fields, 'CLIENT_VALIDATION');
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/validation.test.ts`
Expected: PASS, 12 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/validation.ts packages/sdk/test/validation.test.ts
git commit -m "feat(sdk): validate dữ liệu ngay tại client trước khi gọi API"
```

---

### Task 16: Resource claims

**Files:**
- Create: `packages/sdk/src/resources/claims.ts`
- Test: `packages/sdk/test/claims.test.ts`

**Interfaces:**
- Consumes: `RequestPipeline` (Task 14); `Clock` (Task 11); `assertValid`, `validateCreateClaim` (Task 15); `Claim`, `CreateClaimInput`, `ListClaimsParams`, `PaginatedResult`, `RequestOptions` (Task 9)
- Produces: `class ClaimsResource` với `constructor(pipeline: RequestPipeline, clock: Clock)`, `create(input: CreateClaimInput, options?: RequestOptions): Promise<Claim>`, `get(claimId: string, options?: RequestOptions): Promise<Claim>`, `list(params?: ListClaimsParams, options?: RequestOptions): Promise<PaginatedResult<Claim>>`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/claims.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { RequestPipeline } from '../src/core/pipeline.js';
import { ValidationError } from '../src/errors.js';
import { ClaimsResource } from '../src/resources/claims.js';
import type { Claim, CreateClaimInput } from '../src/types.js';
import { FakeClock, FakeTransport, jsonReply } from './helpers.js';

const TOKEN = jsonReply(200, { accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 3600 });

const VALID: CreateClaimInput = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

const CLAIM: Claim = {
  ...VALID,
  id: 'CLM-000001',
  status: 'PENDING',
  statusHistory: [{ status: 'PENDING', at: '2024-06-01T00:00:00.000Z' }],
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

const setup = (): { claims: ClaimsResource; transport: FakeTransport } => {
  const transport = new FakeTransport();
  const clock = new FakeClock(Date.parse('2024-06-01T00:00:00.000Z'));
  const pipeline = new RequestPipeline({
    baseUrl: 'http://api.test',
    apiKey: 'pk_test_abc',
    timeoutMs: 30_000,
    maxRetries: 3,
    transport,
    clock,
    random: () => 0.5,
    defaultHeaders: {},
  });
  return { claims: new ClaimsResource(pipeline, clock), transport };
};

describe('ClaimsResource.create', () => {
  it('gửi POST tới /api/v1/claims với đúng body', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, CLAIM));

    const claim = await claims.create(VALID);

    expect(claim.id).toBe('CLM-000001');
    expect(claim.status).toBe('PENDING');
    const request = transport.requests[1];
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('http://api.test/api/v1/claims');
    expect(request?.body).toEqual({ kind: 'json', value: VALID });
  });

  it('dữ liệu sai thì ném ValidationError mà không gọi transport lần nào', async () => {
    const { claims, transport } = setup();

    await expect(claims.create({ ...VALID, policyId: '', amount: -1 })).rejects.toBeInstanceOf(ValidationError);
    expect(transport.requests).toHaveLength(0);
  });

  it('báo đủ các field sai trong một lần ném lỗi', async () => {
    const { claims } = setup();
    const error = await claims.create({} as CreateClaimInput).catch((err: unknown) => err);
    expect((error as ValidationError).fields).toEqual({
      policyId: 'required',
      claimType: 'required',
      diagnosisCode: 'required',
      treatmentDate: 'required',
      amount: 'required',
      currency: 'required',
    });
  });

  it('truyền được idempotencyKey do người gọi chỉ định', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, CLAIM));

    await claims.create(VALID, { idempotencyKey: 'key-do-toi-dat' });

    expect(transport.requests[1]?.headers['idempotency-key']).toBe('key-do-toi-dat');
  });
});

describe('ClaimsResource.get', () => {
  it('gửi GET tới đúng đường dẫn', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, CLAIM));

    const claim = await claims.get('CLM-000001');

    expect(claim.id).toBe('CLM-000001');
    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims/CLM-000001');
  });

  it('id rỗng thì ném ValidationError mà không gọi transport', async () => {
    const { claims, transport } = setup();
    await expect(claims.get('')).rejects.toBeInstanceOf(ValidationError);
    expect(transport.requests).toHaveLength(0);
  });
});

describe('ClaimsResource.list', () => {
  it('dựng query string từ bộ lọc', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, { data: [CLAIM], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));

    const result = await claims.list({ status: 'PENDING', page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims?status=PENDING&page=1&pageSize=20');
  });

  it('không truyền tham số thì gọi không kèm query', async () => {
    const { claims, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));

    await claims.list();

    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/claims.test.ts`
Expected: FAIL với "Failed to resolve import ../src/resources/claims.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/resources/claims.ts`:
```ts
import type { Clock } from '../core/clock.js';
import type { RequestPipeline } from '../core/pipeline.js';
import type { Claim, CreateClaimInput, ListClaimsParams, PaginatedResult, RequestOptions } from '../types.js';
import { assertValid, validateCreateClaim } from '../validation.js';

/** Các thao tác với hồ sơ bồi thường. */
export class ClaimsResource {
  protected readonly pipeline: RequestPipeline;
  protected readonly clock: Clock;

  constructor(pipeline: RequestPipeline, clock: Clock) {
    this.pipeline = pipeline;
    this.clock = clock;
  }

  /**
   * Tạo một hồ sơ mới. Dữ liệu được kiểm tra tại client trước, nên input sai
   * sẽ ném `ValidationError` mà không phát sinh request nào.
   */
  async create(input: CreateClaimInput, options: RequestOptions = {}): Promise<Claim> {
    assertValid(validateCreateClaim(input, this.clock.now()), 'Invalid claim payload');
    return this.pipeline.execute<Claim>({
      method: 'POST',
      path: '/api/v1/claims',
      body: { kind: 'json', value: input },
      ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }

  /** Lấy chi tiết và trạng thái hiện tại của một hồ sơ. */
  async get(claimId: string, options: RequestOptions = {}): Promise<Claim> {
    assertValid(claimId === '' ? { claimId: 'required' } : {}, 'Invalid claim id');
    return this.pipeline.execute<Claim>({
      method: 'GET',
      path: `/api/v1/claims/${encodeURIComponent(claimId)}`,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }

  /** Liệt kê hồ sơ, có phân trang và lọc theo trạng thái. */
  async list(params: ListClaimsParams = {}, options: RequestOptions = {}): Promise<PaginatedResult<Claim>> {
    return this.pipeline.execute<PaginatedResult<Claim>>({
      method: 'GET',
      path: '/api/v1/claims',
      query: { status: params.status, page: params.page, pageSize: params.pageSize },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/claims.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/resources/claims.ts packages/sdk/test/claims.test.ts
git commit -m "feat(sdk): resource claims với create, get và list"
```

---

### Task 17: Dựng multipart và gửi stream có progress

**Files:**
- Create: `packages/sdk/src/core/multipart.ts`
- Modify: `packages/sdk/src/core/transport.ts` (thay nhánh ném lỗi bằng phần gửi stream thật)
- Test: `packages/sdk/test/multipart.test.ts`

**Interfaces:**
- Consumes: `TransportBody` (Task 11)
- Produces: `interface MultipartField { name: string; value: string }`; `interface MultipartFile { fieldName: string; filename: string; contentType: string; size: number; createStream: () => Readable }`; `interface MultipartBody { contentType: string; contentLength: number; create: () => Readable }`; `buildMultipart(fields: MultipartField[], file: MultipartFile, boundary?: string): MultipartBody`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/multipart.test.ts`:
```ts
import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMultipart } from '../src/core/multipart.js';
import { NodeHttpTransport } from '../src/core/transport.js';

const fileContent = Buffer.from('%PDF-1.4 nội dung giả'.repeat(500));

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
  it('contentLength khớp đúng số byte thực sự phát ra', async () => {
    const body = makeBody();
    const chunks: Buffer[] = [];
    for await (const chunk of body.create()) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).length).toBe(body.contentLength);
  });

  it('có đủ boundary, tên field, tên file và phần đóng', async () => {
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

  it('gọi create hai lần thì ra hai stream độc lập, dùng lại được khi retry', async () => {
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

describe('NodeHttpTransport với body stream', () => {
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
    if (address === null || typeof address === 'string') throw new Error('không lấy được port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('gửi hết byte và báo progress tăng dần tới 100', async () => {
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
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/multipart.test.ts`
Expected: FAIL với "Failed to resolve import ../src/core/multipart.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/core/multipart.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

/** Một field dạng text trong body multipart. */
export interface MultipartField {
  name: string;
  value: string;
}

/** Phần file trong body multipart. */
export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  size: number;
  /** Tạo một stream mới mỗi lần gọi, để retry gửi lại được. */
  createStream: () => Readable;
}

/** Body multipart đã biết trước độ dài, nhờ vậy tính được phần trăm tiến độ. */
export interface MultipartBody {
  contentType: string;
  contentLength: number;
  create: () => Readable;
}

/** Dựng body multipart/form-data và tính chính xác Content-Length. */
export function buildMultipart(
  fields: MultipartField[],
  file: MultipartFile,
  boundary: string = `----insurance-sdk-${randomUUID()}`,
): MultipartBody {
  const head = Buffer.from(
    fields
      .map((field) => `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`)
      .join('') +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength: head.length + file.size + tail.length,
    create: () =>
      Readable.from(
        (async function* stream() {
          yield head;
          for await (const chunk of file.createStream()) yield chunk as Buffer;
          yield tail;
        })(),
      ),
  };
}
```

Trong `packages/sdk/src/core/transport.ts`, thay khối:
```ts
      if (req.body?.kind === 'stream') {
        reject(new Error('stream body chưa được hỗ trợ'));
        return;
      }
```
bằng:
```ts
      let streamSource: { stream: Readable; contentLength: number } | undefined;
      if (req.body?.kind === 'stream') {
        const created = req.body.create();
        streamSource = { stream: created.stream, contentLength: created.contentLength };
        headers['content-type'] = created.contentType;
        headers['content-length'] = String(created.contentLength);
      }
```

Và thay hai dòng cuối của hàm `send`:
```ts
      if (payload !== undefined) clientRequest.write(payload);
      clientRequest.end();
```
bằng:
```ts
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
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/multipart.test.ts packages/sdk/test/transport.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/core/multipart.ts packages/sdk/src/core/transport.ts packages/sdk/test/multipart.test.ts
git commit -m "feat(sdk): dựng multipart và gửi stream kèm báo tiến độ"
```

---

### Task 18: Resource documents

**Files:**
- Create: `packages/sdk/src/resources/documents.ts`
- Test: `packages/sdk/test/documents.test.ts`

**Interfaces:**
- Consumes: `RequestPipeline` (Task 14); `buildMultipart` (Task 17); `assertValid`, `validateUpload` (Task 15); `ClaimDocument`, `FileInput`, `UploadOptions`, `RequestOptions` (Task 9)
- Produces: `interface ResolvedFile { filename: string; contentType: string; size: number; createStream: () => Readable; retryable: boolean }`; `resolveFileInput(file: FileInput, options: { filename?: string; contentType?: string }): Promise<ResolvedFile>`; `class DocumentsResource` với `upload(claimId: string, file: FileInput, options: UploadOptions): Promise<ClaimDocument>` và `list(claimId: string, options?: RequestOptions): Promise<ClaimDocument[]>`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/documents.test.ts`:
```ts
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
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/documents.test.ts`
Expected: FAIL với "Failed to resolve import ../src/resources/documents.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/resources/documents.ts`:
```ts
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
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/documents.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/resources/documents.ts packages/sdk/test/documents.test.ts
git commit -m "feat(sdk): resource documents với upload đa nguồn và list"
```

---

### Task 19: Theo dõi trạng thái claim

**Files:**
- Create: `packages/sdk/src/status-watcher.ts`
- Modify: `packages/sdk/src/resources/claims.ts` (thêm `onStatusChange`)
- Test: `packages/sdk/test/status-watcher.test.ts`

**Interfaces:**
- Consumes: `Clock` (Task 11); `Claim`, `ClaimStatus`, `StatusListener`, `WatchOptions`, `Unsubscribe` (Task 9); `ClaimsResource` (Task 16)
- Produces: `interface WatcherDeps { fetchClaim: (signal: AbortSignal) => Promise<Claim>; clock: Clock }`; `watchClaimStatus(deps: WatcherDeps, listener: StatusListener, options?: WatchOptions): Unsubscribe`; `ClaimsResource.onStatusChange(claimId: string, listener: StatusListener, options?: WatchOptions): Unsubscribe`

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/status-watcher.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { watchClaimStatus } from '../src/status-watcher.js';
import type { Claim, ClaimStatus } from '../src/types.js';
import { FakeClock } from './helpers.js';

const claimWith = (status: ClaimStatus): Claim => ({
  id: 'CLM-000001',
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
  status,
  statusHistory: [{ status: 'PENDING', at: '2024-06-01T00:00:00.000Z' }],
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
};

describe('watchClaimStatus', () => {
  it('chỉ gọi callback khi trạng thái thật sự đổi, rồi tự dừng ở trạng thái cuối', async () => {
    const clock = new FakeClock();
    const statuses: ClaimStatus[] = ['PENDING', 'PENDING', 'IN_REVIEW', 'IN_REVIEW', 'APPROVED'];
    let index = 0;
    const fetchClaim = vi.fn(async () => claimWith(statuses[index++] ?? 'APPROVED'));
    const seen: ClaimStatus[] = [];

    watchClaimStatus({ fetchClaim, clock }, (status) => seen.push(status), { intervalMs: 1000 });
    await flush();

    expect(seen).toEqual(['IN_REVIEW', 'APPROVED']);
    expect(fetchClaim).toHaveBeenCalledTimes(5);
  });

  it('phát ngay nếu lần poll đầu tiên đã ở trạng thái cuối', async () => {
    const clock = new FakeClock();
    const seen: ClaimStatus[] = [];

    watchClaimStatus({ fetchClaim: async () => claimWith('REJECTED'), clock }, (status) => seen.push(status), { intervalMs: 1000 });
    await flush();

    expect(seen).toEqual(['REJECTED']);
  });

  it('so sánh với initialStatus khi được cung cấp', async () => {
    const clock = new FakeClock();
    const seen: ClaimStatus[] = [];

    watchClaimStatus({ fetchClaim: async () => claimWith('IN_REVIEW'), clock }, (status) => seen.push(status), {
      intervalMs: 1000,
      initialStatus: 'PENDING',
      maxDurationMs: 3000,
    });
    await flush();

    expect(seen).toEqual(['IN_REVIEW']);
  });

  it('unsubscribe dừng vòng poll', async () => {
    const clock = new FakeClock();
    const fetchClaim = vi.fn(async () => claimWith('PENDING'));

    const stop = watchClaimStatus({ fetchClaim, clock }, () => {}, { intervalMs: 1000, maxDurationMs: 1_000_000 });
    await Promise.resolve();
    stop();
    stop();
    await flush();

    expect(fetchClaim.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('dừng khi vượt quá maxDurationMs', async () => {
    const clock = new FakeClock();
    const fetchClaim = vi.fn(async () => claimWith('PENDING'));

    watchClaimStatus({ fetchClaim, clock }, () => {}, { intervalMs: 1000, maxDurationMs: 5000 });
    await flush();

    expect(fetchClaim.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('lỗi khi poll đi vào onError chứ không làm vỡ vòng lặp', async () => {
    const clock = new FakeClock();
    const errors: unknown[] = [];
    let call = 0;
    const fetchClaim = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('mạng lỗi');
      return claimWith('APPROVED');
    });

    watchClaimStatus({ fetchClaim, clock }, () => {}, { intervalMs: 1000, onError: (error) => errors.push(error) });
    await flush();

    expect(errors).toHaveLength(1);
    expect(fetchClaim).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/status-watcher.test.ts`
Expected: FAIL với "Failed to resolve import ../src/status-watcher.js".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/status-watcher.ts`:
```ts
import type { Clock } from './core/clock.js';
import type { Claim, ClaimStatus, StatusListener, Unsubscribe, WatchOptions } from './types.js';

const TERMINAL: ReadonlySet<ClaimStatus> = new Set<ClaimStatus>(['APPROVED', 'REJECTED']);

export interface WatcherDeps {
  fetchClaim: (signal: AbortSignal) => Promise<Claim>;
  clock: Clock;
}

/**
 * Poll trạng thái một hồ sơ cho tới khi có quyết định cuối.
 *
 * Vòng poll là một timer đang hoạt động, mà timer đang hoạt động giữ event loop
 * của Node sống. Vì vậy hàm này luôn trả về hàm dừng, tự dừng khi tới trạng thái
 * cuối, và dừng khi vượt `maxDurationMs`.
 */
export function watchClaimStatus(
  deps: WatcherDeps,
  listener: StatusListener,
  options: WatchOptions = {},
): Unsubscribe {
  const intervalMs = options.intervalMs ?? 2000;
  const maxDurationMs = options.maxDurationMs ?? 300_000;
  const controller = new AbortController();
  const startedAt = deps.clock.now();
  let previous: ClaimStatus | undefined = options.initialStatus;
  let stopped = false;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    controller.abort();
  };

  void (async () => {
    while (!stopped) {
      try {
        const claim = await deps.fetchClaim(controller.signal);
        if (stopped) return;

        const isFirstObservation = previous === undefined;
        const changed = claim.status !== previous;
        previous = claim.status;

        if (changed && (!isFirstObservation || TERMINAL.has(claim.status))) {
          listener(claim.status, claim);
        }
        if (TERMINAL.has(claim.status)) {
          stop();
          return;
        }
      } catch (error) {
        if (stopped) return;
        options.onError?.(error);
      }

      if (deps.clock.now() - startedAt >= maxDurationMs) {
        stop();
        return;
      }
      try {
        await deps.clock.sleep(intervalMs, controller.signal);
      } catch {
        return;
      }
    }
  })();

  return stop;
}
```

Trong `packages/sdk/src/resources/claims.ts`, thêm import và method:
```ts
import { watchClaimStatus } from '../status-watcher.js';
import type { StatusListener, Unsubscribe, WatchOptions } from '../types.js';

  /**
   * Theo dõi thay đổi trạng thái của một hồ sơ bằng cách poll định kỳ.
   *
   * Luôn gọi hàm trả về khi không cần theo dõi nữa: vòng poll giữ tiến trình
   * Node sống, nên bỏ quên nó sẽ khiến script không bao giờ thoát.
   */
  onStatusChange(claimId: string, listener: StatusListener, options: WatchOptions = {}): Unsubscribe {
    return watchClaimStatus(
      { clock: this.clock, fetchClaim: (signal) => this.get(claimId, { signal }) },
      listener,
      options,
    );
  }
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/status-watcher.test.ts packages/sdk/test/claims.test.ts`
Expected: PASS, 14 test.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/status-watcher.ts packages/sdk/src/resources/claims.ts packages/sdk/test/status-watcher.test.ts
git commit -m "feat(sdk): theo dõi trạng thái claim bằng polling có unsubscribe"
```

---

### Task 20: Class InsuranceSDK và điểm export

**Files:**
- Modify: `packages/sdk/src/index.ts`
- Create: `packages/sdk/src/client.ts`
- Test: `packages/sdk/test/client.test.ts`

**Interfaces:**
- Consumes: `resolveConfig` (Task 10); `RequestPipeline` (Task 14); `ClaimsResource` (Task 16, 19); `DocumentsResource` (Task 18); `NodeHttpTransport`, `systemClock` (Task 11)
- Produces: `interface SdkDependencies { transport?: Transport; clock?: Clock; random?: () => number }`; `class InsuranceSDK` với `readonly claims: ClaimsResource`, `readonly documents: DocumentsResource`, `constructor(config: InsuranceSDKConfig, deps?: SdkDependencies)`; `index.ts` export toàn bộ API công khai

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/client.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { InsuranceSDK, ValidationError } from '../src/index.js';
import { FakeClock, FakeTransport, jsonReply } from './helpers.js';

const TOKEN = jsonReply(200, { accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 3600 });
const CLAIM = {
  id: 'CLM-000001',
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
  status: 'PENDING',
  statusHistory: [],
  createdAt: '2024-06-01T00:00:00.000Z',
  updatedAt: '2024-06-01T00:00:00.000Z',
};

describe('InsuranceSDK', () => {
  it('ghép các resource và gọi được end-to-end với transport giả', async () => {
    const transport = new FakeTransport().queue(TOKEN, jsonReply(201, CLAIM));
    const sdk = new InsuranceSDK(
      { apiKey: 'pk_test_abc', baseUrl: 'http://api.test' },
      { transport, clock: new FakeClock(Date.parse('2024-06-01T00:00:00.000Z')), random: () => 0.5 },
    );

    const claim = await sdk.claims.create({
      policyId: 'POL-123',
      claimType: 'OUTPATIENT',
      diagnosisCode: 'J06.9',
      treatmentDate: '2024-03-15',
      amount: 15000,
      currency: 'THB',
    });

    expect(claim.id).toBe('CLM-000001');
    expect(sdk.documents).toBeDefined();
    expect(typeof sdk.claims.onStatusChange).toBe('function');
  });

  it('config sai thì ném ValidationError ngay lúc khởi tạo', () => {
    expect(() => new InsuranceSDK({ apiKey: '' })).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/client.test.ts`
Expected: FAIL với "InsuranceSDK is not exported".

- [ ] **Step 3: Viết implementation tối thiểu**

`packages/sdk/src/client.ts`:
```ts
import { resolveConfig } from './config.js';
import { systemClock, type Clock } from './core/clock.js';
import { RequestPipeline } from './core/pipeline.js';
import { NodeHttpTransport, type Transport } from './core/transport.js';
import { ClaimsResource } from './resources/claims.js';
import { DocumentsResource } from './resources/documents.js';
import type { InsuranceSDKConfig } from './types.js';

/** Các thành phần thay thế được, chủ yếu phục vụ test. */
export interface SdkDependencies {
  transport?: Transport;
  clock?: Clock;
  random?: () => number;
}

/**
 * Điểm vào của SDK.
 *
 * ```ts
 * const sdk = new InsuranceSDK({ apiKey: 'pk_test_xxx', environment: 'sandbox' });
 * const claim = await sdk.claims.create({ ... });
 * ```
 */
export class InsuranceSDK {
  /** Thao tác với hồ sơ bồi thường. */
  readonly claims: ClaimsResource;
  /** Thao tác với tài liệu đính kèm. */
  readonly documents: DocumentsResource;

  constructor(config: InsuranceSDKConfig, deps: SdkDependencies = {}) {
    const resolved = resolveConfig(config);
    const clock = deps.clock ?? systemClock;
    const pipeline = new RequestPipeline({
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
      timeoutMs: resolved.timeout,
      maxRetries: resolved.maxRetries,
      defaultHeaders: resolved.defaultHeaders,
      transport: deps.transport ?? new NodeHttpTransport(),
      clock,
      random: deps.random ?? Math.random,
      ...(resolved.logger === undefined ? {} : { logger: resolved.logger }),
    });
    this.claims = new ClaimsResource(pipeline, clock);
    this.documents = new DocumentsResource(pipeline);
  }
}
```

`packages/sdk/src/index.ts`:
```ts
/** Phiên bản SDK, dùng trong header User-Agent. */
export const VERSION = '0.1.0';

export { InsuranceSDK, type SdkDependencies } from './client.js';
export { ENVIRONMENT_BASE_URLS, type ResolvedConfig } from './config.js';
export {
  ApiError,
  AuthError,
  InsuranceSDKError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from './errors.js';
export { CLAIM_TYPES, CURRENCIES, DOCUMENT_TYPES } from './validation.js';
export type { Clock } from './core/clock.js';
export type { Transport, TransportRequest, TransportResponse } from './core/transport.js';
export type {
  Claim,
  ClaimDocument,
  ClaimStatus,
  ClaimType,
  CreateClaimInput,
  DocumentType,
  FileInput,
  InsuranceSDKConfig,
  ListClaimsParams,
  Logger,
  PaginatedResult,
  Pagination,
  ProgressDetail,
  ProgressHandler,
  RequestOptions,
  StatusHistoryEntry,
  StatusListener,
  TerminalClaimStatus,
  Unsubscribe,
  UploadOptions,
  WatchOptions,
} from './types.js';
```

- [ ] **Step 4: Chạy test và build**

Run: `pnpm vitest run packages/sdk/test/client.test.ts`
Expected: PASS, 2 test.

Run: `pnpm build`
Expected: tsup tạo ra `packages/sdk/dist/index.js`, `index.cjs`, `index.d.ts` không lỗi.

Run: `pnpm exec tsc -p packages/sdk --noEmit && pnpm exec tsc -p packages/mock-server --noEmit`
Expected: không có lỗi type.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/client.ts packages/sdk/src/index.ts packages/sdk/test/client.test.ts
git commit -m "feat(sdk): class InsuranceSDK và điểm export công khai"
```

---

### Task 21: Integration test giữa SDK và mock server

**Files:**
- Create: `packages/sdk/test/integration.test.ts`

**Interfaces:**
- Consumes: `InsuranceSDK` (Task 20); `createServer`, `defaultConfig` từ `@insurance/mock-server` (Task 6-8)
- Produces: không có export mới

Ghi chú: thêm `"@insurance/mock-server": "workspace:*"` vào `devDependencies` của `packages/sdk` rồi chạy `pnpm install` trước khi viết test.

- [ ] **Step 1: Viết test thất bại**

`packages/sdk/test/integration.test.ts`:
```ts
import type { Server } from 'node:http';
import { createServer, defaultConfig } from '@insurance/mock-server/src/server.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InsuranceSDK } from '../src/index.js';
import type { ClaimStatus, CreateClaimInput } from '../src/types.js';

let server: Server;
let baseUrl: string;

const INPUT: CreateClaimInput = {
  policyId: 'POL-123',
  claimType: 'OUTPATIENT',
  diagnosisCode: 'J06.9',
  treatmentDate: '2024-03-15',
  amount: 15000,
  currency: 'THB',
};

const makeSdk = (defaultHeaders: Record<string, string> = {}): InsuranceSDK =>
  new InsuranceSDK({ apiKey: 'pk_test_integration', baseUrl, defaultHeaders, timeout: 5000 });

beforeAll(async () => {
  server = createServer(
    defaultConfig({
      failureRate: 0,
      minDelayMs: 0,
      maxDelayMs: 0,
      lifecycle: { reviewMs: 40, decisionMs: 80, rejectAboveAmount: 100_000 },
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('không lấy được port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('SDK với mock server thật', () => {
  it('tạo, lấy và liệt kê claim', async () => {
    const sdk = makeSdk();
    const created = await sdk.claims.create(INPUT);
    expect(created.id).toMatch(/^CLM-\d{6}$/);

    const fetched = await sdk.claims.get(created.id);
    expect(fetched.id).toBe(created.id);

    const list = await sdk.claims.list({ page: 1, pageSize: 10 });
    expect(list.data.some((claim) => claim.id === created.id)).toBe(true);
    expect(list.pagination.pageSize).toBe(10);
  });

  it('upload tài liệu và báo tiến độ tới 100', async () => {
    const sdk = makeSdk();
    const claim = await sdk.claims.create(INPUT);
    const percents: number[] = [];

    const doc = await sdk.documents.upload(claim.id, Buffer.from('%PDF-1.4 hoá đơn giả'.repeat(200)), {
      type: 'medical_receipt',
      filename: 'receipt.pdf',
      onProgress: (percent) => percents.push(percent),
    });

    expect(doc.id).toMatch(/^DOC-\d{6}$/);
    expect(percents[percents.length - 1]).toBe(100);
    const docs = await sdk.documents.list(claim.id);
    expect(docs.map((item) => item.id)).toContain(doc.id);
  });

  it('tự thử lại khi server trả 503 hai lần liên tiếp', async () => {
    const sdk = makeSdk({ 'x-mock-force-status': '503,503', 'x-mock-scenario': `retry-${Date.now()}` });
    const claim = await sdk.claims.create(INPUT);
    expect(claim.id).toMatch(/^CLM-\d{6}$/);
  });

  it('validation phía client chặn dữ liệu sai trước khi gọi server', async () => {
    const sdk = makeSdk();
    const error = await sdk.claims.create({ ...INPUT, treatmentDate: '2099-01-01' }).catch((err: unknown) => err);
    expect(error).toMatchObject({ name: 'ValidationError', code: 'CLIENT_VALIDATION' });
    expect((error as { fields: Record<string, string> }).fields.treatmentDate).toBe('must not be in the future');
  });

  it('claim không tồn tại thì thành ApiError 404', async () => {
    const sdk = makeSdk();
    await expect(sdk.claims.get('CLM-999999')).rejects.toMatchObject({ name: 'ApiError', status: 404 });
  });

  it('API key sai thì ném AuthError', async () => {
    const sdk = new InsuranceSDK({ apiKey: 'sk_live_sai', baseUrl });
    await expect(sdk.claims.list()).rejects.toMatchObject({ name: 'AuthError', reason: 'invalid_api_key' });
  });

  it('onStatusChange nhận đủ chuyển tiếp rồi tự dừng', async () => {
    const sdk = makeSdk();
    const claim = await sdk.claims.create(INPUT);
    const seen: ClaimStatus[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('watcher không dừng đúng hạn')), 5000);
      sdk.claims.onStatusChange(
        claim.id,
        (status) => {
          seen.push(status);
          if (status === 'APPROVED' || status === 'REJECTED') {
            clearTimeout(timeout);
            resolve();
          }
        },
        { intervalMs: 20, initialStatus: claim.status, maxDurationMs: 4000 },
      );
    });

    expect(seen[seen.length - 1]).toBe('APPROVED');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó thất bại**

Run: `pnpm vitest run packages/sdk/test/integration.test.ts`
Expected: FAIL với lỗi không phân giải được `@insurance/mock-server/src/server.js`.

- [ ] **Step 3: Thêm dependency và cho phép import sâu**

Trong `packages/sdk/package.json`, thêm:
```json
  "devDependencies": {
    "tsup": "^8.3.0",
    "@insurance/mock-server": "workspace:*"
  }
```

Trong `packages/mock-server/package.json`, thêm trường `exports` để import sâu hoạt động:
```json
  "exports": { "./src/*": "./src/*" }
```

Run: `pnpm install`

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `pnpm vitest run packages/sdk/test/integration.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Chạy toàn bộ test và xem coverage**

Run: `pnpm vitest run --coverage`
Expected: PASS toàn bộ (khoảng 100 test), coverage của `packages/sdk/src` từ 85% trở lên.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/package.json packages/mock-server/package.json packages/sdk/test/integration.test.ts pnpm-lock.yaml
git commit -m "test(sdk): integration test giữa SDK và mock server"
```

---

### Task 22: Ba script example

**Files:**
- Create: `examples/01-simple-claim.ts`, `examples/02-claim-with-document.ts`, `examples/03-poll-status.ts`, `examples/fixtures/receipt.pdf`, `examples/shared.ts`
- Modify: `package.json` (thêm dependency `@insurance/sdk`)

**Interfaces:**
- Consumes: `InsuranceSDK`, các class lỗi (Task 20)
- Produces: `examples/shared.ts` export `createSdk(): InsuranceSDK` và `describeError(error: unknown): string`

- [ ] **Step 1: Tạo file fixture và module dùng chung**

Run:
```bash
mkdir -p examples/fixtures
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > examples/fixtures/receipt.pdf
```

`examples/shared.ts`:
```ts
import { ApiError, AuthError, InsuranceSDK, NetworkError, ValidationError } from '@insurance/sdk';

/** Tạo SDK trỏ tới mock server đang chạy ở local. */
export function createSdk(): InsuranceSDK {
  return new InsuranceSDK({
    apiKey: process.env.INSURANCE_API_KEY ?? 'pk_test_demo',
    environment: 'sandbox',
    baseUrl: process.env.INSURANCE_BASE_URL ?? 'http://localhost:4000',
    timeout: 30_000,
  });
}

/** Diễn giải lỗi theo từng loại để example in ra cho dễ hiểu. */
export function describeError(error: unknown): string {
  if (error instanceof ValidationError) {
    return `ValidationError (${error.code}): ${JSON.stringify(error.fields)}`;
  }
  if (error instanceof AuthError) return `AuthError: ${error.reason}. Kiểm tra lại API key.`;
  if (error instanceof NetworkError) return `NetworkError sau ${error.attempts} lần thử: ${error.message}`;
  if (error instanceof ApiError) return `ApiError ${error.status} (${error.code}): ${error.message}`;
  return `Lỗi không xác định: ${String(error)}`;
}
```

Thêm vào `package.json` ở gốc:
```json
  "dependencies": { "@insurance/sdk": "workspace:*" }
```
Run: `pnpm install`

- [ ] **Step 2: Viết example 1**

`examples/01-simple-claim.ts`:
```ts
import { createSdk, describeError } from './shared.js';

async function main(): Promise<void> {
  const sdk = createSdk();

  console.log('1. Gửi một claim hợp lệ');
  const claim = await sdk.claims.create({
    policyId: 'POL-123',
    claimType: 'OUTPATIENT',
    diagnosisCode: 'J06.9',
    treatmentDate: '2024-03-15',
    amount: 15000,
    currency: 'THB',
  });
  console.log(`   Đã tạo ${claim.id}, trạng thái ${claim.status}`);

  console.log('2. Đọc lại claim vừa tạo');
  const fetched = await sdk.claims.get(claim.id);
  console.log(`   ${fetched.id} hiện là ${fetched.status}`);

  console.log('3. Liệt kê claim đang chờ xử lý');
  const page = await sdk.claims.list({ status: 'PENDING', page: 1, pageSize: 5 });
  console.log(`   ${page.data.length}/${page.pagination.total} claim ở trang ${page.pagination.page}`);

  console.log('4. Thử gửi claim sai để xem validation phía client chặn lại');
  try {
    await sdk.claims.create({
      policyId: '',
      claimType: 'OUTPATIENT',
      diagnosisCode: 'sai-mã',
      treatmentDate: '2099-01-01',
      amount: -1,
      currency: 'XYZ',
    });
  } catch (error) {
    console.log(`   Bị chặn trước khi gọi API: ${describeError(error)}`);
  }
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
```

- [ ] **Step 3: Viết example 2**

`examples/02-claim-with-document.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { createSdk, describeError } from './shared.js';

const RECEIPT = fileURLToPath(new URL('./fixtures/receipt.pdf', import.meta.url));

function renderBar(percent: number): string {
  const filled = Math.round(percent / 5);
  return `[${'#'.repeat(filled)}${'.'.repeat(20 - filled)}] ${String(percent).padStart(3)}%`;
}

async function main(): Promise<void> {
  const sdk = createSdk();

  const claim = await sdk.claims.create({
    policyId: 'POL-456',
    claimType: 'INPATIENT',
    diagnosisCode: 'A09',
    treatmentDate: '2024-03-20',
    amount: 48000,
    currency: 'THB',
  });
  console.log(`Đã tạo ${claim.id}`);

  const doc = await sdk.documents.upload(claim.id, RECEIPT, {
    type: 'medical_receipt',
    onProgress: (percent, detail) => {
      process.stdout.write(`\r   ${renderBar(percent)}  ${detail.bytesSent}/${detail.totalBytes} byte`);
    },
  });
  process.stdout.write('\n');
  console.log(`Đã upload ${doc.id} (${doc.filename}, ${doc.size} byte)`);

  const docs = await sdk.documents.list(claim.id);
  console.log(`Claim ${claim.id} hiện có ${docs.length} tài liệu`);
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
```

- [ ] **Step 4: Viết example 3**

`examples/03-poll-status.ts`:
```ts
import { createSdk, describeError } from './shared.js';

async function main(): Promise<void> {
  const sdk = createSdk();

  const claim = await sdk.claims.create({
    policyId: 'POL-789',
    claimType: 'DENTAL',
    diagnosisCode: 'K02.1',
    treatmentDate: '2024-03-25',
    amount: 3200,
    currency: 'THB',
  });
  console.log(`Đang theo dõi ${claim.id}, bắt đầu ở ${claim.status}`);

  await new Promise<void>((resolve) => {
    const stop = sdk.claims.onStatusChange(
      claim.id,
      (status, updated) => {
        console.log(`   ${new Date().toISOString()}  ${claim.id} chuyển sang ${status}`);
        if (status === 'APPROVED' || status === 'REJECTED') {
          console.log(`   Lịch sử: ${updated.statusHistory.map((entry) => entry.status).join(' → ')}`);
          stop();
          resolve();
        }
      },
      {
        intervalMs: 1000,
        initialStatus: claim.status,
        maxDurationMs: 60_000,
        onError: (error) => console.warn(`   Lỗi khi poll, sẽ thử lại: ${describeError(error)}`),
      },
    );
  });

  console.log('Đã có quyết định cuối, watcher đã dừng và script thoát.');
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
```

- [ ] **Step 5: Chạy cả ba example với mock server thật**

`examples/shared.ts` import `@insurance/sdk`, mà package đó trỏ `exports` vào `dist`, nên phải build trước:
```bash
pnpm build
```

Mở một terminal chạy:
```bash
pnpm mock-server
```

Terminal thứ hai chạy lần lượt:
```bash
pnpm example:1
pnpm example:2
pnpm example:3
```

Expected: cả ba script chạy xong và **tự thoát**. Example 3 mất khoảng 10 giây vì mốc vòng đời mặc định. Nếu 10% lỗi 503 xảy ra, script vẫn phải thành công nhờ retry. Nếu script nào treo không thoát, đó là lỗi rò rỉ watcher — sửa trước khi commit.

- [ ] **Step 6: Commit**

```bash
git add examples package.json pnpm-lock.yaml
git commit -m "docs: ba example tích hợp chạy end-to-end với mock server"
```

---

### Task 23: README và API reference

**Files:**
- Create: `README.md`, `docs/api-reference.md`

**Interfaces:**
- Consumes: toàn bộ API công khai từ các task trước
- Produces: không có export mới

- [ ] **Step 1: Viết README**

`README.md` phải có đủ các mục sau, viết bằng tiếng Việt, mọi đoạn code đều copy chạy được:

1. **Giới thiệu một đoạn** — SDK dùng để làm gì, chạy trên Node 20 trở lên.
2. **Quickstart 5 phút**, gồm đúng bốn bước:
   ```bash
   pnpm install
   pnpm build              # SDK build ra dist, examples import từ đó
   pnpm mock-server        # terminal 1
   pnpm example:1          # terminal 2
   ```
   kèm đoạn code khởi tạo và tạo claim đầu tiên:
   ```ts
   import { InsuranceSDK } from '@insurance/sdk';

   const sdk = new InsuranceSDK({ apiKey: 'pk_test_demo', environment: 'sandbox' });

   const claim = await sdk.claims.create({
     policyId: 'POL-123',
     claimType: 'OUTPATIENT',
     diagnosisCode: 'J06.9',
     treatmentDate: '2024-03-15',
     amount: 15000,
     currency: 'THB',
   });
   console.log(claim.id, claim.status);
   ```
3. **Bảng config** — `apiKey`, `environment`, `timeout`, `maxRetries`, `baseUrl`, `defaultHeaders`, `logger`: kiểu dữ liệu, mặc định, mô tả.
4. **Xử lý lỗi** — đoạn `try/catch` phân biệt `ValidationError`, `AuthError`, `NetworkError`, `ApiError`, kèm bảng lỗi nào sinh ra từ tình huống nào.
5. **Retry hoạt động ra sao** — công thức `random(0, min(8000, 250 × 2^attempt))`, bảng status nào được thử lại, giải thích `Idempotency-Key` giúp POST không tạo bản ghi trùng.
6. **Tự động refresh token** — refresh trước hạn 60 giây, gộp nhiều lần refresh đồng thời, thử lại đúng một lần khi gặp 401.
7. **Theo dõi trạng thái** — ví dụ `onStatusChange` kèm cảnh báo in đậm: luôn gọi hàm unsubscribe, vì vòng poll giữ tiến trình Node sống.
8. **Giới hạn đã biết** — đúng hai mục: (a) truyền stream thô thì SDK tắt retry cho request đó vì stream không tua lại được, nên hãy dùng Buffer hoặc đường dẫn file khi cần retry; (b) khi một lần upload bị thử lại, `onProgress` bắt đầu lại từ 0%.
9. **Biến môi trường của mock server** — bảng `PORT`, `TOKEN_TTL_SECONDS`, `FAILURE_RATE`, `MIN_DELAY_MS`, `MAX_DELAY_MS`, `LIFECYCLE_REVIEW_MS`, `LIFECYCLE_DECISION_MS`, `LIFECYCLE_REJECT_ABOVE`.
10. **Lệnh phát triển** — `pnpm test`, `pnpm vitest run --coverage`, `pnpm build`, `pnpm mock-server`, `pnpm example:1|2|3`.

- [ ] **Step 2: Viết API reference**

`docs/api-reference.md` liệt kê từng mục dưới đây, mỗi mục gồm chữ ký đầy đủ, bảng tham số (tên, kiểu, bắt buộc hay không, mô tả), giá trị trả về, danh sách lỗi có thể ném, và một ví dụ chạy được:

- `new InsuranceSDK(config)`
- `sdk.claims.create(input, options?)`
- `sdk.claims.get(claimId, options?)`
- `sdk.claims.list(params?, options?)`
- `sdk.claims.onStatusChange(claimId, listener, options?)`
- `sdk.documents.upload(claimId, file, options)`
- `sdk.documents.list(claimId, options?)`

Kèm ba phụ lục:
- **Bảng type** — `Claim`, `ClaimDocument`, `CreateClaimInput`, `PaginatedResult<T>`, `ClaimStatus`, `ClaimType`, `DocumentType`, `FileInput`, `WatchOptions`, `UploadOptions`.
- **Bảng lỗi** — mỗi class lỗi: khi nào xảy ra, có những thuộc tính gì, nên xử lý thế nào.
- **Bảng quy tắc validate phía client** — copy đúng các quy tắc đã cài trong `packages/sdk/src/validation.ts` để tài liệu và code không lệch nhau.

- [ ] **Step 3: Kiểm chứng tài liệu bằng cách chạy lại chính các lệnh trong đó**

Run: `pnpm install && pnpm test && pnpm build`
Expected: tất cả thành công.

Chạy lại quickstart đúng như README mô tả, từ terminal sạch, và đối chiếu output thực tế với những gì tài liệu nói. Sửa tài liệu nếu lệch.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/api-reference.md
git commit -m "docs: README quickstart và API reference đầy đủ"
```

---

## Bảng đối chiếu spec

| Mục trong spec | Task |
|---|---|
| Cấu trúc repo và tooling | 1 |
| Mock server: auth, JWT | 2, 6 |
| Mock server: vòng đời claim | 3 |
| Mock server: validate | 4, 7 |
| Mock server: lưu trữ, idempotency | 5, 7 |
| Mock server: chaos, delay, hook test | 6 |
| Mock server: endpoint claim | 7 |
| Mock server: endpoint tài liệu | 8 |
| SDK: type công khai, cây lỗi, map lỗi | 9 |
| SDK: config và environment | 10 |
| SDK: transport, clock | 11, 17 |
| SDK: retry và backoff full jitter | 12, 14 |
| SDK: AuthManager, epoch, gộp refresh | 13, 14 |
| SDK: pipeline, idempotency, timeout | 14 |
| SDK: validate phía client | 15 |
| SDK: claims create/get/list | 16 |
| SDK: multipart và progress | 17 |
| SDK: documents upload/list | 18 |
| SDK: onStatusChange và unsubscribe | 19 |
| SDK: class InsuranceSDK, export, build | 20 |
| Test: unit và integration | 2-21 |
| Tài liệu: README, API reference | 23 |
| Ba example | 22 |

## Số lượng test dự kiến

| Phạm vi | Số test |
|---|---|
| Mock server (task 2-8) | 40 |
| SDK unit (task 9-20) | 88 |
| SDK integration (task 21) | 7 |
| **Tổng** | **135** |

Vượt xa yêu cầu tối thiểu 20 test của đề bài, và phủ đủ 5 nhóm mà đề yêu cầu: luồng thành công, validation phía client, xác thực và refresh token, retry, và từng loại lỗi.
