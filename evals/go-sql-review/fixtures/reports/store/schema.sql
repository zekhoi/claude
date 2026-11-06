CREATE TABLE customers (id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, email TEXT NOT NULL UNIQUE, nickname TEXT);
CREATE TABLE orders (id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, customer_id INT NOT NULL REFERENCES customers(id), status TEXT NOT NULL);
CREATE INDEX orders_tenant_id_idx ON orders (tenant_id, id);
CREATE TABLE order_items (id SERIAL PRIMARY KEY, order_id INT NOT NULL REFERENCES orders(id), sku TEXT NOT NULL, quantity INT NOT NULL);
CREATE INDEX order_items_order_id_idx ON order_items (order_id);
