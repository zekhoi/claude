import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // CLI tests spawn processes and write temporary trees; the 5 s default times out on loaded machines.
    testTimeout: 20_000,
  },
});
