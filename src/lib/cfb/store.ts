"use client";

import { useSyncExternalStore } from "react";
import { todayExposure, validateBankStore, type BankStore } from "@/lib/bankroll";
import { mergeLedgers, validateLedger } from "@/lib/ledger-merge";
import { CFB_BANK_BASE, CFB_KEYS, CFB_PAPER } from "./rules";
import { cfbBankroll, cfbLedgerStats, lockCfbCard } from "./ledger";
import { gradeCfbEntry } from "./grade";
import type { CfbBoard, CfbCard, CfbFinals, CfbLedgerEntry } from "./types";

/**
 * THE CFB DEVICE STORE (INSTRUCTION 38, 2026-09-05, Josh: "Ledger & Allotted $ for College
 * Football should be separate"). The College Football ledger and bank live under their OWN
 * two localStorage keys (CFB_KEYS) — never the MLB desk's — with the same shape rules the MLB
 * record follows: append-only by date, a lock is once per date, grades overlay, sync merges.
 *
 * Every storage access is guarded, so the pure helpers import cleanly on the server and under
 * vitest's node environment (no localStorage → read as empty, write reports false) and a
 * private-mode browser that throws on access behaves the same way.
 *
 * `useCfbLedger()` is a useSyncExternalStore hook with an EMPTY server snapshot: the first
 * client render matches the SSR HTML, then React swaps in the device's record (the mount gate).
 * Nothing here computes a price or a grade — locking and grading are the pure functions in
 * ./ledger and ./grade; this module only stores what they return.
 */

export const CFB_CHANGE_EVENT = "pl:cfb-ledger-change";
/** dispatched by ./sync after a cloud merge rewrote the device record */
export const CFB_SYNC_EVENT = "pl:cfb-ledger-sync";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CfbGrading = NonNullable<CfbLedgerEntry["grading"]>;
export type CfbStats = ReturnType<typeof cfbLedgerStats>;

/** The un-persisted bank: base $2,500 with P/L counted from the paper start. The CFB record
    cannot hold a day before CFB_PAPER.since, so this window is exact — a device that first
    opens the desk a week in still counts every graded Saturday (mergeBankStores keeps the
    EARLIER asOf anyway, so every synced device converges here). */
const DEFAULT_BANK: BankStore = { base: CFB_BANK_BASE, asOf: CFB_PAPER.since, log: [] };

/* ---------- guarded storage ---------- */

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function rawItem(key: string): string {
  const s = storage();
  if (!s) return "";
  try {
    return s.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function setRaw(key: string, value: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeRaw(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* nothing to remove, or storage sealed */
  }
}

/** The raw stored strings — ./sync's change detector compares these between ticks. */
export function readCfbRaw(): { ledger: string; bank: string } {
  return { ledger: rawItem(CFB_KEYS.ledger), bank: rawItem(CFB_KEYS.bank) };
}

let version = 0;
function bump(): void {
  version++;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CFB_CHANGE_EVENT));
}

/* ---------- entries ---------- */

export function isCfbEntry(x: unknown): x is CfbLedgerEntry {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const e = x as Partial<CfbLedgerEntry>;
  return e.sport === "cfb" && typeof e.date === "string" && DATE_RE.test(e.date) && e.locked === true && Array.isArray(e.core);
}

function sortByDate(entries: CfbLedgerEntry[]): CfbLedgerEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Only CFB entries, funT defaulted, ascending by date. Anything else on the wire is dropped. */
export function cfbEntriesOf(x: unknown): CfbLedgerEntry[] {
  if (!Array.isArray(x)) return [];
  return sortByDate(x.filter(isCfbEntry).map((e) => (Array.isArray(e.funT) ? e : { ...e, funT: [] })));
}

