# Uploading a document with progress

```mermaid
sequenceDiagram
    autonumber
    actor Partner as Partner application
    participant Docs as DocumentsResource
    participant Valid as validation.ts
    participant MP as buildMultipart
    participant Pipe as RequestPipeline
    participant Tr as NodeHttpTransport
    participant Srv as Mock server
    participant FC as file-content.ts

    Partner->>Docs: upload(claimId, file, type and onProgress)
    Docs->>Docs: resolveFileInput(file)

    Note over Docs: A Buffer or a path means retryable = true.<br/>A raw stream means retryable = false, because a consumed stream cannot be rewound

    Docs->>Valid: validateUpload(type, filename, size)
    Valid-->>Docs: no errors
    Note over Docs,Valid: Checked before the file is even opened:<br/>type is in the enum, extension is pdf jpg jpeg or png, size is 1 byte to 10MB

    Docs->>MP: buildMultipart(fields, file)
    MP-->>Docs: exact contentLength
    Note over MP: Knowing the length up front is what makes a percentage possible

    Docs->>Pipe: execute(POST documents, stream body, retryable)
    Pipe->>Tr: send request

    Tr->>Partner: onProgress(0 percent)
    loop for each chunk flushed to the socket
        Tr->>Srv: chunk
        Tr->>Tr: accumulate bytesSent, compute the percentage
        Tr->>Partner: onProgress(percent) only when the number changed
    end
    Tr->>Partner: onProgress(100 percent)

    Srv->>Srv: chaos latency, verify the JWT
    Srv->>Srv: does the claim exist
    Srv->>Srv: busboy parse, keep the first 8 bytes, count size, cap at 10MB
    Srv->>Srv: type is in the enum, contentType is allowed

    Srv->>FC: matchesDeclaredType(first 8 bytes, contentType)
    FC-->>Srv: true when the magic bytes line up
    Note over FC: %PDF- for PDF, FF D8 FF for JPEG,<br/>89 50 4E 47 0D 0A 1A 0A for PNG

    Srv->>FC: scanFileContent(head, contentType)
    FC-->>Srv: ok true, ALWAYS
    Note over FC: STUB. This is the seam where a real system plugs in virus scanning<br/>and PDF structure checks. The mock server does nothing here

    Srv->>Srv: store.addDocument, assigns DOC-000001
    Srv-->>Tr: 201 document metadata
    Tr-->>Pipe: 201
    Pipe-->>Docs: ClaimDocument
    Docs-->>Partner: ClaimDocument
```

## What to take away

- **Three rules govern progress:** always emit 0% at the start and 100% at the end, never emit the same percentage twice, and restart from 0 when a request is retried.
- **Progress counts bytes flushed to the socket**, taken from the `req.write` callback, not bytes read from the file. Backpressure makes those two numbers diverge.
- **`retryable` is decided at step 2**, from the shape of the file input. For a raw stream the SDK would rather report an honest error than silently upload a truncated file.
- **The two server-side file checks are fundamentally different.** `matchesDeclaredType` is a real check and defeats the rename trick. `scanFileContent` is a stub that always passes, present only to mark the seam for a real system. See "Server-side file validation" in the README.
