// Package ahptypes contains the wire protocol types for the
// [Agent Host Protocol] (AHP).
//
// Every command, action, notification, and state object defined by the
// protocol has a Go counterpart here. Structs are tagged for
// [encoding/json] and use the exact same JSON field names as the wire
// format. There is no I/O, no goroutines, and no transport code; if you
// only need to parse or construct AHP messages, this is the only package
// you need.
//
// Most of this package is generated from the canonical TypeScript
// source-of-truth in types/. Hand-written code lives in common.go and
// discriminated_unions.go; everything else is rewritten on
// `npm run generate:go`.
//
// # Companion packages
//
//   - [github.com/microsoft/agent-host-protocol/clients/go/ahp] — async
//     client, reducers, and pluggable Transport.
//   - [github.com/microsoft/agent-host-protocol/clients/go/ahpws] —
//     WebSocket transport built on [github.com/coder/websocket].
//
// # Notes on type mapping
//
//   - TypeScript number → Go int64 (the AHP spec defines numbers as
//     64-bit ints unless a property carries `@format float`, in which
//     case it's emitted as float64).
//   - TS unknown / object → [encoding/json.RawMessage] (boxes any JSON).
//   - TS discriminated unions → concrete wrapper struct (e.g.
//     [StateAction], [ResponsePart], [ToolCallState]) with a typed
//     Value field plus custom MarshalJSON/UnmarshalJSON. Unknown
//     discriminator values surface as a `*XUnknown` variant with the
//     raw JSON preserved.
//   - Bitset enums → typed uint32 with named flag constants and Has/Or
//     helpers; unknown future bits round-trip naturally.
//   - Required fields are emitted without `,omitempty`. Optional fields
//     are pointer types with `,omitempty`.
//
// [Agent Host Protocol]: https://microsoft.github.io/agent-host-protocol/
package ahptypes

import (
	"encoding/json"
	"errors"
	"fmt"
)

// URI is a URI string such as `ahp-root://` or `ahp-session:/<uuid>`.
//
// Declared as a defined string type rather than a plain alias so that
// AHP-typed code can be a little more self-documenting and so future
// helper methods can hang here without breaking the wire format.
type URI = string

// RootResourceURI is the well-known channel URI for the root channel.
//
// Subscribe to this URI to receive [RootState] snapshots and root-level
// actions (agents changed, active sessions changed, terminals changed,
// config changed). Always present on every host.
const RootResourceURI URI = "ahp-root://"

// JSONObject is a typed alias for an opaque JSON object. Used for
// `_meta`, `structuredContent`, and other Record<string, unknown>
// fields where preserving the raw JSON is preferable to forcing a
// concrete Go type.
type JSONObject = map[string]json.RawMessage

// AnyValue is an opaque JSON value (the Go counterpart of the
// TypeScript `unknown` type).
type AnyValue = json.RawMessage

// PartialChatSummary is the partial equivalent of ChatSummary — every field is optional for delta updates.
type PartialChatSummary struct {
	// Chat URI. Ignored by session/chatUpdated reducers; chat identity never changes.
	Resource *URI `json:"resource,omitempty"`
	// Chat title
	Title *string `json:"title,omitempty"`
	// Current chat status (reuses SessionStatus shape)
	Status *SessionStatus `json:"status,omitempty"`
	// Human-readable description of what the chat is currently doing
	Activity *string `json:"activity,omitempty"`
	// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
	ModifiedAt *string `json:"modifiedAt,omitempty"`
	// How this chat came into existence
	Origin *ChatOrigin `json:"origin,omitempty"`
	// Optional per-chat working directory.
	WorkingDirectory *URI `json:"workingDirectory,omitempty"`
}

// ─── StringOrMarkdown ────────────────────────────────────────────────────

// StringOrMarkdown is a wire value that may be either a plain JSON
// string or an object of the form `{"markdown": "..."}`. The wrapper
// preserves which form was decoded so that re-encoding round-trips
// faithfully.
type StringOrMarkdown struct {
	// Markdown is non-nil iff the value was decoded from the
	// `{"markdown": "..."}` form.
	Markdown *string

	// Plain holds the value when decoded from a bare JSON string.
	// Either Markdown or Plain (but never both) is non-nil after a
	// successful UnmarshalJSON.
	Plain *string
}

// NewStringOrMarkdownPlain returns a [StringOrMarkdown] that encodes
// as a bare JSON string.
func NewStringOrMarkdownPlain(s string) StringOrMarkdown {
	return StringOrMarkdown{Plain: &s}
}

// NewStringOrMarkdownMarkdown returns a [StringOrMarkdown] that
// encodes as `{"markdown": s}`.
func NewStringOrMarkdownMarkdown(s string) StringOrMarkdown {
	return StringOrMarkdown{Markdown: &s}
}

// AsText returns the underlying text regardless of which form the
// value was decoded from. Returns the empty string for the zero value.
func (s StringOrMarkdown) AsText() string {
	if s.Plain != nil {
		return *s.Plain
	}
	if s.Markdown != nil {
		return *s.Markdown
	}
	return ""
}

// MarshalJSON encodes the value back into its original wire form.
//
// The zero value encodes as the empty JSON string `""` to match the
// Rust client's [Default::default] behaviour. Setting both Plain and
// Markdown is a programming error; the marshaler prefers Plain in
// that case.
func (s StringOrMarkdown) MarshalJSON() ([]byte, error) {
	if s.Plain != nil {
		return json.Marshal(*s.Plain)
	}
	if s.Markdown != nil {
		return json.Marshal(struct {
			Markdown string `json:"markdown"`
		}{*s.Markdown})
	}
	return []byte(`""`), nil
}

// UnmarshalJSON populates the value from either form.
func (s *StringOrMarkdown) UnmarshalJSON(b []byte) error {
	*s = StringOrMarkdown{}
	if len(b) == 0 || string(b) == "null" {
		return nil
	}
	if b[0] == '"' {
		var v string
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		s.Plain = &v
		return nil
	}
	var obj struct {
		Markdown *string `json:"markdown"`
	}
	if err := json.Unmarshal(b, &obj); err != nil {
		return fmt.Errorf("StringOrMarkdown: %w", err)
	}
	if obj.Markdown == nil {
		return errors.New("StringOrMarkdown: object form missing required `markdown` field")
	}
	s.Markdown = obj.Markdown
	return nil
}

// ─── Discriminated-union helpers ─────────────────────────────────────────

// readDiscriminator parses the value of a top-level discriminator
// field (`type`, `kind`, `status`, …) from a raw JSON object.
//
// Returns the string value, a boolean indicating whether the field
// was present, and an error if the JSON was malformed.
func readDiscriminator(raw []byte, field string) (string, bool, error) {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(raw, &probe); err != nil {
		return "", false, err
	}
	v, ok := probe[field]
	if !ok {
		return "", false, nil
	}
	var s string
	if err := json.Unmarshal(v, &s); err != nil {
		return "", false, fmt.Errorf("discriminator %q: %w", field, err)
	}
	return s, true, nil
}
