"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getSyncKey } from "@/lib/ledgerSync";

import type { MlbLiveQuote, MlbLiveQuoteBoard } from "./live-quote-types";

/**
 * INSTRUCTION 51 (2026-09-11) — THE BROWSER SIDE OF THE MLB IN-PLAY ODDS PULL.
 *
 * Josh's order, verbatim: "Authorize the live in-play odds pull for MLB". This is the second
 * half of INSTRUCTION 50 item 2. Item 2 shipped the honest half — a prop whose line the live
 * boxscore has already cleared loses its grade, EV and ¼-Kelly and carries a SETTLED tag. This
 * is the half that costs money: a per-event in-play re-price, so the Board can print
 * "over 3.5 at -145" instead of suppressing a dead row.
 *
 * WHAT THIS FILE IS AND IS NOT
 * It is one GET to `/api/mlb/live-props` — the budgeted, server-side, Redis-backed route — and
 * three pure label helpers. It NEVER reaches the Odds API. Every credit decision (which games
 * are worth paying for, the daily budget, the 429 cooldown, the empty-event hold) is made on
 * the server, where the key lives and where the spend can be counted. The browser only reads
 * what the server already bought.
 *
 * NO POLLING, EVER. There is deliberately no `refetchInterval` anywhere in this module — the
 * standing rule the CFB desk set at src/lib/cfb/client.ts:101, for the same reason: a timer on
 * a paid feed spends money while nobody is looking. The query re-reads on the next mount, on
 * window focus, and on Josh's own Refresh tap. `staleTime` is what is LEFT of the overlay's own
 * window (see `mlbLiveStaleMs`), not a fresh window from the moment the fetch resolved.
 */

/** The one route the browser asks for a live MLB price. Nothing else on the Board fetches odds. */
export const MLB_LIVE_ROUTE = "/api/mlb/live-props";

/**
 * THE TWO NUMBERS THE BROWSER ENFORCES, and the only two it needs.
 *
 * WHY THESE ARE NOT IMPORTED FROM `MLB_LIVE_PROPS`, which is where they are authored: that object
 * lives in `src/lib/mlb/live-props-rules.ts`, which imports `REFILL_SLOTS_PT` from
 * `src/lib/server/grading-progress.ts` so the live cadence rides the INSTRUCTION 49 calendar as the
 * SAME array object rather than a copy. Importing it from a `"use client"` module would drag a
 * `src/lib/server/*` module — and its own imports — into the browser bundle, to read two integers.
 * So the browser mirrors the two values and the mirror is PINNED: `tests/board-live-anchor.test.ts`
 * asserts `MLB_LIVE_CLIENT` is field-for-field equal to `MLB_LIVE_PROPS`, so the copies cannot
 * drift. The TYPES above cost nothing to import (a type-only import is erased) and so are imported.
 *
 * `quoteMaxAgeSec` is a HARD RENDER-TIME DROP, not a display hint: a stored quote older than this
 * is discarded by the Board even if Redis still holds it, so no live label older than the cap can
 * ever appear on screen. `dailyBudget` is the denominator of the header's credit chip — Josh
 * authorised this spend, so he gets to watch it.
 */
export const MLB_LIVE_CLIENT = {
  /** a stored quote past this age is DISCARDED AT RENDER (s) */
  quoteMaxAgeSec: 1800,
  /** the live pull's own daily credit budget — additive, it lowers no existing budget (s §8) */
  dailyBudget: 600,
  /**
   * the per-pass event ceiling. Mirrored (fix pass, 2026-09-11) because the Board's footnote used
   * to print `capped at ${liveOverlay.fetched}` — the number of games this pass HAPPENED to buy,
   * which on a three-event probe reads "capped at 3" and is not the cap at all. The cap is a
   * standing rule and has to be named as one.
   */
  liveMaxEvents: 12,
} as const;

/**
 * The overlay's shapes come from WI-1's canonical `./live-quote-types` — one declaration, shared by
 * the route that writes the overlay and the Board that joins it, so the writer and the reader can
 * never disagree about a field. Re-exported here only so a surface needs one import line.
 *
 * Two units are worth restating because an ambiguous unit is how a probability gets printed 100x
 * wrong: `pLive` is a FRACTION in [0,1] (the engine's `shSimGames(...).legP`), and `evCz` is in
 * PERCENTAGE POINTS like `PickRow.czEv`, so it feeds `gradeFromEv` and `EvBadge` unconverted.
 */
