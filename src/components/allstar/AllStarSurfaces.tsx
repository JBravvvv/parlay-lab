"use client";

/* All-Star Game surfaces — the ⭐ ASG tab on the Board, The Sharp and the
   Builder. One shared hook (useAllStar) feeds all three. STRAIGHT BETS ONLY:
   Caesars NV offers no parlays on this game, so there is no combo UI at all —
   the Builder sizes a card of singles. */

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { getMoney, setMoney } from "@/lib/engine-client";
import {
  type AsgCardPick,
  type AsgLeg,
  asgCard,
  fairAmerican,
  parseCaesarsBoard,
} from "@/engine2/allstar";
import { type AsgMarket, MONEY_KEY, useAllStar } from "@/lib/useAllStar";

/* ---------------------------------------------------------------- format */
const fmtAm = (a: number) => (a > 0 ? `+${a}` : `${a}`);
const fmtP = (p: number | null, d = 1) => (p == null ? "—" : `${(p * 100).toFixed(d)}%`);
const fairAm = (p: number) => {
  const a = fairAmerican(p);
  return a == null ? "—" : fmtAm(a);
};
const fmtMoney = (n: number) => `$${n.toLocaleString()}`;

const GROUP_LABEL: Record<AsgLeg["group"], string> = {
  ML: "MONEYLINE",
  F3: "FIRST 3 INNINGS",
  F5: "FIRST 5 INNINGS",
  TOTAL: "GAME TOTAL",
  HR: "HOME RUN PROPS",
  SCORE: "CORRECT SCORE",
};
const GROUP_ORDER: AsgLeg["group"][] = ["ML", "F3", "F5", "TOTAL", "HR", "SCORE"];

/* ----------------------------------------------------------------- shell */

function EventLine({ m }: { m: AsgMarket }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
      <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest text-gold">
        ⭐ All-Star Game
      </span>
      {m.meta?.venue && <span>{m.meta.venue}</span>}
      {m.meta?.startEt && <span className="num">First pitch {m.meta.startEt}</span>}
      {m.meta?.status && <span>{m.meta.status}</span>}
      <button onClick={m.refresh} className="text-[11px] font-semibold text-pos hover:underline">
        ↻ Refresh odds
      </button>
    </div>
  );
}

function AsgShell({ m, children }: { m: AsgMarket; children: (m: AsgMarket) => React.ReactNode }) {
  if (m.loading)
    return (
      <Panel>
        <SkeletonRows rows={8} />
      </Panel>
    );
  if (m.err)
    return (
      <Panel>
        <ErrorState title="Couldn't load the All-Star board" body={m.err} onRetry={m.refresh} />
      </Panel>
    );
  if (!m.book || !m.fairs)
    return (
      <Panel>
        <EmptyState title="No All-Star Game in the odds feed" body="Check back on game day." />
      </Panel>
    );
  return <>{children(m)}</>;
}

/* ----------------------------------------------------------- paste panel */

export function AsgPastePanel({ m }: { m: AsgMarket }) {
  const parsed = parseCaesarsBoard(m.paste.board);
  const hasPaste = m.paste.board.trim().length > 0;
  return (
    <Reveal>
      <Panel title="Paste the Caesars ASG board — one paste, every market">
        <p className="mb-2 text-[11.5px] leading-relaxed text-muted">
          Every All-Star market is posted in your Caesars Sportsbook NV app. ML, F3, F5, the total and the
          main HR props already stream in live from Caesars&apos; feed — copy the rest of the board (correct
          score, the full HR list) and paste it all here; the desk sorts every line into the right market.
        </p>
        <textarea
          value={m.paste.board}
          onChange={(e) => m.savePaste({ board: e.target.value })}
          placeholder={"AL 5-4 +900\nNL 3-2 +850\nAny other AL win +700\nAny other +250\nPete Alonso +650\nShohei Ohtani +425"}
          rows={5}
          className="w-full resize-y rounded-[12px] border border-line-2 bg-white/[0.03] px-3 py-2 font-mono text-[11.5px] leading-relaxed text-text outline-none placeholder:text-faint focus:border-pos/60"
        />
        <div className="num mt-1.5 text-[10px] text-faint">
          {hasPaste
            ? `${parsed.scores.length} correct-score lines · ${parsed.hr.length} HR props${
                parsed.covered ? ` · ${parsed.covered} game-market lines (already live from the feed)` : ""
              }${parsed.unmatched.length ? ` · ${parsed.unmatched.length} skipped` : ""}`
            : `${m.book?.hr.length ?? 0} HR props already live from Caesars' feed — the paste adds correct score and the rest of the board`}
        </div>
      </Panel>
    </Reveal>
  );
}

