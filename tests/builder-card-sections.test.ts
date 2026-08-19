import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * BUILDER LOCKED CARD: CORE AND FUN ARE SEPARATE SECTIONS (2026-08-19, Josh's word,
 * verbatim: "The builder locked card needs to clearly define what bets are core bets
 * and what bets are fun bets. As of now they are just continuous")
 *
 * Before this ship the locked panel rendered `locked.core.concat(locked.funT)` into
 * one continuous grid — a $5 fun HR longshot looked exactly like a core ticket. Now
 * the panel renders CORE MONEY and FUN MONEY as labeled sections (fun in the gold
 * treatment it already has on the dashboard, captioned "never in the core net" per
 * the 2026-08-16 split rule), the header sum is core + fun instead of one blended
 * number, and both sections share ONE ticket renderer so the split cannot fork the
 * NV price-confirm behavior.
 */

const src = fs.readFileSync(path.join(process.cwd(), "app/builder/page.tsx"), "utf8");

describe("the locked card renders core and fun as separate sections", () => {
  it("the continuous concat render is gone", () => {
    expect(src).not.toMatch(/locked\.core\.concat\(locked\.funT\)\.map/);
  });
  it("core and funT each map through the shared ticket renderer", () => {
    expect(src).toMatch(/locked\.core\.map\(renderLockedTicket\)/);
    expect(src).toMatch(/locked\.funT\.map\(renderLockedTicket\)/);
  });
  it("the sections are labeled, and fun says it never joins the core net", () => {
    expect(src).toMatch(/Core money/);
    expect(src).toMatch(/Fun money/);
    expect(src).toMatch(/never in the core net/);
  });
  it("an empty fun section explains itself with the server's funNote when present", () => {
    expect(src).toMatch(/locked\.funNote/);
  });
  it("the lock status message reports the split, not one blended number", () => {
    expect(src).not.toMatch(/e\.core\.concat\(e\.funT\)/);
    expect(src).toMatch(/core \+ \$\$\{funS\} fun recorded/);
  });
});
