# Versioning

AHP uses a forward-compatible versioning strategy. Newer clients can connect to older servers and degrade gracefully. A single protocol version number maps to a capabilities object.

## Protocol Version Constants

Two constants define the version window:

- **`PROTOCOL_VERSION`** — The current version that new code speaks.
- **`MIN_PROTOCOL_VERSION`** — The oldest version the implementation maintains compatibility with.

```
Version history:
  1 — Initial: core session lifecycle, streaming, tools, permissions
```

## When to Bump the Version

Bump `PROTOCOL_VERSION` when:
- A new feature area requires capability negotiation (client must know server supports it before sending commands).
- Behavioral semantics of existing actions change.

The following do **not** require a version bump:
- Adding **optional** fields to existing action/state types.
- Adding new action types (they're filtered by version automatically).

## Version Type Snapshots

Each protocol version has a type file (`v1.ts`, `v2.ts`, etc.) that captures the wire format shape of every state type and action type in that version.

The **latest** version file is the editable "tip" — it can be modified alongside the living types. When `PROTOCOL_VERSION` is bumped, the previous version file becomes frozen and a new tip is created.

## Compatibility Checks

The version registry performs **bidirectional assignability checks** between version types and living types:

```typescript
// AssertCompatible requires BOTH directions:
//   Current extends Frozen → can't remove fields or change field types
//   Frozen extends Current → can't add required fields
// The only allowed evolution is adding optional fields.
type AssertCompatible<Frozen, Current extends Frozen> =
  Frozen extends Current ? true : never;
```

| Change to living type | Compile result |
|---|---|
| Add optional field | ✅ Passes |
| Remove a field | ❌ `Current extends Frozen` fails |
| Change a field's type | ❌ `Current extends Frozen` fails |
| Add required field | ❌ `Frozen extends Current` fails |

## Exhaustive Action → Version Map

The registry maintains a runtime map with a TypeScript index signature that forces an entry for every action type in the union:

```typescript
const ACTION_INTRODUCED_IN: { readonly [K in StateAction['type']]: number } = {
  'root/agentsChanged': 1,
  'session/turnStarted': 1,
  'session/delta': 1,
  // ...every action type must have an entry
};
```

Adding a new action to the union without adding it to this map is a compile error.

The server uses this for one-line filtering:

```typescript
function isActionKnownToVersion(action: StateAction, clientVersion: number): boolean {
  return ACTION_INTRODUCED_IN[action.type] <= clientVersion;
}
```

## Capabilities

The protocol version maps to a `ProtocolCapabilities` interface for feature gating:

```typescript
interface ProtocolCapabilities {
  // v1 — always present
  readonly sessions: true;
  readonly tools: true;
  readonly permissions: true;
  // v2+ (example)
  readonly reasoning?: true;
}

function capabilitiesForVersion(version: number): ProtocolCapabilities {
  return {
    sessions: true,
    tools: true,
    permissions: true,
    // ...(version >= 2 ? { reasoning: true } : {}),
  };
}
```

## Forward Compatibility

A newer client connecting to an older server:

1. During handshake, the client learns the server's protocol version from the `initialize` response.
2. The client derives `ProtocolCapabilities` from the server version.
3. Command factories check capabilities before dispatching; if unsupported, the client degrades gracefully.
4. The server only sends action types known to the client's declared version (via `isActionKnownToVersion`).
5. As a safety net, clients SHOULD silently ignore actions with unrecognized `type` values.

## Backward Compatibility

Backward compatibility (older clients connecting to newer servers) is not guaranteed. Clients should update before the server.

## Raising the Minimum Version

When `MIN_PROTOCOL_VERSION` is raised from N to N+1:

1. Delete the version N type file (`vN.ts`).
2. Remove the vN compatibility checks from the version registry.
3. The compiler surfaces any dead code that only existed for vN compatibility.
4. Clean up that dead code.
