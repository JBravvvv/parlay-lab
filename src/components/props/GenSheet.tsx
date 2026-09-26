"use client";
import { ALL_MARKETS } from "@/lib/cross-sport";

import { PickContext } from "./PickContext";
import { CrossMark } from "./CrossMark";
import type { CrossLeg } from "@/lib/cross-sport";
import { DiscoveryFilters } from "./DiscoveryFilters";
import { STRATEGIES } from "@/lib/discovery";
import { MultiSelect } from "./MultiSelect";
import { gameTimeLabel, slateTimeBounds } from "@/lib/game-time-window";
import { holdReveal, landAtMs, ODDS_COUNT_MS, OddsTicker, ReelOverlay, startReveal, type ReelFace, type Reveal } from "./ParlayReveal";
import { useSlotDrag } from "./useSlotDrag";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { exclusionKey } from "@/lib/parlay-exclusions";
import { amFmt, amToDec, combineTicket } from "@/lib/ticket-math";
import { parseAmerican } from "@/lib/parlay-calc";
import { parseBoardLabel } from "@/lib/player-card";
import { PlayerMark } from "@/components/player/PlayerMark";
import { clubFromLabel } from "@/lib/mlb-visuals";
import { PlayerName } from "@/components/player/PlayerName";
import { HIT_WINDOWS, windowLabel, type HitWindow } from "@/lib/prop-hit-rate";
import { HitChip, HitDots } from "./HitChip";
import {
  LEG_MAX,
  LEG_MIN,
  REPAIR_TRIES,
  bandDec,
  availableLegBand,
  mixCandidates,
  poolCounts,
  specMarkets,
  type GenFail,
  type GenLeg,
  type GenMarket,
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
 * THE 2026-09-18 REBUILD (Josh, verbatim: "The parlay generator needs significantly more
 * customization. It doesn't need 'Safer Mix'/'Balanced Mix' or 'Favorites/Even/Longshots'
 * because majority of the time those lines aren't consistent across props" … "Everything should
 * always be graded and priced based on DK so that shouldn't need to be an option" … "The exclude
 * player button is way too big" … "Make this easy to maneuver and fun to play with"). So:
 *   - the build-style cards, the three odds presets and the "Your mix" tiers are gone;
 *   - the book-only toggle is gone — the board is already priced at the settlement book;
 *   - every control is a tight chip row in the sportsbook-app shape (30px chips, 4px gaps):
 *     Legs · Categories (tap SEVERAL to mix them on one ticket) · Odds per leg (typed, plus a
 *     two-thumb slider over the prices the board actually posts) · Hit rate (a floor on how
 *     often the player has cleared this line lately, over a window Josh picks) · Sides · Games
 *     · Positions · Timing;
 *   - the exclude control is a 24px "✕" on the slot, not a checkbox with a sentence.
 *
 * This file is a DUMB VIEW: every number it prints comes from the pure generator
 * (src/lib/parlay-gen.ts) or from combineTicket, and every price renders through `amFmt`. There
 * is no fetch, no Odds credit, no ledger write and no engine run behind any control here — the
 * pool is the board that is already on the device.
 */

export const GEN_PANEL_ID = "props-gen-panel";

/**
 * The market list and the player disc arrive as PROPS (INSTRUCTION 52, 2026-09-12, Josh's word,
 * verbatim: "Parlay Generator should be on CFB & NFL just like it is on MLB"). The MLB list lives
 * with the MLB pool builder (src/components/props/mlb-gen-pool.ts) and the football list with
 * the football one (src/lib/football/gen-pool.ts), so this sheet is the same sheet on all three
 * desks instead of a second copy per sport.
 */

/**
 * How a slot draws its player. `leg` is the DESK'S OWN leg object (an MLB SandboxLeg, a football
 * CfbSlipLeg) so each desk can reach the fields only it has — the ESPN headshot and position on
 * football, the page's resolved headshot map on MLB — and `gen` is the generator's wrapper for
 * anything generic.
 */
type SlotPart<P> = (a: { leg: P; gen: GenLeg<P>; name: string; team: string | null }) => ReactNode;

/** the default disc — today's MLB path. The page overrides it to pass its resolved headshot.
    A club leg (no "(TEAM)" suffix, no team of its own) draws the club's logo alone — INSTRUCTION 70. */
function mlbMark<P>({ name, team }: { leg: P; gen: GenLeg<P>; name: string; team: string | null }): ReactNode {
  const club = team ? null : clubFromLabel(name);
  if (club) return <PlayerMark player={null} team={club} headshot={null} size="sm" />;
  return <PlayerMark player={name} team={team} headshot={null} size="sm" />;
}

/** the default name — today's MLB path: tappable, opens the MLB profile sheet */
function mlbName<P>({ name, team }: { leg: P; gen: GenLeg<P>; name: string; team: string | null }): ReactNode {
  return (
    <PlayerName name={name} team={team} className="block truncate text-[12.5px] font-medium tracking-tight text-text">
      {name}
    </PlayerName>
  );
}

/* every count the generator will actually honour — the hint under this row quotes
   LEG_MIN..LEG_MAX, so offering fewer would leave unreachable numbers on the page */


/** the hit-rate floors on offer: "he cleared this line in at least this share of his recent games" */
const HIT_FLOORS: readonly { value: number | null; label: string }[] = [
  { value: null, label: "Any" },
  ...Array.from({ length: 17 }, (_, i) => ({ value: i / 20, label: `${i * 5}%+` })),
];

/** The single control each relax hint names — the button in the failure state sets exactly this. */
const RELAX_PATCH: Record<string, Partial<GenSpec>> = {
  "same-game": { onePerGame: false },
  "same-team": { onePerTeam: false },
  started: { includeStarted: true },
  cz: { czOnly: false },
  model: { modelOnly: false },
  positions: { positions: [] },
  hit: { minHit: null },
  games: { games: [] },
};

const RELAX_BUTTON: Record<string, string> = {
  "same-game": "Allow two legs from one game",
  "same-team": "Allow two legs from one team",
  started: "Include games already under way",
  cz: "Drop the selected-book-only filter",
  model: "Drop the model-priced-only filter",
  positions: "Include all positions",
  hit: "Drop the hit-rate floor",
  games: "Include all games",
};

const RELAX_HINT: Record<string, string> = {
  "same-game": 'turn on "two legs from one game" and it may fit',
  "same-team": 'turn on "two legs from one team" and it may fit',
  started: 'turn on "include games already under way" and it may fit',
  cz: "drop the selected-book-only filter and it may fit",
  model: "drop the model-priced-only filter and it may fit",
  positions: "add another position or choose all positions",
  hit: "lower the hit-rate floor and it may fit",
  games: "add another game or choose all games",
};

/**
 * One honest line per failure — never a silent relaxation, never an invented price. `nearest`
 * and `reach` are the generator's own numbers: `nearest` is a price that really is posted in
 * this pool, `reach` is a greedy estimate and is always worded "about".
 */
export function genFailLine(
  fail: GenFail,
  ctx: { marketLabel: string; legs: number; loAm: number; hiAm: number; allFinished?: boolean; phase?: GenSpec["phase"]; boardAt?: string | null;
    /** Josh set no combined payout — so a payout failure is the Longshot style's own +7,500 floor (2026-09-26) */
    styleBand?: boolean;
    /** how many parlay styles are selected (a Regenerate draws another of them) */
    styles?: number },
): string {
  switch (fail.code) {
    case "phase-empty":
      return `No ${ctx.marketLabel} quote qualifies under the current timing filters. Mixed permits pregame, live, or any combination.`;
    case "no-rows":
      if(ctx.phase==="live") return `No current live ${ctx.marketLabel} quotes qualify. Regenerate to refresh live prices, or check the selected sportsbook and filters.`;
      /* EVERY GAME IS OVER is a different fact from "the board has no lines", and on a past date
         the football board is full of grey final rows (INSTRUCTION 52 fix pass). The caller sets
         the flag only when every row this market has is in a finished game. */
      return ctx.allFinished
        ? `Every ${ctx.marketLabel} game on this board has finished — there is nothing left to build a parlay from.`
        : `No ${ctx.marketLabel} lines on this board — there is nothing here to build a parlay from.`;
    case "one-sided": {
      /* NEVER "no lines on this board" here: the board has plenty, they are all the other way
         round (INSTRUCTION 52 fix pass). Anytime TD is the live case — a price on the touchdown
         happening, with no under posted anywhere. */
      const asked = fail.want === "u" ? "under" : "over";
      const posted = fail.has === "u" ? "unders" : "overs";
      return `No ${ctx.marketLabel} ${asked} is posted on this board — all ${fail.rows} ${ctx.marketLabel} leg${fail.rows === 1 ? "" : "s"} here ${fail.rows === 1 ? "is" : "are"} ${posted}. Switch to ${posted} and it can build.`;
    }
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
      return ctx.styleBand
        ? `The Longshot style needs +7500 or longer combined, and a ${ctx.legs}-leg ${ctx.marketLabel} parlay from this pool pays about ${amFmt(fail.reach.minAm)} to ${amFmt(fail.reach.maxAm)} — add legs or raise the odds per leg.`
        : `A ${ctx.legs}-leg ${ctx.marketLabel} parlay from this pool pays about ${amFmt(fail.reach.minAm)} to ${amFmt(fail.reach.maxAm)} — your target payout sits outside that, so nothing here can reach it.`;
    case "payout-not-found":
      return ctx.styleBand
        ? `Could not reach the Longshot style's +7500 floor in ${REPAIR_TRIES} tries — this pool reaches about ${amFmt(fail.reach.minAm)} to ${amFmt(fail.reach.maxAm)}; Regenerate, add legs or raise the odds per leg.`
        : `Could not land inside your target payout in ${REPAIR_TRIES} tries — this pool reaches about ${amFmt(fail.reach.minAm)} to ${amFmt(fail.reach.maxAm)}, try Generate again or widen the target.`;
    case "style-shape": {
      const style = STRATEGIES.find((s) => s.key === fail.style)?.label ?? "chosen";
      if (fail.why === "same-game") return `The ${style} style pairs two legs from one game, and one leg per game is on — allow legs from the same game and it can build.`;
      if (fail.why === "no-plus") return `The ${style} style needs a plus-money kicker, and no leg in your odds band is plus money — raise the max odds above +100.`;
      if (fail.why === "one-window") return `The ${style} style needs games at least 3 hours apart, and every game in this pool starts inside one window.`;
      const tries = [fail.legs > LEG_MIN ? "try fewer legs" : null, (ctx.styles ?? 1) > 1 ? "Regenerate to draw another of your styles" : "add another style"].filter(Boolean);
      return `No ${fail.legs}-leg ticket on this board fits the ${style} style's shape — ${tries.join(" or ")}.`;
    }
    case "pin-missing":
      return `${fail.ids.length} kept slot${fail.ids.length === 1 ? " is" : "s are"} no longer posted on this board — unpin the gold slot${fail.ids.length === 1 ? "" : "s"} and spin again.`;
    case "pin-position":
      return "A kept player is outside your selected positions or has no verified position. Unpin that player or change the position filter.";
    case "pin-conflict":
      return fail.why === "same-player"
        ? "Two kept slots are the same player — one parlay can only carry him once, so unpin one of them."
        : fail.why === "same-team"
          ? 'Two kept slots are on the same team — turn on "two legs from one team" or unpin one of them.'
          : 'Two kept slots are in the same game — turn on "two legs from one game" or unpin one of them.';
  }
}

/* ------------------------------------------------------------------ small controls */

/* THE CHIP: the sportsbook-app control (2026-09-18). 30px tall, 4px apart, filled when on —
   the same shape as the market rail above the sheet, so the whole desk reads as one surface. */
const CHIP = "press inline-flex h-[30px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-semibold transition-[background,color,border-color] duration-(--dur-fast)";
const CHIP_ON = "border-pos bg-pos text-bg";
const CHIP_OFF = "border-white/[0.1] bg-white/[0.04] text-muted hover:text-text";
const CTRL = "press min-h-11 rounded-[10px] border text-[12px] font-semibold transition-colors duration-(--dur-fast)";
const ON = "border-pos bg-pos/15 text-pos";
const OFF = "border-white/[0.08] bg-surface-2 text-muted hover:text-text";

function Chip({ on, onClick, children, label, disabled = false }: { on: boolean; onClick: () => void; children: ReactNode; label?: string; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick} disabled={disabled} className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF} disabled:opacity-40`}>
      {children}
    </button>
  );
}

/** one labelled row of chips; the chips scroll sideways on a phone instead of wrapping into a wall */
function ChipRow({ label, hint, children, wrap = false, title }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wrap?: boolean; title?: string }) {
  return (
    <div className="gen-row" title={title}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-faint">{label}</span>
        {hint && <span className="min-w-0 truncate text-[9.5px] text-faint">{hint}</span>}
      </div>
      <div className={`flex gap-1 ${wrap ? "flex-wrap" : "-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:overflow-visible md:px-0"}`}>{children}</div>
    </div>
  );
}

/** A labelled native select — the compact control (2026-09-18): one line where a chip row stood. */
function Select({ label, hint, value, onChange, options, disabled = false, title }: {
  label: string; hint?: ReactNode; value: string; onChange: (v: string) => void;
  options: readonly { value: string; label: string }[]; disabled?: boolean; title?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1" title={title}>
      <span className="flex items-baseline justify-between gap-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-faint">
        <span className="shrink-0">{label}</span>
        {hint && <span className="min-w-0 truncate font-normal normal-case tracking-normal">{hint}</span>}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label}
        className="gen-select num h-9 w-full min-w-0 rounded-[10px] border border-white/[0.08] bg-surface-2 px-2.5 text-[12px] font-semibold text-text outline-none focus:border-pos/50 disabled:opacity-40">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

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
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-faint">{label}</span>
      <input
        value={txt}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseAmerican(e.target.value);
          if (n != null) onCommit(n);
        }}
        onBlur={() => setTxt(amFmt(value))}
        inputMode="text"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={hint}
        aria-label={label}
        aria-invalid={parsed == null}
        className={`num h-9 w-full min-w-0 rounded-[10px] border bg-surface-2 px-2.5 text-[13px] font-semibold text-text outline-none placeholder:text-faint ${
          parsed == null ? "border-gold/60" : "border-white/[0.08] focus:border-pos/50"
        }`}
      />
    </label>
  );
}

/**
 * THE ODDS SLIDER: two thumbs over the prices this pool actually posts, so every stop is a real
 * quote. The typed fields stay the exact control; the slider is the fast, playful one.
 */
function OddsSlider({ prices, lo, hi, onChange }: { prices: readonly number[]; lo: number; hi: number; onChange: (lo: number, hi: number) => void }) {
  if (prices.length < 2) return null;
  const decs = prices.map(amToDec);
  const loDec = amToDec(lo);
  const hiDec = amToDec(hi);
  let iLo = decs.findIndex((d) => d >= loDec - 1e-9);
  if (iLo < 0) iLo = prices.length - 1;
  let iHi = -1;
  for (let i = decs.length - 1; i >= 0; i--) if (decs[i] <= hiDec + 1e-9) { iHi = i; break; }
  if (iHi < 0) iHi = 0;
  if (iHi < iLo) [iLo, iHi] = [Math.min(iLo, iHi), Math.max(iLo, iHi)];
  const max = prices.length - 1;
  const pct = (i: number) => (max ? (i / max) * 100 : 0);
  const thumb = "pointer-events-none absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-pos [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(58,176,232,0.6)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg [&::-moz-range-thumb]:bg-pos";
  return (
    <div className="relative mt-2 h-6 px-2.5" data-testid="gen-odds-slider">
      <div aria-hidden className="absolute inset-x-2.5 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-white/[0.08]" />
      <div aria-hidden className="absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-pos" style={{ left: `calc(10px + (100% - 20px) * ${pct(iLo) / 100})`, right: `calc(10px + (100% - 20px) * ${(100 - pct(iHi)) / 100})` }} />
      <input type="range" min={0} max={max} step={1} value={iLo} aria-label="Lowest odds per leg" aria-valuetext={amFmt(prices[iLo])}
        onChange={(e) => { const i = Math.min(Number(e.target.value), iHi); onChange(prices[i], prices[iHi]); }} className={thumb} />
      <input type="range" min={0} max={max} step={1} value={iHi} aria-label="Highest odds per leg" aria-valuetext={amFmt(prices[iHi])}
        onChange={(e) => { const i = Math.max(Number(e.target.value), iLo); onChange(prices[iLo], prices[i]); }} className={thumb} />
    </div>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`press flex min-h-7 w-full items-center justify-between gap-2 rounded-md border px-2 text-left text-[10px] ${on ? ON : OFF}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span
        aria-hidden
        className={`flex h-4 w-7 shrink-0 items-center rounded-full border px-0.5 ${on ? "border-pos/60 bg-pos/20" : "border-white/[0.12] bg-white/[0.06]"}`}
      >
        <span className={`h-3 w-3 rounded-full transition-transform duration-(--dur-fast) ${on ? "translate-x-3 bg-pos" : "bg-white/40"}`} />
      </span>
    </button>
  );
}

