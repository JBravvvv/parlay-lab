"use client";

import { MlbLegContext, type MlbGameInfo } from "@/components/props/MlbLegContext";
import { CrossBoardResults } from "@/components/props/CrossBoardResults";
import { marketOf } from "@/lib/ledger-segments";
import { DiscoveryFilters } from "@/components/props/DiscoveryFilters";
import { ALL_MARKETS } from "@/lib/cross-sport";
import { STRATEGIES,marketRanksBy,type DiscoveryFilter } from "@/lib/discovery";
import { ticketMatches } from "@/lib/ticket-discovery";
import { useEffect, useMemo, useState } from "react";
import { getSelectionMode, type SelectionMode } from "@/lib/engine-client";
import { MODE_LABEL, orderByMode } from "@/lib/board-order";
import { Panel } from "@/components/ui/Panel";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import type { Ticket, TicketLeg } from "@/engine";
import { BoardLabel } from "@/components/player/PlayerName";
import { PlayerMark } from "@/components/player/PlayerMark";
import { parseBoardLabel } from "@/lib/player-card";
import { clubFromLabel, useHeadshots } from "@/lib/mlb-visuals";
import { MyToggle } from "@/components/mlb/MyParlayBar";
import { parseAm, type MyLeg } from "@/lib/my-parlay";

/* The engine's generated parlay sets, straight from BoardData — the old app's
   PARLAYS / MIXED PARLAYS / LIVE PARLAYS tabs. Display only: every number here
   is the engine's own output (tier, type, prob, EV @ book, stake → win). */

const CAT_LABELS: Record<string, string> = {
  ml: "MONEYLINE",
  rl: "RUN LINE",
  batter_hits: "HITS",
  batter_total_bases: "TOTAL BASES",
  batter_home_runs: "HOME RUNS",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "STRIKEOUTS",
  pitcher_outs: "OUTS",
  MIX: "MIXED",
};

type View = "parlays" | "mixed" | "live";
const VIEWS: [View, string, string][] = [
  ["parlays", "PARLAYS", "Tickets built only from games that haven't started yet."],
  ["mixed", "MIXED PARLAYS", "Cross-game tickets from not-started games plus live games before the 7th."],
  ["live", "LIVE PARLAYS", "In-game tickets from every live game, using live odds, to the final out."],
];

/* extra engine fields carried on Ticket via its index signature */
const x = (t: Ticket) =>
  t as Ticket & { tier?: string; typeLabel?: string; stake?: number; toWin?: number; note?: string };

/* INSTRUCTION 71 (2026-09-17, Josh): "There needs to be as many parlays generated on the bottom of the
   board page as possible for variety … i need more ability just to see more parlays". The section used
   to stop dead at 24 with a "narrow with the filters" note; now it pages — 24 first, "Show 48 more"
   per tap, or "Show all". The engine side of the same instruction (env-adjust PARLAY_VARIETY) triples
   the ticket plan, so there is a lot more to page through. */
const SHOW_CAP = 24;
const SHOW_STEP = 48;

