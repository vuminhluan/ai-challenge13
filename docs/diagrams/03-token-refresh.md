# Authentication and automatic token refresh

## Collapsing concurrent refreshes into one

```mermaid
sequenceDiagram
    autonumber
    participant R1 as Request 1
    participant R2 as Request 2
    participant R3 as Request 3
    participant Auth as AuthManager
    participant Tr as NodeHttpTransport
    participant Srv as Mock server

    Note over Auth: Cache is empty, or the token has under 60 seconds left

    R1->>Auth: getToken()
    Auth->>Auth: no inflight promise, create one
    Auth->>Tr: POST /api/v1/auth/token

    R2->>Auth: getToken()
    Auth-->>R2: hands back that same inflight promise
    R3->>Auth: getToken()
    Auth-->>R3: hands back that same inflight promise

    Tr->>Srv: apiKey
    Srv-->>Tr: 200 accessToken, expiresIn 3600
    Tr-->>Auth: token
    Auth->>Auth: epoch becomes 1, cache it, clear inflight
    Auth-->>R1: token epoch 1
    Auth-->>R2: token epoch 1
    Auth-->>R3: token epoch 1

    Note over Auth,Srv: Three concurrent requests, but only ONE call to the token endpoint
```

## A token that expires mid-flight: reactive refresh

```mermaid
sequenceDiagram
    autonumber
    participant Pipe as RequestPipeline
    participant Auth as AuthManager
    participant Tr as NodeHttpTransport
    participant Srv as Mock server

    Pipe->>Auth: getToken()
    Auth-->>Pipe: token A, epoch 1

    Note over Auth,Srv: The SDK believes the token is valid, the server disagrees:<br/>clock skew, a server restart that rotated the HMAC secret,<br/>or a request that stayed in flight longer than expected

    Pipe->>Tr: GET /api/v1/claims with token A
    Tr->>Srv: authorization Bearer token A
    Srv-->>Tr: 401 TOKEN_EXPIRED
    Tr-->>Pipe: 401

    Pipe->>Pipe: authRetried is still false
    Pipe->>Auth: invalidate(epoch 1)
    Auth->>Auth: epoch matches the current one, so the cache is cleared

    Note over Auth: invalidate takes an epoch for a reason.<br/>N requests hitting 401 together call it with the OLD epoch,<br/>so they cannot discard the token the first one just fetched

    Pipe->>Auth: getToken()
    Auth->>Tr: POST /api/v1/auth/token
    Tr->>Srv: apiKey
    Srv-->>Tr: 200 fresh accessToken
    Tr-->>Auth: token B
    Auth->>Auth: epoch becomes 2
    Auth-->>Pipe: token B, epoch 2

    Pipe->>Tr: replay the SAME request with token B
    Note right of Pipe: authRetried flips to true,<br/>the Idempotency-Key is unchanged from the first attempt
    Tr->>Srv: authorization Bearer token B
    Srv-->>Tr: 200
    Tr-->>Pipe: 200

    Note over Pipe: Another 401 now raises AuthError.<br/>Without the authRetried flag this loop would run forever<br/>once an API key is revoked
```

## What to take away

- **Proactive refresh is the first line of defence.** A token counts as expired 60 seconds before its real `exp`, so under normal conditions a nearly dead token is never sent.
- **Reactive refresh is the second line, and it is necessary.** Restarting the mock server alone rotates the HMAC secret, turning every existing token into a bad signature that the SDK has no way to anticipate.
- **The `authRetried` flag stops an infinite loop.** With a revoked API key the server returns 401 forever; without the flag the call would never return and the server would take hundreds of requests per second.
- **A bad API key behaves differently.** The server answers 401 `INVALID_API_KEY` at the token exchange itself, and the SDK raises `AuthError` immediately without retrying.
