# Insurance Partner Integration SDK

A TypeScript SDK that lets insurance partners — hospitals, brokers, corporates — embed claim submission into their own applications: create claims, upload documents with progress reporting, and track claim status. The repo ships with a mock API server so you can run everything without a real backend. Requires Node.js 20 or newer.

## Quickstart in 5 minutes

```bash
pnpm install
pnpm build              # the SDK builds to dist, which the examples import from
pnpm mock-server        # terminal 1
pnpm example:1          # terminal 2
```

Any string starting with `pk_test_` works as a sandbox API key — for example `pk_test_demo`.

Create your first claim:

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
console.log(claim.id, claim.status); // CLM-000001 PENDING
```

Authentication is handled for you: no token endpoint to call, no JWT to store, no expiry to track.

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | required | Partner API key. Sandbox keys use the `pk_test_` prefix |
| `environment` | `'sandbox' \| 'production'` | `'sandbox'` | Selects the API URL |
| `timeout` | `number` | `30000` | Timeout **per attempt**, in milliseconds |
| `maxRetries` | `number` | `3` | Maximum retries, so at most 4 attempts in total |
| `baseUrl` | `string` | from `environment` | Overrides the URL — handy when the mock server runs on another port |
| `defaultHeaders` | `Record<string, string>` | `{}` | Headers attached to every request |
| `logger` | `{ debug(msg, meta?) }` | none | Receives debug output about token refresh and backoff. Tokens are never logged |

## Error handling

```ts
import { ApiError, AuthError, NetworkError, ValidationError } from '@insurance/sdk';

