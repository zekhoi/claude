package store

import (
	"context"
	"database/sql"
	"errors"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	db *sql.DB
}

type OrderSummary struct {
	ID     int
	Status string
}

func (s *Store) RecentOrders(ctx context.Context, tenantID, limit int) ([]OrderSummary, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT id, status FROM orders WHERE tenant_id = $1 ORDER BY id DESC LIMIT $2",
		tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OrderSummary
	for rows.Next() {
		var o OrderSummary
		if err := rows.Scan(&o.ID, &o.Status); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *Store) MarkShipped(ctx context.Context, tenantID, orderID int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx,
		"UPDATE orders SET status = 'shipped' WHERE id = $1 AND tenant_id = $2", orderID, tenantID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

func (s *Store) CustomerNickname(ctx context.Context, tenantID, customerID int) (string, error) {
	var nickname sql.NullString
	err := s.db.QueryRowContext(ctx,
		"SELECT nickname FROM customers WHERE id = $1 AND tenant_id = $2", customerID, tenantID).
		Scan(&nickname)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return nickname.String, nil
}
