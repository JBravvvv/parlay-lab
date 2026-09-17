/**
 * DAILY BALLPARK FACTOR (INSTRUCTION 68, 2026-09-17, Josh's word, verbatim: "There should be
 * a tab titled 'Ballpark Factor' that shows daily ballpark factor for every stadium that is
 * being used in the engine to calculate bets. The engine should obviously know but it should
 * take into account temperature, elevation, wind mph, wind in/out/left/right, etc").
 *
 * ONE pure model, read by two consumers:
 *   - the engine hook `shParkDaily(g)` (legacy blob, `windNote`) — armed by `SH_CFG.parkDaily`
 *     on every generator (engine-client, /api/generate, the scheduler backfill); absent =
 *     the byte-identical legacy rule (wind ≥10 mph out/in = ±10 % on HR, temp +0.8 %/°F over 70);
 *   - the Ballpark Factor tab (/ballpark via /api/mlb/ballpark) — every stadium, today's
 *     weather, the same numbers the engine multiplies with.
 *
 * WHAT IS ALREADY IN THE SEASON PARK INDEX. `SH_PRIORS.parks[R|L]` is Savant's season park
 * factor (index 100 = neutral) — hits / hr / runs / k by batter side — which the engine damps
 * 50 % (`shParkF`, clamp 0.85–1.18) because single-season park factors are noisy. A season
 * index already averages a park's climate and altitude; what it cannot carry is TODAY: the
 * wind blowing in at Wrigley, a 94 °F afternoon at Globe Life with the roof open. So the daily
 * model is an ENVIRONMENT multiplier on top of the (damped) season index, never a replacement.
 *
 * THE TERMS (first-pass constants, Josh-directed, every one clamped; each is its own column on
 * the tab so a wrong-looking number is visible, not buried):
 *   temp       1 + 0.008 × (°F − 70), clamp 0.90–1.12 — the engine's own constant since build
 *              39 (`shTempF`, legacy L1616), kept for continuity.
 *   wind       out-blowing wind at w mph → 1 + 0.010 × w × dir; the legacy rule's +10 % at
 *              10 mph out / −10 % at 10 mph in are exactly reproduced at 10 mph, and the term
 *              is now continuous in mph instead of a step at 10. `dir` = +1 "Out To CF",
 *              +0.75 "Out To LF/RF" (a corner wind is ~cos 45° of a straight-out wind for a
 *              centre-hit fly ball), −1 "In From CF", −0.75 "In From LF/RF", 0 for a cross
 *              wind ("L To R" / "R To L"), "Varies", "Calm" / "None". Clamp 0.80–1.25.
 *   roof       "Dome" / "Roof Closed" conditions zero the wind term; the reported temp (a
 *              climate-controlled 72 °F) still runs through the temp term as it always has.
 *   elevation  1 + 0.012 × (ft / 1000), clamp 1.00–1.07 — the carry from thin air that the
 *              50 %-damped season index gives back only half of (Coors 5,190 ft → +6.2 %,
 *              Chase / Truist ≈ +1.3 %, sea-level parks ≈ 0). Half of the +12 %/1,000 ft a
 *              full physics carry model would give, deliberately: the other half is already
 *              inside the season index.
 * f  = temp × wind × elevation — the HR ENVIRONMENT multiplier the blob puts on `hrF`, the
 *      weather trim on pitcher K's / outs, and the overview's wind-spot line.
 * h  = 1 + (f − 1) × 0.25, clamp 0.95–1.05 — hits move a quarter as far as HR (a fly-ball
 *      effect reaches BABIP only through the doubles/triples that stay in the park).
 * tb = 1 + (f − 1) × 0.50, clamp 0.90–1.12 — total bases, replacing the legacy 1.05 / 0.96
 *      two-step (continuous, same sign, same size at the legacy thresholds' typical inputs).
 *
 * NEVER FABRICATED: no weather → the wind and temp terms are 1 and the card says "weather not
 * posted"; a venue the static table does not know → elevation 1 and `matched: null`; a venue
 * the Savant priors do not carry → the park columns read "—" and the season terms are 1.
 */

