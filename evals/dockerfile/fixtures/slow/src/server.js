import http from "node:http";

import ms from "ms";

const port = Number(process.env.PORT ?? 8080);
const started = Date.now();

http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ uptime: ms(Date.now() - started) }));
  })
  .listen(port, () => console.log(`listening on ${port}`));
