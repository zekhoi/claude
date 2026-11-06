// Package svc renders user labels.
package svc

import "example.com/strutil"

// Label returns a display label for a user name.
func Label(name string) string {
	return strutil.Initials(name) + " " + name
}