try {
  await sdk.claims.create(input);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.fields); // { policyId: 'required', amount: 'must be positive' }
  } else if (error instanceof AuthError) {
    console.log('Re-authenticate:', error.reason);
  } else if (error instanceof NetworkError) {
    console.log(`Retry later, gave up after ${error.attempts} attempts`);
  } else if (error instanceof ApiError) {
    console.log(error.status, error.code);
  }
}
```

| Error | Raised when | Extra properties |
|---|---|---|
| `ValidationError` | The client catches bad input (`code: 'CLIENT_VALIDATION'`), or the server returns 400 (`code: 'VALIDATION_ERROR'`) | `fields` |
| `AuthError` | Bad API key, unrecoverable token expiry, or 403 | `reason` |
| `NetworkError` | The API is unreachable, or retries are exhausted | `attempts`, `cause` |
| `TimeoutError` | A single attempt exceeds `timeout`. Subclass of `NetworkError` | `timeoutMs` |
| `ApiError` | Every other HTTP failure: 404, 409, 413, 5xx | `status`, `retryable` |

All errors extend `InsuranceSDKError` and carry a `code`; most also carry a `requestId` so you can match your logs against the API operator's.

## How retries work

The mock server deliberately fails about 10% of requests with a 503. The SDK retries on your behalf — you write no retry code.

- **Retried:** 429, 502, 503, 504, socket failures (`ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`), and per-attempt timeouts.
- **Not retried:** 400, 403, 404, 409, 413, 422. Retrying would not change the answer.
- **401 takes its own path:** refresh the token, then replay the request exactly once.
- **Backoff formula (full jitter):** `random(0, min(8000, 250 × 2^attempt))`. With `maxRetries: 3` the three waits fall in 0–250ms, 0–500ms and 0–1000ms.
- **`Retry-After` is honoured:** when the server sends it, the SDK waits that long plus a random 0–250ms, so clients do not all wake at the same instant.

The randomness is the important half, not the doubling. Fixed backoff makes every client retry in lockstep and pile load onto a server that is already struggling.

**Idempotency.** Every `create` and `upload` call carries an `Idempotency-Key` (a UUID), and that key stays the same across all retries. If the first attempt reached the server before the connection dropped, the retry gets the original claim back instead of creating a duplicate. You can supply your own key through `options.idempotencyKey`.

## Automatic token refresh

- A token is treated as expired **60 seconds early**, so a nearly dead token is never sent.
- Concurrent requests that all hit an expired token trigger **one** token call, not one per request.
- If a 401 `TOKEN_EXPIRED` still comes back — clock skew, a server restart, a request that took longer than expected — the SDK refreshes and replays **exactly once**. A second 401 raises `AuthError` instead of looping forever.
- A bad API key raises `AuthError` immediately, with no retries.

## Tracking status

```ts
const stop = sdk.claims.onStatusChange(claim.id, (status, updated) => {
  console.log(`${updated.id} is now ${status}`);
  if (status === 'APPROVED' || status === 'REJECTED') stop();
});
```

> **Always keep and call the unsubscribe function.** The polling loop is an active timer, and an active timer keeps Node's event loop alive. Forget it and your script never exits, while a long-running server accumulates polling loops without bound. The watcher does stop itself on a terminal status and after `maxDurationMs` (5 minutes by default), but the returned function is the only way to cancel it early.

## Known limitations

1. **Raw streams are not retried.** When you pass `{ stream, size, filename }`, the SDK disables retries for that request: a consumed stream cannot be rewound, and sending a truncated file is worse than reporting an error. Pass a `Buffer` or a file path when you want retries.
2. **Progress restarts at 0 on a retry.** If an upload hits a 503 and the SDK resends it, `onProgress` starts again from 0%. Progress bars should tolerate the percentage dropping back to zero.
3. **Deep file scanning is a stub.** The mock server does check magic bytes for real, but the deep scan function always reports success. See [Server-side file validation](#server-side-file-validation).

## Server-side file validation

The `Content-Type` inside a multipart part is written by the client, so on its own it proves nothing: rename `note.txt` to `receipt.pdf`, declare `application/pdf`, and every name-based or header-based check passes. The mock server therefore validates in two tiers, in [`packages/mock-server/src/file-content.ts`](packages/mock-server/src/file-content.ts):

| Tier | Function | Real or stub | What it does |
|---|---|---|---|
| 1 | `matchesDeclaredType(head, contentType)` | **real check** | Compares the first 8 bytes against the declared content type: `%PDF-` for PDF, `FF D8 FF` for JPEG, `89 50 4E 47 0D 0A 1A 0A` for PNG. A mismatch returns 400 with `fields.file = 'content does not match declared type ...'` |
| 2 | `scanFileContent(head, contentType)` | **STUB, always returns `{ ok: true }`** | Nothing at all |

> **To be explicit about tier 2:** `scanFileContent` is a mock that always passes. It exists to mark the exact seam where a real system would plug in virus scanning, PDF structure checks, blank-page and screenshot-forgery detection, or OCR cross-checks against the claimed amount. The mock server does none of that and must not be taken as protection against malicious files.

Still unchecked, even in tier 1: anything past the first 8 bytes (a file that starts as valid PDF but is corrupt in the middle still passes), agreement between the file extension and the content (the server only inspects the declared content type; the extension is checked client-side by the SDK), and anything about what the document actually means.

The fixture at `examples/fixtures/receipt.pdf` is a genuinely valid PDF 1.4 with an `xref` table, a page tree and one A4 page that opens in any PDF viewer. It is deliberately written in plain ASCII so it stays readable and diffable in git.

## Mock server

| Environment variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | Listening port |
| `TOKEN_TTL_SECONDS` | `3600` | JWT lifetime. Set it low to watch refresh happen |
| `FAILURE_RATE` | `0.1` | Fraction of requests answered with 503 |
| `MIN_DELAY_MS` | `200` | Minimum simulated latency |
| `MAX_DELAY_MS` | `500` | Maximum simulated latency |
| `LIFECYCLE_REVIEW_MS` | `5000` | How long until a claim moves to `IN_REVIEW` |
| `LIFECYCLE_DECISION_MS` | `10000` | How long until a final decision |
| `LIFECYCLE_REJECT_ABOVE` | `100000` | Claims above this amount end up `REJECTED` |

To watch the whole claim lifecycle quickly: `LIFECYCLE_REVIEW_MS=1000 LIFECYCLE_DECISION_MS=2000 pnpm mock-server`.

The server also accepts a test-only header, `x-mock-force-status: 503,503` together with `x-mock-scenario: <unique id>`, which forces the first responses to fail on demand.

## Development commands

```bash
pnpm test                    # run the whole test suite
pnpm vitest run --coverage   # tests with a coverage report
pnpm build                   # build the SDK to dist (ESM + CJS + .d.ts)
pnpm mock-server             # run the mock API
pnpm example:1               # simple claim submission
pnpm example:2               # claim submission with document upload
pnpm example:3               # poll a claim until a decision is reached
```

## Timeline

| Phase | Time |
|---|---|
| Brainstorming and planning | 2h |
| Implementation (AI-assisted) | 30 min |
| Testing and fixes | 30 min |
| Documentation | 30 min |
| **Total** | **3h 30m** |

**Brainstorming and planning — 2h.** Analysing the brief, settling the foundational decisions (Node-only runtime, pnpm monorepo, multipart uploads, polling for status, idempotency keys, zero-dependency validation), designing the architecture, and writing both the design spec and the implementation plan. Both documents are committed under [`docs/superpowers/`](docs/superpowers/).

This is the phase that took the longest, and deliberately so. The plan breaks the work into 23 tasks, each with exact file paths, the interfaces neighbouring tasks depend on, and real test code — which is precisely what makes the next phase short.

**Implementation (AI-assisted) — 30 min.** Working through those 23 tasks in order: the monorepo and tooling, the mock server (all six endpoints, chaos middleware, claim lifecycle, file validation), the SDK core (transport, pipeline, auth, retry, errors, types, validation), and the resources (claims, documents, multipart with progress, status watcher). Every task followed the same loop: write the failing test, watch it fail, write the minimal implementation, watch it pass, commit.

**Testing and fixes — 30 min.** The integration suite against a real mock server, running all three examples end-to-end, and fixing what those runs turned up — a `pnpm` setting that blocked esbuild's build scripts, a missing `override` modifier that only surfaced during the `.d.ts` build, and a PDF fixture that was not actually a valid PDF.

**Documentation — 30 min.** This README, the API reference, and the architecture and sequence diagrams.

## Project layout

```
packages/sdk/           The SDK — zero runtime dependencies
packages/mock-server/   Mock API on node:http, with busboy for multipart parsing only
examples/               Three integration scripts that run as-is
docs/api-reference.md   Full reference documentation
docs/diagrams/          Architecture and sequence diagrams for the main flows
docs/superpowers/       The design spec and the implementation plan
ai-conversations/       Transcript of the AI session that produced this repo
```

- Per-method reference: [docs/api-reference.md](docs/api-reference.md)
- A quick picture of how the components interact: [docs/diagrams/](docs/diagrams/README.md)

## How this repo was built

The brief asks for AI coding tools to be used, and for the process to be visible. Everything needed to audit that process is in the repo:

| Artefact | What it shows |
|---|---|
| [`ai-conversations/ai-conversation.txt`](ai-conversations/ai-conversation.txt) | The full transcript of the AI session: every question asked, every decision made, and every correction along the way |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | The design spec agreed before any code was written |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | The 23-task implementation plan, with test code written before implementation code |
| `git log` | One commit per task, in the order the plan lays them out |

The working method was deliberately front-loaded: decide the architecture in conversation, write it down as a spec, expand the spec into a task-by-task plan, and only then write code. The transcript shows where that process caught problems early — for instance, choosing `Idempotency-Key` before implementing retries, rather than discovering duplicate claims afterwards.

## Test coverage

143 tests across 22 files:

| Scope | Tests |
|---|---|
| Mock server | 48 |
| SDK unit tests | 88 |
| SDK integration tests against the mock server | 7 |

Line coverage for `packages/sdk/src` sits at 97%, against an 85% threshold enforced in `vitest.config.ts`.
