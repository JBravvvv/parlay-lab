"use client";

import { useEffect, useState, type ReactNode } from "react";
import { amFmt, combineTicket } from "@/lib/ticket-math";
import { parseAmerican } from "@/lib/parlay-calc";
import { parseBoardLabel } from "@/lib/player-card";
import { PlayerMark } from "@/components/player/PlayerMark";
import { PlayerName } from "@/components/player/PlayerName";
import { MKT_LABEL } from "./props-model";
import {
  LEG_MAX,
  LEG_MIN,
  REPAIR_TRIES,
  bandDec,
  poolCounts,
  type GenFail,
  type GenLeg,
  type GenPool,
  type GenResult,
  type GenSpec,
} from "@/lib/parlay-gen";

/**
 * PARLAY GENERATOR (INSTRUCTION 50, 2026-09-11, Josh's word, verbatim: "Parlay builder should
 * have a generator that I can select # of legs, prop category, min & max odds then it will
 * generate a parlay for me within those parameters; if I hit regenerate then it regenerates a
 * new parlay; each slot is clickable to keep that player(s) in any round and spin the other
 * slots").
 *
 * THE ODDS BAND IS PER LEG. Josh's own example — four H+R+RBI legs at -145 / -124 / -137 / -130
 * under the heading "-152 -> +110" — combines to +834, nowhere near that range, while every one
 * of the four sits INSIDE it individually. The example is only self-consistent read as a per-leg
 * band, so that is the primary control; a combined-payout band is a second, explicitly opt-in
 * mode under Advanced (and it says "about" when it reports what this pool can reach, because the
 * reach is a greedy estimate under the one-per-player / one-per-game rules, not a proof).
 *
 * This file is a DUMB VIEW: every number it prints comes from the pure generator
 * (src/lib/parlay-gen.ts) or from combineTicket, and every price renders through `amFmt`. There
 * is no fetch, no Odds credit, no ledger write and no engine run behind any control here — the
 * pool is the board that is already on the device.
 */

export const GEN_PANEL_ID = "props-gen-panel";

/** the six markets the sandbox prices; ML/RL are game markets and have no player slots (v1) */
export const GEN_MARKETS: readonly string[] = [
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
  "batter_hits_runs_rbis",
  "pitcher_strikeouts",
  "pitcher_outs",
];

/** the engine suspends these two from its OWN auto-built tickets (SH_CFG hrrAltMax:-1, outsSusp:true) */
const SUSPENDED = new Set(["batter_hits_runs_rbis", "pitcher_outs"]);

/* every count the generator will actually honour — the Faint line under this control quotes
   LEG_MIN..LEG_MAX, so offering 2-6 under a sentence that said "between 2 and 8" left two
   unreachable numbers on the page (INSTRUCTION 50 fix pass). Seven pills still wrap at 375px. */
const LEG_CHOICES = [2, 3, 4, 5, 6, 7, 8] as const;

const PRESETS: readonly { key: string; label: string; min: number; max: number }[] = [
  { key: "fav", label: "Favorites", min: -300, max: -120 },
  { key: "even", label: "Even", min: -140, max: 140 },
  { key: "long", label: "Longshots", min: 120, max: 400 },
];

/** The single control each relax hint names — the button in the failure state sets exactly this. */
const RELAX_PATCH: Record<string, Partial<GenSpec>> = {
  "same-game": { onePerGame: false },
  started: { includeStarted: true },
  cz: { czOnly: false },
  model: { modelOnly: false },
};

const RELAX_BUTTON: Record<string, string> = {
  "same-game": "Allow two legs from one game",
  started: "Include games already under way",
  cz: "Drop the Caesars-only filter",
  model: "Drop the model-priced-only filter",
};

const RELAX_HINT: Record<string, string> = {
  "same-game": 'turn on "two legs from one game" and it may fit',
  started: 'turn on "include games already under way" and it may fit',
  cz: "drop the Caesars-only filter and it may fit",
  model: "drop the model-priced-only filter and it may fit",
};

