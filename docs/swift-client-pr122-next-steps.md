# Swift `AgentHostProtocolClient` PR 122 Plan

## Goal

Bring PR #122 into a mergeable shape as the reusable SwiftPM single-host client layer, then use it as the base for the stacked multi-host PR and a later iOS app migration.

The important framing is that PR #122 should be a protocol/client library, not a full replacement for the existing iOS app client. The app should keep app-specific policy: server selection, Dev Tunnels auth, foreground recovery, reconnect UX, session summary cache, stale-session refresh, terminal state, and optimistic outbound action reconciliation.

## Current Assessment

PR #122 is broadly the right shape:

- It adds `AgentHostProtocolClient` as a SwiftPM product next to the existing `AgentHostProtocol` types/reducers product.
- It provides the reusable single-host pieces: `AHPTransport`, `AHPClient`, JSON-RPC request correlation, `initialize`, `reconnect`, `subscribe`, `unsubscribe`, `dispatch`, generic `request`, event streams, `AHPStateMirror`, and test transports.
- CI is green, and the initial PR review comments have been addressed.

The remaining work is mostly about making the library fit our iOS app reality before merging: transport quality, optional keepalive/liveness, documentation of layering boundaries, and a test strategy that gives confidence beyond the current unit tests.

## Reasoning

### Keep #122 Low-Level

`AHPClient` should know how to speak the protocol over one transport. It should not own every app policy decision.

This keeps the library usable by different Swift clients:

- a simple CLI or prototype may only want `connect`, `initialize`, `request`, and `dispatch`;
- the iOS app needs reconnect UX, Dev Tunnels auth, local network behavior, session caches, and optimistic outbound replay;
- the future multi-host layer needs per-host supervision and aggregated state.

Those are different layers. PR #122 should expose enough primitives for them without forcing one policy on all consumers.

### Preserve App-Owned Outbound Reconciliation

`dispatchAction` is a notification, not a request. A client does not get an immediate server acknowledgement. Instead, the server later emits an `ActionEnvelope` whose `origin` contains `{ clientId, clientSeq }`.

The current iOS app uses this correctly:

1. Assign a stable `clientSeq` when dispatching a local action.
2. Keep the action in an app-level pending outbox.
3. Remove it when a replay/live `ActionEnvelope.origin` echoes the same client sequence.
4. Replay still-pending actions after reconnect.

That outbox belongs in the app adapter for now because replay policy is not uniform across actions. Some intents should be replayed exactly, some can be coalesced, and some may be dropped after reconnect.

PR #122 only needs an escape hatch that lets the app send explicit `DispatchActionParams(clientSeq:action:)`. A public generic `notify(...)` is enough for that.

### Reconnect Orchestration Should Stay Outside #122

The single-host client should expose `reconnect(...)` as a typed protocol request. It should not decide when to reconnect, how often to retry, when to fall back to `initialize`, whether auth failures are terminal, whether to show a banner, or whether to refresh session summaries.

Those decisions stay in the iOS app and, separately, in the future multi-host supervisor.

### Subscription Ownership Is Acceptable for the App, But Needs Clear Docs

In PR #122, `unsubscribe(uri)` is resource-wide: it finishes all local listeners for that URI and sends `unsubscribe` to the server.

That is fine for the current iOS app because `AppStore` is the central subscription owner. Views should observe `AppStore` state rather than independently opening protocol subscriptions.

It is less ideal for arbitrary library consumers where multiple components may call `subscribe` for the same URI. A future subscription-handle/refcount API could make that safer, but it does not need to block #122 if we document the current semantics clearly.

## Work Needed Before Merging PR #122

### 1. Add or Promote the Native `NWConnection` WebSocket Transport

The existing iOS app's native WebSocket transport is a better fit for our real app scenarios than `URLSessionWebSocketTransport` alone:

- it works better for local `ws://` development targets where ATS can get in the way;
- it covers LAN and Tailscale workflows;
- it already has explicit handshake behavior;
- it already supports ping/heartbeat behavior.

Recommended PR work:

- Keep `AHPTransport` as the abstraction.
- Keep `URLSessionWebSocketTransport` as the simple/default transport.
- Add a native `NWConnectionWebSocketTransport` or equivalent to `AgentHostProtocolClient`.
- Update docs/comments to recommend the native transport for iOS/macOS local network development.
- Make the existing app migration plan use the native transport adapter.

