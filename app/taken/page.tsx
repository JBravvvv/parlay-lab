"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { getSyncKey } from "@/lib/ledgerSync";
import { SPORT_WORD, relTime, sortTaken, type TakenRow, type TakenStatus } from "@/lib/bet-alert";

/**
 * TAKEN (2026-10-09). Josh: "a notification page/tab/scroll I can check that only has bets locked/taken listed in
 * order top to bottom from most recent timing wise (30 seconds ago) to oldest (5 mins; 2 hours; 12 hours; 3 days)
 * however long." Every locked bet on every desk, newest first, endless scroll — plus the switch that turns this
 * phone's bet alerts on.
 */

type Row = TakenRow & { alert: string | null };
type Page = { now: number; total: number; rows: Row[]; next: { before: number; beforeKey: string } | null };

const SPORT_TONE: Record<string, string> = { mlb: "var(--color-text)", nfl: "var(--color-nfl)", cfb: "var(--color-cfb)" };
const STATUS: Record<TakenStatus, { word: string; tone: string }> = {
  pending: { word: "pending", tone: "var(--color-muted)" },
  live: { word: "live", tone: "var(--color-live)" },
  won: { word: "won ✓", tone: "var(--color-pos)" },
  lost: { word: "lost ✗", tone: "var(--color-neg)" },
  push: { word: "push", tone: "var(--color-faint)" },
  void: { word: "void", tone: "var(--color-faint)" },
};

async function fetchPage(cursor: Page["next"]): Promise<Page> {
  const q = cursor ? `?before=${cursor.before}&beforeKey=${encodeURIComponent(cursor.beforeKey)}` : "";
  const r = await fetch(`/api/taken${q}`, { headers: { "x-pl-sync": getSyncKey() }, cache: "no-store" });
  if (r.status === 401) throw new Error("bad-key");
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as Page;
}

/* ---------- this device's alert switch ---------- */

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type AlertState =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "not-configured" }
  | { kind: "no-key" }
  | { kind: "blocked" }
  | { kind: "off" }
  | { kind: "on" };

function AlertSwitch() {
  const [st, setSt] = useState<AlertState>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pub, setPub] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setSt({ kind: "unsupported" });
    if (!getSyncKey()) return setSt({ kind: "no-key" });
    try {
      const j = (await (await fetch("/api/push", { cache: "no-store" })).json()) as { configured: boolean; publicKey: string | null };
      if (!j.configured || !j.publicKey) return setSt({ kind: "not-configured" });
      setPub(j.publicKey);
    } catch {
      return setSt({ kind: "not-configured" });
    }
    if (Notification.permission === "denied") return setSt({ kind: "blocked" });
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setSt(sub && Notification.permission === "granted" ? { kind: "on" } : { kind: "off" });
  }, []);
  useEffect(() => void check(), [check]);

  const turnOn = async () => {
    if (!pub) return;
    setBusy(true);
    setNote("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setSt(perm === "denied" ? { kind: "blocked" } : { kind: "off" });
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(pub) }));
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "x-pl-sync": getSyncKey(), "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!r.ok) throw new Error(r.status === 401 ? "Your sync phrase didn't match — check it in Settings." : `The server said ${r.status}.`);
      setSt({ kind: "on" });
      setNote("Alerts are on for this device.");
    } catch (e) {
      setNote(`Couldn't turn alerts on: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "x-pl-sync": getSyncKey(), "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setSt({ kind: "off" });
      setNote("Alerts are off for this device.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await fetch("/api/push/test", { method: "POST", headers: { "x-pl-sync": getSyncKey() } });
      const j = (await r.json().catch(() => ({}))) as { delivered?: number; error?: string };
      setNote(r.ok ? "Test alert sent — it should appear in a few seconds." : `The test didn't go out (${j.error ?? r.status}).`);
    } finally {
      setBusy(false);
    }
  };

  const btn = "press min-h-10 rounded-[10px] border border-white/10 bg-surface-2 px-4 text-[13px] font-bold text-text disabled:opacity-50";
  let body: React.ReactNode;
  switch (st.kind) {
    case "checking":
      body = <p className="text-[12px] text-muted">Checking this device…</p>;
      break;
    case "unsupported":
      body = <p className="text-[12px] text-muted">This browser can&apos;t take alerts. On iPhone, open Parlay Lab from its <b className="text-text">Home Screen icon</b> (not Safari) and come back here.</p>;
      break;
    case "no-key":
      body = <p className="text-[12px] text-muted">Enter your sync phrase in <Link replace href="/settings" className="font-bold text-text underline">Settings</Link> first. Alerts and this list are tied to it.</p>;
      break;
    case "not-configured":
      body = <p className="text-[12px] text-muted">Alerts aren&apos;t switched on on the server yet — the one-time key setup hasn&apos;t been done.</p>;
      break;
    case "blocked":
      body = <p className="text-[12px] text-muted">Alerts are blocked for Parlay Lab. On iPhone: Settings → Notifications → Parlay Lab → Allow Notifications, then reopen the app.</p>;
      break;
    case "off":
      body = (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={turnOn} className={btn}>Turn on bet alerts</button>
          <span className="text-[12px] text-muted">One alert per bet, the moment the engine locks it.</span>
        </div>
      );
      break;
    case "on":
      body = (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold" style={{ color: "var(--color-pos)" }}>● Alerts on</span>
          <button type="button" disabled={busy} onClick={test} className={btn}>Send test alert</button>
          <button type="button" disabled={busy} onClick={turnOff} className={`${btn} text-muted`}>Turn off</button>
        </div>
      );
      break;
  }
  return (
    <Panel title="Bet alerts">
      {body}
      {note && <p className="mt-2 text-[12px] font-semibold text-muted">{note}</p>}
    </Panel>
  );
}

