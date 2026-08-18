import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * CORE AND FUN SPLIT IN THE NET (2026-08-16, Josh's word, verbatim: "Fun Money and
 * Core money should be separated when calculating net profit. The only +/- that
 * matters to show as the main check is the core money. I want to be able to see the
 * fun money by itself as well but not calculated into net profit/loss.")
 *
 * The engine already computes per-scope stats (shLedgerStats "core"/"fun"/"all") —
 * this ship is display wiring: the dashboard's headline P/L, ROI, record, and equity
 * spark are CORE-ONLY; fun gets its own visible line; the Ledger page defaults to
 * CORE and its toggle offers CORE/FUN with no blended "all" view (a blended net is
 * exactly the number Josh ruled out).
 */

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

describe("the dashboard's main check is core money", () => {
  it("headline stats come from scope 'core'; 'all' is gone; fun has its own read", () => {
    const src = read("app/page.tsx");
    expect(src).toMatch(/stats\("core"\)/);
    expect(src).not.toMatch(/stats\("all"\)/);
    expect(src).toMatch(/stats\("fun"\)/); // visible by itself…
  });
  it("…and the labels say so", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
    expect(raw).toMatch(/core season P\/L/i);
    expect(raw).toMatch(/FUN/); // the fun line renders under its own name
  });
});

describe("the Ledger page defaults to core and never offers a blended net", () => {
  it("default scope is 'core'; the toggle is core/fun only", () => {
    const src = read("app/ledger/page.tsx");
    expect(src).toMatch(/useState<"core" \| "fun">\("core"\)/);
    expect(src).toMatch(/\["core", "fun"\] as const/);
    expect(src).not.toMatch(/\["all", "core", "fun"\]/);
  });
});
