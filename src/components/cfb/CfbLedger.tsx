"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { CfbTicketCard, cfbGradingOf, cfbTicketsOf, type CfbLegVerdict } from "@/components/cfb/CfbTicketCard";
import { CfbSyncChip } from "@/components/cfb/CfbSyncChip";
import { Reveal } from "@/components/motion/Reveal";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Segmented } from "@/components/ui/Segmented";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/states";
import { loadCfbFinals } from "@/lib/cfb/client";
import { ptDateOf } from "@/lib/cfb/dates";
import { CFB_BANK_BASE } from "@/lib/cfb/rules";
import { CFB_SYNC_EVENT, gradeCfb, readCfbLedger, useCfbLedger } from "@/lib/cfb/store";
import { syncCfbNow } from "@/lib/cfb/sync";
import type { CfbLedgerEntry, CfbTicket } from "@/lib/cfb/types";
import { fmtMoneyExact } from "@/lib/format";
import { railLabel } from "@/lib/games";
import { roiPct } from "@/lib/useLedger";

/**
 * CFB LEDGER (INSTRUCTION 38, 2026-09-05): the College Football record — its own entries,
 * its own bank, graded off ESPN finals. On view every locked day on or before today whose
 * grading is not done is graded (finals fetch → `grade`), re-armed whenever the sync loop
 * lands a change (CFB_SYNC_EVENT). CORE / FUN scope, the five stat tiles, an equity
 * sparkline, one collapsible card per day with the tickets and every leg's verdict, the
 * sync chip, and the page-header actions (`CfbLedgerActions`: grade / export / copy /
 * import / wipe) exported separately so the page can hand them to its PageHeader.
 */

type Scope = "core" | "fun";

const SCOPES = [
  { key: "core", label: "Core" },
  { key: "fun", label: "Fun" },
] as const;

const RESULT_TONE: Record<string, string> = {
  won: "text-pos",
  lost: "text-neg",
  push: "text-muted",
  pending: "text-live",
  ungradable: "text-gold",
};

const todayPT = () => ptDateOf(new Date().toISOString());

/* ---------- shared UI state: the header's Import toggle opens the body's paste panel ---------- */

let importOpen = false;
const importSubs = new Set<() => void>();
function setImportOpen(v: boolean) {
  importOpen = v;
  for (const f of importSubs) f();
}
function useImportOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      importSubs.add(cb);
      return () => importSubs.delete(cb);
    },
    () => importOpen,
    () => false,
  );
}

/* ---------- grading ---------- */

let gradingRun: Promise<number> | null = null;

/** Grade every locked day on or before today whose grading is not done. Returns days touched. */
export function gradeCfbPending(): Promise<number> {
  if (gradingRun) return gradingRun;
  gradingRun = (async () => {
    const today = todayPT();
    const due = readCfbLedger().filter((e) => !e.grading?.done && e.date <= today && (e.core.length > 0 || e.funT.length > 0));
    let n = 0;
    for (const e of due) {
      try {
        const { finals } = await loadCfbFinals(e.date);
        if (gradeCfb(e.date, finals)) n++;
      } catch {
        /* offline or the feed hiccupped — the next view retries */
      }
    }
    return n;
  })().finally(() => {
    gradingRun = null;
  });
  return gradingRun;
}

/* ---------- header actions ---------- */

