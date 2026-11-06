import { buildReport } from "./src/report.js";

const customers = Array.from({ length: 5000 }, (_, i) => ({
  id: i,
  firstName: `First${i}`,
  lastName: `Last${i}`,
}));
const orders = Array.from({ length: 50000 }, (_, i) => ({
  id: i,
  customerId: i % 5000,
  amount: (i % 97) + 1,
  skus: [`SKU${i % 300}`, `SKU${(i * 7) % 300}`],
}));

const start = performance.now();
buildReport(orders, customers);
console.log(`buildReport: ${(performance.now() - start).toFixed(0)} ms`);
