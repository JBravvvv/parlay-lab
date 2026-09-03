"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { TEAM_ABBR, type PvtPitcher, type PvtResponse, type PvtRow } from "@/lib/pvt";

/**
 * Pitcher vs Team (2026-09-03). Pick any active pitcher and any club; every
 * active hitter on that roster shows his career line against that pitcher,
 * straight from the MLB Stats API via /api/pvt. Rates are MLB's own; the team
 * line is recomputed from the summed counts. Informational only.
 */

const STALE = 30 * 60 * 1000;
const TEAMS = Object.entries(TEAM_ABBR).map(([id, abbr]) => ({ id: Number(id), abbr })).sort((a, b) => a.abbr.localeCompare(b.abbr));

const f3 = (v: number | null) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));
const fi = (r: PvtRow, k: StatKey) => (r.pa > 0 ? String(r[k]) : "—");
const slash = (t: { avg: number | null; obp: number | null; slg: number | null }) => `${f3(t.avg)}/${f3(t.obp)}/${f3(t.slg)}`;
const opsTone = (ops: number | null, pa: number) =>
  ops == null ? "text-faint" : ops >= 0.9 ? "text-pos font-semibold" : ops <= 0.6 && pa >= 10 ? "text-neg" : "";

const inputCls =
  "w-full rounded-full border border-line-2 bg-white/[0.03] px-4 py-2 text-[13px] text-text outline-none transition-colors placeholder:text-faint focus:border-pos/60";
const selectCls =
  "rounded-full border border-line-2 bg-white/[0.03] px-3 py-2 text-[12.5px] font-semibold text-text outline-none transition-colors focus:border-pos/60";

type StatKey = Exclude<keyof PvtRow, "id" | "name" | "pos">;
const COLS: { k: StatKey; l: string; rate?: boolean }[] = [
  { k: "g", l: "G" }, { k: "pa", l: "PA" }, { k: "ab", l: "AB" }, { k: "h", l: "H" }, { k: "hr", l: "HR" },
  { k: "rbi", l: "RBI" }, { k: "bb", l: "BB" }, { k: "k", l: "K" },
  { k: "avg", l: "AVG", rate: true }, { k: "obp", l: "OBP", rate: true }, { k: "slg", l: "SLG", rate: true }, { k: "ops", l: "OPS", rate: true },
];

