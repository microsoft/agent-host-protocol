# Source Attribution

An agent may use web pages, files, uploaded documents, or other material to
support an answer. AHP lets a host describe those sources and the text they
support without requiring a particular agent, model, search tool, or UI.

Attribution is optional. A client can show inline citations, a source list, or
neither. The answer remains ordinary Markdown or reasoning text and must make
sense on its own.

## How it works

1. The host creates a markdown or reasoning part with `chat/responsePart`.
2. It streams text using `chat/delta` or `chat/reasoning`.
3. After the target's last text delta, it appends an `attribution` part using
   `chat/responsePart`.
4. It ends the turn as usual.

The attribution part identifies the earlier text part with `targetPartId`. It
contains a source list and ranges linking the generated text to those sources.
An empty `spans` list attributes the target as a whole without claiming a more
precise mapping.

Here is attribution for a markdown part named `answer-1` whose complete content
is `The library opened in 1984.`. The range selects `1984`:

```json
{
  "type": "chat/responsePart",
  "turnId": "turn-1",
  "part": {
    "kind": "attribution",
    "id": "attribution-1",
    "targetPartId": "answer-1",
    "sources": [
      {
        "id": "history",
        "title": "Library history",
        "uri": "https://example.org/library/history",
        "contentType": "text/html",
        "excerpt": "The library opened its doors in 1984."
      }
    ],
    "spans": [
      {
        "range": {
          "start": { "line": 0, "character": 22 },
          "end": { "line": 0, "character": 26 }
        },
        "sourceIds": ["history"]
      }
    ]
  }
}
```

This action travels on the owning `ahp-chat:` channel, like other response
parts. No new command or streaming action is required.

## Identifiers and lifetime

- The attribution `id` MUST be non-empty and unique among the turn's response
  part identifiers.
- `targetPartId` MUST identify an earlier markdown or reasoning part in the
  **same turn**, not a message ID or a part from another chat.
- A host MUST send at most one attribution part for each target. It MUST NOT
  append more text to that target or replace the attribution afterward. If
  more output is needed, including after a turn resumes, use new part IDs.
- `sources` MUST contain at least one source. Source IDs MUST be non-empty and
  distinct within this attribution part; they are not global resource IDs.
- Each span MUST name at least one source, without duplicate IDs, and every ID
  MUST resolve within this part's `sources`.
- Spans MAY overlap, and a span MAY refer to several sources. A source may
  support several spans. Sources without a span are attributed to the target
  as a whole, not to an inferred sentence.

The host MUST normalize and validate attribution before sending it. It should
omit unavailable attribution rather than guess a target, source, or range.

Attribution remains in the turn's `responseParts` after completion,
cancellation, or error. Snapshots, reconnection, and history loading carry it
along with its target. A host copying turns into a fork MUST copy each retained
target and its attribution together; if it remaps part IDs, it must also remap
`targetPartId`. Truncating a turn removes both. Merely rendering a citation
does not start an agent turn or change the answer.

## Text ranges

`AttributionSpan.range` addresses the target's **raw, final `content` string**,
not rendered Markdown, the combined response, or a source excerpt.

- Lines and character positions are zero-based.
- Character positions count **UTF-16 code units** within a line, not bytes,
  Unicode code points, or displayed characters.
- The start is inclusive and the end is exclusive. Ranges MUST be non-empty.
- CRLF, LF, and lone CR each count as one line break. Line terminators are not
  part of a line's character positions.
- Positions MUST lie within the text and MUST NOT split a UTF-16 surrogate
  pair. Do not normalize whitespace or Markdown before applying ranges.

For example, in the JSON string `"\ud83d\ude00 **Fact**\r\nMore"`, `Fact` begins
at line `0`, character `5`, and ends at character `9`. `More` begins at line
`1`, character `0`. The emoji occupies two UTF-16 code units, and the Markdown
markers count even if a client does not display them.

Clients MAY translate these ranges into their own rendered-text coordinates.
They MUST NOT guess a range when the target or positions cannot be resolved.
They can still show a source list without inline highlights.

## Sources and locations

[`AttributionSource`](/reference/chat#attributionsource) can carry a title, URI,
MIME type, short excerpt, and location. None requires a public website or a
local filesystem. A host SHOULD supply a readable title when no URI is
available, and prefer a versioned URI when the source might change.

An excerpt is an optional quotation from the source, not the agent's own
summary. Hosts SHOULD keep excerpts short instead of embedding entire
documents. A source location addresses the original source, not the excerpt
or generated answer:

```json
{ "kind": "text", "range": { "start": { "line": 12, "character": 0 }, "end": { "line": 13, "character": 8 } } }
```

Text locations use the same line and UTF-16 rules as answer spans.

```json
{ "kind": "page", "startPage": 4, "endPage": 5 }
```

Page locations use one-based document page numbers, with both ends inclusive.
`endPage` MUST be greater than or equal to `startPage`.

Two sources can share a URI when they describe different passages or page
ranges. Their source IDs remain distinct. A client may group them visually
without merging away the passage information.

## Compatibility and trust

`ResponsePartKind` and `AttributionSourceLocationKind` are non-exhaustive.
Clients that do not understand attribution can ignore that part when rendering
and continue displaying the target text. Clients that do not understand a
source-location kind can still display the source title, URI, and excerpt.
No private `_meta` convention is needed for the basic experience.

Titles and excerpts are untrusted plain text. Source URIs are not permission
grants: clients MUST apply their usual link-opening, resource-access, and
privacy policies. The presence of a source MUST NOT trigger an automatic
fetch. A host MUST only include source details the receiving clients are
allowed to see, including in snapshots and history.

Attribution records what the host says supports the answer. It does not claim
independent verification, ownership, or a license to reuse the source.
Search planning, ranking, live search progress, and UI layout are outside this
contract.
