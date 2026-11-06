// Package strutil has small string helpers.
package strutil

import "strings"

// Initials returns the uppercase first letter of each word.
func Initials(s string) string {
	var b strings.Builder
	for _, f := range strings.Fields(s) {
		b.WriteString(strings.ToUpper(f[:1]))
	}
	return b.String()
}
