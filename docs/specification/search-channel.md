# Search Channel

<StabilityIndex level="1.0" />

A search channel runs one search on the host and streams its results into the
channel's state. One search can look in file names, file contents, session
titles, and chat messages at the same time. The client can change the query
while the search runs, and cancels the search by unsubscribing.

## Capability

A host that supports search includes `search` in the `initialize` result. It
lists the kinds of target that the host can search:

```json
{ "search": { "targets": ["fileNames", "fileText", "sessions", "chatMessages"] } }
```

A client MUST NOT send `createSearch` unless this member is present, and MUST
NOT include a target whose kind is not listed.

## Starting a Search

The client chooses a URI for the new channel and sends `createSearch` with a
query:

```json
{
  "jsonrpc": "2.0",
  "id": 40,
  "method": "createSearch",
  "params": {
    "channel": "ahp-search:/q1",
    "query": {
      "text": "parseConfig",
      "matchCase": true,
      "targets": [
        { "kind": "fileText", "roots": ["file:///workspace"], "excludes": ["**/dist/**"] },
        { "kind": "sessions" },
        { "kind": "chatMessages", "chats": ["ahp-chat:/c1"] }
      ],
      "maxResults": 500
    }
  }
}
```

On success, the result is an empty object (`{}`). On failure, the host returns
one of these errors:

| Error | Cause |
|---|---|
| `InvalidParams` | The query is not valid. For example, a target kind is not supported or a regular expression is invalid. |
| `PermissionDenied` | The client is not permitted to search a root or chat. |
| `AlreadyExists` | The channel URI is already in use. The host MUST NOT replace the existing search. |

The client then subscribes to the channel. A new search starts with no
results and a `running` lifecycle. If the client does not
subscribe within a time limit that the host chooses, the host stops the search
and releases the channel.

## Query

| Member | Meaning |
|---|---|
| `text` | The text to search for. An empty `text` matches nothing. |
| `matchCase` | Match case. Defaults to `false`. |
| `wholeWord` | Match only whole words. Defaults to `false`. |
| `isRegex` | Treat `text` as a regular expression. Defaults to `false`. |
| `targets` | Where to search. At least one target. |
| `maxResults` | The maximum number of results. The host MAY apply a lower limit. |

Each target has a `kind`:

| Kind | Searches | Members |
|---|---|---|
| `fileNames` | File paths under `roots`. The host decides how to match `text` against paths, for example with fuzzy matching, and which query options apply. | `roots`, `includes`, `excludes`, `includeIgnored` |
| `fileText` | The text content of files under `roots` | `roots`, `includes`, `excludes`, `includeIgnored` |
| `sessions` | The host's sessions, the same sessions that `listSessions` returns. The host decides which session content it matches, for example titles or requests. | none |
| `chatMessages` | The visible text of chat requests and responses, including turns that are not loaded in the chat's state | `chats`: the chats to search. At least one chat URI. |

`includes` and `excludes` are glob patterns relative to a root. By default, the
host skips files that its ignore rules, such as `.gitignore` files, exclude.
Set `includeIgnored` to search them as well; `excludes` still apply.

## State

The channel's state is a `SearchState`:

```typescript
SearchState {
  query: SearchQuery
  results: SearchResult[]
  lifecycle: SearchLifecycleState
}
```

Each result is one match. Every result has the `resource` that contains the
match, a `match` with the text to display, and an optional `score`.
`match.highlights` are the matched spans of `match.text`. Each span is the
half-open interval `[rangeStart, rangeEnd)` of UTF-16 code unit offsets, as in
completion items. The host chooses how much text around the match to include
in `match.text`.

