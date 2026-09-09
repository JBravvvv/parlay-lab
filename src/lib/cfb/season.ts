import { americanFromProb, decFromAmerican } from "@/engine2/devig";
import { coverProb, evPct, kellyStake } from "@/lib/cfb/model";
import { normCdf } from "@/lib/cfb/normal";
import { playerSlug } from "@/lib/cfb/props";
import type { CfbPropsContext, CfbSeasonLine } from "@/lib/cfb/props-context";
import { CFB_MODEL } from "@/lib/cfb/rules";

/**
 * THE SEASON-LONG MODEL (INSTRUCTION 46, 2026-09-08, Josh's word, verbatim: "Should be evaluating
 * season long props and season long prop parlays so I can mess around and have fun with a bunch
 * of season long tickets; win totals, receiving yards overs, Pass Yards/TDs overs, rushing yards
 * overs, rush/receiving TDs overs etc").
 *
 * WHAT THIS FILE IS: pure functions from ESPN season tables + the FPI feed to a projected season
 * total, a fair probability for a TYPED line, EV / ¼-Kelly at a TYPED price, a season parlay, and
 * the pace of a locked leg against the latest projection. No fetch, no clock, no storage — the
 * route (app/api/cfb/season/route.ts) fetches, the store (./season-store.ts) remembers.
 *
 * WHY THE LINE IS TYPED (verified by the lead 2026-09-08 against The Odds API market docs): NCAAF
 * carries game markets and PER-GAME player props only — NO season-long player props and NO team
 * win totals exist on the feed, and the repo never calls the Odds API for anything new anyway.
 * So the book's season line and price come from Josh's thumbs; the desk supplies the fair side.
 *
 * THE PLAYER MODEL, in order:
 *   1. per-game rate      = season total ÷ games played (ESPN's own numbers, ./props-context).
 *   2. shrink             = a rate on fewer than CFB_SEASON.shrinkGames games is a small sample, so
 *                           it is credibility-weighted toward a POSITIONAL PRIOR: w = g / shrinkGames,
 *                           rateUsed = w·rate + (1 − w)·prior. At g ≥ 4 the observed rate stands
 *                           alone (w = 1). The priors (CFB_SEASON.prior) are MODEL CONSTANTS for a
 *                           top-250 FBS starter — they are stated, not fetched, and they only touch
 *                           a projection on 1–3 games.
 *   3. remaining games    = CFB_SEASON.regularSeasonGames − games played (12-game regular season;
 *                           Hawaii's 13th game and a conference title game are NOT counted — a book's
 *                           regular-season prop is settled the same way), clamped at 0. A schedule
 *                           feed is not read (see the route), so this is the live path.
 *   4. projected total    = current + rateUsed × remaining. This is the model's FAIR LINE (the median
 *                           of a symmetric normal).
 *   5. the remainder's distribution is Normal with σ = perGameSd × √remaining, where perGameSd =
 *                           CFB_SEASON.cv[stat] × rateUsed — the per-game coefficient of variation is
 *                           the stated prior by stat: 0.35 for pass yards (a starter's box score is
 *                           steady), 0.50 rush yards, 0.55 rec yards, 0.45 receptions, and wider for
 *                           the count stats (0.60 pass TDs, 0.90 rush TDs, 1.00 rec TDs — a TD line is
 *                           lumpy). The √remaining is the independent-games assumption.
 *   6. P(over line)       = the normal tail through `coverProb` (src/lib/cfb/model.ts — the SAME
 *                           helper the game-total rows price with, integer lines get its push mass).
 *   7. EV% and ¼-Kelly    = `evPct` / `kellyStake` from model.ts at the typed American price; the
 *                           Kelly bank is CFB_SEASON.kellyBank (see below), never the daily rails.
 *
 * THE TEAM MODEL (win totals): P(final wins ≥ line) from the team's CURRENT record (the FPI feed's
 * own numwins / numlosses / numties columns) plus one win probability per remaining game from FPI
 * through the same normal margin model the slate uses — p = Φ((FPI_team − FPI_opp) / σ) with
 * CFB_MODEL.sigma (16.5), the way model.ts turns an FPI gap into a win probability. Two paths:
 *   "avg-fpi"  (LIVE) the opponent is the FBS-average team — FPI_opp = the mean FPI of the feed —
 *              for every remaining game, no home-field term (a season is roughly half home, half
 *              away, and the site is unknown without a schedule); remaining wins ~ Binomial.
 *   "schedule" (NOT LIVE — no schedule feed is read) per-opponent FPIs with sites → Poisson-binomial.
 *              `projectWinTotal` accepts `opponents` so a schedule can be wired later without touching
 *              the math; the route never passes one today, and the projection says which path ran.
 *
 * PARLAYS: the joint probability is the INDEPENDENT PRODUCT of the legs' win probabilities (a push
 * counts against the ticket — Josh types half-point lines; see `priceSeasonParlay`). Two legs on the
 * SAME TEAM are correlated (a QB's pass-yard over and his WR's rec-yard over rise and fall together;
 * an over and an under on one team pull apart), and the product is wrong in a direction the desk
 * cannot know without a joint model, so every same-team pair is FLAGGED and the joint probability
 * takes a documented haircut (CFB_SEASON.sameTeamHaircut per pair) as a margin of conservatism —
 * never a refusal, because "mess around and have fun" is the instruction.
 *
 * Nothing here is a prediction, and no number here is a posted price: every figure is either
 * ESPN's own stat / rating, a typed line or price, or arithmetic on those.
 */

