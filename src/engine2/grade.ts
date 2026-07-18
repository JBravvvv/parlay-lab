/**
 * Server-side prediction grading — a faithful port of the engine's shGradeLeg
 * (legacy/index.html) for the calibration module's cron. Same Caesars void
 * rules, same stat math, same push handling; operates on statsapi boxscore +
 * linescore JSON. Pure functions, no fetch — the route feeds it data.
 */

export type GradeResult = {
  result: "won" | "lost" | "push" | "void" | "pending" | "ungradable";
  detail: string;
};

export type GameStatus = { state: string; away: number | null; home: number | null };

/* identical to the engine's pnorm — names must match across both graders */
export function pnorm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

type BoxPlayer = {
  person?: { fullName?: string };
  battingOrder?: string | number;
  gameStatus?: { isSubstitute?: boolean };
  stats?: {
    batting?: Record<string, unknown>;
    pitching?: Record<string, unknown>;
  };
};
export type Boxscore = { teams?: Record<string, { players?: Record<string, BoxPlayer> }> };

const num = (v: unknown): number => Number(v) || 0;

export function findBoxPlayer(bx: Boxscore, normName: string): BoxPlayer | null {
  for (const side of ["away", "home"] as const) {
    const players = bx.teams?.[side]?.players ?? {};
    for (const k of Object.keys(players)) {
      if (pnorm(players[k].person?.fullName ?? "") === normName) return players[k];
    }
  }
  return null;
}

/** Starter check + actual batting order (100-based → 1-9), for lineup reconciliation. */
export function starterInfo(bx: Boxscore, normName: string): { started: boolean; order: number | null } {
  const pl = findBoxPlayer(bx, normName);
  if (!pl) return { started: false, order: null };
  const bo = String(pl.battingOrder ?? "");
  const isSub = !!pl.gameStatus?.isSubstitute;
  const started = !!bo && Number(bo) % 100 === 0 && !isSub;
  return { started, order: started ? Number(bo) / 100 : null };
}

/**
 * Grade one prediction. `lkey` is the engine's leg key
 * (`ml_home` / `rl_away` / `${pnorm(name)}|market|line`), `sub` the display
 * line (side is read from " O " / " U ", run-line point from "RL +1.5").
 */
export function gradePrediction(
  lkey: string,
  sub: string,
  status: GameStatus | null,
  box: Boxscore | null,
): GradeResult {
  if (!status) return { result: "pending", detail: "" };
  if (/postpon|suspend|cancel|forfeit/i.test(status.state))
    return { result: "void", detail: status.state.toLowerCase() };
  if (!/final|game over|completed/i.test(status.state)) return { result: "pending", detail: "" };

  if (lkey === "ml_home" || lkey === "ml_away" || lkey === "rl_home" || lkey === "rl_away") {
    const hR = status.home;
    const aR = status.away;
    if (hR == null || aR == null) return { result: "ungradable", detail: "no final score" };
    const sc = `${aR}-${hR}`;
    if (lkey === "ml_home") return { result: hR > aR ? "won" : "lost", detail: sc };
    if (lkey === "ml_away") return { result: aR > hR ? "won" : "lost", detail: sc };
    const mPt = sub.match(/RL ([+-][\d.]+)/);
    const pt = mPt ? Number(mPt[1]) : null;
    if (pt == null) return { result: "ungradable", detail: "no run-line point" };
    const margin = lkey === "rl_home" ? hR - aR : aR - hR;
    return { result: margin + pt > 0 ? "won" : "lost", detail: sc };
  }

  const parts = lkey.split("|");
  if (parts.length !== 3) return { result: "ungradable", detail: "unrecognized leg" };
  const [pn, mkt, lnRaw] = parts;
  const ln = Number(lnRaw);
  const side = / U /.test(sub) ? "U" : "O";
  if (!box) return { result: "pending", detail: "boxscore unavailable" };
  const pl = findBoxPlayer(box, pn);
  const isPitcher = mkt === "pitcher_strikeouts" || mkt === "pitcher_outs";
  if (!pl) return { result: "void", detail: isPitcher ? "did not pitch" : "not in starting lineup" };

  if (isPitcher) {
    const pit = pl.stats?.pitching ?? {};
    if (!num(pit.gamesStarted)) return { result: "void", detail: "did not start" };
    const pv = mkt === "pitcher_strikeouts" ? Number(pit.strikeOuts) : Number(pit.outs);
    if (!isFinite(pv)) return { result: "ungradable", detail: "stat missing" };
    const unit = mkt === "pitcher_strikeouts" ? " K" : " outs";
    if (pv === ln) return { result: "push", detail: pv + unit };
    return { result: (side === "O" ? pv > ln : pv < ln) ? "won" : "lost", detail: pv + unit };
  }

  const bo = String(pl.battingOrder ?? "");
  const isSub = !!pl.gameStatus?.isSubstitute;
  if (!bo || Number(bo) % 100 !== 0 || isSub) return { result: "void", detail: "not in starting lineup" };
  const bat = pl.stats?.batting ?? {};
  const H = num(bat.hits);
  const R = num(bat.runs);
  const BI = num(bat.rbi);
  const HR = num(bat.homeRuns);
  const D2 = num(bat.doubles);
  const T3 = num(bat.triples);
  let val: number;
  let unit: string;
  if (mkt === "batter_hits") {
    val = H;
    unit = " H";
  } else if (mkt === "batter_total_bases") {
    val = H + D2 + 2 * T3 + 3 * HR;
    unit = " TB";
  } else if (mkt === "batter_home_runs") {
    val = HR;
    unit = " HR";
  } else if (mkt === "batter_hits_runs_rbis") {
    val = H + R + BI;
    unit = " H+R+RBI";
  } else return { result: "ungradable", detail: "unknown market" };
  if (val === ln) return { result: "push", detail: val + unit };
  return { result: (side === "O" ? val > ln : val < ln) ? "won" : "lost", detail: val + unit };
}
