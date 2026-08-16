# Automation Catalogue Channel

The automation catalogue channel synchronizes every durable automation
definition visible to a client. Automations launch fresh agent sessions manually
or from host-owned triggers.

## URI

```text
ahp-automations://
```

Each `AutomationState.resource` is a stable `ahp-automation:/<id>` identifier
chosen by `automation/createRequested`. Those identifiers target commands,
actions, and relationships but are not independently subscribable channels. The
host owns persistence, revision ordering, trigger evaluation, run claims, and
run history.

## State

`AutomationCatalogState.automations` contains the full `AutomationState` for
every visible automation, keyed by `resource`. Each entry contains the complete
definition, monotonic revision, host-computed next scheduled run, a newest-first
window of `AutomationRunSummary` entries, and allowed operations.

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
`AutomationCatalogState` snapshot. Later catalogue changes use normal ordered
actions and therefore participate in reconnect replay. If replay is unavailable,
the host returns a fresh catalogue snapshot.

## Commands

Run and run-history commands use `channel: "ahp-automations://"` and carry the
target entry's identifier as `automation`.

- `runAutomation` idempotently creates a run by `requestId`.
- `fetchAutomationRuns` loads older summaries and publishes the updated full
  entry through `automation/set`.
- `listAutomationTriggerDefinitions` returns host trigger schemas.
- `previewAutomationSchedule` returns host-canonical future occurrences.

## Actions

- `automation/createRequested` asks the host to persist a complete definition
  at a client-chosen `resource` (client-dispatchable).
- `automation/updateRequested` asks the host to apply a definition patch
  guarded by `expectedRevision` (client-dispatchable).
- `automation/set` adds or replaces one full `AutomationState` by `resource`
  (server-only).
- `automation/removed` permanently deletes one entry by `resource`
  (client-dispatchable or server-originated).

The host sequences all actions on `ahp-automations://`.

Create and update requests are side-effect-only: their reducers leave catalogue
state unchanged. The host validates and persists the requested mutation, then
publishes the resulting full `AutomationState` through `automation/set`. A
rejected request carries `ActionEnvelope.rejectionReason` and produces no
catalogue mutation.

Before dispatching `automation/removed`, a client SHOULD verify that the target
advertises `AutomationOperation.Dispose`. The host MUST revalidate the operation
and the client's authorization. If disposal is no longer allowed, the host
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

## Security

Definitions contain no credentials or durable permission grants. The host
authorizes every operation and revalidates session configuration at execution
time.
