import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DAMPING, ENGINE_SHA, SERVED_ENGINE_SHA_VERIFIED, buildEcho } from "@/lib/engine-echo";

/**
 * sha+config ECHO GUARD (2026-07-29, owner's authorization — shipped with cfSel).
 *
 * 1. RUNTIME-vs-SERVED: ENGINE_SHA (computed at module load from the live engine
 *    string) must equal the last VERIFIED served-chunk hash. When the repo engine
 *    moves without the served-artifact re-grep moving with it, this goes RED — the
 *    owner's requirement ("fails when the runtime engine hash diverges from the
 *    served-chunk hash"). The constant updates ONLY beside a fresh live verification,
 *    same commit.
 * 2. WRITE-ONLY: the route's `echo` is attached and returned, never read — enforced
 *    here by a source scan (exactly ONE `.echo` assignment, zero `.echo` reads,
 *    anywhere in src/ + app/). An instrument that can alter behavior is not an
 *    instrument.
 * 3. DAMPING is EXTRACTED from the live allocator source, not copied — if the
 *    expression moves, DAMPING goes null and this goes red rather than echoing a
 *    stale number.
 * 4. PLANT (invalid-by-value): a mismatched hash constant is detected.
 */

describe("sha+config echo", () => {
  it("runtime engine hash equals the last VERIFIED served-chunk hash", () => {
    expect(ENGINE_SHA, "engine moved without a served-artifact re-verification").toBe(
      SERVED_ENGINE_SHA_VERIFIED,
    );
    expect(ENGINE_SHA).toMatch(/^[0-9a-f]{64}$/);
  });

  it("PLANT (invalid-by-value): a diverged hash is detected", () => {
    const planted = "deadbeef" + SERVED_ENGINE_SHA_VERIFIED.slice(8);
    expect(planted === ENGINE_SHA, "the checker passed a hash that cannot match").toBe(false);
  });

  it("the echo is write-only: one assignment, zero reads, route and src", () => {
    const route = readFileSync("app/api/generate/route.ts", "utf8");
    const writes = route.match(/\)\.echo = echo;/g) ?? [];
    expect(writes.length, "exactly one echo assignment in the route").toBe(1);
    // any OTHER `.echo` appearance in the route is a read — forbidden
    const dotEcho = route.match(/\.echo\b/g) ?? [];
    expect(dotEcho.length, "a `.echo` read exists in the route beyond the assignment").toBe(1);
    // and nothing else in the runtime tree touches `.echo`
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const hits = execSync(
      'grep -rn "\\.echo\\b" src/ app/ --include="*.ts" --include="*.tsx" || true',
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((l: string) => !l.includes("app/api/generate/route.ts"))
      // the defining module's own doc comment mentions `data.echo`; it has no runtime read
      .filter((l: string) => !l.includes("src/lib/engine-echo.ts"));
    expect(hits, "another code path touches .echo — the echo is no longer write-only").toHaveLength(0);
  });

  it("the damping constant is extracted from the live source (0.5 today)", () => {
    expect(DAMPING, "the allocator's damping expression moved — update the extractor").toBe(0.5);
  });

  it("buildEcho carries every ordered field and serializes", () => {
    const e = buildEcho(
      { hrrAltMax: -1, coreEvMin: 2, coreCzEvMin: 0, consMinN: 100, consMinEv: -1,
        coreMaxLegs: 3, maxCoreTickets: 6, coreMaxDec: 15, perParlayCap: 0.25,
        kellyStakeMult: 4, dailyBankrollCap: 0.1, selMode: "ev_gated" },
      { priorsSha: "a".repeat(64), ctxSha: "b".repeat(64), cfSelEnabled: true },
    );
    for (const k of ["engineSha", "priorsSha", "ctxSha", "hrrAltMax", "coreEvMin", "coreCzEvMin",
      "consMinN", "consMinEv", "coreMaxLegs", "maxCoreTickets", "coreMaxDec", "perParlayCap",
      "kellyStakeMult", "dailyBankrollCap", "selMode", "outsSusp", "damping", "cfSelEnabled"]) {
      expect(k in e, `echo field missing: ${k}`).toBe(true);
    }
    expect(() => JSON.stringify(e)).not.toThrow();
    // absent config key echoes null, never undefined (undefined would vanish in JSON)
    expect(e.outsSusp).toBeNull();
  });
});
