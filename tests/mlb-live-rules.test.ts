import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/source";
import { MLB_LIVE_EVENTS_URL, MLB_LIVE_MARKETS, MLB_LIVE_PROPS, MLB_LIVE_REDIS, mlbLiveEventUrl } from "@/lib/mlb/live-props-rules";
import {
  decodeOverlay,
  encodeOverlay,
  mlbAffordableEvents,
  mlbLiveBoardKey,
  mlbLiveCooldownKey,
  mlbLiveSpendKey,
  mlbLiveStore,
  mlbPullCredits,
  secondsToPtMidnight,
} from "@/lib/mlb/live-props-store";
import type { MlbLiveQuoteBoard } from "@/lib/mlb/live-quote-types";
import { liveQuoteKey } from "@/lib/mlb/live-quote-types";
import { REFILL_SLOTS_PT } from "@/lib/server/grading-progress";
import { CFB_PROPS } from "@/lib/cfb/rules";
import { NFL_PROPS } from "@/lib/nfl/rules";
import { shapeAllowed } from "@/lib/server/odds-shape";

/**
 * INSTRUCTION 51 (2026-09-11, Josh verbatim: "Authorize the live in-play odds pull for MLB") —
 * WI-1's constants, the credit rail, and the two guards that keep this spend where it belongs.
 *
 * Every figure below was computed independently of the module under test (node, the same formulas
 * read out of src/lib/cfb/props-store.ts:245,258), not by calling it and writing down the answer.
 */

const STORE_SRC = fs.readFileSync(path.join(process.cwd(), "src", "lib", "mlb", "live-props-store.ts"), "utf8");

/**
 * The arguments of every CALL to `fn` in `src` (comments already stripped), balanced-paren scanned.
 * The lowercase initial matters: `mlbAffordableEvents(` / `mlbPullCredits(` carry a capital A / P at
 * that position, so the wrappers themselves are never mistaken for unguarded calls.
 */