### 2. Add Optional Keepalive/Liveness Support

Keepalive should be optional. The library should not force heartbeat traffic for all consumers.

Recommended shape:

- Add a config option such as `keepAlive: .disabled` by default.
- Add an opt-in WebSocket ping policy, for example interval + timeout.
- Implement it only when the transport supports ping, or define a small optional capability protocol such as `AHPKeepAliveTransport`.
- Treat keepalive failure as a transport failure; let the app or supervisor decide reconnect policy.

This preserves battery/network control for simple clients while giving the iOS app fast dead-connection detection.

### 3. Document the App-Level Dispatch Outbox Pattern

We do not need to move the outbound pending-action replay queue into #122 now.

Recommended PR work:

- Add a caller-owned dispatch path, such as `AHPClient.dispatch(_:clientSeq:)`, so app code can send stable sequence numbers without using raw JSON-RPC notifications.
- Add a short documentation note or sample showing the app-level outbox pattern.
- Keep `AHPClient.dispatch(_:)` as the convenience path for simple consumers that do not own replay state.

### 4. Clarify Reconnect Layering

Recommended PR work:

- Document that `AHPClient.reconnect(...)` only performs the typed protocol handshake on the current/new transport.
- Document that replay/snapshot application, `listSessions` refresh, fallback-to-initialize, retry/backoff, and UI recovery are caller responsibilities.
- Keep automatic reconnect out of PR #122.

### 5. Clarify Subscription Semantics

Recommended PR work:

- Document that `unsubscribe(uri)` is resource-wide and closes all local streams for that URI.
- Recommend one central owner per resource subscription for app-style clients.
- Leave per-listener subscription handles/refcounting as a follow-up unless reviewers ask for it before merge.

### 6. Add A Swift Client README

PR #122 currently adds source files, API comments, and tests, but no README for the new `AgentHostProtocolClient` SwiftPM product. The existing Swift docs only cover the generated `AgentHostProtocol` types library and the example iOS app.

The simplest path is to make the README the primary landing page for the new library. It should contain the minimal example plus the important design nuances we discussed, so reviewers and future consumers can understand what the library owns and what remains app policy.

Recommended PR work:

- Add a `clients/swift/AgentHostProtocol/README.md` for the SwiftPM products.
- Cover the difference between `AgentHostProtocol` and `AgentHostProtocolClient`.
- Include a minimal single-host example directly in the README: create transport, create `AHPClient`, attach events, connect, initialize with `agenthost:/root`, apply snapshots/actions.
- Include the design decisions/nuances directly in the README:
  - `AHPClient` is a single-host protocol client, not a full app store.
  - reconnect orchestration stays with the app or a higher-level supervisor.
  - app-owned dispatch outboxes can preserve explicit `clientSeq` values for replay.
  - `unsubscribe(uri)` is resource-wide, not per-listener.
  - transport choice matters: simple/default transport vs native `NWConnection` transport for iOS/macOS local network development.
- Include a short "Next steps" section for this PR: native transport, optional keepalive, explicit dispatch/outbox guidance, transcript fixtures, and future iOS app migration.
- Link the new documentation from the root README or relevant docs sidebar if this repo's docs site expects it.

## Follow-Up Work After PR #122

- Rebase/update the stacked multi-host PR after #122 merges.
- Fix the multi-host reconnect issues found in review: apply `ReconnectResult` replay/snapshot payloads, transition away from `.connected` immediately after disconnect, and clean up failed handshake attempts.
- Build the iOS app migration as a separate PR using an adapter around `AHPClient`.
- Keep `AppStore` as the product layer; do not replace it with `AHPStateMirror`.
- Reuse the app's switch-based session/terminal URI extraction instead of the generic JSON encode/decode helper in `AHPStateMirror` for hot app paths.
- Consider promoting an optional dispatch outbox into the library only after more than one Swift consumer needs it.
- Consider subscription handles/refcounting after we see real multi-consumer usage.

## Testing Strategy

### Current Coverage in PR #122

PR #122 already has useful behavior-scoped XCTest coverage:

- initialize round trip;
- subscribe and action fan-out;
- event tap registration before handshake notifications;
- unexpected close failing pending requests;
- unsubscribe finishing per-URI streams;
- shutdown terminating streams;
- subscribe-failure listener cleanup;
- state mirror snapshot/action application;
- in-memory transport behavior;
- config buffer-size clamping.

