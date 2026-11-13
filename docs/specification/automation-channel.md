# Automation Catalogue Channel

<StabilityIndex level="1.0" />

The automation catalogue channel synchronizes every durable automation
definition visible to a client. Automations launch fresh agent sessions manually
or from host-owned triggers. With negotiated support, one-time scheduled chats can instead deliver into an existing conversation.

## URI

```text
ahp-automations://
```

Each `AutomationEntry.resource` is a stable `ahp-automation:/<id>` identifier
chosen by `automation/createRequested`. Those identifiers target commands,
actions, and relationships but are not independently subscribable channels. The
host owns persistence, action ordering, trigger evaluation, run claims, and run
history.

## State

`AutomationState.entries` contains the full `AutomationEntry` for
every visible automation, keyed by `resource`. Each entry contains the complete
definition, host-computed next scheduled run, a newest-first window of
`AutomationRunSummary` entries, and allowed operations.

An empty trigger list means manual-only. Schedule triggers use the portable
five-field AHP cron format plus an IANA time zone. Event triggers use a
host-defined type plus schema-defined configuration returned by
`listAutomationTriggerDefinitions`.

The session template can select a provider, model, and custom agent, and carries
the same schema-defined configuration values used for ordinary session
creation. Hosts revalidate all selections when a run starts.

## Subscription and reconnect

When `InitializeResult.automations` is present, clients subscribe to
`ahp-automations://`. The subscription returns the complete
`AutomationState` snapshot. Later catalogue changes use normal ordered
actions and therefore participate in reconnect replay. If replay is unavailable,
the host returns a fresh catalogue snapshot.

### One-time catalogue opt-in

A client MUST declare `initialize.capabilities.automations.oneTime: {}` before receiving one-time entries. Host support alone is not acknowledgement: `AutomationTriggerKind` is exhaustive and older decoders reject `oneTime`.

For a connection without this declaration, the host MUST:

- Omit `automations.oneTime` and `automations.existingConversation` from `InitializeResult`.
- Exclude entries containing a one-time trigger from every catalogue snapshot, including initialize, subscribe, reconnect fallback, and windowed-delivery snapshots.
- Project a one-time `automation/set` into `automation/removed` for the same resource. This removes a formerly visible entry if its trigger changes to one-time; removing an unseen resource is a no-op.
- Suppress create/update request echoes containing one-time triggers, including rejected echoes.
- Reject requests to create or operate on one-time definitions before mutation, without echoing an incompatible payload.

The same projection MUST apply to live actions and replay, before encoding direct notifications or flow-control frames. Preserve the original action envelope's sequencing and correlation metadata; omitted actions do not renumber the stream.

Clients MUST repeat the opt-in in `reconnect.capabilities.automations.oneTime`; it is never inherited from `clientId`. The host MUST retain the previous connection's opt-in. If it differs, or the host cannot establish the previous view, the host MUST reject reconnect with `InvalidParams` before sending catalogue data and require a fresh `initialize`. This renegotiates host capabilities and returns a snapshot for the new view instead of replaying the old one.

Opted-in connections receive the full authorized catalogue. Hosts MUST NOT mutate the shared catalogue to accommodate a legacy reader. The TypeScript helpers `automationCapabilitiesForClient`, `automationStateForClient`, and `automationActionForClient` implement the outgoing projections; `canResumeAutomationCatalogue` checks for a view change. Hosts still enforce incoming request checks and retain connection negotiation state.

## Commands

Run and run-history commands use `channel: "ahp-automations://"` and carry the
target entry's identifier as `automation`.

- `runAutomation` idempotently creates a run by `requestId` and returns its
  `resource`.
- `fetchAutomationRuns` loads older summaries and publishes the updated full
  entry through `automation/set`.
- `listAutomationTriggerDefinitions` returns host trigger schemas.

## Actions

- `automation/createRequested` asks the host to persist a complete definition
  at a client-chosen `resource` (client-dispatchable).
- `automation/updateRequested` asks the host to apply a definition patch
  in action order (client-dispatchable).
- `automation/set` adds or replaces one full `AutomationEntry` by `resource`
  (server-only).
- `automation/removed` permanently deletes one entry by `resource`
  (client-dispatchable or server-originated).

The host sequences all actions on `ahp-automations://`.

Create and update requests are side-effect-only: their reducers leave catalogue
state unchanged. The host validates and persists the requested mutation, then
publishes the resulting full `AutomationEntry` through `automation/set`. A
rejected request carries `ActionEnvelope.rejectionReason` and produces no
catalogue mutation.