| Result kind | `resource` | Other members |
|---|---|---|
| `fileName` | The file | none. `match.text` is the file's path. |
| `fileText` | The file | `range`: the location of the match in the file, as a `TextRange` |
| `session` | The session URI | `title`: the session's title |
| `chatMessage` | The chat URI | `title` (the chat's title) and `turnId` |

`score` is a number with no fixed range; higher is better. Scores are
comparable across all results of one search, so a client can show results of every kind in one
ranked list. Results are stored in the order the host found them; clients
SHOULD sort them by descending score. A host that does not rank results omits
the score.

To open a `chatMessage` result, the client subscribes to the chat and locates
the turn with `turnId`.

### Lifecycle

`lifecycle` is a union discriminated by `status`:

| Status | Meaning | Other members |
|---|---|---|
| `pending` | The query changed and the host has not replaced the results yet. `results` belong to the previous query; clients MAY show them dimmed. | none |
| `running` | The host is searching and may add results. | none |
| `completed` | The host found every result for the query. | `reason`: `exhausted` (every target was searched) or `limitReached` (the host stopped at the result limit) |
| `failed` | The search failed. Results found before the failure remain. | `error` |

`completed` and `failed` are not final. A host that watches the searched
files, sessions, or chats MAY change the results of a completed search, or move
it back to `running` and search again.

## Actions

| Action | Dispatched by | Effect |
|---|---|---|
| `search/queryChanged` | Client | Replaces `query`, keeps `results`, and sets `lifecycle` to `pending`. The host restarts the search. |
| `search/resultsChanged` | Host | Appends `results`. With `replace: true`, replaces every result instead; the replacement may be empty, and a `pending` lifecycle becomes `running`. |
| `search/lifecycleChanged` | Host | Replaces `lifecycle`, for example to complete or fail the search. |

The host MUST NOT dispatch an empty `results` list unless `replace` is `true`,
and MUST NOT change the lifecycle to `pending`; only `search/queryChanged` does
that. A host MAY replace the results at any time, for example to re-rank them,
to remove duplicates, or to update a completed search when a watched file
changes.

## Changing the Query

To change the query, for example as the user types, the client dispatches
`search/queryChanged` with the full new query. The reducer keeps the old
results and sets the lifecycle to `pending`, so the list does not flash empty
while the host restarts the search.

After the host applies `search/queryChanged`, it stops the previous search and
drops any of its results that it has not dispatched yet. It MUST then dispatch
`search/resultsChanged` with `replace: true` before any other search action. The replacement can
keep the old results that still match the new query, for example when the user
narrows `pars` to `parse`, or it can be empty. Results for the old query that
the host dispatched before it applied the change are replaced along with the
rest.

If the new query is not valid, for example because it contains an invalid
regular expression, the host accepts the action, replaces the results with an
empty list, and then changes the lifecycle to
`failed`. The client can show the error next to the query.

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant H as Host

    C->>H: createSearch { channel: "ahp-search:/q1", query: { text: "pars", ... } }
    H-->>C: {}
    C->>H: subscribe { channel: "ahp-search:/q1" }
    H-->>C: { snapshot: { state: { query, results: [], lifecycle: { status: "running" } } } }
    H-->>C: action search/resultsChanged (append)
    C->>H: dispatchAction search/queryChanged { query: { text: "parseConfig", ... } }
    H-->>C: action search/queryChanged (lifecycle: pending)
    H-->>C: action search/resultsChanged { replace: true } (old results that still match; lifecycle: running)
    H-->>C: action search/resultsChanged (append)
    H-->>C: action search/lifecycleChanged { status: "completed", reason: "exhausted" }
    C->>H: unsubscribe { channel: "ahp-search:/q1" }
    Note over H: search released
```

## Cancelling a Search

The client cancels a search by sending `unsubscribe` for its channel. When the
last subscriber unsubscribes, the host stops the search and releases the
channel.

A completed search keeps its state until the client unsubscribes. The client
can change the query of a completed search to start it again.

## Connection Loss

When the AHP connection closes, the host MAY keep a search for a period of time
that it chooses, so that a client can resume it with `reconnect` or
`subscribe`. Once the host releases a search, `reconnect` lists the channel in
`missing`, and `subscribe` fails. To search again, the client sends
`createSearch`.

## Security

A host applies the same access rules to a search as to the operations that
would reach the same data: `resourceRead` for files, and `listSessions` and
`subscribe` for sessions and chats. A host does not need to track which
sessions or chats a particular client has seen. A host SHOULD limit the number
of searches for each client and the work that each search does.