export type { MlbLiveQuote, MlbLiveQuoteBoard };

/**
 * The query key PREFIX — every live-props query for every slate date.
 *
 * Exported (fix pass, 2026-09-11) because Josh's Refresh tap invalidated `["board"]` and
 * `["picks"]` and nothing else, so the one thing he was complaining about — the live price — was
 * the one thing the tap could not refresh. `invalidateQueries` matches by key prefix, so the
 * invalidators name this array rather than re-typing the two strings and drifting from them.
 */
export const MLB_LIVE_QUERY_PREFIX = ["mlb", "live-props"] as const;

/** The query key. One overlay per slate date; the Board's Refresh invalidates it. */
export function mlbLiveQuoteQueryKey(date: string | null | undefined) {
  return [...MLB_LIVE_QUERY_PREFIX, date ?? "today"] as const;
}

/**
 * THE ROW'S OWN SIDE OF THE LIVE QUOTE (fix pass, 2026-09-11) — the single most dangerous defect
 * this overlay could have shipped, and the reason this helper exists rather than a direct
 * `quote.czAm` read at each call site.
 *
 * The overlay is keyed `gkey|lkey`, and an lkey is `player|market|line` — IT CARRIES NO SIDE. So an
 * Over row and an Under row on the same player, market and line read the SAME quote object, and
 * every field on that object is the OVER's: `czAm` is the Over price, `evCz` is the Over's EV,
 * `pLive` is P(over). Rendering those on an Under row hands it the opposite bet's price with the
 * sign kept — an Under whose true edge is negative printed as a green +EV live bet.
 *
 * `mlbLiveView` answers the question once, for the side the row is actually on:
 *   • O — the quote as stored.
 *   • U — the Caesars UNDER at the same live line (`oppAm`), its own EV (`evOpp`, computed by the
 *         route against `1 - pLive`), and the complementary probability. `ln` is shared, because a
 *         line has no side; `books` and `at` are properties of the pull, not of a side.
 * A field the route could not price stays null, and null renders as a dash. Nothing is inferred.
 */
export type MlbLiveView = {
  side: "O" | "U";
  /** the line the book is posting now — shared by both sides */
  ln: number;
  /** the American price for THIS side at that line, or null when the book posts none */
  am: number | null;
  /** EV in percentage points for THIS side, or null */
  ev: number | null;
  /** P(this side) as a fraction in [0,1], or null */
  p: number | null;
  pSrc: MlbLiveQuote["pSrc"];
  books: number;
  at: string;
};

export function mlbLiveView(q: MlbLiveQuote, side: "O" | "U"): MlbLiveView {
  const over = side !== "U";
  return {
    side: over ? "O" : "U",
    ln: q.ln,
    am: over ? q.czAm : q.oppAm,
    ev: over ? q.evCz : q.evOpp ?? null,
    p: q.pLive == null ? null : over ? q.pLive : 1 - q.pLive,
    pSrc: q.pSrc,
    books: q.books,
    at: q.at,
  };
}

/** The staleTime BEFORE an overlay has loaded — the spec's own live re-price window (30 min). */
export const MLB_LIVE_STALE_MS = 1_800_000;

/**
 * The overlay's staleTime: what is LEFT of its own window, measured from `generatedAt`, NOT a
 * fresh window from the moment the fetch resolved.
 *
 * This is the cfbPropsStaleMs fix (src/lib/cfb/client.ts:31-44) applied to a feed where it
 * matters more. The route serves a Redis overlay with its ORIGINAL `generatedAt`, so an overlay
 * that arrives 9 min into a 10-min window is stale in 1 min, not 10 — otherwise a live price
 * could be held for up to twice its window and still look current. A missing or nonsense
 * `ttlSec` falls back to MLB_LIVE_STALE_MS; a future-dated `generatedAt` (clock skew) is treated
 * as brand new rather than as an error.
 */