/* --------------------------------------------------------------------- one slot */

function Slot<P>({
  i,
  count,
  l,
  pinned,
  outOfBand,
  hitWindow,
  renderMark,
  renderName,
  onTogglePin,
  onExclude,
  excluded = false,
  onMove,
  onGrab,
  reel,
  landMs,
}: {
  i: number;
  /** how many slots the ticket has — the ▲/▼ bounds read it */
  count: number;
  l: GenLeg<P>;
  pinned: boolean;
  outOfBand: boolean;
  hitWindow?: number;
  renderMark: SlotPart<P>;
  renderName: SlotPart<P>;
  onTogglePin: (slot: number) => void;
  onExclude?: (slot: number) => void;
  excluded?: boolean;
  /** move this slot to another position — the keyboard ▲/▼ pair calls it directly */
  onMove?: (from: number, to: number) => void;
  /** hold-and-drag (2026-09-26): the pointer-down that may lift this card — absent while the reels spin */
  onGrab?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** the reveal's reel over this slot while it spins (2026-09-26), and when it lands (absent while a reveal is held) */
  reel?: ReactNode;
  landMs?: number;
}) {
  /* An MLB board label prints "Name (TEAM)"; a football label is the name on its own and the
     team rides in `l.team`. parseBoardLabel returns null for anything it does not recognise — it
     resolves the abbreviation against the MLB club table — so one read serves both desks and
     neither invents a team. */
  const parsed = parseBoardLabel(l.label);
  const name = parsed?.name ?? l.label;
  const team = parsed?.team ?? l.team;
  /* ▲/▼ are the keyboard path: the card keeps its React identity through the move, so the very button pressed is still
     in the DOM — hand focus back to it (or to its partner at the end of the list) so the pair stays up for the next step */
  const keyStep = (btn: HTMLButtonElement, to: number) => {
    onMove?.(i, to);
    requestAnimationFrame(() => {
      if (btn.isConnected && !btn.disabled) btn.focus();
      else btn.parentElement?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
  };
  return (
    <div
      data-gen-slot={i}
      data-drag-slot={onGrab ? "" : undefined}
      onPointerDown={onGrab}
      /* no native image/text drag may fight the hold-and-drag (a headshot is an <img>, draggable by default) */
      onDragStart={onGrab ? (e) => e.preventDefault() : undefined}
      data-pick-market={l.market} className={`gen-player-card flex min-h-9 items-center gap-1.5 border-t border-white/[0.04] py-0.5 sm:min-h-[44px] sm:gap-2 ${
        outOfBand ? "border-l-2 border-l-gold pl-1.5" : ""
      }${onGrab ? " cursor-grab select-none [-webkit-touch-callout:none]" : ""}${reel ? " relative" : ""}${landMs != null ? " gen-slot-reeling" : ""}`}
      style={landMs != null ? ({ "--land": `${landMs}ms` } as CSSProperties) : undefined}
    >
      {reel}
      {/* THE EXCLUDE ✕ SITS AT THE FAR LEFT (2026-09-26, Josh: "Need to move 'x' button from right below 'lock' now
          that everything is smaller so you don't accidentally press 'x' instead of locking player in parlay"). It used
          to stack 2px under the lock; now the card's two ends hold the two opposite actions — drop him on the left,
          keep him on the right — the way a sportsbook slip puts its remove ✕ on the left of each leg. Still the 24px
          ghost from 2026-09-18 ("The exclude player button is way too big"); excluded → "↺" restores him. */}
      {onExclude && (
        <button
          type="button"
          data-no-drag
          onClick={() => onExclude(i)}
          aria-label={excluded ? `Restore ${name}` : `Exclude ${name} from generated parlays`}
          title={excluded ? "Restore this player" : "Exclude this player from spins"}
          className={`press flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none ${
            excluded ? "border-gold/50 bg-gold/10 text-gold" : "border-white/[0.08] bg-white/[0.03] text-faint hover:border-neg/50 hover:text-neg"
          }`}
        >
          <span aria-hidden>{excluded ? "↺" : "✕"}</span>
        </button>
      )}
      {/* the slot number (2026-09-18, Josh: "numbers next to the picks generated so its easy to see
          how many picks if someone is looking over your shoulder") */}
      <span aria-hidden className="gen-slot-no num">{i + 1}</span>
      {(l.leg as {cross?:CrossLeg}).cross ? <CrossMark leg={(l.leg as {cross:CrossLeg}).cross}/> : renderMark({ leg: l.leg, gen: l, name, team })}
      <div className="min-w-0 flex-1 leading-none">
        {(l.leg as {cross?:CrossLeg}).cross ? <span className="text-[12px] font-semibold">{name}</span> : renderName({ leg: l.leg, gen: l, name, team })}
        <div className="mt-[3px] flex items-center gap-1 truncate text-[9.5px] text-faint">
          <span className="truncate text-muted">{l.sub}</span>
          {l.position && <span className="shrink-0 rounded border border-white/10 px-1 text-[8px] text-text">{l.position}</span>}
          {l.alt && <span className="shrink-0 rounded-[4px] border border-line-2 bg-surface-2 px-1 text-[8px] font-bold uppercase">alt</span>}
          {l.started && <span className="shrink-0 text-live">{l.quoteAt ? "live quote" : "started"}</span>}
          {/* phone: the hit chip rides the sub line so the slot stays two lines (2026-09-19) */}
          {l.hit && hitWindow != null && (
            <span className="shrink-0 sm:hidden">
              <HitChip stat={l.hit} window={hitWindow} />
            </span>
          )}
        </div>
        {l.gameLabel && <div className="pick-matchup mt-1 truncate text-[9px] text-muted">{l.gameLabel} · {gameTimeLabel(l.start)}</div>}

        {l.context && <PickContext pick={l.context}/>}
        {l.hit && hitWindow != null && (
          <div className="mt-[3px] hidden items-center gap-1.5 sm:flex">
            <HitChip stat={l.hit} window={hitWindow} />
            <HitDots dots={l.hit.dots} />
          </div>
        )}
      </div>
      <div className="gen-leg-price flex shrink-0 flex-col items-end leading-none">
        <span className="pick-price num text-[13px] font-semibold text-pos">{amFmt(l.am)}</span>
        <span className="mt-[3px] flex items-center gap-1 text-[9px] text-faint">
          {l.src === "market" && <span className="italic">mkt</span>}
          {l.book && l.book !== "CZ" && <span className="uppercase">{l.book}</span>}
        </span>
        <span className="mt-1 text-[8px] text-muted" title="Estimated chance of this leg winning; not certainty">{l.src === "market" ? "Mkt est." : "Model"} <strong className="num text-text">{l.prob.toFixed(1)}%</strong></span>
      </div>
      {/* ▲/▼ are the KEYBOARD path now (2026-09-26): a thumb or a mouse holds the card and drags it, so the pair is
          visually hidden until a key focuses it — two 16px buttons beside the lock were one more thing to mis-tap */}
      {onMove && (
        <span data-no-drag className="sr-only flex shrink-0 flex-col gap-px focus-within:not-sr-only">
          <button type="button" aria-label={`Move slot ${i + 1} up`} disabled={i === 0} onClick={(e) => keyStep(e.currentTarget, i - 1)}
            className="press flex h-4 w-6 items-center justify-center rounded-[5px] border border-white/[0.08] bg-white/[0.03] text-[8px] leading-none text-faint hover:text-text disabled:opacity-25">▲</button>
          <button type="button" aria-label={`Move slot ${i + 1} down`} disabled={i >= count - 1} onClick={(e) => keyStep(e.currentTarget, i + 1)}
            className="press flex h-4 w-6 items-center justify-center rounded-[5px] border border-white/[0.08] bg-white/[0.03] text-[8px] leading-none text-faint hover:text-text disabled:opacity-25">▼</button>
        </span>
      )}
      {/* "hit the 'lock it in' button on the pick then regenerate the ones below it" — alone on the right edge now,
          28px, with nothing stacked under it to hit by mistake */}
      <button
        type="button"
        data-no-drag
        aria-pressed={pinned}
        aria-label={`${pinned ? "Unlock" : "Lock in"} slot ${i + 1}: ${name}`}
        onClick={() => onTogglePin(i)}
        className={`press relative flex h-7 w-7 shrink-0 flex-col items-center justify-center rounded-[8px] border text-[7.5px] font-bold uppercase tracking-wide before:absolute before:-inset-2 before:content-[''] ${
          pinned ? "border-pos/60 bg-pos/10 text-pos ring-1 ring-pos/50" : "border-white/[0.08] bg-surface-2 text-faint"
        }`}
      >
        {/* the ::before reaches 8px past the box on every side: the phone's 0.7 content zoom draws this 28px lock at
            about 20px, so the thumb gets a 44px target around it with nothing else to hit on the card's right edge */}
        <span aria-hidden className="text-[13px] leading-none">
          {pinned ? "🔒" : "🔓"}
        </span>
      </button>
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
    <div data-gen-slot={i} className="flex min-h-9 items-center gap-2 border-t border-l-2 border-white/[0.04] border-l-gold py-1 pl-1.5 sm:min-h-[44px]">
      <span aria-hidden className="gen-slot-no num">{i + 1}</span>
      <button
        type="button"
        aria-pressed
        aria-label={`Unpin slot ${i + 1}`}
        onClick={() => onTogglePin(i)}
        className="press flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-[10px] border border-gold/60 bg-gold/10 text-[7.5px] font-bold uppercase tracking-wide text-gold"
      >
        <span aria-hidden className="text-[12px] leading-none">
          📌
        </span>
        <span className="mt-[2px] leading-none">unpin</span>
      </button>
      <div className="min-w-0 flex-1 leading-snug">
        <div className="truncate text-[12.5px] font-medium text-gold">Kept slot {i + 1}</div>
        <div className="truncate text-[9.5px] text-faint">no longer posted on this board — unpin it to spin this slot</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- the sheet */

export function GenSheet<P>({
  market,
  marketLabel,
  markets,
  positions,
  positionsLoading = false,
  pool,
  renderMark = mlbMark,
  renderName = mlbName,
  spec,
  onSpec,
  result,
  onGenerate,
  spinKey = 0,
  moved = 0,
  onBack, onForward, canBack = false, canForward = false, historyNotice,
  onTogglePin,
  onMove,
  onExcludePlayer, excludedPlayers = [], onRestorePlayer, onClearExclusions,
  onAdd,
  canUndo,
  onUndo,
  onSaveSetup,
  onLoadSetup,
  hasSetup = false,
  setupNotice,
  open,
  onOpen,
  boardAt,
  loading = false,
  gameMarket = false,
  showModelOnly = true,
  showHitRate = false,
  hitWindow,
  onHitWindow,
  hitLoading = false,
  categoryNote = "Open Markets to choose which categories can appear on your ticket.",
  stubNote = "The parlay generator builds PLAYER-prop parlays — pick a batter or pitcher market above and it appears here. Moneyline and run line are game markets and have no player slots yet.",
  marketNote = "Italic legs use market estimates; differences from the selected book price are not independent evidence of a model edge.",
}: {
  market: string;
  marketLabel: string;
  /** the desk's own prop markets, in its own rail order (MLB_GEN_MARKETS / FOOTBALL_GEN_MARKETS) */
  markets: readonly GenMarket[];
  positions?: readonly string[];
  positionsLoading?: boolean;
  pool: GenPool<P>;
  /** the player disc for a slot — the page passes the headshot it already resolved; the football
      desk passes its own mark. This sheet never calls useHeadshots itself. */
  renderMark?: SlotPart<P>;
  /** the player name for a slot — tappable on MLB (the profile sheet), plain text on football */
  renderName?: SlotPart<P>;
  spec: GenSpec;
  onSpec: (patch: Partial<GenSpec>) => void;
  result: GenResult<P>;
  onGenerate: () => void;
  /** the desk's spin counter (useParlayGen's `spinKey`): it moves only when a spin has produced its ticket, and THAT is
      when the reels start landing — never at the press, which on football comes seconds before the fresh quotes */
  spinKey?: number;
  /** legs of the ticket on screen whose price moved, or that left the board, since it was spun */
  moved?: number;
  onBack?: () => void;
  onForward?: () => void;
  canBack?: boolean;
  canForward?: boolean;
  historyNotice?: string | null;
  onTogglePin: (slot: number) => void;
  /** drag / ▲▼ reorder of the generated slots (2026-09-18); absent = fixed order */
  onMove?: (from: number, to: number) => void;
  onExcludePlayer?: (slot: number) => void;
  excludedPlayers?: readonly { key: string; label: string }[];
  onRestorePlayer?: (key: string) => void;
  onClearExclusions?: () => void;
  onAdd: () => void;
  onSaveSetup?: () => void;
  onLoadSetup?: () => void;
  hasSetup?: boolean;
  setupNotice?: string | null;
  canUndo: boolean;
  onUndo: () => void;
  open: boolean;
  onOpen: (v: boolean) => void;
  /** the board's generation time, already formatted by the page after mount (null during SSR) */
  boardAt: string | null;
  /** the board has not answered yet — say so instead of declaring the board empty */
  loading?: boolean;
  /** the market rail is on a GAME market (ML/RL, or football sides): no player slots there */
  gameMarket?: boolean;
  /** offer the model-priced-only filter. Off on football, where every win % is the de-vigged
      market consensus — the toggle would empty the pool and explain nothing. */
  showModelOnly?: boolean;
  /** offer the hit-rate floor and window — MLB only, where the free game log exists */
  showHitRate?: boolean;
  /** the page's hit-rate window (L7…L120) and its setter — the rows below the sheet share them */
  hitWindow?: HitWindow;
  onHitWindow?: (w: HitWindow) => void;
  /** the game logs are still on their way — a floor cannot be judged yet */
  hitLoading?: boolean;
  /** the line under the category chips, in the desk's own words */
  categoryNote?: ReactNode;
  /** what stands in for the sheet on a game market */
  stubNote?: ReactNode;
  /** how this desk's market-sourced win % should be read */
  marketNote?: ReactNode;
}) {
  const band = bandDec(spec.legMinAm, spec.legMaxAm);
  void band;
  const [attempt, setAttempt] = useState(0);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  /* THE REVEAL LANDS ON THE SPIN'S OWN TICKET (2026-09-26 follow-up, Josh: "After parlay generator spins and rolls
     out the picks, it waits to finish loading 'the board' I guess? And then it changes the picks. It shouldn't change
     anything after it rolls them out one by one"). The first cut started landing at the PRESS. On football a Live or
     Mixed press first re-pulls the prop prices and only spins once they are back, so the reels landed on the OLD
     ticket and the new one replaced it seconds later. Now a press HOLDS the reels spinning (`held`) and they start
     landing only when `spinKey` moves — the render in which the spin's ticket exists. On MLB the spin is synchronous,
     so the hold never shows; a refresh that fails, or a press that spins nothing, releases the hold and the ticket
     on screen stands untouched. */
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [held, setHeld] = useState<{ reveal: Reveal | null } | null>(null);
  const [spinSeen, setSpinSeen] = useState(spinKey);
  const pinnedNow = spec.pinned.slice(0, spec.legs).filter(Boolean).length;
  if (spinKey !== spinSeen) {
    setSpinSeen(spinKey);
    setHeld(null);
    setReveal(startReveal(spinKey, spec.legs - pinnedNow));
  } else if (held && !loading) {
    setHeld(null);
  }
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal((r) => (r === reveal ? null : r)), reveal.end + ODDS_COUNT_MS + 650);
    return () => clearTimeout(t);
  }, [reveal]);
  /* the slider's track opens at 9am PT, earlier only for a slate with an earlier game */
  const timeBounds = useMemo(() => slateTimeBounds(pool.legs.map((l) => l.start)), [pool]);
  /* THE SAME FILTERS `generate` USES (INSTRUCTION 50 fix pass). poolCounts exists precisely so
     the diagnostic can never contradict the verdict. */
  const counts = useMemo(() => poolCounts(pool, spec), [pool, spec]);
  const candidates = useMemo(() => mixCandidates(pool, spec), [pool, spec]);
  const distinctPlayers = useMemo(() => new Set(candidates.map((l) => l.playerKey)).size, [candidates]);
  /* what the reels spin through: real legs from the pool the ticket is drawn from, spread across it */
  const faces = useMemo<ReelFace[]>(() => {
    const src = candidates.length >= 3 ? candidates : pool.legs;
    const step = Math.max(1, Math.floor(src.length / 48));
    const out: ReelFace[] = [];
    for (let i = 0; i < src.length && out.length < 48; i += step) out.push({ name: parseBoardLabel(src[i].label)?.name ?? src[i].label, sub: src[i].sub, price: amFmt(src[i].am) });
    return out;
  }, [candidates, pool]);
  /* PERF (2026-09-26): these three passes each filter the whole pool, and they ran on EVERY render of the sheet —
     every hover of a drag, every keystroke. They depend on the pool and the spec only. */
  const unknownPositions = useMemo(() => positions ? new Set(mixCandidates(pool, { ...spec, positions: [] }).filter((l) => !l.position).map((l) => l.playerKey)).size : 0, [positions, pool, spec]);
  /* how many legs carry a game log at all, before the floor — so the floor row can say "N of M have data" */
  const withLog = useMemo(() => (showHitRate ? mixCandidates(pool, { ...spec, minHit: null }) : []), [pool, spec, showHitRate]);
  const withLogCount = withLog.filter((l) => l.hit).length;
  /* every distinct price this pool posts, cheapest decimal first — the slider's stops */
  const prices = useMemo(() => [...new Set(pool.legs.map((l) => l.am))].sort((a, b) => amToDec(a) - amToDec(b)), [pool]);
  /* the games on this board, for the games chips (label = the first leg's matchup string) */
  const games = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of pool.legs) if (!m.has(l.gameKey)) m.set(l.gameKey, l.gameLabel ?? l.gameKey);
    return [...m.entries()].map(([key, label]) => ({ key, label: label.split(" · ")[0] })).sort((a, b) => a.label.localeCompare(b.label));
  }, [pool]);
  const selectedMarkets = specMarkets(spec);
  const ticket = result.ok ? result.ticket : null;
  /* a press still waiting on fresh quotes shows the HELD reels; otherwise the landing reveal, if one is running */
  const holding = !!held && loading;
  const shown = holding ? held!.reveal : reveal;
  const rolling = !!shown && !!ticket;
  /* each unlocked slot lands in turn, top to bottom (Infinity while held); a locked slot never spins */
  const landTimes: (number | undefined)[] = [];
  if (ticket && rolling) {
    const spinning = ticket.legs.filter((l, i) => spec.pinned[i] !== l.id).length;
    let k = 0;
    for (let i = 0; i < ticket.legs.length; i++) landTimes.push(spec.pinned[i] === ticket.legs[i].id ? undefined : holding ? Infinity : landAtMs(k++, spinning));
  }
  /* hold-and-drag reorder (2026-09-26) — only while a ticket is on screen and resting: off while the reels spin, and
     off with the sheet shut or on the Games stub, so the scroll gate it registers never outlives a draggable list */
  const drag = useSlotDrag(onMove, open && !gameMarket && !!ticket && !rolling, ticket?.key ?? null);

  /* a tap skips a LANDING reveal; a held one keeps masking the old ticket until the spin lands (2026-09-26 review:
     skipping the hold exposed the pre-press legs, and the spin then replaced them — the very change Josh reported) */
  const skipReveal = () => { if (!holding) setReveal(null); };
  /* priced off the HOISTED price and win % — the same two numbers the desk's own leg carries, so
     the headline here still cannot disagree with the slip the legs are handed to */
  const calc = ticket ? combineTicket(ticket.legs.map((l) => ({ cz: l.am, prob: l.prob, push: l.push }))) : null;
  const outside = new Set(ticket?.outsideLegBand ?? []);
  const anyMarketProb = !!ticket?.legs.some((l) => l.src === "market");
  const mkt = markets.find((m) => m.key === market);
  const suspended = !!mkt?.suspended;
  /* a yes-only market (anytime TD) has no under to pick, so the side control is not offered on it */
  const oneSided = selectedMarkets.length > 0 && selectedMarkets.every(key => markets.find(m=>m.key===key)?.oneSided);
  const fail = result.ok ? null : result.fail;
  // A bounded payout search can succeed on another seed. Keep Generate usable and
  // offer explicit filter repairs separately, without silently changing the request.
  const availableBand = useMemo(() => availableLegBand(pool, spec), [pool, spec]);
  /* A market that posts one side only (anytime TD) gets the same one-tap escape: the side it
     really does post. Without it the Unders button was a trap — the Generate button went dead,
     the banner called the board empty, and nothing on screen pointed at the control Josh had
     just pressed (INSTRUCTION 52 fix pass). */
  const relax: { label: string; patch: Partial<GenSpec> } | null =
    fail?.code === "short-pool" && fail.relax
      ? { label: RELAX_BUTTON[fail.relax], patch: RELAX_PATCH[fail.relax] }
      : fail?.code === "one-sided"
        ? { label: fail.has === "u" ? "Switch to unders" : "Switch to overs", patch: { sides: fail.has } }
        : availableBand && (fail?.code === "band-empty" || (fail?.code === "short-pool" && counts.inBand < counts.eligible))
          ? { label: `Use available odds ${amFmt(availableBand.legMinAm)} to ${amFmt(availableBand.legMaxAm)}`, patch: availableBand }
          : fail?.code === "short-pool" && fail.have >= LEG_MIN && !spec.pinned.some(Boolean)
            ? { label: `Build ${fail.have} legs instead`, patch: { legs: fail.have } }
            : fail?.code === "payout-unreachable" && spec.payout != null
              ? { label: "Remove combined payout target", patch: { payout: null } }
              : fail?.code === "style-shape" && fail.why === "same-game"
                ? { label: RELAX_BUTTON["same-game"], patch: RELAX_PATCH["same-game"] }
                : null;
  /* the kept slots, resolved against the pool — rendered in EVERY state, success or failure,
     so the unpin button the failure copy tells Josh to press is always on screen */
  const pinRows = spec.pinned
    .slice(0, spec.legs)
    .map((id, i) => ({ i, id, leg: id ? pool.byId.get(id) ?? null : null }))
    .filter((x): x is { i: number; id: string; leg: GenLeg<P> | null } => !!x.id);

  const toggleMarket = (key: string) => {
    const on = selectedMarkets.includes(key);
    if (on && selectedMarkets.length === 1) return; // the ticket always has at least one category
    onSpec({ markets: on ? selectedMarkets.filter((m) => m !== key) : [...selectedMarkets, key] });
  };
  const toggleGame = (key: string) => {
    const cur = spec.games ?? [];
    onSpec({ games: cur.includes(key) ? cur.filter((g) => g !== key) : [...cur, key] });
  };
  const summary = [
    `${spec.legs} legs`,
    selectedMarkets.length > 1 ? `${selectedMarkets.length} categories` : marketLabel,
    `${amFmt(spec.legMinAm)} to ${amFmt(spec.legMaxAm)}`,
    ...(spec.minHit != null ? [`${Math.round(spec.minHit * 100)}%+ hit rate`] : []),
    ...(spec.games?.length ? [`${spec.games.length} game${spec.games.length === 1 ? "" : "s"}`] : []),
  ].join(" · ");

  /* On the Games rail (moneyline / run line) the generator has nothing to build from — and the
     collapsed header used to read "Parlay generator · 4 legs · H+R+RBI" beside a Moneyline
     market, naming a category that is not on screen (INSTRUCTION 50 fix pass). */
  if (gameMarket) {
    return (
      <section data-testid="props-gen-stub" className="glass mb-2 px-3 py-2 text-[10.5px] leading-snug text-faint">
        {stubNote}
      </section>
    );
  }

  return (
    <section data-testid="props-gen" style={{ backgroundColor: "rgba(24,29,36,0.96)" }} className="gen-studio glass @container mb-3 overflow-hidden border border-pos/25 shadow-[0_12px_50px_-25px_rgba(58,176,232,0.35)]">
      <button
        type="button"
        onClick={() => onOpen(!open)}
        aria-expanded={open}
        aria-controls={open ? GEN_PANEL_ID : undefined}
        className="gen-studio-toggle press flex min-h-[44px] w-full items-center gap-2 px-3 text-left"
      >
        <span aria-hidden className="text-[13px] leading-none">
          🎲
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold tracking-wide text-text">
          Parlay generator
          <span className="ml-1.5 font-normal text-muted">
            {spec.legs} legs · {selectedMarkets.length > 1 ? `${selectedMarkets.length} categories` : marketLabel}
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
          {/* COMPACT (2026-09-18, Josh, verbatim: "Lets also compact the UI on the parlay generator.
              If we have to do dropdowns etc in order to reduce space wasted/taken up then so be
              it"). The hero is one line; Legs, Sides, Timing and the hit-rate floor + window are
              native selects; the explanatory paragraphs are tooltips; Save / Load sit under
              Advanced. Nothing here changes what the generator DOES — only how much of the screen
              it takes. */}
          <div className="gen-studio-hero -mx-3 -mt-2.5 hidden items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0 truncate text-[15px] font-black tracking-tight text-white">Build your parlay<span className="text-pos">.</span></div>
            <div className="num flex shrink-0 items-center gap-x-2 text-[10px] text-muted">
              <span title="distinct players with a leg that passes every filter"><b className="text-text">{distinctPlayers}</b> players</span>
              <span><b className="text-text">{counts.games}</b> game{counts.games === 1 ? "" : "s"}</span>
              <span title="legs inside the odds band"><b className="text-text">{counts.inBand}</b> in band</span>
            </div>
          </div>

          <button type="button" aria-expanded={customizeOpen} aria-controls="props-gen-settings" onClick={() => setCustomizeOpen((v) => !v)}
            className="press flex min-h-10 w-full items-center justify-between gap-2 rounded-[10px] border border-pos/25 bg-pos/[0.06] px-3 text-left text-[11px] text-text @3xl:hidden">
            <span className="min-w-0 truncate"><b>{customizeOpen ? "Hide settings" : "Customize"}</b><span className="num ml-2 text-muted">{summary}</span></span><span aria-hidden className="shrink-0 text-pos">{customizeOpen ? "−" : "+"}</span>
          </button>

          {/* Desktop: settings beside the ticket; mobile: optional settings above picks. */}
          <div className="gen-workspace">
          <div id="props-gen-settings" className={`${customizeOpen ? "block" : "hidden"} space-y-2 @3xl:block`}>
          <div className="gen-controls-grid"><div className="gen-primary-controls">
          {/* legs and sides */}
          <div className="gen-leg-side-controls">
            <div className="min-w-0 flex-1">
              <span className="text-[9px] uppercase text-faint">Legs</span>
              <div className="flex h-9 items-center rounded-lg border border-white/10 bg-surface-2">
                <button type="button" aria-label="Remove one leg" disabled={spec.legs <= LEG_MIN} onClick={() => onSpec({ legs: spec.legs - 1 })} className="h-full flex-1 disabled:opacity-30">−</button>
                {/* tap the number for a native picker (2026-09-26: the stepper now reaches 20, eighteen taps from 2) */}
                <span className="relative flex h-full min-w-9 items-center justify-center">
                  <output aria-label="Leg count" className="num font-bold">{spec.legs}</output>
                  <select aria-label="Choose leg count" value={spec.legs} onChange={(e) => onSpec({ legs: Number(e.target.value) })}
                    className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0">
                    {Array.from({ length: LEG_MAX - LEG_MIN + 1 }, (_, k) => LEG_MIN + k).map((n) => <option key={n} value={n}>{n} legs</option>)}
                  </select>
                </span>
                <button type="button" aria-label="Add one leg" disabled={spec.legs >= LEG_MAX} onClick={() => onSpec({ legs: spec.legs + 1 })} className="h-full flex-1 disabled:opacity-30">+</button>
              </div>
            </div>
            {/* sides — not offered on a yes-only market (INSTRUCTION 52 fix pass) */}
            {oneSided ? (
              <div data-testid="gen-one-sided" className="gen-one-side min-w-0 text-[10px] text-muted" title={`${marketLabel} has one side only — the price is on it happening, so there is no over or under to pick here.`}>
                <span>Sides</span><b>Yes only</b>
              </div>
            ) : (
              <Select label="Sides" value={spec.sides} onChange={(v) => onSpec({ sides: v as GenSpec["sides"] })}
                options={[{ value: "o", label: "Overs" }, { value: "u", label: "Unders" }, { value: "both", label: "Both" }]} />
            )}
          </div>
          <label className="gen-bet-type text-[11px] font-bold">
            Bet Type
            <select aria-label="Bet Type" className="min-h-8 rounded-lg border border-white/20 bg-surface-2 px-2 text-text" value={spec.betType??"styles"} onChange={e=>onSpec({betType:e.target.value as "styles"|"model",...(e.target.value==="model"?{modelOnly:false}:{})})}>
              <option value="styles">Parlay Styles</option><option value="model">The Model</option>
            </select>
          </label>




          {/* per-leg odds band */}
          <div className="gen-odds-controls">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-faint">Odds per leg</span>
              <span className="num text-[9.5px] text-faint">{counts.inBand} of {counts.eligible} legs in band</span>
            </div>
            <div className="flex items-center gap-2">
              <AmInput label="Min" value={spec.legMinAm} onCommit={(v) => onSpec({ legMinAm: v })} hint="-152" />
              <AmInput label="Max" value={spec.legMaxAm} onCommit={(v) => onSpec({ legMaxAm: v })} hint="+110" />
            </div>
            <OddsSlider prices={prices} lo={spec.legMinAm} hi={spec.legMaxAm} onChange={(lo, hi) => onSpec({ legMinAm: lo, legMaxAm: hi })} />
          </div>

          </div><div className="gen-discovery-controls"><div title={typeof categoryNote==="string"?categoryNote:undefined}><DiscoveryFilters hideOdds stacked timeBounds={timeBounds} hideStyles={spec.betType==="model"} showSports={!!spec.sports} markets={spec.sports ? ALL_MARKETS : markets} value={{timing:spec.timing??(spec.phase==="live"?["live"]:spec.phase==="pregame"?["pregame"]:["pregame","live"]),markets:spec.noMarkets?[]:[...selectedMarkets],strategies:spec.strategies??STRATEGIES.map(s=>s.key),sports:spec.sports??[],timeWindow:spec.timeWindow??[0,24]}} onChange={v=>onSpec({timing:v.timing,phase:v.timing.length===1?v.timing[0] as "live"|"pregame":"mixed",includeStarted:v.timing.includes("live"),markets:v.markets,noMarkets:v.markets.length===0,strategies:v.strategies,timeWindow:v.timeWindow,...(spec.sports?{sports:v.sports}:{})})}/></div></div></div>

          {/* hit-rate floor + window — MLB only, two selects on one row */}
          {showHitRate && hitWindow != null && (
            <div className="flex items-end gap-2" title="How often the player has cleared the line on this ticket in his recent games — a count, not a prediction. The floor keeps only legs at or above it; the window also drives the chips on every row below.">
              <Select label="Hit rate" hint={hitLoading ? "loading game logs…" : `${withLogCount} of ${withLog.length} have logs`} disabled={hitLoading}
                value={spec.minHit == null ? "any" : String(spec.minHit)} onChange={(v) => onSpec({ minHit: v === "any" ? null : Number(v) })}
                options={HIT_FLOORS.map((f) => ({ value: f.value == null ? "any" : String(f.value), label: f.label }))} />
              <Select label="Over the last" value={String(hitWindow)} onChange={(v) => onHitWindow?.(Number(v) as HitWindow)}
                options={HIT_WINDOWS.map((w) => ({ value: String(w), label: `${windowLabel(w)} games` }))} />
            </div>
          )}

          <div className="gen-extra-controls">
          {/* games */}
          {games.length > 1 && (
            <details className="rounded-lg border border-white/10 px-2 py-1"><summary className="cursor-pointer text-[11px] text-muted">Games · {spec.games?.length ? `${spec.games.length} selected` : "All"}</summary><ChipRow label="Games" hint={spec.games?.length ? `${spec.games.length} of ${games.length}` : `all ${games.length}`}>
              <Chip on={!spec.games?.length} onClick={() => onSpec({ games: [] })}>All</Chip>
              {games.map((g) => (
                <Chip key={g.key} on={!!spec.games?.includes(g.key)} onClick={() => toggleGame(g.key)}>
                  {g.label}
                </Chip>
              ))}
            </ChipRow></details>
          )}

          {/* positions — football */}
          {positions && (
            <details className="gen-position-settings"><summary>Positions · {spec.positions?.length?spec.positions.join(" / "):"All"}</summary><fieldset className="min-w-0" aria-label="Player positions">
              <ChipRow label="Positions" hint={`${distinctPlayers} eligible players`}>
                <Chip on={!spec.positions?.length} onClick={() => onSpec({ positions: [] })}>All</Chip>
                {positions.map((position) => {
                  const checked = !!spec.positions?.includes(position);
                  return (
                    <button key={position} type="button" role="checkbox" aria-checked={checked} aria-label={position}
                      onClick={() => onSpec({ positions: checked ? spec.positions!.filter((p) => p !== position) : [...(spec.positions ?? []), position] })}
                      className={`${CHIP} ${checked ? CHIP_ON : CHIP_OFF}`}>{position}</button>
                  );
                })}
              </ChipRow>
              {positionsLoading ? <Faint>Checking roster positions…</Faint> : !!spec.positions?.length && unknownPositions > 0 && <Faint>{unknownPositions} players with unverified positions excluded.</Faint>}
            </fieldset></details>
          )}

          {/* advanced — the rare switches, and the saved setup */}
          <details className="group rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-0.5 @3xl:col-span-2">
            <summary className="flex min-h-9 cursor-pointer list-none items-center text-[11px] font-semibold text-muted [&::-webkit-details-marker]:hidden">
              Advanced <span className="ml-1 inline-block transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-1 space-y-1.5 pb-1.5 @3xl:grid @3xl:grid-cols-2 @3xl:gap-x-3 @3xl:gap-y-1.5 @3xl:space-y-0">
              <Toggle on={!spec.onePerGame} onChange={(v) => onSpec({ onePerGame: !v })}>
                Allow legs from the same game
              </Toggle>
              {/* R2b (2026-09-18, Josh): "so i can prevent a 3 teamer from having 2 players from same team" */}
              <Toggle on={!spec.onePerTeam} onChange={(v) => onSpec({ onePerTeam: !v })}>
                Allow legs from the same team
              </Toggle>
              {!spec.phase && <Toggle on={spec.includeStarted} onChange={(v) => onSpec({ includeStarted: v })}>
                Include games already under way
              </Toggle>}
              {selectedMarkets.length > 1 && (
                <Toggle on={spec.spread !== false} onChange={(v) => onSpec({ spread: v })}>
                  Every category on the ticket at least once
                </Toggle>
              )}
              {showModelOnly && (
                <Toggle on={spec.modelOnly} onChange={(v) => onSpec({ modelOnly: v })}>
                  Model-priced legs only (no market-fair legs)
                </Toggle>
              )}
              <Toggle
                on={spec.payout != null}
                onChange={(v) => onSpec({ payout: v ? { minAm: 400, maxAm: 1200 } : null })}
              >
                Target a combined payout too
              </Toggle>
              {spec.payout && (
                <div className="flex items-center gap-2 pl-1">
                  <AmInput
                    label="Ticket min"
                    value={spec.payout.minAm}
                    onCommit={(v) => onSpec({ payout: { minAm: v, maxAm: spec.payout!.maxAm } })}
                    hint="+400"
                  />
                  <AmInput
                    label="Ticket max"
                    value={spec.payout.maxAm}
                    onCommit={(v) => onSpec({ payout: { minAm: spec.payout!.minAm, maxAm: v } })}
                    hint="+1200"
                  />
                </div>
              )}
              {onSaveSetup && (
                <div className="flex items-center gap-2 @3xl:col-span-2">
                  <button type="button" onClick={onSaveSetup} className="press h-9 flex-1 rounded-full border border-white/10 text-[11px] font-semibold text-text">Save setup</button>
                  <button type="button" onClick={onLoadSetup} disabled={!hasSetup} className="press h-9 flex-1 rounded-full border border-white/10 text-[11px] font-semibold text-text disabled:opacity-40">Load saved setup</button>
                </div>
              )}
            </div>
          </details>
          </div>

          </div>
          <div id="props-gen-ticket" className="gen-ticket space-y-1.5 rounded-xl border border-white/10 bg-bg/40 p-2 @3xl:space-y-2.5 @3xl:p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-pos">Your ticket</span>
            {ticket && <span className="num min-w-0 truncate text-[9.5px] text-faint">{ticket.legs.length} picks{onMove ? " · hold and drag to reorder · lock what you like, then regenerate" : ""}</span>}
          </div>
          {onBack && <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} disabled={!canBack || loading} className="press h-8 flex-1 rounded-full border border-white/10 text-[11px] font-semibold disabled:opacity-35 sm:h-9">← Previous parlay</button>
            <button type="button" onClick={onForward} disabled={!canForward || loading} className="press h-8 flex-1 rounded-full border border-white/10 text-[11px] font-semibold disabled:opacity-35 sm:h-9">Next parlay →</button>
          </div>}
          {historyNotice && <p role="status" className="text-[10px] text-muted">{historyNotice}</p>}
          {!loading && relax && (
            <button type="button" onClick={() => onSpec(relax.patch)} className="press min-h-11 w-full rounded-[12px] border border-gold/40 bg-gold/10 px-3 py-2 text-[12px] font-semibold text-gold">
              {relax.label}
            </button>
          )}
          {!ticket && !loading && attempt > 0 && (
            <div role="status" aria-live="polite" className="text-[11px] text-gold">
              Attempt {attempt}: no matching parlay. {relax ? "Try the suggested adjustment above." : "Review the explanation below and change your filters."}
            </div>
          )}
          {canUndo && (
            <button type="button" onClick={onUndo} className="press min-h-11 w-full text-[11px] font-semibold text-gold">
              Added to the slip — undo
            </button>
          )}

          {setupNotice && <div role="status" className="text-[10.5px] text-muted">{setupNotice}</div>}

          {/* which control is binding */}
          <div data-testid="gen-diagnostic" className="num hidden text-[9.5px] text-faint @3xl:block">
            pool {pool.rows} rows → eligible {counts.eligible} → after band {counts.inBand} → {counts.games} game
            {counts.games === 1 ? "" : "s"}
            {pool.startedDropped > 0 && <> · {pool.startedDropped} excluded: started games or expired live quotes</>}
            {/* two different sentences, because they are two different facts: the book refusing a
                leg on a parlay, and a game that is simply over (INSTRUCTION 52 fix pass) */}
            {pool.noParlayDropped > 0 && <> · {pool.noParlayDropped} the book bars from parlays</>}
            {pool.finishedDropped > 0 && <> · {pool.finishedDropped} in games that have finished</>}
          </div>

          {excludedPlayers.length > 0 && <div className="flex flex-wrap items-center gap-1 rounded-xl border border-gold/25 bg-gold/5 px-2 py-1.5" aria-label="Excluded players">
            <span className="mr-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-gold">Sitting out</span>
            {excludedPlayers.map(p => (
              <button key={p.key} type="button" onClick={() => onRestorePlayer?.(p.key)} aria-label={`Restore ${p.label}`} title="Tap to bring him back"
                className="press inline-flex h-6 items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 text-[10px] font-semibold text-text">
                {p.label}<span aria-hidden className="text-gold">↺</span>
              </button>
            ))}
            <button type="button" onClick={onClearExclusions} className="press ml-auto h-6 px-1.5 text-[10px] font-semibold text-gold">Clear all</button>
          </div>}
          {/* the ticket, or the one honest reason there isn't one */}
          {ticket && calc ? (
            <div key={ticket.key} aria-busy={rolling} className={`gen-ticket-reveal${rolling && !holding ? " gen-rolling" : ""}`} style={rolling && !holding ? ({ "--reveal-end": `${shown!.end}ms` } as CSSProperties) : undefined}>
              {/* the ticket on screen holds until Josh asks for another (useParlayGen); when the board under it has
                  moved since the spin, say so — never swap the legs, never quietly re-price them */}
              {moved > 0 && !rolling && !holding && !historyNotice && (
                <p role="status" data-testid="gen-moved" className="mb-1 text-[10px] text-gold">
                  {moved} leg{moved === 1 ? "" : "s"} moved or came off the board since this spin — Regenerate for current prices.
                </p>
              )}
              <div ref={drag.listRef} className="space-y-1 sm:space-y-1.5">
                {ticket.legs.map((l, i) => (
                  <Slot
                    key={l.id}
                    i={i}
                    count={ticket.legs.length}
                    onMove={onMove}
                    onGrab={drag.grab?.(i)}
                    l={l}
                    pinned={spec.pinned[i] === l.id}
                    outOfBand={outside.has(l.id)}
                    hitWindow={showHitRate ? hitWindow : undefined}
                    renderMark={renderMark}
                    renderName={renderName}
                    onTogglePin={onTogglePin}
                    excluded={excludedPlayers.some(p => p.key === exclusionKey(l))}
                    onExclude={excludedPlayers.some(p => p.key === exclusionKey(l)) ? () => onRestorePlayer?.(exclusionKey(l)) : onExcludePlayer}
                    landMs={landTimes[i] != null && Number.isFinite(landTimes[i]) ? landTimes[i] : undefined}
                    reel={landTimes[i] != null ? <ReelOverlay key={shown!.spin} reveal={shown!} landAt={landTimes[i]!} faces={faces} offset={i * 7} onSkip={skipReveal} /> : undefined}
                  />
                ))}
              </div>
              {ticket.outsideLegBand.length > 0 && (
                <div className="mt-1.5 rounded-[10px] border border-gold/30 bg-gold/[0.07] px-2.5 py-1.5 text-[10.5px] text-gold">
                  A kept slot is priced outside your band — unpin it or widen the band. It is in the ticket because you
                  chose to keep it, and nowhere else does a leg break the band.
                </div>
              )}
              {(ticket.sameGame.length > 0 || ticket.sameTeam.length > 0) && (
                <div className="mt-1.5 text-[10px] text-faint">
                  {ticket.sameGame.length > 0 && (<>
                    {ticket.sameGame.length} game{ticket.sameGame.length === 1 ? "" : "s"} carr
                    {ticket.sameGame.length === 1 ? "ies" : "y"} more than one leg — same-game legs are correlated, and the
                    combined % below does not model that.
                  </>)}
                  {ticket.sameTeam.length > 0 && (<>
                    {ticket.sameGame.length > 0 ? " " : ""}
                    {ticket.sameTeam.length} team{ticket.sameTeam.length === 1 ? "" : "s"} carr
                    {ticket.sameTeam.length === 1 ? "ies" : "y"} more than one leg
                    {ticket.sameGame.length > 0 ? "." : " — same-team legs are correlated, and the combined % below does not model that."}
                  </>)}
                </div>
              )}
              <div className="gen-ticket-total num mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2 text-[12px]">
                <span className="gen-combined-odds text-[14px] font-bold text-pos"><span className="block text-[8px] font-semibold uppercase tracking-[0.16em] text-muted">Combined odds</span><OddsTicker key={rolling ? shown!.spin : "shown"} am={calc.am} reveal={rolling ? shown : null} /></span>
                <span className="text-muted">
                  estimated <b className="text-text">{(calc.trueProb * 100).toFixed(1)}%</b>
                </span>
                <span className="text-muted">
                  implied <b className="text-text">{(calc.impProb * 100).toFixed(1)}%</b>
                </span>
                <span className={calc.ev >= 0 ? "text-pos" : "text-neg"}>
                  Est. EV {calc.ev >= 0 ? "+" : ""}
                  {(calc.ev * 100).toFixed(1)}%
                </span>
                {ticket.marketPriced > 0 && (
                  <span className="italic text-faint">{ticket.marketPriced} market-priced</span>
                )}
              </div>
              <details className="mt-1.5 text-[9.5px] leading-snug text-faint">
                <summary className="cursor-pointer py-1 sm:py-2">Estimates & price details · paper only</summary>
                Estimated hit chance multiplies the leg estimates. Same-game correlation is not modeled; this is not a sportsbook parlay quote.
                {anyMarketProb && <> {marketNote} Football one-sided scorer and ladder prices use an assumed 8% overround; estimates are not measured true probabilities.</>}{" "}
                {showHitRate && <>Hit rates count games already played and are not a forecast. </>}
                {suspended && (
                  <>
                    {marketLabel} is suspended from the engine&apos;s own auto-built tickets; this sandbox spins it anyway.{" "}
                  </>
                )}
                {historyNotice ? "Prices are saved with this ticket" : spec.phase && spec.phase!=="pregame" ? "Live legs use their individual in-play quote times; pregame legs use the stored board" : <>Prices are the board&apos;s posted quotes{boardAt ? ` as of ${boardAt}` : ""}</>} — Regenerate builds another ticket. Football Live/Mixed generation refreshes prop prices first. Sandbox · not tracked, never enters the ledger.
              </details>
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
                        count={spec.legs}
                        l={leg}
                        pinned
                        outOfBand={false}
                        hitWindow={showHitRate ? hitWindow : undefined}
                        renderMark={renderMark}
                        renderName={renderName}
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
                  : spec.noMarkets ? "Select at least one market to generate a parlay." : genFailLine(result.ok ? { code: "no-rows" } : result.fail, {
                      marketLabel: selectedMarkets.length > 1 ? `${selectedMarkets.length}-category` : marketLabel,
                      phase: spec.phase,
                      boardAt,
                      legs: spec.legs,
                      loAm: spec.legMinAm,
                      hiAm: spec.legMaxAm,
                      styleBand: spec.payout == null,
                      styles: spec.strategies?.length ?? STRATEGIES.length,
                      /* `rows` counts only the rows that were still bettable, so rows 0 with
                         nothing dropped for being under way and something dropped for being over
                         means exactly one thing: every game in this market has finished */
                      allFinished: pool.rows === 0 && pool.startedDropped === 0 && pool.finishedDropped > 0,
                    })}
              </div>
            </div>
          )}
          </div>
          {/* Actions span both desktop columns, beneath the picks. */}
          {spec.betType==="model"&&<details className="mt-2 text-[10px] text-muted"><summary className="cursor-pointer font-bold">How The Model chooses</summary><p className="text-[10px] text-muted">Engine-ranked combinations within your filters, including F grades and negative EV. Uses model or market estimates as labeled, price, and player diversity—not just shortest odds. Regenerate explores another combination. Shared-game correlation is not modeled.</p></details>}
          {spec.betType!=="model"&&<details className="mt-2 text-[10px] text-muted"><summary className="cursor-pointer font-bold">About parlay styles</summary><p className="text-[9px] text-faint">Styles use probability and value within each market. Stacks need same-game permission; shared-game probabilities are not a joint forecast. Hedge-Friendly favors later starts; hedging is never guaranteed.</p></details>}
          <div className="gen-actions flex gap-2">
            {(
              <button
                type="button"
                onClick={() => { const next = attempt + 1; setAttempt(next); setHeld({ reveal: holdReveal(-next, performance.now()) }); onGenerate(); }}
                disabled={loading}
                className={`gen-roll press flex min-h-10 flex-1 items-center justify-center rounded-[12px] border border-pos bg-pos text-[13px] font-bold text-bg sm:min-h-12${rolling || holding ? " is-rolling" : ""}`}
              >
                <svg aria-hidden className="gen-dice mr-2 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="8" cy="16" r="1"/></svg>
                {holding ? "Getting fresh prices…" : loading ? "Loading board…" : ticket ? "Regenerate" : "Generate parlay"}
              </button>
            )}
            <button
              type="button"
              onClick={onAdd}
              disabled={!ticket || holding}
              className={`press min-h-10 shrink-0 rounded-[12px] border px-3 text-[12px] font-semibold sm:min-h-12 ${
                ticket ? "border-white/[0.12] bg-surface-2 text-text" : "border-white/[0.06] bg-surface-2/50 text-faint"
              }`}
            >
              Add to slip
            </button>
          </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Faint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mt-1 text-[9.5px] leading-snug text-faint ${className}`}>{children}</div>;
}
