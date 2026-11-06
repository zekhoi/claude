import { v4 as uuidv4, validate } from "uuid";

export function newOrderId() {
  return `ord_${uuidv4()}`;
}

export function isOrderId(value) {
  return value.startsWith("ord_") && validate(value.slice(4));
}