/* ------------------------------------------------------------ edge table */

function LegRow({ l }: { l: AsgLeg }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.04] py-2 last:border-0">
      <div className="min-w-0">
        <span className="text-[13px] font-medium text-text">{l.label}</span>{" "}
        <span className="text-[11.5px] text-muted">{l.prop}</span>
        <div className="num mt-0.5 text-[10.5px] text-faint">
          {l.model != null && <>model {fmtP(l.model)} · </>}
          {l.market != null ? <>market {fmtP(l.market)} · </> : null}
          blend {fmtP(l.blend)} · fair {fairAm(l.blend)} · {l.note}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="num text-[13px] font-semibold text-gold">{fmtAm(l.odds)}</span>
        <EvBadge ev={l.ev * 100} />
      </div>
    </div>
  );
}

export function AsgEdgeGroups({ legs }: { legs: AsgLeg[] }) {
  return (
    <div className="space-y-4">
      {GROUP_ORDER.map((g) => {
        const rows = legs.filter((l) => l.group === g);
        if (!rows.length) return null;
        return (
          <Reveal key={g}>
            <Panel title={GROUP_LABEL[g]}>
              {rows.map((l) => (
                <LegRow key={l.key} l={l} />
              ))}
              {g === "HR" && (
                <div className="mt-2 text-[10px] leading-relaxed text-faint">
                  All prices are Caesars&apos;. HR props are one-sided (Over only), so there is no de-vig —
                  every price is anchored to its own raw implied probability. The model (real season HR/PA ×
                  expected trips from the announced order) can reorder this list; it is not allowed to
                  manufacture EV. Paste the rest of the Caesars HR board above to price every batter.
                </div>
              )}
              {g === "SCORE" && (
                <div className="mt-2 text-[10px] leading-relaxed text-faint">
                  Priced by the calibrated game sim (the sim reproduces the market&apos;s ML and total by
                  construction). A 9-inning tie goes to the swing-off — the winner changes, the score doesn&apos;t.
                </div>
              )}
            </Panel>
          </Reveal>
        );
      })}
    </div>
  );
}

/* ============================================================= BOARD tab */

export function AsgBoardTab() {
  const m = useAllStar();
  return (
    <AsgShell m={m}>
      {(m) => (
        <div className="space-y-5">
          <EventLine m={m} />
          <Reveal>
            <Panel title="Market read — consensus fair vs the Caesars price">
              <div className="grid gap-3 text-[12px] text-muted md:grid-cols-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-faint">Moneyline fair</div>
                  <div className="num mt-1 text-[15px] text-text">
                    AL {fmtP(m.fairs!.ml?.pAL ?? null)} · NL {fmtP(m.fairs!.ml ? 1 - m.fairs!.ml.pAL : null)}
                  </div>
                  <div className="num text-[10.5px] text-faint">{m.fairs!.ml?.n ?? 0} books, Shin de-vig</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-faint">Total</div>
                  <div className="num mt-1 text-[15px] text-text">
                    {m.fairs!.total ? `${m.fairs!.total.point} · over ${fmtP(m.fairs!.total.pOver)}` : "—"}
                  </div>
                  <div className="num text-[10.5px] text-faint">
                    sim mean {m.sim ? m.sim.meanTotal.toFixed(1) : "—"} runs
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-faint">Tie after 9</div>
                  <div className="num mt-1 text-[15px] text-text">{fmtP(m.sim?.tie9 ?? null)}</div>
                  <div className="num text-[10.5px] text-faint">goes to the HR swing-off</div>
                </div>
              </div>
            </Panel>
          </Reveal>
          <AsgPastePanel m={m} />
          <AsgEdgeGroups legs={m.legs} />
          <div className="text-[10.5px] text-faint">
            Straight bets only — Caesars NV doesn&apos;t offer All-Star Game parlays. Exhibition baseball: tiny
            edges, huge variance. Informational only, not betting advice.
          </div>
        </div>
      )}
    </AsgShell>
  );
}

/* ============================================================= SHARP tab */

