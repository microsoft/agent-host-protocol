package ahptypes

import (
	"encoding/json"
	"slices"
)

func unmarshalWithExtra[T any](data []byte, known *T, extra *map[string]json.RawMessage, keys ...string) error {
	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	var members map[string]json.RawMessage
	if err := json.Unmarshal(data, &members); err != nil {
		return err
	}
	for _, key := range keys {
		delete(members, key)
	}
	if len(members) == 0 {
		members = nil
	}
	*known = value
	*extra = members
	return nil
}

func marshalWithExtra(value any, extra map[string]json.RawMessage, keys ...string) ([]byte, error) {
	data, err := json.Marshal(value)
	if err != nil || len(extra) == 0 {
		return data, err
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(data, &object); err != nil {
		return nil, err
	}
	for key, value := range extra {
		if !slices.Contains(keys, key) {
			object[key] = value
		}
	}
	return json.Marshal(object)
}
