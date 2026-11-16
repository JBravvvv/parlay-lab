import { createHash, randomBytes } from "node:crypto";
import { ASK_TTL_S, cleanAnswer, cleanPairCode, cleanQuestion, type AskAnswer, type StoredQuestion } from "@/lib/ask-mailbox";

/**
 * The Ask Claude mailbox (see src/lib/ask-mailbox.ts for the whole design). Four small handlers
 * over a three-command store, injectable so they are tested without one.
 *
 * Who may do what:
 *   ask / read    the owner's page: the sync phrase, like every other gated route
 *   take / answer the answering chat: the pairing code, which is stored only as its hash
 * A stranger can do nothing here: no question goes in without the phrase, and none comes out or
 * is answered without the code. Every value is small and expires by itself in ASK_TTL_S.
 */
export type AskKv = {
  get(key: string): Promise<string | null>;
  /** read and delete in one step, so a question is handed out once */
  take(key: string): Promise<string | null>;
  setEx(key: string, value: string, seconds: number): Promise<void>;
};
export type RedisRun = (cmd: unknown[]) => Promise<unknown>;
const text = (v: unknown): string | null => (v == null ? null : typeof v === "string" ? v : String(v));

export function askKv(run: RedisRun): AskKv {
  return {
    async get(key) { return text(await run(["GET", key])); },
    async take(key) { return text(await run(["GETDEL", key])); },
    async setEx(key, value, seconds) { await run(["SET", key, value, "EX", Math.max(1, Math.round(seconds))]); },
  };
}

export const boxOf = (code: string) => createHash("sha256").update(`pl-ask:${code}`).digest("hex").slice(0, 40);
const qKey = (box: string) => `pl:ask:q:${box}`;
const ownerKey = (id: string) => `pl:ask:o:${id}`;
const aKey = (id: string) => `pl:ask:a:${id}`;

export type Out = { status: number; body: Record<string, unknown> };
const out = (status: number, body: Record<string, unknown>): Out => ({ status, body });
const parse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

export type AskAccess = { synced: boolean; configured: boolean; code: string | null };

/** the page asks: one question per mailbox at a time, the newest wins */
export async function handleAsk(a: AskAccess, body: unknown, kv: AskKv, now: number, newId: () => string = () => randomBytes(12).toString("hex")): Promise<Out> {
  if (!a.configured) return out(503, { ok: false, error: "not-configured" });
  if (!a.synced) return out(401, { ok: false, error: "sync" });
  const code = cleanPairCode(a.code);
  if (!code) return out(400, { ok: false, error: "pair" });
  const q = cleanQuestion(body);
  if (!q) return out(400, { ok: false, error: "question" });
  const id = newId();
  const box = boxOf(code);
  const stored: StoredQuestion = { ...q, id, at: now };
  await kv.setEx(ownerKey(id), box, ASK_TTL_S);
  await kv.setEx(qKey(box), JSON.stringify(stored), ASK_TTL_S);
  return out(200, { ok: true, id });
}

/** the page reads the answer to its own question */
export async function handleRead(a: AskAccess, id: string | null, kv: AskKv): Promise<Out> {
  if (!a.configured) return out(503, { ok: false, error: "not-configured" });
  if (!a.synced) return out(401, { ok: false, error: "sync" });
  if (!id || !/^[a-f0-9]{16,64}$/.test(id)) return out(400, { ok: false, error: "id" });
  const ans = parse<AskAnswer>(await kv.get(aKey(id)));
  return out(200, { ok: true, answer: ans ? { id: ans.id, legIds: ans.legIds, summary: ans.summary, at: ans.at } : null });
}

/** the answering chat takes the waiting question, once */
export async function handleTake(a: AskAccess, kv: AskKv): Promise<Out> {
  if (!a.configured) return out(503, { q: null, error: "not-configured" });
  const code = cleanPairCode(a.code);
  if (!code) return out(401, { q: null, error: "pair" });
  const q = parse<StoredQuestion>(await kv.take(qKey(boxOf(code))));
  return out(200, { q });
}

/** the answering chat answers a question that came from ITS mailbox */
export async function handleAnswer(a: AskAccess, body: unknown, kv: AskKv, now: number): Promise<Out> {
  if (!a.configured) return out(503, { ok: false, error: "not-configured" });
  const code = cleanPairCode(a.code);
  if (!code) return out(401, { ok: false, error: "pair" });
  const ans = cleanAnswer(body, now);
  if (!ans) return out(400, { ok: false, error: "answer" });
  if ((await kv.get(ownerKey(ans.id))) !== boxOf(code)) return out(404, { ok: false, error: "unknown-question" });
  await kv.setEx(aKey(ans.id), JSON.stringify(ans), ASK_TTL_S);
  return out(200, { ok: true });
}
