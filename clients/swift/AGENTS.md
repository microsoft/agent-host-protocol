# Swift Examples — Agent Guide

## Overview

This directory contains two Swift packages for the Agent Host Protocol (AHP):

1. **AgentHostProtocol** — A pure Swift library (no external dependencies) providing auto-generated types, actions, and reducers for the protocol. Targets iOS 16+, macOS 13+, Swift 5.9+. The Swift sources live in `clients/swift/AgentHostProtocol/`, but the `Package.swift` manifest lives at the **repository root** (`/Package.swift`) so that external consumers can pull this in via `.package(url:)`. SwiftPM only resolves manifests at the root of a remote git repository.
2. **AHPClient** — An example iOS app (Xcode project) demonstrating a full AHP client with WebSocket transport, state synchronization, reconnection, and a SwiftUI chat UI. Uses [dev-tunnels-swift](https://github.com/rebornix/dev-tunnels-swift) (remote Swift Package) for tunnel discovery, authentication, and relay connections.

## Code Generation

Types in `AgentHostProtocol/Sources/AgentHostProtocol/Generated/` are **auto-generated** from the TypeScript definitions in `types/`. Do not edit these files directly. Generated files are committed to source control so the package is consumable via SwiftPM without a code-generation toolchain.

To regenerate after protocol changes:

```bash
npm run generate:swift    # runs: tsx scripts/generate.ts --swift
```

Generated files: `State`, `Commands`, `Actions`, `Errors`, `Messages`, `Notifications` — all suffixed `.generated.swift`.

CI verifies that the committed generated files match the output of `npm run generate:swift` and fails on drift.

## AgentHostProtocol Library

### Installing via Swift Package Manager

Add it as a dependency in your `Package.swift`:

```swift
.package(url: "https://github.com/microsoft/agent-host-protocol.git", from: "0.1.0")
```

…and reference the `AgentHostProtocol` product from your target:

```swift
.target(
    name: "MyApp",
    dependencies: [
        .product(name: "AgentHostProtocol", package: "agent-host-protocol"),
    ]
),
```

In Xcode: **File ▸ Add Package Dependencies…** and enter `https://github.com/microsoft/agent-host-protocol`.

### Key Types

- **`RootState`** — Top-level state: agents list + active sessions.
- **`SessionState`** — Per-session conversation state (turns, tool calls, lifecycle).
- **`AgentInfo` / `SessionModelInfo`** — Agent capabilities and available models.
- **`ActionEnvelope`** — Server-sent action with `serverSeq` (global monotonic counter) and resource URI.
- **Command params/results** — `InitializeParams`, `ReconnectParams`, `CreateSessionParams`, `SubscribeParams`, etc.

### Reducer Pattern

Inspired by Swift Composable Architecture (TCA). Key abstractions:

- **`Reducer` protocol** — Pure function: `reduce(into state: inout State, action: Action)`.
- **`AHPRootReducer`** — Handles root-level actions (agents changed, session added/removed).
- **`AHPSessionReducer`** — Handles per-session actions (deltas, tool calls, turn lifecycle).
- **Composable** via `CombinedReducer` and `AnyReducer` type erasure.

Reducers are pure functions — replaying actions in `serverSeq` order on any prior state snapshot produces identical results. This is critical for the reconnection protocol.

## AHPClient App

### Architecture

```
AHPClientApp (@main, scenePhase monitoring)
  └─ AppStore (@Observable, @MainActor)
       ├─ AHPConnection (actor — WebSocket JSON-RPC transport)
       ├─ RootState + [SessionState] (protocol state, mutated by reducers)
       ├─ ServerStorage (persisted server configs)
       └─ Views (SwiftUI)
```

### AppStore

Central state container. All mutations flow through reducer functions (`applySnapshot`, `handleAction`). Key responsibilities:

- **Connection lifecycle** — `connect()`, `disconnect()`, `reconnect()`, `reconnectIfNeeded()`
- **Session management** — `createSession()`, `disposeSession()`, `selectSession()`
- **State sync** — Receives `ActionEnvelope`s from the connection, applies via reducers
- **Reconnection** — Tracks `lastSeenServerSeq` and subscribed URIs; sends `reconnect` command on resume. Server responds with either **replay** (missed actions) or **snapshot** (fresh state).

### AHPConnection

An `actor` wrapping `URLSessionWebSocketTask` for thread-safe JSON-RPC over WebSocket:

- Request/response correlation via sequential message IDs and `CheckedContinuation`
- `onAction` callback delivers `ActionEnvelope`s to AppStore on `@MainActor`
- `onUnexpectedDisconnect` fires when the receive loop breaks on error
- `canReconnect` — true when a prior connection established `serverSeq` + subscriptions

### Reconnection Flow

When the phone wakes from background or the WebSocket drops unexpectedly:

1. `scenePhase → .active` triggers `reconnectIfNeeded()` (or `onUnexpectedDisconnect`)
2. Client sends `reconnect(clientId, lastSeenServerSeq, subscriptions)` to server
3. Server responds with **Replay** (array of missed `ActionEnvelope`s) or **Snapshot** (full state per subscribed URI if gap is too large)
4. `AppStore` applies the result via reducers, bringing local state up to date
5. A floating progress bar shows "Reconnecting…" in the active chat view

`serverSeq` is a **global** monotonic counter across all sessions. The server filters replays to only the client's subscribed URIs.

### UI Structure

- **ContentView** — NavigationStack root, routes to sidebar or chat.
- **SidebarView** — Session list with `.searchable()` (iOS 26 liquid glass bottom bar), grouped by time or working directory. `NewSessionButton` opens `AgentPicker` modal.
- **ChatView** — VStack-based message list with bottom-anchored scroll, scroll-to-bottom button (glass effect on iOS 26), reconnect progress bar, and unified input bar (send/stop).
- **AgentPicker** — Form with `Picker` controls for agent, model, and a working directory text field.
- **ResponsePartView** — Renders markdown (via `AttributedString`), tool call cards (tap → detail modal with inputs/outputs), reasoning blocks, and content references.

### iOS 26 Adaptations

The app uses `#available(iOS 26.0, *)` checks for:
- `.glassEffect()` on the scroll-to-bottom button
- `.searchable()` with `.toolbar` placement + `DefaultToolbarItem(kind: .search, placement: .bottomBar)`
- New Session button in `.bottomBar` toolbar
- Fallbacks to `.ultraThinMaterial` and `.navigationBarDrawer` on older iOS

### Testing

- **AHPClientTests** — Reconnection state tests: snapshot restore, replay ordering, empty replay, multi-resource snapshot, live action application.
- **AgentHostProtocol Tests** — Reducer unit tests (root reducer, session reducer, native reducer).

### Build & Run

Open `AHPClient/AHPClient.xcodeproj` in Xcode. The project references `AgentHostProtocol` as a local Swift package whose manifest lives at the **repository root** (`../../..` relative to the Xcode project), and `DevTunnelsClient` as a remote Swift package from [rebornix/dev-tunnels-swift](https://github.com/rebornix/dev-tunnels-swift). Code signing requires a `Signing.local.xcconfig` file (see `Config/Signing.local.xcconfig.example`).

**Dev Tunnels integration:** `TunnelListView.swift` uses the `DevTunnelsClient` library directly — `TunnelManagementClient` for tunnel listing/details, `DeviceCodeAuth` for GitHub OAuth, and `TunnelConnection` helpers for relay URIs and connect tokens. All calls are `async` — no shim layer or Rust FFI needed.

For development, `AHPClient` uses a native `NWConnection` WebSocket transport instead of `URLSessionWebSocketTask`,  avoiding `URLSession` ATS enforcement for direct `ws://` development targets such as local LAN addresses or Tailscale tailnet IPs. Public or internet-exposed deployments should still prefer `wss://`.
