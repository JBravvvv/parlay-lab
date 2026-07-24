"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { FilterPill, Pill } from "@/components/ui/Pill";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import type { PickRow, PropBoardGame, PropBoardRow } from "@/engine";
import { amFmt, combineTicket, type SandboxLeg } from "@/lib/ticket-math";
import { parseMatchup, teamAbbr, teamCode, teamLogo, teamLogoFromLabel, useHeadshots } from "@/lib/mlb-visuals";

/**
 * PARLAY BUILDER (sandbox, 2026-07-24) — a Caesars-style prop board for messing
 * around with tickets that are NOT tracked: no lock, no ledger, no bankroll math.
 *
 * Player props read the board's FULL prop board (`data.propBoard`): every player
 * the odds feed posts, both sides, every line, uncapped. The engine's ranked
 * `categories` are the selection pool — top 50 per market, one side, and only
 * players past the model's lineup/sample filters — which is the right pool to
 * pick plays from and the wrong one to browse a book with. Game markets (ML/RL)
 * still come from `categories`, where they are never truncated.
 *
 * Nothing is ever invented: prices are real posted quotes (Caesars when Caesars
 * posts the line, otherwise the best price in the feed, labelled with the book),
 * and the win % is either the engine's own model number for that line or the
 * de-vigged market fair, always tagged as one or the other.
 */

const TABS = [
  { key: "games", label: "Games" },
  { key: "batter", label: "Batter Props" },
  { key: "pitcher", label: "Pitcher Props" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** cat = engine market key; null = posted at the book, not in the feed mirror. */
const MARKETS: Record<TabKey, { key: string; label: string; cat: string | null }[]> = {
  games: [
    { key: "ml", label: "Moneyline", cat: "ml" },
    { key: "rl", label: "Run Line", cat: "rl" },
    { key: "r1st", label: "Run In 1st Inning", cat: null },
    { key: "fp", label: "First Pitch", cat: null },
    { key: "f3", label: "1st 3 Innings", cat: null },
    { key: "f5", label: "1st 5 Innings", cat: null },
  ],
  batter: [
    { key: "hr", label: "Anytime HR", cat: "batter_home_runs" },
    { key: "hits", label: "Hits", cat: "batter_hits" },
    { key: "tb", label: "Total Bases O/U", cat: "batter_total_bases" },
    { key: "hrr", label: "Hits + Runs + RBI O/U", cat: "batter_hits_runs_rbis" },
    { key: "rbi", label: "RBI", cat: null },
    { key: "runs", label: "Batter Runs", cat: null },
    { key: "xbh", label: "Extra-Base Hit", cat: null },
    { key: "singles", label: "Singles", cat: null },
  ],
  pitcher: [
    { key: "k", label: "Pitcher Strikeouts O/U", cat: "pitcher_strikeouts" },
    { key: "outs", label: "Outs Recorded O/U", cat: "pitcher_outs" },
    { key: "er", label: "Earned Runs Allowed O/U", cat: null },
    { key: "ha", label: "Hits Allowed O/U", cat: null },
    { key: "walks", label: "Pitcher Walks O/U", cat: null },
    { key: "mostk", label: "Most Strikeouts", cat: null },
  ],
};

const MKT_LABEL: Record<string, string> = {
  batter_hits: "Hits",
  batter_total_bases: "Total Bases",
  batter_home_runs: "HR",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "K's",
  pitcher_outs: "Outs",
};

/** book titles as the feed spells them → the short tag that fits on a price button */
const BOOK_AB: Record<string, string> = {
  caesars: "CZ",
  "william hill (us)": "CZ",
  draftkings: "DK",
  fanduel: "FD",
  betmgm: "MGM",
  "espn bet": "ESPN",
  betrivers: "BR",
  fanatics: "FAN",
  bovada: "BOV",
  pinnacle: "PIN",
  betonlineag: "BOL",
  lowvig: "LOW",
  "betus": "BUS",
  mybookieag: "MYB",
  betfair: "BF",
};
const bookAb = (b: string) => BOOK_AB[b.trim().toLowerCase()] ?? b.slice(0, 4).toUpperCase();

const isGameMarket = (cat: string) => cat === "ml" || cat === "rl";
const legId = (r: PickRow) => `${r.lkey ?? ""}|${r.label}|${r.sub}`;
/** accent/punctuation-proof search key */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "");

/* ---------------------------------------------------------------- game markets */

type GameGroup = { game: string; away: string; home: string; time: string; rows: PickRow[] };

function groupByGame(rows: PickRow[]): GameGroup[] {
  const by = new Map<string, GameGroup>();
  for (const r of rows) {
    const g = String(r.game ?? "");
    if (!g) continue;
    const cur = by.get(g);
    if (cur) {
      cur.rows.push(r);
      continue;
    }
    const m = parseMatchup(g);
    by.set(g, { game: g, away: m.away, home: m.home, time: m.time, rows: [r] });
  }
  return [...by.values()].sort((a, b) => (a.game < b.game ? -1 : 1));
}

type OppSide = { label: string; odds?: string | null; cz?: number | null; prob?: number; pt?: number | null; lkey?: string | null };
const sPt = (v: number) => (v > 0 ? `+${v}` : String(v));

/** The other team of an ML/RL row (real quotes the engine now exports). Boards
    generated before this shipped lack `opp` and just show the engine's side. */
function oppRow(r: PickRow): PickRow | null {
  const o = r.opp as OppSide | null | undefined;
  if (!o || !o.label) return null;
  const rl = (r.lkey ?? "").startsWith("rl");
  return {
    label: o.label,
    sub: rl ? `RL ${o.pt != null ? sPt(o.pt) : ""} vs ${r.label}`.replace("  ", " ") : `ML vs ${r.label}`,
    cz: o.cz ?? null,
    prob: o.prob,
    game: r.game,
    gkey: r.gkey,
    lkey: o.lkey ?? null,
    live: r.live,
  } as PickRow;
}

/** Expand game-market rows to both sides, away listed first (Caesars order). */
function bothSides(rows: PickRow[]): PickRow[] {
  const out: PickRow[] = [];
  for (const r of rows) {
    const o = oppRow(r);
    const pair = o ? [r, o] : [r];
    pair.sort((a, b) => ((a.lkey ?? "").endsWith("away") ? -1 : 1) - ((b.lkey ?? "").endsWith("away") ? -1 : 1));
    out.push(...pair);
  }
  return out;
}

/* ------------------------------------------------------------------- visuals */

function Avatar({ src, label }: { src: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-8 w-8 shrink-0 rounded-full border border-white/[0.08] bg-surface-2 object-cover"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-surface-2 text-[11px] font-bold text-muted">
      {label
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0] ?? "")
        .join("")
        .toUpperCase()}
    </span>
  );
}

