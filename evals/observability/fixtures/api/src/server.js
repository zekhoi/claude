import http from "node:http";

const users = new Map([["ana@example.com", { id: 1, password: "correct horse" }]]);

export function handler(req, res) {
  console.log("request", req.method, req.url, req.headers);
  if (req.method === "POST" && req.url === "/login") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { email, password } = JSON.parse(body || "{}");
      const user = users.get(email);
      const ok = user && user.password === password;
      res.statusCode = ok ? 200 : 401;
      res.end(JSON.stringify({ ok: Boolean(ok) }));
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  http.createServer(handler).listen(3000);
}
