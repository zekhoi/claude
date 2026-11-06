package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGetUser(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		status int
		body   string
	}{
		{"found", "/users/1", http.StatusOK, `{"id":1,"email":"ada@example.com","active":true}`},
		{"missing", "/users/99", http.StatusNotFound, `{"error":"user not found"}`},
		{"invalid", "/users/abc", http.StatusBadRequest, `{"error":"invalid id"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			NewServer(NewStore()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))
			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d", rec.Code, tt.status)
			}
			if got := strings.TrimSpace(rec.Body.String()); got != tt.body {
				t.Fatalf("body = %s, want %s", got, tt.body)
			}
		})
	}
}
