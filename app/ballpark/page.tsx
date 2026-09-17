"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { FilterPill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { logoFor, startLabel } from "@/components/games/logo";
import { useSport } from "@/lib/sport";
import { PARK_DAILY, type BallparkPayload, type ParkCard, type ParkMarkets } from "@/lib/mlb/ballpark";

/* BALLPARK FACTOR (INSTRUCTION 68, 2026-09-17, Josh's word, verbatim: "There should be a tab
   titled 'Ballpark Factor' that shows daily ballpark factor for every stadium that is being
   used in the engine to calculate bets. The engine should obviously know but it should take
   into account temperature, elevation, wind mph, wind in/out/left/right, etc").

   Every stadium the engine prices at, today: the parks with a game first (by first pitch),
   the idle parks after. Each card shows the inputs the engine reads — temperature, wind mph
   and direction, roof, elevation, the Savant season index — and the multiplier it puts on
   every market (HR, hits, total bases, H+R+RBI, runs, pitcher K's, outs). These are the
   engine's own numbers (src/lib/mlb/ballpark.ts is what the engine hook runs), never a
   second model. A game whose weather MLB has not posted yet says so and shows the season
   index alone; the multipliers fill in when the weather posts (usually 1–3 h before first
   pitch). Refetches every 5 minutes. */

const MARKETS: { key: keyof Omit<ParkMarkets, "index">; label: string; hitter: boolean }[] = [
  { key: "hr", label: "HR", hitter: true },
  { key: "hits", label: "Hits", hitter: true },
  { key: "tb", label: "TB", hitter: true },
  { key: "hrr", label: "H+R+RBI", hitter: true },
  { key: "runs", label: "Runs", hitter: true },
  { key: "k", label: "K's", hitter: false },
  { key: "outs", label: "Outs", hitter: false },
];

/** ×1.08 in lime, ×0.94 in red, ×1.00 muted */
function Mult({ v, strong = false }: { v: number; strong?: boolean }) {
  const d = v - 1;
  const tone = Math.abs(d) < 0.005 ? "text-muted" : d > 0 ? "text-pos" : "text-neg";
  return (
    <span className={`num tabular-nums ${tone} ${strong ? "text-[15px] font-bold" : "text-[12.5px] font-semibold"}`}>
      ×{v.toFixed(strong ? 3 : 2)}
    </span>
  );
}

const fmtIdx = (x: number | null | undefined) => (x == null ? "—" : String(Math.round(x)));

function WindGlyph({ dir }: { dir: ParkCard["env"]["wind"]["dir"] }) {
  const glyph = dir === "out" ? "↑" : dir === "in" ? "↓" : dir === "cross" ? "↔" : dir === "varies" ? "↺" : "·";
  const tone = dir === "out" ? "text-pos" : dir === "in" ? "text-neg" : "text-muted";
  return <span className={`${tone} text-[14px] leading-none`}>{glyph}</span>;
}

function leanLabel(lean: number): { txt: string; cls: string } {
  if (lean >= 0.5) return { txt: "Hitter's park today", cls: "border-pos/40 bg-pos/10 text-pos" };
  if (lean >= 0.15) return { txt: "Leans hitters", cls: "border-pos/30 bg-pos/5 text-pos" };
  if (lean <= -0.5) return { txt: "Pitcher's park today", cls: "border-neg/40 bg-neg/10 text-neg" };
  if (lean <= -0.15) return { txt: "Leans pitchers", cls: "border-neg/30 bg-neg/5 text-neg" };
  return { txt: "Neutral", cls: "border-line-2 bg-white/[0.03] text-muted" };
}