/* ---------- the feed ---------- */

function TakenRowView({ r, now }: { r: Row; now: number }) {
  const s = STATUS[r.status];
  const failed = r.alert === "failed" || r.alert === "gave-up";
  return (
    <li className="flex items-start gap-3 border-b border-white/[0.06] px-1 py-2.5 last:border-b-0">
      <span className="mt-0.5 w-9 shrink-0 text-[11px] font-black tracking-wide" style={{ color: SPORT_TONE[r.sport] }}>{SPORT_WORD[r.sport]}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold leading-snug text-text tabular-nums">{r.text}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-muted tabular-nums">
          <span>{relTime(r.at, now)}</span>
          <span style={{ color: s.tone }}>{s.word}</span>
          {r.status === "won" && r.payout != null && <span style={{ color: "var(--color-pos)" }}>+${Math.round(r.payout - r.stake)}</span>}
          {r.fun && <span>fun</span>}
          {failed && <span style={{ color: "var(--color-neg)" }}>alert not delivered</span>}
        </div>
      </div>
    </li>
  );
}

function Feed() {
  const [rows, setRows] = useState<Row[]>([]);
  const [next, setNext] = useState<Page["next"]>(null);
  const [state, setState] = useState<"loading" | "ready" | "bad-key" | "no-key" | "error">("loading");
  const [now, setNow] = useState(() => Date.now());
  const [more, setMore] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);

  const merge = (a: Row[], b: Row[]) => {
    const m = new Map<string, Row>();
    for (const r of [...a, ...b]) m.set(r.key, r);
    return sortTaken([...m.values()]) as Row[];
  };

  /* the newest page — on open, every minute, and whenever the app comes back to the front */
  const refresh = useCallback(async () => {
    if (!getSyncKey()) return setState("no-key");
    try {
      const p = await fetchPage(null);
      setRows((cur) => (started.current ? merge(cur, p.rows) : p.rows));
      if (!started.current) setNext(p.next);
      started.current = true;
      setState("ready");
    } catch (e) {
      setState((e as Error).message === "bad-key" ? "bad-key" : (s) => (s === "ready" ? "ready" : "error"));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 60_000);
    const vis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refresh]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  /* endless scroll: the next older page loads as the end of the list comes into view */
  const loadMore = useCallback(async () => {
    if (!next || more) return;
    setMore(true);
    try {
      const p = await fetchPage(next);
      setRows((cur) => merge(cur, p.rows));
      setNext(p.next);
    } catch {
      /* the sentinel stays; the next scroll retries */
    } finally {
      setMore(false);
    }
  }, [next, more]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && void loadMore(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, next]);

  if (state === "loading") return <Panel><p className="text-[12px] text-muted">Loading locked bets…</p></Panel>;
  if (state === "no-key" || state === "bad-key")
    return (
      <Panel>
        <p className="text-[12px] text-muted">
          {state === "bad-key" ? "Your sync phrase didn't match." : "No sync phrase on this device."} Set it in{" "}
          <Link replace href="/settings" className="font-bold text-text underline">Settings</Link> to see every locked bet.
        </p>
      </Panel>
    );
  if (state === "error") return <Panel><p className="text-[12px] text-muted">Couldn&apos;t load locked bets — retrying every minute.</p></Panel>;
  return (
    <Panel title="Every locked bet, newest first">
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted">No locked bets yet.</p>
      ) : (
        <ul>{rows.map((r) => <TakenRowView key={r.key} r={r} now={now} />)}</ul>
      )}
      {next && <div ref={sentinel} className="py-3 text-center text-[11px] font-semibold text-muted">{more ? "Loading older bets…" : " "}</div>}
      {!next && rows.length > 0 && <p className="py-3 text-center text-[11px] font-semibold text-muted">That&apos;s every locked bet.</p>}
    </Panel>
  );
}

export default function TakenPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="Taken"
        sub="Every bet the engine has locked on MLB, NFL and college football, newest at the top. Each line is exactly what the bet alert said. Paper bets: nothing here is placed with real money."
        subMobile="Every locked bet, newest first · paper, not real money"
      />
      <AlertSwitch />
      <Feed />
    </div>
  );
}
