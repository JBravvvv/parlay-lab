import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * EVERY IDENTITY-FALLBACK FACTOR IS CLASSIFIED. ENFORCED, NOT AUDITED.
 *
 * A factor that returns `1` when its input is missing changes the board without changing a
 * frozen parameter, so the drift detector reports clean while the model quietly loses a term.
 * That is how `shPenQF` spent its whole life returning 1.0, and how `shUmpKf` looked
 * "structurally inert" when its input was actually being overwritten nightly.
 *
 * Seven were found by audit. **This test found the eighth**: `shPriorKf` (L1592) returns 1 when
 * priors are missing and appeared in no registry, no doc, and no drift check. It was found
 * because the build asked — which is the whole argument for asking in the build.
 *
 * A new factor with an identity fallback fails here until it is classified. The classification
 * is the question this project has learned to ask:
 *
 *   PINNED           inert by an explicit config decision, with an activation plan
 *   DATA-DEPENDENT   live when its input exists; its live SHARE is the thing to watch
 *   STRUCTURAL       cannot fire by arithmetic — reserve this for a DERIVED bound, never for
 *                    one observed value (see docs/harness-substitutions.md)
 */

const ENGINE = fs.readFileSync(path.join(__dirname, "..", "legacy", "index.html"), "utf8");
const FACTOR_TOOL = fs.readFileSync(path.join(__dirname, "..", "tools", "factor_activity.py"), "utf8");

type Kind = "PINNED" | "DATA-DEPENDENT" | "STRUCTURAL";
const REGISTRY: Record<string, { kind: Kind; why: string }> = {
  shUmpKf: {
    kind: "PINNED",
    why: "SH_CFG.umpKFrozen. Its INPUT was separately being destroyed nightly by context.json's " +
      "replace-write; fixed 2026-07-27 by merge_prior. Pinned, not structural.",
  },
  shPenQF: { kind: "PINNED", why: "SH_CFG.penQFrozen — activation plan in docs/collection-period.md" },
  shPenF: {
    kind: "DATA-DEPENDENT",
    why: "needs SH_CTX.bullpen_last3 + the sim armed. 100% LIVE in production — the only one of " +
      "these that is, which is why a null-overwrite of bullpen_last3 was the live exposure.",
  },
  shTempF: {
    kind: "DATA-DEPENDENT",
    why: "needs g.weather.temp. Production-active; FIXTURE-inert (the fixture slate carries no " +
      "temp), which is a harness limitation, not inertness — see clamp-activity's cold list.",
  },
  shPitPctF: { kind: "DATA-DEPENDENT", why: "needs Savant pitcher percentiles (xwOBA/xERA) for the starter" },
  shOppWhiffF: { kind: "DATA-DEPENDENT", why: "needs priors plus at least 5 lineup batters carrying whiff_percent" },
  shLaborF: { kind: "DATA-DEPENDENT", why: "needs the sim armed and a pitches-per-start estimate" },
  shPriorKf: {
    kind: "DATA-DEPENDENT",
    why: "needs SH_PRIORS.pitchers[id].k_pct AND the league k_pct. REGISTERED 2026-07-27 — it was " +
      "the eighth, absent from tools/factor_activity.py's FACTORS, from the docs' 'seven engine " +
      "factors', and from every drift check. Found by this test, not by a consequence.",
  },
};

/**
 * Functions named sh*F / sh*Kf whose body returns a bare identity `1`.
 *
 * THE BODY IS BOUNDED AT THE NEXT TOP-LEVEL `function`, not at a fixed line count. The first
 * version of this scan took a flat 8-line window and reported `shPitIsoF` — which returns
 * `null`, not 1 — because the window bled into `shPenF` on the next line. A guard whose first
 * result is a false positive is the same class of defect as one that never fires.
 */
function identityFallbackFactors(): string[] {
  const lines = ENGINE.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^function (sh[A-Za-z]*(?:F|Kf))\(/.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !/^function /.test(lines[j])) j++;
    if (/return 1[;,)]/.test(lines.slice(i, j).join("\n"))) out.push(m[1]);
  }
  return [...new Set(out)].sort();
}

describe("identity-fallback factors are classified, and the build asks", () => {
  const found = identityFallbackFactors();

  it("finds the factors at all — a scan that matches nothing would pass vacuously", () => {
    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  it("EVERY identity-fallback factor is in the registry", () => {
    for (const f of found) {
      expect(
        REGISTRY[f],
        `${f}() returns an identity 1 but is unclassified. Say whether its inertness is PINNED ` +
          `(a config decision), DATA-DEPENDENT (watch its live share), or STRUCTURAL (a DERIVED ` +
          `bound — never one observed value), and add it to tools/factor_activity.py's FACTORS.`,
      ).toBeTruthy();
    }
  });

  it("the registry contains no factor that no longer exists", () => {
    for (const name of Object.keys(REGISTRY)) {
      expect(found.includes(name), `${name} is registered but no longer has an identity fallback`).toBe(true);
    }
  });

  it("every classification states a reason", () => {
    for (const [name, r] of Object.entries(REGISTRY)) {
      expect(r.why.length, `${name}: no reason given`).toBeGreaterThan(30);
      expect(["PINNED", "DATA-DEPENDENT", "STRUCTURAL"]).toContain(r.kind);
    }
  });

  it("tools/factor_activity.py watches exactly the registered set — one list, not two", () => {
    const m = /^FACTORS = \[(.*?)\]/ms.exec(FACTOR_TOOL);
    expect(m, "FACTORS list not found in tools/factor_activity.py").toBeTruthy();
    const watched = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
    expect(
      watched,
      "the drift check and the registry disagree — a factor classified here but unwatched there " +
        "is exactly the gap shPriorKf sat in",
    ).toEqual(Object.keys(REGISTRY).sort());
  });

  it("STRUCTURAL is reserved: nothing claims it on the strength of one reading", () => {
    // shUmpKf was briefly mis-filed STRUCTURAL off a single artifact. Nothing may hold that
    // classification unless the reason names an arithmetic bound.
    for (const [name, r] of Object.entries(REGISTRY)) {
      if (r.kind !== "STRUCTURAL") continue;
      expect(/bound|arithmetic|cannot reach|impossible/i.test(r.why),
        `${name} is STRUCTURAL but the reason names no derived bound`).toBe(true);
    }
  });
});
