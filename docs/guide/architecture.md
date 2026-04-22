# Architecture

The Agent Host Protocol server runs as either an Electron **utility process** (desktop) or a **standalone WebSocket server** (headless/development). It hosts agent backends and exposes session state to clients through structured communication layers.

## Process Model

```
+---------------------------------------------------------------+
|  Client (Renderer / Web App / CLI)                            |
|                                                               |
|  SessionClientState (write-ahead reconciliation)              |
|    +-- confirmed + pending + optimistic state                 |
|    +-- action envelope reconciliation                         |
+--------- WebSocket / MessagePort / JSON-RPC -----------------+
|  Agent Host Server                                            |
|                                                               |
|  SessionStateManager (server-authoritative state tree)        |
|    +-- rootReducer / sessionReducer                           |
|    +-- action envelope sequencing                             |
|                                                               |
|  ProtocolServerHandler (JSON-RPC routing, broadcasts)         |
|    +-- per-client subscriptions, replay buffer                |
|                                                               |
|  Agent Registry                                               |
|    +-- Agent A (e.g. CopilotAgent via @github/copilot-sdk)   |
|    +-- Agent B (e.g. MockAgent for testing)                   |
|                                                               |
|  agentEventMapper                                             |
|    +-- IAgentProgressEvent → SessionAction mapping           |
+---------------------------------------------------------------+
```

## Communication Layers

The system has two distinct protocol layers:

### Layer 1: IAgent Interface (Internal)

The `IAgent` interface is what each agent backend implements. It fires raw progress events and exposes methods for session management:

| Method | Description |
|---|---|
| `createSession(config?)` | Create a new session (returns session URI) |
| `sendMessage(session, prompt, attachments?)` | Send a user message |
| `abortSession(session)` | Abort the current turn |
| `respondToPermissionRequest(requestId, approved)` | Grant/deny a permission |
| `getDescriptor()` | Return agent metadata |
| `listModels()` | List available models |
| `listSessions()` | List persisted sessions |
| `changeModel?(session, model)` | Change model for a session |

This layer is **agent-specific**. Different backends can have different event shapes.

### Layer 2: Sessions State Protocol (Client-Facing)

The server maps raw agent events to state actions via an event mapper, dispatches them through `SessionStateManager`, and broadcasts to subscribed clients. **This layer is agent-agnostic.**

Clients never see agent-specific tool names or event formats. They consume generic, display-ready `ToolCallState` values, including the `ToolCallCompletedState` variant, which carry fields like `displayName`, `invocationMessage`, and `toolKind`.

## Agent-Agnostic Design

This is a hard rule: **the client-facing protocol must remain agent-agnostic.**

All agent-specific logic — translating tool names into display strings, extracting command lines from parameters, determining rendering hints like `toolKind: 'terminal'` — lives in the server-side agent implementation. The event mapper transforms these into generic state actions before they reach clients.

Client-side rendering components are completely generic. They receive all provider-specific details via configuration:

```typescript
interface IAgentHostSessionHandlerConfig {
  readonly provider: AgentProvider;    // e.g. 'copilot'
  readonly agentId: string;
  readonly sessionType: string;
  readonly fullName: string;
  readonly description: string;
}
```

Adding a new agent provider means adding a new `IAgent` implementation on the server. No client-side changes are needed.

## Session URIs

Sessions are identified by URIs where the **scheme is the provider name** and the **path is the raw session ID**:

```
copilot:/<uuid>
```

| Helper | Purpose |
|---|---|
| `AgentSession.uri(provider, rawId)` | Create a session URI |
| `AgentSession.id(session)` | Extract raw session ID from URI |
| `AgentSession.provider(session)` | Extract provider name from URI scheme |

## Deployment Modes

### Desktop (Electron Utility Process)

The server runs as a utility process. The renderer connects directly via MessagePort. A process manager handles lazy startup and crash recovery (automatic restart up to 5 times on unexpected termination).

### Standalone WebSocket Server

The server runs as a Node.js process with a WebSocket endpoint:

```bash
node agentHostServerMain.js [--port <port>] [--enable-mock-agent]
```

Multiple clients connect over WebSocket. Useful for development, headless CI, and remote scenarios.

## Next Steps

- [State Model](/guide/state-model) — The immutable state tree and its types.
- [Actions](/guide/actions) — How state mutations work.
- [Transport](/specification/transport) — Transport layer specification.