export function mlbLiveStaleMs(
  board: Pick<MlbLiveQuoteBoard, "ttlSec" | "generatedAt"> | undefined | null,
  now: number = Date.now(),
): number {
  const s = board?.ttlSec;
  const winMs = typeof s === "number" && Number.isFinite(s) && s > 0 ? s * 1000 : MLB_LIVE_STALE_MS;
  if (!board) return winMs;
  const age = now - Date.parse(board.generatedAt);
  return Number.isFinite(age) && age >= 0 ? Math.max(0, winMs - age) : winMs;
}

/** "4:52p" — the clock time a game's live line was pulled, in the viewer's own zone. */
export function mlbLiveClockLabel(iso: string | null | undefined): string {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "—";
  return new Date(t)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?AM$/i, "a")
    .replace(/\s?PM$/i, "p");
}

/**
 * "just now · 4:52p" / "7m · 4:52p" — how fresh THIS GAME's line is, and when it was taken.
 * Age is per game (the overlay's `pricedAt[gkey]`), never board-level: one game turning due
 * cannot make another game's price look older than it is. Under a minute reads "just now"
 * rather than "0m", which would read as a stopped clock.
 */
export function mlbLiveAgeLabel(pricedAtIso: string | null | undefined, now: number = Date.now()): string {
  const clock = mlbLiveClockLabel(pricedAtIso);
  const t = Date.parse(String(pricedAtIso ?? ""));
  if (!Number.isFinite(t)) return clock;
  const secs = Math.floor((now - t) / 1000);
  if (secs < 0) return clock; // clock skew — say when, claim no age
  return `${secs < 60 ? "just now" : `${Math.floor(secs / 60)}m`} · ${clock}`;
}

/**
 * WHY THERE IS NO LIVE PRICE ON THIS ROW — the three answers, counted, never guessed (2026-09-12).
 *
 * `rowLive` in the Board refuses a quote for three different reasons and then renders NOTHING for
 * all three, which from the outside is one symptom — "it isn't updating with live odds" — with no
 * way to tell a missing sync phrase from a book that posts no in-play market from a price that has
 * simply gone stale. Each one has a different answer, and two of them are things Josh can act on:
 *
 *   • NO SYNC PHRASE ON THIS PHONE — `useMlbLiveQuotes` disables itself, so no pull is even asked
 *     for. He fixes this in Settings in ten seconds, and until he is told, he cannot.
 *   • NO LIVE QUOTE FOR THIS GAME — the pass never reached it (the per-pass cap is 3 games until
 *     the probe is measured), or the book posts no in-play market on it. Nothing to do but wait for
 *     the next pass; the row honestly keeps its pregame price.
 *   • THE QUOTE IS OLDER THAN `quoteMaxAgeSec` — Redis still holds it, the screen drops it. This is
 *     the one that looked most like a bug, because a price WAS pulled and still nothing appeared.
 *
 * This is a pure function over counts so both the Board and The Sharp print the same sentence from
 * the same arithmetic, and so it can be tested without a browser. It spends nothing and fetches
 * nothing. It deliberately does NOT start a poll: the standing rule on this paid feed is no
 * `refetchInterval`, and naming a stale price is the honest alternative to quietly re-buying it.
 */
export type MlbLiveGap = {
  /** games under way right now */
  readonly live: number;
  /** of those, carrying a live price the render will actually show */
  readonly priced: number;
  /** of those, with no in-play quote at all */
  readonly noQuote: number;
  /** of those, holding a quote the render-time age cap discards */
  readonly tooOld: number;
};

