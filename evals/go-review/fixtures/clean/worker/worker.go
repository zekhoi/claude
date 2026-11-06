package worker

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
)

type Result struct {
	Path  string
	Lines int
	Err   error
}

// CountLines counts lines in each file with at most limit concurrent reads.
func CountLines(ctx context.Context, paths []string, limit int) []Result {
	results := make([]Result, len(paths))
	sem := make(chan struct{}, limit)
	var wg sync.WaitGroup
	for i, p := range paths {
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				results[i] = Result{Path: p, Err: ctx.Err()}
				return
			}
			data, err := os.ReadFile(p)
			if err != nil {
				results[i] = Result{Path: p, Err: fmt.Errorf("read %s: %w", p, err)}
				return
			}
			results[i] = Result{Path: p, Lines: strings.Count(string(data), "\n")}
		}()
	}
	wg.Wait()
	return results
}
