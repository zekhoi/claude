package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
)

type userResponse struct {
	ID     int    `json:"id"`
	Email  string `json:"email"`
	Active bool   `json:"active"`
}

type Server struct {
	store *Store
}

func NewServer(store *Store) http.Handler {
	s := &Server{store: store}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /users/{id}", s.getUser)
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (s *Server) getUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	u, err := s.store.Get(id)
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, userResponse{ID: u.ID, Email: u.Email, Active: u.Active})
}

func main() {
	log.Fatal(http.ListenAndServe(":8080", NewServer(NewStore())))
}
