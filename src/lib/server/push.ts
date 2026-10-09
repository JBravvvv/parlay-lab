import webpush from "web-push";
import { redis, redisGetJson, redisSetJson } from "@/lib/server/store";
import {
  ALERT_SPORTS,
  LEDGER_KEYS,
  alertBody,
  alertKey,
  alertTitle,
  type AlertEntry,
  type AlertSport,
  type AlertTicket,
} from "@/lib/bet-alert";

/**
 * BET ALERTS — the sender (2026-10-09, Josh's words in src/lib/bet-alert.ts).
 *
 * WHEN: `notifyNewBets` runs right after every lock write that can add a found bet (MLB writeLock, the
 * football found pass and found first lock), so "found, added, locked, notified" happen in the same
 * request. Every scheduler poke runs it again as the retry.
 *
 * WHAT NEVER CHANGES: the locked ticket. The alert record lives in its OWN key per ticket
 * (`pl:push:t:<sport>:<date>:<id>`). Writing a "notified" stamp onto the ticket would break the
 * append-only check that every lock write enforces.
 *
 * ONE ALERT PER BET: a ticket whose record says sent / no-device / no-config / gave-up is never sent
 * again. A short lease stops two overlapping runs from both sending. A failed send never touches the
 * lock. It is recorded as failed, retried on the next poke, and abandoned after MAX_ATTEMPTS.
 *
 * NO FLOOD: only `found` tickets locked at or after PUSH_SINCE and within the last ALERT_WINDOW_MS
 * qualify, and a bet locked while no phone was subscribed is recorded as `no-device` (terminal), so
 * subscribing later never replays a backlog.
 */

export const PUSH_SINCE = Date.parse("2026-10-09T00:00:00-07:00");
export const ALERT_WINDOW_MS = 12 * 3600_000;
export const MAX_ATTEMPTS = 5;
export const SUBS_KEY = "pl:push:subs:v1";
export const MAX_SUBS = 10;
const RECORD_TTL_SEC = 21 * 86400;
const LEASE_MS = 60_000;

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string }; addedAt: number; ua?: string };
export type AlertRecord = {
  status: "sent" | "failed" | "no-device" | "no-config" | "gave-up";
  at: number;
  attempts: number;
  delivered?: number;
  error?: string;
  title?: string;
  body?: string;
};
const TERMINAL = new Set<AlertRecord["status"]>(["sent", "no-device", "no-config", "gave-up"]);

export const recordKey = (k: string) => `pl:push:t:${k}`;

export function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || "https://parlay-lab-six.vercel.app" };
}

export async function readSubs(): Promise<PushSub[]> {
  const s = await redisGetJson<PushSub[]>(SUBS_KEY);
  return Array.isArray(s) ? s.filter((x) => x && typeof x.endpoint === "string" && x.keys?.p256dh && x.keys?.auth) : [];
}

export function validSub(x: unknown): x is Omit<PushSub, "addedAt"> {
  const s = x as PushSub;
  return (
    !!s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === "string" && typeof s.keys?.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100
  );
}

export async function addSub(sub: Omit<PushSub, "addedAt">, now: number, ua?: string): Promise<number> {
  const cur = (await readSubs()).filter((s) => s.endpoint !== sub.endpoint);
  const next = [...cur, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, addedAt: now, ...(ua ? { ua: ua.slice(0, 160) } : {}) }].slice(-MAX_SUBS);
  await redisSetJson(SUBS_KEY, next);
  return next.length;
}

export async function removeSub(endpoint: string): Promise<number> {
  const next = (await readSubs()).filter((s) => s.endpoint !== endpoint);
  await redisSetJson(SUBS_KEY, next);
  return next.length;
}

export type SendResult = { delivered: number; failed: number; gone: number; error?: string };
export type Sender = (sub: PushSub, payload: string) => Promise<{ statusCode: number }>;

function defaultSender(): Sender | null {
  const v = vapid();
  if (!v) return null;
  return (sub, payload) => webpush.sendNotification(sub, payload, { vapidDetails: v, TTL: 6 * 3600, urgency: "high" });
}

/** one payload to every subscribed device; expired subscriptions (404/410) are dropped from the store */
export async function sendToAll(payload: { title: string; body: string; url?: string; tag?: string }, send: Sender | null = defaultSender()): Promise<SendResult> {
  if (!send) return { delivered: 0, failed: 0, gone: 0, error: "no-config" };
  const subs = await readSubs();
  if (!subs.length) return { delivered: 0, failed: 0, gone: 0, error: "no-device" };
  const body = JSON.stringify(payload);
  let delivered = 0, failed = 0;
  const gone: string[] = [];
  let lastErr = "";
  await Promise.all(
    subs.map(async (s) => {
      try {
        await send(s, body);
        delivered++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
        else {
          failed++;
          lastErr = `${code ?? ""} ${(e as Error).message ?? e}`.trim().slice(0, 200);
        }
      }
    }),
  );
  if (gone.length) {
    const keep = (await readSubs()).filter((s) => !gone.includes(s.endpoint));
    await redisSetJson(SUBS_KEY, keep);
  }
  if (!delivered && !failed) return { delivered, failed, gone: gone.length, error: "no-device" };
  return { delivered, failed, gone: gone.length, ...(lastErr ? { error: lastErr } : {}) };
}

