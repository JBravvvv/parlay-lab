import { parkDailyForGame } from "@/lib/mlb/ballpark";

/**
 * ENV→CLOSED-FORM ARMING (2026-08-27, Josh's word, verbatim: "Make sure the engine is
 * taking into account daily ballpark factor and weather. For example, 10mph in from CF
 * @ Wrigley Field there probably wont be any HRs hit. Sunny day @ Great American, Coors,
 * Nationals Park, Chase Field, Toronto, Globe Life or Athletics Ballpark in Sacramento
 * then the ball will probably fly and odds for HR, H+R+RBI, Hits, Total Bases, RBI, Runs
 * Scored etc most likely go up while theoretical odds a pitcher goes over K's/outs goes
 * down if hitters are doing better. Wind blowing out to favor hitters etc.")
 *
 * What was already live: wind (>=10mph out/in = ±10% on HR), temperature (+0.8%/°F over
 * 70), and Savant park×handedness — but the park factors reached ONLY the sim path
 * (~16% of batter rows), while the closed form (84% of batter rows, 100% of pitcher
 * rows) carried a Coors-only flag and pitcher K's/outs had no venue/weather term at all
 * (the recorded M1/M3 freeze-exit findings, docs/hrr-recalibration.md).
 *
 * SH_CFG.envCf arms the engine's closed-form routing: park×handedness replaces the
 * Coors flags (double-counting rule honored), H+R+RBI λ gets the recorded mass-weighted
 * blend (0.74·hF + 0.26·tbF), pitcher K's get the venue K index, and K's/outs get a
 * small hitter-weather trim. Absent flag = byte-identical legacy behavior — fixtures
 * and baselines stay dormant (the cfSel / suspension-lift precedent).
 */
export function applyEnvClosedForm(cfg: Record<string, unknown> | null | undefined): void {
  if (!cfg) return;
  cfg.envCf = true;
}

/**
 * DAILY BALLPARK FACTOR (INSTRUCTION 68, 2026-09-17, Josh's word, verbatim: "The engine should
 * obviously know but it should take into account temperature, elevation, wind mph, wind
 * in/out/left/right, etc"). Two halves, both required — the hook alone (unarmed) is inert and
 * the flag alone (no hook bound) falls through to the legacy rule, so a generator that forgets
 * either one prices the old way, never a half-armed way:
 *   - `bindParkDaily(eng)` binds the blob's `shParkDaily` var to `parkDailyForGame`
 *     (src/lib/mlb/ballpark.ts): temp x wind mph x direction x elevation, continuous;
 *   - `applyParkDaily(cfg)` arms SH_CFG.parkDaily so `windNote` consults it.
 * Absent both = byte-identical legacy behaviour (the envCf precedent; fixtures stay dormant).
 */
export function applyParkDaily(cfg: Record<string, unknown> | null | undefined): void {
  if (!cfg) return;
  cfg.parkDaily = true;
}

export function bindParkDaily(eng: { set: (name: string, value: unknown) => void }): void {
  eng.set("shParkDaily", parkDailyForGame);
}

/**
 * PARLAY VARIETY (INSTRUCTION 71, 2026-09-17, Josh's word, verbatim: "Some of the parlays showing
 * up on 'Board' under generated parlays have 3 picks from the same game (ie: royals vs astros; 2
 * astros to hit HR & 1 royal to hit HR on 4 leg parlay w/ 1 Tiger to hit HR). Two picks from same
 * game is fine if its needed because there aren't a ton of games or the picks are very high %/edge
 * but 3 should be avoided. […] There needs to be as many parlays generated on the bottom of the
 * board page as possible for variety").
 *
 * Three blob knobs, all read off SH_CFG inside buildParlaySet, all dormant when absent (fixtures
 * never set them, so every pinned baseline is byte-identical):
 *   parlayGameCap  — at most this many legs from one game on any auto-built ticket, HR included
 *                    (the legacy rule let HR stack a whole game). 2 = Josh's rule.
 *   parlayMore     — the per-category leg-count pattern lists and the mixed pattern list repeat
 *                    this many extra times: 2 → three times the tickets the legacy plan built.
 *   parlayCap      — how many tickets one player may ride per set (legacy 3): raised with the plan
 *                    so the extra patterns can actually fill instead of returning null.
 */
export const PARLAY_VARIETY = { parlayGameCap: 2, parlayMore: 2, parlayCap: 5 } as const;
export function applyParlayVariety(cfg: Record<string, unknown> | null | undefined): void {
  if (!cfg) return;
  cfg.parlayGameCap = PARLAY_VARIETY.parlayGameCap;
  cfg.parlayMore = PARLAY_VARIETY.parlayMore;
  cfg.parlayCap = PARLAY_VARIETY.parlayCap;
}
