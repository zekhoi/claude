package worker

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
)

type Result struct {
	Path  string
	Lines int
}

// CountLines counts lines in each file concurrently and returns the first result.
func CountLines(ctx context.Context, paths []string) (Result, error) {
	results := make(chan Result)
	for _, p := range paths {
		go func() {
			data, _ := os.ReadFile(p)
			results <- Result{Path: p, Lines: strings.Count(string(data), "\n")}
		}()
	}
	return <-results, nil
}

// Totals counts lines per file, sharing one map across goroutines.
func Totals(paths []string) map[string]int {
	totals := map[string]int{}
	var wg sync.WaitGroup
	for _, p := range paths {
		go func() {
			wg.Add(1)
			defer wg.Done()
			data, err := os.ReadFile(p)
			if err == nil {
				totals[p] = strings.Count(string(data), "\n")
			}
		}()
	}
	wg.Wait()
	return totals
}

// ConcatAll reads every file and returns their contents joined.
func ConcatAll(paths []string) (string, error) {
	var b strings.Builder
	var err error
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			break
		}
		defer f.Close()
		buf := make([]byte, 4096)
		n, _ := f.Read(buf)
		b.Write(buf[:n])
	}
	return b.String(), err
}

var ErrEmpty = errors.New("empty")

// Index records each path's first line in a lazily created index.
type Index struct {
	first map[string]string
}

func (ix *Index) Add(path, firstLine string) {
	ix.first[path] = firstLine
}
