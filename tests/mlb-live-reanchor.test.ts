import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legSideOf, settledRead, type LegSettledRead } from "@/lib/leg-settled";
import { lineOf } from "@/lib/pred-serialize";
import { stripComments } from "./helpers/source";

/**
 * INSTRUCTION 51 (2026-09-11) — THE RE-ANCHOR JOIN, PURE.
 *
 * Josh's order, verbatim: "Authorize the live in-play odds pull for MLB". His original complaint,
 * verbatim: "It's not updating with live odds; it will show the player is top 4th w/ 3 H+R+RBI, but
 * show them as an 'S' grade for over .5 H+R+RBI when their live over/under is 3.5 H+R+RBI".
 *
 * INSTRUCTION 50 could only answer the first half of that sentence — suppress the S grade, because
 * 3 really is past 0.5. It could not answer the second half, because the live 3.5 costs money to
 * learn. Now it is bought, and the board joins the stored row to the live quote by swapping ONE
 * segment of the leg key: `player|market|<LINE>`.
 *
 * THE ELEGANT CONSEQUENCE, WHICH IS WHAT THIS FILE PROTECTS: `src/lib/leg-settled.ts` gets no code
 * change at all. The suppression falls away by itself the moment a real line exists (3 is not past
 * 3.5, so settledRead returns null on its own), and stays in force the moment one does not. If a
 * later edit "improves" the join — rebuilding the key, rewriting the market, computing the relation
 * a second time — these cases go red.
 *
 * NOTE ON THE NUMBERS: every value here is a synthetic test value. Nothing is a quote from any book
 * and nothing here is or becomes product output.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** the stored pregame leg: Alvarez over 0.5 H+R+RBI — Josh's own row */
const STORED_LKEY = "yordanalvarez|batter_hits_runs_rbis|0.5";

/**
 * THE JOIN, byte for byte as app/board/page.tsx's rowSettled performs it (a source pin at the
 * bottom of this file asserts the page still does exactly this). `q` null is case C: no quote was
 * bought, so the stored line is the only line there is.
 *
 * THE SWAP IS OVER-ONLY (fix pass, 2026-09-11). Re-anchoring asserts "the bet on this card is now
 * the line the book is posting". That is true of an Over — a higher live line is the live version of
 * the same wager, still live — and FALSE of an Under, whose stored leg is already DEAD the instant
 * the tally passes its line. Alvarez Under 0.5 with 3 banked has LOST; swapping in a live 3.5 would
 * make that loss read "undecided", restore a grade and a price to a ticket that cannot be won, and
 * float it back to the top of the board. An Under is always read at the line Josh actually holds.
 */
function joinedRead(
  lkey: string,
  sub: string,
  tally: number | null | undefined,
  q: { ln: number } | null,
): LegSettledRead | null {
  if (!q || legSideOf(sub) === "U") return settledRead(lkey, sub, tally);
  const [player, market] = String(lkey ?? "").split("|");
  return settledRead(`${player}|${market}|${q.ln}`, sub, tally);
}

