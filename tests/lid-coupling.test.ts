import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createEngine, type Engine } from "@/engine";

/**
 * THE `lUse` / `lid` COUPLING — encoded, not described (2026-07-26).
 *
 * This is the most dangerous thing in the repo precisely BECAUSE IT LOOKS LIKE A BUG.
 *
 * Every leg identity in the ledger family is `label + "|" + prop`: the card's no-repeat
 * rule (`lUse`), FUN disjointness (`usedLegs`), supplemental exclusion, `shGrade`'s
 * `legRes`, and `lid` in `clv-core.ts` / `clv-report.ts` / `ledger-segments.ts`.
 *
 * On a DOUBLEHEADER both games carry the same teams, so `label|prop` is identical across
 * GM1 and GM2. That means:
 *   - `lUse` drops the GM2 leg as a "duplicate" — which reads as over-restrictive, because
 *     it IS a different bet; and
 *   - that drop is the ONLY reason `lid` never collides in grading and CLV.
 *
 * So "fixing" `lUse` to `gkey|lkey` is locally correct and silently opens a grading and
 * CLV collision the same day — on the freeze's primary scoreboard. That profile, a change
 * that looks obviously right, is exactly the one that gets made. Hence a test rather than
 * a comment: **change either key without the other and the build fails.**
 *
 * If both doubleheader games ARE wanted, the lift procedure is in
 * docs/collection-period.md — all six sites go composite in ONE change, and this file is
 * updated in the same commit.
 */