function TeamMark({ name, side }: { name: string; side: "away" | "home" }) {
  const code = teamCode(name);
  const img = code ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={teamLogo(code)} alt="" loading="lazy" className="h-7 w-7 object-contain" />
  ) : null;
  const ab = <span className="text-[14px] font-bold tracking-wide text-text">{teamAbbr(name)}</span>;
  return (
    <span className="flex items-center gap-2">
      {side === "away" ? img : ab}
      {side === "away" ? ab : img}
    </span>
  );
}

function GameHeader({ game, open, onToggle }: { game: string; open: boolean; onToggle: () => void }) {
  const m = parseMatchup(game);
  return (
    <button className="flex w-full items-center justify-between gap-2" onClick={onToggle}>
      <TeamMark name={m.away} side="away" />
      <span className="num text-[11px] text-muted">
        {m.time} {open ? "▾" : "▸"}
      </span>
      <TeamMark name={m.home} side="home" />
    </button>
  );
}

/* --------------------------------------------------------------- player props */

type Side = "o" | "u";

/** The price for one side: Caesars when Caesars posts it, else the feed's best. */
function sidePrice(r: PropBoardRow, side: Side): { am: number; book: string } | null {
  const cz = r.cz ? (side === "o" ? r.cz.o : r.cz.u) : null;
  if (cz != null) return { am: cz, book: "CZ" };
  const am = side === "o" ? r.o : r.u;
  if (am == null) return null;
  const b = side === "o" ? r.oBook : r.uBook;
  return { am, book: b ? bookAb(b) : "BOOK" };
}

