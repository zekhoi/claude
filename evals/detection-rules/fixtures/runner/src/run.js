import { exec, execFile } from "node:child_process";

export function registerRoutes(app) {
  app.get("/ping", (req, res) => {
    exec(`ping -c 1 ${req.query.host}`, (err, stdout) => res.send(stdout));
  });
  app.get("/version", (req, res) => {
    execFile("git", ["--version"], (err, stdout) => res.send(stdout));
  });
  app.get("/lookup", (req, res) => {
    execFile("dig", ["+short", req.query.name], (err, stdout) => res.send(stdout));
  });
}