function TierTag({ tier }: { tier?: string }) {
  const cls =
    tier === "SAFER"
      ? "border-pos/50 bg-pos/10 text-pos"
      : tier === "LONGSHOT"
        ? "border-gold/50 bg-gold/10 text-gold"
        : "border-line-2 bg-surface-2 text-muted";
  return <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${cls}`}>{tier ?? "BALANCED"}</span>;
}

export function ParlaysSection({
  gameInfo,
  date = "",
  parlays,
  mixed,
  live,
  legNow,
  legOut,
  mine,
}: {
  date?:string;
  gameInfo?:MlbGameInfo;
  parlays: Ticket[];
  mixed: Ticket[];
  live: Ticket[];
  /** live "now" chip for a leg while its game is in progress (Board passes it) */
  legNow?: (l: { gkey?: string | null; lkey?: string | null }) => { txt: string; inning: string | null } | null;
  /** INSTRUCTION 28 (2026-09-04): true when the leg's batter is absent from the POSTED
      lineup — the ticket is flagged SCRATCHED LEG and dimmed (a book voids or pulls it) */
  legOut?: (l: { label?: string | null; gkey?: string | null; lkey?: string | null }) => boolean;
  /** INSTRUCTION 71: the Board's "My parlay" — tap a leg or take a whole ticket into it */
  mine?: { has: (key: string) => boolean; toggle: (leg: MyLeg) => void; addAll: (legs: MyLeg[]) => void };
}) {
  const [discovery,setDiscovery]=useState<DiscoveryFilter>({timing:["pregame","live"],markets:ALL_MARKETS.map(m=>m.key),strategies:STRATEGIES.map(s=>s.key),sports:["mlb"],timeWindow:[0,24]});
  const [view, setView] = useState<View | "all">("all");
  const [pfilter, setPfilter] = useState("all");
  // ONE SELECTION MODE SITE-WIDE (2026-08-15, Josh: "The parlays and tickets
  // should follow the selection mode too"). Full mode read, mounted-gated
  // (hydration rule); ticket GENERATION already follows it via SH_CFG.selMode —
  // this aligns the displayed order and the primary price.
  const [selMode, setSelMode] = useState<SelectionMode>("ev_gated");
  // Browse by selected-book EV; generation retains its paper selection policy.
  const basisMode = false;
  // the mode's price for badges and the +EV glow (probability mode still
  // badges EV at the settling book — probability drives the ORDER)
  const modeEv = (t: Ticket) => (basisMode ? (t.bsEv == null ? null : Number(t.bsEv)) : t.czEv == null ? null : Number(t.czEv));

  const lists: Record<View | "all", Ticket[]> = { parlays, mixed, live, all:[...new Map([...parlays,...mixed,...live].map(t=>[t.legs.map(l=>`${l.gkey}|${l.lkey}|${l.prop}`).sort().join(";"),t])).values()] };

  /* INSTRUCTION 50 (2026-09-11, Josh's word, verbatim: "Need player headshots for Parlay Builder
     etc or need team logo next to name"): every leg that names a player gets his headshot with HIS
     team's logo badged on it. The name list is computed ONCE over all three sets — not per view and
     not per filter — because useHeadshots re-keys on the joined list, and a key that changed when
     Josh tapped MIXED would re-run the statsapi resolve on every tab press. A club leg (ML/RL) has
     no "(TEAM)" suffix, so parseBoardLabel returns null and it needs no headshot: it draws the club's
     own logo instead (INSTRUCTION 70, 2026-09-17: "If its a team ml.rl then it only needs a team logo"). */
  const markNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of [...parlays, ...mixed, ...live]) {
      for (const l of t.legs ?? []) {
        const parsed = parseBoardLabel(String(l.label ?? ""));
        if (parsed) names.add(parsed.name);
      }
    }
    return [...names].sort();
  }, [parlays, mixed, live]);
  const headshots = useHeadshots(markNames);
  const all = useMemo(() => orderByMode(lists[view] ?? [], selMode), [parlays, mixed, live, view, selMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = useMemo(() => {
    const base: [string, string][] = [["all", "ALL"], ["SAFER", "SAFER"], ["LONGSHOT", "LONGSHOTS"], ["MIX", "MIXED"]];
    const types = Array.from(new Set(all.map((t) => t.type).filter((t): t is string => !!t && t !== "MIX")));
    return base.concat(types.map((t) => [t, CAT_LABELS[t] ?? t.toUpperCase()]));
  }, [all]);

  const match = (t: Ticket, f: string) =>
    f === "all" ? true : f === "SAFER" || f === "LONGSHOT" ? x(t).tier === f : t.type === f;
  const legRanks=marketRanksBy(all.flatMap(t=>t.legs),l=>String(l.market??marketOf(l.lkey??"")),l=>l.label??"",l=>Number(l.prob??l.est??0));
  const shown = all.filter((t) => match(t, filters.some(([k]) => k === pfilter) ? pfilter : "all") && ticketMatches(t.legs.map(l=>({chanceRank:legRanks.get(l),market:String(l.market??(l.lkey?marketOf(l.lkey):t.type)??""),prob:Number(l.prob??l.est??0),ev:Number(l.prob??l.est??0)/100*(parseAm(l.cz)!>0?1+parseAm(l.cz)!/100:1+100/-parseAm(l.cz)!)*100-100,am:parseAm(l.cz)??NaN,start:gameInfo?.[String(l.gkey)]?.start,started:!!l.live||!!gameInfo?.[String(l.gkey)]?.start&&Date.parse(gameInfo[String(l.gkey)].start!)<=Date.now(),sport:"mlb",game:String(l.gkey)})),discovery));
  const playable = shown.filter((t) => t.czOdds != null);
  const [cap, setCap] = useState(SHOW_CAP);
  const capKey = `${view}|${pfilter}|${JSON.stringify(discovery)}`;
  const [seenCap, setSeenCap] = useState(capKey);
  if (seenCap !== capKey) {
    setSeenCap(capKey);
    setCap(SHOW_CAP);
  }
  const legOfTicket = (l: TicketLeg): MyLeg => ({
    key: `${l.label}|${l.prop}`,
    label: String(l.label ?? ""),
    sub: String(l.prop ?? ""),
    gkey: l.gkey ?? null,
    odds: parseAm(l.cz),
    prob: typeof l.prob === "number" && Number.isFinite(l.prob) ? l.prob : null,
  });
  const offBook = shown.filter((t) => t.czOdds == null);

  return (
    <Reveal>
      <div className="mt-5">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Generated parlays — the engine&apos;s ticket sets · selected sportsbook prices
        </h2>

        <DiscoveryFilters parlayTypes value={discovery} onChange={v=>{setDiscovery(v);setView("all");setPfilter("all");}} markets={ALL_MARKETS}/>{discovery.sports.some(s=>s!=="mlb")&&<CrossBoardResults date={date} filter={discovery}/>}
        <label className="mb-2 flex items-center gap-2 text-[11px] font-bold">
          Ticket set
          <select aria-label="Parlay set" className="min-h-8 rounded-lg border border-white/20 bg-surface-2 px-2 text-text" value={view} onChange={e=>{setView(e.target.value as typeof view);setPfilter("all");}}>
            {VIEWS.map(([v,label])=><option key={v} value={v}>{label} · {(lists[v]??[]).length}</option>)}
          </select>
        </label>
        <div className="mb-3 text-[11px] text-muted">{view==="all"?"All timing and market sets — narrow with the dropdowns above.":VIEWS.find(([v]) => v === view)![2]}</div>

        {all.length === 0 ? (
          <Panel>
            <EmptyState
              title={view === "live" ? "No games in progress right now" : "No parlays in this set yet"}
              body={
                view === "live"
                  ? "In-game parlays appear the moment a game starts and run to the final out."
                  : "Not enough qualifying picks — regenerate closer to game time."
              }
            />
          </Panel>
        ) : (
          <>
            <label className="mb-3 flex items-center gap-2 text-[11px] font-bold">
              Ticket tier
              <select aria-label="Ticket tier" className="min-h-8 rounded-lg border border-white/20 bg-surface-2 px-2 text-text" value={filters.some(([k])=>k===pfilter)?pfilter:"all"} onChange={e=>setPfilter(e.target.value)}>
                {filters.map(([k,label])=><option key={k} value={k}>{label} · {all.filter(t=>match(t,k)).length}</option>)}
              </select>
            </label>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {playable.slice(0, cap).map((t, ti) => {
                const e = x(t);
                const toWin = e.czDec && e.stake != null ? Math.round(e.stake * (e.czDec - 1)) : e.toWin;
                const outLeg = legOut ? t.legs.some((l) => legOut(l as { label?: string | null; gkey?: string | null; lkey?: string | null })) : false;
                return (
                  <Panel key={`${view}|${ti}`} className={outLeg ? "opacity-60" : (modeEv(t) ?? -1) >= 0 ? "glow-pos" : ""}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="display text-[14px] text-text">{t.name}</div>
                      <span className="num flex shrink-0 items-center gap-2 text-[13.5px] font-bold text-gold">
                        {basisMode && t.bsOdds != null && <span className="text-text">{String(t.bsOdds)} basis</span>}
                        {String(t.czOdds)} @ book
                        {mine && (
                          <button
                            type="button"
                            className="rounded-full border border-line-2 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-muted hover:border-gold hover:text-gold"
                            title="Copy every leg of this ticket into My parlay, then add or drop legs to see how the edge moves"
                            data-testid="ticket-to-mine"
                            onClick={() => mine.addAll(t.legs.map(legOfTicket))}
                          >
                            → mine
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <TierTag tier={e.tier} />
                      {outLeg && (
                        <span
                          className="rounded-full border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-[9.5px] font-bold text-red-400"
                          title="A leg's batter is not in the posted lineup — the books void or pull this leg, so the ticket cannot be placed as built"
                        >
                          SCRATCHED LEG
                        </span>
                      )}
                      {basisMode && t.bsDec == null && (
                        <span
                          className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9.5px] font-bold text-gold"
                          title="No DraftKings or FanDuel quote on every leg — browsable and manual-slip eligible, but the card never selects without a basis price"
                        >
                          NO DK/FD BASIS
                        </span>
                      )}
                      {e.typeLabel && (
                        <span className="rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[9.5px] font-bold text-muted">
                          {e.typeLabel.toUpperCase()}
                        </span>
                      )}
                      {t.posCorr && (
                        <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9.5px] font-bold text-gold">
                          CORRELATED
                        </span>
                      )}
                      {t.simJoint && (
                        <span
                          className="rounded-full border border-pos/40 bg-pos/10 px-2 py-0.5 text-[9.5px] font-bold text-pos"
                          title="Same-game legs priced from the sim's joint paths — how often these legs actually hit TOGETHER — instead of multiplying each leg's probability as if they were independent"
                        >
                          SIM-JOINT
                        </span>
                      )}
                    </div>
                    <div className="num mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px]">
                      <span className="text-text">
                        {t.simJoint && t.probNaive != null && Number(t.probNaive) !== Number(t.prob) ? (
                          <>
                            <span className="text-faint line-through">naive {String(t.probNaive)}%</span>{" "}
                            → joint {String(t.prob)}%
                          </>
                        ) : (
                          <>{String(t.prob)}% combined</>
                        )}
                      </span>
                      {modeEv(t) != null && <EvBadge ev={modeEv(t)!} />}
                      {e.stake != null && (
                        <span className="text-muted">${e.stake} → <b className="text-text">${toWin}</b></span>
                      )}
                    </div>
                    <ul className="mt-2.5 space-y-1 text-[12px] text-muted">
                      {t.legs.map((l, i) => {
                        const n = legNow ? legNow(l as { gkey?: string | null; lkey?: string | null }) : null;
                        const lo = legOut ? legOut(l as { label?: string | null; gkey?: string | null; lkey?: string | null }) : false;
                        const who = parseBoardLabel(String(l.label ?? ""));
                        const club = who ? null : clubFromLabel(String(l.label ?? ""));
                        return (
                          <li key={i} className={lo ? "truncate line-through decoration-red-400/60" : "truncate"}>
                            {mine && (() => {
                              const ml = legOfTicket(l);
                              return <span className="mr-1.5 inline-flex align-text-bottom"><MyToggle on={mine.has(ml.key)} onClick={() => mine.toggle(ml)} label={`${ml.label} ${ml.sub}`} /></span>;
                            })()}
                            {who ? (
                              <PlayerMark
                                player={who.name}
                                team={who.team}
                                headshot={headshots[who.name] ?? null}
                                size="xs"
                                className="mr-1 align-text-bottom"
                              />
                            ) : club ? (
                              <PlayerMark player={null} team={club} headshot={null} size="xs" className="mr-1 align-text-bottom" />
                            ) : null}
                            <span className="text-text"><BoardLabel showMark={false} label={l.label} /></span> · {l.prop}<MlbLegContext leg={l} info={gameInfo}/>
                            {lo && <span className="ml-1 text-[9.5px] font-bold uppercase text-red-400 no-underline" title="not in the posted lineup">out</span>}
                            {l.cz != null && <span className="num ml-1 text-[10.5px]">({l.cz > 0 ? `+${l.cz}` : l.cz})</span>}
                            {n && (
                              <span
                                className="num ml-1.5 text-[10px] font-bold text-live"
                                title="Live from the official boxscore — updates every minute while the game is in progress"
                              >
                                ● now {n.txt}
                                {n.inning ? ` · ${n.inning}` : ""}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {e.note && <div className="mt-2 text-[10.5px] leading-relaxed text-faint">{e.note}</div>}
                  </Panel>
                );
              })}
            </div>
            {playable.length > cap && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted" data-testid="parlays-more">
                <span>
                  showing {cap} of {playable.length} in this view
                </span>
                <button type="button" className="rounded-full border border-line-2 px-3 py-1 font-semibold text-text hover:border-gold" onClick={() => setCap((c) => c + SHOW_STEP)}>
                  Show {Math.min(SHOW_STEP, playable.length - cap)} more
                </button>
                <button type="button" className="rounded-full border border-line-2 px-3 py-1 font-semibold text-text hover:border-gold" onClick={() => setCap(playable.length)}>
                  Show all {playable.length}
                </button>
              </div>
            )}
            {playable.length === 0 && (
              <Panel><EmptyState title="No parlays match this filter" /></Panel>
            )}

            {offBook.length > 0 && (
              <details className="mt-3 rounded-(--radius-panel) border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                <summary className="cursor-pointer select-none text-[12px] font-semibold text-muted">
                  Not at the selected book ({offBook.length}) — tickets with a leg the selected book doesn&apos;t price
                </summary>
                <div className="mt-3 space-y-1.5">
                  {offBook.map((t, ti) => (
                    <div key={`${t.name}|${ti}`} className="text-[12px] text-muted">
                      <span className="text-text">{t.name}</span>{" "}
                      <span className="num text-[10.5px]">
                        missing: {t.legs.filter((l) => l.cz == null).map((l) => `${l.label} ${l.prop}`).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </Reveal>
  );
}
