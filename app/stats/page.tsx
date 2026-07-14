"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { UfcRankings } from "@/components/ufc/UfcRankings";

/* The stat desk from the original app, ported feature-for-feature: every MLB
   player and all 30 teams (plus NFL / NCAAF via ESPN), live on open, with the
   same filters, timeframes and sort behavior. Data flows through /api/stats —
   free feeds, no keys, no quota. */

/* ---------- sport registry (verbatim from legacy; ufc renders its own card view) ---------- */
type SportId = "mlb" | "nfl" | "cfb" | "ufc";
type TableSportId = Exclude<SportId, "ufc">;
type GroupId = string;

const TEAM_ABBR: Record<number, string> = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC", 113: "CIN", 114: "CLE",
  115: "COL", 116: "DET", 117: "HOU", 118: "KC", 119: "LAD", 120: "WSH", 121: "NYM",
  133: "ATH", 134: "PIT", 135: "SD", 136: "SEA", 137: "SF", 138: "STL", 139: "TB",
  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI", 144: "ATL", 145: "CWS", 146: "MIA",
  147: "NYY", 158: "MIL",
};

const fmtInt = (v: unknown) => (v == null || v === "" ? "—" : String(Math.round(Number(v))));
const fmt3 = (v: unknown) => { const n = Number(v); return isFinite(n) ? n.toFixed(3).replace(/^0/, "") : "—"; };
const fmt2 = (v: unknown) => (isFinite(Number(v)) ? Number(v).toFixed(2) : "—");
const fmt1 = (v: unknown) => (isFinite(Number(v)) ? Number(v).toFixed(1) : "—");
const fmtIP = (v: unknown) => (v == null ? "—" : String(v));
const fbF = (v: unknown) => (v == null || v === "" || v === "-" ? "—" : String(v));

type StatCol = { k: string; l: string; f: (v: unknown) => string; asc?: boolean };

const HIT_COLS: StatCol[] = [
  { k: "gamesPlayed", l: "G", f: fmtInt }, { k: "atBats", l: "AB", f: fmtInt },
  { k: "avg", l: "AVG", f: fmt3 }, { k: "hits", l: "H", f: fmtInt },
  { k: "doubles", l: "2B", f: fmtInt }, { k: "triples", l: "3B", f: fmtInt },
  { k: "homeRuns", l: "HR", f: fmtInt }, { k: "totalBases", l: "TB", f: fmtInt },
  { k: "rbi", l: "RBI", f: fmtInt }, { k: "runs", l: "R", f: fmtInt },
  { k: "obp", l: "OBP", f: fmt3 }, { k: "slg", l: "SLG", f: fmt3 },
  { k: "ops", l: "OPS", f: fmt3 }, { k: "baseOnBalls", l: "BB", f: fmtInt },
  { k: "strikeOuts", l: "K", f: fmtInt },
];
const PIT_COLS: StatCol[] = [
  { k: "gamesPlayed", l: "G", f: fmtInt }, { k: "era", l: "ERA", f: fmt2, asc: true },
  { k: "wins", l: "W", f: fmtInt }, { k: "losses", l: "L", f: fmtInt },
  { k: "saves", l: "SV", f: fmtInt }, { k: "inningsPitched", l: "IP", f: fmtIP },
  { k: "hits", l: "H", f: fmtInt }, { k: "runs", l: "R", f: fmtInt },
  { k: "earnedRuns", l: "ER", f: fmtInt }, { k: "homeRuns", l: "HR", f: fmtInt },
  { k: "hitBatsmen", l: "HBP", f: fmtInt }, { k: "baseOnBalls", l: "BB", f: fmtInt },
  { k: "strikeOuts", l: "K", f: fmtInt }, { k: "strikeoutsPer9Inn", l: "K/9", f: fmt1 },
  { k: "whip", l: "WHIP", f: fmt2, asc: true }, { k: "completeGames", l: "CG", f: fmtInt },
  { k: "shutouts", l: "SHO", f: fmtInt },
];
const fbCols = (lbls: string[]): StatCol[] => lbls.map((l) => ({ k: l, l, f: fbF }));
const FB_COLS: Record<string, StatCol[]> = {
  passing: fbCols(["GP", "CMP", "ATT", "CMP%", "YDS", "AVG", "YDS/G", "LNG", "TD", "INT", "SACK", "RTG"]),
  rushing: fbCols(["GP", "CAR", "YDS", "AVG", "LNG", "TD", "YDS/G", "FUM"]),
  receiving: fbCols(["GP", "REC", "TGTS", "YDS", "AVG", "TD", "LNG", "YDS/G"]),
};

