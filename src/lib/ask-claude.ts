/**
 * ASK CLAUDE, WITH NO KEY (2026-11-15, Josh: "add claude to parlay lab and add the use count to each
 * users plan (I would be signed in through my own account so it will use my own claude usage)", then:
 * "No one needs an API key; it is not required").
 *
 * A website cannot spend a person's Claude plan from inside itself. What it can do is hand the
 * question to Claude, where that person is already signed in: the button copies the question to the
 * clipboard and opens Claude with it filled in. The answer is written in Claude, on that person's
 * own account and plan. Nothing here calls an API, holds a key or costs this app anything.
 *
 * Pure: the question is built only from what is already on the screen (the same prices, dollars and
 * estimates), never from a secret, a name or an email. The count is how many questions THIS DEVICE
 * has sent, kept on the device; the app cannot see anyone's Claude plan usage and never claims to.
 */

export const ASK_CLAUDE_BASE = "https://claude.ai/new";
/** the longest question handed over, in characters: a link much longer than this may not open */
export const PROMPT_MAX = 6000;
/** how many possible picks a ticket question lists before it says how many more there are */
export const ASK_OPTIONS_MAX = 25;

const FRAME = "These are paper picks from my own tracking app, Parlay Lab. Nothing here is a real wager. Give me your honest read; this is for information only, not betting advice.";

export function clipPrompt(text: string, max: number = PROMPT_MAX): string {
  if (text.length <= max) return text;
  const tail = "\n[list cut short to fit]";
  return text.slice(0, Math.max(0, max - tail.length)) + tail;
}

export function askClaudeUrl(prompt: string): string {
  return `${ASK_CLAUDE_BASE}?q=${encodeURIComponent(clipPrompt(prompt))}`;
}

/* ------------------------------------------------------------------ the card */

export type AskCardPick = { selection: string; event: string; kickoff: string; price: string; bookName: string; bet: string; toWin: string; ev: string };

/** the open locked picks of one desk, as a question */
export function cardPrompt(desk: string, picks: readonly AskCardPick[], staked: string): string {
  const lines = picks.map((p, i) => `${i + 1}. ${p.selection} (${p.event}, ${p.kickoff} PT) at ${p.price} on ${p.bookName}. Bet ${p.bet} to win ${p.toWin}. The app's estimated edge: ${p.ev}.`);
  return clipPrompt([
    FRAME,
    "",
    `My ${desk} card has ${picks.length} open pick${picks.length === 1 ? "" : "s"}, ${staked} staked in total:`,
    ...lines,
    "",
    "For each pick, what is the main risk? Which do you trust most and least, and why? Is anything here too correlated with another pick?",
  ].join("\n"));
}

/* ---------------------------------------------------------------- the ticket */

export type AskLeg = { label: string; sub: string; am: number; prob: number; src?: "model" | "market"; gameLabel?: string };

const amText = (am: number) => (am > 0 ? `+${am}` : String(am));
const legLine = (l: AskLeg) =>
  `${l.label}, ${l.sub}${l.gameLabel ? ` (${l.gameLabel})` : ""} at ${amText(l.am)}. ${l.src === "market" ? "Market estimate" : "Model estimate"} ${l.prob.toFixed(1)}%.`;

/**
 * The parlay on screen and the picks that could fill its open slots. `options` is already in the
 * order the list shows; only the first ASK_OPTIONS_MAX are written out, and the true total is stated
 * so a short list is never passed off as the whole one.
 */
export function ticketPrompt(a: { legs: readonly AskLeg[]; lockedIdx: readonly number[]; options: readonly AskLeg[]; open: number }): string {
  const locked = new Set(a.lockedIdx);
  const out: string[] = [FRAME, ""];
  if (a.legs.length) {
    out.push(`My parlay has ${a.legs.length} leg${a.legs.length === 1 ? "" : "s"}:`);
    a.legs.forEach((l, i) => out.push(`${i + 1}. ${locked.has(i) ? "[LOCKED] " : ""}${legLine(l)}`));
    out.push("");
  }
  if (a.open > 0 && a.options.length) {
    const shown = a.options.slice(0, ASK_OPTIONS_MAX);
    out.push(`${a.options.length} pick${a.options.length === 1 ? "" : "s"} could fill my ${a.open} open slot${a.open === 1 ? "" : "s"}${shown.length < a.options.length ? ` (showing ${shown.length} of ${a.options.length}, best estimated chance first)` : ""}:`);
    shown.forEach((l) => out.push(`- ${legLine(l)}`));
    out.push("");
    out.push(`Which of these would you take for the open slot${a.open === 1 ? "" : "s"}, and why? Flag any that are too correlated with a leg I already have. The estimates are the app's, not certainties.`);
  } else {
    out.push("What is the weakest leg here and why? Is anything too correlated? The estimates are the app's, not certainties.");
  }
  return clipPrompt(out.join("\n"));
}

