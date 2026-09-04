/**
 * PLAYER PROFILE SHEET — pure shaping (2026-09-03).
 *
 * Operator Josh, verbatim: "On the Stats tab and any other tab that lists a
 * players name, you should be able to click on that players name & pull up a
 * page that is identical to their Roster Lab profile."
 *
 * Roster Lab's card is fed by an ESPN fantasy league; Parlay Lab has no league,
 * so every figure here maps to its MLB Stats API equivalent and is labelled
 * honestly: header tiles are OPS / HR / AVG (hitters) or ERA / K / WHIP
 * (pitchers), the split table is season + last 7 / 15 / 30 days via
 * `stats=byDateRange`, the bar chart is total bases (hitters) or strikeouts
 * (pitchers) per game over the last 30 days, and the game log is
 * `stats=gameLog`. Nothing is invented: a window statsapi answers empty for
 * renders as "no games in window", never as zeros.
 *
 * Also here: name resolution. Most click sites carry only a printed name (and
 * sometimes a team abbreviation), not an MLB id — `resolvePlayer` matches a
 * name against the season's player index (accent/punctuation/suffix-proof),
 * disambiguates by team, then falls back to last name + first initial.
 */

import { TEAM_ABBR } from "@/lib/pvt";

/* ---------------- name normalisation + resolution ---------------- */

/** "José Ramírez" / "Jose Ramirez" / "Ronald Acuña Jr." → one comparable key. */
export function normalizeName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\.?(?=\s|$)/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Book/board abbreviations that differ from MLB's own. */
const ABBR_ALIAS: Record<string, string> = {
  OAK: "ATH", CHW: "CWS", AZ: "ARI", WAS: "WSH", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB",
};
export function canonicalAbbr(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const a = abbr.trim().toUpperCase();
  return ABBR_ALIAS[a] ?? a;
}

/** Board / ticket labels print "Name (TEAM)"; ML/RL rows print a club name with no suffix. */
export function parseBoardLabel(label: string): { name: string; team: string } | null {
  const m = label.match(/^(.+?)\s*\(([A-Za-z]{2,3})\)\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  if (!name) return null;
  return { name, team: canonicalAbbr(m[2])! };
}

export type IndexEntry = { id: number; fullName: string; teamId: number | null; team: string | null; pos: string | null };

type PlayersDoc = {
  people?: { id: number; fullName: string; currentTeam?: { id?: number }; primaryPosition?: { abbreviation?: string } }[];
};

/** /api/v1/sports/1/players?season=… → the lookup index. */
export function buildIndex(doc: PlayersDoc): IndexEntry[] {
  return (doc.people ?? [])
    .filter((p) => typeof p.id === "number" && typeof p.fullName === "string")
    .map((p) => {
      const teamId = p.currentTeam?.id ?? null;
      return {
        id: p.id,
        fullName: p.fullName,
        teamId,
        team: teamId != null ? TEAM_ABBR[teamId] ?? null : null,
        pos: p.primaryPosition?.abbreviation ?? null,
      };
    });
}

export type Resolved = { id: number; fullName: string; team: string | null; position: string | null; via: "exact" | "team" | "initial" };

/**
 * exact normalised match → team-disambiguated → last-name + first-initial fallback.
 * Ambiguity without a team to break it returns null (a 404 beats a wrong player).
 */
export function resolvePlayer(index: IndexEntry[], name: string, team?: string | null): Resolved | null {
  const key = normalizeName(name);
  if (!key) return null;
  const abbr = canonicalAbbr(team);
  const pick = (e: IndexEntry, via: Resolved["via"]): Resolved => ({ id: e.id, fullName: e.fullName, team: e.team, position: e.pos, via });

  const exact = index.filter((e) => normalizeName(e.fullName) === key);
  if (exact.length === 1) return pick(exact[0], "exact");
  if (exact.length > 1) {
    const byTeam = abbr ? exact.filter((e) => e.team === abbr) : [];
    if (byTeam.length === 1) return pick(byTeam[0], "team");
    return null;
  }

  // "R Acuna" / "R. Acuña Jr." / boxscore-style initials
  const parts = key.split(" ");
  if (parts.length < 2) return null;
  const initial = parts[0][0];
  const last = parts[parts.length - 1];
  const loose = index.filter((e) => {
    const ep = normalizeName(e.fullName).split(" ");
    return ep.length >= 2 && ep[ep.length - 1] === last && ep[0][0] === initial;
  });
  if (loose.length === 1) return pick(loose[0], "initial");
  if (loose.length > 1 && abbr) {
    const byTeam = loose.filter((e) => e.team === abbr);
    if (byTeam.length === 1) return pick(byTeam[0], "initial");
  }
  return null;
}

/* ---------------- date windows (PT calendar arithmetic, no clock read) ---------------- */

export function windowDates(today: string, days: number): { startDate: string; endDate: string } {
  const [y, m, d] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: today };
}

