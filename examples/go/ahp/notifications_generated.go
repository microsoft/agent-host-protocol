// Code generated from types/*.ts — DO NOT EDIT.

package ahp

import (
	"encoding/json"
	"fmt"
)

// ── Notification Enums ────────────────────────────────────────────────────────

// Reason why authentication is required.
type AuthRequiredReason string

const (
	// The client has not yet authenticated for the resource
	AuthRequiredReasonRequired AuthRequiredReason = "required"
	// A previously valid token has expired or been revoked
	AuthRequiredReasonExpired AuthRequiredReason = "expired"
)

// Discriminant values for all protocol notifications.
type NotificationType string

const (
	NotificationTypeSessionAdded NotificationType = "notify/sessionAdded"
	NotificationTypeSessionRemoved NotificationType = "notify/sessionRemoved"
	NotificationTypeSessionSummaryChanged NotificationType = "notify/sessionSummaryChanged"
	NotificationTypeAuthRequired NotificationType = "notify/authRequired"
)

// ── Notification Types ────────────────────────────────────────────────────────

// SessionAddedNotification Broadcast to all connected clients when a new session is created.
type SessionAddedNotification struct {
	Type NotificationType `json:"type"`
	// Summary of the new session
	Summary SessionSummary `json:"summary"`
}

// SessionRemovedNotification Broadcast to all connected clients when a session is disposed.
type SessionRemovedNotification struct {
	Type NotificationType `json:"type"`
	// URI of the removed session
	Session string `json:"session"`
}

// SessionSummaryChangedNotification Broadcast to all connected clients when an existing session's summary
type SessionSummaryChangedNotification struct {
	Type NotificationType `json:"type"`
	// URI of the session whose summary changed
	Session string `json:"session"`
	// Mutable summary fields that changed; omitted fields are unchanged.
	// 
	// Identity fields (`resource`, `provider`, `createdAt`) never change and
	// MUST be omitted by senders; receivers SHOULD ignore them if present.
	Changes PartialSessionSummary `json:"changes"`
}

// AuthRequiredNotification Sent by the server when a protected resource requires (re-)authentication.
type AuthRequiredNotification struct {
	Type NotificationType `json:"type"`
	// The protected resource identifier that requires authentication
	Resource string `json:"resource"`
	// Why authentication is required
	Reason *AuthRequiredReason `json:"reason,omitempty"`
}

// ── Partial Summary Types ─────────────────────────────────────────────────────

type PartialSessionSummary struct {
	// Session URI
	Resource *string `json:"resource,omitempty"`
	// Agent provider ID
	Provider *string `json:"provider,omitempty"`
	// Session title
	Title *string `json:"title,omitempty"`
	// Current session status
	Status *SessionStatus `json:"status,omitempty"`
	// Creation timestamp
	CreatedAt *int `json:"createdAt,omitempty"`
	// Last modification timestamp
	ModifiedAt *int `json:"modifiedAt,omitempty"`
	// Server-owned project for this session
	Project *ProjectInfo `json:"project,omitempty"`
	// Currently selected model
	Model *ModelSelection `json:"model,omitempty"`
	// The working directory URI for this session
	WorkingDirectory *string `json:"workingDirectory,omitempty"`
	// Whether the client has viewed this session since its last modification
	IsRead *bool `json:"isRead,omitempty"`
	// Whether the session has been marked as done by the client
	IsDone *bool `json:"isDone,omitempty"`
	// Files changed during this session with diff statistics
	Diffs *[]FileEdit `json:"diffs,omitempty"`
}

// ── ProtocolNotification Union ────────────────────────────────────────────────

// ProtocolNotification is a discriminated union keyed on "type".
type ProtocolNotification struct {
	SessionAdded *SessionAddedNotification
	SessionRemoved *SessionRemovedNotification
	SessionSummaryChanged *SessionSummaryChangedNotification
	AuthRequired *AuthRequiredNotification
}

func (u *ProtocolNotification) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"type"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "notify/sessionAdded":
		u.SessionAdded = new(SessionAddedNotification)
		return json.Unmarshal(data, u.SessionAdded)
	case "notify/sessionRemoved":
		u.SessionRemoved = new(SessionRemovedNotification)
		return json.Unmarshal(data, u.SessionRemoved)
	case "notify/sessionSummaryChanged":
		u.SessionSummaryChanged = new(SessionSummaryChangedNotification)
		return json.Unmarshal(data, u.SessionSummaryChanged)
	case "notify/authRequired":
		u.AuthRequired = new(AuthRequiredNotification)
		return json.Unmarshal(data, u.AuthRequired)
	default:
		return fmt.Errorf("unknown ProtocolNotification type: %q", disc.D)
	}
}

func (u ProtocolNotification) MarshalJSON() ([]byte, error) {
	if u.SessionAdded != nil {
		return json.Marshal(u.SessionAdded)
	}
	if u.SessionRemoved != nil {
		return json.Marshal(u.SessionRemoved)
	}
	if u.SessionSummaryChanged != nil {
		return json.Marshal(u.SessionSummaryChanged)
	}
	if u.AuthRequired != nil {
		return json.Marshal(u.AuthRequired)
	}
	return nil, fmt.Errorf("empty ProtocolNotification: no variant set")
}
