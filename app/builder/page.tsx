"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { EvBadge } from "@/components/ui/EvBadge";
import { OddsCell } from "@/components/ui/OddsCell";
import { EmptyState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { useBoard } from "@/lib/useBoard";
import { UfcBuilder } from "@/components/ufc/UfcBuilder";
import { AsgBuilderTab } from "@/components/allstar/AllStarSurfaces";
import { ASG_ENABLED, UFC_ENABLED } from "@/lib/features";
import { getEngine, getMoney, setMoney, todayStr } from "@/lib/engine-client";
import { fmtMoney, fmtAmerican, fmtPct } from "@/lib/format";
import type { PickRow, Ticket } from "@/engine";

/* ---------- engine card types ---------- */
type CardPick = { id: string; stake: number; kelly?: number | null; tier?: number; w: { pl: Ticket & { tier?: string; fair?: string } } };
type CardCalc = {
  pool: unknown[];
  alloc: { picks: CardPick[]; sum: number; ev: number; legs: Record<string, number>; noPlay?: boolean; overrode?: boolean };
  fun: { picks: CardPick[]; sum: number };
  kellyDaily: number;
  dailyCap: number;
  enteredDaily: number;
  overrode: boolean;
};
type LockedEntry = {
  date: string;
  locked: boolean;
  lateLock?: boolean;
  overrode?: boolean;
  daily: number;
  fun: number;
  cardEv?: number;
  games: Record<string, { pk: number | null; start: string }>;
  core: LockedTicket[];
  funT: LockedTicket[];
  grading?: { tickets: Record<string, { result: string; payout: number }> } | null;
};
type LockedTicket = {
  id: string;
  bucket: string;
  name: string;
  tier?: string;
  stake: number;
  czOdds?: string | number;
  prob?: number;
  czEv?: number | null;
  confirmed?: number | null;
  legs: { label: string; prop: string; cz?: number | null; gkey?: string | null }[];
};

function MoneyInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
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
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="num w-16 bg-transparent text-[14px] font-semibold text-text outline-none disabled:opacity-40"
      />
    </label>
  );
}

function TicketCard({ t, stake, kelly, grade }: { t: Ticket & { tier?: string }; stake: number; kelly?: number | null; grade?: { result: string; payout: number } }) {
  /* upgrade 01: surface the ¼-Kelly stake whenever the allocator diverges from it by >2×
     either way — "allocator $49 · Kelly $11" is the tell that the entered daily, not the
     edge, is driving the size */
  const kellyGap = kelly != null && (stake > 2 * kelly || kelly > 2 * stake);
  return (
    <div className={`glass px-4 py-3 ${Number(t.czEv) > 0 ? "ev-glow" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-text">{t.name}</div>
        <div className="flex items-center gap-2">
          <span className="num rounded-full border border-pos/50 bg-pos/10 px-2.5 py-0.5 text-[12px] font-bold text-pos">
            {fmtMoney(stake)}
          </span>
          {kellyGap && (
            <span
              className="num rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold"
              title="¼-Kelly stake at this ticket's probability and Caesars price (2%-of-bankroll cap) — the bankroll-growth-consistent size"
            >
              Kelly {fmtMoney(kelly)}
            </span>
          )}
          <OddsCell odds={(t.czOdds ?? "") as never} book="caesars" />
          {t.czEv != null && <EvBadge ev={Number(t.czEv)} />}
          {grade && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                grade.result === "won"
                  ? "border-pos/40 bg-pos/10 text-pos"
                  : grade.result === "lost"
                    ? "border-neg/40 bg-neg/10 text-neg"
                    : "border-line-2 bg-surface-2 text-muted"
              }`}
            >
              {grade.result}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {t.legs.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="text-muted">
              <span className="text-text">{l.label}</span> {l.prop}
              {(l as { lu?: string }).lu === "projected" && (
                <span
                  className="ml-1.5 rounded-full border border-gold/40 bg-gold/10 px-1.5 py-px text-[8.5px] font-bold text-gold"
                  title="Lineup not posted yet — projected everyday starter; Caesars auto-voids the leg if he sits"
                >
                  PROJ
                </span>
              )}
            </span>
            {l.cz != null && <span className="num shrink-0 text-gold">{fmtAmerican(Number(l.cz))}</span>}
          </div>
        ))}
      </div>
      {t.prob != null && (
        <div className="num mt-2 text-[10.5px] text-faint">
          {Number(t.prob).toFixed(1)}% to hit ≈ 1 in {Math.max(1, Math.round(100 / Math.max(Number(t.prob), 0.01)))} slates
        </div>
      )}
    </div>
  );
}