const SPORTS: Record<TableSportId, {
  label: string; groups: [string, string][]; seasons: number[]; defSeason: number;
}> = {
  mlb: { label: "MLB", groups: [["hitting", "HITTING"], ["pitching", "PITCHING"]], seasons: [2026, 2025, 2024], defSeason: 2026 },
  nfl: { label: "NFL", groups: [["passing", "PASSING"], ["rushing", "RUSHING"], ["receiving", "RECEIVING"]], seasons: [2026, 2025, 2024, 2023], defSeason: 2025 },
  cfb: { label: "NCAAF", groups: [["passing", "PASSING"], ["rushing", "RUSHING"], ["receiving", "RECEIVING"]], seasons: [2026, 2025, 2024, 2023], defSeason: 2025 },
};

/* ---------- row shape + parsers (verbatim logic from legacy) ---------- */
type StatRow = {
  id: number | string;
  name: string;
  team: string;
  pos: string | null;
  gs: number | null;
  stat: Record<string, unknown>;
};

function parseSplits(d: unknown): StatRow[] {
  const splits =
    ((d as { stats?: { splits?: unknown[] }[] })?.stats?.[0]?.splits as {
      player?: { id: number; fullName: string };
      team?: { id: number; name: string; abbreviation?: string };
      position?: { abbreviation?: string };
      stat?: Record<string, unknown>;
    }[]) || [];
  return splits
    .filter((s) => s.player || s.team)
    .map((s) => {
      const st = s.stat || {};
      if (s.player) {
        return {
          id: s.player.id,
          name: s.player.fullName,
          team: s.team ? TEAM_ABBR[s.team.id] || s.team.abbreviation || "—" : "—",
          pos: s.position?.abbreviation ?? null,
          gs: st.gamesStarted != null ? Number(st.gamesStarted) : null,
          stat: st,
        };
      }
      return {
        id: s.team!.id,
        name: s.team!.name,
        team: TEAM_ABBR[s.team!.id] || s.team!.abbreviation || "—",
        pos: null,
        gs: null,
        stat: st,
      };
    });
}

/* ESPN: zip each entity's category totals against the response's top-level
   labels. Team categories come as Own/Opponent pairs — take "Own". */
type EspnCat = { name?: string; displayName?: string; labels?: string[]; totals?: unknown[] };
function fbZip(entCats: EspnCat[], topCats: EspnCat[], grp: string) {
  const m: Record<string, unknown> = {};
  for (const nm of ["general", grp]) {
    const top = topCats.find((c) => c.name === nm);
    if (!top?.labels) continue;
    const ent = entCats.find((c) => c.name === nm && (!c.displayName || c.displayName.indexOf("Opponent") !== 0));
    if (!ent?.totals) continue;
    for (let i = 0; i < top.labels.length && i < ent.totals.length; i++) m[top.labels[i]] = ent.totals[i];
  }
  return m;
}
function parseFootball(d: unknown, grp: string): StatRow[] {
  const data = d as {
    categories?: EspnCat[];
    athletes?: { athlete?: { id: string; displayName?: string; teamShortName?: string; position?: { abbreviation?: string } }; categories?: EspnCat[] }[];
    teams?: { team?: { id: string; displayName?: string; abbreviation?: string }; categories?: EspnCat[] }[];
  };
  if (data?.athletes) {
    return data.athletes.map((a) => {
      const ath = a.athlete || ({} as NonNullable<typeof a.athlete>);
      return {
        id: ath.id, name: ath.displayName || "?", team: ath.teamShortName || "—",
        pos: ath.position?.abbreviation ?? null, gs: null,
        stat: fbZip(a.categories || [], data.categories || [], grp),
      };
    });
  }
  if (data?.teams) {
    return data.teams.map((t) => {
      const tm = t.team || ({} as NonNullable<typeof t.team>);
      return {
        id: tm.id, name: tm.displayName || "?", team: tm.abbreviation || "—",
        pos: null, gs: null, stat: fbZip(t.categories || [], data.categories || [], grp),
      };
    });
  }
  return [];
}

