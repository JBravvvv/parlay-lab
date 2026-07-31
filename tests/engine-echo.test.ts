import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DAMPING, ENGINE_SHA, SERVED_ENGINE_SHA_VERIFIED, buildEcho } from "@/lib/engine-echo";

/**
 * sha+config ECHO GUARD (2026-07-29; REFORMULATED 2026-07-30 on the owner's
 * authorization — "seven pending items each needing a permanent-by-default exception
 * is not a guard").
 *
 * THE DEFECT IN THE OLD FORM: one blocking assertion compared the RUNTIME engine hash
 * against a hand-updated SERVED-chunk constant. The served artifact cannot carry a new
 * engine string until a deploy, and a deploy needs a green build — so NO engine change
 * could ever pass without an exception. Six queued engine items (A1, coreEvMin, the 1/n
 * cap, damping, SH_W, the ungraded-group fix) plus the outs flag would each have needed
 * one. An invariant with a standing exception is a written rule, not an encoded one.
 *
 * THE SPLIT:
 * 1. BLOCKING — runtime vs COMMITTED SOURCE: the engine string imported at runtime
 *    (`LEGACY_SRC` → ENGINE_SHA) must equal a FRESH extraction from legacy/index.html
 *    using the extractor's own rule (largest <script> block). Both artifacts exist
 *    pre-deploy, so an engine ship regenerates and stays green IN THE SAME COMMIT — no
 *    exception, ever. This catches the real historical failure: legacy/index.html edited
 *    without re-running tools/extract-engine.mjs, i.e. the repo shipping a stale engine.
 * 2. NON-BLOCKING — served vs committed: REPORTED, never gating (console + the board's
 *    own echo, which carries engineSha on every response — the daily-visible surface).
 * 3. RESOLUTION GUARD — tests/served-verification.json carries {pending, since}. A ship
 *    sets pending:true; the post-deploy re-grep clears it and updates
 *    SERVED_ENGINE_SHA_VERIFIED. If a pending marker outlives its deploy by more than
 *    MAX_PENDING_H, THE BUILD FAILS — the exception cannot become permanent by default.
 *    OBSERVED RED 2026-07-30 with a planted 48h-old pending marker, before the flip.
 *
 * WHAT THE SPLIT STOPS CATCHING (one line, also in docs/collection-period.md): a failed
 * or partial deploy, a rollback, or a stale edge chunk now REPORTS instead of blocking —
 * covered by the echo's engineSha on every generated board (read at the chain's echo
 * step, reading 25) and by the STEP-0 re-grep ritual on ship days.
 *
 * 4. WRITE-ONLY: the route's `echo` is attached and returned, never read — enforced
 *    here by a source scan (exactly ONE `.echo` assignment, zero `.echo` reads,
 *    anywhere in src/ + app/). An instrument that can alter behavior is not an
 *    instrument.
 * 5. DAMPING is EXTRACTED from the live allocator source, not copied — if the
 *    expression moves, DAMPING goes null and this goes red rather than echoing a
 *    stale number.
 */

const MAX_PENDING_H = 24;

/** The extractor's own rule (tools/extract-engine.mjs): the largest <script> block. */
function extractFromHtml(): string {
  const html = readFileSync("legacy/index.html", "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  expect(scripts.length, "no <script> blocks in legacy/index.html").toBeGreaterThan(0);
  const src = scripts.sort((a, b) => b.length - a.length)[0];
  expect(src.length, `script suspiciously small: ${src.length} bytes`).toBeGreaterThan(100_000);
  return src;
}

describe("sha+config echo", () => {
  it("BLOCKING: the runtime engine string equals a fresh extraction from legacy/index.html", () => {
    const fresh = createHash("sha256").update(extractFromHtml(), "utf8").digest("hex");
    expect(ENGINE_SHA).toMatch(/^[0-9a-f]{64}$/);
    expect(
      ENGINE_SHA,
      "legacy/index.html and src/engine/legacy-src.gen.ts disagree — run `node tools/extract-engine.mjs` " +
        "and commit the regenerated artifact IN THIS COMMIT (the repo would otherwise ship a stale engine)",
    ).toBe(fresh);
  });

  it("PLANT (invalid-by-value): a one-character engine edit is detected", () => {
    const mutated = createHash("sha256").update(extractFromHtml() + " ", "utf8").digest("hex");
    expect(mutated === ENGINE_SHA, "the checker passed a string that cannot match").toBe(false);
  });

  it("REPORT (non-blocking): served-vs-committed drift is printed, never gated", () => {
    const match = ENGINE_SHA === SERVED_ENGINE_SHA_VERIFIED;
    const v = JSON.parse(readFileSync("tests/served-verification.json", "utf8")) as {
      pending: boolean;
      since: string;
    };
    console.log(
      `SERVED-CHECK: committed=${ENGINE_SHA.slice(0, 12)} servedVerified=${SERVED_ENGINE_SHA_VERIFIED.slice(0, 12)} ` +
        `match=${match} pending=${v.pending} since=${v.since}` +
        (match ? "" : " — DRIFT: re-grep the served chunk, or a ship is mid-flight (see the pending marker)"),
    );
    expect(SERVED_ENGINE_SHA_VERIFIED).toMatch(/^[0-9a-f]{64}$/);
  });

  it("RESOLUTION GUARD: a PENDING-LIVE-VERIFICATION marker may not outlive its deploy", () => {
    const v = JSON.parse(readFileSync("tests/served-verification.json", "utf8")) as {
      pending: boolean;
      since: string;
    };
    if (!v.pending) {
      // not mid-ship: the committed and served hashes must agree, or nobody is tracking the drift
      expect(
        ENGINE_SHA,
        "committed engine differs from the last verified served hash with NO pending marker — " +
          "either set pending:true in tests/served-verification.json (a ship is mid-flight) or re-grep the served chunk",
      ).toBe(SERVED_ENGINE_SHA_VERIFIED);
      return;
    }
    const ageH = (Date.now() - Date.parse(v.since)) / 3_600_000;
    expect(Number.isFinite(ageH), `unparseable "since" in served-verification.json: ${v.since}`).toBe(true);
    expect(
      ageH,
      `PENDING-LIVE-VERIFICATION has been open ${ageH.toFixed(1)}h (limit ${MAX_PENDING_H}h) — ` +
        "run the served-chunk re-grep, update SERVED_ENGINE_SHA_VERIFIED, and clear the marker",
    ).toBeLessThanOrEqual(MAX_PENDING_H);
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
      "kellyStakeMult", "dailyBankrollCap", "selMode", "outsSusp", "mktN", "damping", "cfSelEnabled"]) {
      expect(k in e, `echo field missing: ${k}`).toBe(true);
    }
    expect(() => JSON.stringify(e)).not.toThrow();
    // absent config key echoes null, never undefined (undefined would vanish in JSON)
    expect(e.outsSusp).toBeNull();
    // mktN rides through verbatim when present (the route sets cfg.mktN from the
    // calibration store) — this is the reopen clock's only on-board witness
    const withN = buildEcho(
      { selMode: "ev_gated", mktN: { batter_hits: 117, pitcher_strikeouts: 62 } },
      { priorsSha: null, ctxSha: null, cfSelEnabled: false },
    );
    expect(withN.mktN).toEqual({ batter_hits: 117, pitcher_strikeouts: 62 });
  });
});
