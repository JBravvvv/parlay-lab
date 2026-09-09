"use client";

import { useEffect, useRef, useState } from "react";
import { amFmt, type SandboxLeg } from "@/lib/ticket-math";
import { parseMatchup, teamAbbr, teamCode, teamLogo, teamLogoFromLabel } from "@/lib/mlb-visuals";
import { legId, playerMatches, type GameGroup, type TeamSide } from "./props-model";

/* ----------------------------------------------------------- the game header */

function Logo({ name, size = "h-5 w-5" }: { name: string; size?: string }) {
  const code = teamCode(name);
  if (!code) return <span className={`${size} shrink-0`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={teamLogo(code)} alt="" loading="lazy" className={`${size} shrink-0 object-contain`} />;
}

/**
 * Compact card header: 20px logos, "AWAY @ HOME · time" at 11px, the row count
 * and a chevron. Tapping anywhere on it collapses the card.
 */
export function GameHeader({
  game,
  open,
  onToggle,
  count,
}: {
  game: string;
  open: boolean;
  onToggle: () => void;
  count?: string;
}) {
  const m = parseMatchup(game);
  return (
    <button
      className="flex h-9 w-full items-center gap-2 px-3 text-left"
      onClick={onToggle}
      aria-expanded={open}
    >
      <Logo name={m.away} />
      <Logo name={m.home} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-text">
        {teamAbbr(m.away)} @ {teamAbbr(m.home)}
        {m.time && <span className="num ml-1.5 font-normal text-muted">· {m.time}</span>}
      </span>
      {count && <span className="num shrink-0 text-[9.5px] text-faint">{count}</span>}
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
  );
}

/* ------------------------------------------------- the team filter pills */

/**
 * INSTRUCTION 46 (2026-09-08, Josh's word, verbatim: "there should be 3 buttons: All,
 * Giants & Rockies"). Styled like the Board's scope tablist (role=tablist / aria-selected):
 * All / <away abbr> / <home abbr>, one per game card, on the prop-market tabs only.
 */
export function TeamSidePills({
  away,
  home,
  side,
  onSide,
}: {
  away: string;
  home: string;
  side: TeamSide;
  onSide: (s: TeamSide) => void;
}) {
  const opts: { k: TeamSide; label: string; title: string }[] = [
    { k: "all", label: "All", title: "Every posted line in this game" },
    { k: "away", label: teamAbbr(away), title: `Only ${away} lines` },
    { k: "home", label: teamAbbr(home), title: `Only ${home} lines` },
  ];
  return (
    <div className="flex items-center gap-2 py-1">
      {/* 36px-tall pills (min-h-9): a thumb target on a 375px phone, same tokens as the Board's scope tablist */}
      <div className="flex rounded-full border border-white/[0.08] bg-surface-2 p-0.5" data-testid="team-side" role="tablist">
        {opts.map((o) => (
          <button
            key={o.k}
            type="button"
            role="tab"
            aria-selected={side === o.k}
            onClick={() => onSide(o.k)}
            title={o.title}
            className={`min-h-9 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              side === o.k ? "bg-pos/20 text-pos" : "text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ ML / RL rows */

function TeamAvatar({ label }: { label: string }) {
  const src = teamLogoFromLabel(label);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className="h-6 w-6 shrink-0 object-contain" />;
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-surface-2 text-[9px] font-bold text-muted">
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function GameMarketCard({
  g,
  market,
  isSel,
  onToggle,
  hitPlayer = null,
}: {
  g: GameGroup;
  market: string;
  isSel: (id: string) => boolean;
  onToggle: (leg: SandboxLeg) => void;
  /** INSTRUCTION 46 deep link: the ledger bet's team name — that side's row gets ringed and scrolled to */
  hitPlayer?: string | null;
}) {
  const [open, setOpen] = useState(true);
  const hitRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hitPlayer) hitRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hitPlayer]);
  return (
    <section className="glass overflow-hidden">
      <GameHeader game={g.game} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="px-2 pb-1">
          {g.rows.map((r) => {
            const cz = typeof r.cz === "number" ? r.cz : null;
            const prob = typeof r.prob === "number" ? r.prob : null;
            const id = legId(r);
            const sel = isSel(id);
            const hit = !!hitPlayer && playerMatches(String(r.label ?? ""), hitPlayer);
            return (
              <div
                key={id}
                ref={hit ? hitRef : undefined}
                data-deeplink={hit ? "hit" : undefined}
                className={"flex items-center gap-2 border-t border-white/[0.04] py-1" + (hit ? " rounded-[8px] bg-gold/[0.08] ring-1 ring-gold/50" : "")}
              >
                <TeamAvatar label={r.label} />
                <div className="min-w-0 flex-1 leading-none">
                  <div className="truncate text-[12px] font-medium text-text">{r.label}</div>
                  <div className="mt-[3px] truncate text-[9.5px] text-faint">{r.sub}</div>
                </div>
                {prob != null && (
                  <span className="num shrink-0 text-[10px] text-muted" title="Engine blended true win % for this side">
                    {prob.toFixed(1)}%
                  </span>
                )}
                {cz != null ? (
                  <button
                    aria-pressed={sel}
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
                    className={`num h-8 w-[72px] shrink-0 rounded-[8px] border text-[12px] font-semibold text-pos transition-[background,border-color,box-shadow] duration-(--dur-fast) active:scale-[0.97] ${
                      sel ? "border-pos/60 bg-pos/10 ring-1 ring-pos/50" : "border-white/[0.08] bg-surface-2 hover:border-pos/40"
                    }`}
                  >
                    {amFmt(cz)}
                  </button>
                ) : (
                  <span className="flex h-8 w-[72px] shrink-0 items-center justify-center rounded-[8px] border border-dashed border-white/[0.06] text-[9.5px] text-faint">
                    no CZ
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
