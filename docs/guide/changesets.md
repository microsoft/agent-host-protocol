# Changesets

A **changeset** is a named, individually subscribable view of file changes
associated with a session. Changesets generalise the v0.1.0
`SessionSummary.diffs` field: a session can expose any number of
changesets — uncommitted working-tree edits, the diff between two turns,
the cumulative changes for the whole session, the staged index, etc. —
each with its own URI, lifecycle, and update stream.

## Concepts

### Changeset Catalogue

Each session's `SessionSummary` advertises the set of changesets the
server can produce. The summary entry is intentionally lightweight —
just enough to render a chip or list row without subscribing — and
references a full subscribable `ChangesetState` by URI.

```typescript
SessionSummary {
  // ...existing fields...
  changesets?: ChangesetSummary[]
}

ChangesetSummary {
  /** Human-readable label, e.g. `"Uncommitted Changes"`. */
  label: string
  /** RFC 6570 URI template; expand to obtain a subscribable URI. */
  uriTemplate: string
  description?: string
  additions?: number
  deletions?: number
  files?: number
}
```

### URI Templates and Variables

`uriTemplate` is an [RFC 6570](https://www.rfc-editor.org/rfc/rfc6570)
URI template. Clients expand it with concrete values to obtain a
subscribable changeset URI. Only the following variable names are
defined by this protocol; clients SHOULD ignore templates containing
unknown variables.

| Variables in template                     | Meaning                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| _(none)_                                  | A static, session-wide changeset. The template is itself a subscribable URI. |
| `{turnId}`                                | Per-turn slice. Expand with a `Turn.id` from the session.                    |
| `{originalTurnId}` and `{modifiedTurnId}` | Diff between two turns. Both must be present.                                |

### Changeset State

Each concrete (expanded) changeset URI is its own subscribable resource.

```typescript
ChangesetState {
  status: 'computing' | 'ready' | 'error'
  error?: ErrorInfo
  files: ChangesetFile[]
  operations?: ChangesetOperation[]
}

ChangesetFile {
  id: string                               // typically `after.uri` (or `before.uri` for deletions)
  edit: FileEdit                           // reuses the existing FileEdit shape
  _meta?: Record<string, unknown>
}
```

Updates flow through changeset-scoped actions, broadcast to subscribers
of the changeset URI:

| Type                          | Client-dispatchable? | When                                                          |
| ----------------------------- | -------------------- | ------------------------------------------------------------- |
| `changeset/statusChanged`     | No                   | `status` transitioned (e.g. `computing → ready`).             |
| `changeset/fileSet`           | No                   | Upsert a `ChangesetFile` (new or replacing existing by `id`). |
| `changeset/fileRemoved`       | No                   | A file is no longer in the changeset.                         |
| `changeset/operationsChanged` | No                   | The set of available `operations` changed.                    |
| `changeset/cleared`           | No                   | All files dropped (e.g. branch switched).                     |
| `changeset/disposed`          | No                   | The changeset URI is no longer subscribable.                  |

### Changeset Operations

A **changeset operation** is a server-declared invokable verb the client
can run against a changeset, a file, or a range — "revert", and similar
file-level actions. Richer SCM workflows such as staging changes or
creating pull requests are better expressed as dedicated commands or
skill buttons rather than changeset operations.

```typescript
ChangesetOperation {
  id: string
  label: string
  description?: string
  scopes: ChangesetOperationScope[]   // 'changeset' | 'resource' | 'range'
  /**
   * When set, the client should prompt the user for confirmation before
   * invoking the operation, using this text as the prompt body.
   */
  confirmation?: StringOrMarkdown
  icon?: string
}
```

Operations are invoked via the `invokeChangesetOperation` JSON-RPC
command (not via dispatched actions, because they return data and may
fail per-call). State changes resulting from the operation flow back
through the normal `changeset/*` action stream.

```typescript
invokeChangesetOperation(params: {
  changeset: URI
  operationId: string
  target?:
    | { kind: ChangesetOperationTargetKind.Resource; resource: URI; side?: 'before' | 'after' }
    | { kind: ChangesetOperationTargetKind.Range; resource: URI; side?: 'before' | 'after'; range: TextRange }
}) → {
  message?: StringOrMarkdown
  followUp?: {
    content: ContentRef
    /** When true, open in an external handler (e.g. browser) rather than inline. */
    external?: boolean
  }
}
```

The server validates that `operationId` exists in the changeset's
current `operations` list and that the requested target's `kind` is
contained in the operation's `scopes`. Invalid combinations result in
a JSON-RPC error.

## Lifecycle

1. The server publishes the catalogue on `SessionSummary.changesets`.
   Updates ride on `root/sessionSummaryChanged`.
2. The client picks summary entries whose template variables it can
   satisfy and subscribes to the resulting URIs.
3. The server returns a `ChangesetState` snapshot (`status: 'computing'`
   is allowed if scanning is async) and pushes `changeset/*` actions as
   files become available.
4. The user invokes a `ChangesetOperation`. The client calls
   `invokeChangesetOperation`. The server applies the operation and
   emits any resulting changeset updates.
5. When a session ends, all of its changesets implicitly become
   un-subscribable. Existing subscriptions receive `changeset/disposed`
   and the server unsubscribes them.

## Migration from v0.1.0

The `summary.diffs` field and the `session/diffsChanged` action were
removed in v0.2.0. Servers that previously populated `summary.diffs`
should expose an equivalent server-side changeset with a static
`uriTemplate` ending in `/changeset/session` and surface its
`additions`/`deletions`/`files` counts on the new `summary.changesets`
catalogue entry. Clients that want a single "session-wide" diff view
subscribe to that one changeset URI.
