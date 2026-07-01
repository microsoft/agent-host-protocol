// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:go

package ahptypes

// ProtocolVersion is the current protocol version (SemVer
// MAJOR.MINOR.PATCH) that this generated source speaks.
const ProtocolVersion = "0.5.1"

// supportedProtocolVersions backs [SupportedProtocolVersions] — held
// in an unexported slice so callers cannot accidentally mutate the
// shared backing array.
var supportedProtocolVersions = []string{
	"0.5.1",
	"0.5.0",
}

// SupportedProtocolVersions returns every protocol version this client
// is willing to negotiate, ordered most-preferred-first. The first
// entry always equals [ProtocolVersion]. The returned slice is a fresh
// copy on every call so callers may mutate it freely.
func SupportedProtocolVersions() []string {
	out := make([]string, len(supportedProtocolVersions))
	copy(out, supportedProtocolVersions)
	return out
}
