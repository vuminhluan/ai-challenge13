# Tracking claim status

```mermaid
sequenceDiagram
    autonumber
    actor Partner as Partner application
    participant Claims as ClaimsResource
    participant W as watchClaimStatus
    participant Clock as Clock
    participant Srv as Mock server

    Partner->>Claims: onStatusChange(claimId, listener, options)
    Claims->>W: start the polling loop
    W->>W: create an AbortController, record the start time
    W-->>Partner: return the stop function

    Note over W,Partner: Returning a stop function is mandatory, not a convenience.<br/>The polling loop is an active timer, and an active timer<br/>keeps Node's event loop alive

    loop until a final decision, or until stopped
        W->>Claims: get(claimId, signal)
        Claims->>Srv: GET /api/v1/claims/CLM-000001
        Srv->>Srv: computeStatus from the age of the claim
        Srv-->>Claims: Claim with its status
        Claims-->>W: Claim

        alt status differs from the previous poll
            W->>Partner: listener(status, claim)
        else status unchanged
            W->>W: stay silent, do not call the listener
        end

        alt status is APPROVED or REJECTED
            W->>W: stop, abort the signal
            Note over W: This is why example 3 exits on its own
        else still PENDING or IN_REVIEW
            W->>W: has maxDurationMs elapsed
            W->>Clock: sleep(intervalMs, signal)
            Clock-->>W: wait elapsed
        end
    end

    Note over Partner,W: The partner may call stop() at any moment:<br/>the abort cuts both the in-flight request and the backoff sleep.<br/>Calling stop repeatedly is safe
```

## Three layers of protection against a leaked loop

| Layer | Triggered by | Effect |
|---|---|---|
| The `stop()` function | The partner calling it | Clears the timer, aborts the pending request |
| Self-stop on a terminal status | The claim reaching `APPROVED` or `REJECTED` | The loop exits and the script can finish |
| `maxDurationMs` | 5 minutes by default | Stops even when the status is stuck because of a server fault |

## What to take away

- **The listener fires only on a real change.** Polling every 2 seconds while the claim sits at `PENDING` calls the listener zero times.
- **The first poll only establishes a baseline**, unless that status is already terminal. Pass `initialStatus` from the claim you just created and the very first poll can report a change.
- **It uses a recursive `setTimeout`, not `setInterval`.** The server adds 200–500ms of latency and fails 10% of calls with a retry, so `setInterval` would let two polls overlap.
- **Polling errors go to `onError`**, without breaking the loop and without producing an unhandled rejection.
