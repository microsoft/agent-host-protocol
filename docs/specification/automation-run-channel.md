# Automation Run Channel

<StabilityIndex level="1.0" />

The automation-run channel represents one task-level execution of an
automation. A local run commonly links one session; hosted authorities may link
multiple attempts or workers.

## URI

```text
ahp-automation-run:/<id>
```

## State

`AutomationRunState` contains an immutable `origin` describing manual or
trigger provenance, a discriminated lifecycle, an ordered session catalogue,
and an optional primary session.

For one-time scheduled chats, optional `purpose: 'scheduledChat'` is copied immutably from the admitted definition and survives catalogue removal. Newly created sessions copy it into their automation origin; existing-conversation targets retain their original provenance.

Linked `ahp-session:` and `ahp-chat:` channels remain authoritative for
conversation, tool-call, input-request, changeset, and per-session state.

## Lifecycle

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> running
  pending --> failed
  pending --> cancelled
  running --> completed
  running --> failed
  running --> cancelled
```

The run remains `running` while linked sessions await interaction. Their
`SessionSummary.status` and `SessionState.inputNeeded` fields remain
authoritative for attention state and response routing.

A scheduled chat delivered to an existing conversation is a delivery-only exception: its run completes when the ordinary message queue accepts the request, without waiting for the turn to finish or taking ownership of the existing session. Such a run has empty `sessions` and no `primarySession`. Cancellation does not interrupt unrelated work or undo an accepted handoff.

When `InitializeResult.automations.runCancellation` is present, clients may
dispatch `automationRun/cancelRequested` for `pending` or `running` runs.
Terminal runs cannot be cancelled, and the host revalidates lifecycle when it
receives the request.

## Actions

- `automationRun/lifecycleChanged`
- `automationRun/sessionSet`
- `automationRun/sessionRemoved`
- `automationRun/primarySessionChanged`
- `automationRun/cancelRequested`

Only `cancelRequested` is client-dispatchable. It is a side-effect request; the
durable result arrives through `lifecycleChanged`.

## Reconciliation

The host persists a run before external side effects and records each session
URI before sending its first message. Retrying `runAutomation` with the same
request ID returns the existing run URI.
