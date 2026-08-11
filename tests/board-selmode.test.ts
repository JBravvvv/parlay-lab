import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MODE_LABEL, orderByMode } from "@/lib/board-order";

/**
 * ONE SELECTION MODE, SITE-WIDE (2026-08-11, Josh: "The Board should run on
 * the same selection mode as The Sharp and the Builder. Whatever is selected
 * as the Selection Mode in settings should run across the entire site.")
 *
 * Before this ship the Board's TOP 50 reacted only to dk_fd; ev_gated,
 * caesars_ev and probability changed The Sharp and the Builder while the
 * Board kept the legacy all-books-EV order — three surfaces, two answers.
 * orderByMode is the shared ordering; the board page consumes it for the
 * actionable TOP 50 view and NAMES the mode in its header. Ordering only:
 * every pick still posts (2026-08-09 rule) — mode-priceless rows sink, never
 * vanish.
 */

const R = (label: string, prob: number | null, czEv: number | null, bsEv: number | null) => ({ label, prob, czEv, bsEv });

describe("orderByMode — each mode ranks by its own price, nothing filtered", () => {
  const rows = [
    R("a", 55, -2.0, 4.0),
    R("b", 70, 1.5, null),
    R("c", 60, 3.2, -1.0),
    R("d", 65, null, 2.0),
  ];
  it("ev_gated and caesars_ev rank by czEv; czEv-less rows sink, not vanish", () => {
    for (const mode of ["ev_gated", "caesars_ev"] as const) {
      const out = orderByMode(rows, mode).map((r) => r.label);
      expect(out).toEqual(["c", "b", "a", "d"]);
      expect(out).toHaveLength(rows.length); // every pick posts
    }
  });
  it("dk_fd ranks by bsEv; basis-less rows sink", () => {
    expect(orderByMode(rows, "dk_fd").map((r) => r.label)).toEqual(["a", "d", "c", "b"]);
  });
  it("probability ranks by true %", () => {
    expect(orderByMode(rows, "probability").map((r) => r.label)).toEqual(["b", "d", "c", "a"]);
  });
  it("stable: ties keep the engine's original order, and the input is not mutated", () => {
    const tied = [R("x", 50, 2, null), R("y", 50, 2, null), R("z", 50, 2, null)];
    const snapshot = JSON.stringify(tied);
    expect(orderByMode(tied, "ev_gated").map((r) => r.label)).toEqual(["x", "y", "z"]);
    expect(JSON.stringify(tied)).toBe(snapshot);
  });
  it("every mode has a header label", () => {
    for (const m of ["dk_fd", "ev_gated", "caesars_ev", "probability"] as const) {
      expect(MODE_LABEL[m]).toBeTruthy();
    }
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("the board page reads the FULL mode and orders TOP 50 with the shared ordering", () => {
    const src = read("app/board/page.tsx");
    expect(src).toMatch(/setSelMode\(getSelectionMode\(\)\)/); // the whole mode, not just a dk_fd boolean
    expect(src).toMatch(/orderByMode\(/);
    expect(src).toMatch(/MODE_LABEL\[selMode\]/); // the header names the order
    expect(src).not.toMatch(/getSelectionMode\(\) === "dk_fd"/); // the boolean-only read is gone
  });
  it("The Sharp keeps its own mode discipline — this ship aligned the Board TO it, not the reverse", () => {
    const src = read("app/sharp/page.tsx");
    expect(src).toMatch(/getSelectionMode\(\)/);
    expect(src).toMatch(/selMode === "ev_gated"/);
  });
});
