// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:go

package ahptypes

import (
	"fmt"
	"strconv"
	"strings"
)

// ProtocolVersion is the current protocol version (SemVer
// MAJOR.MINOR.PATCH) that this generated source speaks.
const ProtocolVersion = "1.1.0"

// supportedProtocolVersions backs [SupportedProtocolVersions] — held
// in an unexported slice so callers cannot accidentally mutate the
// shared backing array.
var supportedProtocolVersions = []string{
	"1.0.0",
	"0.9.0",
}

// SupportedProtocolVersions returns every protocol version this client
// is willing to negotiate, ordered most-preferred-first, independently
// of the development [ProtocolVersion]. The returned slice is a fresh
// copy on every call so callers may mutate it freely.
func SupportedProtocolVersions() []string {
	out := make([]string, len(supportedProtocolVersions))
	copy(out, supportedProtocolVersions)
	return out
}

// NegotiateProtocolVersion selects the highest offered version in a supported
// caret range. An empty result means the host must send UnsupportedProtocolVersion
// and close. Malformed versions return an error.
func NegotiateProtocolVersion(offered []string) (string, error) {
	parse := func(version string) ([3]uint64, error) {
		var result [3]uint64
		parts := strings.Split(version, ".")
		if len(parts) != 3 {
			return result, fmt.Errorf("invalid protocol version: %s", version)
		}
		for i, part := range parts {
			if part == "" || (len(part) > 1 && part[0] == '0') {
				return result, fmt.Errorf("invalid protocol version: %s", version)
			}
			for _, digit := range part {
				if digit < '0' || digit > '9' {
					return result, fmt.Errorf("invalid protocol version: %s", version)
				}
			}
			value, err := strconv.ParseUint(part, 10, 64)
			if err != nil {
				return result, fmt.Errorf("invalid protocol version: %s", version)
			}
			result[i] = value
		}
		return result, nil
	}
	compare := func(a, b [3]uint64) int {
		for i := range a {
			if a[i] < b[i] {
				return -1
			}
			if a[i] > b[i] {
				return 1
			}
		}
		return 0
	}
	var baselines [][3]uint64
	for _, baseline := range supportedProtocolVersions {
		parts, err := parse(baseline)
		if err != nil {
			return "", err
		}
		baselines = append(baselines, parts)
	}
	var selected string
	var previous [3]uint64
	for _, version := range offered {
		parts, err := parse(version)
		if err != nil {
			return "", err
		}
		for _, base := range baselines {
			if parts[0] == base[0] && (parts[0] > 0 || parts[1] == base[1]) &&
				(parts[0] > 0 || parts[1] > 0 || parts[2] == base[2]) &&
				compare(parts, base) >= 0 && (selected == "" || compare(parts, previous) > 0) {
				selected, previous = version, parts
			}
		}
	}
	return selected, nil
}