/**
 * One honest line per failure — never a silent relaxation, never an invented price. `nearest`
 * and `reach` are the generator's own numbers: `nearest` is a price that really is posted in
 * this pool, `reach` is a greedy estimate and is always worded "about".
 */
export function genFailLine(
  fail: GenFail,
  ctx: { marketLabel: string; legs: number; loAm: number; hiAm: number },
): string {
  switch (fail.code) {
    case "no-rows":
      return `No ${ctx.marketLabel} lines on this board — there is nothing here to build a parlay from.`;
    case "band-empty": {
      const b = fail.nearest.belowAm;
      const a = fail.nearest.aboveAm;
      const near =
        b != null && a != null
          ? `the closest posted prices are ${amFmt(b)} and ${amFmt(a)}`
          : b != null
            ? `the closest posted price is ${amFmt(b)}`
            : a != null
              ? `the closest posted price is ${amFmt(a)}`
              : "nothing is posted on either side of it";
      return `No ${ctx.marketLabel} leg is priced between ${amFmt(ctx.loAm)} and ${amFmt(ctx.hiAm)} — of ${fail.rows} posted legs, ${near}.`;
    }
    case "short-pool": {
      const hint = fail.relax ? RELAX_HINT[fail.relax] : "widen the odds band or pick another category";
      return `Only ${fail.have} leg${fail.have === 1 ? "" : "s"} clears these filters and you asked for ${fail.want} — ${hint}.`;
    }
    case "payout-unreachable":
      return `A ${ctx.legs}-leg ${ctx.marketLabel} parlay from this pool pays about ${amFmt(fail.reach.minAm)} to ${amFmt(fail.reach.maxAm)} — your target payout sits outside that, so nothing here can reach it.`;
    case "payout-not-found":
      return `Could not land inside your target payout in ${REPAIR_TRIES} tries — this pool reaches about ${amFmt(fail.reach.minAm)} to ${amFmt(fail.reach.maxAm)}, so the target is only just out of reach.`;
    case "pin-missing":
      return `${fail.ids.length} kept slot${fail.ids.length === 1 ? " is" : "s are"} no longer posted on this board — unpin the gold slot${fail.ids.length === 1 ? "" : "s"} and spin again.`;
    case "pin-conflict":
      return fail.why === "same-player"
        ? "Two kept slots are the same player — one parlay can only carry him once, so unpin one of them."
        : 'Two kept slots are in the same game — turn on "two legs from one game" or unpin one of them.';
  }
}

/* ------------------------------------------------------------------ small controls */

const CTRL = "press min-h-11 rounded-[10px] border text-[12px] font-semibold transition-colors duration-(--dur-fast)";
const ON = "border-pos bg-pos/15 text-pos";
const OFF = "border-white/[0.08] bg-surface-2 text-muted hover:text-text";

