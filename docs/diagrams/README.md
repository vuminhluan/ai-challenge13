# Architecture diagrams

Diagrams are written in Mermaid. GitHub renders them inline, so nothing needs to be installed.

| Diagram | Type | Question it answers |
|---|---|---|
| [00 — Component overview](00-components.md) | graph | What pieces exist, and what depends on what |
| [01 — Creating a claim](01-create-claim.md) | sequence | Where a single `claims.create` call travels |
| [02 — Retrying a 503](02-retry-503.md) | sequence | How the SDK absorbs a transient server failure |
| [03 — Auth and token refresh](03-token-refresh.md) | sequence | When tokens are fetched, cached and renewed |
| [04 — Uploading a document](04-upload-document.md) | sequence | Multipart, progress, and server-side file checks |
| [05 — Tracking status](05-status-watcher.md) | sequence | How the polling loop runs and stops |

## Suggested reading order

For a quick grasp, read **00** then **01** — together they cover the path of an ordinary request.

The remaining three sequence diagrams each show one situation the SDK handles on the partner's behalf: a server failing temporarily (**02**), a token expiring (**03**), and a claim status changing over time (**05**). **04** is the densest flow, because it adds streaming and progress on top.

## Conventions used here

- Participants are named after the actual class or file in the source, so you can jump from a diagram straight to the code.
- `Note` blocks explain **why** something is designed that way; they do not restate what an arrow already says.
- Every diagram stops at the mock server's HTTP boundary and does not draw the internals of `node:http`.
