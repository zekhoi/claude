---
name: kit-go-sql-review
description: Review Go code that accesses SQL databases through database/sql, sqlx, pgx, sqlc, or GORM for correctness, safety, transactions, resource handling, and performance, and report findings with severity and file locations. Use when asked to review database query code, repositories, or data-access changes in a Go project. Do not use for writing migrations or schema changes (use kit-database-design), for general Go review (use kit-go-review), or for non-Go code; this skill reports and does not edit code.
---

# Go SQL review

Report findings without modifying code unless the user asks for fixes.

## 1. Understand the data layer

- Identify the driver and library (`database/sql` with `lib/pq` or `pgx/stdlib`, native `pgx`, sqlx, sqlc-generated code, GORM), how the pool is created and configured (`SetMaxOpenConns`), and how transactions are wrapped.
- Read the schema or migrations for nullable columns, unique constraints, and indexes, and the repository's error conventions (`ErrNotFound`).

## 2. Check each query

**Correctness**

- `UPDATE` and `DELETE` without `WHERE`, and GORM `Delete` or `Updates` on an empty model or condition, affect every row. Flag them unless intended (GORM blocks global updates unless `AllowGlobalUpdate` is set; check it is not).
- `QueryRow(...).Scan` returns `sql.ErrNoRows`: callers must handle it with `errors.Is`. Nullable columns need `sql.NullString`, pointers, or `COALESCE`; scanning NULL into `string` fails.
- GORM `Updates(struct)` skips zero values (`false`, `0`, `""`): flag updates that silently drop them and suggest `map[string]any` or `Select`. GORM `First` returns `ErrRecordNotFound`; `Find` does not.
- Pagination needs a deterministic `ORDER BY`.

**Safety**

- Placeholders (`$1`, `?`) are parameterized. `fmt.Sprintf` or string concatenation into SQL, GORM `Raw`/`Where`/`Order` with interpolated strings, and sqlx `In` misuse are injection: require placeholders or an allowlist for identifiers.
- Check tenant or owner filters on every query that needs them, and that `SELECT *` into response structs does not expose sensitive columns.

**Resources and transactions**

- Every `rows` from `Query` needs `defer rows.Close()` after the error check and a `rows.Err()` check after the loop; otherwise connections leak and iteration errors are lost.
- Transactions need `defer tx.Rollback()` right after `BeginTx` (harmless after `Commit`), and every statement inside must use `tx`, not the pool. Pass `ctx` (`QueryContext`, `BeginTx(ctx, ...)`, GORM `WithContext`).
- Avoid holding a transaction open across slow external calls, and never share a `*sql.Tx` across goroutines.

**Performance**

- Queries in loops (N+1) should become one query with `= ANY($1)` or `IN (?)` via sqlx, a join, or GORM `Preload`. Use batch inserts or `COPY` for many rows. Check filtered and sorted columns are indexed.

## 3. Verify and report

Confirm each finding by reading the query, the schema, and its callers; run `go vet ./...` and the tests when available. Report findings ordered by severity (critical, high, medium, low) with `file:line`, the problem, a concrete scenario, and a fix. If there are no findings, say so and list what was checked.

## Examples

- Use: "Review internal/store/orders.go." "Check this repository for SQL mistakes."
- Skip: "Write a migration that adds an index." "Review this TypeScript query." "Review the whole service for goroutine leaks." (kit-go-review)
