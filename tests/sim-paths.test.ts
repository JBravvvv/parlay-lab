/**
 * SIM DEPTH (2026-09-04). Josh, verbatim: "Make everything like the Board refresh
 * only 25K sims instead of 50K". One constant feeds armV2 and every UI string.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SIM_PATHS, SIM_PATHS_TXT } from "../src/lib/engine-client";

describe("SIM_PATHS", () => {
  it("is 25,000 and the display string matches", () => {
    expect(SIM_PATHS).toBe(25000);
    expect(SIM_PATHS_TXT).toBe("25,000");
  });
  it("armV2 feeds simN and simNHR from the constant; no page hard-codes a path count", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/engine-client.ts"), "utf8");
    expect(src).toMatch(/simN: SIM_PATHS,\s*simNHR: SIM_PATHS,/);
    for (const f of ["app/board/page.tsx", "app/sharp/page.tsx", "app/simulator/page.tsx"]) {
      const s = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      expect(s, f).toMatch(/SIM_PATHS_TXT/);
      expect(s, f).not.toMatch(/50,000|25,000|50000|25000/);
    }
  });
});
