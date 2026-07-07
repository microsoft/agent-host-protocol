# Changesets

A **changeset** is a named, individually subscribable view of file changes
associated with a session. Changesets generalise the v0.1.0
`SessionSummary.diffs` field: a session can expose any number of
changesets — uncommitted working-tree edits, the diff between two turns,
the cumulative changes for the whole session, the staged index, etc. —
each with its own URI, lifecycle, and update stream.

## Concepts

### Changeset Catalogue

Each session's `SessionState` advertises the set of changesets the
server can produce. The catalogue entry is intentionally lightweight —
just enough to render a chip or list row without subscribing — and
references a full subscribable `ChangesetState` by URI.

```typescript
SessionState {
  // ...existing fields...
  changesets?: Changeset[]
}

Changeset {
  /** Human-readable label, e.g. `"Uncommitted Changes"`. */
  label: string
  /** RFC 6570 URI template; expand to obtain a subscribable URI. */
  uriTemplate: string
  description?: string
  /**
   * Advisory hint: one of `'session'`, `'branch'`, `'uncommitted'`,
   * `'turn'`, or `'compare-turns'`. Other values allowed.
   */
  changeKind: string
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
  reviewed?: boolean                       // omit when the server has no "review" support
  _meta?: Record<string, unknown>
}
```

Updates flow through changeset-scoped actions, broadcast to subscribers
of the changeset URI:

| Type                                | Client-dispatchable? | When                                                                         |
| ----------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `changeset/statusChanged`           | No                   | `status` transitioned (e.g. `computing → ready`).                            |
| `changeset/fileSet`                 | No                   | Upsert a `ChangesetFile` (new or replacing existing by `id`).                |
| `changeset/fileRemoved`             | No                   | A file is no longer in the changeset.                                        |
| `changeset/filesReviewedChanged`    | No                   | The `reviewed` flag for one or more files changed (servers with review support). |
| `changeset/contentChanged`          | No                   | Full replacement of files, optionally with operations or error details.      |
| `changeset/operationsChanged`       | No                   | The set of available `operations` changed.                                   |
| `changeset/operationStatusChanged`  | No                   | A single operation's `status` transitioned (e.g. `idle → running → error`).  |
| `changeset/cleared`                 | No                   | All files dropped (e.g. branch switched).                                    |
| `changeset/disposed`                | No                   | The changeset URI is no longer subscribable.                                 |

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
  /**
   * Execution status of the operation. The server sets `'running'` while
   * an invocation is in flight, `'error'` (with `error`) when the most
   * recent invocation failed, and `'idle'` otherwise.
   */
  status: 'idle' | 'running' | 'error'
  /** Present iff `status === 'error'`. */
  error?: ErrorInfo
}
```

Because `invokeChangesetOperation` is a request/response command, an
operation's progress and outcome are reflected back into changeset state
via the `changeset/operationStatusChanged` action so that every subscriber
observes a consistent view (e.g. a spinner on a "Create Pull Request"
button, or an inline error after a failed "revert"). The action targets a
single operation by `operationId` and is a no-op if no operation with that
id is currently present.

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

1. The server publishes the catalogue on `SessionState.changesets`.
   Updates ride on the `session/changesetsChanged` action.
2. The client picks catalogue entries whose template variables it can
   satisfy and subscribes to the resulting URIs.
3. The server returns a `ChangesetState` snapshot (`status: 'computing'`
   is allowed if scanning is async) and can push `changeset/contentChanged`
   for an initial batched file snapshot, optionally including operations or
   error details, followed by narrower `changeset/*` actions as files or
   operations change.
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
aggregate counts on the new `summary.changes` field. Clients that
want a single "session-wide" diff view subscribe to that one
changeset URI.