export type ParkRoof = "open" | "retractable" | "dome";

export type ParkStatic = {
  /** the name Savant / MLB statsapi use (the priors' key) */
  venue: string;
  team: string;
  abbr: string;
  city: string;
  /** field elevation above sea level, feet (public stadium data, rounded) */
  elevationFt: number;
  roof: ParkRoof;
  /** other names the statsapi schedule has used for the same park */
  aliases?: string[];
};

/** the 30 parks the engine prices at (2026). Elevations are the published field elevations, rounded to the nearest 5 ft. */
export const MLB_PARKS: readonly ParkStatic[] = [
  { venue: "American Family Field", team: "Milwaukee Brewers", abbr: "MIL", city: "Milwaukee", elevationFt: 635, roof: "retractable", aliases: ["Miller Park"] },
  { venue: "Angel Stadium", team: "Los Angeles Angels", abbr: "LAA", city: "Anaheim", elevationFt: 160, roof: "open", aliases: ["Angel Stadium of Anaheim"] },
  { venue: "Busch Stadium", team: "St. Louis Cardinals", abbr: "STL", city: "St. Louis", elevationFt: 465, roof: "open" },
  { venue: "Chase Field", team: "Arizona Diamondbacks", abbr: "AZ", city: "Phoenix", elevationFt: 1085, roof: "retractable" },
  { venue: "Citi Field", team: "New York Mets", abbr: "NYM", city: "Queens", elevationFt: 10, roof: "open" },
  { venue: "Citizens Bank Park", team: "Philadelphia Phillies", abbr: "PHI", city: "Philadelphia", elevationFt: 20, roof: "open" },
  { venue: "Comerica Park", team: "Detroit Tigers", abbr: "DET", city: "Detroit", elevationFt: 600, roof: "open" },
  { venue: "Coors Field", team: "Colorado Rockies", abbr: "COL", city: "Denver", elevationFt: 5190, roof: "open" },
  { venue: "Daikin Park", team: "Houston Astros", abbr: "HOU", city: "Houston", elevationFt: 45, roof: "retractable", aliases: ["Minute Maid Park"] },
  { venue: "Fenway Park", team: "Boston Red Sox", abbr: "BOS", city: "Boston", elevationFt: 20, roof: "open" },
  { venue: "Globe Life Field", team: "Texas Rangers", abbr: "TEX", city: "Arlington", elevationFt: 550, roof: "retractable" },
  { venue: "Great American Ball Park", team: "Cincinnati Reds", abbr: "CIN", city: "Cincinnati", elevationFt: 490, roof: "open" },
  { venue: "Kauffman Stadium", team: "Kansas City Royals", abbr: "KC", city: "Kansas City", elevationFt: 750, roof: "open" },
  { venue: "Nationals Park", team: "Washington Nationals", abbr: "WSH", city: "Washington", elevationFt: 25, roof: "open" },
  { venue: "Oracle Park", team: "San Francisco Giants", abbr: "SF", city: "San Francisco", elevationFt: 10, roof: "open" },
  { venue: "Oriole Park at Camden Yards", team: "Baltimore Orioles", abbr: "BAL", city: "Baltimore", elevationFt: 40, roof: "open", aliases: ["Camden Yards"] },
  { venue: "PNC Park", team: "Pittsburgh Pirates", abbr: "PIT", city: "Pittsburgh", elevationFt: 730, roof: "open" },
  { venue: "Petco Park", team: "San Diego Padres", abbr: "SD", city: "San Diego", elevationFt: 60, roof: "open" },
  { venue: "Progressive Field", team: "Cleveland Guardians", abbr: "CLE", city: "Cleveland", elevationFt: 655, roof: "open" },
  { venue: "Rate Field", team: "Chicago White Sox", abbr: "CWS", city: "Chicago", elevationFt: 595, roof: "open", aliases: ["Guaranteed Rate Field"] },
  { venue: "Rogers Centre", team: "Toronto Blue Jays", abbr: "TOR", city: "Toronto", elevationFt: 250, roof: "retractable" },
  { venue: "Sutter Health Park", team: "Athletics", abbr: "ATH", city: "West Sacramento", elevationFt: 20, roof: "open" },
  { venue: "T-Mobile Park", team: "Seattle Mariners", abbr: "SEA", city: "Seattle", elevationFt: 10, roof: "retractable" },
  { venue: "Target Field", team: "Minnesota Twins", abbr: "MIN", city: "Minneapolis", elevationFt: 840, roof: "open" },
  { venue: "Tropicana Field", team: "Tampa Bay Rays", abbr: "TB", city: "St. Petersburg", elevationFt: 45, roof: "dome" },
  { venue: "Truist Park", team: "Atlanta Braves", abbr: "ATL", city: "Atlanta", elevationFt: 1050, roof: "open" },
  { venue: "UNIQLO Field at Dodger Stadium", team: "Los Angeles Dodgers", abbr: "LAD", city: "Los Angeles", elevationFt: 515, roof: "open", aliases: ["Dodger Stadium"] },
  { venue: "Wrigley Field", team: "Chicago Cubs", abbr: "CHC", city: "Chicago", elevationFt: 600, roof: "open" },
  { venue: "Yankee Stadium", team: "New York Yankees", abbr: "NYY", city: "Bronx", elevationFt: 55, roof: "open" },
  { venue: "loanDepot park", team: "Miami Marlins", abbr: "MIA", city: "Miami", elevationFt: 10, roof: "retractable", aliases: ["Marlins Park"] },
];

