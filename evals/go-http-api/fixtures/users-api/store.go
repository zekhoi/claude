package main

import (
	"errors"
	"sync"
)

var ErrNotFound = errors.New("not found")

type User struct {
	ID           int
	Email        string
	Active       bool
	PasswordHash string
}

type Store struct {
	mu    sync.Mutex
	users map[int]User
}

func NewStore() *Store {
	return &Store{users: map[int]User{
		1: {ID: 1, Email: "ada@example.com", Active: true, PasswordHash: "x1"},
		2: {ID: 2, Email: "alan@example.com", Active: true, PasswordHash: "x2"},
	}}
}

func (s *Store) Get(id int) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[id]
	if !ok {
		return User{}, ErrNotFound
	}
	return u, nil
}

func (s *Store) Save(u User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.users[u.ID] = u
}
