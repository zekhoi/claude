package svc

import "testing"

func TestLabel(t *testing.T) {
	if got := Label("ada lovelace"); got != "AL ada lovelace" {
		t.Fatalf("got %q", got)
	}
}