function creditCallArgs(src: string, fn: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b${fn}\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    const start = i;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

/** Every call to CFB's credit arithmetic in this file that does NOT name the MLB constants. */
function unguardedCreditCalls(src: string): string[] {
  const clean = stripComments(src);
  const bad: string[] = [];
  for (const args of creditCallArgs(clean, "affordableEvents")) {
    if (!args.includes("MLB_LIVE_PROPS.dailyBudget") || !args.includes("MLB_LIVE_PROPS.measuredCreditsPerEvent")) {
      bad.push(`affordableEvents(${args.replace(/\s+/g, " ").trim()})`);
    }
  }
  for (const args of creditCallArgs(clean, "pullCredits")) {
    if (!args.includes("MLB_LIVE_PROPS.measuredCreditsPerEvent")) {
      bad.push(`pullCredits(${args.replace(/\s+/g, " ").trim()})`);
    }
  }
  return bad;
}

describe("MLB_LIVE_PROPS — the whole constant, pinned", () => {
  it("is exactly this object, so an added field cannot slip in unpinned", () => {
    /* The tests/cfb-props.test.ts:59-75 precedent: toEqual on the WHOLE object. `slots` is compared
       by VALUE here and by REFERENCE in the next test — the reference is the load-bearing half. */
    expect(MLB_LIVE_PROPS).toEqual({
      liveMaxEvents: 12,
      liveRevalidateSec: 1800,
      emptyHoldSec: 7200,
      quoteMaxAgeSec: 1800,
      boardRetainSec: 36 * 3600,
      driftMin: 0.15,
      probeEvents: 3,
      /* added by the fix pass (2026-09-11): while it is false EVERY pass is capped at probeEvents,
         not only the day's first, because CFB measures 31 credits an event on the same nominal shape
         and nothing in this tree explains the 5.3x gap. Flipping it is a DELIBERATE act that
         requires a real x-requests-used delta in docs/credit-budget.md first. */
      rateMeasured: false,
      cooldownDay: true,
      regions: "us",
      minBooks: 2,
      settleBook: "williamhill_us",
      dailyBudget: 600,
      measuredCreditsPerEvent: 6,
      slots: ["08:00", "09:30", "12:00", "15:00", "16:45"],
      liveSlotsPT: [],
      tickMode: "slots",
    });
  });

  it("shares ONE calendar object with the INSTRUCTION 49 refill slots — not a copy", () => {
    // by reference: a literal copy would pass toEqual above and then drift the day someone edits one
    expect(MLB_LIVE_PROPS.slots).toBe(REFILL_SLOTS_PT);
  });

  it("ships with the credit rate UNMEASURED, so every pass is probe-capped", () => {
    /* The whole reason the flag exists: until a real reading lands, a mistaken pass costs
       probeEvents x 31 = 93 credits in the worst case, not liveMaxEvents x 31 = 372. */
    expect(MLB_LIVE_PROPS.rateMeasured).toBe(false);
    expect(MLB_LIVE_PROPS.probeEvents).toBeLessThan(MLB_LIVE_PROPS.liveMaxEvents);
  });

  it("ships on the slot calendar with the opt-in ticker window OFF", () => {
    expect(MLB_LIVE_PROPS.tickMode).toBe("slots");
    expect(MLB_LIVE_PROPS.liveSlotsPT).toHaveLength(0);
  });

  it("re-prices a live game less often than it re-reads it, and never serves a quote past the window", () => {
    expect(MLB_LIVE_PROPS.quoteMaxAgeSec).toBeLessThanOrEqual(MLB_LIVE_PROPS.emptyHoldSec);
    expect(MLB_LIVE_PROPS.boardRetainSec).toBeGreaterThan(MLB_LIVE_PROPS.liveRevalidateSec);
    expect(MLB_LIVE_PROPS.probeEvents).toBeLessThan(MLB_LIVE_PROPS.liveMaxEvents);
  });
});

describe("the credit rail — MLB's own budget, MLB's own rate", () => {
  it("a full pull and the day's ceiling", () => {
    expect(MLB_LIVE_PROPS.liveMaxEvents * MLB_LIVE_PROPS.measuredCreditsPerEvent).toBe(72);
    expect(MLB_LIVE_PROPS.dailyBudget / MLB_LIVE_PROPS.measuredCreditsPerEvent).toBe(100);
  });

  it("mlbAffordableEvents clips against the 600 and refuses at it", () => {
    // 560 spent: floor((600-560)/6) = 6 of the 12 wanted
    expect(mlbAffordableEvents(12, 560)).toBe(6);
    expect(mlbAffordableEvents(12, 600)).toBe(0);
    expect(mlbAffordableEvents(12, 0)).toBe(12);
    expect(mlbAffordableEvents(0, 0)).toBe(0);
  });

  it("mlbPullCredits bills the real header delta at the MLB rate, never CFB's 31", () => {
    /* x-requests-used 1031 -> 1062 -> 1093 across three event calls: the delta (62) covers every
       call but the first, so the first is added back at the measured rate. 62 + 6 = 68.
       93 IS THE CFB ANSWER for the same readings (62 + 31) — the exact mis-billing the wrapper
       exists to prevent, so it is pinned as a NEGATIVE. */
    expect(mlbPullCredits([1031, 1062, 1093], 3)).toBe(68);
    expect(mlbPullCredits([1031, 1062, 1093], 3)).not.toBe(62 + CFB_PROPS.measuredCreditsPerEvent);
    // fewer than two readings: fetched x the measured rate, over-counting on purpose
    expect(mlbPullCredits([], 5)).toBe(30);
    expect(mlbPullCredits([1031], 5)).toBe(30);
    expect(mlbPullCredits([], 0)).toBe(0);
  });

  it("the probe cap bounds the day's first mistake if MLB in fact bills like CFB", () => {
    // the unexplained 5.3x gap: 3 events at CFB's measured 31 is 93 credits, not 550
    expect(MLB_LIVE_PROPS.probeEvents * CFB_PROPS.measuredCreditsPerEvent).toBe(93);
  });
});

describe("NO EXISTING BUDGET IS LOWERED", () => {
  it("CFB and NFL keep every credit they had", () => {
    expect(CFB_PROPS.dailyBudget).toBe(2500);
    expect(CFB_PROPS.measuredCreditsPerEvent).toBe(31);
    expect(NFL_PROPS.dailyBudget).toBe(1000);
  });

  it("the MLB live spend lives under its own prefix and cannot touch theirs", () => {
    expect(MLB_LIVE_REDIS).toEqual({
      board: "pl:mlb:liveprops:v1:",
      spend: "pl:mlb:liveprops:spend:v1:",
      cooldown: "pl:mlb:liveprops:429:",
    });
    for (const k of Object.values(MLB_LIVE_REDIS)) {
      expect(k.startsWith("pl:mlb:liveprops:")).toBe(true);
      expect(k).not.toMatch(/pl:(cfb|nfl):props|pl:board:|pl:picks:|pl:ledger|pl:clv/);
    }
    expect(mlbLiveBoardKey("2026-09-11")).toBe("pl:mlb:liveprops:v1:2026-09-11");
    expect(mlbLiveSpendKey("2026-09-11")).toBe("pl:mlb:liveprops:spend:v1:2026-09-11");
    expect(mlbLiveCooldownKey("2026-09-11")).toBe("pl:mlb:liveprops:429:2026-09-11");
  });
});

describe("SOURCE PIN — the store never calls CFB's credit arithmetic bare", () => {
  it("every affordableEvents / pullCredits call names the MLB constants", () => {
    const clean = stripComments(STORE_SRC);
    // the scan is not vacuous: there IS one call of each to find
    expect(creditCallArgs(clean, "affordableEvents")).toHaveLength(1);
    expect(creditCallArgs(clean, "pullCredits")).toHaveLength(1);
    expect(unguardedCreditCalls(STORE_SRC)).toEqual([]);
  });

  it("PLANT: strip MLB_LIVE_PROPS.dailyBudget and the checker fires", () => {
    const planted = STORE_SRC.replace("MLB_LIVE_PROPS.dailyBudget, ", "");
    expect(planted).not.toBe(STORE_SRC); // the plant actually changed something
    const bad = unguardedCreditCalls(planted);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/^affordableEvents\(/);
  });

  it("PLANT: swap in CFB's rate and BOTH calls fire", () => {
    const planted = STORE_SRC.replaceAll("MLB_LIVE_PROPS.measuredCreditsPerEvent)", "CFB_PROPS.measuredCreditsPerEvent)");
    expect(planted).not.toBe(STORE_SRC);
    expect(unguardedCreditCalls(planted)).toHaveLength(2);
  });
});

describe("the live-pull URL — six core markets, and the allow-list needs no change", () => {
  const url = mlbLiveEventUrl("abc", "K");

  it("is the baseball_mlb per-event in-play shape", () => {
    expect(url.startsWith(`${MLB_LIVE_EVENTS_URL}/abc/odds?`)).toBe(true);
    expect(url).toContain("apiKey=K");
    expect(url).toContain("regions=us");
    expect(url).toContain("oddsFormat=american");
    for (const m of MLB_LIVE_MARKETS.split(",")) expect(url).toContain(m);
    expect(MLB_LIVE_MARKETS.split(",")).toHaveLength(6);
  });

  it("carries NO _alternate ladder — +50% spend for nothing this feature reads", () => {
    expect(url).not.toContain("_alternate");
    expect(MLB_LIVE_MARKETS).not.toContain("_alternate");
  });

  it("passes shapeAllowed AS THE ALLOW-LIST STANDS — src/lib/server/odds-shape.ts is not edited", () => {
    expect(shapeAllowed(new URL(url))).toBe(true);
    // the events list has no markets param at all: the 1-credit class
    expect(shapeAllowed(new URL(`${MLB_LIVE_EVENTS_URL}?apiKey=K`))).toBe(true);
    // PLANT: the check is real — widening the regions on our markets is a LARGER product, refused
    expect(shapeAllowed(new URL(url.replace("regions=us", "regions=us,eu")))).toBe(false);
  });

  it("encodes the event id, so a stray id cannot mint path segments", () => {
    expect(mlbLiveEventUrl("a/b?c", "K")).toContain("/events/a%2Fb%3Fc/odds?");
  });
});

describe("the overlay store — encoding, the cooldown clock, and no-Redis-no-spend", () => {
  const board: MlbLiveQuoteBoard = {
    date: "2026-09-11",
    generatedAt: "2026-09-11T23:52:00.000Z",
    events: 9,
    fetched: 7,
    capped: false,
    live: 9,
    noLive: 2,
    unmatched: 0,
    ttlSec: MLB_LIVE_PROPS.liveRevalidateSec,
    stale: false,
    budgeted: false,
    spentToday: 214,
    oddsMissing: false,
    pricedAt: { "phi@nyy": "2026-09-11T23:52:00.000Z" },
    emptyAt: {},
    rows: {
      [liveQuoteKey("phi@nyy", "Aaron Judge|batter_hits_runs_rbis|0.5")]: {
        gkey: "phi@nyy",
        lkey: "Aaron Judge|batter_hits_runs_rbis|0.5",
        ln: 3.5,
        czAm: -145,
        oppAm: 115,
        bsAm: -140,
        bsBk: "draftkings",
        books: 3,
        fO: 0.578,
        pLive: 0.41,
        pSrc: "sim",
        evCz: -0.4,
        at: "2026-09-11T23:52:00.000Z",
      },
    },
    quota: { remaining: 16480, used: 6 },
  };

  it("round-trips through gzip + base64", () => {
    const blob = encodeOverlay(board);
    expect(decodeOverlay(blob)).toEqual(board);
    expect(blob.length).toBeLessThan(1_000_000); // one request, no chunking
  });

  it("a missing or corrupt blob reads as no overlay, never as a throw", () => {
    expect(decodeOverlay(null)).toBeNull();
    expect(decodeOverlay("")).toBeNull();
    expect(decodeOverlay("not-a-gzip-blob")).toBeNull();
  });

  it("the 429 cooldown expires at Pacific midnight", () => {
    // 2026-09-11T22:30Z is 15:30:00 PDT — 8 h 30 m of the Pacific day left
    expect(secondsToPtMidnight(Date.parse("2026-09-11T22:30:00Z"))).toBe(8 * 3600 + 30 * 60);
    // floored at 60 s so a set at 23:59:59 PT can never write a zero-or-negative EX
    expect(secondsToPtMidnight(Date.parse("2026-09-12T06:59:59Z"))).toBe(60);
    expect(secondsToPtMidnight(Date.parse("2026-09-11T07:00:00Z"))).toBe(86400);
  });

  it("NO REDIS MEANS NO STORE — and the route must then refuse to spend", () => {
    const keys = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"] as const;
    const saved = keys.map((k) => [k, process.env[k]] as const);
    for (const k of keys) delete process.env[k];
    try {
      expect(mlbLiveStore()).toBeNull();
    } finally {
      for (const [k, v] of saved) if (v !== undefined) process.env[k] = v;
    }
  });
});
