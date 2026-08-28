import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    /* TZ PIN (2026-08-27): the armed baseline's propBoard hash embeds locale-rendered
       game times (toLocaleTimeString in the header strings), so the stored md5s are
       renderings under the timezone the baselines were CUT in — America/Los_Angeles.
       When this machine moved to America/Denver, armed-baseline went red with counts
       identical and every field-selected section still matching (measured: LA
       135f586f… = the stored pin, Denver 97b0336…, Chicago 8d5eff…). Pinning the
       suite's TZ makes every locale-dependent artifact host-independent; re-pinning
       hashes to the machine's current zone would break again on the next trip. */
    env: { TZ: "America/Los_Angeles" },
    testTimeout: 120_000,
    // several suites run a full engine analyze (collectSlate + 10k sims) in beforeAll;
    // under parallel file collection that can blow the 10s default and silently skip
    // the whole suite — a green-looking run with skipped files is worse than a slow one
    hookTimeout: 120_000,
  },
});