export const CFB_SEASON = {
  season: 2026,
  /** the FBS regular season — the denominator a book's season prop settles on */
  regularSeasonGames: 12,
  /** below this many games the per-game rate is credibility-weighted toward the positional prior */
  shrinkGames: 4,
  /** per-game coefficient of variation (σ ÷ mean) by stat — the stated priors, see the header */
  cv: { pass_yds: 0.35, pass_tds: 0.6, rush_yds: 0.5, rush_tds: 0.9, rec_yds: 0.55, rec_tds: 1.0, receptions: 0.45 },
  /** positional prior per-game rates for a top-250 FBS starter — MODEL CONSTANTS, only felt at g < 4 */
  prior: { pass_yds: 230, pass_tds: 1.6, rush_yds: 70, rush_tds: 0.6, rec_yds: 55, rec_tds: 0.4, receptions: 4 },
  /** joint-probability haircut per same-team pair on a season parlay */
  sameTeamHaircut: 0.9,
  /**
   * the bank ¼-Kelly is sized against: ten fun-money days ($25 × 10). Season tickets are fun-money
   * tickets held for months, so the daily $150 / $25 rails are not touched — this is a display
   * figure for the chip, and the stake Josh types is his own call (capped at ticketMax).
   */
  kellyBank: 250,
  /** the ticket's default and cap — the $25 fun-money spirit */
  ticketDefault: 5,
  ticketMax: 25,
  /** the book a typed line is assumed to come from unless Josh says otherwise */
  defaultBook: "Caesars",
} as const;

export type SeasonStat = keyof typeof CFB_SEASON.cv;
export type SeasonSide = "over" | "under";

/** the numeric total columns of the props context (props-context.ts also carries identity strings — headshot, teamId — which are not stats) */
type SeasonLineField = "passYds" | "passTds" | "rushYds" | "rushTds" | "rec" | "recYds" | "recTds";
export const SEASON_STATS: readonly { id: SeasonStat; label: string; short: string; field: SeasonLineField }[] = [
  { id: "pass_yds", label: "Pass Yds", short: "PaYd", field: "passYds" },
  { id: "pass_tds", label: "Pass TDs", short: "PaTD", field: "passTds" },
  { id: "rush_yds", label: "Rush Yds", short: "RuYd", field: "rushYds" },
  { id: "rush_tds", label: "Rush TDs", short: "RuTD", field: "rushTds" },
  { id: "rec_yds", label: "Rec Yds", short: "ReYd", field: "recYds" },
  { id: "rec_tds", label: "Rec TDs", short: "ReTD", field: "recTds" },
  { id: "receptions", label: "Receptions", short: "Rec", field: "rec" },
] as const;

export const seasonStatLabel = (stat: SeasonStat): string => SEASON_STATS.find((s) => s.id === stat)?.label ?? stat;

