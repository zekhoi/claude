#!/usr/bin/env node
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "world" },
    shout: { type: "boolean", default: false },
  },
});

const message = `Hello, ${values.name}!`;
console.log(values.shout ? message.toUpperCase() : message);
