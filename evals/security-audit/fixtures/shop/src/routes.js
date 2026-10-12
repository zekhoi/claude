import fs from "node:fs";
import path from "node:path";
import { findOrders } from "./db.js";
import { currentUser } from "./auth.js";

export function routes(db) {
  return {
    "GET /orders": (req) => findOrders(db, req.query.customerId),
    "GET /invoices": (req) => fs.readFileSync(path.join("invoices", req.query.file), "utf8"),
    "DELETE /admin/orders": (req) => {
      const user = currentUser(req);
      if (!user) throw new Error("unauthenticated");
      return db.query("DELETE FROM orders");
    },
  };
}