/* ---------------- statsapi shapes (only the fields read) ---------------- */

type Stat = Record<string, unknown>;
type StatsDoc = {
  stats?: {
    splits?: {
      stat?: Stat; date?: string; isHome?: boolean; isWin?: boolean;
      opponent?: { id?: number; name?: string }; game?: { gamePk?: number };
      team?: { id?: number; name?: string }; sport?: { id?: number }; numTeams?: number;
    }[];
  }[];
};

export type PersonDoc = {
  people?: {
    id: number;
    fullName: string;
    primaryNumber?: string;
    currentAge?: number;
    active?: boolean;
    currentTeam?: { id?: number; name?: string };
    primaryPosition?: { abbreviation?: string; name?: string; type?: string };
    batSide?: { code?: string };
    pitchHand?: { code?: string };
    rosterEntries?: { isActive?: boolean; statusDate?: string; status?: { code?: string; description?: string }; team?: { id?: number; abbreviation?: string } }[];
  }[];
};

export const isPitcherPos = (pos: string | null | undefined) => pos === "P" || pos === "SP" || pos === "RP";

/* ---------------- formatting ---------------- */

const num = (s: Stat | null | undefined, k: string): number => {
  const v = s?.[k];
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r3 = (v: unknown): string => {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n.toFixed(3).replace(/^0/, "") : "—";
};
const r2 = (v: unknown): string => {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "—";
};
const ipStr = (s: Stat | null | undefined): string => {
  const raw = s?.inningsPitched;
  if (typeof raw === "string" && raw) return raw;
  const outs = num(s, "outs");
  return `${Math.floor(outs / 3)}.${outs % 3}`;
};
/** "149.2" IP → outs, for summing / rates. */
export const ipToOuts = (ip: string): number => {
  const [w, f = "0"] = ip.split(".");
  return Number(w) * 3 + Number(f);
};

/* ---------------- split table ---------------- */

export const BAT_SPLIT_HEADERS = ["AB", "R", "H", "HR", "RBI", "BB", "SB", "AVG", "OBP", "SLG"] as const;
export const PIT_SPLIT_HEADERS = ["G", "GS", "IP", "H", "ER", "BB", "K", "W-L", "SV", "ERA", "WHIP"] as const;

export function batSplitCells(s: Stat): string[] {
  return [
    String(num(s, "atBats")), String(num(s, "runs")), String(num(s, "hits")), String(num(s, "homeRuns")),
    String(num(s, "rbi")), String(num(s, "baseOnBalls")), String(num(s, "stolenBases")),
    r3(s.avg), r3(s.obp), r3(s.slg),
  ];
}
export function pitSplitCells(s: Stat): string[] {
  return [
    String(num(s, "gamesPlayed")), String(num(s, "gamesStarted")), ipStr(s), String(num(s, "hits")),
    String(num(s, "earnedRuns")), String(num(s, "baseOnBalls")), String(num(s, "strikeOuts")),
    `${num(s, "wins")}-${num(s, "losses")}`, String(num(s, "saves")), r2(s.era), r2(s.whip),
  ];
}

/* ---------------- game log ---------------- */

export const BAT_LOG_HEADERS = ["H/AB", "R", "HR", "RBI", "SB", "OBP", "SLG", "K"] as const;
export const PIT_LOG_HEADERS = ["IP", "H", "ER", "BB", "K", "DEC"] as const;

/** Per-game OBP/SLG from the game's own counts (the feed's avg/obp/slg on a
 *  gameLog split are season-to-date, not the single game). */
export function batLogCells(s: Stat): string[] {
  const ab = num(s, "atBats"), h = num(s, "hits"), bb = num(s, "baseOnBalls"), hbp = num(s, "hitByPitch"), sf = num(s, "sacFlies");
  const tb = num(s, "totalBases");
  const obpDen = ab + bb + hbp + sf;
  return [
    `${h}/${ab}`, String(num(s, "runs")), String(num(s, "homeRuns")), String(num(s, "rbi")), String(num(s, "stolenBases")),
    obpDen > 0 ? r3((h + bb + hbp) / obpDen) : "—",
    ab > 0 ? r3(tb / ab) : "—",
    String(num(s, "strikeOuts")),
  ];
}
export function pitLogCells(s: Stat): string[] {
  const dec: string[] = [];
  if (num(s, "wins") > 0) dec.push("W");
  if (num(s, "losses") > 0) dec.push("L");
  if (num(s, "saves") > 0) dec.push("SV");
  if (num(s, "blownSaves") > 0) dec.push("BS");
  if (num(s, "holds") > 0) dec.push("HLD");
  if (num(s, "gamesStarted") > 0 && ipToOuts(ipStr(s)) >= 18 && num(s, "earnedRuns") <= 3) dec.push("QS");
  return [ipStr(s), String(num(s, "hits")), String(num(s, "earnedRuns")), String(num(s, "baseOnBalls")), String(num(s, "strikeOuts")), dec.join(",") || "—"];
}

/* ---------------- the card ---------------- */

export type StatusTone = "pos" | "gold" | "neg" | "muted";
export type CardStatus = { code: string; description: string; tone: StatusTone };

export function statusFromPerson(p: NonNullable<PersonDoc["people"]>[number]): CardStatus | null {
  const entries = (p.rosterEntries ?? []).filter((e) => e.isActive);
  const e = entries.sort((a, b) => String(b.statusDate ?? "").localeCompare(String(a.statusDate ?? "")))[0];
  const desc = e?.status?.description;
  if (!desc) return null;
  const code = e?.status?.code ?? "";
  const d = desc.toLowerCase();
  const tone: StatusTone =
    d === "active" ? "pos"
    : /injured|suspend|restricted|bereavement|paternity/.test(d) ? "neg"
    : /day-to-day|rehab/.test(d) ? "gold"
    : "muted";
  return { code, description: desc, tone };
}

export type SplitRow = { label: string; cells: string[] | null; games: number };
export type LogRow = { date: string; gamePk: number | null; opp: string; home: boolean; win: boolean | null; cells: string[] };
export type ChartPoint = { date: string; v: number };

export type PlayerCard = {
  id: number;
  fullName: string;
  number: string | null;
  age: number | null;
  team: { id: number; abbr: string; name: string } | null;
  pos: string | null;
  posName: string | null;
  isPitcher: boolean;
  bats: string | null;
  throws: string | null;
  status: CardStatus | null;
  season: number;
  tiles: { label: string; value: string }[];
  splitHeaders: readonly string[];
  splits: SplitRow[];
  chart: { label: string; points: ChartPoint[] };
  logHeaders: readonly string[];
  log: LogRow[];
};

/**
 * Pick the split that covers the WHOLE window. When a player was traded inside a
 * byDateRange window statsapi returns one split per team first and the combined
 * total last (sport.id 0, numTeams 2, no team) — e.g. Luis Arraez 2026-06-01..09-03:
 * PHI 27 G / 107 AB, SF 49 G / 202 AB, combined 76 G / 309 AB. `stats=season`
 * lists the combined split first, so the same picker is right there too.
 */
export function pickSplit(doc: StatsDoc | null | undefined): Stat | null {
  const splits = doc?.stats?.[0]?.splits ?? [];
  if (splits.length === 0) return null;
  const combined =
    splits.find((s) => (s.numTeams ?? 1) > 1 && !s.team) ??
    splits.find((s) => s.sport?.id === 0) ??
    (splits.length > 1
      ? [...splits].sort((a, b) => num(b.stat, "gamesPlayed") - num(a.stat, "gamesPlayed"))[0]
      : splits[0]);
  return combined?.stat ?? null;
}
const firstSplit = pickSplit;

export function shapeCard(input: {
  person: PersonDoc;
  isPitcher: boolean;
  season: number;
  seasonDoc: StatsDoc | null;
  last7: StatsDoc | null;
  last15: StatsDoc | null;
  last30: StatsDoc | null;
  gameLog: StatsDoc | null;
  today: string;
}): PlayerCard | null {
  const p = input.person.people?.[0];
  if (!p) return null;
  const { isPitcher } = input;
  const seasonStat = firstSplit(input.seasonDoc);
  const teamId = p.currentTeam?.id ?? null;
  const team = teamId != null ? { id: teamId, abbr: TEAM_ABBR[teamId] ?? String(teamId), name: p.currentTeam?.name ?? "" } : null;

  const tiles = isPitcher
    ? [
        { label: "ERA", value: seasonStat ? r2(seasonStat.era) : "—" },
        { label: "K", value: seasonStat ? String(num(seasonStat, "strikeOuts")) : "—" },
        { label: "WHIP", value: seasonStat ? r2(seasonStat.whip) : "—" },
      ]
    : [
        { label: "OPS", value: seasonStat ? r3(seasonStat.ops) : "—" },
        { label: "HR", value: seasonStat ? String(num(seasonStat, "homeRuns")) : "—" },
        { label: "AVG", value: seasonStat ? r3(seasonStat.avg) : "—" },
      ];

  const cellsOf = isPitcher ? pitSplitCells : batSplitCells;
  const splitRow = (label: string, doc: StatsDoc | null): SplitRow => {
    const s = firstSplit(doc);
    return { label, cells: s ? cellsOf(s) : null, games: s ? num(s, "gamesPlayed") : 0 };
  };
  const splits: SplitRow[] = [
    splitRow(String(input.season), input.seasonDoc),
    splitRow("Last 7", input.last7),
    splitRow("Last 15", input.last15),
    splitRow("Last 30", input.last30),
  ];

  const logCells = isPitcher ? pitLogCells : batLogCells;
  const rawLog = input.gameLog?.stats?.[0]?.splits ?? [];
  const log: LogRow[] = rawLog
    .filter((g) => g.stat && g.date)
    .map((g) => {
      const oppId = g.opponent?.id;
      const abbr = oppId != null ? TEAM_ABBR[oppId] ?? (g.opponent?.name ?? "—") : "—";
      return {
        date: g.date!,
        gamePk: g.game?.gamePk ?? null,
        opp: `${g.isHome ? "" : "@"}${abbr}`,
        home: !!g.isHome,
        win: typeof g.isWin === "boolean" ? g.isWin : null,
        cells: logCells(g.stat!),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || (b.gamePk ?? 0) - (a.gamePk ?? 0));

  const { startDate } = windowDates(input.today, 30);
  const chartKey = isPitcher ? "strikeOuts" : "totalBases";
  const points: ChartPoint[] = rawLog
    .filter((g) => g.stat && g.date && g.date >= startDate && g.date <= input.today)
    .map((g) => ({ date: g.date!, v: num(g.stat, chartKey) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    id: p.id,
    fullName: p.fullName,
    number: p.primaryNumber ?? null,
    age: p.currentAge ?? null,
    team,
    pos: p.primaryPosition?.abbreviation ?? null,
    posName: p.primaryPosition?.name ?? null,
    isPitcher,
    bats: p.batSide?.code ?? null,
    throws: p.pitchHand?.code ?? null,
    status: statusFromPerson(p),
    season: input.season,
    tiles,
    splitHeaders: isPitcher ? PIT_SPLIT_HEADERS : BAT_SPLIT_HEADERS,
    splits,
    chart: { label: isPitcher ? "Strikeouts by game — last 30 days" : "Total bases by game — last 30 days", points },
    logHeaders: isPitcher ? PIT_LOG_HEADERS : BAT_LOG_HEADERS,
    log,
  };
}

/** ESPN CDN code for a team logo, from MLB's abbreviation (matches the Stats page). */
export function espnLogoCode(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const a = abbr.toUpperCase();
  const special: Record<string, string> = { ARI: "ari", AZ: "ari", CWS: "chw", CHW: "chw", ATH: "oak", OAK: "oak" };
  return special[a] ?? a.toLowerCase();
}

export const isIntId = (v: string | null | undefined): v is string => !!v && /^\d{1,9}$/.test(v);
