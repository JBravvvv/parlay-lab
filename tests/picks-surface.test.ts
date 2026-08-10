import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pickStatus, STATUS_LABEL } from "@/lib/picks-status";

/**
 * THE PICKS SURFACE ON THE BOARD PAGE (2026-08-08, operator's screenshot: every prop tab
 * 0 at 8:12 PM PT while the stored board carried full N — §12Z.14).
 *
 * THE TRACED MECHANISM: the prop tabs read `cats[cat]` from whatever board object
 * bestBoard held (engine-client L262-298 scores by STILL-BETTABLE games, which zeroes
 * every afternoon board by evening and prefers a freshly generated in-game view), so by
 * evening the pregame prop pool was legitimately empty ON THAT OBJECT while the day's
 * stored, stamped board sat at full N. The page was a live view masquerading as the
 * picks. Prop tabs now render /api/picks (stored board + TTL walk-back + staleNote);
 * the LIVE pill keeps the live pool; TOP 50/ML/RL stay the actionable board view.
 *
 * Guarded here: the status taxonomy (res dominates the clock), and the wiring — the
 * page consumes the picks payload, shows the staleNote, and the route joins res + start.
 * The vocabulary/never-empty walk-back guards live in tests/live-vocabulary.test.ts with
 * the CAPTURED-PRODUCTION-ROW fixture (the tab-purity lesson).
 */

const NOW = Date.parse("2026-08-08T03:12:00Z"); // the minute of the operator's screenshot

describe("pickStatus — res dominates the clock; the clock decides the rest", () => {
  it("settled grades win regardless of start time", () => {
    expect(pickStatus("2026-08-09T20:00:00Z", "won", NOW)).toBe("won"); // future start, graded — res still wins
    expect(pickStatus("2026-08-07T22:40:00Z", "lost", NOW)).toBe("lost");
    expect(pickStatus(null, "void", NOW)).toBe("void");
    expect(pickStatus(null, "ungradable", NOW)).toBe("ungradable");
  });
  it("ungraded rows split on first pitch", () => {
    expect(pickStatus("2026-08-08T20:10:00Z", null, NOW)).toBe("upcoming");
    expect(pickStatus("2026-08-07T22:40:00Z", "pending", NOW)).toBe("live");
  });
  it("unknown start with no grade reads upcoming — stamped picks are pregame by construction", () => {
    expect(pickStatus(null, null, NOW)).toBe("upcoming");
    expect(pickStatus("not-a-date", null, NOW)).toBe("upcoming");
  });
  it("every status has a label", () => {
    for (const s of ["upcoming", "live", "won", "lost", "void", "ungradable"] as const) {
      expect(STATUS_LABEL[s]).toBeTruthy();
    }
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("the board page's prop tabs consume the picks payload, not the held board's live pool", () => {
    const src = read("app/board/page.tsx");
    expect(src).toMatch(/propRows/);
    expect(src).toMatch(/picksData/);
    expect(src).toMatch(/staleNote/);
    expect(src).toMatch(/pickStatus\(/);
  });
  it("/api/picks joins res (prediction-store day blob) and start (gameInfo) onto each pick", () => {
    const src = read("app/api/picks/route.ts");
    expect(src).toMatch(/pl:pred:/);
    expect(src).toMatch(/resOf\(/);
    expect(src).toMatch(/start:/);
  });
  it("the header names the split: live board rows vs the day's stamped picks", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "app/board/page.tsx"), "utf8");
    expect(raw).toMatch(/live board rows/);
    expect(raw).toMatch(/day's stamped picks/);
  });

  it("EVERY PICK POSTS (2026-08-09, Josh's call): no cz-null holdback; only his ⓘ toggle hides, and it is reversible", () => {
    const src = read("app/board/page.tsx");
    expect(src).not.toMatch(/rows=\{playable\}/); // the old Caesars-only filter is gone
    expect(src).not.toMatch(/Not at Caesars \(/); // and so is the holdout drawer
    expect(src).toMatch(/useCzHidden\(/);
    expect(src).toMatch(/CzInfo/);
    expect(src).toMatch(/show all again/); // hidden picks are always recoverable
    const czInfo = fs.readFileSync(path.join(process.cwd(), "src/components/ui/CzInfo.tsx"), "utf8");
    expect(czInfo).toMatch(/Is this pick offered at Caesars sportsbook right now\?/);
  });

  it("the lime liquid glass spans (2026-08-09, Josh's aesthetic call): panels, tables, and no half-green rows", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
    const glass = css.slice(css.indexOf(".glass {"), css.indexOf(".glass {") + 900);
    expect(glass).toMatch(/acc-lime/); // the base surface carries the green
    expect(css).toMatch(/\.glass-table/); // data tables ride it too
    const evGlow = css.slice(css.indexOf(".ev-glow {"), css.indexOf(".ev-glow {") + 300);
    expect(evGlow).not.toMatch(/transparent 55%/); // the half-green/half-black fade is gone
    const dt = read("src/components/ui/DataTable.tsx");
    expect(dt).toMatch(/glass-table/);
  });
});