function sharpReason(l: AsgLeg): string {
  if (l.group === "HR")
    return l.model != null
      ? `Book-anchored: implied ${fmtP(l.blend)} after the model's nudge. ${l.note}. The model uses his real season rate over ~2–3 All-Star trips — treat this as ordering, not an edge.`
      : `Book-anchored only — ${l.note}.`;
  if (l.group === "SCORE")
    return `The calibrated sim makes this score ${fmtP(l.model)}; ${l.market != null ? `the pasted field de-vigs to ${fmtP(l.market)}` : "no field de-vig on a partial paste"}. Exhibition scoring is noisy — FUN sizing only.`;
  if (l.market != null && l.model != null)
    return `Market fair ${fmtP(l.market)} (${l.note}); the calibrated game's structure independently reads ${fmtP(l.model)} for this window. CZ pays ${fmtAm(l.odds)} vs fair ${fairAm(l.blend)}.`;
  return `Consensus fair ${fmtP(l.market)} (${l.note}) vs ${fmtAm(l.odds)} at Caesars — fair price ${fairAm(l.blend)}.`;
}

export function AsgSharpTab() {
  const m = useAllStar();
  return (
    <AsgShell m={m}>
      {(m) => {
        const plays = m.legs.filter((l) => l.ev > 0).slice(0, 6);
        return (
          <div className="space-y-5">
            <EventLine m={m} />
            <Reveal>
              <Panel title="The engine's All-Star read">
                <p className="text-[13px] leading-relaxed text-muted">
                  The market defines this game: {m.fairs!.ml?.n ?? 0} books de-vig to{" "}
                  <span className="text-text">AL {fmtP(m.fairs!.ml?.pAL ?? null)}</span> on the moneyline and{" "}
                  <span className="text-text">
                    {m.fairs!.total ? `${m.fairs!.total.point} total` : "no total"}
                  </span>
                  . The sim is calibrated to reproduce those numbers exactly — what it adds is the joint
                  structure: first-3 / first-5 cross-checks and every correct-score probability. An exhibition
                  with one-inning pitchers is close to a coin flip; anything the vig doesn&apos;t survive is a pass.
                </p>
              </Panel>
            </Reveal>
            <AsgPastePanel m={m} />
            {plays.length > 0 ? (
              <Reveal>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Playable edges — straight bets at the Caesars price
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {plays.map((l, i) => (
                    <Panel key={l.key} className={i === 0 ? "glow-pos" : ""}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="display text-[16px] text-text">{l.label}</div>
                          <div className="mt-0.5 text-[12px] text-muted">{l.prop}</div>
                        </div>
                        <span className="num shrink-0 text-[14px] font-semibold text-gold">{fmtAm(l.odds)}</span>
                      </div>
                      <div className="num mt-3 flex flex-wrap items-center gap-3 text-[11.5px]">
                        <span className="text-text">{fmtP(l.blend)} true</span>
                        <EvBadge ev={l.ev * 100} />
                      </div>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{sharpReason(l)}</p>
                    </Panel>
                  ))}
                </div>
              </Reveal>
            ) : (
              <Panel>
                <EmptyState
                  title="No positive-EV play on this board"
                  body="The blend can't beat the vig anywhere right now — that's a real answer on an exhibition night. Passing is a position."
                />
              </Panel>
            )}
            <div className="text-[10.5px] text-faint">
              Straight bets only (no ASG parlays at Caesars NV). Informational only, not betting advice.
            </div>
          </div>
        );
      }}
    </AsgShell>
  );
}

/* =========================================================== BUILDER tab */

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-line-2 bg-surface-2 px-4 py-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <span className="num text-[13px] text-muted">$</span>
      <input
        type="number"
        min={0}
        value={value || ""}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="num w-16 bg-transparent text-[14px] font-semibold text-text outline-none"
      />
    </label>
  );
}

