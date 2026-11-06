import http from "node:http";

export function handler(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("X-Powered-By", "web/1.4.2 node/" + process.version);
  if (req.url === "/login" && req.method === "POST") {
    res.setHeader("Set-Cookie", "session=abc123; Path=/");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><title>Web</title><h1>Hello</h1>");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  http.createServer(handler).listen(3000);
}
