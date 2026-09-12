"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { UfcSharp } from "@/components/ufc/UfcSharp";
import { AsgSharpTab } from "@/components/allstar/AllStarSurfaces";
import { ASG_ENABLED, CFB_ENABLED, NFL_ENABLED, UFC_ENABLED } from "@/lib/features";
import { useSport } from "@/lib/sport";
import { CfbSharp } from "@/components/cfb/CfbSharp";
import { NflSharp } from "@/components/nfl/NflSharp";
import { EvBadge } from "@/components/ui/EvBadge";
import { OddsCell } from "@/components/ui/OddsCell";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useBoard, useRegenerateBoard } from "@/lib/useBoard";
import { getEngine, getSelectionMode, SIM_PATHS_TXT } from "@/lib/engine-client";
import { useCalibration } from "@/lib/useCalibration";
import { nowLabel, useLiveNow } from "@/lib/liveNow";
import { legSideOf, settledRead, type LegSettledRead } from "@/lib/leg-settled";
import { MLB_LIVE_CLIENT, mlbLiveAgeLabel, mlbLiveClockLabel, mlbLiveView, useMlbLiveQuotes, type MlbLiveQuote } from "@/lib/mlb/live-client";
import type { PickRow } from "@/engine";
import { BoardLabel } from "@/components/player/PlayerName";

/* The Sharp = the built-in quant engine's daily read. Same engine as the old
   GitHub app, running verbatim (parity-proven in tests/parity.test.ts) — free,
   no key, no AI. The optional Claude second-opinion mode lives at the bottom
   and stays dormant unless a server key is ever configured. */

type Trap = { prop: string; reason: string };
type Pass = { prop: string; reason: string };

function ConvChip({ c }: { c?: string }) {
  if (!c) return null;
  const tone =
    c === "A"
      ? "text-pos border-pos/50 bg-pos/10"
      : c === "B"
        ? "text-gold border-gold/50 bg-gold/10"
        : "text-muted border-line-2 bg-surface-2";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>CONVICTION {c}</span>;
}

/**
 * THE LIVE PILL (INSTRUCTION 51). The same pulsing mark the CFB rail uses
 * (src/components/cfb/CfbPicksBoard.tsx:228) — same tokens, same dot, same promise — so "in play"
 * looks identical on every desk and Josh never has to learn a second vocabulary. The title carries
 * the rule that the badge itself cannot: EV is at the live Caesars price, and a live line is never
 * given a stake.
 */
function LivePill() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-live/50 bg-live/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-live"
      title="In play — graded on EV at the live Caesars price, and no ¼-Kelly stake is ever sized on a live line"
      data-testid="sharp-live-tag"
    >
      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
      LIVE
    </span>
  );
}

