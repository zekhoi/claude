CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  email TEXT
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER,
  total FLOAT,
  created_at TIMESTAMP
);
