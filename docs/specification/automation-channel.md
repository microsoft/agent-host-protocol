# Automation Channel

The automation channel represents a durable definition that launches fresh
agent sessions manually or from host-owned triggers.

## URI

```text
ahp-automation:/<id>
```

The client chooses the URI during `createAutomation`. The host owns persistence,
revision ordering, trigger evaluation, run claims, and run history.

## State

`AutomationState` contains the complete definition, monotonic revision,
host-computed next scheduled run, a newest-first window of
`AutomationRunSummary` entries, and allowed operations.

An empty trigger list means manual-only. Schedule triggers are typed; event
triggers use a host-defined type plus schema-defined configuration returned by
`listAutomationTriggerDefinitions`.

## Catalogue

Clients fetch summaries through `listAutomations` on `ahp-root://`. Root
subscribers receive:

- `root/automationAdded`
- `root/automationRemoved`
- `root/automationSummaryChanged`

Catalogue notifications are not replayed. Clients re-fetch after reconnect.

## Commands

- `createAutomation` creates a client-chosen URI.
- `updateAutomation` applies a patch guarded by `expectedRevision`.
- `disposeAutomation` removes a definition with no active run.
- `runAutomation` idempotently creates a run by `requestId`.
- `fetchAutomationRuns` loads older summaries through
  `automation/runsLoaded`.
- `listAutomationTriggerDefinitions` returns host trigger schemas.
- `previewAutomationSchedule` returns host-canonical future occurrences.

## Actions

- `automation/definitionChanged`
- `automation/runSummarySet`
- `automation/runSummaryRemoved`
- `automation/runsLoaded`

The host sequences all actions. Automation actions are server-originated.

## Scheduling

Scheduling belongs to the host. Calendar schedules persist an IANA time zone.
`enabled` controls automatic triggers only; manual runs remain available when
the operation is advertised. A host atomically associates a scheduled
occurrence with at most one run.

## Security

Definitions contain no credentials or durable permission grants. The host
authorizes every operation and revalidates session configuration at execution
time.

