# Model Source Registry

> A proposal to let clients register bring-your-own-key (BYOK) model sources with an agent host, so the host can serve those models to its sessions and automations. It tracks [#619](https://github.com/microsoft/agent-host-protocol/issues/619) and builds on the model sources in [#543](https://github.com/microsoft/agent-host-protocol/pull/543), which has not merged yet. Docs only: nothing here changes `types/`.

## Status

Proposal. The type sketches below show the intended shape. They are not part of the protocol until a follow-up change adds them to `types/`, regenerates the clients, and updates the guides and specification.

An earlier revision proposed model sources as session-scoped plugin customizations. Review pointed out that BYOK configuration belongs to the user rather than to one session, and that automations and long-running headless sessions need model sources that outlive a client's session. This revision moves them to a host-wide registry. [§11](#_11-alternatives-considered) explains the trade-off.

It assumes the direction #543 is taking after review:

- Model IDs are unique within an agent's catalog.
- `SessionModelInfo.modelSourceId` groups a model under a `ModelSourceInfo` in `AgentInfo.modelSources`.
- A selection is just a model `id`.

### Terminology

- A **model source** is #543's term for an independently selectable source of model access, described by `ModelSourceInfo` in an agent's catalog.
- A **registered model source**, or **registration**, is an entry in the host's registry, `RootState.modelSources`: a model source a client or the host added, with its status.
- A **model source definition** is what tells the agent how to reach the source: the endpoint, the wire format, and any curated model list, in a format the agent understands. It travels on the action that registers the source, and isn't kept in state.
- A **contributing client** is a client that registered a source and hasn't left. The host tracks contributing clients itself, from the origin of each registering action. They aren't in state.
- A **principal** is the user or account a host has verified a client acts for. AHP doesn't define how a host verifies one.
- An **agent provider** is the existing `provider` field (`AgentInfo.provider`). Nothing new is called a "provider".

---

## 1. Problem

A client can own the user's BYOK model configuration: endpoints, wire formats, curated model lists, and API keys. The protocol has no way to hand that configuration to an agent host:

- **No way to register a source.** Models are advertised by the host in `AgentInfo.models`, and #543's model sources are host-declared too. A client can't add one.
- **No credential path.** [`authenticate`](/specification/authentication#token-delivery) only accepts tokens for resources the host itself advertised: `AgentInfo.protectedResources`, or a live MCP authentication challenge. The client can't give the host a source's key.
- **No status.** Nothing reports whether a source loaded, needs a key, or failed.

For example, a client such as VS Code lets users configure their own OpenAI, Anthropic, Azure, Gemini, OpenRouter, or custom OpenAI-compatible endpoints. When the agent host runs elsewhere (over SSH, in WSL, through a tunnel, or as a long-lived remote service), those models can't be offered: the configuration and the key stay with the client.

The host may also run work no client is watching: sessions that span hours or days, and automations. Model sources have to be able to outlive one client's connection.

---

## 2. Principle: keep AHP thin

The agent behind the host does the heavy lifting. It owns:

- the model source definition format and how to read it;
- endpoint validation and network policy;
- model discovery and capability derivation (context windows, vision support, and so on);
- the wire protocol for inference;
- the mapping from AHP model IDs to the endpoint's own model identifiers;
- how a credential is applied to a request.

AHP carries only four things:

1. **Registration.** A client adds, updates, or removes a model source.
2. **Status.** The host reports whether each source is starting, ready, needs a credential, or failed.
3. **Credential.** A client supplies a secret, scoped to one registered source.
4. **Selection.** The source's models appear in the agent's catalog and are selected like any other model.

AHP suggests a few recognized format names ([§4.1](#_4-1-the-registry)), but doesn't define what a definition contains, even for those. `definition` is opaque to AHP and belongs to the agent.

---

## 3. Existing patterns this builds on

- **Model sources ([#543](https://github.com/microsoft/agent-host-protocol/pull/543)).** `ModelSourceInfo { id, displayName }` and `AgentInfo.modelSources` describe an agent's sources, and `SessionModelInfo.modelSourceId` groups each model under one. A registered source joins that catalog, so selection, new-session pickers, and automations need nothing new.
- **Client-dispatched root actions.** `root/configChanged` already lets clients change host-wide state that the host validates and applies.
- **Keyed collections.** The registry follows the `Set` and `Removed` convention used for `activeClients`, `customizations`, and other keyed lists.
- **MCP server authentication.** An MCP server publishes `McpServerAuthRequiredState`, and the client answers with `authenticate` and a `target` naming that server. The [authentication spec](/specification/authentication#why-keyed-by-resource-and-optional-target) notes that `target.kind` is extensible for exactly this kind of addition.
- **MCP server status.** The host reports a server's lifecycle with `session/mcpServerStateChanged`, a narrow action that updates only the server's state. A registration's status works the same way.
- **No per-client ownership.** Any client in a session can start, stop, or enable an MCP server and answer its authentication challenge. AHP checks a `clientId` only to route a client tool's result back from the client that runs it. Registrations follow the same model by default: every connected client can use and change them. A host that can verify principals MAY restrict them ([§4.7](#_4-7-discovering-support)).
- **Container provenance and `nonce`.** A client-published plugin carries a `nonce`, an opaque version token the host compares to detect changes without re-reading the plugin, and a host-reported `load` state that is absent until the host reports one. A registered source carries a `nonce` for its definition the same way, and its host-reported fields are absent until the host reports them.
- **Action origin.** Every client-dispatched action's envelope carries the dispatcher's `clientId` in `ActionEnvelope.origin`. The host learns who registered a source from it, so the registry itself doesn't need client IDs.

---

## 4. Proposed surface

Everything here is additive and optional. It adds one root state field, three root actions (two of them client-dispatchable), one `authenticate` target, one agent capability, and one well-known `ErrorInfo.errorType`. There are no new commands, notifications, error codes, or channels.

### 4.1 The registry

```ts
// types/channels-root/state.ts

export interface RootState {
  // …existing…
  /**
   * Model sources registered on this host, keyed by `id`. When one is
   * ready, it also appears in its agent's `AgentInfo.modelSources` catalog.
   */
  modelSources?: ModelSource[];
}

/**
 * A model source registered on this host by a client, or by the host
 * itself. The definition that tells the agent named by `provider` how to
 * reach it travels on `root/modelSourceSet` and isn't kept here. Nothing
 * here is a credential.
 *
 * @category Root State
 * @stability 1.0
 * @preserveUnknownMembers
 */
export interface ModelSource {
  /**
   * Host-unique ID, chosen by whoever registers the source. Also the
   * source's `ModelSourceInfo.id` in the agent's catalog, and the
   * `modelSourceId` of its models.
   */
  id: string;
  /** Agent provider whose agent reads the definition and serves the models. */
  provider: string;
  /** Human-readable name, published as `ModelSourceInfo.displayName`. */
  displayName: string;
  /** Icons for UI display. */
  icons?: Icon[];
  /**
   * The definition's format, one of the agent's
   * `ModelSourceRegistrationCapability.formats`. Recognized values include:
   *
   * - `'openaiCompatible'`: an endpoint that implements OpenAI's API, such
   *   as OpenAI, OpenRouter, xAI, or a local server like Ollama or LM Studio.
   * - `'anthropic'`: an endpoint that implements Anthropic's Messages API.
   * - `'azureOpenai'`: an Azure OpenAI deployment.
   * - `'gemini'`: Google's Gemini API.
   *
   * Agents MAY read other formats, named with a namespace such as
   * `example.com/model-source@1` so they don't collide.
   */
  format: string;
  /**
   * Opaque version token for the definition, such as a hash of it, chosen
   * by whoever registers the source. A client compares it with its own copy
   * instead of the definition, and the reducer compares it to tell an update
   * from a re-registration of the same definition.
   */
  nonce: string;
  /** What happens when the last contributing client leaves. Absent means `contributingClient`. */
  retention?: ModelSourceRetentionPolicy;

  // Host-reported fields, set together with `root/modelSourceStateChanged`.
  // Absent until the host reports, and after an update replaces the
  // definition until the host reports again.

  /** Host-reported status. */
  state?: ModelSourceState;
  /**
   * Host-issued token that a client echoes when it delivers the credential,
   * and that tags every agent operation on the source. See §4.4.
   */
  credentialNonce?: string;
  /**
   * RFC 9728 metadata for the endpoint the credential is for. Present
   * whenever the source takes a credential, in every state, so any client
   * can deliver, rotate, or revoke one. Absent for a source that needs no
   * credential.
   */
  credentialResource?: ProtectedResourceMetadata;
  /**
   * Every origin the host sends the credential to, such as
   * `https://api.example.com`. Present whenever `credentialResource` is.
   */
  credentialOrigins?: URI[];
  /**
   * The `accountId` the client sent with the credential the host most
   * recently accepted. While the state is `starting` or `ready`, the host
   * holds that credential. While it's `authRequired`, `reason` says what
   * happened to it. Absent until the host accepts a credential sent with an
   * `accountId`.
   */
  accountId?: string;
  _meta?: Record<string, unknown>;
}
```

The `format` values follow the pattern of `Changeset.changeKind`: AHP recognizes a few names so clients and agents can agree on common cases, but it doesn't define what a definition contains, even for those ([§9](#_9-open-questions)). `definition` is opaque to AHP and belongs to the agent.

The definition travels only on `root/modelSourceSet` ([§4.3](#_4-3-registering-updating-and-removing)). The host hands it to the agent and keeps it privately, and the reducer stores the source without it. Clients don't need the definition after it's submitted: they compare `nonce` with their own copy, and check where a key would go with the host-reported `credentialOrigins`. Actions are broadcast and replayed, so the definition is still never secret, and it MUST NOT contain a credential.

`credentialResource.resource` is the endpoint URL as the definition names it, and the value a client passes back as `authenticate({ resource })`. `credentialResource.resource_name` labels the prompt, for example "OpenRouter API key". A source that accepts OAuth access tokens advertises `authorization_servers` and `scopes_supported`. A source that takes a user-supplied secret omits them. A source whose models use several endpoints lists every origin in `credentialOrigins`, so a client can check them all before it sends a key ([§7](#_7-credential-rules)).

A host may register sources itself, for example from configuration on a remote machine. Those sources have no contributing clients, and their retention behaves as `host`.

### 4.2 Status

The status mirrors `McpServerState`: a lifecycle union discriminated by `kind`, with a `*Status` enum and `*State` variants.

```ts
// types/channels-root/state.ts

/**
 * Discriminant for the ModelSourceState union.
 *
 * @category Root State
 * @nonexhaustive
 */
export const enum ModelSourceStatus {
  /** The agent is reading and validating the definition. */
  Starting = 'starting',
  /** The source is usable, and its models are in the agent's catalog. */
  Ready = 'ready',
  /** The source needs a credential before it can be used. */
  AuthRequired = 'authRequired',
  /** The source failed, or the host declined it. */
  Error = 'error',
}

/**
 * Why a model source needs a credential.
 *
 * @category Root State
 * @nonexhaustive
 */
export const enum ModelSourceAuthRequiredReason {
  /** The host holds no credential yet. */
  Required = 'required',
  /** The credential's lifetime or lease lapsed. Renewing it is fine. */
  Expired = 'expired',
  /** The endpoint refused the credential. Clients don't send one with the same `accountId` again. */
  Rejected = 'rejected',
  /** A client revoked the credential. Clients don't send one again without a user's action. */
  Revoked = 'revoked',
}

/** @preserveUnknownMembers */
export interface ModelSourceStartingState {
  kind: ModelSourceStatus.Starting;
}

/** @preserveUnknownMembers */
export interface ModelSourceReadyState {
  kind: ModelSourceStatus.Ready;
}

/**
 * Why a model source needs a credential before it can be ready. Deliberately
 * carries no credential. The endpoint the credential is for is the
 * model source's `credentialResource`.
 *
 * @preserveUnknownMembers
 */
export interface ModelSourceAuthRequirement {
  /** Why a credential is needed. */
  reason: ModelSourceAuthRequiredReason;
  /** Human-readable hint the host writes, for example "The endpoint rejected the API key." */
  description?: string;
}

/** @preserveUnknownMembers */
export interface ModelSourceAuthRequiredState extends ModelSourceAuthRequirement {
  kind: ModelSourceStatus.AuthRequired;
}

/** @preserveUnknownMembers */
export interface ModelSourceErrorState {
  kind: ModelSourceStatus.Error;
  /** Error details the host writes. MUST NOT contain the credential. */
  error: ErrorInfo;
}

/** @category Root State */
export type ModelSourceState =
  | ModelSourceStartingState
  | ModelSourceReadyState
  | ModelSourceAuthRequiredState
  | ModelSourceErrorState;
```

The reasons are specific to model sources. The shared `AuthRequiredReason` folds rejection and revocation into `expired`, so a client that renews automatically could undo a user's revocation, or keep resending a key the endpoint refused.

```mermaid
stateDiagram-v2
    [*] --> starting : source registered

    starting --> authRequired : credential needed
    starting --> ready : models listed
    starting --> error : invalid definition, or declined by policy

    authRequired --> starting : authenticate accepted

    ready --> authRequired : credential expired, rejected, or revoked
    ready --> starting : credential rotated, models re-listed
    ready --> error : fatal failure

    error --> starting : definition changed
```

The host can remove a registration from any state (see [§6](#_6-lifecycle)).

The host reports status with its own narrow action, as it does for MCP servers with `session/mcpServerStateChanged`. It never reports status by dispatching the registration back.

```ts
// types/channels-root/actions.ts

/**
 * Updates a model source's host-reported fields together. A no-op when no
 * model source has `id`. Only the host dispatches it.
 */
export interface RootModelSourceStateChangedAction {
  type: ActionType.RootModelSourceStateChanged; // 'root/modelSourceStateChanged'
  id: string;
  state: ModelSourceState;
  credentialNonce: string;
  /** Replaces the source's `credentialResource`. Absent clears it. */
  credentialResource?: ProtectedResourceMetadata;
  /** Replaces the source's `credentialOrigins`. Absent clears it. */
  credentialOrigins?: URI[];
  /** Replaces the source's `accountId`. Absent clears it. */
  accountId?: string;
}
```

Because the reducer ignores an unknown `id`, a status report that arrives after a registration is removed can't bring it back. Because it changes only the host-reported fields, it can't overwrite a client's newer definition. The host also tags every agent operation on the registration, such as validation, model discovery, and inference, with its current `credentialNonce`, and discards any result whose nonce is no longer current ([§4.4](#_4-4-credential-delivery-through-authenticate)). A slow result from before an update, a removal and re-add under the same `id`, or a key change therefore can't mark the current source `ready`, even when the definition has changed back to the same value.

### 4.3 Registering, updating, and removing

```ts
// types/channels-root/actions.ts

/**
 * Adds a model source, or updates the one with the same `id`.
 *
 * @clientDispatchable
 */
export interface RootModelSourceSetAction {
  type: ActionType.RootModelSourceSet; // 'root/modelSourceSet'
  /** The model source, without host-reported fields. */
  modelSource: ModelSource;
  /**
   * How to reach the source, in `modelSource.format`: endpoint, wire
   * format, models, and so on. The host hands it to the agent. The reducer
   * doesn't store it. MUST NOT contain a credential.
   */
  definition: Record<string, unknown>;
}

/**
 * Removes a model source. A no-op when none matches.
 *
 * @clientDispatchable
 */
export interface RootModelSourceRemovedAction {
  type: ActionType.RootModelSourceRemoved; // 'root/modelSourceRemoved'
  id: string;
}
```

The reducers follow the keyed-collection convention, with one twist so that re-registering the same definition doesn't disturb a working source:

- **Add.** When no model source has the `id`, `Set` appends `modelSource`.
- **Re-register.** When one has, with the same `provider`, `format`, and `nonce`, `Set` keeps its host-reported fields (`state`, `credentialNonce`, `credentialResource`, `credentialOrigins`, and `accountId`) and takes `displayName`, `icons`, `retention`, and `_meta` from the action. The status, nonce, and credential are undisturbed.
- **Update.** When any of the three differs, `Set` replaces the source. Its host-reported fields are absent until the host reports again.
- **Remove.** `Removed` deletes the source by `id`, or returns the state unchanged.

Comparing three strings keeps every client's reducer in agreement without comparing definitions.

A client registers a source by dispatching `Set` with no host-reported fields. It dispatches `Set` when it starts or reconnects with the source configured, and when the user changes the source. Re-registering an unchanged source is how a second window, a reloaded window, or another device that has the same source configured becomes a contributing client. When clients disagree on `displayName`, `icons`, `retention`, or `_meta`, the last `Set` wins.

A client SHOULD derive `id` from a stable key in its own configuration, so every device and window that has the same source configured shares one model source. It SHOULD derive `nonce` from the definition, for example as a hash of it. A client SHOULD NOT update a source whose `nonce` differs from its own copy unless the user changed the source in its configuration, and SHOULD NOT add back a source another client removed except when it starts or reconnects. Otherwise, two clients with different configurations would replace each other's source indefinitely.

When the user removes the source from a client's configuration, the client dispatches `Removed`. Removal applies to every client. Clients that share a configuration lose the source from theirs too, and a client that still has it configured registers it again the next time it starts or reconnects.

The host rejects a client-dispatched `Set`, through `ActionEnvelope.rejectionReason`, when:

- the agent named by `provider` doesn't advertise `modelSourceRegistration`, or doesn't list `format`;
- `modelSource` includes any host-reported field;
- its `provider`, `format`, and `nonce` match the existing source's, but `definition` differs from the definition the host holds. A re-registration must not carry a different definition, because reducers keep the credential for it;
- `id` equals a `ModelSourceInfo.id` that the agent declares itself. The catalog entry the host publishes for this same source doesn't count, so a ready source can still be re-registered or updated;
- the host won't honor the requested `retention`. The client can register again with `contributingClient` retention;
- the source is one the host registered itself;
- the host restricts sources by principal, and the existing source belongs to another principal ([§4.7](#_4-7-discovering-support)).

A host MAY reject a client's `Removed` for a source it registered itself, or one that belongs to another principal.

The host tracks contributing clients itself, from `ActionEnvelope.origin`. An add or a re-registration adds the dispatching client. An update makes the dispatching client the only one, because the others registered a different definition. When the last contributing client leaves, retention decides what happens ([§6](#_6-lifecycle)).

When `Set` updates a source, because its `provider`, `format`, or `nonce` changed, the host drops its credential, issues a new `credentialNonce`, and the source goes back through `starting`. A changed definition must never receive a key that was supplied for a different one. A re-registration, or a change to `displayName`, `icons`, `retention`, or `_meta`, keeps the credential and the nonce.

### 4.4 Credential delivery through `authenticate`

A client delivers a source's credential with the existing `authenticate` command and a new `target` variant. The command stays on the root channel, and no session is involved.

```ts
// types/common/commands.ts

/** @nonexhaustive */
export const enum AuthenticateTargetKind {
  McpServer = 'mcpServer',
  ModelSource = 'modelSource',
}

/**
 * A registered model source.
 *
 * @category Commands
 * @stability 1.0
 */
export interface ModelSourceAuthenticateTarget {
  kind: AuthenticateTargetKind.ModelSource;
  /** The model source's `id`. */
  modelSourceId: string;
  /**
   * The model source's current `credentialNonce`, as published in root
   * state. The host rejects a stale one with `Conflict` (-32011).
   */
  credentialNonce: string;
}

export type AuthenticateTarget =
  | McpServerAuthenticateTarget
  | ModelSourceAuthenticateTarget;
```

```jsonc
// Client → Host
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "authenticate",
  "params": {
    "channel": "ahp-root://",
    "resource": "https://api.example.com/v1",
    "token": "<secret>",
    "accountId": "keychain-5c2a",
    "target": {
      "kind": "modelSource",
      "modelSourceId": "2f6c0e1a-model-source",
      "credentialNonce": "9b41d7"
    }
  }
}
```

The `token` is an opaque secret. The agent applies it as the definition specifies: an `Authorization: Bearer` header, an `x-api-key` or `api-key` header, and so on.

Clients MUST include a `modelSource` target when they deliver a registered source's credential. A token without a target can't be scoped to one registration (see [§7](#_7-credential-rules)), so it never satisfies a model source's challenge. The host rejects an untargeted `resource` that matches only model source challenges with `InvalidParams` (`-32602`). Untargeted tokens keep working for MCP servers and agent-level resources.

Clients SHOULD include the existing `accountId` parameter when they deliver a credential, and omit it when they revoke one. The host publishes it as the source's `accountId`, which lets a client that reloads, or one on another device, tell whether the host holds its current key. `accountId` is opaque and MUST NOT be derived from the secret. For an API key that has no account of its own, a client uses an ID that changes whenever the user replaces the key, such as one derived from where it stores the key and when the key last changed.

`credentialNonce` fences every credential change, and works as the source's generation. The host issues a new nonce whenever a source is added, including one registered again under a removed `id`, and whenever `Set` updates it, whether or not it held a credential. It also issues one whenever it installs or drops a credential: on delivery, rotation, expiry, rejection, and revocation. An `authenticate` built before any of those changes is stale, so:

- a key meant for an old definition never reaches a new one, even when the endpoint didn't change;
- a rotation that crosses a revocation can't undo the revocation;
- when two clients answer the same `authRequired`, the first wins, and the second gets `Conflict`, re-reads state, and finds the source ready.

The host tags every agent operation on the source with the current nonce and discards any result, success or failure, that carries an older one. A late failure can't drop a key that has since replaced it, and a late success can't mark an updated or re-added source `ready`, even after an edit that changes the definition back. Random values meet the rule that a nonce is never reused for the same `id`.

The credential fields stay in root state for as long as the source takes a credential, not only while it's `authRequired`. Any client, including one that connected after the source became ready, can build an `authenticate` request at any time: to rotate a short-lived token before it expires, or to revoke a key with an empty token.

**When a client delivers.** A client delivers a credential only in answer to the source's current state, reading it from its own secure storage or token provider each time. It MUST NOT cache a credential it delivered, or replay one, for example after a reconnect. It delivers one when:

- the state is `authRequired` with reason `required`;
- the reason is `expired`, with a renewed credential: a fresh token, or the same static key with a new lease;
- the reason is `rejected`, only a credential whose `accountId` differs from the source's;
- the state is `starting` or `ready`, and the source's `accountId` names a key this client has since replaced, for example one it delivered before the user changed it. A client whose key simply differs leaves the host's credential alone, so two devices with different working keys don't replace each other's in turn;
- a lease it set is about to expire.

After `revoked`, a client delivers a credential only when a user asks it to. Before it sends any secret, a client checks the source against its own copy ([§7](#_7-credential-rules)).

Like `McpServerAuthenticateTarget`, the target doesn't carry `@preserveUnknownMembers`: the client builds it for one request, so there are no unknown members to keep.

`credentialResource.resource` doesn't need to be an `https` URL, unlike other RFC 9728 resource identifiers. RFC 9728 requires `https` because an OAuth client fetches metadata from that URL. Here the client only echoes the value, so a local server such as `http://localhost:11434/v1` works. Where the host actually sends the credential is governed by its egress policy ([§7](#_7-credential-rules)).

When `target.kind` is `modelSource`, the host:

- MUST apply the credential only to that model source. It never applies it to other model sources, MCP servers, or agent-level resources, even when they share `resource`.
- MUST require `resource` to equal the source's current `credentialResource.resource`.
- MUST reject an unknown `modelSourceId` with `InvalidParams` (`-32602`).
- MUST reject a `credentialNonce` other than the one it most recently issued for that source with `Conflict` (`-32011`). The client re-reads root state and, if the source still needs a credential, sends it again with the current nonce.
- MUST publish the request's `accountId` as the source's `accountId` when it accepts a credential, and clear it when the request has none.
- MUST treat an empty `token` as revocation: it stops using the credential at once, drops it, and reports `authRequired` with `reason: revoked`.

Any client may deliver or revoke a model source's credential, as any client may answer an MCP server's challenge, unless the host restricts credentials by principal ([§4.7](#_4-7-discovering-support)). It then rejects a credential from another principal's client with `PermissionDenied` (`-32009`).

`expiresIn` keeps its meaning for short-lived tokens such as Microsoft Entra ID access tokens. With a static key, it's a lease: the host drops the key when the lease elapses and reports `expired`, and a client renews the lease by sending the key again. An API key without a lease omits it.

### 4.5 Models and selection

When a registered source is `ready`, the host adds it to the catalog of the agent named by `provider`, through `root/agentsChanged`:

- a `ModelSourceInfo` in `AgentInfo.modelSources`, with the source's `id` and `displayName`;
- its models in `AgentInfo.models`, each with `modelSourceId` set to the source's `id`.

`modelSourceId` alone doesn't mark a registered source: #543 also uses it to group an agent's own models. Registration is the signal: a source is registered when `RootState.modelSources` has an entry with that `id` whose `provider` is the agent.

**Built-in sources.** A source the agent provides itself, such as a first-party service that ships with the agent, stays an agent-declared `ModelSourceInfo` (#543). The host lists it and its models in `AgentInfo` directly, and its sign-in uses `AgentInfo.protectedResources` and an untargeted `authenticate`, as today. It isn't a registered source and needs nothing from this proposal. Clients register sources only for configuration the agent doesn't have. If a client ever had to supply a built-in service's configuration, for example because the agent can't reach the service on its own, it would register it like any other source: a source that takes OAuth tokens advertises `authorization_servers` in `credentialResource`, and its `id` can't collide with the agent's own sources ([§4.3](#_4-3-registering-updating-and-removing)).

The host adds a registered source's models when it first becomes `ready`, and keeps them listed through later `starting` and `authRequired` states, so a key rotation or expiry doesn't change the catalog or break a selection. It withdraws them when the source is removed, when its last contributing client leaves under `contributingClient` retention, when it enters `error`, or when an update mints new model IDs (see Reserved model IDs below). A turn that uses a listed model while the source has no usable credential ends with the `modelSourceUnavailable` error ([§6](#turns-on-an-unavailable-source)). The host MAY list the `ModelSourceInfo` in any state, since #543 allows a source with no models.

Each model follows #543's catalog rules:

- `id` MUST be unique within the agent's catalog. The host mints it and maps it to the endpoint's own model identifier, so two sources can serve the same upstream model without colliding.
- `provider` stays the agent provider.
- `vendor` MAY name the service that serves the model, for example `OpenRouter`.

**Reserved model IDs.** Drafts, pending messages, history, and automation definitions keep a selection after its source goes away, and a chat keeps them when it moves to another session. Once the host publishes a model `id` for a registered source, that `id` is bound to that source and its upstream model for as long as the host keeps state. That includes after the source is removed and across a host restart. The host MUST NOT resolve the `id` to anything else. It MAY publish the `id` again only when the same source (the same `id`) comes back offering the same upstream model. A model's upstream identity is the endpoint the agent sends its requests to plus that endpoint's model identifier. A change to `provider` or `format`, or a definition change that moves the endpoint, makes it a different upstream model, so the host mints new IDs, even when a different client made the change.

A host SHOULD derive each model's `id` deterministically from the source (its `id`, `provider`, and `format`), the endpoint, and the endpoint's model identifier, for example with a hash. The same model then gets the same `id` when its source is registered again or the host restarts, without a stored table, and a moved endpoint gets a new one. Random IDs would break saved selections whenever a source is registered again, unless the host persists a table of them.

**Selection** doesn't change: a client picks a model by `id`, with optional `config`, on every path a selection already uses. The host checks that the model is listed, that the chat is backed by the source's agent provider, and, when it restricts sources by principal, that the turn's client acts for the source's principal. It checks whenever it uses a selection, including when a client continues a turn with `chat/turnResume`. Otherwise it rejects the selection through the existing failure paths: `InvalidParams` for requests, and `rejectionReason` for dispatched actions.

**Sessions** need nothing new. Any session whose agent is the source's `provider` can use its models, whichever client started the turn. There is no per-session list of sources.

**Automations** may name a registered source's model when the source has `host` retention, or was registered by the host. The host SHOULD reject an automation create or update that names a model from a `contributingClient`-retained source, because the automation would outlive the source. If the source isn't `ready` when a run starts, the run fails through the existing automation run lifecycle, and the source's `authRequired` state tells the next client to connect what's needed.

### 4.6 Retention

The client that registers a source chooses what happens to it when the last contributing client leaves. The default is the narrower choice, so clients that don't set it behave like clients that only use their models while one of them is connected.

```ts
// types/channels-root/state.ts

/**
 * How long a registered model source lasts once its last contributing
 * client leaves.
 *
 * @category Root State
 * @nonexhaustive
 */
export const enum ModelSourceRetentionPolicy {
  /** Removed when the last contributing client leaves, once running turns finish. */
  ContributingClient = 'contributingClient',
  /** Kept until a client removes it, or host policy expires it. */
  Host = 'host',
}
```

The two values mirror how MCP servers already behave. A `contributingClient` source goes away with its clients, like a client-published plugin. A `host` source stays, like a host-declared server, so long-running sessions and automations keep working, with the key in memory, while the host runs. When the user removes the source from their configuration, their client removes it, whatever its retention, so `host` retention doesn't leave sources nobody wants.

The host rejects `host` retention when it won't honor it ([§4.3](#_4-3-registering-updating-and-removing)), and it MAY expire `host`-retained sources by its own policy.

### 4.7 Discovering support

A client needs to know whether an agent accepts registrations, in what format, how long the host tolerates a disconnect, and whether the registry is shared across principals. Unlike the per-agent markers #543 dropped, this capability carries information a client can't get any other way.

```ts
// types/channels-root/state.ts

export interface AgentCapabilities {
  // …existing…
  /** The agent serves models from registered model sources. */
  modelSourceRegistration?: ModelSourceRegistrationCapability;
}

/**
 * @category Root State
 * @stability 1.0
 * @preserveUnknownMembers
 */
export interface ModelSourceRegistrationCapability {
  /**
   * Definition formats the agent reads, most preferred first: recognized
   * values of `ModelSource.format`, or namespaced names for formats the
   * agent defines itself.
   */
  formats: string[];
  /**
   * How long, in milliseconds, the host keeps counting a disconnected
   * client as a contributing client before it treats the client as having
   * left.
   *
   * @integer
   * @minimum 0
   */
  gracePeriod?: number;
  /** Whether clients acting for different principals share the registry. Absent means `shared`. */
  principalPolicy?: ModelSourcePrincipalPolicy;
}

/**
 * @category Root State
 * @nonexhaustive
 */
export const enum ModelSourcePrincipalPolicy {
  /** Every connected client may change, supply credentials for, and select every model source. */
  Shared = 'shared',
  /**
   * The host verifies principals, and limits changes, credentials, and
   * selection of each model source to clients of the principal that
   * registered it.
   */
  Isolated = 'isolated',
}
```

A client that knows none of an agent's formats doesn't register with it. AHP recognizes a few format names ([§4.1](#_4-1-the-registry)) but doesn't define what a definition contains.

**Principals.** AHP doesn't verify which client is which, so by default every connected client is trusted equally, as with MCP servers. Where a host can verify principals, it MAY restrict changes, credentials, and use of a model source to clients of the principal that registered it, and advertises `isolated`. Root state still lists every model source to every client, and the action stream carries every definition, so neither is private. A host whose connections carry credentials scoped to one client, such as a relay that forwards each client's own sign-in, SHOULD NOT let one client's model source be used by another: it uses `isolated`, or doesn't advertise `modelSourceRegistration`.

### 4.8 Change table

What a follow-up implementation would touch:

| Symbol | File | Kind |
| --- | --- | --- |
| `RootState.modelSources`, `ModelSource` (including `nonce`, the recognized `format` values, and the host-reported `credentialNonce`, `credentialResource`, `credentialOrigins`, and `accountId`) | `channels-root/state.ts` | added |
| `ModelSourceStatus`, four `ModelSource*State` variants, `ModelSourceState`, `ModelSourceAuthRequirement`, `ModelSourceAuthRequiredReason` | `channels-root/state.ts` | added (lifecycle union) |
| `ModelSourceRetentionPolicy` | `channels-root/state.ts` | added |
| `AgentCapabilities.modelSourceRegistration`, `ModelSourceRegistrationCapability`, `ModelSourcePrincipalPolicy` | `channels-root/state.ts` | added (capability) |
| `root/modelSourceSet` (with `definition`, which the reducer doesn't store), `root/modelSourceRemoved` | `channels-root/actions.ts`, `common/actions.ts`, `version/registry.ts` | added (client-dispatchable, introduced in the development version) |
| `root/modelSourceStateChanged` | `channels-root/actions.ts`, `common/actions.ts`, `version/registry.ts` | added (host-only, introduced in the development version) |
| Root reducer | `channels-root/reducer.ts` | add, re-register, update, remove, and status change, with fixtures for every branch |
| Client reducers | `clients/{go,rust,kotlin,swift,dotnet}/` | apply the three root actions, so they pass the shared fixtures |
| `AuthenticateTargetKind.ModelSource`, `ModelSourceAuthenticateTarget` (with `modelSourceId` and `credentialNonce`), `AuthenticateTarget` | `common/commands.ts` | added, widened |
| `AuthenticateParams.target`, `resource`, and `accountId` docs | `common/commands.ts` | generalized beyond MCP servers, including opaque secrets that aren't Bearer tokens |
| `ErrorInfo.errorType` docs | `common/state.ts` | the well-known `modelSourceUnavailable` value |
| `ModelSourceInfo`, `SessionModelInfo.modelSourceId` docs | `channels-root/state.ts` | registered sources, provenance, and reserved IDs |
| Generator registration | `scripts/generate-{csharp,go,kotlin,rust,swift}.ts` | new enums, structs, and union variants |
| Root channel and authentication specs, naming dictionary | `docs/`, `.github/instructions/` | updated |

---

## 5. Flow

```mermaid
sequenceDiagram
    participant C as Contributing client
    participant H as Agent host
    participant A as Agent behind the host
    participant E as Model endpoint

    C->>H: initialize
    H-->>C: root snapshot (agent advertises modelSourceRegistration with formats and gracePeriod)

    C->>H: root/modelSourceSet (modelSource with nonce, definition)
    H->>A: read and validate the definition
    H-->>C: root/modelSourceStateChanged (authRequired, credentialNonce, credentialResource, credentialOrigins)

    C->>H: authenticate({ resource, token, accountId, target: { kind: 'modelSource', modelSourceId, credentialNonce } })
    H-->>C: {}
    A->>E: list models (credential attached)
    E-->>A: models
    H-->>C: root/modelSourceStateChanged (ready, new credentialNonce, accountId)
    H-->>C: root/agentsChanged (the source and its models join the agent catalog)

    C->>H: chat/turnStarted in any session on that agent (message.model: { id })
    A->>E: inference (credential attached)

    Note over C,H: Later, the last contributing client disconnects (host retention)
    Note over H,E: running sessions and automations keep using the source
```

1. The client reads the agent's `modelSourceRegistration` capability and picks a format it can write.
2. It dispatches `root/modelSourceSet` with the source, its `nonce`, and the definition. The host counts the client as a contributing client, the agent reads and validates the definition, and the host reports `starting` with `root/modelSourceStateChanged`.
3. If a credential is needed, the host reports `authRequired` with a `credentialNonce`, the `credentialResource` the key is for, and every origin it would send the key to. The client checks those against its own copy and calls `authenticate` with that `resource`, an `accountId` naming its key, and a `modelSource` target that echoes the nonce.
4. The agent lists models. The host reports `ready`, with a new nonce because a key was installed, and the `accountId` of the key it now holds. It adds the source and its models to the agent's catalog.
5. Another window or device that has the same source configured dispatches the same `Set`. Its `nonce` matches, so it becomes a contributing client without disturbing the status, nonce, or credential. It sees the `accountId` and doesn't send its key again.
6. Any client can select those models in any session on that agent, and so can automations if the source has `host` retention.
7. When the last contributing client leaves, the retention policy decides whether the source stays (see [§6](#_6-lifecycle)).

---

## 6. Lifecycle

### When a contributing client leaves

A contributing client leaves when its connection closes and it doesn't reconnect with the same `clientId` within the host's grace period, which the host advertises as `gracePeriod`. The host stops counting it. While other contributing clients remain, nothing else changes. When the last one leaves:

- **`contributingClient` retention (the default).** The host stops new work on the source and withdraws its models from the catalog: a new turn or a pending message that names one of its models fails. Turns already running on it SHOULD finish, and the host MAY bound how long it waits. Any client can still cancel such a turn with the existing cancellation actions. The host then removes the source with `root/modelSourceRemoved` and drops its credential.
- **`host` retention.** The source stays, with its credential in memory and no contributing clients, until a client removes it or host policy expires it. A restart drops its credential (see below). It keeps serving every client and automation. If its credential expires or is rejected, the source goes to `authRequired`, and work that needs it fails until a client answers.

A client that comes back with the same `clientId` within the grace period is still counted, and dispatches `Set` only for the sources it changed. A client that comes back with a new `clientId` and the same configuration re-registers with `Set`, which keeps the status, nonce, and credential.

### Removal and revocation stop work at once

When a client dispatches `Removed`, or revokes the credential, the host stops using the credential immediately. It ends every running turn that uses the source with the `modelSourceUnavailable` error (see below), rather than letting it finish. Removal removes the source. Revocation keeps it, in `authRequired` with `reason: revoked`.

### Selections after removal

A selection that names a removed source's model fails. The host MUST NOT run the work on a different model. The user picked a specific service with their own key, and quietly sending the prompt somewhere else would change where their data goes and who pays for it.

- Drafts, history, and automation definitions keep the `id`. Because the `id` stays reserved, it can't later resolve to a different source. Clients show such a selection as unavailable.
- A pending message that names a removed model fails when the host would consume it, through the existing chat lifecycle.

### Rotation, expiry, rejection, and revocation

- **Rotation.** A new `authenticate` with the current nonce replaces the credential, and the host issues a new nonce and publishes the new `accountId`. The host MAY pass through `starting` while the agent re-lists models, keeping the models listed and their IDs stable.
- **Expiry.** When a credential's lifetime or lease lapses, the host drops it, and the source goes to `authRequired` with `reason: expired` and a new nonce. A client may renew it: a fresh token, or the same static key with a new lease. Clients holding short-lived tokens or leases SHOULD renew before `expiresIn` elapses.
- **Rejection.** When the endpoint refuses a credential, the source goes to `authRequired` with `reason: rejected` and a new nonce, and `accountId` still names the refused key. No client sends a credential with that `accountId` again. A client whose key differs may send it, or ask the user for a new one.
- **Revocation.** An empty `token` drops the credential at once, and the source goes to `authRequired` with `reason: revoked` and a new nonce. No client delivers a credential again without a user's action, including other devices that have the key stored, and the new nonce rejects a delivery that was already in flight.

### Turns on an unavailable source

When a turn can't use its source, because the credential is missing, expired, rejected, or revoked, or because the source was removed, the host ends the turn with `chat/error`. The error part's `error.errorType` is `modelSourceUnavailable`, and `resumable` is `true`. A client tells why from the registered source of the turn's model: its `state`, or its absence. Once the source is ready again, a client can continue the same turn with `chat/turnResume`, and the host checks the turn's selection again first. The host never switches models. It doesn't hold the turn open: `SessionStatus.InputNeeded` comes from `inputNeeded` entries and blocked tool calls, and none of them covers a model source, so a held turn would look like it's still running.

### Host restart

Credentials are gone after a restart, because they were never persisted. `contributingClient`-retained sources are gone too, and their clients register them again when they reconnect. A host that persists its own state SHOULD keep `host`-retained sources and their definitions, which come back through `starting`, and reach `authRequired` with `reason: required` only if they need a credential. Model IDs derived deterministically ([§4.5](#_4-5-models-and-selection)) come back unchanged without a stored table.

---

## 7. Credential rules

1. **Never in state, actions, or notifications.** All of these are broadcast to subscribers. That includes the definition on `root/modelSourceSet`, `nonce`, `_meta`, `ErrorInfo`, `credentialResource`, `credentialOrigins`, `accountId`, and `ModelSourceAuthRequirement`. A secret travels only in `authenticate`, and neither `nonce` nor `accountId` is derived from it. The host writes `description` and `ErrorInfo` itself, and SHOULD NOT copy upstream response bodies or headers into them: an endpoint's error text can echo part of a key, and every client can read root state.
2. **Memory only.** The host holds it only in memory. It is never persisted and never placed in environment variables, command lines, logs, telemetry, or error messages. The host SHOULD also redact it from tool output before storing that output or sending it to the model. That's best effort: rule 4 keeps the host from handing the secret to tools, but the same secret can also live where the agent can read it, such as a `.env` file or the user's shell environment, and a host can only redact values it knows.
3. **Scoped to one model source and one `credentialNonce`.** It is never shared with other model sources, MCP servers, or the agent's own protected resources, and a key sent for an earlier definition never reaches a later one.
4. **Sent only where the host says.** The host attaches it only to that source's requests, as its definition specifies, and only to origins in `credentialOrigins`. It is never sent to another origin, including on redirect, and never exposed to the model, tools, terminals, or hooks.
5. **Dropped** when the source is removed, when `Set` updates it, when it's revoked, when its lease lapses, and when the host restarts.
6. **Re-requested through state.** The host asks again by setting `authRequired`. State survives reconnects; `auth/required` notifications are not replayed.
7. **Delivered only in answer to state.** Clients MUST NOT cache a model source credential they delivered, or replay one, for example on reconnect. They deliver one only in answer to the source's current state ([§4.4](#_4-4-credential-delivery-through-authenticate)), reading it from their own secure storage or token provider. Clients SHOULD NOT prompt the user for a key they don't have.
8. **Checked by the client.** A client MUST NOT send a stored secret unless the source's `provider`, `format`, and `nonce` match its own copy, and every origin in `credentialOrigins` is one its own copy of the definition sends the key to. The host derives `credentialOrigins` from the definition it actually holds, so the origin check doesn't depend on another client choosing `nonce` honestly. `credentialNonce` stops a delayed reply, but not a device whose copy is out of date or a source another client has changed.
9. **Reached from the host.** Endpoints in a definition, including loopback and private addresses, are resolved and reached from the host machine: `localhost` in a source registered with a remote host is that host, not the client's machine. Hosts SHOULD apply an egress policy to registered endpoints: deny link-local and cloud metadata addresses, and require `https` for any credentialed endpoint that isn't a loopback address, unless the host has opted in to plain `http`.

---

## 8. Out of scope for AHP

- Defining what a definition contains, even for the recognized `format` values. `definition` stays opaque and belongs to the agent.
- Endpoint validation beyond rule 9's egress policy, model discovery, capability derivation, and wire protocols. These belong to the agent.
- Client-side credential storage, and keys the host stores itself. That is host-owned authentication ([#404](https://github.com/microsoft/agent-host-protocol/pull/404)); see the open questions.
- How a host verifies principals.
- Restricting a registration to particular sessions.
- Usage, billing, or per-call provenance.

Hosts apply policy appropriate to the source, for example by declining registrations from clients they don't trust, or narrowing which formats they accept.

---

## 9. Open questions

- **Holding a turn for a credential.** A turn whose credential fails ends with the resumable `modelSourceUnavailable` error (see [§6](#turns-on-an-unavailable-source)). Should a host instead be able to hold the turn visibly, with a `modelSourceAuthentication` input request in `SessionState.inputNeeded`? It would carry a `ModelSourceAuthRequirement`, the way MCP's tool authentication request carries an `McpAuthRequirement`.
- **Definitions for the recognized formats.** AHP recognizes a few `format` names but doesn't define what their definitions contain, so two agents that both read `openaiCompatible` may still expect different definitions. Should AHP define a small shared definition for each recognized format, for example in [Open Plugins](https://open-plugins.com/), so one definition works with any agent?
- **Keys that survive a restart, and host-owned authentication.** `host` retention keeps a key only in memory. Keeping it across restarts needs the host to store it, which #404 doesn't cover yet: its flows are OAuth only, and its account consumers are agents and MCP servers. Once host-owned authentication lands, it's likely to become the canonical place for model source credentials, and the `modelSource` target and the `accountId` published here would follow it. An API key also has no authority-qualified account for [#459](https://github.com/microsoft/agent-host-protocol/pull/459)'s revocation.
- **Hiding sources from other principals.** `isolated` lets a host restrict who changes, supplies credentials for, and uses a model source, but root state still lists every source, and the action stream carries every definition, to every client. Should a host be able to hide sources from clients of other principals? That would be a new pattern for root state.
- **Duplicates.** Clients that derive different `id`s for the same service get two sources. Should a host merge them?

---

## 10. Compatibility

- **Additive.** `RootState.modelSources` and the new capability are optional fields. `AuthenticateTargetKind` is `@nonexhaustive`, and generated clients preserve unknown `AuthenticateTarget` variants.
- **New actions follow the usual rules.** The three root actions are introduced in the development protocol version, like any new action, so hosts don't send them to clients that negotiated an older version. No extra version bump is needed.
- **Ignorable.** A client that doesn't know the registry still sees registered sources' models in `AgentInfo.models` and can select them by `id`, like any other model.
- **Capability-gated.** Clients register only with agents that advertise `modelSourceRegistration`.
- **Depends on #543.** Registered sources join #543's `AgentInfo.modelSources` catalog, so this lands after #543, or together with it.

---

## 11. Alternatives considered

- **Session-scoped plugin customizations.** The previous revision of this proposal: a client publishes a model source inside a plugin in its `SessionActiveClient` entry, and the host expands it into a child customization of that session, following the MCP server lifecycle. It was replaced for five reasons:
  - Automations can't use a source that exists only inside one session.
  - Long-running and headless sessions lose the source when the client's session membership ends, apart from in-memory retention.
  - New-session pickers can't show the models until a session exists and the source has loaded.
  - Every session repeats the same definition and the same key.
  - Per-session enablement and per-session model sets, which the customization lifecycle provides, don't match how BYOK is configured.
- **A `SessionActiveClient.modelSources` field with host-published copies.** The first draft of #619. It makes the client the source of truth for model metadata it can't validate, and has the same session-scope problems.
- **Host configuration.** Model sources could be values in `RootConfigState`, changed with `root/configChanged`. Config has no per-entry provenance, status, or credential target, so each would need adding anyway.
- **Per-client sharing and ownership.** An earlier draft let the contributing client limit who could use a source and who could change it, so one client couldn't spend another's key. AHP can't verify which client is which, any connected client can already run tools as the host's user, and MCP servers have no such limits. The rules added complexity without protection, so they were dropped. A host that can verify principals advertises `isolated` instead ([§4.7](#_4-7-discovering-support)).
- **Client IDs in state.** Earlier drafts recorded the client that last wrote a source, and then a list of contributing clients with a per-client withdrawal action. A source can outlive the connections that registered it, so those IDs mean little to other clients. The host learns who registered a source from `ActionEnvelope.origin` and tracks contributing clients itself, which is all `contributingClient` retention needs.
- **Definitions in state.** An earlier draft kept each definition in root state so clients could compare it with their own, which forced every client's reducer to compare JSON values the same way. Only the host and its agent need the definition after it's submitted. A `nonce` lets clients compare versions, as `ClientPluginCustomization.nonce` does, and the host-reported `credentialOrigins` lets them check where a key would go.
- **Hiding registrations per connection.** Root state is one shared, replayable state, and this proposal trusts every connected client, so it doesn't project different registries to different clients.
- **Reporting status by rewriting the registration.** An earlier draft had the host dispatch the whole registration back with `state` added. A late status write could then bring back a removed registration or overwrite a newer definition, which took several extra rules to prevent. A narrow status action, as MCP uses, prevents both by construction.
- **Host-to-client credential fetch per request.** The host would ask the contributing client for the key on each request, so it never rests on the host. AHP has host-to-client requests, such as the `resource*` family, but a fetch per model request adds a client round trip to every request and can't serve headless work once the client leaves.

---

## 12. Doctrine design tests

Applying the [doctrine's design tests](/guide/doctrine#design-tests):

- **Can a minimal client ignore this and still render a coherent session?** Yes. It sees ordinary models in the agent's catalog, and turns use whichever model it picks.
- **Is the durable, user-visible result represented in state?** Yes. Registrations, their status, and their models live in root state. The credential is deliberately not state, because it is a secret.
- **Does the host remain the authority?** Yes. The host validates registrations, decides status and policy, mints model IDs, and checks every selection. Clients send a definition and a secret, never a catalog.
- **Does this expose an agent implementation detail?** Only the format name. The definition's content, discovery, wire protocol, model ID mapping, and how a key is attached stay with the agent.
- **Does it fit an existing channel?** Yes. The registry is root state, and the credential uses root `authenticate`. No new channel.
- **Can clients discover support through capabilities or optional state?** Yes, through the agent's `modelSourceRegistration` capability and its formats.
- **Is provider-specific metadata an enhancement rather than a requirement?** Yes. `_meta` on registrations and models stays optional.

It also respects the doctrine's anti-goal of "a required model provider, model router, or credential flow": the whole surface is optional, and a host may decline any registration.