function CardTicket({ p }: { p: AsgCardPick }) {
  return (
    <div className={`glass px-4 py-3 ${p.leg.ev > 0 ? "ev-glow" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-text">
          <span className="num mr-2 rounded-full border border-line-2 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted">
            Straight
          </span>
          {p.leg.label} <span className="font-normal text-muted">{p.leg.prop}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="num rounded-full border border-pos/50 bg-pos/10 px-2.5 py-0.5 text-[12px] font-bold text-pos">
            {fmtMoney(p.stake)}
          </span>
          <span className="num text-[13px] font-semibold text-gold">{fmtAm(p.leg.odds)}</span>
          <EvBadge ev={p.leg.ev * 100} />
        </div>
      </div>
      <div className="num mt-1.5 text-[10.5px] text-faint">
        {fmtP(p.leg.blend)} to hit · fair {fairAm(p.leg.blend)} · {GROUP_LABEL[p.leg.group]}
        {p.leg.market == null && " · one-sided market, anchored to the raw price"}
      </div>
    </div>
  );
}

export function AsgBuilderTab() {
  const m = useAllStar();

  // ASG stakes are their own pot — NOT the MLB card's daily/fun (locking the
  // MLB card consumes those); bankroll is shared with the rest of the product
  const [money, setMoneyState] = useState({ daily: 0, fun: 0, bankroll: 750 });
  useEffect(() => {
    let saved = { daily: 0, fun: 0 };
    try {
      saved = { ...saved, ...(JSON.parse(localStorage.getItem(MONEY_KEY) ?? "{}") as Partial<typeof saved>) };
    } catch {
      /* fresh device */
    }
    setMoneyState({ daily: saved.daily, fun: saved.fun, bankroll: getMoney().bankroll });
  }, []);
  const updateMoney = (patch: Partial<{ daily: number; fun: number; bankroll: number }>) => {
    setMoneyState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(MONEY_KEY, JSON.stringify({ daily: next.daily, fun: next.fun }));
      } catch {
        /* session-only */
      }
      if (patch.bankroll != null) setMoney({ bankroll: patch.bankroll });
      return next;
    });
  };

  return (
    <AsgShell m={m}>
      {(m) => {
        const card = asgCard(m.legs, money);
        return (
          <div className="space-y-5">
            <EventLine m={m} />
            <Reveal>
              <Panel title="All-Star card — straight bets only">
                <p className="mb-3 text-[12px] leading-relaxed text-muted">
                  Caesars NV doesn&apos;t offer parlays on the All-Star Game, so every ticket below is a single.
                  DAILY spreads across the strongest market edges (¼-Kelly weighted, capped at 2% of bankroll a
                  ticket, summed exactly to your number). FUN buys up to three honest longshots — HR props and
                  correct scores live there.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <MoneyInput label="Daily" value={money.daily} onChange={(n) => updateMoney({ daily: n })} />
                  <MoneyInput label="Fun" value={money.fun} onChange={(n) => updateMoney({ fun: n })} />
                  <MoneyInput label="Bankroll" value={money.bankroll} onChange={(n) => updateMoney({ bankroll: n })} />
                </div>
                {card.reduced && (
                  <div className="mt-3 rounded-[12px] border border-gold/30 bg-gold/[0.06] px-3 py-2 text-[11.5px] text-gold">
                    Reduced-action night: no market edge clears the vig, so the daily card is sized down the
                    least-bad board. Passing entirely is the sharper play.
                  </div>
                )}
              </Panel>
            </Reveal>
            <AsgPastePanel m={m} />
            {money.daily > 0 && card.daily.picks.length > 0 && (
              <Reveal>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Daily — {fmtMoney(card.daily.sum)} · avg EV {(card.daily.ev * 100).toFixed(1)}%
                </h2>
                <div className="space-y-2">
                  {card.daily.picks.map((p) => (
                    <CardTicket key={p.leg.key} p={p} />
                  ))}
                </div>
              </Reveal>
            )}
            {money.fun > 0 && card.fun.picks.length > 0 && (
              <Reveal>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Fun — {fmtMoney(card.fun.sum)} · longshots at +500 or better
                </h2>
                <div className="space-y-2">
                  {card.fun.picks.map((p) => (
                    <CardTicket key={p.leg.key} p={p} />
                  ))}
                </div>
              </Reveal>
            )}
            {money.daily === 0 && money.fun === 0 && (
              <Panel>
                <EmptyState
                  title="Enter Daily and Fun amounts to size the card"
                  body="The allocator sizes straight bets only — Caesars NV takes no All-Star parlays — and the stakes sum exactly to your numbers."
                />
              </Panel>
            )}
            <div className="text-[10.5px] text-faint">
              ASG stakes are tracked separately from the MLB daily card. Informational only, not betting advice.
            </div>
          </div>
        );
      }}
    </AsgShell>
  );
}
