# Automation Catalogue Channel

The automation catalogue channel synchronizes every durable automation
definition visible to a client. Automations launch fresh agent sessions manually
or from host-owned triggers.

## URI

```text
ahp-automations://
```

Each `AutomationState.resource` is a stable `ahp-automation:/<id>` identifier
chosen during `createAutomation`. Those identifiers target commands and
relationships but are not independently subscribable channels. The host owns
persistence, revision ordering, trigger evaluation, run claims, and run history.

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

All mutation commands use `channel: "ahp-automations://"`. Creation carries the
new `resource`; commands for existing entries carry that identifier as
`automation`.

- `createAutomation` creates a client-chosen URI.
- `updateAutomation` applies a patch guarded by `expectedRevision`.
- `disposeAutomation` removes a definition with no active run.
- `runAutomation` idempotently creates a run by `requestId`.
- `fetchAutomationRuns` loads older summaries and publishes the updated full
  entry through `automation/set`.
- `listAutomationTriggerDefinitions` returns host trigger schemas.
- `previewAutomationSchedule` returns host-canonical future occurrences.

## Actions

- `automation/set` adds or replaces one full `AutomationState` by `resource`.
- `automation/removed` removes one entry by `resource`.

The host sequences all actions on `ahp-automations://`. Automation catalogue
actions are server-originated.

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
