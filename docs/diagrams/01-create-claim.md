# Creating a claim — the happy path

```mermaid
sequenceDiagram
    autonumber
    actor Partner as Partner application
    participant Claims as ClaimsResource
    participant Valid as validation.ts
    participant Pipe as RequestPipeline
    participant Auth as AuthManager
    participant Tr as NodeHttpTransport
    participant Srv as Mock server

    Partner->>Claims: create(input)
    Claims->>Valid: validateCreateClaim(input, now)
    Valid-->>Claims: no errors

    Note over Claims,Valid: On failure it throws ValidationError right here<br/>and no HTTP request is ever made

    Claims->>Pipe: execute(POST /api/v1/claims)
    Pipe->>Pipe: idempotencyKey = randomUUID()
    Pipe->>Auth: getToken()

    Note over Auth: Nothing cached yet

    Auth->>Tr: POST /api/v1/auth/token
    Tr->>Srv: apiKey = pk_test_demo
    Srv->>Srv: chaos latency 200-500ms
    Srv->>Srv: check the pk_test_ prefix
    Srv->>Srv: sign an HS256 JWT valid for 1 hour
    Srv-->>Tr: 200 accessToken, expiresIn 3600
    Tr-->>Auth: token
    Auth->>Auth: cache the token, epoch = 1
    Auth-->>Pipe: token epoch 1

    Pipe->>Tr: POST /api/v1/claims
    Note right of Pipe: headers carry authorization Bearer,<br/>idempotency-key and any defaultHeaders
    Tr->>Srv: JSON body
    Srv->>Srv: chaos latency, no failure this time
    Srv->>Srv: verify the JWT, read apiKey from sub
    Srv->>Srv: look up the Idempotency-Key, never seen before
    Srv->>Srv: validate the body again, server side
    Srv->>Srv: store.createClaim, assigns CLM-000001
    Srv->>Srv: remember the response under the Idempotency-Key
    Srv-->>Tr: 201 Claim with status PENDING
    Tr-->>Pipe: raw response
    Pipe->>Pipe: JSON.parse
    Pipe-->>Claims: Claim
    Claims-->>Partner: Claim
```

## What to take away

- **Client validation runs before everything else.** Step 2 comes before the token is even fetched. That is why `create({})` throws without the transport being touched, and it is exactly what the tests assert with `expect(transport.requests).toHaveLength(0)`.
- **The partner never sees the token.** Steps 6 through 13 are entirely the SDK's business.
- **Validating twice is deliberate.** The client validates for instant feedback and to save a round trip; the server validates because the backend is the source of truth and must never trust what a client sends.
- **The Idempotency-Key is minted once, at step 5**, before the retry loop, so every resend carries that same key.
