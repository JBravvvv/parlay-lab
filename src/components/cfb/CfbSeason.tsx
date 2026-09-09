"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { FilterPill, Pill } from "@/components/ui/Pill";
import { Segmented } from "@/components/ui/Segmented";
import { StatTile } from "@/components/ui/StatTile";
import { EvBadge } from "@/components/ui/EvBadge";
import { KellyChip } from "@/components/ui/KellyChip";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { fmtAmerican, fmtMoney, fmtMoneyExact, fmtPct } from "@/lib/format";
import { decToAm } from "@/lib/ticket-math";
import {
  CFB_SEASON,
  SEASON_STATS,
  addSeasonLeg,
  makeSeasonLeg,
  paceOf,
  priceSeasonLeg,
  priceSeasonParlay,
  projectPlayerStat,
  projectWinTotal,
  projectionFor,
  projectionInputs,
  seasonLedgerStats,
  seasonTicketPnl,
  validSeasonPrice,
  type SeasonFeed,
  type SeasonLeg,
  type SeasonPace,
  type SeasonPlayer,
  type SeasonProjection,
  type SeasonResult,
  type SeasonSide,
  type SeasonStat,
  type SeasonTeam,
  type SeasonTicket,
} from "@/lib/cfb/season";
import { clampSeasonStake, rehydrateSeasonStore, useSeasonStore } from "@/lib/cfb/season-store";

/**
 * SEASON LAB (INSTRUCTION 46, 2026-09-08, Josh's word, verbatim: "Should be evaluating season long
 * props and season long prop parlays so I can mess around and have fun with a bunch of season long
 * tickets; win totals, receiving yards overs, Pass Yards/TDs overs, rushing yards overs,
 * rush/receiving TDs overs etc").
 *
 * Three surfaces (a two-column grid from md; on a phone the BUILDER sits first, then the board,
 * then the ledger — tapping a row on the board scrolls the builder into view):
 *   1. THE BOARD — every player on ESPN's top-250 passing / rushing / receiving tables and every
 *      FBS team on the FPI feed, searchable, with the model's projected season total (its fair
 *      line, the median) per stat. Tapping a stat chip or a team row loads it into the builder.
 *   2. THE SEASON TICKET BUILDER — Josh types the book's line and price (Caesars by default —
 *      NO feed carries season lines, so nothing here is fetched or invented) and reads the fair
 *      probability, the fair price, EV% and ¼-Kelly against the season fun pot; "Add leg" builds
 *      a season parlay (independent product, same-team legs flagged and haircut), a $ stake
 *      (default $5, cap $25 — the fun-money spirit, on its own key, never the daily rails) and
 *      LOCK writes it to the season ledger.
 *   3. THE SEASON LEDGER — every locked ticket with each leg's pace against the LATEST projection
 *      ("on pace" / "behind" / "cleared" / "dead") and a manual Won / Lost / Void settle — the
 *      season ends in December and no feed grades a season prop, so nothing settles itself.
 *
 * Every number on the page is ESPN's own stat / rating, a typed line or price, or arithmetic on
 * those (src/lib/cfb/season.ts); a missing one renders "—".
 */

export const SEASON_QUERY_KEY = ["cfb", "season"] as const;
/** the route's data-cache window — the query never polls */
export const SEASON_STALE_MS = 3600_000;
/** rows shown before the search narrows the board (a 750-row list is not a phone surface): 15 on a
 *  phone, 40 from md, and a "Show more" control pages the rest in by the same step */
const BOARD_ROWS_PHONE = 15;
const BOARD_ROWS_DESKTOP = 40;
const PHONE_MQ = "(max-width: 767px)";

/** "USC Trojans" — the abbr + ESPN's nickname; either alone when the other is missing; "—" with neither. */
export function teamLabel(p: Pick<SeasonPlayer, "team" | "teamAbbr">): string {
  return [p.teamAbbr, p.team].filter((x): x is string => x != null && x !== "").join(" ") || "—";
}

/** "returns $12.50 · to win +$7.50" — the total return unsigned, the profit signed, never conflated. */
export function returnsLabel(stake: number, dec: number): string {
  const ret = stake * dec;
  return `returns $${ret.toFixed(2)} · to win ${fmtMoneyExact(ret - stake)}`;
}

const matchesPlayer = (p: SeasonPlayer, needle: string) =>
  norm(p.name).includes(needle) || (p.team != null && norm(p.team).includes(needle)) || (p.teamAbbr != null && norm(p.teamAbbr).includes(needle));

