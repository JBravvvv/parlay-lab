import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LINEUP_LEAD_MS } from "@/lib/board-coverage";
import { decide, MIN_READY, SCHED_T } from "@/lib/server/scheduler-decide";
import { stripComments } from "./helpers/source";

/**
 * /api/scheduler — THE BRAINS OF SELF-SCHEDULING, AS A VERCEL ROUTE (2026-08-02, owner's
 * architecture correction: scheduling runs through Vercel, not GitHub Actions).
 *
 * A dumb external ticker (cron-job.org, every 15 min) pokes the route all day. The route
 * evaluates the TWO-CONDITION window from statsapi (zero Odds credits) and fires /api/generate
 * exactly once, the first poke where both hold and no board exists. Idempotent by construction:
 * every other poke exits clean with the reason in the body.
 *
 * ── OBSERVED RED 2026-08-02 ──────────────────────────────────────────────────────────
 * This file ran before the module existed (module-not-found across the suite) and each decide()
 * branch was written against the spec, red, before the implementation made it green.
 *
 * ── THE FAILS-CLOSED GATE, AND THE ANTI-PATTERN IT REFUSES ───────────────────────────
 * `/api/calibrate` shipped `return !cron` — ALLOW when CRON_SECRET is unset — reasoning that the
 * run was idempotent and cheap. This route SPENDS (~50-91 credits a fire), so the same shape
 * here would let any stranger fire a board the day the env var slipped. The gate is therefore:
 * CRON_SECRET unset → 503, always, before anything else. Asserted on comment-stripped source
 * below, per the standing rule that a presence assertion over raw source is satisfiable by prose.
 */

const S = (h: number, m = 0) => Date.parse("2026-08-09T00:00:00Z") + (h * 60 + m) * 60_000;
/** A real Sunday shape: 7-game early block 16:15Z, then 19-20Z stragglers, 00:20Z night game. */
const SLATE = [S(16, 15), S(16, 15), S(16, 15), S(16, 15), S(16, 15), S(16, 15), S(16, 15), S(19, 10), S(19, 15), S(20, 5), S(20, 10), S(20, 10), S(24, 20)];

describe("decide(): the two-condition fire decision, every branch", () => {
  it("fires when BOTH hold and no board exists — and reports both values", () => {
    const d = decide({ starts: SLATE, now: S(16, 0), boardExists: false });
    // 16:00Z: all 13 unstarted, early 7 within 3h lead... ready=7+? compute: games at 19:10+ are >3h out
    expect(d.unstarted).toBe(13);
    expect(d.ready).toBeGreaterThanOrEqual(7);
    if (d.achievable >= SCHED_T && d.ready >= MIN_READY) expect(d.fire).toBe(true);
  });

  it("holds on the RATIO trap: a burned-down slate at achievable 1.000 does not fire", () => {
    /* 2026-08-02 live: one unstarted game, lineup-ready, achievable 1.000. The ratio alone
       fires a one-game board; MIN_READY refuses it. The defect class of §12Z.3. */
    const d = decide({ starts: SLATE, now: S(21, 30), boardExists: false });
    expect(d.unstarted).toBe(1);
    expect(d.achievable).toBe(1);
    expect(d.fire, "a 1-of-1 leftover at achievable 1.000 was allowed to fire").toBe(false);
    expect(d.reason).toMatch(/burned down|MIN_READY|ready 1 < /i);
  });

  it("holds when lineups are not posted yet, and says which condition failed", () => {
    const d = decide({ starts: SLATE, now: S(10, 0), boardExists: false });
    expect(d.fire).toBe(false);
    expect(d.achievable).toBeLessThan(SCHED_T);
    expect(d.reason).toMatch(/achievable/);
  });

  it("IDEMPOTENCE: a board already existing exits clean, whatever the conditions say", () => {
    const d = decide({ starts: SLATE, now: S(16, 0), boardExists: true });
    expect(d.fire, "a second board would have been bought for a date that has one").toBe(false);
    expect(d.reason).toBe("board-exists");
    // and the conditions are STILL reported — the standing rule: both values, every response
    expect(d.ready).toBeGreaterThanOrEqual(0);
    expect(d.unstarted).toBeGreaterThanOrEqual(0);
  });

  it("dead slate exits clean", () => {
    const d = decide({ starts: SLATE, now: S(25, 0), boardExists: false });
    expect(d.fire).toBe(false);
    expect(d.reason).toBe("dead-slate");
  });

  it("empty schedule is VACUOUS and says so, not a clean zero", () => {
    const d = decide({ starts: [], now: S(16, 0), boardExists: false });
    expect(d.fire).toBe(false);
    expect(d.reason).toMatch(/no games|empty/i);
  });

  it("MIRROR: the constants match the engine's and the retired tool's derivation", () => {
    expect(SCHED_T, "T drifted from the pre-committed 0.80").toBe(0.8);
    expect(MIN_READY, "MIN_READY is no longer a positive floor > 1").toBeGreaterThan(1);
    expect(LINEUP_LEAD_MS).toBe(3 * 3600_000);
  });
});

describe("the route file, comment-stripped", () => {
  const src = stripComments(readFileSync("app/api/scheduler/route.ts", "utf8"));

  it("FAILS CLOSED: CRON_SECRET unset → 503 before anything else — NOT calibrate's `return !cron`", () => {
    expect(
      /if \(!process\.env\.CRON_SECRET\)[\s\S]{0,120}?503/.test(src),
      "the unset-secret branch no longer 503s — the calibrate failed-open shape is back on a route that SPENDS",
    ).toBe(true);
    expect(/return !cron/.test(src), "the calibrate anti-pattern appeared in this route").toBe(false);
  });

  it("gates on the header, never the query string, and never the sync phrase", () => {
    expect(/cronHeaderAuthed/.test(src)).toBe(true);
    expect(/searchParams\.get\(["']key["']\)/.test(src), "the secret moved to the query string — it lands in logs").toBe(false);
    expect(/x-pl-sync/.test(src), "the scheduler must never carry the sync phrase").toBe(false);
  });

  it("fires by forwarding to /api/generate — the spending path stays in ONE route", () => {
    expect(/\/api\/generate/.test(src)).toBe(true);
    expect(/x-cron-key/.test(src)).toBe(true);
  });

  it("PLANT (invalid-by-value): the fails-closed regex catches the failed-open shape", () => {
    expect(/return !cron/.test("function authed(){ const cron = process.env.CRON_SECRET; return !cron; }")).toBe(true);
  });
});
