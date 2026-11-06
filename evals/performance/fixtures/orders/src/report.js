// Builds a per-customer report from orders and customers.
export function buildReport(orders, customers) {
  const report = [];
  for (const customer of customers) {
    const own = orders.filter((o) => o.customerId === customer.id);
    const skus = [];
    for (const order of own) {
      for (const sku of order.skus) {
        if (!skus.includes(sku)) skus.push(sku);
      }
    }
    report.push({
      id: customer.id,
      name: formatName(customer),
      orders: own.length,
      total: own.reduce((sum, o) => sum + o.amount, 0),
      skus: skus.sort(),
    });
  }
  return report;
}

export function formatName(customer) {
  return `${customer.lastName}, ${customer.firstName}`;
}