export function readCfbLedger(): CfbLedgerEntry[] {
  const raw = rawItem(CFB_KEYS.ledger);
  if (!raw) return [];
  try {
    return cfbEntriesOf(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Replaces the device record. Returns false when the device could not persist it. */
export function writeCfbLedger(entries: CfbLedgerEntry[]): boolean {
  const ok = setRaw(CFB_KEYS.ledger, JSON.stringify(cfbEntriesOf(entries)));
  bump();
  return ok;
}

export function findCfbEntry(date: string): CfbLedgerEntry | null {
  return readCfbLedger().find((e) => e.date === date) ?? null;
}

const SETTLED = new Set(["won", "lost", "push"]);
const settled = (r: string | undefined) => r != null && SETTLED.has(r);

/**
 * Overlay incoming grading onto the current grading: a settled result is never overwritten,
 * a pending / missing one takes the incoming result. `done` is recomputed from the entry's
 * own tickets so it can never claim more than the merged map holds.
 */
function overlayGrading(cur: CfbGrading | null | undefined, inc: CfbGrading | null | undefined, entry: CfbLedgerEntry): CfbGrading | null {
  if (!inc) return cur ?? null;
  if (!cur) return inc;
  const tickets = { ...(cur.tickets ?? {}) };
  for (const [id, g] of Object.entries(inc.tickets ?? {})) {
    if (g && !settled(tickets[id]?.result)) tickets[id] = g;
  }
  const legs = { ...(cur.legs ?? {}) };
  for (const [key, g] of Object.entries(inc.legs ?? {})) {
    if (g && !settled(legs[key]?.result)) legs[key] = g;
  }
  const done = [...entry.core, ...entry.funT].every((t) => settled(tickets[t.id]?.result));
  return { tickets, legs, done };
}

/**
 * Pure upsert. A date that is already locked KEEPS its core / funT / stakes / lockedAt — the
 * lock is once per slate date — and only its grading and games map are overlaid from the
 * incoming copy. `refused` says an existing lock stood.
 */
export function upsertCfbEntries(
  entries: CfbLedgerEntry[],
  entry: CfbLedgerEntry,
): { entries: CfbLedgerEntry[]; entry: CfbLedgerEntry; refused: boolean } {
  const i = entries.findIndex((e) => e.date === entry.date);
  if (i < 0) return { entries: sortByDate([...entries, entry]), entry, refused: false };
  const cur = entries[i];
  const kept: CfbLedgerEntry = {
    ...cur,
    games: { ...(entry.games ?? {}), ...(cur.games ?? {}) },
    grading: overlayGrading(cur.grading, entry.grading, cur),
  };
  const next = entries.slice();
  next[i] = kept;
  return { entries: next, entry: kept, refused: true };
}

export function upsertCfbEntry(entry: CfbLedgerEntry): { entries: CfbLedgerEntry[]; entry: CfbLedgerEntry; refused: boolean } {
  const r = upsertCfbEntries(readCfbLedger(), entry);
  writeCfbLedger(r.entries);
  return r;
}

/** Store the grader's verdict for a date (deterministic from finals — a re-run replaces). */
export function applyCfbGrading(date: string, grading: CfbGrading): CfbLedgerEntry | null {
  const entries = readCfbLedger();
  const i = entries.findIndex((e) => e.date === date);
  if (i < 0) return null;
  const next = entries.slice();
  next[i] = { ...entries[i], grading, gradedAt: Date.now() };
  writeCfbLedger(next);
  return next[i];
}

/* ---------- bank (base $2,500 + logged moves + graded P/L, its own key) ---------- */

export function readCfbBankStore(): BankStore | null {
  const raw = rawItem(CFB_KEYS.bank);
  if (!raw) return null;
  try {
    const v = validateBankStore(JSON.parse(raw));
    return v.ok ? v.store : null;
  } catch {
    return null;
  }
}

export function writeCfbBankStore(store: BankStore): boolean {
  const ok = setRaw(CFB_KEYS.bank, JSON.stringify(store));
  bump();
  return ok;
}

/** The persisted bank store, initialized on first use. */
export function getCfbBankStore(): BankStore {
  const cur = readCfbBankStore();
  if (cur) return cur;
  const store: BankStore = { ...DEFAULT_BANK, log: [] };
  writeCfbBankStore(store);
  return store;
}

export function addCfbBankAdjustment(kind: "deposit" | "withdrawal", amt: number, note: string): BankStore {
  const store = getCfbBankStore();
  const clean = Math.max(0, Math.round(Number(amt) || 0));
  if (!(clean > 0)) return store;
  const next: BankStore = { ...store, log: [...store.log, { ts: Date.now(), kind, amt: clean, note: (note || "").slice(0, 120) }] };
  writeCfbBankStore(next);
  return next;
}

/** The one true CFB bankroll: base + logged adjustments + realized graded CFB P/L. Read-only
    (no first-use write) so it is safe to call from a render body or a query key. */
export function getCfbBankroll(): number {
  return cfbBankroll(readCfbBankStore() ?? DEFAULT_BANK, readCfbLedger());
}

/** Locked exposure (CORE + FUN stakes) for a slate date, in dollars. */
export function cfbExposure(date: string): number {
  return todayExposure(readCfbLedger(), date);
}

/* ---------- export / import / wipe ---------- */

export function exportCfbLedger(): string {
  return JSON.stringify(readCfbLedger(), null, 2);
}

export type CfbImportResult = { ok: true; entries: CfbLedgerEntry[]; added: number; merged: number } | { ok: false; error: string };

/** Merge an exported record into this device (union by date, richer day wins, accruals
    overlaid — the same kernel sync uses). Accepts the bare array or `{ ledger: [...] }`. */
export function importCfbLedger(text: string): CfbImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  const wrapped = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { ledger?: unknown }).ledger : undefined;
  const list = Array.isArray(parsed) ? parsed : Array.isArray(wrapped) ? wrapped : null;
  if (!list) return { ok: false, error: "expected a ledger array" };
  const v = validateLedger(list);
  if (!v.ok) return { ok: false, error: v.error };
  const foreign = v.entries.find((e) => e.sport !== "cfb");
  if (foreign) return { ok: false, error: `entry ${foreign.date} is not a cfb entry (sport must be "cfb")` };
  const local = readCfbLedger();
  const have = new Set(local.map((e) => e.date));
  const merged = cfbEntriesOf(mergeLedgers(local, v.entries));
  const added = merged.filter((e) => !have.has(e.date)).length;
  const overlapped = v.entries.filter((e) => have.has(e.date)).length;
  if (!writeCfbLedger(merged)) return { ok: false, error: "device storage unavailable" };
  return { ok: true, entries: merged, added, merged: overlapped };
}

/** Drops the CFB ledger and bank from THIS device only (the cloud copy refills it on sync). */
export function wipeCfbDevice(): void {
  removeRaw(CFB_KEYS.ledger);
  removeRaw(CFB_KEYS.bank);
  bump();
}

/* ---------- actions (pure modules do the work; this stores the result) ---------- */

/** Lock a built card for its slate date. A date already locked is returned as-is with
    `refused: true` — the second press of LOCK can never re-stake a Saturday. */
export function lockCfb(card: CfbCard, board: CfbBoard): { entry: CfbLedgerEntry; refused: boolean } {
  const existing = findCfbEntry(card.date);
  if (existing) return { entry: existing, refused: true };
  const entry = lockCfbCard(card, board, Date.now());
  const r = upsertCfbEntry(entry);
  return { entry: r.entry, refused: r.refused };
}

/** Grade a locked date against ESPN finals and store the verdict. Null when nothing is locked. */
export function gradeCfb(date: string, finals: CfbFinals): CfbGrading | null {
  const entry = findCfbEntry(date);
  if (!entry) return null;
  const grading = gradeCfbEntry(entry, finals);
  applyCfbGrading(date, grading);
  return grading;
}

/* ---------- the hook ---------- */

export type CfbLedgerSnapshot = {
  entries: CfbLedgerEntry[];
  bankStore: BankStore;
  bankroll: number;
  stats: { core: CfbStats; fun: CfbStats };
};

function compute(entries: CfbLedgerEntry[], bankStore: BankStore): CfbLedgerSnapshot {
  return {
    entries,
    bankStore,
    bankroll: cfbBankroll(bankStore, entries),
    stats: { core: cfbLedgerStats(entries, "core"), fun: cfbLedgerStats(entries, "fun") },
  };
}

let cachedVersion = -1;
let cached: CfbLedgerSnapshot | null = null;
function snapshot(): CfbLedgerSnapshot {
  if (cached && cachedVersion === version) return cached;
  cached = compute(readCfbLedger(), readCfbBankStore() ?? DEFAULT_BANK);
  cachedVersion = version;
  return cached;
}

let empty: CfbLedgerSnapshot | null = null;
function serverSnapshot(): CfbLedgerSnapshot {
  if (!empty) empty = compute([], DEFAULT_BANK);
  return empty;
}

function subscribe(cb: () => void): () => void {
  const onExternal = () => {
    version++;
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CFB_KEYS.ledger || e.key === CFB_KEYS.bank) onExternal();
  };
  window.addEventListener(CFB_CHANGE_EVENT, cb);
  window.addEventListener(CFB_SYNC_EVENT, onExternal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CFB_CHANGE_EVENT, cb);
    window.removeEventListener(CFB_SYNC_EVENT, onExternal);
    window.removeEventListener("storage", onStorage);
  };
}

/* stable identities — safe in effect dependency arrays */
const ACTIONS = {
  addAdjustment: addCfbBankAdjustment,
  lock: lockCfb,
  grade: gradeCfb,
  importText: importCfbLedger,
  exportText: exportCfbLedger,
  wipe: wipeCfbDevice,
} as const;

/** Everything the CFB Ledger / Builder / Settings need, live from the device record. Empty on
    the server and during hydration; the real record appears right after mount. */
export function useCfbLedger() {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { ...snap, ...ACTIONS };
}
