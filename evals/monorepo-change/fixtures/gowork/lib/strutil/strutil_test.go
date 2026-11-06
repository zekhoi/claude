package strutil

import "testing"

func TestInitials(t *testing.T) {
	if got := Initials("ada lovelace"); got != "AL" {
		t.Fatalf("got %q", got)
	}
}