export function CfbLedgerActions() {
  const { exportText, wipe } = useCfbLedger();
  const open = useImportOpen();
  const [armed, setArmed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const armTimer = useRef<number | null>(null);
  const msgTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (armTimer.current) window.clearTimeout(armTimer.current);
      if (msgTimer.current) window.clearTimeout(msgTimer.current);
    },
    [],
  );

  const flash = (text: string) => {
    setMsg(text);
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), 2400);
  };

  const download = (): boolean => {
    try {
      const blob = new Blob([exportText()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parlay-lab-cfb-ledger-${todayPT()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch {
      return false;
    }
  };

  const doGrade = async () => {
    if (grading) return;
    setGrading(true);
    try {
      const n = await gradeCfbPending();
      flash(n ? `Graded ${n} day${n === 1 ? "" : "s"}.` : "Nothing new to grade.");
      if (n) void syncCfbNow();
    } finally {
      setGrading(false);
    }
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      flash("Copied — paste it into Import on the other device.");
    } catch {
      flash("Clipboard blocked — use Export instead.");
    }
  };

  const doWipe = () => {
    if (!armed) {
      download();
      setArmed(true);
      if (armTimer.current) window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(false), 6000);
      flash("Backup exported — tap again within 6s to wipe this device's CFB ledger.");
      return;
    }
    wipe();
    setArmed(false);
    if (armTimer.current) window.clearTimeout(armTimer.current);
    flash("CFB ledger wiped on this device. Sync refills it from the cloud copy.");
  };

  const small = "!px-3 !py-1 text-[11px]";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {msg && <span className="basis-full text-right text-[10.5px] text-muted md:basis-auto">{msg}</span>}
      <Pill variant="primary" className={small} onClick={() => void doGrade()} disabled={grading}>
        {grading ? "Grading…" : "Grade now"}
      </Pill>
      <Pill className={small} onClick={() => (download() ? flash("Exported.") : flash("Export blocked by the browser."))}>
        Export
      </Pill>
      <Pill className={small} onClick={() => void doCopy()}>
        Copy for phone
      </Pill>
      <Pill className={small} onClick={() => setImportOpen(!open)} aria-expanded={open}>
        {open ? "Close import" : "Import"}
      </Pill>
      <Pill className={`${small} ${armed ? "!border-neg/60 !bg-neg/10 !text-neg" : ""}`} onClick={doWipe}>
        {armed ? "Confirm wipe" : "Wipe device"}
      </Pill>
    </div>
  );
}

/* ---------- body ---------- */

