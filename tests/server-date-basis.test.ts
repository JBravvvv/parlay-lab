import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ptToday } from "@/lib/server/pt-date";

/**
 * ONE DATE BASIS FOR SERVER ROUTES (2026-07-25)
 *
 * Third server-local date defect in this codebase: obSameDay (dropped ~24% of every
 * server board), CAL_START (caught pre-ship), and /api/generate (wrote the board and
 * its prediction rows under TOMORROW's date on any run after 00:00 UTC). Every one
 * was the same mistake, and /api/clv had the correct pattern sitting in the repo the
 * whole time.
 *
 * A date-deriving route is tested at BOTH timezones — never patched, never trusted.
 */

const root = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const atTz = <T,>(tz: string, fn: () => T): T => {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = prev;
  }
};

describe("ptToday is timezone-independent", () => {
  it("returns the same Pacific date whatever the host clock is set to", () => {
    // 2026-07-26T02:00Z = 7:00 PM Pacific on the 25th. A UTC host would say the 26th.
    const instant = new Date("2026-07-26T02:00:00Z");
    const utc = atTz("UTC", () => ptToday(instant));
    const pt = atTz("America/Los_Angeles", () => ptToday(instant));
    const tokyo = atTz("Asia/Tokyo", () => ptToday(instant));
    expect(utc).toBe("2026-07-25");
    expect(pt).toBe("2026-07-25");
    expect(tokyo).toBe("2026-07-25");
  });

  it("rolls over at Pacific midnight, not UTC midnight", () => {
    expect(ptToday(new Date("2026-07-26T06:59:00Z"))).toBe("2026-07-25"); // 23:59 PT
    expect(ptToday(new Date("2026-07-26T07:01:00Z"))).toBe("2026-07-26"); // 00:01 PT
  });

  it("a server-local basis would have disagreed — the bug, demonstrated", () => {
    const instant = new Date("2026-07-26T02:00:00Z");
    const serverLocal = atTz("UTC", () => instant.toISOString().slice(0, 10));
    expect(serverLocal).toBe("2026-07-26");
    expect(ptToday(instant)).toBe("2026-07-25");
    expect(serverLocal).not.toBe(ptToday(instant)); // ...which is how boards got written to tomorrow
  });
});

describe("every date-deriving server route pins Pacific", () => {
  /* Scanned, not listed. The first version of this test iterated a hardcoded pair and
     was described as covering "any route" — it did not cover /api/calibrate, which was
     still server-local. A hardcoded list is a substitution by another name: it silently
     defines the part of the codebase the test can see. */
  const routes = fs
    .readdirSync(path.join(root, "app/api"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `app/api/${d.name}/route.ts`)
    .filter((r) => fs.existsSync(path.join(root, r)));

  it("scans every route under app/api, not a hand-maintained list", () => {
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });

  it("no route derives a calendar date from the server clock", () => {
    for (const r of routes) {
      const src = strip(read(r));
      expect(src, `${r} derives a date from the server clock`).not.toMatch(
        /new Date\([^)]*\)\.toISOString\(\)\.slice\(0, ?10\)/,
      );
      expect(src, `${r} calls shToday() (server-local inside the sandbox)`).not.toMatch(/shToday"\)\(\)/);
    }
  });

  it("any route that does derive a date uses the shared Pacific helper", () => {
    for (const r of routes) {
      const src = strip(read(r));
      // a route either has no date of its own, or it imports ptToday
      const derives = /ptToday|toISOString\(\)\.slice/.test(src);
      if (derives) expect(src, `${r} should import ptToday`).toMatch(/from "@\/lib\/server\/pt-date"/);
    }
  });

  it("/api/generate pins the ENGINE's own today as well", () => {
    // otherwise shToday() inside the sandbox is still server-local and the schedule
    // pull asks for the wrong day
    expect(strip(read("app/api/generate/route.ts"))).toMatch(/today: dateNow/);
  });

  it("nobody re-implements the Pacific formatter", () => {
    // one definition; /api/clv used to carry its own copy
    let copies = 0;
    for (const r of [...routes, "src/lib/server/pt-date.ts"]) {
      if (/timeZone: ?"America\/Los_Angeles"/.test(read(r))) copies++;
    }
    expect(copies).toBe(1);
  });
});