/* ----- constants (each named once; the tab and the tests read these, never a copy) ----- */
export const PARK_DAILY = {
  tempPerDegF: 0.008,
  tempAnchorF: 70,
  tempClamp: [0.9, 1.12] as const,
  windPerMph: 0.01,
  windClamp: [0.8, 1.25] as const,
  cornerWeight: 0.75,
  elevPerKft: 0.012,
  elevClamp: [1, 1.07] as const,
  hitsShare: 0.25,
  hitsClamp: [0.95, 1.05] as const,
  tbShare: 0.5,
  tbClamp: [0.9, 1.12] as const,
  /** the engine's own park-index damping (`shParkF`) and clamps, mirrored for the tab's columns */
  parkDamp: 0.5,
  parkClamp: [0.85, 1.18] as const,
  kDamp: 0.5,
  kClamp: [0.94, 1.06] as const,
  runsDamp: 0.25,
  runsClamp: [0.97, 1.03] as const,
  wxTrimShare: 0.25,
  wxTrimClamp: [0.97, 1.03] as const,
  outsClamp: [0.94, 1.06] as const,
} as const;

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** the blob's `pnorm`: lowercase, strip accents, keep [a-z0-9] */
export const pnorm = (s: string | null | undefined): string =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** static row for a statsapi / Savant venue name — exact (normalised) name or alias, then a contains match either way */
export function findPark(venue: string | null | undefined): ParkStatic | null {
  const v = pnorm(venue);
  if (!v) return null;
  for (const p of MLB_PARKS) if (pnorm(p.venue) === v || (p.aliases ?? []).some((a) => pnorm(a) === v)) return p;
  for (const p of MLB_PARKS) {
    const names = [p.venue, ...(p.aliases ?? [])].map(pnorm);
    if (names.some((n) => n.includes(v) || v.includes(n))) return p;
  }
  return null;
}

export type WindDir = "out" | "in" | "cross" | "calm" | "varies" | "unknown";
export type WindRead = {
  mph: number;
  dir: WindDir;
  /** CF / LF / RF when the feed names a field direction */
  toward: "CF" | "LF" | "RF" | null;
  /** signed weight the HR term multiplies mph by: +1 out to CF, ±0.75 corners, −1 in from CF, 0 otherwise */
  weight: number;
  raw: string;
};