export default function SharpPage() {
  const { data: board, isPending } = useBoard();
  // the global SportSwitch (🏈 CFB); the `sport` state below is the MLB desk's own ufc/asg sub-switch
  const desk = useSport();
  const regen = useRegenerateBoard();
  const d = board?.data;
  // localStorage only after mount — an initializer read would diverge from the
  // server's "mlb" and trip a hydration mismatch
  const [sport, setSport] = useState<"mlb" | "ufc" | "asg">("mlb");
  useEffect(() => {
    try {
      const s = localStorage.getItem("pl_sharp_sport");
      if (UFC_ENABLED && s === "ufc") setSport("ufc");
      else if (ASG_ENABLED && s === "asg") setSport("asg");
    } catch { /* fresh device */ }
  }, []);
  const pickSport = (s: "mlb" | "ufc" | "asg") => {
    setSport(s);
    try { localStorage.setItem("pl_sharp_sport", s); } catch {}
  };

  // selection_mode: ev_gated (upgrade-01 default) and probability both rank
  // today's plays by the engine's true % — Caesars' price never changes WHICH
  // picks are chosen, it only prices them (the EV gate lives in the Builder's
  // allocator, where stakes are). caesars_ev is the legacy ranking.
  const [selMode, setSelModeState] = useState<"dk_fd" | "ev_gated" | "probability" | "caesars_ev">("dk_fd");
  // dk_fd: the active core EV gate, straight from the engine (mounted only) —
  // The Sharp's plays clear the same bar the Builder's allocator enforces
  const [gatePct, setGatePct] = useState(0);
  useEffect(() => {
    setSelModeState(getSelectionMode());
    const cfg = getEngine().get<{ coreEvMin?: number }>("SH_CFG");
    setGatePct(cfg?.coreEvMin ?? 0);
  }, []);
  const cal = useCalibration();

  const { plays, notOffered } = useMemo(() => {
    if (!d) return { plays: [] as PickRow[], notOffered: [] as PickRow[] };
    const seen = new Set<string>();
    const rows = Object.entries(d.categories)
      .filter(([k]) => k !== "all")
      .flatMap(([mkt, v]) => v.map((r) => ({ ...r, __mkt: mkt })))
      .filter((r) => {
        const k = `${r.label}|${r.sub}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      // 3D sanity breaker: quarantined markets are frozen out of suggested
      // plays (they stay on the Board, badged UNDER REVIEW)
      .filter((r) => !cal.quarantine.includes((r as { __mkt: string }).__mkt))
      // Phase 2: suspended lines (H+R+RBI alt ladder) are board-visible but never plays
      .filter((r) => !r.susp);
    if (selMode === "caesars_ev") {
      return {
        plays: rows
          .filter((r) => r.cz != null && Number(r.czEv) > 0)
          .sort((a, b) => Number(b.czEv) - Number(a.czEv))
          .slice(0, 8),
        notOffered: [] as PickRow[],
      };
    }
    if (selMode === "dk_fd") {
      // Builder discipline, verbatim: a play needs BOTH a DK/FD basis quote and a
      // Caesars quote, must clear the core EV gate at the basis, and is ranked by
      // EV at the basis. Gate-clearing picks Caesars doesn't offer are disclosed,
      // never substituted.
      const gated = rows
        .filter((r) => r.bs != null && Number(r.bsEv) >= gatePct)
        .sort((a, b) => Number(b.bsEv) - Number(a.bsEv));
      return {
        plays: gated.filter((r) => r.cz != null).slice(0, 8),
        notOffered: gated.filter((r) => r.cz == null).slice(0, 8),
      };
    }
    if (selMode === "ev_gated") {
      // the default: same discipline as dk_fd with the price swapped — a play needs
      // a Caesars quote and must clear the core EV gate AT Caesars, ranked by czEv
      const gatedCz = rows
        .filter((r) => r.cz != null && Number(r.czEv) >= gatePct)
        .sort((a, b) => Number(b.czEv) - Number(a.czEv));
      return { plays: gatedCz.slice(0, 8), notOffered: [] as PickRow[] };
    }
    const top = rows.sort((a, b) => Number(b.prob) - Number(a.prob)).slice(0, 8);
    return {
      plays: top.filter((r) => r.cz != null),
      notOffered: top.filter((r) => r.cz == null),
    };
  }, [d, selMode, gatePct, cal.quarantine]);

  const trap = d?.trap as Trap | undefined;
  const passes = (d?.passes as Pass[] | undefined) ?? [];

  // live "now" stats for plays whose games are in progress
  const liveReqs = useMemo(
    () => (d?.gameInfo ? Object.values(d.gameInfo).map((g) => ({ pk: g.pk, date: g.start ?? null })) : []),
    [d],
  );
  const liveNow = useLiveNow(liveReqs);
  const playNow = useCallback(
    (r: PickRow) =>
      r.gkey && d?.gameInfo ? liveNow.legNow(d.gameInfo[r.gkey]?.pk ?? null, r.lkey) : null,
    [d, liveNow],
  );
  /* INSTRUCTION 51 (2026-09-11), Josh's order verbatim: "Authorize the live in-play odds pull for
     MLB" — THE SAME OVERLAY THE BOARD READS, on the tab Josh actually sits on.

     One free GET to the budgeted server route (src/lib/mlb/live-client.ts). This page reaches no
     paid feed: the key, the daily budget, the free divergence gate that decides which games are
     worth paying for, and the 429 cooldown all live on the server. There is no refetchInterval in
     that module — a timer on a paid feed spends money while nobody is looking — so it re-reads on
     mount, on focus, and on Josh's own Refresh. */
  const liveQuotes = useMlbLiveQuotes(board?.date ?? null);
  const liveOverlay = liveQuotes.data ?? null;
  /* THE OVERLAY'S QUOTE FOR THIS PLAY, OR NOTHING. Three separate reasons for null, each a
     deliberate refusal rather than an omission — and every one of them falls through to
     INSTRUCTION 50's SETTLED suppression, byte-identical:
       • no quote — the book posts no in-play market on this leg, or the budget refused the pull;
       • the game is not live — a quote may never outlive its game, so a finished game never
         prints a live price;
       • the quote is older than MLB_LIVE_CLIENT.quoteMaxAgeSec — THE HARD RENDER-TIME DROP. Redis
         may still hold it; the screen may not show it. That cap is the only thing that lets the
         word "live" on this card be taken at face value.
     Same predicate, same constant and same key spelling as app/board/page.tsx's `rowLive`, so the
     two surfaces can never disagree about whether a price is live. */
  const playLive = useCallback(
    (r: PickRow): MlbLiveQuote | null => {
      const rows = liveOverlay?.rows;
      if (!rows || !r.gkey || !r.lkey) return null;
      const q = rows[`${r.gkey}|${r.lkey}`];
      if (!q) return null;
      const pk = d?.gameInfo?.[r.gkey]?.pk ?? null;
      if (pk == null || !liveNow.games[pk]?.live) return null;
      if (Date.now() - Date.parse(q.at) > MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000) return null;
      return q;
    },
    [liveOverlay, d, liveNow],
  );
  /** when THIS GAME's live line was pulled — per game, never board-level; that is the whole
      answer to "how fresh", and a game turning due cannot age another game's price */
  const livePricedAt = useCallback(
    (gkey: string | null | undefined) => (gkey ? liveOverlay?.pricedAt?.[gkey] ?? null : null),
    [liveOverlay],
  );

  /* INSTRUCTION 50 item 2, on THE SHARP (fix pass). This is the tab Josh says the refresh works
     on, so it is the one he sits on — and it reproduced the bug verbatim: the live tally
     "● now 3 H+R+RBI · Top 4" printed on the same line as the pregame EV badge and the green
     EDGE tag, with no check that the boxscore had already decided the leg. The read is the same
     pure function the Board uses, and it costs nothing here: playNow already carries `.val`.

     INSTRUCTION 51 — NOW ASKED AT THE LIVE LINE. The comparison itself stays exactly where it is,
     inside settledRead; what changes is the line it is handed. The stored lkey is
     `player|market|line`, so the third segment is swapped for the line the book is posting NOW and
     `lineOf` picks it up with no edit to that module (src/lib/pred-serialize.ts:205). Then:
       • case A, re-anchored — 3 against a live 3.5 returns null by itself, because !(3 > 3.5)
         (src/lib/leg-settled.ts:87). The suppression falls away the instant a real line exists.
       • case B, provably settled — 3 against a live 0.5 still reads over-cleared, and the sentence
         now cites the live line, because `why` quotes the line it was given.
       • case C, no quote — identical to INSTRUCTION 50, byte for byte, and it is the DEFAULT on
         every failure path: no budget, a 429, no in-play market, an unmatched event, a dead game.
     Segment 1 (the player) never moves, so tab purity is untouched. */
  const playSettled = useCallback(
    (r: PickRow): LegSettledRead | null => {
      const q = playLive(r);
      /* THE SWAP IS OVER-ONLY (fix pass, 2026-09-11), mirroring app/board/page.tsx's `rowSettled`.
         Re-anchoring claims "the bet on this card is now the one the book is posting", which is true
         of an Over whose stored leg has won and false of an Under whose stored leg has LOST: a
         higher live line would un-decide a decided loss and put the play back at the top of the
         desk. An Under is always read at the line Josh actually holds. */
      if (!q || legSideOf(r.sub) === "U") return settledRead(r.lkey, r.sub, playNow(r)?.val);
      const [player, market] = String(r.lkey ?? "").split("|");
      return settledRead(`${player}|${market}|${q.ln}`, r.sub, playNow(r)?.val);
    },
    [playNow, playLive],
  );
  /* A decided leg is not a "play". It is NOT hidden — nothing is deleted from the desk's read —
     but it sinks below everything still open, so it can never head today's list. */
  const shownPlays = useMemo(
    () => plays.map((r, i) => ({ r, i, s: playSettled(r), q: playLive(r) })).sort((a, b) => Number(!!a.s) - Number(!!b.s) || a.i - b.i),
    [plays, playSettled, playLive],
  );

  /* CFB desk (2026-09-05): the global SportSwitch routes the page to the College Football
     read. Every hook above has already run, so this early return is hooks-safe. */
  if (CFB_ENABLED && desk === "cfb") {
    return (
      <>
        <PageHeader
          title="The Sharp"
          eyebrow="College Football"
          chip={<CfbChip />}
          sub="The desk's College Football read — the market + FPI margin model that prices every slate, constants in the open."
        />
        <CfbSharp />
      </>
    );
  }

  /* NFL desk (2026-09-08): the shared football read on the NFL desk handles (its own model constants). */
  if (NFL_ENABLED && desk === "nfl") {
    return (
      <>
        <PageHeader
          title="The Sharp"
          eyebrow="National Football League"
          chip={<NflChip />}
          sub="The desk's NFL read — the market + FPI margin model that prices every slate, constants in the open."
        />
        <NflSharp />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="The Sharp"
        sub={
          sport === "ufc"
            ? "The desk's UFC read — market consensus vs the Caesars line, no fight model, no key needed"
            : sport === "asg"
            ? "The desk's All-Star read — consensus-anchored ML/F3/F5, sim-priced correct scores, straight bets only"
            : "The quant engine's daily read — the exact engine from the original app (parity-proven), free, no key needed"
        }
        action={
          sport === "mlb" ? (
            <Pill variant="primary" onClick={() => regen.mutate()} disabled={regen.isPending || isPending}>
              {regen.isPending ? "Working the slate…" : d ? "Refresh read" : "Generate today's read"}
            </Pill>
          ) : undefined
        }
      />

      {(UFC_ENABLED || ASG_ENABLED) && (
        <div className="mb-4 flex items-center gap-2">
          <FilterPill selected={sport === "mlb"} onClick={() => pickSport("mlb")}>⚾ MLB</FilterPill>
          {UFC_ENABLED && <FilterPill selected={sport === "ufc"} onClick={() => pickSport("ufc")}>🥊 UFC</FilterPill>}
          {ASG_ENABLED && <FilterPill selected={sport === "asg"} onClick={() => pickSport("asg")}>⭐ ASG</FilterPill>}
        </div>
      )}

      {sport === "ufc" ? (
        <UfcSharp />
      ) : sport === "asg" ? (
        <AsgSharpTab />
      ) : !d ? (
        <Panel>
          <EmptyState
            title={isPending || regen.isPending ? "Working the numbers…" : "No read yet today"}
            body="One run pulls the slate, de-vigs every book, sims lineups and ranks the edges — the same engine that built every board since day one."
          />
        </Panel>
      ) : (
        <div className="space-y-5">
          {typeof d.overview === "string" && (
            <Reveal>
              <Panel title="The engine's own overview">
                <p className="text-[13px] leading-relaxed text-muted">{d.overview}</p>
                <div className="num mt-2 border-t border-white/[0.05] pt-2 text-[10.5px] text-faint">
                  Engine setting: Monte Carlo {SIM_PATHS_TXT} paths per game (live games resume from the real
                  score/inning/base-out state). The paragraph above is frozen at generation time — refresh for a
                  current read.
                </div>
              </Panel>
            </Reveal>
          )}

          {cal.line && (
            <Reveal>
              <div className="num rounded-(--radius-panel) border border-white/[0.06] bg-surface/60 px-4 py-2.5 text-[11.5px] text-muted">
                {cal.line}
              </div>
            </Reveal>
          )}

          <Reveal>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {selMode === "dk_fd"
                ? `Today's plays — EV at the DK/FD basis, gate +${gatePct}% (the Builder's exact bar; Caesars settles, never picks)`
                : selMode !== "caesars_ev"
                ? "Today's plays — highest true probability (consensus-anchored; Caesars prices the ticket, never picks it)"
                : "Today's plays — best playable EV at Caesars"}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {shownPlays.map(({ r, s: settled, q: live }, i) => (
                /* the glow says "bet this one". A settled row loses it (INSTRUCTION 50), and so does
                   a re-anchored live row (INSTRUCTION 51): the pregame rank that earned the halo was
                   computed against a line the game has moved past, and a live row carries no stake. */
                <Panel key={`${r.label}|${r.sub}`} className={i === 0 && !settled && !live ? "glow-pos" : ""}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="display text-[16px] text-text"><BoardLabel label={r.label} /></div>
                      <div className="mt-0.5 text-[12px] text-muted">{r.sub}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {selMode === "dk_fd" && r.bsOdds != null && (
                        <span className="num inline-flex items-baseline gap-1.5">
                          <OddsCell odds={r.bsOdds as never} />
                          <span className="text-[9.5px] uppercase text-muted">
                            {String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}
                          </span>
                        </span>
                      )}
                      <OddsCell odds={r.czOdds as never} book="caesars" />
                      <ConvChip c={r.conv as string} />
                    </div>
                  </div>
                  <div className="num mt-3 flex flex-wrap items-center gap-3 text-[11.5px]">
                    {/* the headline probability. On a re-anchored row the pregame number answers a
                        question the game no longer asks (it was computed against the pregame line),
                        so the live read replaces it and SAYS WHICH IT IS: "live" = the engine's own
                        remaining-game sim, "market fair" = the books' de-vigged number at the live
                        line. The two are never blended and never relabelled as each other. */}
                    {(() => {
                      /* TWO FIXES HERE (fix pass, 2026-09-11), both about saying a true thing:
                         1. SIDE. `live.pLive` is always P(OVER) — the overlay key carries no side —
                            so an Under play was shown the Over's probability as its own. The sided
                            view answers for the side this play is actually on (1 − p on an Under).
                         2. A SETTLED PLAY HAS NO LIVE PROBABILITY. `playSettled` refuses to
                            re-anchor an Under, so a decided Under is read at the line Josh holds;
                            printing a live probability above that verdict offers a live read on a
                            bet that is already lost. It falls back to the pregame number, labelled
                            as such, exactly as the SETTLED branch below describes it. */
                      const v = live && !settled ? mlbLiveView(live, legSideOf(r.sub)) : null;
                      return v && v.p != null ? (
                        <span
                          className={v.pSrc === "sim" ? "text-text" : "text-muted"}
                          title={
                            v.pSrc === "sim"
                              ? `Re-simulated from the game state for the rest of this game, against the live ${v.side} ${v.ln} line — not the pregame number`
                              : `The books' own de-vigged fair at the live ${v.side} ${v.ln} line — the engine had no remaining-game sim for this leg, so the market speaks for itself`
                          }
                        >
                          {(v.p * 100).toFixed(1)}% {v.pSrc === "sim" ? "live" : "market fair"}
                        </span>
                      ) : (
                        <span className="text-text">{Number(r.prob).toFixed(1)}% true</span>
                      );
                    })()}
                    {(() => {
                      const n = playNow(r);
                      return n ? (
                        <span
                          className="text-[10px] font-bold text-live"
                          title="Live from the official boxscore — updates every minute while the game is in progress"
                        >
                          ● {nowLabel(n)}
                        </span>
                      ) : null;
                    })()}
                    {settled ? (
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={`${settled.why} — the price shown is the pregame lock, not a live market`}
                      >
                        <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-gold">
                          SETTLED
                        </span>
                        <span className={`text-[10px] ${settled.side === "U" ? "text-neg" : "text-pos"}`}>
                          {settled.why} — the price shown is the pregame lock, not a live market
                        </span>
                      </span>
                    ) : live ? (
                      /* THE THIRD BRANCH (INSTRUCTION 51) — RE-ANCHORED. The leg is live, a fresh
                         posted quote exists, and settledRead cleared it against THAT quote's line, so
                         there is a real bet here again. What prints is the live line, the live Caesars
                         price and the EV at that price — and NOTHING ELSE. Specifically absent, all
                         deliberate, all matching the CFB live rail (src/components/cfb/CfbPicksBoard.tsx:228):
                           • no ¼-Kelly stake — a stake sized off a pregame edge is wrong the moment the
                             line moves, and this desk has never sized one on a live row;
                           • no EDGE tag — that badge is the pregame gate's verdict on a pregame price;
                           • no pregame EV — it is not shown beside a live price, ever, because two EVs
                             on one line is how the wrong one gets bet. */
                      (() => {
                        /* THREE FIXES, ALL IN THIS BRANCH (fix pass, 2026-09-11):
                           1. SIDE. The overlay is keyed `gkey|lkey` and an lkey carries no side, so
                              `live.czAm` / `live.evCz` are the OVER's price and the OVER's EV. An
                              Under play was being shown the opposite bet's number with the sign
                              kept — a losing Under dressed as a green live edge. `mlbLiveView`
                              answers for the side this play is actually on.
                           2. AGE. The label read the GAME's last-asked stamp, so a quote carried
                              through a failed per-event call printed as just-pulled under a fresh
                              game stamp. It reads THIS QUOTE's own `at`, the same field the
                              render-time drop above tests.
                           3. VOCABULARY. `EvBadge` is the model-edge badge; a `pSrc: "market"` EV is
                              the de-vigged price measured against itself, an edge of zero by
                              construction. The figure is still shown — it is the EV at the live
                              price — with its source named, and no badge. */
                        const v = mlbLiveView(live, legSideOf(r.sub));
                        const age = mlbLiveAgeLabel(v.at);
                        const asked = livePricedAt(r.gkey);
                        return (
                          <>
                            <LivePill />
                            <span className="text-live" title="The line the book is posting right now — the pregame line above it is history">
                              live line {v.side} {v.ln}
                            </span>
                            {v.am != null ? (
                              <span title="The live Caesars price on THIS side — a posted quote, never derived">
                                <OddsCell odds={v.am} book="caesars" />
                              </span>
                            ) : (
                              <span className="text-faint" title="Caesars posts no in-play price on this side right now — nothing is substituted in its place">
                                no live Caesars price
                              </span>
                            )}
                            {v.ev == null ? null : v.pSrc === "sim" ? (
                              <span title="EV at the LIVE Caesars price against the live line, off the engine's own remaining-game sim — this replaces the pregame EV, it does not sit beside it">
                                <EvBadge ev={v.ev} />
                              </span>
                            ) : (
                              <span
                                className="num text-[10px] text-muted"
                                title="EV at the live Caesars price, measured against the market's own de-vigged fair — so it claims no edge over the price it came from. No badge, because nothing computed an edge."
                              >
                                {`${v.ev > 0 ? "+" : ""}${v.ev.toFixed(1)}% vs market`}
                              </span>
                            )}
                            <span className="text-faint text-[10px]" title={`When THIS quote was taken. Older than 30 minutes and it is dropped rather than shown.${asked ? ` The game was last asked ${mlbLiveAgeLabel(asked)}.` : ""}`}>
                              {age}
                            </span>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <EvBadge ev={Number(selMode === "dk_fd" ? r.bsEv : r.czEv)} />
                        {selMode === "dk_fd" && r.czEv != null && (
                          <span className="text-muted" title="Informational: EV at the Caesars settlement price">
                            @CZ {Number(r.czEv) > 0 ? "+" : ""}{Number(r.czEv).toFixed(1)}%
                          </span>
                        )}
                        {(selMode === "dk_fd" ? r.bsBadge : r.czBadge) ? (
                          <span className="rounded-full border border-pos/50 bg-pos/10 px-2 py-0.5 text-[9.5px] font-bold text-pos">
                            EDGE
                          </span>
                        ) : null}
                      </>
                    )}
                    {r.lu === "projected" && (
                      <span
                        className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9.5px] font-bold text-gold"
                        title="Lineup not posted yet — projected everyday starter; Caesars auto-voids the leg if he sits"
                      >
                        PROJ
                      </span>
                    )}
                  </div>
                  {Array.isArray(r.tags) && r.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {(r.tags as string[]).slice(0, 4).map((t) => (
                        <span key={t} className="rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </Panel>
              ))}
            </div>
            {/* INSTRUCTION 51 — THE LIVE PULL SAYS WHAT IT COST AND WHAT IT MISSED. Every clause is a
                count off the overlay the server returned; nothing here is estimated, and the budget is
                stated out loud rather than hidden behind a spinner. Same sentence as the Board's
                footnote (app/board/page.tsx), so the two tabs cannot tell Josh different stories. */}
            {liveOverlay && (
              <p className="mt-3 text-[10px] leading-snug text-faint" data-testid="sharp-live-footnote">
                live lines priced {mlbLiveClockLabel(liveOverlay.generatedAt)} · {liveOverlay.fetched} of{" "}
                {liveOverlay.live} in-play game{liveOverlay.live === 1 ? "" : "s"} re-priced
                {liveOverlay.noLive ? ` · ${liveOverlay.noLive} game${liveOverlay.noLive === 1 ? "" : "s"} post no in-play market` : ""}
                {liveOverlay.unmatched ? ` · ${liveOverlay.unmatched} game${liveOverlay.unmatched === 1 ? "" : "s"} could not be matched to an odds event` : ""}
                {liveOverlay.capped ? ` · capped at ${liveOverlay.fetched} per pull` : ""}
                {liveOverlay.stale ? " · showing stored quotes — the current window was not re-pulled" : ""}
                {liveOverlay.oddsMissing ? " · the odds feed did not answer — nothing was fabricated" : ""}
                {` · today's live-odds budget is ${MLB_LIVE_CLIENT.dailyBudget} credits`}
                {liveOverlay.spentToday != null ? ` · ${liveOverlay.spentToday} spent today` : ""}
                {liveOverlay.note ? ` · ${liveOverlay.note}` : ""}
                {" · a live row carries no ¼-Kelly stake · prices are posted quotes, never invented"}
              </p>
            )}
            {notOffered.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">
                  {selMode === "dk_fd"
                    ? "Clears the gate at the basis, not offered at Caesars — never substituted with a weaker pick"
                    : "In the top picks, not offered at Caesars — never substituted with a lower-probability pick"}
                </h3>
                <div className="space-y-1.5">
                  {notOffered.map((r) => (
                    <div key={`${r.label}|${r.sub}`} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                      <span>
                        <span className="text-text"><BoardLabel label={r.label} /></span> <span className="text-muted">{r.sub}</span>
                        {r.lu === "projected" && <span className="ml-1.5 text-[9.5px] font-bold text-gold">PROJ</span>}
                      </span>
                      <span className="num text-[11.5px] text-muted">
                        {selMode === "dk_fd"
                          ? `${Number(r.prob).toFixed(1)}% true · basis ${String(r.bsOdds)} (${String(r.bsBook ?? "").replace("draftkings", "DK").replace("fanduel", "FD")}) · +${Number(r.bsEv).toFixed(1)}% EV`
                          : `${Number(r.prob).toFixed(1)}% true · best ${String(r.odds)} @ ${String(r.book ?? "—")}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {plays.length === 0 && (
              <Panel>
                <EmptyState
                  title={
                    selMode === "dk_fd"
                      ? `Nothing clears +${gatePct}% EV at the DK/FD basis right now`
                      : selMode !== "caesars_ev"
                      ? "No playable picks right now"
                      : "No positive-EV plays at Caesars right now"
                  }
                  body="The engine found nothing playable on this slate — that's a real answer, not a failure. Passing is a position."
                />
              </Panel>
            )}
          </Reveal>

          {trap && (
            <Reveal>
              <Panel title="Trap of the day" className="border-neg/20">
                <div className="text-[13px] font-semibold text-neg">{trap.prop}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-muted">{trap.reason}</div>
              </Panel>
            </Reveal>
          )}

          {passes.length > 0 && (
            <Reveal>
              <details className="glass px-5 py-4">
                <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  What the engine passed on ({passes.length}) — and why
                </summary>
                <div className="mt-3 space-y-2.5">
                  {passes.map((p) => (
                    <div key={p.prop}>
                      <div className="text-[12.5px] font-medium text-text">{p.prop}</div>
                      <div className="text-[11.5px] text-muted">{p.reason}</div>
                    </div>
                  ))}
                </div>
              </details>
            </Reveal>
          )}

          <Reveal>
            <details className="glass px-5 py-4">
              <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                How the engine thinks (the method, in plain language)
              </summary>
              <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-muted">
                <p>
                  <b className="text-text">1 · The market is the prior.</b> Every posted book gets de-vigged;
                  the median across books is the consensus &quot;fair&quot; probability. The engine has to earn any
                  disagreement with it.
                </p>
                <p>
                  <b className="text-text">2 · Form without hot-hand chasing.</b> Player rates blend the last
                  7/15/30 days, then shrink toward the player&apos;s own Statcast skill (xwOBA/xBA/xSLG, barrel
                  and hard-hit rates) — small samples get pulled hard, real signals survive. Batter-vs-pitcher
                  history only nudges with 15+ career meetings.
                </p>
                <p>
                  <b className="text-text">2b · Pitchers judged on what they control.</b> Starter quality blends
                  ERA with FIP (strikeouts, walks, HBP, homers — defense stripped out) plus WHIP for baserunner
                  traffic. A starter whose ERA flatters his xERA gets faded as a regression candidate; the
                  unlucky ones get credit. Starters averaging deep pitch counts lose late-inning outs, and the
                  bullpen behind every lead is scored on both fatigue (3-day workload) and quality (rolling pen
                  ERA/WHIP vs league).
                </p>
                <p>
                  <b className="text-text">3 · Games get simulated.</b> {SIM_PATHS_TXT} seeded Monte Carlo paths
                  per game with confirmed lineups — a full per-plate-appearance base-out machine with platoon
                  (LHP/RHP) splits, park factors by batter handedness, wind and temperature, ump strike zones,
                  and bullpen chains. In-progress games RESUME from the real score, inning, outs, runners and
                  each player&apos;s current tally, and simulate only the remainder. It prices ML/RL, props,
                  and flags correlated parlay legs.
                </p>
                <p>
                  <b className="text-text">4 · Model meets market.</b> Final probability = 35% model / 65%
                  consensus for props (15/85 for ML-RL). EV is computed at the DK/FD selection basis (Caesars
                  settles the ticket). EDGE badges need both the EV threshold and enough sample behind it.
                </p>
                <p>
                  <b className="text-text">5 · Discipline is hard-coded.</b> ¼-Kelly capped at 2% per bet,
                  both sides of every line rank by edge (a direction filter is a Settings choice, never a
                  hardcode), HR props never mix with other types, the daily card always spreads across 4+
                  tickets with no ticket over 25%, K&apos;s parlays are last-resort fill capped at 15% (they
                  went 0-for-4 as lead tickets — the ledger is the boss), no pick rides two tickets, the
                  daily amount always sums exactly — and everything locked gets graded from official box
                  scores.
                </p>
              </div>
            </details>
          </Reveal>

          <Reveal>
            <details className="glass px-5 py-4 opacity-80">
              <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                Optional: AI second opinion (off — needs a server API key, ~$0.50/run)
              </summary>
              <AiMode />
            </details>
          </Reveal>
        </div>
      )}

      <div className="mt-6 text-[10.5px] text-faint">
        {sport === "ufc"
          ? "UFC numbers are market-derived only (de-vigged consensus) — no model, nothing invented. Informational only, not betting advice."
          : "Same math, provably: the engine runs verbatim from the original app and a test suite rejects any change that alters its picks. Informational only, not betting advice."}
      </div>
    </>
  );
}

/* ---------- optional Claude mode (dormant without ANTHROPIC_API_KEY) ---------- */
function AiMode() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setMsg("Checking the server…");
    try {
      const r = await fetch("/api/sharp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      setMsg(j.error || "Configured — ask Claude to wire the full AI run when you want it.");
    } catch {
      setMsg("Server unreachable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 text-[12px] text-muted">
      <p>
        An LLM handicapper can read the same slate and argue its own card. It costs real money per run and is
        entirely optional — the quant engine above is and stays the default brain of this app.
      </p>
      <Pill variant="ghost" onClick={run} disabled={busy}>
        {busy ? "Checking…" : "Check availability"}
      </Pill>
      {msg && <div className="text-[11.5px] text-gold">{msg}</div>}
    </div>
  );
}

/* CFB desk chip — the 🏈 badge beside the h1 whenever the global SportSwitch is on College Football */
function CfbChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cfb/40 bg-cfb/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cfb">
      🏈 CFB
    </span>
  );
}

/* NFL desk chip — the 🏈 badge beside the h1 whenever the global SportSwitch is on the NFL (2026-09-08) */
function NflChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-nfl/40 bg-nfl/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-nfl">
      🏈 NFL
    </span>
  );
}