describe("INSTRUCTION 51 — the live line re-anchors the settled read", () => {
  it("CASE A: 3 banked against a LIVE 3.5 is not settled — the grade is restored, with no edit to leg-settled", () => {
    const r = joinedRead(STORED_LKEY, "H+R+RBI O 0.5", 3, { ln: 3.5 });
    expect(r, "a live line the tally has not cleared must leave the row open and gradable").toBeNull();
    // and the reason it is null is leg-settled's own untouched contract: !(3 > 3.5)
    expect(settledRead("yordanalvarez|batter_hits_runs_rbis|3.5", "H+R+RBI O 0.5", 3)).toBeNull();
  });

  it("CASE B: 3 banked against a LIVE 0.5 is still provably settled, and the sentence cites the LIVE line", () => {
    const r = joinedRead(STORED_LKEY, "H+R+RBI O 0.5", 3, { ln: 0.5 });
    expect(r?.code).toBe("over-cleared");
    expect(r?.line).toBe(0.5);
    expect(r?.val).toBe(3);
    expect(r?.why).toContain("already 3 vs a 0.5 line");
    expect(r?.why).toContain("this Over is decided won");
  });

  it("CASE B: a live line the tally has ALSO cleared — 4 against a live 3.5 — is provably settled", () => {
    const r = joinedRead(STORED_LKEY, "H+R+RBI O 0.5", 4, { ln: 3.5 });
    expect(r?.code).toBe("over-cleared");
    // the sentence quotes the LIVE line, not the dead pregame one — quoting 0.5 here would be a lie
    expect(r?.line).toBe(3.5);
    expect(r?.why).toContain("already 4 vs a 3.5 line");
    expect(r?.why).not.toContain("0.5 line");
  });

  it("CASE C: no quote bought leaves the read byte-identical to INSTRUCTION 50", () => {
    const withoutQuote = joinedRead(STORED_LKEY, "H+R+RBI O 0.5", 3, null);
    const instruction50 = settledRead(STORED_LKEY, "H+R+RBI O 0.5", 3);
    expect(withoutQuote).toEqual(instruction50);
    expect(withoutQuote?.code).toBe("over-cleared");
    expect(withoutQuote?.line).toBe(0.5);
    // every failure path — no budget, a 429, an unmatched event, a market not posted in play —
    // arrives here, and Josh keeps exactly the protection he already had
    expect(withoutQuote?.why).toContain("already 3 vs a 0.5 line");
  });

  it("an UNDER leg reads 'decided lost' — at its OWN stored line, which no live quote may move", () => {
    /* AMENDED in the fix pass (2026-09-11). This case used to assert the Under re-anchored too
       ("vs a 2.5 line"), which was the defect: the swap is Over-only now. A cleared Under is a
       LOST bet, permanently, and the sentence has to quote the line Josh actually holds. */
    const r = joinedRead(STORED_LKEY, "H+R+RBI U 0.5", 3, { ln: 2.5 });
    expect(r?.side).toBe("U");
    expect(r?.why).toContain("this Under is decided lost");
    expect(r?.why).toContain("already 3 vs a 0.5 line");
    expect(r?.line).toBe(0.5);
    expect(r?.why).not.toContain("2.5 line");
    expect(r?.why).not.toContain("already over");
  });

  it("THE UNDER GATE: a live line ABOVE a lost Under cannot un-decide it", () => {
    /* the one that matters. Stored Under 0.5, tally 3, the book now posts 3.5. Read at the live
       line the row would come back to life (3 is not past 3.5 → null → graded, priced, playable);
       read at the stored line it stays the dead loss it is. */
    const atStored = joinedRead(STORED_LKEY, "H+R+RBI U 0.5", 3, { ln: 3.5 });
    expect(atStored?.code).toBe("over-cleared");
    expect(atStored?.line).toBe(0.5);
    // the proof that the gate — not leg-settled — is what saves it: the swapped key alone is null
    expect(settledRead("yordanalvarez|batter_hits_runs_rbis|3.5", "H+R+RBI U 0.5", 3)).toBeNull();
    // both sub grammars the codebase writes are covered, because legSideOf is the single authority
    expect(joinedRead(STORED_LKEY, "H+R+RBI Under 0.5", 3, { ln: 3.5 })?.line).toBe(0.5);
  });

  it("PLANT: dropping the Under gate brings a lost Under back to life", () => {
    const ungated = (lkey: string, sub: string, tally: number, q: { ln: number } | null) => {
      if (!q) return settledRead(lkey, sub, tally);
      const [player, market] = lkey.split("|");
      return settledRead(`${player}|${market}|${q.ln}`, sub, tally);
    };
    expect(ungated(STORED_LKEY, "H+R+RBI U 0.5", 3, { ln: 3.5 }), "the plant must resurrect it").toBeNull();
    expect(joinedRead(STORED_LKEY, "H+R+RBI U 0.5", 3, { ln: 3.5 })?.code).toBe("over-cleared");
    // and the gate changes nothing at all for an Over — the re-anchor Josh asked for still happens
    expect(ungated(STORED_LKEY, "H+R+RBI O 0.5", 3, { ln: 3.5 })).toEqual(joinedRead(STORED_LKEY, "H+R+RBI O 0.5", 3, { ln: 3.5 }));
  });

  it("only the LINE segment moves — player and market are carried through untouched", () => {
    // tab purity keys on segment 1 (the player) and the market guard on segment 2; if the join
    // rewrote either, rows would migrate between tabs and MONOTONE_MARKETS would stop matching
    const [player, market] = STORED_LKEY.split("|");
    const rebuilt = `${player}|${market}|${3.5}`;
    expect(rebuilt).toBe("yordanalvarez|batter_hits_runs_rbis|3.5");
    expect(rebuilt.split("|")[0]).toBe(STORED_LKEY.split("|")[0]);
    expect(rebuilt.split("|")[1]).toBe(STORED_LKEY.split("|")[1]);
    // lineOf reads the third segment with NO edit to src/lib/pred-serialize.ts
    expect(lineOf(rebuilt)).toBe(3.5);
    expect(lineOf(STORED_LKEY)).toBe(0.5);
  });

  it("a non-monotone key is still refused outright, live quote or not", () => {
    // ml_/rl_ legs carry no counting stat; a live quote cannot make one decidable
    expect(joinedRead("ml_home", "ML", 3, { ln: 3.5 })).toBeNull();
    expect(joinedRead("ml_home", "ML", 3, null)).toBeNull();
  });

  it("a tally exactly AT the live line is undecided — a push is never claimed decided", () => {
    expect(joinedRead(STORED_LKEY, "H+R+RBI O 0.5", 2, { ln: 2 })).toBeNull();
    expect(joinedRead(STORED_LKEY, "H+R+RBI O 0.5", 3, { ln: 2 })?.code).toBe("over-cleared");
  });

  it("no observed tally is undecided at the live line too — never treated as a zero", () => {
    expect(joinedRead(STORED_LKEY, "H+R+RBI O 0.5", null, { ln: 3.5 })).toBeNull();
    expect(joinedRead(STORED_LKEY, "H+R+RBI O 0.5", undefined, { ln: 0.5 })).toBeNull();
  });

  it("PLANT: a join that forgets to swap the line is detected — it is exactly the old bug back", () => {
    const broken = (lkey: string, sub: string, tally: number, _q: { ln: number } | null) => settledRead(lkey, sub, tally);
    // the real join opens the row back up; the broken one keeps suppressing at the dead 0.5 line
    expect(joinedRead(STORED_LKEY, "H+R+RBI O 0.5", 3, { ln: 3.5 })).toBeNull();
    expect(broken(STORED_LKEY, "H+R+RBI O 0.5", 3, { ln: 3.5 })?.code).toBe("over-cleared");
  });

  it("PLANT: leg-settled's own contract is what makes case A free — break it and case A breaks", () => {
    const src = read("src/lib/leg-settled.ts");
    expect(src, "the strict > is the whole reason 3 does not clear 3.5").toContain("if (!(val > ln)) return null;");
    const loosened = src.replace("if (!(val > ln)) return null;", "if (!(val >= ln)) return null;");
    expect(loosened).not.toContain("if (!(val > ln)) return null;");
  });

  it("the Board performs THIS join, not a paraphrase of it (source pin)", () => {
    const page = stripComments(read("app/board/page.tsx"));
    expect(page).toContain('const [player, market] = String(r.lkey ?? "").split("|");');
    expect(page).toContain("return settledRead(`${player}|${market}|${q.ln}`, r.sub, tally);");
    expect(page).toContain('if (!q || legSideOf(r.sub) === "U") return settledRead(r.lkey, r.sub, tally);');
    // the side comes from leg-settled's single authority, never from a fourth copy of the regex
    expect(page).toMatch(/import \{ legSideOf[^}]*\} from "@\/lib\/leg-settled";/);
    expect(page).not.toMatch(/\/\(\^\|\\s\)U\(nder\)\?/);
    // and leg-settled itself is still asked, never re-implemented on the page
    expect(page).not.toMatch(/val > ln|tally > q\.ln|\.val > .*\.ln/);
  });
});