/** MLB statsapi wind strings: "10 mph, Out To CF" · "6 mph, In From LF" · "7 mph, L To R" · "0 mph, None" · "13 mph, Varies" */
export function parseWind(wind: string | null | undefined): WindRead {
  const raw = (wind ?? "").trim();
  const mph = Math.max(0, parseFloat(raw) || 0);
  const t = raw.toLowerCase();
  const toward: WindRead["toward"] = /\bcf\b/.test(t) ? "CF" : /\blf\b/.test(t) ? "LF" : /\brf\b/.test(t) ? "RF" : null;
  const corner = toward === "LF" || toward === "RF" ? PARK_DAILY.cornerWeight : 1;
  if (!raw) return { mph: 0, dir: "unknown", toward: null, weight: 0, raw };
  if (/\bnone\b|\bcalm\b/.test(t) || mph === 0) return { mph, dir: "calm", toward: null, weight: 0, raw };
  if (/\bvaries\b/.test(t)) return { mph, dir: "varies", toward: null, weight: 0, raw };
  if (/\bout\b/.test(t)) return { mph, dir: "out", toward, weight: corner, raw };
  if (/\bin\b/.test(t)) return { mph, dir: "in", toward, weight: -corner, raw };
  if (/\bl to r\b|\br to l\b|\bcross\b/.test(t)) return { mph, dir: "cross", toward: null, weight: 0, raw };
  return { mph, dir: "unknown", toward: null, weight: 0, raw };
}

export type ParkWeather = { condition?: string | null; temp?: string | number | null; wind?: string | null } | null | undefined;

export const roofClosed = (w: ParkWeather, park: ParkStatic | null): boolean => {
  const c = (w?.condition ?? "").toLowerCase();
  if (/dome|roof closed|indoor/.test(c)) return true;
  if (park?.roof === "dome") return true;
  return false;
};

export type PriorsParks = { R?: Record<string, Record<string, number | null>>; L?: Record<string, Record<string, number | null>> } | null | undefined;

/** the Savant row for a venue on one batter side, matched the way the blob matches (pnorm equality) */
export function parkRow(parks: PriorsParks, venue: string | null | undefined, side: "R" | "L"): Record<string, number | null> | null {
  const P = parks?.[side];
  if (!P) return null;
  const v = pnorm(venue);
  for (const k of Object.keys(P)) if (pnorm(k) === v) return P[k];
  // the static table's aliases (the priors are keyed by Savant's name; the schedule may use an older one)
  const st = findPark(venue);
  if (st) for (const k of Object.keys(P)) if (pnorm(k) === pnorm(st.venue)) return P[k];
  return null;
}

/** the engine's own damped index → multiplier (shParkF / shParkIdx discipline) */
const idx = (x: number | null | undefined, damp: number, c: readonly [number, number]) => (x == null ? 1 : clamp(1 + (x / 100 - 1) * damp, c));

export type ParkEnv = {
  tempF: number | null;
  wind: WindRead;
  roofClosed: boolean;
  weatherPosted: boolean;
  terms: { temp: number; wind: number; elevation: number };
  /** the engine multipliers: f on HR (and the pitcher weather trim), h on hits, tb on total bases */
  f: number;
  h: number;
  tb: number;
  /** what the card prints after "wind " */
  txt: string | null;
};