export function mlbLiveGap(args: {
  /** the gkeys of the games that are under way on THIS render (deduped internally) */
  readonly liveGameKeys: readonly string[];
  /** the overlay's `rows`, keyed `gkey|lkey` — null/undefined when no overlay loaded */
  readonly rows?: Readonly<Record<string, { readonly at: string }>> | null;
  readonly now?: number;
}): MlbLiveGap {
  const now = args.now ?? Date.now();
  const maxAgeMs = MLB_LIVE_CLIENT.quoteMaxAgeSec * 1000;
  const keys = Array.from(new Set(args.liveGameKeys.filter(Boolean)));
  /* the FRESHEST stamp per game, because one game's quotes are bought in a single call and a row
     that is inside the cap is enough to make the game "priced live" on screen. */
  const freshest = new Map<string, number>();
  for (const [k, q] of Object.entries(args.rows ?? {})) {
    const gkey = k.split("|")[0];
    const t = Date.parse(String(q?.at ?? ""));
    if (!Number.isFinite(t)) continue;
    const prev = freshest.get(gkey);
    if (prev == null || t > prev) freshest.set(gkey, t);
  }
  let priced = 0;
  let noQuote = 0;
  let tooOld = 0;
  for (const gkey of keys) {
    const t = freshest.get(gkey);
    if (t == null) noQuote += 1;
    else if (now - t > maxAgeMs) tooOld += 1;
    else priced += 1;
  }
  return { live: keys.length, priced, noQuote, tooOld };
}

/**
 * The same three answers as one line of plain betting English, or null when there is nothing to
 * explain (no game under way, or every game under way is priced live — the footnote already says
 * when those were taken, and a second sentence saying "all good" is noise on a 375px screen).
 *
 * Every number in it is a count off the overlay the server returned. No estimate, no fabrication,
 * and no jargon: Josh reads "no live price yet", not "unmatched event" or "cache miss".
 */
export function mlbLiveGapNote(
  gap: MlbLiveGap,
  opts: { readonly syncReady: boolean | null; readonly overlay: boolean; readonly error?: string | null },
): string | null {
  if (gap.live <= 0) return null;
  const g = (n: number) => (n === 1 ? "game" : "games");
  const under = `${gap.live} ${g(gap.live)} under way`;
  /* AGREES WITH THE COUNT (review round, 2026-09-12): at one game the sentence below read "the 1
     game under way are showing their pregame price", and one game is the commonest weekday evening. */
  const isAre = gap.live === 1 ? "is" : "are";
  const itsTheir = gap.live === 1 ? "its" : "their";
  /* AN OVERLAY IN HAND IS PROOF THE PHRASE WORKS, so the three no-overlay answers are asked first
     and only then the per-game ones.
     `syncReady` IS THREE-VALUED, AND THAT IS THE FIX (review round, 2026-09-12). It is a
     mount-effect read, so on the server render and on the first client pass the phrase has not been
     LOOKED AT yet — which is a different fact from "there is no phrase". The first version of this
     helper asked `!opts.syncReady` and therefore told Josh his phrase wasn't saved for the whole
     interval between hydration and the overlay landing, on a phone where it WAS saved; the comment
     claiming `overlay` was asked first was no protection, because both are falsy in that window. So
     `null` means not read yet and prints the neutral "haven't loaded" sentence; only an actual
     `false` — the read happened and found nothing — blames the phrase. A false reason that sends him
     to Settings to re-enter something already there is worse than no reason at all. */
  if (!opts.overlay) {
    if (opts.syncReady === false) {
      return `no live prices on this phone — your sync phrase isn't saved here, so the Board can't ask the server for in-play odds. Put it in Settings and the ${under} will re-price.`;
    }
    if (opts.error) {
      return `no live prices right now — the server answered "${opts.error}". The ${under} ${isAre} showing ${itsTheir} pregame price.`;
    }
    return `live prices haven't loaded yet — the ${under} ${isAre} showing ${itsTheir} pregame price.`;
  }
  if (gap.noQuote === 0 && gap.tooOld === 0) return null;
  const mins = Math.round(MLB_LIVE_CLIENT.quoteMaxAgeSec / 60);
  const parts: string[] = [];
  if (gap.priced > 0) parts.push(`${gap.priced} of ${under} ${gap.priced === 1 ? "is" : "are"} priced live`);
  if (gap.noQuote > 0) {
    /* TWO CAUSES, NOT ONE (review round, 2026-09-12). This clause used to assert "the last pull did
       not reach them", which the overlay itself can contradict: it carries `noLive` (the book posts
       no in-play market on that game) and `unmatched` (no odds event to match), and the Board prints
       both one line below this sentence. Two explanations for the same games, one of them false, on
       a 375px screen. The counts are not threaded in here — this helper is shared with The Sharp,
       which does not render them — so the honest form is to name both causes and claim neither. */
    parts.push(
      `${gap.noQuote} ${g(gap.noQuote)} ${gap.noQuote === 1 ? "has" : "have"} no live price yet — either the book isn't posting an in-play line on ${gap.noQuote === 1 ? "it" : "them"} or the last pull didn't reach ${gap.noQuote === 1 ? "it" : "them"}, so ${gap.noQuote === 1 ? "that game keeps" : "those games keep"} the pregame price`,
    );
  }
  if (gap.tooOld > 0) {
    parts.push(
      `${gap.tooOld} ${g(gap.tooOld)} ${gap.tooOld === 1 ? "was" : "were"} last priced more than ${mins} minutes ago — too old to call live, so ${gap.tooOld === 1 ? "that game keeps" : "those games keep"} the pregame price`,
    );
  }
  return parts.join(" · ");
}

