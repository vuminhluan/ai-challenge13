# Component overview

The sequence diagrams in this folder describe ordering in time. The diagram below fills in what they cannot show: which pieces exist and how they depend on each other.

```mermaid
graph TD
    Partner["Partner application"]

    subgraph SDK["packages/sdk — zero runtime dependencies"]
        Client["InsuranceSDK<br/>client.ts"]
        Claims["ClaimsResource<br/>resources/claims.ts"]
        Docs["DocumentsResource<br/>resources/documents.ts"]
        Watcher["watchClaimStatus<br/>status-watcher.ts"]
        Validation["validateCreateClaim, validateUpload<br/>validation.ts"]
        Pipeline["RequestPipeline<br/>core/pipeline.ts"]
        Auth["AuthManager<br/>core/auth.ts"]
        Retry["isRetryableStatus, computeDelayMs<br/>core/retry.ts"]
        Multipart["buildMultipart<br/>core/multipart.ts"]
        Transport["NodeHttpTransport<br/>core/transport.ts"]
        Clock["Clock<br/>core/clock.ts"]
        Errors["Error hierarchy<br/>errors.ts"]
    end

    subgraph Server["packages/mock-server"]
        Chaos["chaos.ts<br/>latency, random 503, forced-status hook"]
        Router["router.ts<br/>route matching, JWT verification"]
        Handlers["handlers/<br/>auth, claims, documents"]
        FileContent["file-content.ts<br/>magic bytes plus stubbed scan"]
        Lifecycle["lifecycle.ts<br/>status derived from claim age"]
        Store["store.ts<br/>in-memory Maps"]
    end

    Partner --> Client
    Client --> Claims
    Client --> Docs
    Claims --> Watcher
    Claims --> Validation
    Docs --> Validation
    Docs --> Multipart
    Claims --> Pipeline
    Docs --> Pipeline
    Watcher --> Claims
    Pipeline --> Auth
    Pipeline --> Retry
    Pipeline --> Transport
    Pipeline --> Errors
    Auth --> Clock
    Pipeline --> Clock
    Watcher --> Clock
    Transport -->|HTTP| Chaos
    Chaos --> Router
    Router --> Handlers
    Handlers --> FileContent
    Handlers --> Lifecycle
    Handlers --> Store
```

## What to take away

- **Every request funnels through one place.** `RequestPipeline` is the only component that knows about tokens, retries, idempotency and error mapping. Resources only build requests and validate input; `Transport` only moves bytes.
- **Three components share one `Clock`.** Because it is injectable, the tests exercise backoff and polling without ever waiting a real second.
- **`Transport` is the substitution boundary.** Unit tests plug a `FakeTransport` in here to reproduce a 503, a socket failure or an expired token exactly.
- **Chaos sits in front of the router.** That is why a 503 response never leaves a side effect behind, which in turn is what makes client retries safe.
