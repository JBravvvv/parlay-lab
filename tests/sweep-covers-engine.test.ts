import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * M13 GUARD — the archive sweep must request every market the engine requests.
 *
 * The archive (`tools/snapshot_props.py`) exists to audit the engine's price inputs.
 * 2026-07-28 (M13): the sweep requested only the six canonical keys while the engine
 * requested canonical + `SH_PROP_ALT` — Caesars posts its entire hits/K's ladders under
 * the alternates, so 14 archive days read CZ 0/7,033 (hits) + 0/830 (K's) and the
 * multibook memo misread collection blindness as feed coverage.
 *
 * Both lists are EXTRACTED FROM SOURCE (open capture, never hardcoded), per the
 * hrr-suspension-coupling pattern.
 *
 * `it.fails` DOCUMENTS THE OPEN DEFECT: the fix (adding the alt keys to the sweep) is a
 * collection change with a credit cost (~+90/day at a 15-game slate, twice daily) and
 * awaits the owner's sign-off — docs/multibook-memo.md §2c. Observed RED before being
 * marked expected-to-fail (2026-07-28, this file's introducing commit). WHEN THE FIX
 * SHIPS: flip `it.fails` back to `it` in the same commit that edits MARKETS, and
 * vintage-stamp the archive change.
 */

function engineMarkets(): Set<string> {
  const src = readFileSync("legacy/index.html", "utf8");
  const std = /var SH_PROP_MARKETS="([^"]+)"/.exec(src);
  const alt = /var SH_PROP_ALT="([^"]+)"/.exec(src);
  expect(std, "SH_PROP_MARKETS vanished from the engine — re-point this extraction").toBeTruthy();
  expect(alt, "SH_PROP_ALT vanished from the engine — re-point this extraction").toBeTruthy();
  return new Set([...std![1].split(","), ...alt![1].split(",")]);
}

function sweepMarkets(): Set<string> {
  const src = readFileSync("tools/snapshot_props.py", "utf8");
  const m = /MARKETS = "([^"]+)"/.exec(src);
  expect(m, "MARKETS vanished from the sweep — re-point this extraction").toBeTruthy();
  return new Set(m![1].split(","));
}

describe("M13: the archive sweep covers the engine's market list", () => {
  it.fails("sweep MARKETS ⊇ engine SH_PROP_MARKETS + SH_PROP_ALT (open defect, flip on fix)", () => {
    const eng = engineMarkets();
    const sweep = sweepMarkets();
    const missing = [...eng].filter((k) => !sweep.has(k));
    expect(missing, "engine-requested markets the archive never sees").toHaveLength(0);
  });

  it("PLANT: the canonical six ARE covered — the check can see coverage where it exists", () => {
    const sweep = sweepMarkets();
    const canonical = ["batter_hits", "batter_total_bases", "batter_home_runs",
      "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"];
    expect(canonical.filter((k) => !sweep.has(k))).toHaveLength(0);
  });
});
