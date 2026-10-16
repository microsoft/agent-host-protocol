# Windowed delivery conformance corpus

Language-neutral tests for the client side of
[windowed delivery](../../../docs/specification/windowed-delivery.md). Every
client library that implements windowed delivery runs these files through a
small driver against a scripted fake host. Setup differs per language; the
buffering, credit, coalescing, and sending behavior must not.

- `sizes.json` lists raw JSON texts and their size in UTF-16 bytes. A client
  measures each text exactly as received, without parsing and serializing it
  again.
- `scenarios/*.json` are scripted conversations between one client and a fake
  host.

`types/windowed-delivery-corpus.test.ts` checks that the corpus is well formed.

## Driver setup

The driver connects a client to an in-memory transport that it controls:

- Text that the fake host sends reaches the client byte for byte, and the
  transport reports raw text sizes, so the client can offer windowed delivery.
- The driver records every message the client sends, in order.
- The connection is ready before the first step. If the client requires an
  `initialize` handshake, the driver completes it first; the handshake is not
  part of the scenario.
- `windowing` at the top level of a scenario is the connection's windowing
  configuration (`windowBytes`, `maximumFrameBytes`, and optionally
  `maxBufferedSendBytes`).

## Steps

Steps run in order. Steps that inject host messages do not wait for the client
to process them; this lets scenarios test messages that arrive back to back.
Every step that expects something waits up to **1 second** before it fails.

| `op` | Members | Driver action |
|---|---|---|
| `subscribe` | `channel`, `window?`, `receive?`, `coalescing?` | Start a subscription and do not wait for the result. With `window` (an object, possibly empty), opt into windowed delivery with those per-subscription overrides. Without it, subscribe without opting in. `receive` is `auto` (default) or `manual`. `coalescing` defaults to `true`. If the channel is already subscribed, change the existing subscription instead (re-subscribe). |
| `respond` | `to`, `result` | Respond to the oldest unanswered request with method `to`, using its `id`. |
| `hostSends` | `text` | Deliver `text` to the client exactly as written. |
| `hostCreditsAll` | `channel` | Send `channel/credit` with `consumedBytes` equal to the total size of every data message and fragment that the client has sent on `channel` so far, as measured by the driver from the sent text. |
| `expectSent` | `match`, `absent?`, `reassemble?` | Take the client's sent messages in order until one matches `match`. Unmatched `channel/credit` messages are skipped, because credit batching differs between clients. Any other unmatched message fails the step. `absent` lists dotted paths that must not exist in the matched message. With `reassemble: true`, `channel/frame` messages for the channel are collected until `final: true`; each must be at most the accepted host `maximumFrameBytes`, and the joined text is parsed and matched. |
| `expectNotSent` | `match`, `withinMs` | Fail if a message matching `match` is sent, or was already sent and not taken by `expectSent`, within `withinMs` milliseconds. |
| `next` | `channel`, `expect`, `expectBytes?` | Take the next delivery from the subscription. In `auto` mode, this releases the previous delivery. The delivery, written as a JSON-RPC notification `{ "method", "params" }`, must match `expect`. `expectBytes` is the delivery's charged size: the sum of the original messages or fragments it came from. |
| `advance` | `channel` | `auto` mode only: release the current delivery without taking another, as a consumer does when it starts waiting for the next delivery. |
| `release` | `channel`, `index` | `manual` mode only: release the delivery with this zero-based index, counting every delivery taken on the channel during the scenario, across subscriptions. |
| `send` | `channel`, `method`, `params` | Send a notification on the subscription through the client's flow-controlled send path. Do not wait for it to be written. |
| `unsubscribe` | `channel` | Unsubscribe from the channel, as a consumer that is done with it would. Deliveries already taken stay held until released. |
| `expectStatus` | `channel`, `match` | The subscription's flow-control status must match `match`. Waits until it does. |
| `expectClosed` | | The client closes the connection because of a protocol error. |

### Matching

`match` and `expect` are partial structural matches. Objects match when every
listed member matches; unlisted members are ignored. Arrays and scalar values
must be equal.

### Status fields

`expectStatus` uses these names, written in camelCase, whatever the language's
native names are:

| Field | Meaning |
|---|---|
| `mode` | `windowed` or `ordinary` |
| `fallbackReason` | `declined` or `transport` when `mode` is `ordinary` after an offer |
| `limits` | The accepted `ChannelFlowControl` (`clientReceive`, `hostReceive`) |
| `bufferedReceiveBytes` | Data received on the subscription and not yet released |
| `outstandingSendBytes` | Data sent and not yet credited by the host |
| `bufferedSendBytes` | Data queued and not yet sent |
| `writable` | `true` when the host window and the send queue both have room |

### Sizes

Sizes in receive steps are exact, because the host text is literal. The size of
what the client sends depends on its serializer, so send scenarios check
structure only and use windows with enough margin for any serializer.
