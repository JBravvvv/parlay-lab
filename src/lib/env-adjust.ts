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
