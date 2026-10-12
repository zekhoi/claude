import http from "node:http";

export function createServer(handler) {
  return http.createServer(handler);
}