function Card({ c, side }: { c: ParkCard; side: "R" | "L" }) {
  const m = c[side];
  const g = c.game;
  const l = leanLabel(c.lean);
  const posted = c.env.weatherPosted;
  return (
    <section className="glass overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.05] px-4 py-3">
        {c.park && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoFor(c.park.abbr)} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-text">{c.venue}</div>
          <div className="truncate text-[11px] text-muted">
            {c.park ? `${c.park.city} · ${c.park.elevationFt.toLocaleString("en-US")} ft · ${c.park.roof === "dome" ? "dome" : c.park.roof === "retractable" ? "retractable roof" : "open air"}` : "not in the stadium table"}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${l.cls}`}>{l.txt}</span>
      </header>
      <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <div className="space-y-2">
          {g ? (
            <div className="flex items-center gap-2 text-[12.5px] text-text">
              {g.awayAbbr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoFor(g.awayAbbr)} alt="" className="h-5 w-5 object-contain" loading="lazy" />
              )}
              <span className="font-semibold">{g.away}</span>
              <span className="text-muted">@</span>
              {g.homeAbbr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoFor(g.homeAbbr)} alt="" className="h-5 w-5 object-contain" loading="lazy" />
              )}
              <span className="font-semibold">{g.home}</span>
              <span className="ml-auto text-[11px] text-muted">{g.start ? startLabel(g.start) : ""}</span>
            </div>
          ) : (
            <div className="text-[12px] text-muted">No game here today — season index only.</div>
          )}
          {g && (g.awayPitcher || g.homePitcher) && (
            <div className="text-[11px] text-muted">
              {g.awayPitcher ?? "TBD"} vs {g.homePitcher ?? "TBD"}
            </div>
          )}
          <dl className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
              <dt className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">Temp</dt>
              <dd className="mt-0.5 flex items-baseline justify-between">
                <span className="num text-[13px] font-semibold text-text">{c.env.tempF != null ? `${c.env.tempF}°F` : posted ? "—" : "not posted"}</span>
                <Mult v={c.env.terms.temp} />
              </dd>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
              <dt className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">Wind</dt>
              <dd className="mt-0.5 flex items-baseline justify-between gap-1">
                <span className="num flex items-center gap-1 text-[13px] font-semibold text-text">
                  <WindGlyph dir={c.env.wind.dir} />
                  {c.env.roofClosed ? "roof closed" : c.env.wind.raw ? `${c.env.wind.mph} mph ${c.env.wind.dir === "out" ? `out${c.env.wind.toward ? " to " + c.env.wind.toward : ""}` : c.env.wind.dir === "in" ? `in${c.env.wind.toward ? " from " + c.env.wind.toward : ""}` : c.env.wind.dir}` : posted ? "—" : "not posted"}
                </span>
                <Mult v={c.env.terms.wind} />
              </dd>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
              <dt className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">Elevation</dt>
              <dd className="mt-0.5 flex items-baseline justify-between">
                <span className="num text-[13px] font-semibold text-text">{c.park ? `${c.park.elevationFt.toLocaleString("en-US")} ft` : "—"}</span>
                <Mult v={c.env.terms.elevation} />
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span>
              Conditions: <span className="text-text">{c.weather?.condition ?? (g ? "not posted yet" : "—")}</span>
            </span>
            <span>
              Env ×<span className="num font-semibold text-text">{c.env.f.toFixed(3)}</span> on HR
            </span>
            <span>
              Season index ({side}HB): HR {fmtIdx(m.index?.hr)} · H {fmtIdx(m.index?.hits)} · R {fmtIdx(m.index?.runs)} · K {fmtIdx(m.index?.k)}
              {m.index ? "" : " (park not in this season's Savant table)"}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5 md:grid-cols-7">
          {MARKETS.map((mk) => (
            <div key={mk.key} className="flex flex-col items-center rounded-lg border border-white/[0.06] bg-white/[0.02] px-1 py-2">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">{mk.label}</span>
              <Mult v={m[mk.key]} strong />
              <span className="text-[9px] text-faint">{mk.hitter ? "batter" : "pitcher"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function BallparkPage() {
  const sport = useSport();
  const [side, setSide] = useState<"R" | "L">("R");
  const [scope, setScope] = useState<"today" | "all">("today");
  const q = useQuery<BallparkPayload>({
    queryKey: ["mlb-ballpark"],
    queryFn: async () => {
      const r = await fetch("/api/mlb/ballpark");
      if (!r.ok) throw new Error(`ballpark ${r.status}`);
      return (await r.json()) as BallparkPayload;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    enabled: sport === "mlb",
  });
  const cards = useMemo(() => {
    const all = q.data?.cards ?? [];
    return scope === "today" ? all.filter((c) => c.game) : all;
  }, [q.data, scope]);
  const posted = useMemo(() => (q.data?.cards ?? []).filter((c) => c.game && c.env.weatherPosted).length, [q.data]);

  if (sport !== "mlb") {
    return (
      <div className="mx-auto max-w-[1180px]">
        <PageHeader title="Ballpark Factor" sub="An MLB desk page — flip the switch to MLB." />
        <EmptyState title="Ballpark Factor is MLB-only" body="Stadium weather, wind and elevation feed the MLB engine. Switch the desk to MLB to see today's parks." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Ballpark Factor"
        eyebrow="MLB · daily park environment"
        sub={
          q.data
            ? `${q.data.date} · ${q.data.games} game${q.data.games === 1 ? "" : "s"} · weather posted for ${posted} · season index ${q.data.priorsSeason ?? "—"}${q.data.priorsAt ? ` (built ${q.data.priorsAt.slice(0, 10)})` : ""}`
            : "Every stadium the engine prices at, with today's temperature, wind and elevation."
        }
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill selected={scope === "today"} onClick={() => setScope("today")}>Today&apos;s parks</FilterPill>
            <FilterPill selected={scope === "all"} onClick={() => setScope("all")}>All 30</FilterPill>
            <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
            <FilterPill selected={side === "R"} onClick={() => setSide("R")}>RHB</FilterPill>
            <FilterPill selected={side === "L"} onClick={() => setSide("L")}>LHB</FilterPill>
          </div>
        }
      />
      {q.isLoading && <SkeletonRows rows={8} />}
      {q.isError && <ErrorState title="Couldn't load the parks" body={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !q.data.scheduleOk && (
        <div className="mb-3 rounded-lg border border-neg/30 bg-neg/5 px-3 py-2 text-[12px] text-neg">MLB&apos;s schedule feed did not answer — showing season indices only, no weather.</div>
      )}
      {q.data && cards.length === 0 && (
        <EmptyState title="No games today" body="Switch to All 30 to see every park's season index and elevation." />
      )}
      <div className="grid gap-3">
        {cards.map((c, i) => (
          <Reveal key={c.venue} delay={Math.min(i, 8) * 0.03}>
            <Card c={c} side={side} />
          </Reveal>
        ))}
      </div>
      {q.data && (
        <Panel title="How the engine reads a park" className="mt-4">
          <div className="space-y-1.5 text-[12px] leading-relaxed text-muted">
            <p>
              <span className="text-text">Season index</span> — Savant&apos;s park factor by batter side (100 = neutral), damped {Math.round(PARK_DAILY.parkDamp * 100)}% because one season is noisy.
              It already averages a park&apos;s climate and altitude.
            </p>
            <p>
              <span className="text-text">Today&apos;s environment</span> multiplies on top: temperature {PARK_DAILY.tempPerDegF * 100}% per °F over {PARK_DAILY.tempAnchorF}; wind {PARK_DAILY.windPerMph * 100}% per mph blowing out (minus when in; corners count {PARK_DAILY.cornerWeight}, cross winds 0, roof closed 0);
              elevation {PARK_DAILY.elevPerKft * 100}% per 1,000 ft of carry. HR takes the full product; total bases half of it; hits a quarter. Pitcher K&apos;s and outs take the inverse trim, outs also the park&apos;s run environment.
            </p>
            <p>Every multiplier is clamped and printed here exactly as the engine applies it to the board, the Builder and the parlay generator. No weather posted yet means the season index stands alone until MLB posts it.</p>
          </div>
        </Panel>
      )}
    </div>
  );
}
