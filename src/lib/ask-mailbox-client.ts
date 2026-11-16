import { ASK_PAIR_KEY, ASK_POLL_MS, ASK_WAIT_MS, cleanPairCode, type AskQuestion } from "@/lib/ask-mailbox";

/**
 * The page's two calls to the Ask Claude mailbox (src/lib/ask-mailbox.ts). The only networked part
 * of Ask Claude, kept apart from the keyless link (src/lib/ask-claude.ts) on purpose. Both calls go
 * to this app's own /api/ask and carry the owner's sync phrase; neither reaches Claude or any key.
 */
type Fetch = typeof fetch;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readPairCode(store: Pick<Storage, "getItem"> | null | undefined): string | null {
  try {
    return cleanPairCode(store?.getItem(ASK_PAIR_KEY));
  } catch {
    return null;
  }
}

/** store a code, or clear it with null/empty; "bad" for something that is not a code */
export function savePairCode(store: Store | null | undefined, raw: string | null): string | null | "bad" {
  try {
    if (!raw || !raw.trim()) { store?.removeItem(ASK_PAIR_KEY); return null; }
    const c = cleanPairCode(raw);
    if (!c) return "bad";
    store?.setItem(ASK_PAIR_KEY, c);
    return c;
  } catch {
    return "bad";
  }
}

export type SendResult = { ok: true; id: string } | { ok: false; why: "signin" | "error" };

export async function sendQuestion(q: AskQuestion, a: { sync: string; code: string; fetcher?: Fetch }): Promise<SendResult> {
  try {
    const r = await (a.fetcher ?? fetch)("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json", "x-pl-sync": a.sync, "x-pl-ask": a.code },
      body: JSON.stringify(q),
      cache: "no-store",
    });
    if (r.status === 401) return { ok: false, why: "signin" };
    const j = (await r.json()) as { ok?: boolean; id?: string };
    return r.ok && j.ok && typeof j.id === "string" ? { ok: true, id: j.id } : { ok: false, why: "error" };
  } catch {
    return { ok: false, why: "error" };
  }
}

export type Answer = { legIds: string[]; summary: string };

/** ask for the answer until it is there or the wait runs out; null = Claude did not answer in time */
export async function awaitAnswer(id: string, a: {
  sync: string; fetcher?: Fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; waitMs?: number; pollMs?: number; alive?: () => boolean;
}): Promise<Answer | null> {
  const now = a.now ?? Date.now;
  const sleep = a.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const until = now() + (a.waitMs ?? ASK_WAIT_MS);
  while (now() < until && (a.alive?.() ?? true)) {
    await sleep(a.pollMs ?? ASK_POLL_MS);
    try {
      const r = await (a.fetcher ?? fetch)(`/api/ask?id=${encodeURIComponent(id)}`, { headers: { "x-pl-sync": a.sync }, cache: "no-store" });
      if (r.status === 401) return null;
      const j = (await r.json()) as { answer?: { legIds?: unknown; summary?: unknown } | null };
      const ans = j.answer;
      if (ans && typeof ans.summary === "string") {
        return { legIds: Array.isArray(ans.legIds) ? ans.legIds.filter((x): x is string => typeof x === "string") : [], summary: ans.summary };
      }
    } catch {
      /* a dropped poll is not an answer: keep waiting */
    }
  }
  return null;
}
