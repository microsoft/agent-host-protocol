# Automation Run Channel

The automation-run channel represents one task-level execution of an
automation. A local run commonly links one session; hosted authorities may link
multiple attempts or workers.

## URI

```text
ahp-automation-run:/<id>
```

## State

`AutomationRunState` contains immutable automation/trigger provenance,
discriminated lifecycle, an ordered session catalogue, optional primary
session, artifacts, and allowed operations.

Linked `ahp-session:` and `ahp-chat:` channels remain authoritative for
conversation, tool-call, input-request, changeset, and per-session state.

## Lifecycle

```text
pending -> running -> completed
                   -> blocked -> running
                   -> failed
                   -> cancelled
```

`blocked` summarizes a user input, confirmation, authentication, or
client-execution dependency. Detailed response routing remains in linked
session state.

## Actions

- `automationRun/lifecycleChanged`
- `automationRun/sessionSet`
- `automationRun/sessionRemoved`
- `automationRun/primarySessionChanged`
- `automationRun/artifactSet`
- `automationRun/artifactRemoved`
- `automationRun/cancelRequested`

Only `cancelRequested` is client-dispatchable. It is a side-effect request; the
durable result arrives through `lifecycleChanged`.

## Reconciliation

The host persists a run before external side effects and records each session
URI before sending its first message. Retrying `runAutomation` with the same
request ID returns the existing run URI.

