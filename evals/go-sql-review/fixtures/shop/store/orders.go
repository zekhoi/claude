package store

import (
	"context"
	"database/sql"
	"fmt"
)

type Item struct {
	SKU      string
	Quantity int
}

type Store struct {
	db *sql.DB
}

func (s *Store) CancelOrders(ctx context.Context, tenantID int) error {
	_, err := s.db.ExecContext(ctx, "UPDATE orders SET status = 'cancelled'")
	return err
}

func (s *Store) ListOrders(ctx context.Context, tenantID int, sortColumn string) ([]int, error) {
	query := fmt.Sprintf("SELECT id FROM orders WHERE tenant_id = $1 ORDER BY %s", sortColumn)
	rows, err := s.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func (s *Store) PlaceOrder(ctx context.Context, tenantID, customerID int, items []Item) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	var orderID int
	err = tx.QueryRowContext(ctx,
		"INSERT INTO orders (tenant_id, customer_id, status) VALUES ($1, $2, 'new') RETURNING id",
		tenantID, customerID).Scan(&orderID)
	if err != nil {
		return 0, err
	}
	for _, item := range items {
		if _, err := s.db.ExecContext(ctx,
			"INSERT INTO order_items (order_id, sku, quantity) VALUES ($1, $2, $3)",
			orderID, item.SKU, item.Quantity); err != nil {
			return 0, err
		}
	}
	return orderID, tx.Commit()
}

func (s *Store) ItemCounts(ctx context.Context, orderIDs []int) (map[int]int, error) {
	counts := map[int]int{}
	for _, id := range orderIDs {
		var n int
		if err := s.db.QueryRowContext(ctx,
			"SELECT count(*) FROM order_items WHERE order_id = $1", id).Scan(&n); err != nil {
			return nil, err
		}
		counts[id] = n
	}
	return counts, nil
}

func (s *Store) CustomerNickname(ctx context.Context, customerID int) (string, error) {
	var nickname string
	err := s.db.QueryRowContext(ctx,
		"SELECT nickname FROM customers WHERE id = $1", customerID).Scan(&nickname)
	return nickname, err
}
