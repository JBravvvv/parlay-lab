"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
import { getSyncKey } from "@/lib/ledgerSync";
import type { Health, LedgerRow, Exclusion } from "@/lib/anytime/ledger";
import type { Report } from "@/lib/anytime/report";
import type { AzExclusion } from "@/lib/az/exclusions";
import { DASH, SPLITS, ago, bookRows, calRows, historyBookRows, historyDeskRows, historyNote, pickView, runLine, splitRows, units, type HistoryData, type HistoryRow, type PickView, type RecordRow, type SplitKey, type Tone } from "@/lib/anytime/view";

/**
 * ANY-TIME PICKS (2026-11-12). The one place the any-time engine is run and read from the app.
 *
 *   - "Run picks now" calls POST /api/anytime/run, the same route the scheduler and the command
 *     line call. It is recorded as trigger `manual-ui`.
 *   - Every number below comes from GET /api/anytime, which recomputes the record from the raw
 *     ledger on each read. This page formats; it does no arithmetic of its own (lib/anytime/view).
 *   - DraftKings, FanDuel and combined are always shown together, profit beside ROI.
 *   - "Not in AZ" voids a pick (it leaves every number) and, by default, stops that market type
 *     being picked again. A void is permanent, so it asks first.
 *
 * Paper only. Nothing here places a bet anywhere.
 */

type RunRow = { runId: string; trigger: string; status: string; startedAt: string; ms: number; picks: number; candidates: number; graded: number; credits: number | null; remaining: number | null; errors: string[]; skipped: string[] };
type Data = {
  engine: string;
  count: number;
  report: Report;
  rows: LedgerRow[];
  health: Health;
  exclusions: { defaults: AzExclusion[]; stored: Exclusion[] };
  runs: RunRow[];
  rules: { minEv: number; freshnessMs: number; creditBudgetPerRun: number; heartbeatStaleMs: number };
};
type Load = { kind: "loading" } | { kind: "no-key" } | { kind: "bad-key" } | { kind: "not-configured" } | { kind: "error"; why: string } | { kind: "ready"; data: Data; at: number };

const TONE: Record<Tone, string> = { pos: "text-pos", neg: "text-neg", muted: "text-muted" };
const BTN = "press inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-50";
const BTN_QUIET = `${BTN} border border-white/[0.1] bg-surface-2 text-text`;

const sync = (extra: Record<string, string> = {}) => ({ "x-pl-sync": getSyncKey(), ...extra });

async function loadReport(): Promise<Load> {
  if (!getSyncKey()) return { kind: "no-key" };
  try {
    const r = await fetch("/api/anytime?limit=200", { headers: sync(), cache: "no-store" });
    if (r.status === 401) return { kind: "bad-key" };
    if (r.status === 503) return { kind: "not-configured" };
    if (!r.ok) return { kind: "error", why: `the server answered ${r.status}` };
    return { kind: "ready", data: (await r.json()) as Data, at: Date.now() };
  } catch {
    return { kind: "error", why: "the server could not be reached" };
  }
}

/* ---------- run bar: the heartbeat and the button ---------- */

const HEALTH_WORD: Record<Health["state"], { word: string; tone: Tone }> = {
  ok: { word: "Engine running", tone: "pos" },
  stale: { word: "Engine quiet", tone: "neg" },
  failed: { word: "Last run failed", tone: "neg" },
  never: { word: "Never run", tone: "muted" },
};

