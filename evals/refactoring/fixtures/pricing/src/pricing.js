export function orderTotal(items, customer) {
  let total = 0;
  for (const item of items) total += item.price * item.quantity;
  if (customer.vip) {
    total = total - total * 0.1;
  } else if (total > 100) {
    total = total - total * 0.05;
  }
  return Math.round(total * 100) / 100;
}

export function quoteTotal(items, customer) {
  let total = 0;
  for (const item of items) total += item.price * item.quantity;
  if (customer.vip) {
    total = total - total * 0.1;
  } else if (total > 100) {
    total = total - total * 0.05;
  }
  total = total + 2.5;
  return Math.round(total * 100) / 100;
}
