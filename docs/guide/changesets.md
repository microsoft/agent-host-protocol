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
  /** Optional capability declarations (presence-flag objects). */
  capabilities?: {
    /** Present ⇒ this changeset supports the per-file review workflow. */
    review?: {}
  }
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
| `{turnId}`                                | Per-turn slice. Expand with a `Turn.id` from one of the session's chats.     |
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
  reviewed?: boolean                       // GitHub-style "Viewed" flag; absent ⇒ not reviewed
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
| `changeset/filesReviewChanged`      | Yes                  | A reviewer toggled the `reviewed` flag on one or more files.                 |
| `changeset/contentChanged`          | No                   | Full replacement of files, optionally with operations or error details.      |
| `changeset/operationsChanged`       | No                   | The set of available `operations` changed.                                   |
| `changeset/operationStatusChanged`  | No                   | A single operation's `status` transitioned (e.g. `idle → running → error`).  |
| `changeset/cleared`                 | No                   | All files dropped (e.g. branch switched, or the owning session ended).       |

### File Review

**Review is a capability of the changeset.** A changeset advertises support for
the review workflow on its catalogue `Changeset` entry via
`capabilities.review` (a presence-flag object). Clients see this up-front on the
session's changeset list, so they can decide whether to surface review UI
without first subscribing. When the capability is absent, the changeset is not
reviewable.

For a reviewable changeset, each `ChangesetFile` carries an optional `reviewed`
flag — the equivalent of GitHub's per-file **"Viewed"** checkbox. A missing
value is treated as **not reviewed**.

Unlike the rest of the `changeset/*` family, the
`changeset/filesReviewChanged` action is **client-dispatchable**: a reviewer
toggles files' review state directly, applying it optimistically through the
write-ahead reducer and letting the server echo it back on the normal `action`
envelope stream. The server MAY also originate it (e.g. an agent marking its own
output reviewed). The action is **batched** — it carries a list of file ids that
all move to the same `reviewed` value.

```typescript
// dispatched by a client (or the server)
{
  type: 'changeset/filesReviewChanged'
  files: string[]       // ChangesetFile.id values
  reviewed: boolean     // true marks the files reviewed, false clears them
}
```

The reducer sets `reviewed` on every listed file that is present in the
changeset, leaving each file's `edit` and `_meta` untouched. Ids that don't
match a current file are ignored; the action is a no-op when none match.

**Reset on edit.** The protocol has no per-file content version, so review is
**not** reset automatically when a file's contents change under a stable id. The
server, which is the authority on what changed, resets review explicitly —
either by re-emitting the file (via `changeset/fileSet` or
`changeset/contentChanged`) without `reviewed: true`, or by dispatching
`changeset/filesReviewChanged` with `reviewed: false`.

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
   * recent invocation failed, `'disabled'` when the operation cannot
   * currently be invoked, and `'idle'` otherwise.
   */
  status: 'idle' | 'running' | 'error' | 'disabled'
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
  channel: URI
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
   un-subscribable. Existing subscriptions receive `changeset/cleared`
   and the server unsubscribes them.

## Migration from v0.1.0

The `summary.diffs` field and the `session/diffsChanged` action were
removed in v0.2.0. Servers that previously populated `summary.diffs`
should expose an equivalent server-side changeset with a static
`uriTemplate` ending in `/changeset/session` and surface its
aggregate counts on the new `summary.changes` field. Clients that
want a single "session-wide" diff view subscribe to that one
changeset URI.