/* ---------- feed shapes (what the route publishes) ---------- */

/** one player, joined from the three ESPN byathlete tables: stats are ESPN's own totals or null */
export type SeasonPlayer = {
  slug: string;
  name: string;
  /** ESPN team id / display name / abbreviation / position — null when the table did not carry it */
  teamId: string | null;
  team: string | null;
  teamAbbr: string | null;
  pos: string | null;
  g: number;
  stats: Partial<Record<SeasonStat, number>>;
};

/** one FBS team from the FPI feed: rating, rank, ESPN's own record columns and ESPN's own projected record */
export type SeasonTeam = {
  id: string;
  name: string;
  abbr: string;
  fpi: number | null;
  fpiRank: number | null;
  wins: number;
  losses: number;
  ties: number;
  /** ESPN's own projected wins / losses (the `projectedw` / `projectedl` columns) — printed as ESPN's, never as ours */
  espnProjW: number | null;
  espnProjL: number | null;
};

export type SeasonFeed = {
  season: number;
  generatedAt: string;
  players: SeasonPlayer[];
  teams: SeasonTeam[];
  /** mean FPI across the feed — the "average opponent" of the avg-fpi path */
  avgFpi: number | null;
  fpiUpdated: string | null;
};

/* ---------- parsing (pure; the route feeds it raw JSON) ---------- */

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Rec) : null);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const num = (x: unknown): number | null => {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string" && x.trim()) {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }
  return null;
};
const idOf = (x: unknown): string | null => str(x) ?? (num(x) != null ? String(num(x)) : null);

export type SeasonPlayerMeta = { name: string; teamId: string | null; team: string | null; teamAbbr: string | null; pos: string | null };

/**
 * The half of a byathlete page ./props-context does NOT keep — the player's display name, team
 * and position, keyed by the same `playerSlug`. Best-effort field names (`teamId` / `teamName` /
 * `teamShortName` / `position.abbreviation`, or a nested `team` record); anything absent is null.
 */
export function parseAthleteMeta(json: unknown, into: Map<string, SeasonPlayerMeta> = new Map()): Map<string, SeasonPlayerMeta> {
  const root = rec(json);
  if (!root) return into;
  for (const a of arr(root.athletes)) {
    const ar = rec(a);
    const ath = ar ? rec(ar.athlete) : null;
    const name = ath ? str(ath.displayName) : null;
    if (!ath || !name) continue;
    const team = rec(ath.team);
    const pos = rec(ath.position);
    const meta: SeasonPlayerMeta = {
      name,
      teamId: idOf(ath.teamId) ?? (team ? idOf(team.id) : null),
      team: str(ath.teamName) ?? (team ? (str(team.displayName) ?? str(team.name)) : null),
      teamAbbr: str(ath.teamShortName) ?? (team ? str(team.abbreviation) : null),
      pos: str(ath.position) ?? (pos ? (str(pos.abbreviation) ?? str(pos.name)) : null),
    };
    const slug = playerSlug(name);
    const prev = into.get(slug);
    into.set(slug, prev ? { ...prev, teamId: prev.teamId ?? meta.teamId, team: prev.team ?? meta.team, teamAbbr: prev.teamAbbr ?? meta.teamAbbr, pos: prev.pos ?? meta.pos } : meta);
  }
  return into;
}