/* ---------- upstream URL builders (verbatim from legacy) ---------- */
function apiUrl(sport: TableSportId, scope: "ind" | "team", group: string, season: number, timeframe: string) {
  if (sport !== "mlb") {
    const lg = sport === "nfl" ? "nfl" : "college-football";
    const q = `?region=us&lang=en&contentorigin=espn&season=${season}&seasontype=2`;
    if (scope === "team")
      return `https://site.web.api.espn.com/apis/common/v3/sports/football/${lg}/statistics/byteam${q}${sport === "cfb" ? "&group=80" : ""}`;
    const srt = { passing: "passing.passingYards", rushing: "rushing.rushingYards", receiving: "receiving.receivingYards" }[group];
    return `https://site.web.api.espn.com/apis/common/v3/sports/football/${lg}/statistics/byathlete${q}&isqualified=true&page=1&limit=350&category=offense%3A${group}&sort=${srt}%3Adesc`;
  }
  let stat = "season", dates = "";
  if (timeframe !== "season") {
    const days = timeframe === "last7" ? 7 : timeframe === "last15" ? 15 : 30;
    const end = new Date(), start = new Date();
    start.setDate(start.getDate() - days + 1);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    stat = "byDateRange";
    dates = `&startDate=${f(start)}&endDate=${f(end)}`;
  }
  if (scope === "team")
    return `https://statsapi.mlb.com/api/v1/teams/stats?stats=${stat}&group=${group}&season=${season}&sportId=1${dates}`;
  return `https://statsapi.mlb.com/api/v1/stats?stats=${stat}&group=${group}&season=${season}&sportId=1&playerPool=All&limit=2500${dates}`;
}

