"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { headshotUrl, teamLogo } from "@/lib/mlb-visuals";
import { espnLogoCode, type ChartPoint, type PlayerCard, type Resolved } from "@/lib/player-card";
import { SkeletonRows, Skeleton } from "@/components/ui/states";

/**
 * Tap any player name anywhere → the Roster Lab-style player card, fed by the
 * MLB Stats API: identity block (photo, team · position, roster status) with
 * three season tiles, the season + last 7/15/30-day split table, a per-game
 * bar chart over the last 30 days, and the full season game log.
 *
 * Opening with only a name (board rows, ticket legs) first resolves it through
 * /api/player/resolve; a miss renders an honest "couldn't match" state, never a
 * guess. Every figure comes from /api/player, which only talks to statsapi.
 */

export type SheetTarget = { id?: number | null; name: string; team?: string | null };

const Ctx = createContext<(t: SheetTarget) => void>(() => {});

export function usePlayerSheet(): (t: SheetTarget) => void {
  return useContext(Ctx);
}

export function PlayerSheetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<SheetTarget | null>(null);
  const open = useCallback((t: SheetTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [target, close]);

  return (
    <Ctx.Provider value={open}>
      {children}
      {target && <Sheet target={target} onClose={close} />}
    </Ctx.Provider>
  );
}

class NotFound extends Error {}

async function resolveName(name: string, team?: string | null): Promise<Resolved> {
  const qs = new URLSearchParams({ name });
  if (team) qs.set("team", team);
  const r = await fetch(`/api/player/resolve?${qs}`);
  if (r.status === 404) throw new NotFound("no match");
  if (!r.ok) throw new Error(`resolve ${r.status}`);
  return r.json();
}

async function loadCard(id: number): Promise<PlayerCard> {
  const r = await fetch(`/api/player?id=${id}`);
  const body = await r.json().catch(() => null);
  if (r.status === 404) throw new NotFound("unknown id");
  if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
  return (body as { card: PlayerCard }).card;
}

const STALE = 5 * 60 * 1000;
const TONE: Record<string, string> = { pos: "text-pos", gold: "text-gold", neg: "text-neg", muted: "text-muted" };