export default function BuilderPage() {
  const { data: board } = useBoard();
  const [money, setMoneyState] = useState({ daily: 0, fun: 0, bankroll: 750 });
  const [cardV, setCardV] = useState(0);
  const [status, setStatus] = useState("");
  const [slip, setSlip] = useState<PickRow[]>([]);
  const [query, setQuery] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // localStorage only after mount — an initializer read would diverge from the
  // server's "mlb" and trip a hydration mismatch
  const [sport, setSport] = useState<"mlb" | "ufc" | "asg">("mlb");
  useEffect(() => {
    try {
      const s = localStorage.getItem("pl_builder_sport");
      if (UFC_ENABLED && s === "ufc") setSport("ufc");
      else if (ASG_ENABLED && s === "asg") setSport("asg");
    } catch { /* fresh device */ }
  }, []);
  const pickSport = (s: "mlb" | "ufc" | "asg") => {
    setSport(s);
    try { localStorage.setItem("pl_builder_sport", s); } catch {}
  };

  useEffect(() => setMoneyState(getMoney()), []);

  const eng = typeof window !== "undefined" ? getEngine() : null;
  const d = board?.data;

  const locked: LockedEntry | null = useMemo(() => {
    if (!eng) return null;
    void cardV;
    const e = eng.get<(dt: string) => LockedEntry | null>("shLedgerFind")(todayStr());
    return e?.locked ? e : null;
  }, [eng, cardV]);

  const card: CardCalc | null = useMemo(() => {
    if (!eng || !d || locked) return null;
    void cardV;
    return eng.get<(x: unknown) => CardCalc | null>("shCardCalc")(d);
  }, [eng, d, cardV, locked]);

  const updateMoney = useCallback((patch: Partial<typeof money>) => {
    setMoneyState((m) => {
      const next = { ...m, ...patch };
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        setMoney(patch);
        setCardV((v) => v + 1);
      }, 300);
      return next;
    });
  }, []);

  const lock = () => {
    if (!eng) return;
    eng.get<() => void>("shLockCard")();
    const e = eng.get<(dt: string) => LockedEntry | null>("shLedgerFind")(todayStr());
    if (e?.locked) {
      setStatus(`Card locked — $${e.core.concat(e.funT).reduce((s, t) => s + t.stake, 0)} recorded. Grades post as games go final.`);
    } else {
      setStatus("Lock didn't take — set a DAILY $ or FUN $ amount and make sure today's board is generated.");
    }
    setCardV((v) => v + 1);
  };

  const confirmPrice = (tid: string, val: string) => {
    if (!eng) return;
    eng.get<(id: string, v: string) => void>("shConfirmPrice")(tid, val);
    setCardV((v) => v + 1);
  };

  /* ---------- manual slip ---------- */
  const playable: PickRow[] = useMemo(() => {
    if (!d) return [];
    const seen = new Set<string>();
    return Object.entries(d.categories)
      .filter(([k]) => k !== "all")
      .flatMap(([, v]) => v)
      .filter((r) => {
        const k = `${r.label}|${r.sub}`;
        if (r.cz == null || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }, [d]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return playable
      .filter((r) => `${r.label} ${r.sub}`.toLowerCase().includes(q) && !slip.some((s) => s.label === r.label && s.sub === r.sub))
      .slice(0, 6);
  }, [query, playable, slip]);

  const slipCalc = useMemo(() => {
    if (slip.length < 1) return null;
    const amToDec = (am: number) => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);
    let p = 1;
    let dec = 1;
    for (const r of slip) {
      p *= (Number(r.prob) || 0) / 100;
      const cz = Number(String(r.czOdds).replace(/[^\d.-]/g, ""));
      dec *= amToDec(cz);
    }
    const fairDec = p > 0 ? 1 / p : null;
    const ev = p * dec - 1;
    const kelly = eng ? eng.get<(pp: number, dd: number) => number>("shKelly")(p, dec) : 0;
    const stake = Math.round(Math.min(0.02, kelly / 4) * money.bankroll);
    const games = slip.map((r) => String((r as { game?: string }).game ?? "")).filter(Boolean);
    const sameGame = new Set(games).size < games.length;
    return { p, dec, fairDec, ev, stake, sameGame };
  }, [slip, eng, money.bankroll]);

  const decToAm = (dc: number) => (dc >= 2 ? Math.round((dc - 1) * 100) : -Math.round(100 / (dc - 1)));

  /* morning honesty: how many slate games have Caesars-playable props RIGHT NOW —
     games missing here are why an early card can't cover them yet */
  const czCover = useMemo(() => {
    if (!d) return null;
    const total = Object.keys(d.gameInfo ?? {}).length;
    if (!total) return null;
    const have = new Set<string>();
    for (const [k, rows] of Object.entries(d.categories)) {
      if (k === "all" || k === "ml" || k === "rl") continue;
      for (const r of rows) if (r.gkey && r.cz != null) have.add(String(r.gkey));
    }
    return { have: have.size, total };
  }, [d]);

  return (
    <>
      <PageHeader
        title="Builder"
        sub={
          sport === "ufc"
            ? "UFC — build any parlay from the card's Caesars moneylines, priced against market consensus"
            : sport === "asg"
            ? "All-Star Game — a sized card of STRAIGHT bets (Caesars NV takes no ASG parlays)"
            : "Exact-sum daily card from the engine's allocator, the FUN bucket, and a manual slip — all priced at Caesars"
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
        <UfcBuilder />
      ) : sport === "asg" ? (
        <AsgBuilderTab />
      ) : (
        <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <MoneyInput label="Daily" value={money.daily} onChange={(n) => updateMoney({ daily: n })} disabled={!!locked} />
        <MoneyInput label="Fun" value={money.fun} onChange={(n) => updateMoney({ fun: n })} disabled={!!locked} />
        <MoneyInput label="Bankroll" value={money.bankroll} onChange={(n) => updateMoney({ bankroll: n })} />
        {!locked && (
          <Pill variant="gold" onClick={lock} disabled={!card || (card.alloc.picks.length === 0 && card.fun.picks.length === 0)}>
            🔒 Lock card
          </Pill>
        )}
      </div>
      {status && <div className="mb-4 text-[12px] text-pos">{status}</div>}
      {!locked && czCover && (
        <div className={`num mb-4 text-[11.5px] ${czCover.have < czCover.total ? "text-gold" : "text-muted"}`}>
          Caesars props live for {czCover.have} of {czCover.total} games right now
          {czCover.have < czCover.total &&
            " — the rest usually post closer to first pitch. If you're generating early, regenerate right before locking so the card can cover the whole day."}
        </div>
      )}

      {locked ? (
        <Reveal>
          <Panel
            title={`Today's card — LOCKED${locked.lateLock ? " (after first pitch, flagged)" : ""}${locked.overrode ? " · override day" : ""}`}
            className="glow-gold"
          >
            <div className="mb-3 text-[11.5px] text-muted">
              ${locked.core.concat(locked.funT).reduce((s, t) => s + t.stake, 0)} across{" "}
              {locked.core.length + locked.funT.length} tickets · append-only, no retroactive edits. Confirm the NV
              app&apos;s price on any ticket until its first pitch.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {locked.core.concat(locked.funT).map((t) => {
                const started = t.legs.some((l) => {
                  const gi = l.gkey ? locked.games[l.gkey] : null;
                  return gi?.start && new Date(gi.start).getTime() <= Date.now();
                });
                return (
                  <div key={t.id}>
                    <TicketCard
                      t={{ name: t.name, legs: t.legs, czOdds: t.czOdds, czEv: t.czEv ?? null, prob: t.prob } as never}
                      stake={t.stake}
                      grade={locked.grading?.tickets?.[t.id]}
                    />
                    {!started && !locked.grading?.tickets?.[t.id] && (
                      <div className="mt-1.5 flex items-center gap-2 px-1">
                        <span className="text-[10px] uppercase tracking-wide text-faint">NV price</span>
                        <input
                          defaultValue={t.confirmed ?? ""}
                          placeholder={String(t.czOdds ?? "")}
                          onBlur={(e) => e.target.value && confirmPrice(t.id, e.target.value)}
                          className="num w-20 rounded-full border border-line-2 bg-surface-2 px-2.5 py-1 text-[11px] text-gold outline-none focus:border-gold/60"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </Reveal>
      ) : !d ? (
        <Panel>
          <EmptyState title="Generate today's board first" body="The card allocates across tickets the engine already produced — open the Board tab and generate, then come back." />
        </Panel>
      ) : !card || (money.daily === 0 && money.fun === 0) ? (
        <Panel>
          <EmptyState
            title="Enter a DAILY $ (and optional FUN $)"
            body="DAILY spreads across at least 4 tickets — max 25% on any one, never HR props, K's parlays only as last-resort fill (capped 15%), never past +1400, never the same pick twice. FUN buys 1–3 honest longshots."
          />
        </Panel>
      ) : (
        <div className="space-y-5">
          {/* upgrade 01: NO-PLAY is a first-class result — $0 recommended, staking takes an explicit override */}
          {card.alloc.noPlay && money.daily > 0 && (
            <Panel>
              <div className="space-y-3 py-2 text-center">
                <div className="text-[15px] font-semibold text-text">No positive-EV core card at Caesars today</div>
                <div className="text-[12px] text-muted">
                  Recommended stake <span className="num font-bold text-text">$0</span>. Zero edge means zero stake — passing is a
                  position, and it costs nothing. Fun bucket unaffected.
                </div>
                <Pill
                  variant="ghost"
                  onClick={() => {
                    eng?.get<(on: boolean) => void>("shSetOverride")(true);
                    setCardV((v) => v + 1);
                  }}
                >
                  Allocate anyway (tracked as an override)
                </Pill>
              </div>
            </Panel>
          )}

          {card.overrode && (
            <div className="flex items-center justify-between rounded-(--radius-panel) border border-neg/40 bg-neg/10 px-4 py-3 text-[12px] text-neg">
              <span>
                Override active — no ticket cleared breakeven EV, allocating anyway. The ledger stamps this day and tracks
                override P/L separately.
              </span>
              <button
                className="shrink-0 font-semibold underline"
                onClick={() => {
                  eng?.get<(on: boolean) => void>("shSetOverride")(false);
                  setCardV((v) => v + 1);
                }}
              >
                Undo
              </button>
            </div>
          )}

          {card.alloc.ev != null && card.alloc.ev <= 0 && card.alloc.picks.length > 0 && !card.overrode && (
            <div className="rounded-(--radius-panel) border border-gold/40 bg-gold/10 px-4 py-3 text-[12px] text-gold">
              Model suggests reduced action today: slate EV ≈ {card.alloc.ev.toFixed(1)}%. Allocating{" "}
              {fmtMoney(card.alloc.sum)} as requested.
            </div>
          )}

          {card.alloc.picks.length > 0 && (
            <Reveal>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Today&apos;s card · {fmtMoney(card.alloc.sum)} across {card.alloc.picks.length} tickets
                </h2>
                <span className="num flex items-center gap-3 text-[11px] text-muted">
                  <span>entered {fmtMoney(card.enteredDaily)}</span>
                  <span title="Sum of each ticket's ¼-Kelly stake (2%-of-bankroll cap per ticket) — the bankroll-math-consistent daily">
                    Kelly-consistent <b className="text-text">{fmtMoney(card.kellyDaily)}</b>
                  </span>
                  <span>
                    card EV <EvBadge ev={card.alloc.ev} />
                  </span>
                </span>
              </div>
              {card.enteredDaily > card.dailyCap && (
                <div className="mb-2 text-[11px] text-gold">
                  Daily capped at 10% of bankroll: allocating {fmtMoney(card.dailyCap)} of the {fmtMoney(card.enteredDaily)} entered.
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {card.alloc.picks.map((p) => (
                  <TicketCard key={p.id} t={p.w.pl} stake={p.stake} kelly={p.kelly} />
                ))}
              </div>
            </Reveal>
          )}

          {card.fun.picks.length > 0 && (
            <Reveal>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                FUN money · {fmtMoney(card.fun.sum)} — high variance, most days lose, tracked separately
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {card.fun.picks.map((p) => (
                  <TicketCard key={p.id} t={p.w.pl} stake={p.stake} />
                ))}
              </div>
            </Reveal>
          )}
        </div>
      )}

      {/* ---------- manual slip ---------- */}
      <Reveal>
        <Panel title="Manual slip — combine any playable picks" className="mt-6">
          {!d ? (
            <div className="text-[12px] text-muted">Generate the board to search picks.</div>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a player or market…"
                className="w-full rounded-full border border-line-2 bg-surface-2 px-4 py-2.5 text-[13px] text-text outline-none focus:border-pos/50"
              />
              {results.length > 0 && (
                <div className="mt-2 space-y-1">
                  {results.map((r) => (
                    <button
                      key={`${r.label}|${r.sub}`}
                      onClick={() => {
                        setSlip((s) => [...s, r]);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.05]"
                    >
                      <span>
                        <span className="text-text">{r.label}</span> <span className="text-muted">{r.sub}</span>
                      </span>
                      <span className="num text-gold">{String(r.czOdds)}</span>
                    </button>
                  ))}
                </div>
              )}
              {slip.length > 0 && (
                <div className="mt-4 space-y-2">
                  {slip.map((r, i) => (
                    <div key={`${r.label}|${r.sub}`} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span>
                        <span className="text-text">{r.label}</span> <span className="text-muted">{r.sub}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="num text-gold">{String(r.czOdds)}</span>
                        <button
                          onClick={() => setSlip((s) => s.filter((_, j) => j !== i))}
                          aria-label="remove"
                          className="rounded-full px-2 text-muted hover:text-neg"
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  ))}
                  {slipCalc && slip.length >= 2 && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.05] pt-3">
                      <span className="num text-[13px] text-text">
                        {fmtPct(slipCalc.p)} true · <span className="text-gold">{fmtAmerican(decToAm(slipCalc.dec))}</span> @ CZR
                      </span>
                      {slipCalc.fairDec && (
                        <span className="num text-[12px] text-muted">fair {fmtAmerican(decToAm(slipCalc.fairDec))}</span>
                      )}
                      <EvBadge ev={slipCalc.ev * 100} />
                      {slipCalc.stake > 0 && (
                        <span className="num text-[12px] text-muted">¼-Kelly {fmtMoney(slipCalc.stake)}</span>
                      )}
                      {slipCalc.sameGame && (
                        <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold">
                          ⚠ same-game legs — outcomes correlated, EV shown assumes independence
                        </span>
                      )}
                      <Pill variant="ghost" onClick={() => setSlip([])} className="!px-3 !py-1 text-[11px]">
                        Clear
                      </Pill>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Panel>
      </Reveal>

      <div className="mt-4 text-[10.5px] text-faint">
        Card discipline is hard-coded: at least 4 tickets whenever the pool allows with no ticket over 25% of the
        daily, one prop never rides two tickets, HR props parlay only with HR props and never into the core card,
        Pitcher K&apos;s parlays are last-resort fill only (capped at 15% — they went 0-for-4 as lead tickets), and
        the daily amount always sums exactly. Informational only, not betting advice.
      </div>
        </>
      )}
    </>
  );
}