function RunBar({ health, now, onRan }: { health: Health | null; now: number; onRan: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: Tone; text: string } | null>(null);

  const run = async () => {
    if (busy) return;
    if (!getSyncKey()) return setNote({ tone: "neg", text: "No sync phrase on this device. Set it in Settings first." });
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/anytime/run", { method: "POST", headers: sync({ "x-pl-trigger": "manual-ui" }), cache: "no-store" });
      let body = null;
      try {
        body = await r.json();
      } catch {
        body = null;
      }
      setNote(runLine(r.status, body));
    } catch {
      setNote({ tone: "neg", text: "The server could not be reached. Nothing was recorded." });
    } finally {
      setBusy(false);
      onRan();
    }
  };

  const h = health ? HEALTH_WORD[health.state] : null;
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[13px] font-bold ${h ? TONE[h.tone] : "text-muted"}`} data-anytime-health={health?.state ?? "unknown"}>
            {h ? h.word : "Checking the engine…"}
            {health?.last && <span className="ml-2 font-semibold text-muted">last run {ago(health.last.finishedAt, now)}</span>}
          </div>
          {health && health.state !== "ok" && <p className="mt-0.5 text-[11px] leading-snug text-muted">{health.message}</p>}
        </div>
        <button type="button" onClick={run} disabled={busy} className={`${BTN} w-full bg-pos text-bg sm:w-auto`} data-anytime-run>
          {busy ? "Running…" : "Run picks now"}
        </button>
      </div>
      {note && (
        <p role="status" className={`mt-2 text-[12px] font-semibold leading-snug ${TONE[note.tone]}`}>
          {note.text}
        </p>
      )}
    </Panel>
  );
}

/* ---------- the record: three books, profit beside ROI ---------- */

function Figure({ label, value, sub, tone = "muted" }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className={`display text-[19px] leading-tight tabular-nums ${tone === "muted" ? "text-text" : TONE[tone]}`}>{value}</div>
      {sub && <div className="text-[10.5px] font-semibold leading-snug text-muted tabular-nums">{sub}</div>}
    </div>
  );
}

function BookCard({ r }: { r: RecordRow }) {
  return (
    <div className="stat-tile" data-anytime-book={r.key}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-black text-text">{r.name}</div>
        <div className="text-[11px] font-semibold text-muted tabular-nums">
          {r.record} · {r.graded} graded · {r.open} open
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        <Figure label="Flat profit" value={r.flatProfit} tone={r.tone} sub="1 unit a pick" />
        <Figure label="Flat ROI" value={r.flatRoi} tone={r.tone} sub={r.flatRoiRange === DASH ? "no graded picks" : `95%: ${r.flatRoiRange}`} />
        <Figure label="Kelly profit" value={r.kellyProfit} sub="quarter Kelly" />
        <Figure label="Kelly ROI" value={r.kellyRoi} />
        <Figure label="CLV, same book" value={r.clv} sub={r.clvN ? `on ${r.clvN} picks · ${r.beatClose} beat the close` : "no closes yet"} />
        <Figure label="Worst drawdown" value={r.drawdown} sub="flat units" />
      </div>
    </div>
  );
}

function SplitTable({ rows }: { rows: RecordRow[] }) {
  if (!rows.length) return <p className="text-[12px] text-muted">No picks yet.</p>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[12px] tabular-nums">
        <thead className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted">
          <tr>
            <th className="px-1 py-1.5 font-bold">Group</th>
            <th className="px-1 py-1.5 text-right font-bold">Picks</th>
            <th className="px-1 py-1.5 text-right font-bold">W-L-P</th>
            <th className="px-1 py-1.5 text-right font-bold">Profit</th>
            <th className="px-1 py-1.5 text-right font-bold">ROI</th>
            <th className="px-1 py-1.5 text-right font-bold">95% range</th>
            <th className="px-1 py-1.5 text-right font-bold">CLV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/[0.06]">
              <td className="px-1 py-1.5 font-semibold text-text">{r.name}</td>
              <td className="px-1 py-1.5 text-right text-muted">{r.picks}</td>
              <td className="px-1 py-1.5 text-right text-muted">{r.record}</td>
              <td className={`px-1 py-1.5 text-right font-bold ${TONE[r.tone]}`}>{r.flatProfit}</td>
              <td className={`px-1 py-1.5 text-right font-bold ${TONE[r.tone]}`}>{r.flatRoi}</td>
              <td className="px-1 py-1.5 text-right text-muted">{r.flatRoiRange}</td>
              <td className="px-1 py-1.5 text-right text-muted">{r.clv}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Splits({ report }: { report: Report }) {
  const [key, setKey] = useState<SplitKey>("bySport");
  return (
    <Panel title="Where the result comes from" action={<Segmented size="sm" label="Split by" options={SPLITS} value={key} onChange={setKey} />}>
      <SplitTable rows={splitRows(report[key])} />
    </Panel>
  );
}

function Calibration({ report }: { report: Report }) {
  const model = calRows(report.calibration.model);
  const s = report.byBook.combined;
  const num = (v: number | null) => (v == null ? DASH : v.toFixed(4));
  return (
    <Panel title="Calibration · does a 55% pick win 55% of the time">
      {model.length === 0 ? (
        <p className="text-[12px] text-muted">No decided picks yet. This fills in as games finish.</p>
      ) : (
        <table className="w-full text-left text-[12px] tabular-nums">
          <thead className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted">
            <tr>
              <th className="py-1.5 font-bold">Model said</th>
              <th className="py-1.5 text-right font-bold">Picks</th>
              <th className="py-1.5 text-right font-bold">Predicted</th>
              <th className="py-1.5 text-right font-bold">Actual</th>
              <th className="py-1.5 text-right font-bold">Gap</th>
            </tr>
          </thead>
          <tbody>
            {model.map((b) => (
              <tr key={b.range} className="border-t border-white/[0.06]">
                <td className="py-1.5 font-semibold text-text">{b.range}</td>
                <td className="py-1.5 text-right text-muted">{b.n}</td>
                <td className="py-1.5 text-right text-muted">{b.predicted}</td>
                <td className="py-1.5 text-right text-text">{b.actual}</td>
                <td className="py-1.5 text-right text-muted">{b.gap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[11px] leading-snug text-muted tabular-nums">
        Brier score (lower is better): model {num(s.brierModel)} · the two books&apos; no-vig price {num(s.brierMarket)}. If the model&apos;s number is not the lower one, the model is not beating the market.
      </p>
    </Panel>
  );
}

/* ---------- the picks ---------- */

const STATUS_TONE: Record<PickView["status"], string> = { open: "text-muted", won: "text-pos", lost: "text-neg", push: "text-faint", void: "text-faint" };

function PickRow({ v, now, onChanged }: { v: PickView; now: number; onChanged: () => void }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const mark = async (exclude: boolean) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/anytime", {
        method: "POST",
        headers: sync({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "not-in-az", id: v.id, exclude }),
        cache: "no-store",
      });
      if (!r.ok) throw new Error(String(r.status));
      setAsk(false);
      onChanged();
    } catch {
      setErr("That did not save. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`border-b border-white/[0.06] px-1 py-2.5 last:border-b-0 ${v.status === "void" ? "opacity-60" : ""}`} data-anytime-pick={v.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-snug text-text tabular-nums">
            {v.selection} <span className="text-pos">{v.taken}</span>
          </div>
          <div className="mt-0.5 text-[11px] font-semibold leading-snug text-muted tabular-nums">
            {v.sport} · {v.event} · {v.other}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted tabular-nums">
            model {v.model} vs no-vig {v.fair} · EV {v.ev} (by price alone {v.priceEv}) · {v.stake}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-faint tabular-nums">
            {ago(v.ts, now)} · {v.trigger} · {v.modelKind} · CLV {v.clv}
            {v.reentry ? ` · ${v.reentry}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-[12px] font-black uppercase tracking-wide ${STATUS_TONE[v.status]}`}>{v.status}</div>
          <div className={`text-[13px] font-bold tabular-nums ${TONE[v.profitTone]}`}>{v.profit}</div>
        </div>
      </div>
      {v.status !== "open" && v.statusLine !== v.status && <div className="mt-0.5 text-[11px] text-faint">{v.statusLine}</div>}
      {v.canVoid && !ask && (
        <button type="button" onClick={() => setAsk(true)} className="press mt-1.5 min-h-9 rounded-[8px] border border-white/[0.08] px-2.5 text-[11px] font-bold text-muted">
          Not available in AZ
        </button>
      )}
      {ask && (
        <div className="mt-2 rounded-[10px] border border-white/[0.1] bg-surface-2 p-2.5" role="group" aria-label="Mark not available in Arizona">
          <p className="text-[12px] leading-snug text-text">
            Take this pick out of every result? This cannot be undone. You can also stop the engine picking <span className="font-bold">{v.marketType}</span> again.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => mark(true)} className={`${BTN} bg-neg text-bg`}>
              Remove and block this market
            </button>
            <button type="button" disabled={busy} onClick={() => mark(false)} className={BTN_QUIET}>
              Remove this pick only
            </button>
            <button type="button" disabled={busy} onClick={() => setAsk(false)} className={BTN_QUIET}>
              Cancel
            </button>
          </div>
          {err && <p className="mt-1.5 text-[11px] font-semibold text-neg">{err}</p>}
        </div>
      )}
    </li>
  );
}

function Picks({ rows, total, now, onChanged }: { rows: LedgerRow[]; total: number; now: number; onChanged: () => void }) {
  const [show, setShow] = useState<"all" | "open" | "settled">("all");
  const views = rows.map(pickView).filter((v) => (show === "all" ? true : show === "open" ? v.status === "open" : v.status !== "open"));
  return (
    <Panel
      title={`Picks, newest first · ${total} stored`}
      action={
        <Segmented
          size="sm"
          label="Show"
          options={[
            { key: "all", label: "All" },
            { key: "open", label: "Open" },
            { key: "settled", label: "Settled" },
          ]}
          value={show}
          onChange={setShow}
        />
      }
    >
      {views.length === 0 ? (
        <p className="text-[12px] text-muted">{total === 0 ? "No picks yet. The engine records one only when a DraftKings or FanDuel price clears the bar." : "Nothing in this view."}</p>
      ) : (
        <ul>
          {views.map((v) => (
            <PickRow key={v.id} v={v} now={now} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {total > rows.length && <p className="pt-2 text-center text-[11px] font-semibold text-muted">Showing the newest {rows.length} of {total}. Every pick is in the totals above.</p>}
    </Panel>
  );
}

/* ---------- Arizona exclusions ---------- */

function Exclusions({ ex, onChanged }: { ex: Data["exclusions"]; onChanged: () => void }) {
  const [busy, setBusy] = useState("");
  const allow = async (marketType: string) => {
    setBusy(marketType);
    try {
      await fetch("/api/anytime", { method: "POST", headers: sync({ "content-type": "application/json" }), body: JSON.stringify({ action: "allow-market", marketType }), cache: "no-store" });
    } catch {
      /* the list reloads either way and shows what is true */
    } finally {
      setBusy("");
      onChanged();
    }
  };
  return (
    <Panel title="Markets the engine will not pick in Arizona">
      <ul className="space-y-2">
        {ex.defaults.map((d) => (
          <li key={`d:${d.marketType}`} className="text-[12px] leading-snug">
            <span className="font-bold text-text">{d.marketType}</span> <span className="text-faint">· built in</span>
            <div className="text-[11px] text-muted">
              {d.reason} (checked {d.checked})
            </div>
          </li>
        ))}
        {ex.stored.map((s) => (
          <li key={`s:${s.marketType}`} className="flex items-center justify-between gap-3 text-[12px] leading-snug">
            <div className="min-w-0">
              <span className="font-bold text-text">{s.marketType}</span> <span className="text-faint">· added by you</span>
              <div className="text-[11px] text-muted">{s.reason}</div>
            </div>
            <button type="button" disabled={busy === s.marketType} onClick={() => allow(s.marketType)} className={`${BTN_QUIET} min-h-9 shrink-0 px-3 text-[11px]`}>
              Allow again
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------- recent runs ---------- */

function Runs({ runs, now }: { runs: RunRow[]; now: number }) {
  if (!runs.length) return null;
  return (
    <Panel title="Recent runs · every trigger calls the same engine">
      <ul>
        {runs.map((r) => (
          <li key={r.runId} className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-1.5 text-[11.5px] tabular-nums last:border-b-0">
            <span className="min-w-0 truncate text-muted">
              <span className={`font-bold ${r.status === "ok" ? "text-text" : r.status === "busy" ? "text-faint" : "text-neg"}`}>{r.status}</span> · {r.trigger} · {ago(r.startedAt, now)}
              {r.errors?.[0] ? ` · ${r.errors[0]}` : ""}
            </span>
            <span className="shrink-0 text-muted">
              {r.picks} pick{r.picks === 1 ? "" : "s"} · {r.candidates} prices · {r.credits ?? DASH} cr
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------- the older desks' tickets, tagged by book ---------- */

function HistoryTable({ rows, first }: { rows: HistoryRow[]; first: string }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[12px] tabular-nums">
        <thead className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted">
          <tr>
            <th className="px-1 py-1.5 font-bold">{first}</th>
            <th className="px-1 py-1.5 text-right font-bold">Tickets</th>
            <th className="px-1 py-1.5 text-right font-bold">W-L-P</th>
            <th className="px-1 py-1.5 text-right font-bold">Staked</th>
            <th className="px-1 py-1.5 text-right font-bold">Profit</th>
            <th className="px-1 py-1.5 text-right font-bold">ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/[0.06] align-top">
              <td className="px-1 py-1.5">
                <span className="font-semibold text-text">{r.name}</span>
                <span className={`block text-[10.5px] ${r.legacy ? "text-gold" : "text-muted"}`}>{r.tag}</span>
                <span className="block text-[10.5px] text-faint">
                  {r.dates}
                  {r.how ? ` · ${r.how}` : ""}
                </span>
              </td>
              <td className="px-1 py-1.5 text-right text-muted">
                {r.picks}
                {r.open ? <span className="block text-[10.5px] text-faint">{r.open} unsettled</span> : null}
              </td>
              <td className="px-1 py-1.5 text-right text-muted">{r.record}</td>
              <td className="px-1 py-1.5 text-right text-muted">{r.staked}</td>
              <td className={`px-1 py-1.5 text-right font-bold ${TONE[r.tone]}`}>{r.profit}</td>
              <td className={`px-1 py-1.5 text-right font-bold ${TONE[r.tone]}`}>{r.roi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Read only when asked: it pulls four whole stored ledgers, so it is a button, not part of every
 * open. Nothing here feeds the record above — the any-time ledger is its own store.
 */
function History() {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "error"; why: string } | { kind: "ready"; history: HistoryData }>({ kind: "idle" });
  const loadHistory = async () => {
    setState({ kind: "loading" });
    try {
      const r = await fetch("/api/anytime?limit=0&history=1", { headers: sync(), cache: "no-store" });
      if (!r.ok) return setState({ kind: "error", why: r.status === 401 ? "your sync phrase didn't match" : `the server answered ${r.status}` });
      const body = (await r.json()) as { history?: HistoryData };
      setState({ kind: "ready", history: body.history ?? { ok: false, error: "the server sent no history" } });
    } catch {
      setState({ kind: "error", why: "the server could not be reached" });
    }
  };
  const note = state.kind === "ready" ? historyNote(state.history) : null;
  const books = state.kind === "ready" ? historyBookRows(state.history) : [];
  const desks = state.kind === "ready" ? historyDeskRows(state.history) : [];
  return (
    <Panel title="Older picks · tagged by book, not counted above">
      <p className="text-[11.5px] leading-snug text-muted">
        Every ticket the older MLB, CFB and NFL desks recorded is kept exactly as it was stored and labelled with the book it was priced at. A ticket at any book other than DraftKings or FanDuel is legacy: it stays
        here and out of every number above. Older DraftKings tickets are listed too, but not added in: they are dollar tickets from the earlier model, not per-unit picks from this engine.
      </p>
      {state.kind !== "ready" && (
        <button type="button" onClick={() => void loadHistory()} disabled={state.kind === "loading"} className={`${BTN_QUIET} mt-2`}>
          {state.kind === "loading" ? "Reading the older ledgers…" : state.kind === "error" ? "Try again" : "Show older picks"}
        </button>
      )}
      {state.kind === "error" && <p className="mt-2 text-[11.5px] text-neg">Couldn&apos;t load the older picks: {state.why}.</p>}
      {note && <p className={`mt-2 text-[11.5px] leading-snug ${TONE[note.tone]}`}>{note.text}</p>}
      {books.length > 0 && (
        <div className="mt-2 space-y-3">
          <HistoryTable rows={books} first="Book" />
          <HistoryTable rows={desks} first="Desk" />
        </div>
      )}
    </Panel>
  );
}

/* ---------- the page ---------- */

export default function AnytimePage() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const next = await loadReport();
    setNow(Date.now());
    setLoad((cur) => (next.kind === "error" && cur.kind === "ready" ? cur : next));
  }, []);

  /* on open, and whenever the app comes back to the front. No timer: a read costs store bandwidth,
     and nothing here changes unless a run happened (the button reloads after its own run). */
  useEffect(() => {
    void refresh();
    const onShow = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [refresh]);

  const data = load.kind === "ready" ? load.data : null;
  return (
    <div className="space-y-3">
      <PageHeader
        title="Any-time picks"
        sub="The pick engine, runnable at any moment. It prices every open NFL and college football game line at DraftKings and FanDuel only, takes the better of the two prices when it clears the bar, and records each pick once. Results are split by book, with profit beside ROI. Paper picks: nothing here is placed with real money, and none of it is betting advice."
        subMobile="DraftKings + FanDuel only · paper, not real money"
      />
      <RunBar health={data?.health ?? null} now={now} onRan={refresh} />

      {load.kind === "loading" && (
        <Panel>
          <p className="text-[12px] text-muted">Loading the record…</p>
        </Panel>
      )}
      {(load.kind === "no-key" || load.kind === "bad-key") && (
        <Panel>
          <p className="text-[12px] text-muted">
            {load.kind === "bad-key" ? "Your sync phrase didn't match." : "No sync phrase on this device."} Set it in{" "}
            <Link replace href="/settings" className="font-bold text-text underline">
              Settings
            </Link>{" "}
            to run picks and see the record.
          </p>
        </Panel>
      )}
      {load.kind === "not-configured" && (
        <Panel>
          <p className="text-[12px] text-muted">The server is missing its store or its sync phrase, so there is no record to show yet.</p>
        </Panel>
      )}
      {load.kind === "error" && (
        <Panel>
          <p className="text-[12px] text-muted">Couldn&apos;t load the record: {load.why}.</p>
          <button type="button" onClick={() => void refresh()} className={`${BTN_QUIET} mt-2`}>
            Try again
          </button>
        </Panel>
      )}

      {data && (
        <>
          <Panel title="The record · DraftKings, FanDuel, combined">
            <div className="grid gap-2 md:grid-cols-3">
              {bookRows(data.report).map((r) => (
                <BookCard key={r.key} r={r} />
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted tabular-nums">
              Bankrolls on {data.report.bank.graded} graded picks: flat {units(data.report.bank.flat)} · quarter Kelly {data.report.bank.kelly.toFixed(2)}u from a 100u start.
              {data.report.voided > 0 ? ` ${data.report.voided} voided pick${data.report.voided === 1 ? " is" : "s are"} listed below and counted nowhere.` : ""} A small sample proves nothing: read the 95% range, not just the ROI.
            </p>
          </Panel>
          <Splits report={data.report} />
          <Calibration report={data.report} />
          <Picks rows={data.rows} total={data.count} now={now} onChanged={refresh} />
          <Exclusions ex={data.exclusions} onChanged={refresh} />
          <Runs runs={data.runs} now={now} />
          <History />
          <p className="px-1 text-[10.5px] leading-snug text-faint">
            Engine {data.engine}. A pick needs a price fetched in the same run, on a game that has not started, at DraftKings or FanDuel. Closing line value is measured against the close at the book the pick was taken at. Informational only; not betting advice.
          </p>
        </>
      )}
    </div>
  );
}