/** today's environment at a park — the part of the model that is NOT the season index */
export function parkEnv(venue: string | null | undefined, weather: ParkWeather): ParkEnv {
  const park = findPark(venue);
  const closed = roofClosed(weather, park);
  const tRaw = weather?.temp;
  const tempF = tRaw == null || tRaw === "" ? null : Number.isFinite(Number(tRaw)) ? Number(tRaw) : null;
  const wind = parseWind(weather?.wind);
  const weatherPosted = tempF != null || !!wind.raw;
  const temp = tempF == null ? 1 : clamp(1 + PARK_DAILY.tempPerDegF * (tempF - PARK_DAILY.tempAnchorF), PARK_DAILY.tempClamp);
  const windT = closed ? 1 : clamp(1 + PARK_DAILY.windPerMph * wind.mph * wind.weight, PARK_DAILY.windClamp);
  const elevation = park ? clamp(1 + PARK_DAILY.elevPerKft * (park.elevationFt / 1000), PARK_DAILY.elevClamp) : 1;
  const f = r3(temp * windT * elevation);
  const h = r3(clamp(1 + (f - 1) * PARK_DAILY.hitsShare, PARK_DAILY.hitsClamp));
  const tb = r3(clamp(1 + (f - 1) * PARK_DAILY.tbShare, PARK_DAILY.tbClamp));
  const bits: string[] = [];
  if (closed) bits.push("roof closed");
  else if (wind.raw) bits.push(wind.raw + (wind.dir === "out" ? " (out)" : wind.dir === "in" ? " (in)" : wind.dir === "cross" ? " (cross)" : ""));
  if (tempF != null) bits.push(`${tempF}°F`);
  if (park && park.elevationFt >= 500) bits.push(`${park.elevationFt.toLocaleString("en-US")} ft`);
  const txt = bits.length ? `${bits.join(" · ")} ×${f.toFixed(2)}` : null;
  return { tempF, wind, roofClosed: closed, weatherPosted, terms: { temp: r3(temp), wind: r3(windT), elevation: r3(elevation) }, f, h, tb, txt };
}

export type ParkMarkets = {
  /** the season index the engine reads (raw Savant, 100 = neutral) — null when the priors do not carry the park */
  index: { hr: number | null; hits: number | null; runs: number | null; k: number | null; woba: number | null } | null;
  /** the daily multipliers the engine applies, per market, season index (damped) × today's environment */
  hr: number;
  hits: number;
  tb: number;
  hrr: number;
  runs: number;
  k: number;
  outs: number;
};

/** per-market multipliers for one batter side: the engine's damped season index × today's environment */
export function parkMarkets(parks: PriorsParks, venue: string | null | undefined, side: "R" | "L", env: ParkEnv): ParkMarkets {
  const row = parkRow(parks, venue, side);
  const rowR = side === "R" ? row : parkRow(parks, venue, "R"); // the blob's shParkIdx reads the R table for k / runs
  const pHr = idx(row?.hr, PARK_DAILY.parkDamp, PARK_DAILY.parkClamp);
  const pH = idx(row?.hits, PARK_DAILY.parkDamp, PARK_DAILY.parkClamp);
  const pK = idx(rowR?.k, PARK_DAILY.kDamp, PARK_DAILY.kClamp);
  const pRuns = idx(rowR?.runs, PARK_DAILY.runsDamp, PARK_DAILY.runsClamp);
  const hr = pHr * env.f;
  const hits = pH * env.h;
  const tb = (1 + (pH - 1) * 0.7 + (pHr - 1) * 0.3) * env.tb;
  const hrr = 0.74 * hits + 0.26 * tb; // the recorded H+R+RBI λ blend (docs/hrr-recalibration.md)
  const runs = idx(rowR?.runs, PARK_DAILY.parkDamp, PARK_DAILY.parkClamp) * (1 + (env.f - 1) * 0.5);
  const wxTrim = clamp(1 - (env.f - 1) * PARK_DAILY.wxTrimShare, PARK_DAILY.wxTrimClamp);
  const k = pK * wxTrim;
  const outs = clamp(wxTrim * (2 - pRuns), PARK_DAILY.outsClamp);
  return {
    index: row ? { hr: row.hr ?? null, hits: row.hits ?? null, runs: row.runs ?? null, k: row.k ?? null, woba: row.woba ?? null } : null,
    hr: r3(hr),
    hits: r3(hits),
    tb: r3(tb),
    hrr: r3(hrr),
    runs: r3(runs),
    k: r3(k),
    outs: r3(outs),
  };
}

/** the engine hook: `shParkDaily(g)` for a slate game — null when there is nothing to say (the blob then runs its legacy rule) */
export function parkDailyForGame(g: { venue?: string | null; weather?: ParkWeather } | null | undefined): { f: number; h: number; tb: number; txt: string | null } | null {
  if (!g || !g.venue) return null;
  const env = parkEnv(g.venue, g.weather);
  if (!env.weatherPosted && env.terms.elevation === 1) return null; // nothing beyond the legacy rule's own reading
  return { f: env.f, h: env.h, tb: env.tb, txt: env.txt };
}