The host applies accepted update patches to its current authoritative
definition in action order. Omitted fields remain unchanged, so disjoint
patches compose. If accepted actions replace the same field, the later action
in server order wins. The host MUST reject an action that is unauthorized, is
not permitted by the current operations, or is invalid for the current
definition.

Hosts advertising `automations.oneTime` MUST support the optional `expectedModifiedAt` on `automation/updateRequested`: it compares exactly with the current `AutomationEntry.modifiedAt`, and a mismatch rejects the entire action without mutation. The comparison and update MUST be atomic, and each accepted definition update MUST advance `modifiedAt` to prevent stale guards matching a different revision. Omitted guards preserve the ordered-patch semantics above.

Before dispatching `automation/removed`, a client SHOULD verify that the target
advertises `AutomationOperation.Remove`. The host MUST revalidate the operation
and the client's authorization. If removal is no longer allowed, the host
rejects the action with `ActionEnvelope.rejectionReason`; the originating client
restores its optimistic removal. An accepted action permanently deletes the
automation before it is echoed to catalogue subscribers. Removing an unknown
resource is an idempotent no-op.

## Scheduling

Scheduling belongs to the host. A schedule contains exactly five cron fields
(`minute hour day-of-month month day-of-week`) and an IANA time zone. The
portable grammar supports wildcards, values, inclusive ranges,
comma-separated lists, and steps over wildcards or ranges. It does not support
seconds, years, macros, or Quartz extensions. See the
[Automations guide](/guide/automations#scheduled-triggers) for the complete
grammar and day-field semantics.

`enabled` controls automatic triggers only; manual runs remain available when
the operation is advertised. A host atomically associates a scheduled
occurrence with at most one run.

### One-time execution

`automations.oneTime` enables `AutomationOneTimeTrigger` (`kind: 'oneTime'`, `runAt` an absolute ISO 8601 UTC timestamp ending in `Z`). It MUST be the definition's only trigger. The host MUST atomically persist `AutomationEntry.oneTimeRun` before dispatch; manual and automatic execution share that admission. Later manual requests MUST return the same run URI regardless of request id. Once admitted, definition updates MUST be rejected. Failure, cancellation, interruption, or history pruning MUST NOT rearm the occurrence. Missed instants catch up once when the host is available.

Unchanged one-time create retries at the same resource MUST return its current authoritative entry without admitting another occurrence, including after the due time. Conflicting definitions MUST be rejected. Hosts MUST durably prevent reuse of removed one-time resource identities so replay after restart cannot recreate the request.

A `purpose: 'scheduledChat'` definition requires this trigger and enabled creation. Disabling it before admission permanently cancels it: subsequent updates and manual runs MUST be rejected. The purpose is copied into the admitted run and any newly created session's automation origin, independently of catalogue retention.

`oneTimeDispatchedAt` records accepted dispatch, not run completion. `oneTimeDispatchRejectedAt` positively confirms failure before submission was attempted. Both require `oneTimeRun`, survive run-history pruning, and MUST NOT coexist for one occurrence. Missing dispatch confirmation, even with a failed run, MUST NOT be interpreted as safe to resend after an uncertain handoff. Only a positive rejection receipt permits explicit recovery of a consumed request as a sendable draft.

Hosts MUST capture supported message attachments durably at acceptance and reject unsupported content before accepting a definition or update. Clients MUST NOT author this extension without the corresponding capability. The new trigger extends an exhaustive union, so deployments MUST account for older catalogue decoders that reject it. See [One-time triggers and scheduled chats](/guide/automations#one-time-triggers-and-scheduled-chats).

### Existing-conversation targets

`automations.existingConversation` requires `automations.oneTime` and enables an immutable `AutomationDefinition.conversation: { session, chat }` on scheduled chats. These MUST be exact advertised URIs, including non-default chats. Hosts MUST revalidate authorization and membership and MUST NOT create a replacement target, apply the session template or message model/agent, change session provenance, or acquire session ownership. Delivery MUST join the ordinary queue without steering or cancelling another turn. Completion means accepted queue handoff rather than turn completion; cancelling the delivery run MUST NOT cancel unrelated work in the existing conversation.

The delivery run MUST have empty `sessions` and no `primarySession`; the existing target is not an owned run session.

## Security

Definitions contain no credentials or durable permission grants. The host
authorizes every operation and revalidates session configuration at execution
time.