/** An american-odds field: typed freely, committed only when it parses (|v| >= 100). */
function AmInput({
  value,
  onCommit,
  hint,
  label,
}: {
  value: number;
  onCommit: (v: number) => void;
  hint: string;
  label: string;
}) {
  const [txt, setTxt] = useState(amFmt(value));
  useEffect(() => setTxt(amFmt(value)), [value]);
  const parsed = parseAmerican(txt);
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</span>
      <input
        value={txt}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseAmerican(e.target.value);
          if (n != null) onCommit(n);
        }}
        onBlur={() => setTxt(amFmt(value))}
        inputMode="numeric"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={hint}
        aria-label={label}
        aria-invalid={parsed == null}
        className={`num h-11 w-full rounded-[10px] border bg-surface-2 px-2.5 text-[13px] text-text outline-none placeholder:text-faint ${
          parsed == null ? "border-gold/60" : "border-white/[0.08] focus:border-pos/50"
        }`}
      />
    </label>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`${CTRL} flex w-full items-center justify-between gap-2 px-3 text-left ${on ? ON : OFF}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span
        aria-hidden
        className={`flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 ${on ? "border-pos/60 bg-pos/20" : "border-white/[0.12] bg-white/[0.06]"}`}
      >
        <span className={`h-4 w-4 rounded-full transition-transform duration-(--dur-fast) ${on ? "translate-x-4 bg-pos" : "bg-white/40"}`} />
      </span>
    </button>
  );
}

/* --------------------------------------------------------------------- one slot */

function Slot({
  i,
  l,
  pinned,
  outOfBand,
  headshot,
  onTogglePin,
}: {
  i: number;
  l: GenLeg;
  pinned: boolean;
  outOfBand: boolean;
  headshot: string | null;
  onTogglePin: (slot: number) => void;
}) {
  const parsed = parseBoardLabel(l.leg.label);
  const name = parsed?.name ?? l.leg.label;
  const team = parsed?.team ?? l.team;
  return (
    <div
      data-gen-slot={i}
      className={`flex min-h-[56px] items-center gap-2 border-t border-white/[0.04] py-1.5 ${
        outOfBand ? "border-l-2 border-l-gold pl-1.5" : ""
      }`}
    >
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={`${pinned ? "Spin" : "Keep"} slot ${i + 1}: ${name}`}
        onClick={() => onTogglePin(i)}
        className={`press flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[10px] border text-[9px] font-bold uppercase tracking-wide ${
          pinned ? "border-pos/60 bg-pos/10 text-pos ring-1 ring-pos/50" : "border-white/[0.08] bg-surface-2 text-faint"
        }`}
      >
        <span aria-hidden className="text-[13px] leading-none">
          {pinned ? "📌" : "🎲"}
        </span>
        <span className="mt-0.5 leading-none">{pinned ? "kept" : "spin"}</span>
      </button>
      <PlayerMark player={name} team={team} headshot={headshot} size="sm" />
      <div className="min-w-0 flex-1 leading-none">
        <PlayerName name={name} team={team} className="block truncate text-[12.5px] font-medium tracking-tight text-text">
          {name}
        </PlayerName>
        <div className="mt-[3px] flex items-center gap-1 truncate text-[9.5px] text-faint">
          <span className="truncate text-muted">{l.leg.sub}</span>
          {l.alt && <span className="shrink-0 rounded-[4px] border border-line-2 bg-surface-2 px-1 text-[8px] font-bold uppercase">alt</span>}
          {l.started && <span className="shrink-0 text-live">live</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end leading-none">
        <span className="num text-[13px] font-semibold text-pos">{amFmt(l.leg.cz)}</span>
        <span className="mt-[3px] flex items-center gap-1 text-[9px] text-faint">
          {l.leg.src === "market" && <span className="italic">mkt</span>}
          {l.leg.book && l.leg.book !== "CZ" && <span className="uppercase">{l.leg.book}</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * A kept slot whose leg is no longer on the board (the board refetched and the line moved or
 * came down). The generator fails with `pin-missing` and tells Josh to unpin it — so the unpin
 * button has to EXIST in that state. It did not: slots rendered only inside the success branch,
 * and togglePin returned early on a failure, which made the advice impossible to follow
 * (INSTRUCTION 50 fix pass).
 */
function LostSlot({ i, id, onTogglePin }: { i: number; id: string; onTogglePin: (slot: number) => void }) {
  return (
    <div data-gen-slot={i} className="flex min-h-[56px] items-center gap-2 border-t border-l-2 border-white/[0.04] border-l-gold py-1.5 pl-1.5">
      <button
        type="button"
        aria-pressed
        aria-label={`Unpin slot ${i + 1}`}
        onClick={() => onTogglePin(i)}
        className="press flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[10px] border border-gold/60 bg-gold/10 text-[9px] font-bold uppercase tracking-wide text-gold"
      >
        <span aria-hidden className="text-[13px] leading-none">
          📌
        </span>
        <span className="mt-0.5 leading-none">unpin</span>
      </button>
      <div className="min-w-0 flex-1 leading-snug">
        <div className="truncate text-[12.5px] font-medium text-gold">Kept slot {i + 1}</div>
        <div className="truncate text-[9.5px] text-faint">no longer posted on this board — unpin it to spin this slot</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- the sheet */

export function GenSheet({
  market,
  marketLabel,
  pool,
  headshots,
  spec,
  onSpec,
  result,
  onGenerate,
  onTogglePin,
  onAdd,
  canUndo,
  onUndo,
  open,
  onOpen,
  boardAt,
  loading = false,
  gameMarket = false,
}: {
  market: string;
  marketLabel: string;
  pool: GenPool;
  /** the page's ONE headshot map (app/props/page.tsx) — this sheet never calls useHeadshots itself */
  headshots: Record<string, string>;
  spec: GenSpec;
  onSpec: (patch: Partial<GenSpec>) => void;
  result: GenResult;
  onGenerate: () => void;
  onTogglePin: (slot: number) => void;
  onAdd: () => void;
  canUndo: boolean;
  onUndo: () => void;
  open: boolean;
  onOpen: (v: boolean) => void;
  /** the board's generation time, already formatted by the page after mount (null during SSR) */
  boardAt: string | null;
  /** the board has not answered yet — say so instead of declaring the board empty */
  loading?: boolean;
  /** the market rail is on a GAME market (ML/RL): the generator has no player slots there */
  gameMarket?: boolean;
}) {
  const band = bandDec(spec.legMinAm, spec.legMaxAm);
  /* THE SAME FILTERS `generate` USES (INSTRUCTION 50 fix pass). These counts were hand-rolled
     over the RAW pool — both sides of every line, ignoring `sides`, `czOnly` and `modelOnly` —
     so with the default overs-only spec they printed roughly double, and the panel could read
     "after band 19 → 4 games" directly above "Only 3 legs clear these filters and you asked for
     4". poolCounts exists precisely so the diagnostic can never contradict the verdict. */
  const counts = poolCounts(pool, spec);
  const ticket = result.ok ? result.ticket : null;
  const calc = ticket ? combineTicket(ticket.legs.map((l) => l.leg)) : null;
  const outside = new Set(ticket?.outsideLegBand ?? []);
  const anyMarketProb = !!ticket?.legs.some((l) => l.leg.src === "market");
  const suspended = SUSPENDED.has(market);
  const fail = result.ok ? null : result.fail;
  /* every failure code is DETERMINISTIC in the pool and the spec, so "Generate" would be a
     guaranteed no-op in that state — the same "the button does nothing" complaint as item 1.
     When the generator names a relaxation the button becomes that one control; otherwise it is
     disabled and says why. */
  const relax = fail?.code === "short-pool" ? fail.relax : null;
  /* the kept slots, resolved against the pool — rendered in EVERY state, success or failure,
     so the 44px unpin button the failure copy tells Josh to press is always on screen */
  const pinRows = spec.pinned
    .slice(0, spec.legs)
    .map((id, i) => ({ i, id, leg: id ? pool.byId.get(id) ?? null : null }))
    .filter((x): x is { i: number; id: string; leg: GenLeg | null } => !!x.id);

  /* On the Games rail (moneyline / run line) the generator has nothing to build from — and the
     collapsed header used to read "Parlay generator · 4 legs · H+R+RBI" beside a Moneyline
     market, naming a category that is not on screen (INSTRUCTION 50 fix pass). */
  if (gameMarket) {
    return (
      <section data-testid="props-gen-stub" className="glass mb-2 px-3 py-2 text-[10.5px] leading-snug text-faint">
        The parlay generator builds PLAYER-prop parlays — pick a batter or pitcher market above and it appears here.
        Moneyline and run line are game markets and have no player slots yet.
      </section>
    );
  }

  return (
    <section data-testid="props-gen" className="glass mb-2 overflow-hidden">
      <button
        type="button"
        onClick={() => onOpen(!open)}
        aria-expanded={open}
        aria-controls={open ? GEN_PANEL_ID : undefined}
        className="press flex min-h-[44px] w-full items-center gap-2 px-3 text-left"
      >
        <span aria-hidden className="text-[13px] leading-none">
          🎲
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold tracking-wide text-text">
          Parlay generator
          <span className="ml-1.5 font-normal text-muted">
            {spec.legs} legs · {marketLabel}
          </span>
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          className={`shrink-0 text-faint transition-transform duration-(--dur-fast) ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={GEN_PANEL_ID} className="space-y-2.5 border-t border-white/[0.06] px-3 pb-3 pt-2.5">
          {/* legs */}
          <div>
            <Label>Legs</Label>
            <div className="flex gap-1.5">
              {LEG_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={spec.legs === n}
                  onClick={() => onSpec({ legs: n })}
                  className={`${CTRL} num flex-1 ${spec.legs === n ? ON : OFF}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <Faint>
              Between {LEG_MIN} and {LEG_MAX} legs; the generator returns exactly what you ask for or says why it cannot.
            </Faint>
          </div>

          {/* category — the same state as the market rail above */}
          <div>
            <Label>Prop category</Label>
            <div className="flex flex-wrap gap-1.5">
              {GEN_MARKETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={spec.market === m}
                  onClick={() => onSpec({ market: m })}
                  className={`${CTRL} px-3 ${spec.market === m ? ON : OFF}`}
                >
                  {MKT_LABEL[m] ?? m}
                </button>
              ))}
            </div>
            <Faint>Moneyline and run line are game markets, not player slots — the generator leaves them alone for now.</Faint>
          </div>

          {/* per-leg odds band */}
          <div>
            <Label>Odds per leg</Label>
            <div className="flex items-end gap-2">
              <AmInput label="Min" value={spec.legMinAm} onCommit={(v) => onSpec({ legMinAm: v })} hint="-152" />
              <span className="pb-3 text-[12px] text-faint" aria-hidden>
                →
              </span>
              <AmInput label="Max" value={spec.legMaxAm} onCommit={(v) => onSpec({ legMaxAm: v })} hint="+110" />
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={spec.legMinAm === p.min && spec.legMaxAm === p.max}
                  onClick={() => onSpec({ legMinAm: p.min, legMaxAm: p.max })}
                  className={`${CTRL} flex-1 px-1 text-[11px] ${spec.legMinAm === p.min && spec.legMaxAm === p.max ? ON : OFF}`}
                >
                  {p.label}
                  <span className="num ml-1 block text-[9px] font-normal opacity-70">
                    {amFmt(p.min)} to {amFmt(p.max)}
                  </span>
                </button>
              ))}
            </div>
            <Faint>
              <span className="num">{counts.inBand}</span> of <span className="num">{counts.eligible}</span>{" "}
              {marketLabel} legs clear your filters and are posted inside that band right now.
            </Faint>
          </div>

          {/* advanced */}
          <details className="group rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-[11.5px] font-semibold text-muted [&::-webkit-details-marker]:hidden">
              Advanced <span className="ml-1 inline-block transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1.5">
                {(["o", "u", "both"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={spec.sides === s}
                    onClick={() => onSpec({ sides: s })}
                    className={`${CTRL} flex-1 ${spec.sides === s ? ON : OFF}`}
                  >
                    {s === "o" ? "Overs" : s === "u" ? "Unders" : "Both"}
                  </button>
                ))}
              </div>
              <Toggle on={!spec.onePerGame} onChange={(v) => onSpec({ onePerGame: !v })}>
                Two legs from one game
              </Toggle>
              <Toggle on={spec.includeStarted} onChange={(v) => onSpec({ includeStarted: v })}>
                Include games already under way
              </Toggle>
              <Toggle on={spec.czOnly} onChange={(v) => onSpec({ czOnly: v })}>
                Caesars-priced legs only
              </Toggle>
              <Toggle on={spec.modelOnly} onChange={(v) => onSpec({ modelOnly: v })}>
                Model-priced legs only (no market-fair legs)
              </Toggle>
              <Toggle
                on={spec.payout != null}
                onChange={(v) => onSpec({ payout: v ? { minAm: 400, maxAm: 1200 } : null })}
              >
                Target a combined payout too
              </Toggle>
              {spec.payout && (
                <div className="flex items-end gap-2 pl-1">
                  <AmInput
                    label="Ticket min"
                    value={spec.payout.minAm}
                    onCommit={(v) => onSpec({ payout: { minAm: v, maxAm: spec.payout!.maxAm } })}
                    hint="+400"
                  />
                  <span className="pb-3 text-[12px] text-faint" aria-hidden>
                    →
                  </span>
                  <AmInput
                    label="Ticket max"
                    value={spec.payout.maxAm}
                    onCommit={(v) => onSpec({ payout: { minAm: spec.payout!.minAm, maxAm: v } })}
                    hint="+1200"
                  />
                </div>
              )}
            </div>
          </details>

          {/* generate */}
          <div className="flex gap-2">
            {ticket ? (
              <button
                type="button"
                onClick={onGenerate}
                className="press flex min-h-12 flex-1 items-center justify-center rounded-[12px] border border-pos bg-pos text-[13px] font-bold text-bg"
              >
                Regenerate
              </button>
            ) : relax ? (
              <button
                type="button"
                onClick={() => onSpec(RELAX_PATCH[relax])}
                title="Spinning again cannot help — the pool and these filters decide this answer. This is the one control that would open it up."
                className="press flex min-h-12 flex-1 items-center justify-center rounded-[12px] border border-gold bg-gold/15 px-2 text-center text-[12.5px] font-bold leading-tight text-gold"
              >
                {RELAX_BUTTON[relax]}
              </button>
            ) : (
              <button
                type="button"
                disabled
                title="Spinning again would return the same answer — this pool and these filters decide it. Change a control above instead."
                className="flex min-h-12 flex-1 items-center justify-center rounded-[12px] border border-white/[0.06] bg-surface-2/50 text-[13px] font-bold text-faint"
              >
                Generate parlay
              </button>
            )}
            <button
              type="button"
              onClick={onAdd}
              disabled={!ticket}
              className={`press min-h-12 shrink-0 rounded-[12px] border px-3 text-[12px] font-semibold ${
                ticket ? "border-white/[0.12] bg-surface-2 text-text" : "border-white/[0.06] bg-surface-2/50 text-faint"
              }`}
            >
              Add to slip
            </button>
          </div>
          {canUndo && (
            <button type="button" onClick={onUndo} className="press min-h-11 w-full text-[11px] font-semibold text-gold">
              Added to the slip — undo
            </button>
          )}

          {/* which control is binding */}
          <div data-testid="gen-diagnostic" className="num text-[9.5px] text-faint">
            pool {pool.rows} rows → eligible {counts.eligible} → after band {counts.inBand} → {counts.games} game
            {counts.games === 1 ? "" : "s"}
            {pool.startedDropped > 0 && <> · {pool.startedDropped} dropped as already started</>}
            {pool.noParlayDropped > 0 && <> · {pool.noParlayDropped} the book bars from parlays</>}
          </div>

          {/* the ticket, or the one honest reason there isn't one */}
          {ticket && calc ? (
            <div>
              <div className="-mx-1">
                {ticket.legs.map((l, i) => (
                  <Slot
                    key={l.leg.id}
                    i={i}
                    l={l}
                    pinned={spec.pinned[i] === l.leg.id}
                    outOfBand={outside.has(l.leg.id)}
                    headshot={headshots[parseBoardLabel(l.leg.label)?.name ?? l.leg.label] ?? null}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </div>
              {ticket.outsideLegBand.length > 0 && (
                <div className="mt-1.5 rounded-[10px] border border-gold/30 bg-gold/[0.07] px-2.5 py-1.5 text-[10.5px] text-gold">
                  A kept slot is priced outside your band — unpin it or widen the band. It is in the ticket because you
                  chose to keep it, and nowhere else does a leg break the band.
                </div>
              )}
              {ticket.sameGame.length > 0 && (
                <div className="mt-1.5 text-[10px] text-faint">
                  {ticket.sameGame.length} game{ticket.sameGame.length === 1 ? "" : "s"} carr
                  {ticket.sameGame.length === 1 ? "ies" : "y"} more than one leg — same-game legs are correlated, and the
                  combined % below does not model that.
                </div>
              )}
              <div className="num mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2 text-[12px]">
                <span className="text-[14px] font-bold text-pos">{amFmt(calc.am)}</span>
                <span className="text-muted">
                  true <b className="text-text">{(calc.trueProb * 100).toFixed(1)}%</b>
                </span>
                <span className="text-muted">
                  implied <b className="text-text">{(calc.impProb * 100).toFixed(1)}%</b>
                </span>
                <span className={calc.ev >= 0 ? "text-pos" : "text-neg"}>
                  EV {calc.ev >= 0 ? "+" : ""}
                  {(calc.ev * 100).toFixed(1)}%
                </span>
                {ticket.marketPriced > 0 && (
                  <span className="italic text-faint">{ticket.marketPriced} market-priced</span>
                )}
              </div>
              <div className="mt-1.5 text-[9.5px] leading-snug text-faint">
                True % is the naive product — same-game legs are correlated and this sandbox does not model that.
                {anyMarketProb && (
                  <> Italic legs use the market&apos;s own fair %, so their EV is ~0 by construction, not an edge.</>
                )}{" "}
                {suspended && (
                  <>
                    {marketLabel} is suspended from the engine&apos;s own auto-built tickets; this sandbox spins it anyway.{" "}
                  </>
                )}
                Prices are the board&apos;s posted quotes{boardAt ? ` as of ${boardAt}` : ""} — tap Regenerate for another
                spin, not for a fresher price. Sandbox · not tracked, never enters the ledger.
              </div>
            </div>
          ) : (
            <div>
              {/* KEPT SLOTS SURVIVE A FAILURE. Without this the failure copy ("unpin the gold
                  slot and spin again") named a button that did not exist, and the only escape
                  was changing leg count or category — both of which wipe every pin. */}
              {pinRows.length > 0 && (
                <div className="-mx-1 mb-1.5">
                  {pinRows.map(({ i, id, leg }) =>
                    leg ? (
                      <Slot
                        key={id}
                        i={i}
                        l={leg}
                        pinned
                        outOfBand={false}
                        headshot={headshots[parseBoardLabel(leg.leg.label)?.name ?? leg.leg.label] ?? null}
                        onTogglePin={onTogglePin}
                      />
                    ) : (
                      <LostSlot key={id} i={i} id={id} onTogglePin={onTogglePin} />
                    ),
                  )}
                </div>
              )}
              <div data-testid="gen-fail" className="rounded-[10px] border border-gold/30 bg-gold/[0.07] px-2.5 py-2 text-[10.5px] leading-relaxed text-gold">
                {loading
                  ? /* the board is still fetching — "no lines on this board" would be a false
                       statement about the board, not a report on it */
                    "Waiting for today's board…"
                  : genFailLine(result.ok ? { code: "no-rows" } : result.fail, {
                      marketLabel,
                      legs: spec.legs,
                      loAm: spec.legMinAm,
                      hiAm: spec.legMaxAm,
                    })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">{children}</div>;
}

function Faint({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-[9.5px] leading-snug text-faint">{children}</div>;
}