/** Join ./props-context's stat lines with the meta above into the feed's player rows (sorted by name). */
export function seasonPlayersOf(ctx: CfbPropsContext | null, meta: Map<string, SeasonPlayerMeta>): SeasonPlayer[] {
  const out: SeasonPlayer[] = [];
  if (!ctx) return out;
  for (const [slug, line] of ctx) {
    const m = meta.get(slug);
    const stats: Partial<Record<SeasonStat, number>> = {};
    for (const s of SEASON_STATS) {
      const v: number | null | undefined = line[s.field];
      if (typeof v === "number" && Number.isFinite(v)) stats[s.id] = v;
    }
    if (Object.keys(stats).length === 0) continue;
    out.push({ slug, name: m?.name ?? slug, teamId: m?.teamId ?? null, team: m?.team ?? null, teamAbbr: m?.teamAbbr ?? null, pos: m?.pos ?? null, g: line.g, stats });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The FPI feed → teams with ESPN's own record and projection columns. The `categories[0].names`
 * row names the columns (fpi, fpirank, projectedw, projectedl, numwins, numlosses, numties, …);
 * nothing is read by fixed index. A team with no record columns reads 0-0 (the pre-season state).
 */
export function parseSeasonTeams(fpi: unknown): { teams: SeasonTeam[]; avgFpi: number | null; updated: string | null } {
  const root = rec(fpi);
  if (!root) return { teams: [], avgFpi: null, updated: null };
  const cols = arr(rec(arr(root.categories).find((c) => rec(c)?.name === "fpi"))?.names).map((n) => (typeof n === "string" ? n : ""));
  const col = (values: unknown[], name: string): number | null => {
    const i = cols.indexOf(name);
    return i < 0 ? null : num(values[i]);
  };
  const teams: SeasonTeam[] = [];
  for (const t of arr(root.teams)) {
    const tr = rec(t);
    const team = rec(tr?.team);
    const id = team ? idOf(team.id) : null;
    const name = team ? (str(team.displayName) ?? str(team.nickname)) : null;
    if (!id || !name) continue;
    const cat = arr(tr?.categories).map(rec).find((c) => c?.name === "fpi");
    const values = arr(cat?.values);
    const rank = col(values, "fpirank");
    teams.push({
      id,
      name,
      abbr: str(team?.abbreviation) ?? name.slice(0, 4).toUpperCase(),
      fpi: col(values, "fpi"),
      fpiRank: rank != null && rank > 0 ? Math.round(rank) : null,
      wins: Math.max(0, Math.round(col(values, "numwins") ?? 0)),
      losses: Math.max(0, Math.round(col(values, "numlosses") ?? 0)),
      ties: Math.max(0, Math.round(col(values, "numties") ?? 0)),
      espnProjW: col(values, "projectedw"),
      espnProjL: col(values, "projectedl"),
    });
  }
  const rated = teams.filter((t) => t.fpi != null) as (SeasonTeam & { fpi: number })[];
  const avgFpi = rated.length ? rated.reduce((s, t) => s + t.fpi, 0) / rated.length : null;
  teams.sort((a, b) => (a.fpiRank ?? 999) - (b.fpiRank ?? 999) || a.name.localeCompare(b.name));
  return { teams, avgFpi, updated: str(root.lastUpdated) };
}

/* ---------- the player projection ---------- */

export type PlayerProjection = {
  kind: "player";
  slug: string;
  name: string;
  team: string | null;
  teamId: string | null;
  stat: SeasonStat;
  statLabel: string;
  /** games played (ESPN) */
  g: number;
  /** the season total so far (ESPN) */
  current: number;
  /** current ÷ g */
  rate: number;
  /** the rate the projection runs on — shrunk toward the prior when g < shrinkGames */
  rateUsed: number;
  shrunk: boolean;
  remaining: number;
  /** current + rateUsed × remaining — the model's fair line (the median) */
  projected: number;
  /** σ of the remainder: cv × rateUsed × √remaining */
  sigma: number;
};

/** Project one stat for one player; null when ESPN holds no total for that stat or no games. */
export function projectPlayerStat(p: SeasonPlayer, stat: SeasonStat, opts: { remaining?: number } = {}): PlayerProjection | null {
  const current = p.stats[stat];
  if (current == null || !(p.g > 0)) return null;
  const rate = current / p.g;
  const w = Math.min(1, p.g / CFB_SEASON.shrinkGames);
  const rateUsed = w * rate + (1 - w) * CFB_SEASON.prior[stat];
  const remaining = Math.max(0, Math.round(opts.remaining ?? CFB_SEASON.regularSeasonGames - p.g));
  const projected = current + rateUsed * remaining;
  const sigma = remaining > 0 ? CFB_SEASON.cv[stat] * rateUsed * Math.sqrt(remaining) : 0;
  return { kind: "player", slug: p.slug, name: p.name, team: p.team, teamId: p.teamId, stat, statLabel: seasonStatLabel(stat), g: p.g, current, rate, rateUsed, shrunk: w < 1, remaining, projected, sigma };
}

/**
 * P(over) / P(under) / P(push) for a season total at a typed line: the normal remainder through
 * model.ts's `coverProb` (over = P(X − line > 0) = coverProb(μ, σ, −line), exactly as the game-total
 * rows; an integer line carries its continuity push). σ = 0 (nothing left to play) is the
 * degenerate case: the current total simply is or is not past the line.
 */
export function statLineProb(proj: Pick<PlayerProjection, "projected" | "sigma">, line: number): { over: number; under: number; push: number } {
  if (!(proj.sigma > 0)) {
    const push = proj.projected === line ? 1 : 0;
    return { over: proj.projected > line ? 1 : 0, under: proj.projected < line ? 1 : 0, push };
  }
  const o = coverProb(proj.projected, proj.sigma, -line);
  const u = coverProb(-proj.projected, proj.sigma, line);
  return { over: o.win, under: u.win, push: o.push };
}

/* ---------- the team win-total projection ---------- */

export type WinTotalProjection = {
  kind: "team";
  teamId: string;
  name: string;
  abbr: string;
  fpi: number | null;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  remaining: number;
  /** which opponent model ran — "avg-fpi" is the live path (see the header) */
  path: "avg-fpi" | "schedule";
  /** the per-remaining-game win probabilities the distribution runs on */
  pGames: number[];
  /** the opponent FPI the avg-fpi path used (null on the schedule path) */
  oppFpi: number | null;
  /** wins + Σ pGames — the model's fair line */
  projected: number;
  /** P(remaining wins = k) for k = 0..remaining (Poisson-binomial) */
  dist: number[];
  espnProjW: number | null;
};

/** P(win one game) from an FPI gap through the slate's normal margin model (CFB_MODEL.sigma), with an optional site term. */
export function fpiWinProb(fpi: number, oppFpi: number, hfa: number = 0): number {
  return normCdf((fpi - oppFpi + hfa) / CFB_MODEL.sigma);
}

/** The distribution of successes over independent trials with probabilities `ps` (Poisson-binomial DP). */
export function poissonBinomial(ps: readonly number[]): number[] {
  let dist = [1];
  for (const p of ps) {
    const next = new Array<number>(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - p);
      next[k + 1] += dist[k] * p;
    }
    dist = next;
  }
  return dist;
}

/**
 * Project a team's final regular-season wins. `opponents` (FPI + site per remaining game) selects
 * the schedule path; without it — the live case — every remaining game is against the feed's
 * average team (`avgFpi`). A team with no FPI cannot be projected (null, never a guess).
 */
export function projectWinTotal(
  team: SeasonTeam,
  avgFpi: number | null,
  opts: { opponents?: { fpi: number; home: boolean | null }[]; regularSeasonGames?: number } = {},
): WinTotalProjection | null {
  if (team.fpi == null) return null;
  const played = team.wins + team.losses + team.ties;
  const games = opts.regularSeasonGames ?? CFB_SEASON.regularSeasonGames;
  let pGames: number[];
  let path: WinTotalProjection["path"];
  let oppFpi: number | null;
  if (opts.opponents && opts.opponents.length > 0) {
    path = "schedule";
    oppFpi = null;
    pGames = opts.opponents.map((o) => fpiWinProb(team.fpi as number, o.fpi, o.home == null ? 0 : o.home ? CFB_MODEL.hfa : -CFB_MODEL.hfa));
  } else {
    if (avgFpi == null) return null;
    path = "avg-fpi";
    oppFpi = avgFpi;
    const remaining = Math.max(0, games - played);
    const p = fpiWinProb(team.fpi, avgFpi);
    pGames = Array.from({ length: remaining }, () => p);
  }
  const dist = poissonBinomial(pGames);
  const projected = team.wins + pGames.reduce((s, p) => s + p, 0);
  return { kind: "team", teamId: team.id, name: team.name, abbr: team.abbr, fpi: team.fpi, wins: team.wins, losses: team.losses, ties: team.ties, played, remaining: pGames.length, path, pGames, oppFpi, projected, dist, espnProjW: team.espnProjW };
}

/** P(final wins > line) / P(< line) / P(= line) from the projection's distribution. Monotone in the line. */
export function winTotalProb(proj: Pick<WinTotalProjection, "wins" | "dist">, line: number): { over: number; under: number; push: number } {
  let over = 0;
  let under = 0;
  let push = 0;
  for (let k = 0; k < proj.dist.length; k++) {
    const total = proj.wins + k;
    if (total > line) over += proj.dist[k];
    else if (total < line) under += proj.dist[k];
    else push += proj.dist[k];
  }
  return { over, under, push };
}

/* ---------- pricing a typed line ---------- */

export type SeasonProjection = PlayerProjection | WinTotalProjection;

export type SeasonLegPrice = {
  side: SeasonSide;
  line: number;
  price: number;
  dec: number;
  /** P(the side wins) — the model's fair, 0..1 */
  prob: number;
  push: number;
  /** the fair American price for that probability */
  fairAm: number;
  evPct: number;
  /** ¼-Kelly whole dollars against CFB_SEASON.kellyBank (0 at no edge) */
  kelly: number;
};

/** A typed American price is usable when it is finite and at least ±100. */
export const validSeasonPrice = (p: number): boolean => Number.isFinite(p) && Math.abs(p) >= 100;

/** Price one side of a projection at a typed line and American price. */
export function priceSeasonLeg(proj: SeasonProjection, side: SeasonSide, line: number, price: number, bankroll: number = CFB_SEASON.kellyBank): SeasonLegPrice | null {
  if (!Number.isFinite(line) || !validSeasonPrice(price)) return null;
  const p = proj.kind === "player" ? statLineProb(proj, line) : winTotalProb(proj, line);
  const prob = side === "over" ? p.over : p.under;
  const dec = decFromAmerican(price);
  const noPush = prob / Math.max(1e-9, 1 - p.push);
  const clamped = Math.min(1 - 1e-6, Math.max(1e-6, noPush));
  return { side, line, price, dec, prob, push: p.push, fairAm: americanFromProb(clamped), evPct: evPct(prob, p.push, dec), kelly: kellyStake(prob, p.push, dec, bankroll) };
}

/** "5 G / 271.4 per G / 12 games / proj 3,257" — the inputs a projection ran on, for the UI and the ledger. */
export function projectionInputs(proj: SeasonProjection): string {
  const n = (v: number, dp = 0) => v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  if (proj.kind === "player") {
    const shrink = proj.shrunk ? ` (shrunk from ${n(proj.rate, 1)})` : "";
    return `${proj.g} G / ${n(proj.rateUsed, 1)} per G${shrink} / ${proj.g + proj.remaining} games / proj ${n(proj.projected, proj.stat.endsWith("tds") || proj.stat === "receptions" ? 1 : 0)}`;
  }
  const opp = proj.path === "avg-fpi" && proj.oppFpi != null ? `FPI ${n(proj.fpi ?? 0, 1)} vs avg ${n(proj.oppFpi, 1)}` : "FPI vs schedule";
  const p = proj.pGames.length ? n((proj.pGames.reduce((s, x) => s + x, 0) / proj.pGames.length) * 100, 0) : "—";
  return `${proj.wins}-${proj.losses}${proj.ties ? `-${proj.ties}` : ""} / ${proj.remaining} left / ${opp} / ${p}% per G / proj ${n(proj.projected, 1)} W`;
}

/* ---------- legs, parlays, tickets ---------- */

export type SeasonLeg = {
  /** "<slug>|<stat>|<side>|<line>" or "team:<id>|wins|<side>|<line>" — one leg per subject+stat on a ticket */
  id: string;
  kind: "player" | "team";
  /** "Ty Simpson Pass Yds O 3,250.5" / "Indiana wins O 8.5" */
  label: string;
  /** "Alabama · QB" / "FPI 21.3 · 2-0" */
  sub: string;
  subject: string;
  teamId: string | null;
  team: string | null;
  stat: SeasonStat | "wins";
  side: SeasonSide;
  line: number;
  price: number;
  dec: number;
  book: string;
  /** the model's fair at lock, 0..1 */
  prob: number;
  push: number;
  evPct: number;
  /** the projection at lock — `projectionInputs` */
  inputs: string;
  /** the projected total at lock */
  projectedAtLock: number;
};

const lineLabel = (line: number) => line.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Build a leg from a projection and its priced side. */
export function makeSeasonLeg(proj: SeasonProjection, priced: SeasonLegPrice, book: string = CFB_SEASON.defaultBook): SeasonLeg {
  const s = priced.side === "over" ? "O" : "U";
  if (proj.kind === "player") {
    return {
      id: `${proj.slug}|${proj.stat}|${priced.side}|${priced.line}`,
      kind: "player",
      label: `${proj.name} ${proj.statLabel} ${s} ${lineLabel(priced.line)}`,
      sub: proj.team ?? "team —",
      subject: proj.name,
      teamId: proj.teamId,
      team: proj.team,
      stat: proj.stat,
      side: priced.side,
      line: priced.line,
      price: priced.price,
      dec: priced.dec,
      book,
      prob: priced.prob,
      push: priced.push,
      evPct: priced.evPct,
      inputs: projectionInputs(proj),
      projectedAtLock: proj.projected,
    };
  }
  return {
    id: `team:${proj.teamId}|wins|${priced.side}|${priced.line}`,
    kind: "team",
    label: `${proj.name} wins ${s} ${lineLabel(priced.line)}`,
    sub: `${proj.wins}-${proj.losses} · FPI ${proj.fpi == null ? "—" : proj.fpi.toFixed(1)}`,
    subject: proj.name,
    teamId: proj.teamId,
    team: proj.name,
    stat: "wins",
    side: priced.side,
    line: priced.line,
    price: priced.price,
    dec: priced.dec,
    book,
    prob: priced.prob,
    push: priced.push,
    evPct: priced.evPct,
    inputs: projectionInputs(proj),
    projectedAtLock: proj.projected,
  };
}

export type SeasonParlay = {
  legs: number;
  dec: number;
  /** the independent product of the legs' win probabilities */
  prob: number;
  /** the product after the same-team haircut — what EV and the chip print */
  probAdj: number;
  evPct: number;
  /** the team names with two or more legs (correlated — flagged) */
  sameTeam: string[];
  /** the haircut applied (1 when no pair) */
  haircut: number;
};

/**
 * Price a season parlay: decimal = Π dec, probability = Π prob (independent), then one
 * CFB_SEASON.sameTeamHaircut per same-team PAIR; EV% = 100·(probAdj·dec − 1). A push is counted
 * against the ticket here (the joint uses the plain win probability) — conservative, and moot on
 * the half-point lines Josh types. Null for an empty slip.
 */
export function priceSeasonParlay(legs: readonly SeasonLeg[]): SeasonParlay | null {
  if (legs.length === 0) return null;
  const dec = legs.reduce((d, l) => d * l.dec, 1);
  const prob = legs.reduce((p, l) => p * l.prob, 1);
  const byTeam = new Map<string, { name: string; n: number }>();
  for (const l of legs) {
    if (!l.teamId) continue;
    const cur = byTeam.get(l.teamId) ?? { name: l.team ?? l.teamId, n: 0 };
    cur.n++;
    byTeam.set(l.teamId, cur);
  }
  let pairs = 0;
  const sameTeam: string[] = [];
  for (const { name, n } of byTeam.values()) {
    if (n < 2) continue;
    pairs += (n * (n - 1)) / 2;
    sameTeam.push(name);
  }
  const haircut = CFB_SEASON.sameTeamHaircut ** pairs;
  const probAdj = prob * haircut;
  return { legs: legs.length, dec, prob, probAdj, evPct: 100 * (probAdj * dec - 1), sameTeam, haircut };
}

/**
 * Add a leg to a slip, pure: the same leg id toggles off; a leg on the same subject + stat (a
 * different line or side) REPLACES it — one line per player-stat or team on a ticket.
 */
export function addSeasonLeg(prev: readonly SeasonLeg[], leg: SeasonLeg): SeasonLeg[] {
  if (prev.some((l) => l.id === leg.id)) return prev.filter((l) => l.id !== leg.id);
  const same = (l: SeasonLeg) => l.kind === leg.kind && l.stat === leg.stat && (l.kind === "team" ? l.teamId === leg.teamId : l.subject === leg.subject);
  return [...prev.filter((l) => !same(l)), leg];
}

export type SeasonResult = "open" | "won" | "lost" | "void";

export type SeasonTicket = {
  id: string;
  lockedAt: number;
  /** whole dollars, ≤ CFB_SEASON.ticketMax */
  stake: number;
  legs: SeasonLeg[];
  dec: number;
  prob: number;
  evPct: number;
  result: SeasonResult;
  settledAt: number | null;
};

/** The ticket's P/L at its result: won pays stake × (dec − 1), lost loses the stake, void and open are 0. */
export function seasonTicketPnl(t: Pick<SeasonTicket, "stake" | "dec" | "result">): number {
  if (t.result === "won") return Math.round(t.stake * (t.dec - 1) * 100) / 100;
  if (t.result === "lost") return -t.stake;
  return 0;
}

export function seasonLedgerStats(tickets: readonly SeasonTicket[]): { open: number; won: number; lost: number; voided: number; staked: number; pnl: number } {
  const s = { open: 0, won: 0, lost: 0, voided: 0, staked: 0, pnl: 0 };
  for (const t of tickets) {
    if (t.result === "open") s.open++;
    else if (t.result === "won") s.won++;
    else if (t.result === "lost") s.lost++;
    else s.voided++;
    if (t.result !== "void") s.staked += t.stake;
    s.pnl += seasonTicketPnl(t);
  }
  s.pnl = Math.round(s.pnl * 100) / 100;
  return s;
}

/* ---------- pace ---------- */

export type SeasonPace = "cleared" | "on pace" | "behind" | "dead" | "—";

/**
 * A locked leg against the LATEST projection (not the one at lock):
 *   cleared  — the line is already beaten: a stat over with current > line; a wins over with
 *              wins > line; a wins under when even winning out stays under (wins + remaining < line)
 *   dead     — the line can no longer be reached. Only WINS can be dead, because the maximum is
 *              known: wins + remaining < line kills an over, wins > line kills an under. A yardage
 *              under is never called dead or cleared before the season ends (a player can sit).
 *   on pace  — the projection sits on the right side of the line
 *   behind   — it does not
 *   —        — no current projection for the leg (player fell off the top-250 table, team unrated)
 *   A FINISHED season (remaining = 0) is never "on pace" / "behind": the final total is known, so
 *   the leg is "cleared" if it beat the line, else "dead" (a push counts against the ticket).
 */
export function paceOf(leg: Pick<SeasonLeg, "kind" | "side" | "line">, proj: SeasonProjection | null): SeasonPace {
  if (!proj) return "—";
  const over = leg.side === "over";
  /* a finished season (no games left) is graded, never "on pace": the final total is known */
  if (proj.remaining === 0) {
    const final = proj.kind === "team" ? proj.wins : proj.current;
    return (over ? final > leg.line : final < leg.line) ? "cleared" : "dead";
  }
  if (proj.kind === "team") {
    const max = proj.wins + proj.remaining;
    if (over ? proj.wins > leg.line : max < leg.line) return "cleared";
    if (over ? max < leg.line : proj.wins > leg.line) return "dead";
  } else if (over && proj.current > leg.line) return "cleared";
  return (over ? proj.projected > leg.line : proj.projected < leg.line) ? "on pace" : "behind";
}

/** Find the live projection a locked leg refers to in a feed (by slug + stat, or team id). */
export function projectionFor(leg: Pick<SeasonLeg, "id" | "kind" | "stat">, feed: Pick<SeasonFeed, "players" | "teams" | "avgFpi">): SeasonProjection | null {
  const key = leg.id.split("|")[0];
  if (leg.kind === "team") {
    const team = feed.teams.find((t) => `team:${t.id}` === key);
    return team ? projectWinTotal(team, feed.avgFpi) : null;
  }
  if (leg.stat === "wins") return null;
  const p = feed.players.find((x) => x.slug === key);
  return p ? projectPlayerStat(p, leg.stat) : null;
}