/** the found tickets of one ledger that qualify for an alert right now, oldest first */
export function alertCandidates(sport: AlertSport, ledger: AlertEntry[], now: number): Array<{ key: string; t: AlertTicket; date: string }> {
  const out: Array<{ key: string; t: AlertTicket; date: string; at: number; i: number }> = [];
  let i = 0;
  for (const e of ledger ?? []) {
    if (!e?.locked) continue;
    for (const t of [...(e.core ?? []), ...(e.funT ?? [])]) {
      i++;
      const at = Number(t?.foundAt);
      if (!t?.id || t.found !== true || !Number.isFinite(at) || !(Number(t.stake) > 0)) continue;
      if (at < PUSH_SINCE || now - at > ALERT_WINDOW_MS || at > now + 60_000) continue;
      out.push({ key: alertKey(sport, e.date, String(t.id)), t, date: e.date, at, i });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.i - b.i).map(({ key, t, date }) => ({ key, t, date }));
}

export type NotifyReport = { sport: AlertSport; candidates: number; sent: number; failed: number; skipped: number; recorded: Record<string, number>; error?: string };

/**
 * Send the alert for every qualifying bet that has none yet. NEVER THROWS — the caller has already
 * locked, and nothing here may undo or block that.
 */
export async function notifyNewBets(sports: readonly AlertSport[] = ALERT_SPORTS, now: number = Date.now(), send?: Sender | null): Promise<NotifyReport[]> {
  const reports: NotifyReport[] = [];
  const sender = send === undefined ? defaultSender() : send;
  for (const sport of sports) {
    const rep: NotifyReport = { sport, candidates: 0, sent: 0, failed: 0, skipped: 0, recorded: {} };
    try {
      const raw = (await redis(["GET", LEDGER_KEYS[sport]])) as string | null;
      const ledger = raw ? ((JSON.parse(raw) as { ledger?: AlertEntry[] }).ledger ?? []) : [];
      const cands = alertCandidates(sport, ledger, now);
      rep.candidates = cands.length;
      /* one read for every candidate's record — a poke over a day already alerted costs a single MGET */
      const prevs = await readAlertRecords(cands.map((c) => c.key));
      for (const { key, t } of cands) {
        const rk = recordKey(key);
        const prev = prevs[key] ?? null;
        if (prev && TERMINAL.has(prev.status)) { rep.skipped++; continue; }
        const lease = await redis(["SET", `${rk}:lease`, String(now), "NX", "PX", LEASE_MS]);
        if (lease !== "OK") { rep.skipped++; continue; }
        const title = alertTitle(sport);
        const body = alertBody(t);
        const attempts = (prev?.attempts ?? 0) + 1;
        let rec: AlertRecord;
        try {
          const r = await sendToAll({ title, body, url: "/taken", tag: key }, sender);
          if (r.delivered > 0) rec = { status: "sent", at: now, attempts, delivered: r.delivered, title, body };
          else if (r.error === "no-device" || r.error === "no-config") rec = { status: r.error, at: now, attempts, title, body };
          else rec = { status: attempts >= MAX_ATTEMPTS ? "gave-up" : "failed", at: now, attempts, error: r.error ?? "send failed", title, body };
        } catch (e) {
          rec = { status: attempts >= MAX_ATTEMPTS ? "gave-up" : "failed", at: now, attempts, error: String((e as Error).message ?? e).slice(0, 200), title, body };
        }
        await redis(["SET", rk, JSON.stringify(rec), "EX", RECORD_TTL_SEC]);
        await redis(["DEL", `${rk}:lease`]).catch(() => null);
        rep.recorded[rec.status] = (rep.recorded[rec.status] ?? 0) + 1;
        if (rec.status === "sent") rep.sent++;
        if (rec.status === "failed" || rec.status === "gave-up") {
          rep.failed++;
          console.warn(`[push] ALERT NOT DELIVERED ${key} (attempt ${attempts}/${MAX_ATTEMPTS}): ${rec.error} — the bet stays locked; the next poke retries`);
        }
      }
    } catch (e) {
      rep.error = String((e as Error).message ?? e).slice(0, 200);
      console.warn(`[push] the ${sport} alert pass failed — the lock is unaffected: ${rep.error}`);
    }
    if (rep.sent || rep.failed) console.log(`[push] ${sport}: ${rep.sent} sent, ${rep.failed} failed of ${rep.candidates} candidates`);
    reports.push(rep);
  }
  return reports;
}

/** alert records for feed rows (one MGET), keyed by alert key */
export async function readAlertRecords(keys: string[]): Promise<Record<string, AlertRecord>> {
  if (!keys.length) return {};
  const vals = (await redis(["MGET", ...keys.map(recordKey)])) as Array<string | null>;
  const out: Record<string, AlertRecord> = {};
  keys.forEach((k, i) => {
    try {
      if (vals?.[i]) out[k] = JSON.parse(vals[i] as string) as AlertRecord;
    } catch {
      /* unreadable record — the row simply shows no alert state */
    }
  });
  return out;
}