/**
 * Is a sync phrase stored on this device? (fix pass, 2026-09-11.)
 *
 * `/api/mlb/live-props` answers 401 without one, so `useMlbLiveQuotes` disables itself rather than
 * asking a paid route a question it must refuse. A DISABLED query is indistinguishable from a quiet
 * one at the call site — the Board would simply show no live lines and no reason — so the surfaces
 * read this and say which it is.
 *
 * THREE-VALUED SINCE THE 2026-09-12 REVIEW ROUND: `null` until the mount effect has run, because the
 * value is a localStorage read and a render that disagreed with the server's would be a hydration
 * mismatch — so "not looked at yet" is a real state and it is NOT the same fact as "no phrase
 * stored". Saying "your sync phrase isn't saved here" in that window sends Josh to Settings to
 * re-enter a phrase that is already there. `mlbLiveGapNote` distinguishes the two; INSTRUCTION 51's
 * own `mlb-live-unavailable` paragraph asks `!liveSyncReady`, for which `null` and `false` read
 * alike, so its shipped wording is unchanged by this.
 */
export function useMlbLiveSyncReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => setReady(!!getSyncKey()), []);
  return ready;
}

/**
 * The overlay for a slate date. One GET, no polling, no credits spent by this call on its own —
 * the route decides whether today's budget and cadence allow a pull and answers from Redis when
 * they do not. `enabled` is false without a date, so a loading Board never fires a paid route.
 */
export function useMlbLiveQuotes(date: string | null | undefined) {
  /* THE SYNC PHRASE, WITHOUT WHICH THIS ROUTE ANSWERS 401 (fix pass, 2026-09-11).
     `/api/mlb/live-props` gates on `cronHeaderAuthed(req) || syncAuthed(req)` — the cron header is
     the scheduler's, so a browser must send `x-pl-sync`. It was not sent, so EVERY call from the
     phone 401'd, `retry: false` swallowed it into an error state nothing rendered, and the Board
     silently fell back to pregame numbers: exactly Josh's complaint, with no symptom to read.
     This is the same pattern the refill pill already uses (src/lib/refill-client.ts:14-17). With no
     phrase stored the query is DISABLED rather than left to fail — a paid route is never asked a
     question it must answer 401 to — and `app/board/page.tsx` says so in the footnote. */
  /* read AFTER mount, never during render: `getSyncKey` is a localStorage read, which the server
     render cannot perform, and a query that is enabled on the client but not on the server is a
     hydration mismatch. The first client pass is therefore disabled and the effect enables it. */
  const [key, setKey] = useState("");
  useEffect(() => setKey(getSyncKey()), []);
  return useQuery<MlbLiveQuoteBoard>({
    queryKey: mlbLiveQuoteQueryKey(date),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (date) p.set("date", date);
      const qs = p.toString();
      const r = await fetch(`${MLB_LIVE_ROUTE}${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
        headers: { "x-pl-sync": key || getSyncKey() },
      });
      if (!r.ok) throw new Error(`mlb live props ${r.status}`);
      return (await r.json()) as MlbLiveQuoteBoard;
    },
    /* what is LEFT of the overlay's own window — never a fresh one, and never a poll */
    staleTime: (q) => mlbLiveStaleMs(q.state.data),
    refetchInterval: false,
    retry: false,
    enabled: !!date && !!key,
  });
}
