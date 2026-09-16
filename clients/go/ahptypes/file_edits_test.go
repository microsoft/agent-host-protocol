package ahptypes

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestFileEditTypesRoundTrip(t *testing.T) {
	size := int64(32)
	added := int64(2147483648)
	removed := int64(0)
	contentType := "text/plain"
	nonce := "v1"
	side := FileEditSide{
		Uri: "file:///workspace/file.txt",
		Content: ContentRef{
			Uri:         "ahp-content:/file",
			SizeHint:    &size,
			ContentType: &contentType,
			Nonce:       &nonce,
		},
	}
	original := FileEditCollection{
		Items: []FileEdit{{
			Before: &side,
			After:  &side,
			Diff: &FileEditDiffStats{
				Added:   &added,
				Removed: &removed,
			},
		}},
	}
	encoded, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	var decoded FileEditCollection
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(decoded, original) {
		t.Fatalf("decoded collection = %#v, want %#v", decoded, original)
	}
	var after *FileEditSide = decoded.Items[0].After
	if after == nil || after.Content.Uri != "ahp-content:/file" {
		t.Fatalf("unexpected typed side: %#v", after)
	}
}

func TestFileEditEmptyCollectionPreservesItems(t *testing.T) {
	encoded, err := json.Marshal(FileEditCollection{Items: []FileEdit{}})
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"items":[]}` {
		t.Fatalf("encoded collection = %s, want required empty items", encoded)
	}
}