type Scope = "players" | "teams";
type Selection = { kind: "player"; player: SeasonPlayer; stat: SeasonStat } | { kind: "team"; team: SeasonTeam };

const SCOPES = [
  { key: "players", label: "Players" },
  { key: "teams", label: "Win totals" },
] as const;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const n0 = (v: number, dp = 0) => v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const isCount = (stat: SeasonStat) => stat.endsWith("tds") || stat === "receptions";

async function loadSeasonFeed(): Promise<SeasonFeed> {
  const r = await fetch("/api/cfb/season", { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as (SeasonFeed & { error?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.error ?? `season feed ${r.status}`);
  return j;
}

/** the pace chip's tone */
const PACE_TONE: Record<SeasonPace, string> = {
  cleared: "border-pos/50 bg-pos/15 text-pos",
  "on pace": "border-pos/30 bg-pos/[0.08] text-pos",
  behind: "border-neg/40 bg-neg/10 text-neg",
  dead: "border-neg/50 bg-neg/15 text-neg",
  "—": "border-line-2 bg-surface-2 text-muted",
};

export function CfbSeason() {
  const feed = useQuery<SeasonFeed>({ queryKey: SEASON_QUERY_KEY, queryFn: loadSeasonFeed, staleTime: SEASON_STALE_MS });
  const tickets = useSeasonStore((s) => s.tickets);
  const lock = useSeasonStore((s) => s.lock);
  const settle = useSeasonStore((s) => s.settle);
  const remove = useSeasonStore((s) => s.remove);
  useEffect(() => rehydrateSeasonStore(), []);

  const [scope, setScope] = useState<Scope>("players");
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState<Selection | null>(null);
  const [side, setSide] = useState<SeasonSide>("over");
  const [lineText, setLineText] = useState("");
  const [priceText, setPriceText] = useState("-110");
  const [book, setBook] = useState<string>(CFB_SEASON.defaultBook);
  const [legs, setLegs] = useState<SeasonLeg[]>([]);
  const [stake, setStake] = useState<number>(CFB_SEASON.ticketDefault);
  const [note, setNote] = useState<string | null>(null);
  /* the board's page size: phone vs desktop, reset when the search or scope changes; "Show more" steps it */
  const [phone, setPhone] = useState(false);
  const [extraRows, setExtraRows] = useState(0);
  const builderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(PHONE_MQ);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const pageRows = phone ? BOARD_ROWS_PHONE : BOARD_ROWS_DESKTOP;
  const boardRows = pageRows + extraRows;

  const data = feed.data;
  const needle = norm(search.trim());

  const playerMatches = useMemo(() => (data ? (needle ? data.players.filter((p) => matchesPlayer(p, needle)) : data.players) : []), [data, needle]);
  const players = useMemo(() => playerMatches.slice(0, boardRows), [playerMatches, boardRows]);
  const playerTotal = playerMatches.length;

  const teamMatches = useMemo(() => (data ? (needle ? data.teams.filter((t) => norm(t.name).includes(needle) || norm(t.abbr).includes(needle)) : data.teams) : []), [data, needle]);
  const teams = useMemo(() => teamMatches.slice(0, boardRows), [teamMatches, boardRows]);

  /* the projection the builder is priced on */
  const proj: SeasonProjection | null = useMemo(() => {
    if (!pick) return null;
    return pick.kind === "player" ? projectPlayerStat(pick.player, pick.stat) : projectWinTotal(pick.team, data?.avgFpi ?? null);
  }, [pick, data?.avgFpi]);
  const line = Number(lineText);
  const price = Number(priceText);
  const priced = proj && lineText.trim() !== "" && Number.isFinite(line) && validSeasonPrice(price) ? priceSeasonLeg(proj, side, line, price) : null;
  const pendingId = proj && priced ? makeSeasonLeg(proj, priced).id : null;
  const parlay = useMemo(() => priceSeasonParlay(legs), [legs]);
  const stats = useMemo(() => seasonLedgerStats(tickets), [tickets]);

  const choose = (p: Selection) => {
    setPick(p);
    setNote(null);
    const pr = p.kind === "player" ? projectPlayerStat(p.player, p.stat) : projectWinTotal(p.team, data?.avgFpi ?? null);
    /* the fair line pre-fills as a half-point so Josh only has to move it to the book's number */
    if (pr) setLineText(String(Math.floor(pr.projected) + 0.5));
    /* on a phone the builder sits above the board, so a tap deep in the list brings it back into view */
    if (phone) builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const onSearch = (v: string) => {
    setSearch(v);
    setExtraRows(0);
  };
  const onScope = (v: Scope) => {
    setScope(v);
    setExtraRows(0);
  };
  const addLeg = () => {
    if (!proj || !priced) return;
    const leg = makeSeasonLeg(proj, priced, book.trim() || CFB_SEASON.defaultBook);
    setLegs((cur) => addSeasonLeg(cur, leg));
    setNote(null);
  };
  const lockTicket = () => {
    const t = lock(legs, stake);
    if (!t) return;
    setLegs([]);
    setNote(`Locked — ${t.legs.length}-leg season ticket, ${fmtMoney(t.stake)} at ${fmtAmerican(decToAm(t.dec))}. Paper only; settle it by hand in December.`);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-cfb/30 bg-cfb/[0.07] px-3 py-2 text-[11px] leading-snug text-cfb">
        Season lines are typed by hand — no feed the desk may read carries season-long props or win totals. The projections are the
        model&apos;s; the line and price are the book&apos;s, from your thumbs.
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Open tickets" value={n0(stats.open)} tone="cfb" />
        <StatTile label="Record" value={`${stats.won}-${stats.lost}${stats.voided ? `-${stats.voided}v` : ""}`} sub={`${fmtMoney(stats.staked)} staked`} />
        <StatTile label="Season P/L" value={fmtMoneyExact(stats.pnl)} tone={stats.pnl > 0 ? "pos" : stats.pnl < 0 ? "neg" : "muted"} sub="paper, hand-settled" />
        <StatTile label="Kelly bank" value={fmtMoney(CFB_SEASON.kellyBank)} sub={`¼K sizing · ticket cap ${fmtMoney(CFB_SEASON.ticketMax)}`} tone="gold" />
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] md:items-start">
        {/* ---------- 1. the board (second on a phone — the builder leads there) ---------- */}
        <Panel
          className="order-2 md:order-none"
          title="Season board"
          action={
            <span className="num text-[10px] text-faint">
              {data ? `${data.players.length} players · ${data.teams.length} teams` : "—"}
            </span>
          }
        >
          <div className="mb-3 flex flex-col gap-2">
            <Segmented options={SCOPES} value={scope} onChange={onScope} tone="cfb" size="sm" label="Board scope" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={scope === "players" ? "Search a player or team" : "Search a team"}
              aria-label="Search the season board"
              className="h-11 w-full rounded-[10px] border border-white/[0.08] bg-surface-2 px-3 text-[13px] text-text placeholder:text-faint"
            />
          </div>
          {feed.isPending ? (
            <SkeletonRows rows={8} />
          ) : feed.isError || !data ? (
            <ErrorState title="Season tables unavailable" body="ESPN's season tables did not answer. Nothing is invented — try again in a minute." onRetry={() => feed.refetch()} />
          ) : scope === "players" ? (
            players.length === 0 ? (
              <EmptyState title="No player matches" body="The board is ESPN's top-250 passing, rushing and receiving tables. A player outside them has no season line here." />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {players.map((p) => (
                  <PlayerRow key={p.slug} p={p} pick={pick} onPick={choose} />
                ))}
                {playerTotal > players.length && (
                  <li className="flex items-center justify-between gap-2 pt-2 text-[10.5px] text-faint">
                    <span>
                      Showing {players.length} of {playerTotal} — search to narrow.
                    </span>
                    <ShowMore onClick={() => setExtraRows((n) => n + pageRows)} />
                  </li>
                )}
              </ul>
            )
          ) : teams.length === 0 ? (
            <EmptyState title="No team matches" body="Win totals run on ESPN's FPI feed; a team outside it (FCS) has no projection here." />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {teams.map((t) => (
                <TeamRow key={t.id} t={t} avgFpi={data.avgFpi} selected={pick?.kind === "team" && pick.team.id === t.id} onPick={() => choose({ kind: "team", team: t })} />
              ))}
              {teamMatches.length > teams.length && (
                <li className="flex items-center justify-between gap-2 pt-2 text-[10.5px] text-faint">
                  <span>
                    Showing {teams.length} of {teamMatches.length} — search to narrow.
                  </span>
                  <ShowMore onClick={() => setExtraRows((n) => n + pageRows)} />
                </li>
              )}
            </ul>
          )}
        </Panel>

        <div className="order-1 md:order-none space-y-3 scroll-mt-[calc(env(safe-area-inset-top)+3.5rem)] md:scroll-mt-0" ref={builderRef}>
          {/* ---------- 2. the builder (first on a phone) ---------- */}
          <Panel title="Season ticket" action={<span className="text-[10px] text-faint">{book || CFB_SEASON.defaultBook} · typed line</span>}>
            {!proj ? (
              <EmptyState title="Pick a player stat or a team" body="Tap a stat chip on the board (or a team under Win totals), then type the book's line and price." />
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">
                    {proj.kind === "player" ? `${proj.name} · ${proj.statLabel}` : `${proj.name} · season wins`}
                  </div>
                  <div className="num mt-0.5 text-[10.5px] text-faint" data-testid="season-inputs">
                    {projectionInputs(proj)}
                    {proj.kind === "team" && <> · {proj.path === "avg-fpi" ? "avg-opponent path" : "schedule path"}</>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile label="Fair line" value={n0(proj.projected, proj.kind === "player" && !isCount(proj.stat) ? 0 : 1)} tone="cfb" sub="model median" />
                  <StatTile label={proj.kind === "player" ? "So far" : "Record"} value={proj.kind === "player" ? n0(proj.current) : `${proj.wins}-${proj.losses}`} sub={proj.kind === "player" ? `${proj.g} G` : `${proj.remaining} left`} />
                  <StatTile label="σ left" value={proj.kind === "player" ? n0(proj.sigma, 0) : proj.espnProjW != null ? n0(proj.espnProjW, 1) : "—"} sub={proj.kind === "player" ? `${proj.remaining} G left` : "ESPN's own proj W"} tone="muted" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <FilterPill selected={side === "over"} onClick={() => setSide("over")} className="min-h-[36px]">
                    Over
                  </FilterPill>
                  <FilterPill selected={side === "under"} onClick={() => setSide("under")} className="min-h-[36px]">
                    Under
                  </FilterPill>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Line
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={lineText}
                      onChange={(e) => setLineText(e.target.value)}
                      aria-label="Book line"
                      className="num mt-1 h-11 w-full rounded-[10px] border border-white/[0.08] bg-surface-2 px-2 text-[14px] text-text"
                    />
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Price
                    <input
                      type="number"
                      inputMode="numeric"
                      step="5"
                      value={priceText}
                      onChange={(e) => setPriceText(e.target.value)}
                      aria-label="Book price (American)"
                      className="num mt-1 h-11 w-full rounded-[10px] border border-white/[0.08] bg-surface-2 px-2 text-[14px] text-text"
                    />
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Book
                    <input
                      type="text"
                      value={book}
                      onChange={(e) => setBook(e.target.value)}
                      aria-label="Book"
                      className="mt-1 h-11 w-full rounded-[10px] border border-white/[0.08] bg-surface-2 px-2 text-[13px] text-text"
                    />
                  </label>
                </div>
                {priced ? (
                  <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3" data-testid="season-priced">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">Fair %</div>
                        <div className="display num mt-1 text-[20px] text-text">{fmtPct(priced.prob)}</div>
                        {priced.push > 0 && <div className="num text-[9.5px] text-faint">push {fmtPct(priced.push)}</div>}
                      </div>
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">Fair price</div>
                        <div className="display num mt-1 text-[20px] text-text">{fmtAmerican(priced.fairAm)}</div>
                        <div className="num text-[9.5px] text-faint">book {fmtAmerican(priced.price)}</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">EV</div>
                        <div className="mt-1 flex flex-col items-center gap-1">
                          <EvBadge ev={Math.round(priced.evPct * 10) / 10} />
                          <KellyChip stake={priced.kelly} />
                        </div>
                      </div>
                    </div>
                    <Pill variant="primary" className="mt-3 min-h-[44px] w-full justify-center" onClick={addLeg}>
                      {pendingId != null && legs.some((l) => l.id === pendingId) ? "Remove leg" : "Add leg"}
                    </Pill>
                  </div>
                ) : (
                  <div className="text-[10.5px] text-faint">Type the book&apos;s line and an American price of ±100 or longer to see the fair side.</div>
                )}
              </div>
            )}
          </Panel>

          {/* ---------- the slip ---------- */}
          <Panel title="Season parlay" action={<span className="num text-[10px] text-faint">{legs.length} leg{legs.length === 1 ? "" : "s"}</span>}>
            {legs.length === 0 ? (
              <EmptyState title="No legs yet" body="A one-leg ticket is a single; add more for a season parlay." />
            ) : (
              <div className="space-y-2">
                <ul className="divide-y divide-white/[0.05]">
                  {legs.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-semibold text-text">{l.label}</div>
                        <div className="num truncate text-[10px] text-faint">
                          {l.sub} · {fmtAmerican(l.price)} {l.book} · fair {fmtPct(l.prob)}
                        </div>
                      </div>
                      <button type="button" onClick={() => setLegs((cur) => cur.filter((x) => x.id !== l.id))} className="press shrink-0 rounded-full px-2 py-1 text-[11px] text-muted hover:text-text" aria-label={`Remove ${l.label}`}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                {parlay && (
                  <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3" data-testid="season-parlay">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">Pays</div>
                        <div className="display num mt-1 text-[18px] text-text">{fmtAmerican(decToAm(parlay.dec))}</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">True %</div>
                        <div className="display num mt-1 text-[18px] text-text">{fmtPct(parlay.probAdj)}</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">EV</div>
                        <div className="mt-1 flex justify-center">
                          <EvBadge ev={Math.round(parlay.evPct * 10) / 10} />
                        </div>
                      </div>
                    </div>
                    {parlay.sameTeam.length > 0 && (
                      <div className="mt-2 rounded-[8px] border border-gold/30 bg-gold/[0.07] px-2 py-1.5 text-[10px] leading-snug text-gold" data-testid="same-team-flag">
                        Same-team legs ({parlay.sameTeam.join(", ")}) are correlated — the true % takes a {Math.round((1 - parlay.haircut) * 100)}% haircut as a margin; the real joint is unknown.
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2 text-[12px]">
                      <label className="flex items-center gap-2 text-muted">
                        Stake
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={CFB_SEASON.ticketMax}
                          value={stake}
                          aria-label="Season ticket stake"
                          onChange={(e) => setStake(clampSeasonStake(Number(e.target.value)))}
                          className="num h-11 w-[72px] rounded-[10px] border border-white/[0.08] bg-surface-2 px-2 text-right text-[13px] text-text"
                        />
                      </label>
                      <span className="num text-[11px] text-muted" data-testid="season-returns">
                        {returnsLabel(stake, parlay.dec)}
                      </span>
                    </div>
                    <Pill variant="primary" className="mt-3 min-h-[44px] w-full justify-center" onClick={lockTicket}>
                      Lock season ticket · {fmtMoney(stake)}
                    </Pill>
                    <div className="mt-2 text-[9.5px] leading-snug text-faint">
                      Paper, on its own season key — never the daily $250 / $25 rails or the CFB ledger. True % is the independent product of the
                      model&apos;s fair probabilities; a push counts against the ticket.
                    </div>
                  </div>
                )}
              </div>
            )}
            {note && <div className="mt-2 rounded-[8px] border border-pos/30 bg-pos/[0.07] px-2 py-1.5 text-[10.5px] text-pos">{note}</div>}
          </Panel>
        </div>
      </div>

      {/* ---------- 3. the ledger ---------- */}
      <Panel title="Season ledger" action={<span className="num text-[10px] text-faint">{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</span>}>
        {tickets.length === 0 ? (
          <EmptyState title="No season tickets yet" body="Lock one above. Tickets settle by hand — Won, Lost or Void — when the book grades them in December." />
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <TicketCard key={t.id} t={t} feed={data ?? null} onSettle={(r) => settle(t.id, r)} onRemove={() => remove(t.id)} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ShowMore({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press min-h-[32px] shrink-0 rounded-full border border-line-2 bg-white/[0.03] px-3 text-[10.5px] font-semibold text-muted hover:text-text">
      Show more
    </button>
  );
}

function PlayerRow({ p, pick, onPick }: { p: SeasonPlayer; pick: Selection | null; onPick: (p: Selection) => void }) {
  const chips = SEASON_STATS.filter((s) => p.stats[s.id] != null && (p.stats[s.id] as number) > 0);
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 truncate text-[12.5px] font-semibold text-text">{p.name}</div>
        <div className="num shrink-0 truncate text-[10px] text-faint">
          {teamLabel(p)}
          {p.pos ? ` · ${p.pos}` : ""} · {p.g} G
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {chips.map((s) => {
          const pr = projectPlayerStat(p, s.id);
          const selected = pick?.kind === "player" && pick.player.slug === p.slug && pick.stat === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick({ kind: "player", player: p, stat: s.id })}
              aria-pressed={selected}
              className={`press num inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 text-[10.5px] ${
                selected ? "border-cfb/60 bg-cfb/15 text-cfb" : "border-line-2 bg-white/[0.03] text-muted hover:text-text"
              }`}
            >
              <span className="font-semibold">{s.short}</span>
              <span>{pr ? n0(pr.projected, isCount(s.id) ? 1 : 0) : "—"}</span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

function TeamRow({ t, avgFpi, selected, onPick }: { t: SeasonTeam; avgFpi: number | null; selected: boolean; onPick: () => void }) {
  const pr = projectWinTotal(t, avgFpi);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        className={`press flex min-h-[44px] w-full items-center justify-between gap-2 py-1.5 text-left ${selected ? "text-cfb" : "text-text"}`}
      >
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold">
            {t.fpiRank != null && <span className="num mr-1 text-[10px] text-faint">#{t.fpiRank}</span>}
            {t.name}
          </div>
          <div className="num text-[10px] text-faint">
            {t.wins}-{t.losses}
            {t.ties ? `-${t.ties}` : ""} · FPI {t.fpi == null ? "—" : t.fpi.toFixed(1)}
            {t.espnProjW != null && ` · ESPN proj ${t.espnProjW.toFixed(1)} W`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="display num text-[16px]">{pr ? n0(pr.projected, 1) : "—"}</div>
          <div className="text-[9px] uppercase tracking-[0.14em] text-faint">proj W</div>
        </div>
      </button>
    </li>
  );
}

const RESULTS: { key: SeasonResult; label: string; cls: string }[] = [
  { key: "won", label: "Won", cls: "border-pos/50 bg-pos/15 text-pos" },
  { key: "lost", label: "Lost", cls: "border-neg/50 bg-neg/15 text-neg" },
  { key: "void", label: "Void", cls: "border-line-2 bg-surface-2 text-muted" },
];

function TicketCard({ t, feed, onSettle, onRemove }: { t: SeasonTicket; feed: SeasonFeed | null; onSettle: (r: SeasonResult) => void; onRemove: () => void }) {
  const pnl = seasonTicketPnl(t);
  return (
    <li className="ticket rounded-[14px] border border-white/[0.06] p-3" data-testid="season-ticket">
      <div className="flex items-center justify-between gap-2">
        <div className="num text-[10.5px] text-faint">
          {new Date(t.lockedAt).toLocaleDateString([], { month: "short", day: "numeric" })} · {t.legs.length} leg{t.legs.length === 1 ? "" : "s"} · {fmtMoney(t.stake)} at{" "}
          {fmtAmerican(decToAm(t.dec))}
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] ${
            t.result === "won" ? "border-pos/50 text-pos" : t.result === "lost" ? "border-neg/50 text-neg" : t.result === "void" ? "border-line-2 text-muted" : "border-cfb/50 text-cfb"
          }`}
        >
          {t.result}
        </span>
      </div>
      <ul className="mt-2 divide-y divide-white/[0.05]">
        {t.legs.map((l) => {
          const pace = paceOf(l, feed ? projectionFor(l, feed) : null);
          return (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-text">{l.label}</div>
                <div className="num truncate text-[9.5px] text-faint">
                  {fmtAmerican(l.price)} {l.book} · fair {fmtPct(l.prob)} at lock · {l.inputs}
                </div>
              </div>
              <span className={`num shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold ${PACE_TONE[pace]}`} data-testid="season-pace">
                {pace}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {RESULTS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => onSettle(t.result === r.key ? "open" : r.key)}
              aria-pressed={t.result === r.key}
              className={`press min-h-[32px] rounded-full border px-3 text-[10.5px] font-semibold ${t.result === r.key ? r.cls : "border-line-2 bg-white/[0.03] text-muted hover:text-text"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className={`num text-[12px] font-semibold ${pnl > 0 ? "text-pos" : pnl < 0 ? "text-neg" : "text-muted"}`}>
            {t.result === "open" ? returnsLabel(t.stake, t.dec) : fmtMoneyExact(pnl)}
          </span>
          <button type="button" onClick={onRemove} className="press rounded-full px-2 py-1 text-[10.5px] text-faint hover:text-text" aria-label="Remove ticket">
            remove
          </button>
        </div>
      </div>
    </li>
  );
}