/** The win % for one side, and where it came from. */
function sideProb(r: PropBoardRow, side: Side): { pct: number; src: "model" | "market" } | null {
  const base = r.pO != null ? { pct: r.pO, src: "model" as const } : r.fO != null ? { pct: r.fO, src: "market" as const } : null;
  if (!base) return null;
  return { pct: side === "o" ? base.pct : 100 - base.pct, src: base.src };
}

const rankOf = (r: PropBoardRow) => (r.pO != null ? r.pO : r.fO != null ? r.fO : -1);

/** "Anytime HR" / "Over 1.5" — the bet as the book words it. */
function sideLabel(cat: string, r: PropBoardRow, side: Side): string {
  if (cat === "batter_home_runs" && r.ln === 0.5) return side === "o" ? "Anytime HR" : "No HR";
  return `${side === "o" ? "Over" : "Under"} ${r.ln}`;
}

function SideButton({
  r,
  cat,
  side,
  selected,
  onToggle,
}: {
  r: PropBoardRow;
  cat: string;
  side: Side;
  selected: boolean;
  onToggle: () => void;
}) {
  const price = sidePrice(r, side);
  const prob = sideProb(r, side);
  if (!price) {
    return (
      <span className="flex-1 rounded-[10px] border border-white/[0.05] bg-surface-2/40 px-2 py-1.5 text-center text-[10px] text-faint">
        not posted
      </span>
    );
  }
  return (
    <button
      onClick={onToggle}
      className={`flex flex-1 items-center justify-between gap-2 rounded-[10px] border px-2.5 py-1.5 transition-colors ${
        selected ? "border-pos/60 bg-pos/15" : "border-white/[0.08] bg-surface-2 hover:border-pos/40"
      }`}
    >
      <span className="min-w-0 text-left">
        <span className="block truncate text-[10.5px] text-muted">{sideLabel(cat, r, side)}</span>
        {prob && (
          <span className={`num block text-[9.5px] ${prob.src === "model" ? "text-faint" : "text-faint italic"}`}>
            {prob.pct.toFixed(1)}%{prob.src === "market" ? " mkt" : ""}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="num block text-[12.5px] font-semibold text-pos">{amFmt(price.am)}</span>
        {price.book !== "CZ" && <span className="block text-[8.5px] uppercase text-faint">{price.book}</span>}
      </span>
    </button>
  );
}

function PlayerRow({
  r,
  cat,
  game,
  gkey,
  headshot,
  isSel,
  onToggle,
}: {
  r: PropBoardRow;
  cat: string;
  game: string;
  gkey: string | null;
  headshot: string | null;
  isSel: (id: string) => boolean;
  onToggle: (leg: SandboxLeg) => void;
}) {
  const mk = (side: Side): SandboxLeg | null => {
    const price = sidePrice(r, side);
    const prob = sideProb(r, side);
    if (!price) return null;
    return {
      id: `${gkey ?? game}|${r.lkey}|${side}`,
      label: r.p + (r.tm ? ` (${r.tm})` : ""),
      sub: `${MKT_LABEL[cat] ?? cat} ${sideLabel(cat, r, side)}`,
      game,
      cz: price.am,
      prob: prob?.pct ?? 0,
      market: cat,
      book: price.book,
      src: prob?.src,
    };
  };
  const sides: Side[] = ["o", "u"];
  return (
    <div className="border-t border-white/[0.04] py-2">
      <div className="mb-1.5 flex items-center gap-2.5">
        <Avatar src={headshot} label={r.p} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-text">
            {r.p}
            {r.tm && <span className="ml-1.5 text-[10px] text-muted">{r.tm}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <span>{MKT_LABEL[cat] ?? cat}</span>
            {r.alt && (
              <span className="rounded-full border border-line-2 bg-surface-2 px-1.5 py-px text-[8.5px] font-bold uppercase text-muted">
                alt
              </span>
            )}
            {r.lu === "projected" && (
              <span className="rounded-full border border-line-2 bg-surface-2 px-1.5 py-px text-[8.5px] font-bold uppercase text-muted">
                proj
              </span>
            )}
            {r.pO == null && <span className="text-faint">market price only</span>}
          </div>
        </div>
      </div>
      <div className="flex gap-1.5 pl-[42px]">
        {sides.map((side) => {
          const leg = mk(side);
          return leg ? (
            <SideButton
              key={side}
              r={r}
              cat={cat}
              side={side}
              selected={isSel(leg.id)}
              onToggle={() => onToggle(leg)}
            />
          ) : (
            <span key={side} className="flex-1" />
          );
        })}
      </div>
    </div>
  );
}

function PropGameCard({
  g,
  cat,
  rows,
  headshots,
  isSel,
  onToggle,
}: {
  g: PropBoardGame;
  cat: string;
  rows: PropBoardRow[];
  headshots: Record<string, string>;
  isSel: (id: string) => boolean;
  onToggle: (leg: SandboxLeg) => void;
}) {
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(8);
  return (
    <Panel>
      <GameHeader game={g.game} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="mt-2">
          <div className="text-[10px] text-faint">
            {rows.length} line{rows.length === 1 ? "" : "s"} priced
          </div>
          {rows.slice(0, shown).map((r) => (
            <PlayerRow
              key={`${r.lkey}|${r.alt ? "a" : "s"}`}
              r={r}
              cat={cat}
              game={g.game}
              gkey={g.gkey}
              headshot={headshots[r.p] ?? null}
              isSel={isSel}
              onToggle={onToggle}
            />
          ))}
          {rows.length > shown && (
            <button
              className="mt-2 w-full text-center text-[11.5px] font-semibold text-pos"
              onClick={() => setShown(rows.length)}
            >
              Show More ({rows.length - shown}) ▾
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}

function GameMarketCard({
  g,
  market,
  isSel,
  onToggle,
}: {
  g: GameGroup;
  market: string;
  isSel: (id: string) => boolean;
  onToggle: (leg: SandboxLeg) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Panel>
      <GameHeader game={g.game} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="mt-2">
          {g.rows.map((r) => {
            const cz = typeof r.cz === "number" ? r.cz : null;
            const prob = typeof r.prob === "number" ? r.prob : null;
            const id = legId(r);
            return (
              <div key={id} className="flex items-center justify-between gap-2 border-t border-white/[0.04] py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar src={teamLogoFromLabel(r.label)} label={r.label} />
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-text">{r.label}</div>
                    <div className="text-[10.5px] text-muted">{r.sub}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {prob != null && (
                    <span className="num text-[10.5px] text-muted" title="Engine blended true win % for this side">
                      {prob.toFixed(1)}%
                    </span>
                  )}
                  {cz != null ? (
                    <button
                      onClick={() =>
                        onToggle({
                          id,
                          label: r.label,
                          sub: r.sub,
                          game: String(r.game ?? ""),
                          cz,
                          prob: prob ?? 0,
                          market,
                          book: "CZ",
                          src: "model",
                        })
                      }
                      className={`num min-w-[72px] rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                        isSel(id)
                          ? "border-pos/60 bg-pos/15 text-pos"
                          : "border-white/[0.08] bg-surface-2 text-pos hover:border-pos/40"
                      }`}
                    >
                      {amFmt(cz)}
                    </button>
                  ) : (
                    <span className="min-w-[72px] rounded-[10px] border border-white/[0.05] bg-surface-2/50 px-3 py-2 text-center text-[10px] text-faint">
                      no CZ
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------------- page */

export default function PropsPage() {
  const q = useBoard();
  const regen = useRegenerateBoard();
  const [tab, setTab] = useState<TabKey>("games");
  const [mktKey, setMktKey] = useState<string>("ml");
  const [legs, setLegs] = useState<SandboxLeg[]>([]);
  const [stake, setStake] = useState(10);
  const [search, setSearch] = useState("");

  const d = q.data?.data;
  const mkt = MARKETS[tab].find((m) => m.key === mktKey) ?? MARKETS[tab][0];
  const cat = mkt.cat;
  const gameTab = !!cat && isGameMarket(cat);

  /* ML/RL: the ranked categories (never truncated — one row per game) */
  const gameRows = useMemo(() => {
    if (!d || !cat || !gameTab) return [];
    const cats = (d.categories ?? {}) as Record<string, PickRow[]>;
    const live = (d.categoriesLive ?? {}) as Record<string, PickRow[]>;
    const seen = new Set<string>();
    const base = [...(cats[cat] ?? []), ...(live[cat] ?? [])].filter((r) => {
      const id = legId(r);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return bothSides(base);
  }, [d, cat, gameTab]);
  const gameGroups = useMemo(() => groupByGame(gameRows), [gameRows]);

  /* player props: the FULL prop board — every player, both sides, uncapped */
  const propBoard = (d?.propBoard ?? []) as PropBoardGame[];
  const propGames = useMemo(() => {
    if (!cat || gameTab) return [];
    const needle = norm(search.trim());
    return propBoard
      .map((g) => {
        let rows = (g.markets?.[cat] ?? []).slice();
        if (needle) rows = rows.filter((r) => norm(r.p).includes(needle));
        rows.sort((a, b) => rankOf(b) - rankOf(a));
        return { g, rows };
      })
      .filter((x) => x.rows.length > 0);
  }, [propBoard, cat, gameTab, search]);

  const totalRows = propGames.reduce((n, x) => n + x.rows.length, 0);
  const playerNames = useMemo(
    () => [...new Set(propGames.flatMap((x) => x.rows.map((r) => r.p)))],
    [propGames],
  );
  const headshots = useHeadshots(playerNames);

  /* a board generated before the full prop board shipped has no `propBoard` */
  const legacyBoard = !!d && !d.propBoard && !gameTab;

  const isSel = (id: string) => legs.some((l) => l.id === id);
  const toggle = (leg: SandboxLeg) =>
    setLegs((cur) => (cur.some((l) => l.id === leg.id) ? cur.filter((l) => l.id !== leg.id) : [...cur, leg]));

  const calc = useMemo(() => combineTicket(legs), [legs]);
  const anyMarketProb = legs.some((l) => l.src === "market");

  const empty = gameTab ? gameGroups.length === 0 : propGames.length === 0;

  return (
    <>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[19px] font-bold tracking-tight text-text">Parlay Builder</h1>
        <span className="text-[10.5px] text-faint">Sandbox — nothing here is tracked or enters the ledger</span>
      </div>

      <div className="mb-2 flex gap-1.5">
        {TABS.map((t) => (
          <FilterPill
            key={t.key}
            selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setMktKey(MARKETS[t.key][0].key);
            }}
          >
            {t.label}
          </FilterPill>
        ))}
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {MARKETS[tab].map((m) => (
          <span key={m.key} className="shrink-0">
            <FilterPill selected={mkt.key === m.key} onClick={() => setMktKey(m.key)}>
              {m.label}
            </FilterPill>
          </span>
        ))}
      </div>

      {!gameTab && cat != null && (
        <div className="mb-3 flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            className="min-w-0 flex-1 rounded-[10px] border border-white/[0.08] bg-surface-2 px-3 py-2 text-[12.5px] text-text placeholder:text-faint"
          />
          <span className="num shrink-0 text-[10.5px] text-faint">
            {totalRows} line{totalRows === 1 ? "" : "s"} · {propGames.length} game{propGames.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {q.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[64px] rounded-[14px]" />
          ))}
        </div>
      ) : cat == null ? (
        <Panel>
          <EmptyState
            title={`${mkt.label} — not in the feed mirror yet`}
            body="This market is posted at Caesars Sportsbook — the app's odds feed simply mirrors a subset of the book and doesn't carry it yet, so there are no real prices to show here (prices are never invented). The priced categories are the ones the engine already collects."
          />
        </Panel>
      ) : legacyBoard ? (
        <Panel>
          <EmptyState
            title="This board predates the full prop board"
            body="Your cached board was generated before every player's prices were exported. Regenerate it and the whole book — every player, both sides — appears here."
          />
          <div className="mt-3 text-center">
            <Pill variant="ghost" onClick={() => regen.mutate()}>
              {regen.isPending ? "Generating…" : "Regenerate board"}
            </Pill>
          </div>
        </Panel>
      ) : !d || empty ? (
        <Panel>
          <EmptyState
            title={search.trim() ? "No player matches that search" : "No board yet"}
            body={
              search.trim()
                ? "Clear the search to see every player the book posts for this market."
                : "The prop board comes from today's generated quant board. Generate one (Board tab or the button below) and every game, batter prop and pitcher prop appears here with the engine's win % next to its price."
            }
          />
          {!search.trim() && (
            <div className="mt-3 text-center">
              <Pill variant="ghost" onClick={() => regen.mutate()}>
                {regen.isPending ? "Generating…" : "Generate today's board"}
              </Pill>
            </div>
          )}
        </Panel>
      ) : (
        <div className="space-y-3 pb-40">
          {gameTab
            ? gameGroups.map((g) => (
                <Reveal key={g.game}>
                  <GameMarketCard g={g} market={cat} isSel={isSel} onToggle={toggle} />
                </Reveal>
              ))
            : propGames.map(({ g, rows }) => (
                <Reveal key={g.game}>
                  <PropGameCard
                    g={g}
                    cat={cat}
                    rows={rows}
                    headshots={headshots}
                    isSel={isSel}
                    onToggle={toggle}
                  />
                </Reveal>
              ))}
          <div className="text-[10px] leading-relaxed text-faint">
            {gameTab ? (
              <>Prices are the board&apos;s captured Caesars quotes; the % is the engine&apos;s blended win % for that side.</>
            ) : (
              <>
                Every player the odds feed posts for this market, both sides, uncapped. Prices are real posted quotes —
                Caesars when Caesars posts the line, otherwise the best price in the feed with the book named on the
                button. The % is the engine&apos;s model number for that line; where the engine didn&apos;t price the
                player (bench bats, sub-25-AB samples, unposted lineups) it is the de-vigged market fair, tagged{" "}
                <span className="italic">mkt</span> — a price the market thinks is fair, not an edge. ALT = a Caesars
                milestone ladder line. Nothing here is tracked or enters the ledger.
              </>
            )}
          </div>
        </div>
      )}

      {/* the slip — fixed bottom sheet, Caesars-style */}
      {legs.length > 0 && calc && (
        <div className="fixed inset-x-0 bottom-[64px] z-40 mx-auto max-w-[720px] px-3 md:bottom-4 md:pl-[212px]">
          <div className="rounded-[16px] border border-white/[0.1] bg-surface/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
                Ticket · {calc.n} leg{calc.n > 1 ? "s" : ""}
              </span>
              <button className="text-[11px] font-semibold text-neg" onClick={() => setLegs([])}>
                Clear all
              </button>
            </div>
            <div className="max-h-[30vh] space-y-1 overflow-y-auto">
              {legs.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="min-w-0 truncate text-text">
                    {l.label} <span className="text-muted">{l.sub}</span>
                    <span className="ml-1 text-faint">({l.game.split(" · ")[0]})</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`num text-muted ${l.src === "market" ? "italic" : ""}`}>
                      {l.prob.toFixed(1)}%
                    </span>
                    <span className="num text-pos">
                      {amFmt(l.cz)}
                      {l.book && l.book !== "CZ" && <span className="ml-0.5 text-[9px] uppercase text-faint">{l.book}</span>}
                    </span>
                    <button className="text-neg" onClick={() => setLegs((cur) => cur.filter((x) => x.id !== l.id))}>
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <div className="num mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] pt-2 text-[12px]">
              <span>
                <span className="text-muted">Odds </span>
                <b className="text-pos">{amFmt(calc.am)}</b>
              </span>
              <span>
                <span className="text-muted">True </span>
                <b className={calc.trueProb > calc.impProb ? "text-pos" : "text-text"}>
                  {(calc.trueProb * 100).toFixed(1)}%
                </b>
                <span className="text-faint"> (implied {(calc.impProb * 100).toFixed(1)}%)</span>
              </span>
              <span>
                <span className="text-muted">EV </span>
                <b className={calc.ev >= 0 ? "text-pos" : "text-neg"}>
                  {calc.ev >= 0 ? "+" : ""}
                  {(calc.ev * 100).toFixed(1)}%
                </b>
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-muted">$</span>
                <input
                  type="number"
                  value={stake}
                  min={0}
                  onChange={(e) => setStake(Math.max(0, Number(e.target.value) || 0))}
                  className="w-[64px] rounded-[8px] border border-white/[0.08] bg-surface-2 px-2 py-1 text-right text-[12px] text-text"
                />
                <span className="text-muted">pays</span>
                <b className="text-text">${calc.payout(stake).toFixed(2)}</b>
              </span>
            </div>
            <div className="mt-1.5 text-[9.5px] text-faint">
              True % is the naive product — same-game legs are correlated and this sandbox does not model that.
              {anyMarketProb && (
                <> Italic legs use the market&apos;s own fair %, so their EV is ~0 by construction, not an edge.</>
              )}{" "}
              Not tracked, never enters the ledger.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