This is a good base, but not sufficient for the iOS app migration on its own.

### Fixture/Artifact Tests

The existing `AgentHostProtocol` Swift library already has artifact-style reducer parity tests. `FixtureDrivenReducerTests` loads shared JSON fixtures from `types/test-cases/reducers` and checks Swift reducer output against the expected JSON.

We can do something similar for the client, but the artifacts should be protocol transcript fixtures rather than reducer fixtures.

Recommended fixture format:

```json
{
  "description": "initialize with root snapshot and handshake-time notification",
  "steps": [
    { "clientSends": { "method": "initialize", "params": "..." } },
    { "serverSends": { "id": 1, "result": "..." } },
    { "serverSends": { "method": "notification", "params": "..." } },
    { "expectEvent": "..." }
  ]
}
```

These fixtures can validate protocol-level behavior across clients:

- JSON-RPC request/response correlation;
- initialize and reconnect payload shape;
- action and notification decoding;
- Bool/Int preservation cases;
- request timeout/close behavior where deterministic;
- replay/snapshot application expectations for higher layers.

This is not a replacement for integration tests, but it gives cross-language parity and catches protocol drift.

### Documentation Examples as Tests

Doc examples are useful, but they should not be the primary test oracle for async networking behavior.

Recommended approach:

- Add small Swift snippets in the Swift client README showing `AHPClient` usage, app-level dispatch outbox, and reconnect layering.
- Prefer compiling examples as XCTest snippets, doctests, or package examples where practical.
- If we add JSON transcript examples to docs, parse and validate them in tests so documentation cannot drift.
- Avoid relying only on prose docs for behavior that can be represented as a fixture.

### iOS App Migration Acceptance Tests

When we migrate the app, the existing app tests should remain the acceptance suite. In particular, preserve tests for:

- reconnect replay/snapshot application;
- scene-active recovery;
- reconnect banner debounce;
- concurrent connect/reconnect race handling;
- pending outbound action replay;
- not replaying actions already acknowledged by replay;
- session summary refresh after reconnect;
- terminal subscription and terminal state behavior.

The migration should pass those tests before we consider the app moved onto the library.

### Additional Tests to Add With the PR Work

- Native WebSocket transport unit tests for frame parsing/encoding and handshake behavior where deterministic.
- Keepalive tests using a fake ping-capable transport: ping success keeps connection alive; ping timeout surfaces as transport failure.
- Explicit `dispatch(_:clientSeq:)` test showing caller-owned `clientSeq` can be sent and observed.
- Subscription semantics test: multiple listeners for one URI all finish when `unsubscribe(uri)` is called.
- Transcript fixture runner for a small set of client protocol flows.

## Concrete To-Dos

### For PR #122 Before Merge

- [ ] Port/adapt the app's native `NWConnection` WebSocket transport into `AgentHostProtocolClient`.
- [ ] Keep `URLSessionWebSocketTransport` as a simple default transport.
- [ ] Add optional keepalive/liveness configuration and tests, or document it as an immediate follow-up if the code change is too large for this PR.
- [x] Document app-owned dispatch outbox and explicit `clientSeq` dispatch.
- [x] Clarify reconnect layering in docs.
- [x] Clarify resource-wide `unsubscribe(uri)` semantics.
- [x] Add a README for the SwiftPM products with the simple example, design nuances, and PR next steps.
- [ ] Add tests for the new/clarified transport and keepalive.
- [x] Add tests for explicit dispatch and subscription semantics.
- [ ] Run `swift test` locally and verify CI is green.

### After PR #122 Merges

- [ ] Update/rebase PR #124 onto main.
- [ ] Fix multi-host reconnect replay/snapshot handling.
- [ ] Fix multi-host state transition after unexpected disconnect.
- [ ] Fix multi-host cleanup on failed handshake attempts.
- [ ] Re-run `swift test` and strict concurrency build for the stacked multi-host branch.

### Later iOS App Migration

- [ ] Build an app adapter around `AHPClient`.
- [ ] Use the native `NWConnection` transport from the library.
- [ ] Preserve AppStore-owned reconnect policy and UI state.
- [ ] Preserve the app-owned pending outbound action outbox.
- [ ] Keep AppStore reducer/state routing rather than replacing it with `AHPStateMirror`.
- [ ] Run the existing iOS app test suite as the migration acceptance suite.
