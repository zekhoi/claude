const chalk = require("chalk");

function formatStatus(status) {
  if (status === "ok") return chalk.green("ok");
  if (status === "warn") return chalk.yellow("warn");
  return chalk.red(status);
}

module.exports = { formatStatus };