function LegResults({ t, legs }: { t: CfbTicket; legs: Record<string, CfbLegVerdict> | undefined }) {
  if (!legs) return null;
  const rows = t.legs.map((leg) => ({ leg, v: legs[leg.lkey] })).filter((r) => r.v);
  if (!rows.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 px-1 text-[10.5px]">
      {rows.map(({ leg, v }) => (
        <li key={leg.lkey} className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-muted">{leg.label}</span>
          <span className={`num shrink-0 ${RESULT_TONE[v.result] ?? "text-muted"}`}>
            {v.result}
            {v.detail && <span className="text-faint"> · {v.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DayCard({ e, scope, open, today }: { e: CfbLedgerEntry; scope: Scope; open: boolean; today: string }) {
  const tix = cfbTicketsOf(e, scope);
  const g = cfbGradingOf(e);
  let staked = 0, ret = 0, pending = 0;
  for (const t of tix) {
    const r = g?.tickets[t.id];
    if (!r || r.result === "pending" || r.result === "ungradable") {
      pending++;
      continue;
    }
    staked += t.stake;
    ret += r.result === "won" ? r.payout : r.result === "push" ? t.stake : 0;
  }
  const pl = Math.round((ret - staked) * 100) / 100;
  const settled = tix.length > 0 && pending === 0;
  const plTone = pl > 0 ? "text-pos" : pl < 0 ? "text-neg" : "text-muted";
  return (
    <details className="glass px-4 py-3" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="text-[13px] font-bold text-text">{e.date === today ? "Today" : railLabel(e.date)}</span>
          <span className="num ml-2 text-[10.5px] text-faint">{e.date}</span>
          {e.noPlay && <span className="ml-2 rounded-full border border-line-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">No-play</span>}
        </span>
        <span className="num shrink-0 text-[11px] text-muted">
          {tix.length} ticket{tix.length === 1 ? "" : "s"} · ${tix.reduce((s, t) => s + t.stake, 0)}
          {settled ? (
            <b className={`ml-2 ${plTone}`}>{fmtMoneyExact(pl)}</b>
          ) : tix.length ? (
            <span className="ml-2 text-live">{pending} pending</span>
          ) : null}
        </span>
      </summary>
      {tix.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">
          {e.noPlay ? "NO-PLAY — nothing staked." : scope === "fun" ? "No fun parlay that day." : "No core tickets that day."}
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {tix.map((t) => (
            <div key={t.id}>
              <CfbTicketCard t={t} grade={g?.tickets[t.id]} legResults={g?.legs} />
              <LegResults t={t} legs={g?.legs} />
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

export function CfbLedger() {
  const { entries, stats, bankroll, importText } = useCfbLedger();
  const [scope, setScope] = useState<Scope>("core");
  const open = useImportOpen();
  const [paste, setPaste] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const today = useMemo(todayPT, []);
  const s = stats[scope];

  /* auto-grade on view; re-arm when sync lands a change */
  const graded = useRef(false);
  useEffect(() => {
    const run = () => {
      if (graded.current) return;
      graded.current = true;
      void gradeCfbPending();
    };
    run();
    const rearm = () => {
      graded.current = false;
      run();
    };
    window.addEventListener(CFB_SYNC_EVENT, rearm);
    return () => window.removeEventListener(CFB_SYNC_EVENT, rearm);
  }, []);

  const days = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const equity = useMemo(() => s.days.map((d) => d.cumPl), [s]);

  const applyImport = (text: string) => {
    const r = importText(text);
    if (r.ok) {
      setImportMsg(`Imported — ${r.added} added, ${r.merged} merged. ${r.entries.length} locked day${r.entries.length === 1 ? "" : "s"} on this device.`);
      setPaste("");
      setImportOpen(false);
      void syncCfbNow();
    } else {
      setImportMsg(`Import refused — ${r.error}`);
    }
  };
  const onFile = (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    f.text().then(applyImport, () => setImportMsg("Could not read that file."));
  };

  const plTone = s.pl > 0 ? "pos" : s.pl < 0 ? "neg" : "muted";
  const record = `${s.w}-${s.l}${s.push ? `-${s.push}` : ""}`;

  return (
    <div className="space-y-4">
      <CfbSyncChip />

      {(open || importMsg) && (
        <Panel title="Import a CFB ledger backup" action={<span className="text-[10.5px] text-faint">merges — never erases a locked day</span>}>
          {open && (
            <>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Paste the exported CFB ledger JSON here"
                rows={5}
                className="num w-full rounded-[12px] border border-line-2 bg-surface-2 px-3 py-2 text-[11px] text-text"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Pill variant="gold" className="!px-3 !py-1 text-[11px]" onClick={() => applyImport(paste)} disabled={!paste.trim()}>
                  Import pasted
                </Pill>
                <Pill className="!px-3 !py-1 text-[11px]" onClick={() => fileRef.current?.click()}>
                  Choose file
                </Pill>
                <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onFile} />
              </div>
            </>
          )}
          {importMsg && <p className="mt-2 text-[11px] text-muted">{importMsg}</p>}
        </Panel>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented options={SCOPES} value={scope} onChange={setScope} size="sm" tone="cfb" label="Ledger scope" />
        <span className="num text-[10.5px] text-faint">
          {entries.length} locked day{entries.length === 1 ? "" : "s"} · ${s.staked.toFixed(2)} staked
        </span>
      </div>

      <Reveal>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatTile label="Net P/L" value={fmtMoneyExact(s.pl)} sub={`$${s.ret.toFixed(2)} returned`} tone={plTone} />
          <StatTile label="ROI" value={roiPct(s.roi)} sub="on settled stakes" tone={s.roi == null ? "muted" : s.roi >= 0 ? "pos" : "neg"} />
          <StatTile label="Record" value={record} sub={`${s.pending} pending · ${s.ungradable} void`} tone="cfb" />
          <StatTile label="Max drawdown" value={s.dd > 0 ? `-$${s.dd.toFixed(2)}` : "$0.00"} sub="from the running peak" tone={s.dd > 0 ? "neg" : "muted"} />
          <StatTile
            label="CFB bankroll"
            value={`$${bankroll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub={`$${CFB_BANK_BASE.toLocaleString("en-US")} base · both buckets`}
            tone="gold"
            className="col-span-2 md:col-span-1"
          />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <Panel
          title={`Equity · ${scope}`}
          action={<span className="num text-[10.5px] text-faint">{s.days.length} settled day{s.days.length === 1 ? "" : "s"}</span>}
        >
          <Sparkline values={equity} height={44} label={`cumulative ${scope} P/L over ${s.days.length} days`} />
          {s.bigHit && scope === "fun" && (
            <p className="num mt-2 text-[10.5px] text-gold">
              Biggest hit · {s.bigHit.name} · ${s.bigHit.payout.toFixed(2)} on {railLabel(s.bigHit.date)}
            </p>
          )}
        </Panel>
      </Reveal>

      {days.length === 0 ? (
        <EmptyState title="No locked CFB days yet" body="Lock a card on the Builder — each slate day lands here with its grades." />
      ) : (
        <div className="space-y-2">
          {days.map((e, i) => (
            <Reveal key={e.date} delay={Math.min(i, 6) * 0.04} y={10}>
              <DayCard e={e} scope={scope} open={i === 0} today={today} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
