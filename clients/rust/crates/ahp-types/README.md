# ahp-types

Wire protocol types for the [Agent Host Protocol (AHP)](https://github.com/microsoft/agent-host-protocol).

[![crates.io](https://img.shields.io/crates/v/ahp-types.svg)](https://crates.io/crates/ahp-types)
[![docs.rs](https://img.shields.io/docsrs/ahp-types)](https://docs.rs/ahp-types)

Rust types for every message, action, command, and state object defined by the [AHP specification](https://microsoft.github.io/agent-host-protocol/). All types implement `Serialize + Deserialize` and use the same JSON field names as the wire format.

## Modules

| Module | Contents |
|---|---|
| [`state`](https://docs.rs/ahp-types/latest/ahp_types/state/) | `RootState`, `SessionState`, tool-call lifecycle, terminal state |
| [`actions`](https://docs.rs/ahp-types/latest/ahp_types/actions/) | `StateAction` discriminated union and `ActionEnvelope` |
| [`commands`](https://docs.rs/ahp-types/latest/ahp_types/commands/) | Command params and result types |
| [`notifications`](https://docs.rs/ahp-types/latest/ahp_types/notifications/) | Protocol notifications |
| [`messages`](https://docs.rs/ahp-types/latest/ahp_types/messages/) | JSON-RPC wire envelopes |
| [`errors`](https://docs.rs/ahp-types/latest/ahp_types/errors/) | AHP and JSON-RPC error codes |
| [`version`](https://docs.rs/ahp-types/latest/ahp_types/version/) | Protocol version constants |

## Usage

```toml
[dependencies]
ahp-types = "0.1"
serde_json = "1"
```

```rust
use ahp_types::actions::{ActionEnvelope, StateAction};

let json = r#"{
  "channel": "ahp-session:/s1",
  "action": { "type": "session/titleChanged", "title": "Hi" },
  "serverSeq": 7,
  "origin": null
}"#;
let env: ActionEnvelope = serde_json::from_str(json).unwrap();
match env.action {
    StateAction::SessionTitleChanged(a) => println!("title: {}", a.title),
    _ => {}
}
```

## See also

- [`ahp`](https://crates.io/crates/ahp) — async client, reducers, and transport trait
- [`ahp-ws`](https://crates.io/crates/ahp-ws) — WebSocket transport
- [Protocol documentation](https://microsoft.github.io/agent-host-protocol/)