const root = process.cwd();
const engineSrc = fs.readFileSync(path.join(root, "legacy/index.html"), "utf8");
const stripped = engineSrc.replace(/\/\*[\s\S]*?\*\//g, ""); // never assert on my own prose

/** The one canonical key expression, in the form it appears in the engine. */
const ENGINE_KEY = 'l.label+"|"+l.prop';
/** …and in the TypeScript channel. */
const TS_KEY = "`${l.label}|${l.prop}`";

const tsFile = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("lid coupling — one leg identity, or the build breaks", () => {
  it("every engine site that identifies a leg uses label|prop", () => {
    const sites = [
      { name: "shAllocate lUse (read)", re: /if\(lUse\[l\.label\+"\|"\+l\.prop\]\)dup=true;/ },
      { name: "shAllocate lUse (write)", re: /lUse\[l\.label\+"\|"\+l\.prop\]=1;/ },
      { name: "shAllocate legSet", re: /legSet\[l\.label\+"\|"\+l\.prop\]=1;/ },
      { name: "shFunPick legDup", re: /usedLegs\[l\.label\+"\|"\+l\.prop\]/ },
      { name: "shFunPick mark", re: /usedLegs\[l\.label\+"\|"\+l\.prop\]=1;/ },
      { name: "shSupplementalCalc exclude", re: /legs\[l\.label\+"\|"\+l\.prop\]=1;/ },
      { name: "supplemental clash", re: /have\[l\.label\+"\|"\+l\.prop\]/ },
      { name: "shGrade legRes (render)", re: /var lid=l\.label\+"\|"\+l\.prop/ },
      { name: "shGradeTicket", re: /legRes\[l\.label\+"\|"\+l\.prop\]/ },
    ];
    const missing = sites.filter((s) => !s.re.test(stripped)).map((s) => s.name);
    expect(missing, "an engine leg-identity site changed shape — see the lift procedure").toEqual([]);
  });

  it("the ticket id hashes the SAME key, so ids and legs cannot disagree", () => {
    expect(stripped).toContain('pl.legs.map(function(l){return l.label+"|"+l.prop;})');
  });

  it("every TypeScript site builds lid identically to the engine's key", () => {
    for (const rel of ["src/lib/server/clv-core.ts", "src/lib/clv-report.ts", "src/lib/ledger-segments.ts"]) {
      const src = tsFile(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, `${rel} must build lid as label|prop`).toContain(`const lid = ${TS_KEY}`);
      // and must NOT have quietly become composite on its own
      expect(src, `${rel} lid went composite alone — the engine sites must move too`).not.toMatch(
        /const lid = `\$\{l\.gkey\}/,
      );
    }
  });

  /* The two channels write the key in different syntaxes, so compare their FIELD
     SEQUENCE rather than their text: both must be exactly [label, prop], joined by "|",
     with no game qualifier. Adding gkey to either side changes this list and fails. */
  const fieldsOf = (expr: string) => (expr.match(/l\.([A-Za-z]+)/g) ?? []).map((m) => m.slice(2));

  it("engine and TypeScript resolve to the SAME field sequence — [label, prop]", () => {
    expect(fieldsOf(ENGINE_KEY)).toEqual(["label", "prop"]);
    expect(fieldsOf(TS_KEY)).toEqual(["label", "prop"]);
    expect(fieldsOf(ENGINE_KEY)).toEqual(fieldsOf(TS_KEY));
    // both literals must actually appear in the code they claim to describe
    expect(stripped).toContain(ENGINE_KEY);
    expect(tsFile("src/lib/server/clv-core.ts")).toContain(TS_KEY);
  });

  it("no leg-identity site has quietly gained a game qualifier", () => {
    for (const f of [ENGINE_KEY, TS_KEY]) expect(fieldsOf(f)).not.toContain("gkey");
    // the engine's own dedupe must not start disambiguating by game on its own
    expect(stripped).not.toMatch(/lUse\[l\.gkey/);
    expect(stripped).not.toMatch(/usedLegs\[l\.gkey/);
  });
});

/**
 * Behavioural half: a synthetic doubleheader through the real allocator.
 * Two tickets, same matchup, different games — the second is dropped, so at most one leg
 * per `lid` can ever reach a ledger entry.
 */
describe("lid coupling — doubleheader behaviour is what the invariant protects", () => {
  const stub = () => Promise.resolve({ ok: false, body: {} });
  function eng(): Engine {
    const e = createEngine({ fetchJson: stub, today: "2026-07-26" });
    e.set("SH_V2", { sim: true });
    return e;
  }
  /** Same teams, same player, DIFFERENT game — a legitimately different bet. */
  const dhTicket = (gnum: number) => ({
    pl: {
      name: `TB parlay · GM${gnum}`,
      type: "batter_total_bases",
      prob: 45,
      czDec: 2.5,
      czOdds: "+150",
      czEv: 8,
      bsDec: 2.5,
      bsEv: 8,
      consCzEv: 5,
      consEv: 5,
      legs: [
        {
          label: "A Judge (NYY)",
          prop: "TB O 1.5",
          lkey: "a judge|batter_total_bases|1.5",
          gkey: `nyy@bos${gnum > 1 ? `gm${gnum}` : ""}`,
          game: `NYY @ BOS${gnum > 1 ? ` (GM ${gnum})` : ""}`,
          cz: 120, bs: 120, imp: 42, booksInd: 3,
        },
      ],
      ...(gnum > 1 ? {} : {}),
    },
    src: "parlays",
    idx: gnum,
  });

  it("the allocator takes at most ONE of two same-matchup doubleheader legs", () => {
    const e = eng();
    const cfg = { ...e.get<Record<string, unknown>>("SH_CFG"), mktN: { batter_total_bases: 500 } };
    const r = e.get<(p: unknown, a: number, c: unknown, f: boolean) => Record<string, unknown>>("shAllocate")(
      [dhTicket(1), dhTicket(2)],
      250,
      cfg,
      false,
    );
    const picks = r.picks as { w: { pl: { legs: { label: string; prop: string }[] } } }[];
    expect(picks.length).toBe(1); // the GM2 leg is dropped as a label|prop duplicate
    const lids = picks.flatMap((p) => p.w.pl.legs.map((l) => `${l.label}|${l.prop}`));
    expect(new Set(lids).size).toBe(lids.length); // ...so lids are unique, which is the point
  });

  it("both games ARE distinct upstream — the drop is the allocator's, not a key failure", () => {
    const a = dhTicket(1).pl.legs[0];
    const b = dhTicket(2).pl.legs[0];
    expect(a.gkey).not.toBe(b.gkey); // gkey disambiguates (gnum reaches every shGkey site)
    expect(`${a.label}|${a.prop}`).toBe(`${b.label}|${b.prop}`); // but lid does NOT
  });
});