function PitcherPicker({ pitchers, value, onPick }: { pitchers: PvtPitcher[]; value: PvtPitcher | null; onPick: (p: PvtPitcher | null) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) return [];
    return pitchers.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase() === q).slice(0, 8);
  }, [pitchers, text]);

  useEffect(() => {
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);

  const choose = (p: PvtPitcher) => { onPick(p); setText(""); setOpen(false); };

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate rounded-full border border-pos/50 bg-pos/10 px-4 py-2 text-[13px] font-semibold text-text">
          {value.name} <span className="text-muted">· {value.team}</span>
        </span>
        <Pill variant="ghost" className="px-3 py-1.5 text-[11.5px]" onClick={() => onPick(null)} aria-label="Change pitcher">✕</Pill>
      </div>
    );
  }
  return (
    <div ref={box} className="relative">
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && hits[hi]) { e.preventDefault(); choose(hits[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="⌕ Pitcher — type a name…"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-autocomplete="list"
        autoComplete="off"
        className={inputCls}
      />
      {open && text.trim().length >= 2 && (
        <ul role="listbox" className="glass absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-auto rounded-[14px] py-1">
          {hits.length === 0 ? (
            <li className="px-4 py-2 text-[12px] text-muted">No active pitcher matches</li>
          ) : hits.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === hi}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(p); }}
              className={`cursor-pointer px-4 py-2 text-[13px] ${i === hi ? "bg-white/[0.07] text-text" : "text-muted"}`}
            >
              {p.name} <span className="text-faint">· {p.team}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PitcherVsTeam() {
  const [pitcher, setPitcher] = useState<PvtPitcher | null>(null);
  const [team, setTeam] = useState<number | "">("");

  const pitchers = useQuery<{ pitchers: PvtPitcher[] }>({
    queryKey: ["pvt", "pitchers"],
    queryFn: async () => {
      const r = await fetch("/api/pvt?pitchers=1");
      if (!r.ok) throw new Error(`pitchers ${r.status}`);
      return r.json();
    },
    staleTime: STALE,
  });

  const ready = pitcher != null && team !== "";
  const q = useQuery<PvtResponse>({
    queryKey: ["pvt", pitcher?.id, team],
    queryFn: async () => {
      const r = await fetch(`/api/pvt?pitcher=${pitcher!.id}&team=${team}`);
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
      return body as PvtResponse;
    },
    enabled: ready,
    staleTime: STALE,
  });

  const teamAbbr = team === "" ? "" : TEAM_ABBR[team];
  const lastName = pitcher?.name.split(" ").slice(-1)[0] ?? "";

  return (
    <Reveal>
      <Panel title="Pitcher vs Team" className="mb-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          {pitchers.isPending ? (
            <Skeleton className="h-[38px] rounded-full" />
          ) : pitchers.isError ? (
            <div className="text-[12px] text-neg">Couldn&apos;t load the pitcher list — <button className="underline" onClick={() => pitchers.refetch()}>retry</button></div>
          ) : (
            <PitcherPicker pitchers={pitchers.data.pitchers} value={pitcher} onPick={setPitcher} />
          )}
          <select className={selectCls} value={team} onChange={(e) => setTeam(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Team">
            <option value="">vs team…</option>
            {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}
          </select>
        </div>

        {!ready ? (
          <div className="mt-3 text-[11.5px] text-faint">
            Pick a pitcher and a club — every active hitter&apos;s career line against him, from the MLB Stats API.
          </div>
        ) : q.isPending ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[34px] rounded-[10px]" />)}
          </div>
        ) : q.isError ? (
          <div className="mt-4">
            <ErrorState title="Couldn't load the matchup" body={q.error.message} onRetry={() => q.refetch()} />
          </div>
        ) : q.data.rows.length === 0 ? (
          <EmptyState title="No active hitters on that roster" body="The active roster came back empty — try again in a minute." />
        ) : q.data.totals.faced === 0 ? (
          <EmptyState
            title={`No ${teamAbbr} hitter has faced ${q.data.pitcher.name}`}
            body={`${q.data.rows.length} active hitters checked — none have a plate appearance against him.`}
          />
        ) : (
          <>
            <div className="num mt-4 text-[12px] text-muted">
              <span className="font-semibold text-text">{q.data.totals.faced} of {q.data.totals.hitters}</span> hitters have faced {lastName || "him"} ·{" "}
              {teamAbbr} <span className="text-text">{slash(q.data.totals)}</span> in {q.data.totals.pa} PA
              {q.data.totals.hr > 0 ? ` · ${q.data.totals.hr} HR` : ""}
            </div>
            <div className="glass-table mt-3 overflow-x-auto rounded-[16px] border border-white/[0.05]">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="bg-surface-2/90">
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface-2 whitespace-nowrap border-b border-white/[0.06] px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Player</th>
                    {COLS.map((c) => (
                      <th key={c.k} className="whitespace-nowrap border-b border-white/[0.06] px-2.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{c.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {q.data.rows.map((r) => (
                    <tr key={r.id} className={`border-b border-white/[0.04] hover:bg-white/[0.04] ${r.pa === 0 ? "opacity-60" : ""}`}>
                      <td className="sticky left-0 z-10 bg-bg whitespace-nowrap px-3 py-2.5">
                        <span className="font-medium text-text">{r.name}</span>
                        <span className="ml-1.5 text-[10.5px] text-muted">{r.pos}</span>
                      </td>
                      {COLS.map((c) => (
                        <td key={c.k} className={`num whitespace-nowrap px-2.5 py-2.5 text-right ${c.k === "ops" ? opsTone(r.ops, r.pa) : r.pa === 0 ? "text-faint" : ""}`}>
                          {c.rate ? (r.pa > 0 ? f3(r[c.k] as number | null) : "—") : fi(r, c.k)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-white/[0.1] bg-white/[0.02] font-semibold">
                    <td className="sticky left-0 z-10 bg-bg whitespace-nowrap px-3 py-2.5 text-text">
                      {teamAbbr} vs {lastName || q.data.pitcher.name}
                    </td>
                    {COLS.map((c) => (
                      <td key={c.k} className={`num whitespace-nowrap px-2.5 py-2.5 text-right ${c.k === "ops" ? opsTone(q.data.totals.ops, q.data.totals.pa) : ""}`}>
                        {c.rate ? f3(q.data.totals[c.k] as number | null) : String(q.data.totals[c.k])}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[10.5px] text-faint">
              Career regular-season lines vs this pitcher, MLB Stats API · OPS ≥ .900 green, ≤ .600 red (10+ PA) · &quot;—&quot; = never faced him.
            </div>
          </>
        )}
      </Panel>
    </Reveal>
  );
}