function Sheet({ target, onClose }: { target: SheetTarget; onClose: () => void }) {
  // swipe-down to dismiss (the ✕ and backdrop still work): drag follows the
  // finger once the sheet is scrolled to its top, releases past ~120px close
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if ((panelRef.current?.scrollTop ?? 1) <= 0) {
      dragStart.current = e.touches[0].clientY;
      setDragging(true);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current == null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    if (dy > 0 && (panelRef.current?.scrollTop ?? 1) <= 0) setDragY(dy);
    else if (dy <= 0) setDragY(0);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (dragY > 120) onClose();
    else setDragY(0);
    dragStart.current = null;
  };

  const needsResolve = target.id == null;
  const resolve = useQuery({
    queryKey: ["player-resolve", target.name, target.team ?? null],
    queryFn: () => resolveName(target.name, target.team),
    enabled: needsResolve,
    staleTime: 24 * 60 * 60 * 1000,
    retry: (n, err) => !(err instanceof NotFound) && n < 1,
  });
  const id = target.id ?? resolve.data?.id ?? null;
  const card = useQuery({
    queryKey: ["player-card", id],
    queryFn: () => loadCard(id!),
    enabled: id != null,
    staleTime: STALE,
    retry: (n, err) => !(err instanceof NotFound) && n < 1,
  });

  const c = card.data ?? null;
  const name = c?.fullName ?? resolve.data?.fullName ?? target.name;
  const noMatch = resolve.error instanceof NotFound || card.error instanceof NotFound;
  const logoCode = espnLogoCode(c?.team?.abbr ?? target.team ?? null);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} profile`}
    >
      <div
        ref={panelRef}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-surface/95 backdrop-blur-2xl md:max-w-2xl md:rounded-3xl"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 200ms cubic-bezier(0.16,1,0.3,1)",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* grab handle (mobile swipe affordance) */}
        <div className="flex justify-center pt-2 md:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* identity block */}
        <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-surface/95 px-5 pb-4 pt-3 backdrop-blur-xl md:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              {id != null ? <PlayerPhoto id={id} name={name} size={64} /> : <Skeleton className="h-16 w-16 shrink-0 rounded-full" />}
              <div className="min-w-0">
                <div className="display truncate text-[20px] leading-tight text-text">{name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {logoCode && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={teamLogo(logoCode)} alt="" width={14} height={14} className="inline-block shrink-0 object-contain" loading="lazy" />
                  )}
                  <span className="truncate">
                    {c ? (
                      <>
                        {c.team?.abbr ?? "FA"} · {c.pos ?? "—"}
                        {c.number ? ` · #${c.number}` : ""}
                        {c.bats && c.throws ? ` · B/T ${c.bats}/${c.throws}` : ""}
                      </>
                    ) : resolve.data ? (
                      <>{resolve.data.team ?? "—"} · {resolve.data.position ?? "—"}</>
                    ) : target.team ? (
                      <>{target.team}</>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="mt-1 text-[11px]">
                  {c?.status ? (
                    <span className={`font-bold ${TONE[c.status.tone] ?? "text-muted"}`}>● {c.status.description}</span>
                  ) : c ? (
                    <span className="text-faint">roster status not posted</span>
                  ) : noMatch ? (
                    <span className="font-bold text-gold">● no MLB match</span>
                  ) : (
                    <span className="text-faint">loading…</span>
                  )}
                  {c?.age != null && <span className="text-faint"> · age {c.age}</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-3">
              <div className="hidden grid-cols-3 gap-2 text-center sm:grid">
                {(c?.tiles ?? [{ label: "—", value: "—" }, { label: "—", value: "—" }, { label: "—", value: "—" }]).map((t, i) => (
                  <HeaderStat key={i} label={t.label} value={t.value} />
                ))}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-full border border-line-2 bg-white/[0.04] px-3 py-1.5 text-[12px] font-bold text-muted hover:text-text"
              >
                ✕
              </button>
            </div>
          </div>
          {/* the three tiles ride below the name on phones */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:hidden">
            {(c?.tiles ?? [{ label: "—", value: "—" }, { label: "—", value: "—" }, { label: "—", value: "—" }]).map((t, i) => (
              <HeaderStat key={i} label={t.label} value={t.value} />
            ))}
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          {noMatch ? (
            <EmptyNote
              text={`Couldn't match "${target.name}"${target.team ? ` (${target.team})` : ""} to an MLB player — the name on this row doesn't line up with the MLB Stats API roster list.`}
            />
          ) : card.isError || resolve.isError ? (
            <div className="rounded-xl border border-neg/30 bg-neg/5 px-4 py-4 text-[12px] text-neg">
              Couldn&apos;t load this profile: {(card.error ?? resolve.error)?.message}
            </div>
          ) : !c ? (
            <>
              <section>
                <SectionTitle>Stats — {new Date().getFullYear()} season</SectionTitle>
                <SkeletonRows rows={4} />
              </section>
              <section>
                <SectionTitle>Game log</SectionTitle>
                <SkeletonRows rows={8} />
              </section>
            </>
          ) : (
            <>
              {/* stats table: season + windows */}
              <section>
                <SectionTitle>Stats — {c.season} season · last 7 / 15 / 30 days</SectionTitle>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="text-left text-[9px] font-bold uppercase tracking-[0.12em] text-faint">
                        <th className="sticky left-0 z-10 bg-surface py-1.5 pr-2">Split</th>
                        {c.splitHeaders.map((h) => (
                          <th key={h} className="num px-1.5 py-1.5 text-right">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.splits.map((row) => (
                        <tr key={row.label} className="border-t border-white/[0.04] text-[11.5px]">
                          <td className="sticky left-0 z-10 bg-surface py-2 pr-2 font-semibold text-muted">{row.label}</td>
                          {row.cells ? (
                            row.cells.map((cell, i) => (
                              <td key={i} className="num px-1.5 py-2 text-right text-text">{cell}</td>
                            ))
                          ) : (
                            <td colSpan={c.splitHeaders.length} className="px-1.5 py-2 text-center text-faint">
                              no games in window
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* per-game chart */}
              <section>
                <SectionTitle>{c.chart.label}</SectionTitle>
                {c.chart.points.length > 0 ? (
                  <BarChart points={c.chart.points} />
                ) : (
                  <EmptyNote text="No games in the last 30 days." />
                )}
              </section>

              {/* game log */}
              <section>
                <SectionTitle>Game log</SectionTitle>
                {c.log.length === 0 ? (
                  <EmptyNote text={`No ${c.season} regular-season games in the MLB Stats API log.`} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px]">
                      <thead>
                        <tr className="text-left text-[9px] font-bold uppercase tracking-[0.12em] text-faint">
                          <th className="sticky left-0 z-10 bg-surface py-1.5 pr-2">Date</th>
                          <th className="py-1.5 pr-2">Opp</th>
                          {c.logHeaders.map((h) => (
                            <th key={h} className="num px-1.5 py-1.5 text-right">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {c.log.map((g) => (
                          <tr key={`${g.date}|${g.gamePk ?? ""}`} className="border-t border-white/[0.04] text-[11.5px]">
                            <td className="sticky left-0 z-10 bg-surface num py-2 pr-2 text-[10.5px] text-faint">{dateLabel(g.date)}</td>
                            <td className="py-2 pr-2 text-[11px] font-semibold text-muted">
                              {g.opp}
                              {g.win != null && (
                                <span className={`ml-1 text-[9px] font-bold ${g.win ? "text-pos" : "text-neg"}`}>{g.win ? "W" : "L"}</span>
                              )}
                            </td>
                            {g.cells.map((cell, i) => (
                              <td key={i} className="num px-1.5 py-2 text-right text-text">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          <p className="pb-1 text-[10px] leading-relaxed text-faint">
            Stats via MLB Stats API. Informational only.
          </p>
        </div>
      </div>
    </div>
  );
}

function dateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((w) => Array.from(w).find((ch) => /\p{L}/u.test(ch)) ?? "")
    .filter(Boolean);
  const first = letters[0] ?? "";
  const last = letters.length > 1 ? letters[letters.length - 1] : "";
  return (first + last).toUpperCase() || "•";
}

/** MLB's official headshot by personId, initials on a miss. */
function PlayerPhoto({ id, name, size }: { id: number; name: string; size: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-bold text-faint"
        style={{ width: size, height: size, fontSize: size * 0.34 }}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={headshotUrl(id)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full bg-surface-3 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[64px] rounded-xl bg-white/[0.03] px-2 py-2">
      <div className="num text-[15px] font-bold leading-tight text-text">{value}</div>
      <div className="mt-0.5 text-[7.5px] font-bold uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">{children}</div>;
}

function EmptyNote({ text }: { text: string }) {
  return <div className="rounded-xl bg-white/[0.03] px-4 py-5 text-center text-[12px] text-muted">{text}</div>;
}

/** Compact bar chart of one per-game count (chronological), Roster Lab's style. */
function BarChart({ points }: { points: ChartPoint[] }) {
  const vals = points.map((p) => p.v);
  const max = Math.max(4, ...vals);
  const W = 560;
  const H = 72;
  const bw = W / Math.max(1, vals.length);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full min-w-[320px]" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {vals.map((v, i) => {
          const h = (v / max) * (H - 4);
          return (
            <rect
              key={i}
              x={i * bw + bw * 0.15}
              y={H - Math.max(h, v === 0 ? 1 : 2)}
              width={bw * 0.7}
              height={Math.max(h, v === 0 ? 1 : 2)}
              rx="1.5"
              fill={v > 0 ? "var(--color-pos)" : "rgba(255,255,255,0.15)"}
              fillOpacity={v > 0 ? 0.75 : 1}
            >
              <title>{`${points[i].date}: ${v}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="num mt-1 flex justify-between text-[9px] text-faint">
        <span>{dateLabel(points[0].date)}</span>
        <span>{dateLabel(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
