# Automations

Automations let several AHP clients share durable agent-session workflows
without each client running its own scheduler.

## Mental model

- An **automation** is a saved session template, initial user message, and
  trigger collection.
- A **run** is one task-level execution.
- A **session** is one attempt or worker belonging to that run.

```text
automation
  -> run summary
     -> automation-run channel
        -> one or more session channels
```

The host is the single writable authority for definitions, trigger claims,
runs, and session links. Clients own presentation and confirmation UX.

## Manual and automatic triggers

An empty trigger collection is manual-only. Schedule triggers are portable
hourly, daily, weekly, or five-field cron schedules. Event triggers are
host-defined and retain unknown schema fields during edits.

## Multiple clients

Definitions use monotonic revisions. Manual run requests use durable
idempotency keys. Clients re-fetch catalogues after reconnect and never execute
a local fallback copy after an uncertain host response.

## Availability

`AutomationCapabilities.execution.lifetime` distinguishes a host-lifetime
scheduler from a managed service. This describes availability; it never moves
scheduling authority into clients.

## Migration

Move one definition to one authority. Import the host copy disabled, remove the
legacy copy from scheduler-visible storage, then enable the host copy. Never
dual-schedule or deduplicate by content.