/** one stadium's card for the tab */
export type ParkCard = {
  park: ParkStatic | null;
  venue: string;
  game: { pk: number | null; away: string; home: string; awayAbbr: string | null; homeAbbr: string | null; start: string | null; status: string | null; awayPitcher: string | null; homePitcher: string | null } | null;
  weather: { condition: string | null; temp: number | null; wind: string | null } | null;
  env: ParkEnv;
  R: ParkMarkets;
  L: ParkMarkets;
  /** −1 pitcher-friendly … +1 hitter-friendly, from the RHB HR multiplier, for the tab's tone only */
  lean: number;
};

export type SchedGameLite = {
  gamePk?: number;
  gameDate?: string;
  status?: { detailedState?: string; abstractGameState?: string };
  venue?: { name?: string };
  weather?: { condition?: string; temp?: string; wind?: string };
  teams?: {
    away?: { team?: { name?: string; abbreviation?: string }; probablePitcher?: { fullName?: string } };
    home?: { team?: { name?: string; abbreviation?: string }; probablePitcher?: { fullName?: string } };
  };
};

const lean = (hr: number) => Math.max(-1, Math.min(1, (hr - 1) / 0.2));

/** every stadium, today's games first (by first pitch), idle parks after (alphabetical); every number is the engine's own. */
export function buildParkCards(games: readonly SchedGameLite[], parks: PriorsParks): ParkCard[] {
  const byVenue = new Map<string, ParkCard>();
  const cards: ParkCard[] = [];
  for (const g of games) {
    const venue = g.venue?.name ?? "";
    if (!venue) continue;
    const park = findPark(venue);
    const key = pnorm(park?.venue ?? venue);
    if (byVenue.has(key)) continue; // a doubleheader shares one sky; the first game's weather stands for the park
    const w = g.weather ?? null;
    const env = parkEnv(venue, w);
    const card: ParkCard = {
      park,
      venue: park?.venue ?? venue,
      game: {
        pk: g.gamePk ?? null,
        away: g.teams?.away?.team?.name ?? "",
        home: g.teams?.home?.team?.name ?? "",
        awayAbbr: g.teams?.away?.team?.abbreviation ?? null,
        homeAbbr: g.teams?.home?.team?.abbreviation ?? null,
        start: g.gameDate ?? null,
        status: g.status?.detailedState ?? null,
        awayPitcher: g.teams?.away?.probablePitcher?.fullName ?? null,
        homePitcher: g.teams?.home?.probablePitcher?.fullName ?? null,
      },
      weather: w ? { condition: w.condition ?? null, temp: env.tempF, wind: w.wind ?? null } : null,
      env,
      R: parkMarkets(parks, venue, "R", env),
      L: parkMarkets(parks, venue, "L", env),
      lean: 0,
    };
    card.lean = lean(card.R.hr);
    byVenue.set(key, card);
    cards.push(card);
  }
  cards.sort((a, b) => (a.game?.start ?? "").localeCompare(b.game?.start ?? ""));
  const idle: ParkCard[] = [];
  for (const p of MLB_PARKS) {
    if (byVenue.has(pnorm(p.venue))) continue;
    const env = parkEnv(p.venue, null);
    const card: ParkCard = { park: p, venue: p.venue, game: null, weather: null, env, R: parkMarkets(parks, p.venue, "R", env), L: parkMarkets(parks, p.venue, "L", env), lean: 0 };
    card.lean = lean(card.R.hr);
    idle.push(card);
  }
  idle.sort((a, b) => a.venue.localeCompare(b.venue));
  return [...cards, ...idle];
}

/** the /api/mlb/ballpark response */
export type BallparkPayload = {
  date: string;
  generatedAt: string;
  /** when the Savant season index was built (priors.json generated_at), null when the artifact could not be read */
  priorsAt: string | null;
  priorsSeason: number | null;
  scheduleOk: boolean;
  games: number;
  cards: ParkCard[];
};
