import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * SELF-ARM STAMP GUARD (2026-07-30, owner's item 2 — "count-armed parameters fire on
 * data, not on dates, so their vintage events are unstampable in advance").
 *
 * THE GAP IT CLOSES: `consMinEv`'s expiry was DATE-armed and we caught it on the
 * calendar. `shUmpKf` is COUNT-armed — `tools/build_context.py` L232 emits a real
 * `kFactor` only for umpires with `g >= 5`, and that count accrues from the games being
 * played. Nobody can calendar the crossing, and on 2026-07-30 the first umpire (Lance
 * Barrett, g 4 → 5) crossed it FIVE DAYS AHEAD of the ~08-04 projection — silently, with
 * no parameter change and no deploy. It reached no board (two brakes: the frozen
 * `context.json` carrier and `SH_CFG.umpKFrozen`), but nothing recorded the crossing.
 *
 * THE ENCODED RULE (the owner's: "a self-arm writes its own stamp at fire time"): when
 * the accruing data crosses, this test goes RED, and the only way to green is to record
 * the crossing in docs/collection-period.md and append it here — i.e. the stamp is
 * written AT fire time, by the person who must then decide whether a vintage boundary
 * was crossed. Guessing at the date is replaced by being told.
 *
 * OBSERVED RED 2026-07-30 (planted ARMED = 0 against a live count of 1, the real
 * crossing) before this file was accepted.
 *
 * ── DEMOTED 2026-08-01 (owner's item 1; INSTRUMENT DEFECT #7) ────────────────────────
 * THE DEFECT IN THE ORIGINAL: the assertion was `live count === ARMED.umpKf`, and the
 * crossing record was PROSE in `ARMED.note` that nothing read. Deleting a crossing from
 * the record therefore left the guard GREEN — the live count comes from
 * `data/ump_k.json` and does not move when the prose does. It proved a number, and the
 * number was not the thing that had to survive.
 *
 * MEASURED 2026-08-01, on the original guard, before this file replaced it: Willie
 * Traynor's dated crossing deleted from `ARMED.note` while he remained armed in the data
 * at `{"g":5,"k":69}` → **3 passed, 0 failed.** The record lost a crossing and the
 * instrument said nothing.
 *
 * WHAT REPLACES IT:
 *   - the COUNT is INFORMATIONAL — printed, never equality-asserted. A count that only
 *     rises is not news; an UNRECORDED crossing is.
 *   - COMPLETENESS is the assertion: every umpire at g >= 5 must carry a dated entry,
 *     and the failure NAMES the umpire instead of reporting a delta.
 *   - APPEND-ONLY is a monotone FLOOR: CROSSINGS.length may rise, never fall.
 *   - the DOUBLE BRAKE stays a hard assertion, unchanged in strength.
 *
 * OBSERVED RED 2026-08-01, both run and printed before acceptance:
 *   (a) Traynor entry deleted → COMPLETENESS red naming "Willie Traynor", FLOOR red at
 *       3 < 4. Two failures, one edit. The original guard is GREEN on this same edit
 *       (measured above) — that is the capture this demotion buys.
 *   (b) `umpKFrozen: false` in legacy/index.html → the brake test red.
 *
 * ⚠️ THE RESIDUAL THIS DOES NOT CLOSE (owner's item 1, named rather than fixed): a
 * crossing that is RECORDED BUT WRONG. `date` is checked for SHAPE only (a regex), never
 * against the commit that carried it; `commit` is never resolved; `braked: true` asserts
 * only that the RECORD claims a brake, not that a brake held. A crossing entered with the
 * wrong date, the wrong sha, or `braked: true` when it actually reached a board is GREEN
 * here. Only `braked: false` is caught, and only because it contradicts the record's own
 * claim. Closing it needs a git join (resolve `commit`, assert it touches
 * `data/ump_k.json`, assert its author date equals `date`) — SPEC, NOT SHIPPED.
 */

/**
 * APPEND-ONLY CROSSING RECORD. APPEND entries; never edit or remove one. Each is written
 * AT fire time by whoever finds this red, beside the dated entry in
 * docs/collection-period.md (SELF-ARMING PARAMETERS block).
 */
const CROSSINGS = [
  {
    ump: "Lance Barrett",
    date: "2026-07-30",
    // NOT CAPTURED — this crossing predates the record. The DATE is the record; the
    // commit is not, and is left null rather than reconstructed.
    commit: null,
    kPerG: 18.0,
    braked: true,
    note: "FIRST EVER, ~5 days ahead of the ~08-04 projection.",
  },
  {
    ump: "Willie Traynor",
    date: "2026-07-31",
    commit: "200e40282380485b35a70c6a28b689c356cc7e3d",
    kPerG: 13.8,
    braked: true,
    note: "SECOND, one day later. Bot commit 08:21:47Z, ump_k.json only.",
  },
  {
    ump: "Malachi Moore",
    date: "2026-08-01",
    commit: "b68b1e361180fbdb62897884dddda5a4444499c6",
    kPerG: 14.8,
    braked: true,
    note:
      "THIRD. Same refresh as Derek Thomas — 07:37:59Z, `context: refresh`, ump_k.json " +
      "only, which added 2026-07-31 to `days`. The count went 2 -> 4 in ONE commit.",
  },
  {
    ump: "Derek Thomas",
    date: "2026-08-01",
    commit: "b68b1e361180fbdb62897884dddda5a4444499c6",
    kPerG: 19.8,
    braked: true,
    note: "FOURTH. Same commit as Malachi Moore.",
  },
  {
    ump: "Marvin Hudson",
    date: "2026-08-02",
    commit: "24f17575e34f40bbe9c20ac3d319f4f0f6c7e181",
    kPerG: 18.6,
    braked: true,
    note:
      "FIFTH. g 4->5, k 72->93. Bot `context: refresh` 18:00:56Z, ump_k.json only, adding " +
      "2026-08-01 to `days`. FOUND BY THIS GUARD ON A REBASE: the bot commit landed on origin " +
      "mid-ship, and re-running the gate after integrating it went RED. Had the rebase been " +
      "pushed without re-gating, a red tree would have shipped and the crossing would have " +
      "gone unrecorded — the reason a rebase is a tree change, not a bookkeeping step.",
  },
  {
    ump: "Nestor Ceja",
    date: "2026-08-02",
    commit: "24f17575e34f40bbe9c20ac3d319f4f0f6c7e181",
    kPerG: 18.0,
    braked: true,
    note: "SIXTH. g 4->5, k 69->90. Same commit as Marvin Hudson.",
  },
  {
    ump: "Mike Estabrook",
    date: "2026-08-03",
    commit: "f165011",
    kPerG: 16.2,
    braked: true,
    note: "SEVENTH. g 4->5, k 64->81. Bot refresh 18:51:13Z. Found with the EIGHTH by the rebase re-gate.",
  },
  {
    ump: "Chris Conroy",
    date: "2026-08-03",
    commit: "f165011",
    kPerG: 13.6,
    braked: true,
    note: "EIGHTH. g 4->5, k 53->68. Same commit as Estabrook.",
  },
  {
    ump: "Gabe Morales",
    date: "2026-08-05",
    commit: "a6f343b",
    kPerG: 16.4,
    braked: true,
    note: "NINTH. g 4->5, k 72->82. Four crossings in ONE refresh (a6f343b, 18:22:27Z).",
  },
  {
    ump: "Lance Barksdale",
    date: "2026-08-05",
    commit: "a6f343b",
    kPerG: 15.4,
    braked: true,
    note: "TENTH. g 4->5, k 61->77.",
  },
  {
    ump: "Chad Fairchild",
    date: "2026-08-05",
    commit: "a6f343b",
    kPerG: 14.2,
    braked: true,
    note: "ELEVENTH. g 4->5, k 54->71.",
  },
  {
    ump: "Brennan Miller",
    date: "2026-08-05",
    commit: "a6f343b",
    kPerG: 15.2,
    braked: true,
    note: "TWELFTH. g 4->5, k 66->76. THREE refresh commits sat unintegrated for three days " +
      "because no session ran — the crossings were recorded the moment a gate saw them, which " +
      "is the instrument working at ITS cadence, not the data's.",
  },
  {
    ump: "Chris Segal",
    date: "2026-08-07",
    commit: "bb50918",
    kPerG: 15.4,
    braked: true,
    note: "THIRTEENTH. g 4->5, k at arming 77. Carried by the FIRST bot commit ever to land " +
      "on frontend-rebuild (the deploy branch) — rule 7 applied, the diff decides: data only. " +
      "Noticed from the deployed learning artifact's rev stamp before the fetch. Armed mean " +
      "k/g at n=13: 16.00 — the dissolved n=6 direction stays dissolved. No board since the " +
      "crossing; both brakes green. Record: docs/collection-period.md CROSSING 13.",
  },
  { ump: "Laz Diaz", date: "2026-08-08", commit: "87f3396", kPerG: 17.2, braked: true,
    note: "FOURTEENTH. g 4->5, k 86. Bot refresh on the deploy branch; crossings 14-21 record." },
  { ump: "Doug Eddings", date: "2026-08-08", commit: "87f3396", kPerG: 17.2, braked: true,
    note: "FIFTEENTH. g 4->5, k 86." },
  { ump: "Todd Tichenor", date: "2026-08-08", commit: "87f3396", kPerG: 15.0, braked: true,
    note: "SIXTEENTH. g 4->5, k 75." },
  { ump: "Dan Merzel", date: "2026-08-09", commit: "aaa5a95", kPerG: 16.8, braked: true,
    note: "SEVENTEENTH. g 4->5, k 84." },
  { ump: "Dan Iassogna", date: "2026-08-09", commit: "aaa5a95", kPerG: 15.6, braked: true,
    note: "EIGHTEENTH. g 4->5, k 78." },
  { ump: "Alex MacKay", date: "2026-08-09", commit: "aaa5a95", kPerG: 18.0, braked: true,
    note: "NINETEENTH. g 4->5, k 90." },
  { ump: "Tyler Jones", date: "2026-08-09", commit: "aaa5a95", kPerG: 15.0, braked: true,
    note: "TWENTIETH. g 4->5, k 75." },
  { ump: "Emil Jimenez", date: "2026-08-09", commit: "aaa5a95", kPerG: 15.8, braked: true,
    note: "TWENTY-FIRST. g 4->5, k 79. Armed mean at n=21: 16.17 vs league 16.40 — the " +
      "dissolved direction stays dissolved. Boards now exist daily; the brakes alone are " +
      "the reason none reached one. Record: docs/collection-period.md CROSSINGS 14-21.",
  },
  { ump: "Will Little", date: "2026-08-10", commit: "6f1eb16", kPerG: 17.8, braked: true,
    note: "TWENTY-SECOND. g 4->5, k 89. Bot refresh on the deploy branch (fifth such); found " +
      "by this guard on a rebase re-gate mid-grade-feature ship — crossings 22-27 record." },
  { ump: "Dan Bellino", date: "2026-08-10", commit: "6f1eb16", kPerG: 20.2, braked: true,
    note: "TWENTY-THIRD. g 4->5, k 101." },
  { ump: "Dexter Kelley", date: "2026-08-10", commit: "6f1eb16", kPerG: 16.4, braked: true,
    note: "TWENTY-FOURTH. g 4->5, k 82." },
  { ump: "Adam Hamari", date: "2026-08-11", commit: "349067e", kPerG: 15.6, braked: true,
    note: "TWENTY-FIFTH. g 4->5, k 78. Second refresh in the same re-gate (349067e added " +
      "2026-08-10 to days)." },
  { ump: "Nick Mahrley", date: "2026-08-11", commit: "349067e", kPerG: 18.2, braked: true,
    note: "TWENTY-SIXTH. g 4->5, k 91." },
  { ump: "Mike Muchlinski", date: "2026-08-11", commit: "349067e", kPerG: 14.6, braked: true,
    note: "TWENTY-SEVENTH. g 4->5, k 73. Armed mean at n=27: 16.40 vs league 16.75 (g=347, " +
      "k=5,811) — still below; the dissolved direction stays dissolved. Boards fire daily; " +
      "the double brake alone is the answer (re-ran green this gate). Record: " +
      "docs/collection-period.md CROSSINGS 22-27.",
  },
  { ump: "Ryan Additon", date: "2026-08-12", commit: "3c7b3a2", kPerG: 17.4, braked: true,
    note: "TWENTY-EIGHTH. Crossings 28-49: TWENTY-TWO in one rebase re-gate spanning FOUR " +
      "unintegrated bot refreshes (08-12 -> 08-15) — the season's mass-arming phase; most " +
      "of the league's regular umpires now cross in any multi-day gap. Record: " +
      "docs/collection-period.md CROSSINGS 28-49." },
  { ump: "Adam Beck", date: "2026-08-12", commit: "3c7b3a2", kPerG: 15.2, braked: true,
    note: "TWENTY-NINTH. g 4->5, k 76." },
  { ump: "Stu Scheurwater", date: "2026-08-12", commit: "3c7b3a2", kPerG: 16.2, braked: true,
    note: "THIRTIETH. g 4->5, k 81." },
  { ump: "Jansen Visconti", date: "2026-08-12", commit: "3c7b3a2", kPerG: 14.0, braked: true,
    note: "THIRTY-FIRST. g 4->5, k 70." },
  { ump: "Brian Walsh", date: "2026-08-12", commit: "3c7b3a2", kPerG: 17.6, braked: true,
    note: "THIRTY-SECOND. g 4->5, k 88." },
  { ump: "Alfonso Márquez", date: "2026-08-13", commit: "27665be", kPerG: 17.0, braked: true,
    note: "THIRTY-THIRD. g 4->5, k 85." },
  { ump: "Adrian Johnson", date: "2026-08-13", commit: "27665be", kPerG: 14.6, braked: true,
    note: "THIRTY-FOURTH. g 4->5, k 73." },
  { ump: "John Libka", date: "2026-08-13", commit: "27665be", kPerG: 18.8, braked: true,
    note: "THIRTY-FIFTH. g 4->5, k 94." },
  { ump: "Bill Miller", date: "2026-08-13", commit: "27665be", kPerG: 13.0, braked: true,
    note: "THIRTY-SIXTH. g 4->5, k 65." },
  { ump: "Jim Wolf", date: "2026-08-13", commit: "27665be", kPerG: 16.6, braked: true,
    note: "THIRTY-SEVENTH. g 4->5, k 83." },
  { ump: "Nate Tomlinson", date: "2026-08-13", commit: "27665be", kPerG: 16.6, braked: true,
    note: "THIRTY-EIGHTH. g 4->5, k 83." },
  { ump: "Andy Fletcher", date: "2026-08-13", commit: "27665be", kPerG: 17.0, braked: true,
    note: "THIRTY-NINTH. g 4->5, k 85." },
  { ump: "Tripp Gibson", date: "2026-08-13", commit: "27665be", kPerG: 15.0, braked: true,
    note: "FORTIETH. g 4->5, k 75." },
  { ump: "Rob Drake", date: "2026-08-14", commit: "aedb3f7", kPerG: 15.8, braked: true,
    note: "FORTY-FIRST. g 4->5, k 79." },
  { ump: "Alan Porter", date: "2026-08-14", commit: "aedb3f7", kPerG: 21.0, braked: true,
    note: "FORTY-SECOND. g 4->5, k 105 — the hottest arming yet recorded." },
  { ump: "Bruce Dreckman", date: "2026-08-14", commit: "aedb3f7", kPerG: 19.2, braked: true,
    note: "FORTY-THIRD. g 4->5, k 96." },
  { ump: "James Hoye", date: "2026-08-14", commit: "aedb3f7", kPerG: 17.2, braked: true,
    note: "FORTY-FOURTH. g 4->5, k 86." },
  { ump: "Charlie Ramos", date: "2026-08-15", commit: "f8884e3", kPerG: 15.6, braked: true,
    note: "FORTY-FIFTH. g 4->5, k 78." },
  { ump: "Vic Carapazza", date: "2026-08-15", commit: "f8884e3", kPerG: 14.2, braked: true,
    note: "FORTY-SIXTH. g 4->5, k 71." },
  { ump: "Ryan Wills", date: "2026-08-15", commit: "f8884e3", kPerG: 17.6, braked: true,
    note: "FORTY-SEVENTH. g 4->5, k 88." },
  { ump: "Jordan Baker", date: "2026-08-15", commit: "f8884e3", kPerG: 15.6, braked: true,
    note: "FORTY-EIGHTH. g 4->5, k 78." },
  { ump: "Paul Clemons", date: "2026-08-15", commit: "f8884e3", kPerG: 16.2, braked: true,
    note: "FORTY-NINTH. g 4->5, k 81. Armed mean at n=49: 16.38 vs league 16.57 (g=400, " +
      "k=6,627) — still below; the dissolved direction stays dissolved. Double brake " +
      "re-ran green this gate. Record: docs/collection-period.md CROSSINGS 28-49.",
  },
  { ump: "Alex Tosi", date: "2026-08-16", commit: "348cc95", kPerG: 17.6, braked: true,
    note: "FIFTIETH. g 4->5, k 88. Bot refresh caught on a rebase re-gate mid-fun-composer " +
      "ship — crossings 50-54 record." },
  { ump: "Jacob Metz", date: "2026-08-16", commit: "348cc95", kPerG: 16.4, braked: true,
    note: "FIFTY-FIRST. g 4->5, k 82." },
  { ump: "Sean Barber", date: "2026-08-16", commit: "348cc95", kPerG: 16.8, braked: true,
    note: "FIFTY-SECOND. g 4->5, k 84." },
  { ump: "John Bacon", date: "2026-08-16", commit: "348cc95", kPerG: 17.0, braked: true,
    note: "FIFTY-THIRD. g 4->5, k 85." },
  { ump: "Mark Wegner", date: "2026-08-16", commit: "348cc95", kPerG: 16.0, braked: true,
    note: "FIFTY-FOURTH. g 4->5, k 80. Armed mean at n=54: 16.46 vs league 16.63 (g=415, " +
      "k=6,903) — still below; the dissolved direction stays dissolved. Double brake " +
      "re-ran green this gate. Record: docs/collection-period.md CROSSINGS 50-54.",
  },
  { ump: "Ramon De Jesus", date: "2026-08-17", commit: "431f847", kPerG: 15.0, braked: true,
    note: "FIFTY-FIFTH. g 4->5, k 75. Two refreshes caught on one rebase re-gate mid " +
      "core/fun-split ship — crossings 55-62 record." },
  { ump: "Erich Bacchus", date: "2026-08-17", commit: "431f847", kPerG: 16.6, braked: true,
    note: "FIFTY-SIXTH. g 4->5, k 83." },
  { ump: "Hunter Wendelstedt", date: "2026-08-17", commit: "431f847", kPerG: 15.0, braked: true,
    note: "FIFTY-SEVENTH. g 4->5, k 75." },
  { ump: "Jonathan Parra", date: "2026-08-17", commit: "431f847", kPerG: 17.6, braked: true,
    note: "FIFTY-EIGHTH. g 4->5, k 88." },
  { ump: "Scott Barry", date: "2026-08-18", commit: "80cfbaf", kPerG: 17.2, braked: true,
    note: "FIFTY-NINTH. g 4->5, k 86." },
  { ump: "Mark Ripperger", date: "2026-08-18", commit: "80cfbaf", kPerG: 16.4, braked: true,
    note: "SIXTIETH. g 4->5, k 82." },
  { ump: "Ben May", date: "2026-08-18", commit: "80cfbaf", kPerG: 18.8, braked: true,
    note: "SIXTY-FIRST. g 4->5, k 94." },
  { ump: "Nic Lentz", date: "2026-08-18", commit: "80cfbaf", kPerG: 19.2, braked: true,
    note: "SIXTY-SECOND. g 4->5, k 96. Armed mean at n=62: 16.49 vs league 16.59 (g=441, " +
      "k=7,318) — still below; the dissolved direction stays dissolved. Double brake " +
      "re-ran green this gate. Record: docs/collection-period.md CROSSINGS 55-62.",
  },
] as const;

/** Monotone floor. RAISE it in the same commit that appends. NEVER lower it. */
const FLOOR = 62;

/** About the SERIES, not any one crossing — kept out of the per-entry notes. */
const RATE =
  "TWELVE crossings in seven days (six found 2026-08-05 in ONE rebase re-gate spanning three " +
  "unintegrated refreshes). TWENTY-SIX more sit at g=4. THE n=6 DIRECTION DISSOLVED ON MORE " +
  "DATA: armed mean k/g is now 16.10 vs league 16.37 (n=12) — BELOW the mean, after reading " +
  "+0.68 ABOVE at n=6. The 'direction to watch' was noise, recorded as dissolved rather than " +
  "quietly dropped. All twelve double-braked (context.json frozen 2a8bcba9... + " +
  "SH_CFG.umpKFrozen); the 08-03..08-05 six could not have reached a board REGARDLESS: the " +
  "audit found zero boards on all three days.";

function armedUmps(): string[] {
  const db = JSON.parse(readFileSync("data/ump_k.json", "utf8")) as {
    umps: Record<string, { g?: number; k?: number }>;
  };
  return Object.entries(db.umps)
    .filter(([, u]) => (u.g ?? 0) >= 5)
    .map(([name]) => name);
}

describe("self-arming parameters stamp themselves at fire time", () => {
  it("INFORMATIONAL: the shUmpKf arm count (asserts nothing about the number)", () => {
    const armed = armedUmps();
    console.log(
      `[self-arm] shUmpKf armed: ${armed.length} at g>=5 — ${armed.join(", ")}. ` +
        `Recorded crossings: ${CROSSINGS.length} (floor ${FLOOR}). ${RATE}`,
    );
    expect(Array.isArray(armed)).toBe(true);
  });

  it("COMPLETENESS: every armed umpire has a dated crossing entry", () => {
    const recorded = new Set<string>(CROSSINGS.map((c) => c.ump));
    const missing = armedUmps().filter((u) => !recorded.has(u));
    expect(
      missing,
      `A COUNT-ARMED parameter crossed on data, not on a date, and NOTHING RECORDED IT: ` +
        `${missing.join(", ")}. Record each in docs/collection-period.md WITH ITS DATE — ` +
        `including whether it reached a board (check SH_CFG.umpKFrozen and whether ` +
        `public/model/context.json is unfrozen) — then APPEND to CROSSINGS and RAISE FLOOR ` +
        `in the same commit.`,
    ).toEqual([]);
  });

  it("APPEND-ONLY: the record never shrinks and every entry carries a date", () => {
    expect(
      CROSSINGS.length,
      `the crossing record LOST entries (${CROSSINGS.length} < floor ${FLOOR}). A past ` +
        `crossing is a fact about a day that already happened; it cannot be un-recorded.`,
    ).toBeGreaterThanOrEqual(FLOOR);
    for (const c of CROSSINGS) {
      expect(c.date, `crossing for ${c.ump} carries no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the DOUBLE BRAKE that keeps the crossing off the boards is still in place", () => {
    /* STRIP COMMENTS FIRST — and this is a FALSE NEGATIVE, the dangerous direction.
       MEASURED 2026-08-01, on this guard, hours after it shipped: `umpKFrozen:false,`
       in the code with `/* was umpKFrozen:true *​/` beside it → **6 passed**. The brake
       was RELEASED and the brake guard said nothing, because it greps a raw string and a
       comment carries that string. A presence assertion over unstripped source is
       satisfiable by prose. Third instance of comment-read-as-code; the first two were
       false POSITIVES, which only cost noise. See tests/helpers/source.ts. */
    const engine = stripComments(readFileSync("legacy/index.html", "utf8"));
    expect(/umpKFrozen:\s*true/.test(engine), "umpKFrozen is no longer true — brake 1 released").toBe(true);
    expect(
      /function shUmpKf\(g\)\{if\(SH_CFG\.umpKFrozen\)return 1;/.test(engine),
      "shUmpKf's early return moved — re-point this check",
    ).toBe(true);
    // brake 2: the carrier is frozen by the pause (main's context.yml drops it from git add)
    // — asserted at its own guard (bot-path-whitelist); noted here so a reader sees both.
    expect(
      CROSSINGS.every((c) => c.braked),
      "a crossing is RECORDED as unbraked — it reached a board and a series may restate",
    ).toBe(true);
  });

  it("PLANT (invalid-by-value): an unrecorded armed umpire is NAMED, not just counted", () => {
    const recorded = new Set<string>(CROSSINGS.map((c) => c.ump));
    const missing = ["__NOT_AN_UMPIRE__", ...armedUmps()].filter((u) => !recorded.has(u));
    expect(missing, "the completeness check failed to name a planted unrecorded crossing").toContain(
      "__NOT_AN_UMPIRE__",
    );
  });

  it("PLANT (invalid-by-value): a shortened record fails the floor", () => {
    expect(
      CROSSINGS.slice(0, FLOOR - 1).length >= FLOOR,
      "the floor admitted a truncated record",
    ).toBe(false);
  });
});