/* ------------------------------------------------------------------ the count */

export const ASK_USAGE_KEY = "pl_ask_claude_usage";
export type AskUsage = { month: string; count: number; total: number };
type Store = Pick<Storage, "getItem" | "setItem">;

/** the device's own calendar month, "2026-11" */
export function monthOf(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const whole = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

/** questions sent from this device: this month and ever. A missing, blocked or damaged record reads as zero. */
export function readAskUsage(store: Store | null | undefined, now: number): AskUsage {
  const month = monthOf(now);
  try {
    const raw = store?.getItem(ASK_USAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<AskUsage>) : null;
    if (!v || typeof v !== "object") return { month, count: 0, total: 0 };
    const total = whole(v.total);
    return { month, count: v.month === month ? Math.min(whole(v.count), total) : 0, total };
  } catch {
    return { month, count: 0, total: 0 };
  }
}

/** one more question sent; returns the new count, and still returns it when the device refuses to store it */
export function bumpAskUsage(store: Store | null | undefined, now: number): AskUsage {
  const cur = readAskUsage(store, now);
  const next = { month: cur.month, count: cur.count + 1, total: cur.total + 1 };
  try {
    store?.setItem(ASK_USAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode or a full store: the question still goes, it is only not counted */
  }
  return next;
}

export function askUsageText(u: AskUsage): string {
  return `${u.count} question${u.count === 1 ? "" : "s"} this month · ${u.total} all time`;
}

/* ------------------------------------------------------- a Claude that knows the project */

/**
 * THE PROJECT LINK (2026-11-15, Josh: "the integrated 'ask claude' button should function based on
 * direct knowledge of the entire artifact ... it should ping back to this chat or a chat that has
 * read every single part of the artifact files/md/master plan/etc").
 *
 * A link cannot reach a coding session, and a fresh chat knows nothing about Parlay Lab. A Claude
 * PROJECT does: every chat started inside it reads the project's knowledge (the repository and its
 * documents, which the owner connects once, in Claude). So the device can store the address of that
 * project, and the button then opens the project instead of a blank chat. The address is not a
 * secret (it opens only for the signed-in owner), it stays on the device, and only an address on
 * claude.ai's own project path is accepted.
 */
export const ASK_PROJECT_KEY = "pl_ask_claude_project";
const PROJECT_PATH = /^\/project\/[A-Za-z0-9-]{8,64}$/;

/** the project's address with nothing extra on it, or null when it is not a Claude project address */
export function cleanProjectUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.hostname !== "claude.ai" || u.port || u.username || u.password) return null;
    const p = u.pathname.replace(/\/+$/, "");
    return PROJECT_PATH.test(p) ? `https://claude.ai${p}` : null;
  } catch {
    return null;
  }
}

export function readAskProject(store: Store | null | undefined): string | null {
  try {
    return cleanProjectUrl(store?.getItem(ASK_PROJECT_KEY));
  } catch {
    return null;
  }
}

/** store a project address, or clear it with null/empty; returns what is now stored, or "bad" for a refused address */
export function saveAskProject(store: (Store & Pick<Storage, "removeItem">) | null | undefined, raw: string | null): string | null | "bad" {
  try {
    if (!raw || !raw.trim()) { store?.removeItem(ASK_PROJECT_KEY); return null; }
    const clean = cleanProjectUrl(raw);
    if (!clean) return "bad";
    store?.setItem(ASK_PROJECT_KEY, clean);
    return clean;
  } catch {
    return "bad";
  }
}

/**
 * Where the button goes. With a project stored: the project itself, and the question travels on the
 * clipboard (a project page takes no question in its address). Without one: a new chat with the
 * question in the address.
 */
export function askTarget(prompt: string, project: string | null): { href: string; inProject: boolean } {
  const clean = cleanProjectUrl(project);
  return clean ? { href: clean, inProject: true } : { href: askClaudeUrl(prompt), inProject: false };
}
