# Round-trip corpus — mechanism and known coverage gaps

The fixtures in this directory are a language-agnostic round-trip corpus. Each
fixture's `input` is a wire payload that every client decodes and re-encodes; the
re-encoded value must **exactly** match the single canonical form in
`acceptableOutputs[0]`. The comparison is key-order-independent but value- and
**key-presence-sensitive**: `null` is NOT normalized to absent, and absent is NOT
normalized to `null` (so an absent `origin` re-encoding as `"origin": null` is a
failure, not a pass). `acceptableOutputs` MUST have exactly one entry — multiple
entries would cement observed-but-wrong divergence as "acceptable".

## Group A vs Group B

- **Group A** (`"group": "A"`, or absent): every client agrees; all assert
  `acceptableOutputs[0]`.
- **Group B** (`"group": "B"`): a known type carries extra, unmodeled wire keys.
  Runtime-decoder clients (Go, Rust, Swift, Kotlin) decode into a typed struct,
  which drops the unknown keys, and assert the dropped form in
  `acceptableOutputs[0]`. TypeScript has no runtime decoder, so `JSON.parse` /
  `JSON.stringify` preserve every key; it asserts the preserved form in
  `preservedOutput`. TypeScript still asserts — it is never skipped. Fixtures
  017 and 019 are the Group B cases.

This is a real type-system capability difference, not a blessed divergence: a
runtime client that wrongly *preserved* unknown keys would fail its
`acceptableOutputs[0]` assertion, and a TypeScript path that wrongly *dropped*
them would fail its `preservedOutput` assertion.

## Known coverage gaps (what the corpus does NOT verify)

Honest limits, recorded so they are not mistaken for coverage:

- **TypeScript does not verify generated-type correctness.** TS types are erased
  at runtime, so the TS round-trip harness checks runtime wire behavior + fixture
  self-consistency — not whether the generated TS types are right. A wrong TS
  field name / optionality / nesting would not be caught here; that is the
  compiler's job, exercised where the types are consumed (reducers, client code)
  and by `tsc`. (Separately, `SessionStatus` is a closed `const enum` in TS, so
  the TYPE cannot represent a bitset combination like 72 or an unknown bit like
  2147483720 — the bitset VALUE round-trip is covered by fixtures 004/005.)

Previously-listed gaps now **CLOSED**: Kotlin `JsonRpcMessage` is decoded via its
real generated variant types (`JsonRpcRequest`/`Notification`/`SuccessResponse`/
`ErrorResponse`) — fixtures 008–011 exercise the real classes, not a raw-AST
passthrough. And `SessionStatus` is now a uniform 32-bit-unsigned bitset across
Rust/Go/Kotlin/Swift (`u32`/`uint32`/`UInt`/`UInt32`), so every client holds the
same value range — within TS's `number` 53-bit-safe limit, with no width
divergence.
