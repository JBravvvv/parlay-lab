import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    // several suites run a full engine analyze (collectSlate + 10k sims) in beforeAll;
    // under parallel file collection that can blow the 10s default and silently skip
    // the whole suite — a green-looking run with skipped files is worse than a slow one
    hookTimeout: 120_000,
  },
});
