"use client";

import { useState } from "react";
import type { PropBoardGame, PropBoardRow } from "@/engine";
import { amFmt, type SandboxLeg } from "@/lib/ticket-math";
import { GameHeader } from "./GameCard";
import { PlayerName } from "@/components/player/PlayerName";
import { MKT_LABEL, playerLeg, sidePrice, sideProb, sideShort, type Side } from "./props-model";

/* ------------------------------------------------------------------- visuals */

/** 28px headshot (h-7) — falls back to initials when the image is missing. */
export function Avatar({ src, label, size = "h-7 w-7" }: { src: string | null; label: string; size?: string }) {
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
        className={`${size} shrink-0 rounded-full border border-white/[0.08] bg-surface-2 object-cover`}
      />
    );
  }
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-surface-2 text-[9px] font-bold text-muted`}>
      {label
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0] ?? "")
        .join("")
        .toUpperCase()}
    </span>
  );
}

const CHIP = "rounded-[4px] border border-line-2 bg-surface-2 px-1 text-[8px] font-bold uppercase leading-[13px] text-muted";

/* ---------------------------------------------------------- the price button */

/** 80px wide so a 375px phone keeps ~127px for the player's name (see PlayerRow). */
export const BTN_W = "w-[80px]";

/**
 * One side of a line as a 32px × 80px button, two lines each justified
 * edge-to-edge: line 1 = the bet ("O 1.5", 10px) and its price (11.5px,
 * tabular); line 2 = the win % (9px, italic + "mkt" when it is the market's
 * fair, plain when it is the engine's model) and the book tag when the price
 * is not Caesars. Pressed = in the slip. A side the book has not posted renders
 * as a dashed "not posted" pill so the column never shows a blank hole.
 */
export function SideButton({
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
      <span className={`flex h-8 ${BTN_W} items-center justify-center rounded-[8px] border border-dashed border-white/[0.06] text-[9px] text-faint`}>
        not posted
      </span>
    );
  }
  return (
    <button
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex h-8 ${BTN_W} flex-col justify-center rounded-[8px] border px-1 leading-none transition-[background,border-color,box-shadow] duration-(--dur-fast) active:scale-[0.97] ${
        selected
          ? "border-pos/60 bg-pos/10 ring-1 ring-pos/50"
          : "border-white/[0.08] bg-surface-2 hover:border-pos/40"
      }`}
    >
      <span className="flex items-baseline justify-between gap-0.5">
        <span className={`min-w-0 truncate text-[10px] ${selected ? "text-pos" : "text-text"}`}>{sideShort(cat, r, side)}</span>
        <span className="num shrink-0 text-[11.5px] font-semibold text-pos">{amFmt(price.am)}</span>
      </span>
      <span className="mt-[3px] flex items-baseline justify-between gap-0.5">
        <span className={`num min-w-0 truncate text-[9px] text-faint ${prob ? (prob.src === "market" ? "italic" : "") : ""}`}>
          {prob ? `${prob.pct.toFixed(1)}%${prob.src === "market" ? " mkt" : ""}` : "\u00a0"}
        </span>
        {price.book !== "CZ" && <span className="shrink-0 text-[7.5px] uppercase text-faint">{price.book}</span>}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------- one row */

/**
 * A player line on one tight row: 28px headshot, the name (12px) on its own
 * line, then team · market · alt/proj on a 9.5px line, and the two 32px price
 * buttons on the right. Row height 40px + hairline.
 *
 * Width budget on a 375px phone: 343 (main px-4) − 12 (card px-1.5) − 28
 * (avatar) − 12 (two gap-1.5) − 164 (two 80px buttons + gap-1) = 127px for the
 * name alone — the team tag lives on the second line, not beside the name, so
 * "Gunnar Henderson" (~106px) and "Vladimir Guerrero Jr." (~122px at
 * tracking-tight) render whole; truncation is the last resort, not the norm.
 */
export function PlayerRow({
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
  const sides: Side[] = ["o", "u"];
  return (
    <div className="flex items-center gap-1.5 border-t border-white/[0.04] py-1">
      <Avatar src={headshot} label={r.p} />
      <div className="min-w-0 flex-1 leading-none">
        {/* propBoard rows carry no MLB id — the sheet resolves name + team itself */}
        <PlayerName name={r.p} team={r.tm} className="block truncate text-[12px] font-medium tracking-tight text-text">{r.p}</PlayerName>
        <div className="mt-[3px] flex items-center gap-1 text-[9.5px] text-faint">
          {r.tm && <span className="shrink-0 text-[9.5px] font-semibold text-muted">{r.tm}</span>}
          {r.tm && <span className="shrink-0 text-faint/60">·</span>}
          <span className="truncate">{MKT_LABEL[cat] ?? cat}</span>
          {r.alt && <span className={CHIP}>alt</span>}
          {r.lu === "projected" && <span className={CHIP}>proj</span>}
          {r.pO == null && <span className="min-w-0 truncate italic">mkt price only</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        {sides.map((side) => {
          const leg = playerLeg(r, cat, side, game, gkey);
          return (
            <SideButton
              key={side}
              r={r}
              cat={cat}
              side={side}
              selected={leg ? isSel(leg.id) : false}
              onToggle={() => leg && onToggle(leg)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the game card */

/* 12 rows = one full 375×812 screen of rows before the first "Show all" */
const FIRST = 12;

export function PropGameCard({
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
  const [shown, setShown] = useState(FIRST);
  return (
    <section className="glass overflow-hidden">
      <GameHeader game={g.game} open={open} onToggle={() => setOpen((o) => !o)} count={`${rows.length} line${rows.length === 1 ? "" : "s"}`} />
      {open && (
        <div className="px-1.5 pb-1">
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
              className="mt-0.5 h-8 w-full border-t border-white/[0.04] text-center text-[11px] font-semibold text-pos"
              onClick={() => setShown(rows.length)}
            >
              Show all {rows.length} ▾
            </button>
          )}
        </div>
      )}
    </section>
  );
}