/* ---------- helpers (verbatim behavior) ---------- */
const statNum = (v: unknown) => {
  if (v == null || v === "") return -Infinity;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : -Infinity;
};
const ESPN_LOGO: Record<string, string> = { ARI: "ari", AZ: "ari", CWS: "chw", CHW: "chw", ATH: "oak", OAK: "oak" };
function logoUrl(sport: TableSportId, ab: string) {
  if (!ab || ab === "—" || sport === "cfb") return null; // 750+ college programs — abbr only
  const code = sport === "nfl" ? ab.toLowerCase() : ESPN_LOGO[ab.toUpperCase()] || ab.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/${sport === "nfl" ? "nfl" : "mlb"}/500/${code}.png`;
}
function matchPos(sport: TableSportId, group: string, sel: string, p: StatRow) {
  if (sel === "ALL") return true;
  if (sport !== "mlb") return p.pos === sel;
  if (group === "pitching") {
    const g = Number(p.stat.gamesPlayed || 0), gs = Number(p.gs || 0), sv = Number(p.stat.saves || 0);
    const st = gs >= Math.max(1, g * 0.5);
    if (sel === "SP") return st;
    if (sel === "RP") return !st;
    if (sel === "CP") return !st && sv >= 3;
    return true;
  }
  if (!p.pos) return false;
  if (sel === "OF") return ["LF", "CF", "RF", "OF"].includes(p.pos);
  return p.pos === sel;
}
function posOptions(sport: TableSportId, group: string): [string, string][] {
  if (sport !== "mlb") return [["ALL", "All pos"], ["QB", "QB"], ["RB", "RB"], ["WR", "WR"], ["TE", "TE"]];
  if (group === "hitting")
    return [["ALL", "All pos"], ["C", "C"], ["1B", "1B"], ["2B", "2B"], ["3B", "3B"], ["SS", "SS"], ["LF", "LF"], ["CF", "CF"], ["RF", "RF"], ["OF", "OF"], ["DH", "DH"]];
  return [["ALL", "All"], ["SP", "SP"], ["RP", "RP"], ["CP", "CP"]];
}
const minLabel = (sport: TableSportId, group: string) => (sport !== "mlb" ? "Min GP" : group === "hitting" ? "Min AB" : "Min G");
const minMax = (sport: TableSportId, group: string) => (sport !== "mlb" ? 20 : sport === "mlb" && group === "hitting" ? 200 : 50);
const minStep = (sport: TableSportId, group: string) => (sport === "mlb" && group === "hitting" ? 5 : 1);
const defaultSort = (sport: TableSportId, group: string) =>
  sport !== "mlb" ? { key: "YDS", asc: false } : group === "hitting" ? { key: "homeRuns", asc: false } : { key: "era", asc: true };

const CAP = 400;
const selectCls =
  "rounded-full border border-line-2 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-muted outline-none transition-colors hover:text-text focus:border-pos/60";

/* ---------- page ---------- */
export default function StatsPage() {
  const [sport, setSport] = useState<SportId>("mlb");
  const [scope, setScope] = useState<"ind" | "team">("ind");
  const [group, setGroup] = useState<GroupId>("hitting");
  const [season, setSeason] = useState(2026);
  const [timeframe, setTimeframe] = useState("season");
  const [team, setTeam] = useState("ALL");
  const [position, setPosition] = useState("ALL");
  const [minVal, setMinVal] = useState(0);
  const [query, setQuery] = useState("");

  /* ufc has no stat table — everything below tableSport only drives the table sports */
  const tableSport: TableSportId = sport === "ufc" ? "mlb" : sport;

  // restore the legacy-persisted sport choice
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("pl_sport") || '"mlb"') as SportId;
      if (s === "ufc") setSport("ufc");
      else if (SPORTS[s] && s !== "mlb") pickSport(s);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickSport(s: SportId) {
    setSport(s);
    if (s !== "ufc") {
      setGroup(SPORTS[s].groups[0][0]);
      setSeason(SPORTS[s].defSeason);
      setTimeframe("season");
      setTeam("ALL");
      setPosition("ALL");
      setMinVal(0);
    }
    try { localStorage.setItem("pl_sport", JSON.stringify(s)); } catch {}
  }
  function pickGroup(g: string) {
    setGroup(g);
    setPosition("ALL");
    setMinVal(0);
  }

  const url = apiUrl(tableSport, scope, group, season, tableSport === "mlb" ? timeframe : "season");
  const q = useQuery({
    queryKey: ["stats", url],
    queryFn: async (): Promise<StatRow[]> => {
      const r = await fetch(`/api/stats?u=${encodeURIComponent(url)}`);
      if (!r.ok) throw new Error(`stats feed ${r.status}`);
      const d = await r.json();
      return tableSport === "mlb" ? parseSplits(d) : parseFootball(d, group);
    },
    staleTime: 120_000,
    retry: 2,
    enabled: sport !== "ufc",
  });

  const all = useMemo(() => q.data ?? [], [q.data]);
  const teams = useMemo(
    () => Array.from(new Set(all.map((r) => r.team).filter((t) => t && t !== "—"))).sort(),
    [all],
  );

  const rows = useMemo(() => {
    let r = all;
    if (team !== "ALL") r = r.filter((p) => p.team === team);
    if (scope !== "team") {
      if (position !== "ALL") r = r.filter((p) => matchPos(tableSport, group, position, p));
      if (minVal > 0) {
        const mk = tableSport !== "mlb" ? "GP" : group === "hitting" ? "atBats" : "gamesPlayed";
        r = r.filter((p) => statNum(p.stat[mk]) >= minVal);
      }
    }
    const qq = query.trim().toLowerCase();
    if (qq) r = r.filter((p) => p.name.toLowerCase().includes(qq) || (p.team || "").toLowerCase().includes(qq));
    const ds = defaultSort(tableSport, group);
    return [...r].sort((a, b) => {
      const av = statNum(a.stat[ds.key]), bv = statNum(b.stat[ds.key]);
      return ds.asc ? av - bv : bv - av;
    });
  }, [all, team, scope, position, minVal, query, tableSport, group]);

  const shown = rows.slice(0, CAP);

  const columns = useMemo<Column<StatRow & { rank: number }>[]>(() => {
    const statCols = tableSport !== "mlb" ? FB_COLS[group] || [] : group === "hitting" ? HIT_COLS : PIT_COLS;
    return [
      {
        key: "rank", header: "#", stickyLeft: 0,
        cell: (r) => <span className="text-[11px] text-faint">{r.rank}</span>,
        className: "w-[34px] pr-0", numeric: false,
      },
      {
        key: "name", header: scope === "team" ? "Team" : "Player", stickyLeft: 34,
        sortValue: (r) => r.name,
        cell: (r) => {
          const lg = logoUrl(tableSport, r.team);
          return (
            <span className="flex max-w-[168px] items-center gap-1.5 truncate font-medium text-text md:max-w-[240px]">
              {lg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lg} alt="" className="h-[16px] w-[16px] shrink-0 object-contain" loading="lazy" />
              )}
              <span className="truncate">{r.name}</span>
            </span>
          );
        },
      },
      { key: "team", header: "TM", sortValue: (r) => r.team, cell: (r) => <span className="text-[11px] text-muted">{r.team}</span> },
      ...statCols.map((c) => ({
        key: c.k, header: c.l, numeric: true,
        sortValue: (r: StatRow) => statNum(r.stat[c.k]),
        cell: (r: StatRow) => <span>{c.f(r.stat[c.k])}</span>,
      })),
    ];
  }, [tableSport, group, scope]);

  const ranked = useMemo(() => shown.map((r, i) => ({ ...r, rank: i + 1 })), [shown]);

  return (
    <>
      <PageHeader
        title="Stats"
        sub={
          sport === "ufc"
            ? "UFC — official divisional rankings, pound-for-pound & the full active roster"
            : `${SPORTS[tableSport].label} · ${season} — every ${scope === "team" ? "team" : "player"}, live on open · tap any column to sort`
        }
        action={
          sport !== "ufc" ? (
            <Pill variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? "Refreshing…" : "↻ Refresh"}
            </Pill>
          ) : undefined
        }
      />

      <Reveal>
        <Panel className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["mlb", "nfl", "cfb", "ufc"] as SportId[]).map((s) => (
              <FilterPill key={s} selected={sport === s} onClick={() => pickSport(s)}>
                {s === "mlb" ? "⚾ MLB" : s === "nfl" ? "🏈 NFL" : s === "cfb" ? "🏈 NCAAF" : "🥊 UFC"}
              </FilterPill>
            ))}
            {sport !== "ufc" && (<>
            <span className="mx-1 h-5 w-px bg-line-2" />
            <FilterPill selected={scope === "ind"} onClick={() => setScope("ind")}>INDIVIDUAL</FilterPill>
            <FilterPill selected={scope === "team"} onClick={() => setScope("team")}>TEAM</FilterPill>
            <span className="mx-1 h-5 w-px bg-line-2" />
            {SPORTS[tableSport].groups.map(([g, label]) => (
              <FilterPill key={g} selected={group === g} onClick={() => pickGroup(g)}>{label}</FilterPill>
            ))}
            </>)}
          </div>

          {sport !== "ufc" && (<>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`⌕ Filter ${scope === "team" ? "team" : "player / team"}…`}
              className="min-w-[180px] flex-1 rounded-full border border-line-2 bg-white/[0.03] px-4 py-1.5 text-[12.5px] text-text outline-none transition-colors placeholder:text-faint focus:border-pos/60 md:max-w-[280px]"
            />
            <select className={selectCls} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="ALL">All teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={selectCls} value={season} onChange={(e) => setSeason(Number(e.target.value))}>
              {SPORTS[tableSport].seasons.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {tableSport === "mlb" && (
              <select className={selectCls} value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                <option value="last7">Last 7 Days</option>
                <option value="last15">Last 15 Days</option>
                <option value="last30">Last 30 Days</option>
                <option value="season">{season} Season</option>
              </select>
            )}
            {scope !== "team" && (
              <>
                <select className={selectCls} value={position} onChange={(e) => setPosition(e.target.value)}>
                  {posOptions(tableSport, group).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <label className="flex items-center gap-2 rounded-full border border-line-2 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-muted">
                  {minLabel(tableSport, group)}{minVal > 0 ? ` ${minVal}` : ""}
                  <input
                    type="range" min={0} max={minMax(tableSport, group)} step={minStep(tableSport, group)}
                    value={Math.min(minVal, minMax(tableSport, group))}
                    onChange={(e) => setMinVal(Number(e.target.value) || 0)}
                    className="w-[90px] accent-(--color-pos)"
                  />
                </label>
              </>
            )}
          </div>

          <div className="num mt-3 flex items-center gap-2 text-[10.5px] text-faint">
            <span className={`inline-block h-[7px] w-[7px] rounded-full ${q.isFetching ? "animate-pulse bg-gold" : q.data ? "bg-pos" : "bg-neg"}`} />
            {q.isFetching
              ? "Loading live data…"
              : q.data
                ? `Live · ${new Date(q.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${all.length.toLocaleString()} ${scope === "team" ? "teams" : "players"}`
                : "No data"}
          </div>
          </>)}
        </Panel>
      </Reveal>

      {sport === "ufc" ? (
        <UfcRankings />
      ) : q.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[38px] rounded-[12px]" />)}
        </div>
      ) : q.isError ? (
        <Panel>
          <ErrorState
            title="Couldn't load live stats"
            body={
              tableSport !== "mlb" && season > SPORTS[tableSport].defSeason
                ? `The ${season} ${SPORTS[tableSport].label} season hasn't kicked off yet — stats will appear here once games are played.`
                : "The live feed didn't answer — tap Retry."
            }
            onRetry={() => q.refetch()}
          />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="No players match"
            body={
              tableSport !== "mlb" && season > SPORTS[tableSport].defSeason
                ? `The ${season} ${SPORTS[tableSport].label} season hasn't kicked off yet — stats will appear here once games are played.`
                : "Loosen the filters or clear the search."
            }
          />
        </Panel>
      ) : (
        <Reveal>
          <DataTable
            key={`${tableSport}-${scope}-${group}`}
            columns={columns}
            rows={ranked}
            rowKey={(r) => `${r.id}`}
            maxHeight="68vh"
          />
          {rows.length > CAP && (
            <div className="mt-2 text-[11px] text-faint">
              +{(rows.length - CAP).toLocaleString()} more loaded — search or sort to surface any of them.
            </div>
          )}
        </Reveal>
      )}

      <div className="mt-6 text-[10.5px] text-faint">
        MLB Stats API + ESPN, live — the same feeds as the original Stats tab. Informational only, not betting advice.
      </div>
    </>
  );
}
