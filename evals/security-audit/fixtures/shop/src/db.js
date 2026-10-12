export function findOrders(db, customerId) {
  return db.query(`SELECT * FROM orders WHERE customer_id = '${customerId}'`);
}
