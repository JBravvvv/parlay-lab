import { describe, expect, it } from "vitest";
import { BANK_BASE } from "@/lib/bankroll";
import fs from "node:fs";
import path from "node:path";
import { PAPER, PAPER_TICKETS, SUSPENSIONS_LIFTED, applySuspensionLift, ticketWindow } from "@/lib/paper-mode";
import { SHAPE_TICKETS, SHAPE_TOTAL } from "@/lib/core-shapes";
import { LEDGER_EPOCH, decideEpochMigration, mergeAllowed } from "@/lib/ledger-epoch";
import { discipline, type NoPlayLog } from "@/lib/noplay";
import type { SyncEntry } from "@/lib/ledger-merge";

/**
 * THE PAPER EPOCH (2026-08-15, Josh's word, verbatim scope):
 *   "Unsuspend H+R+RBI and other props on tickets; Clear the ledger and start betting a
 *    hypothetical $150 every single day no matter what on the ticket … I will not be
 *    taking ANY of the bets so its all hypothetical money to track. Do $25 in fun money
 *    every day as well."
 *
 * Three mechanisms, none of which move the engine hash:
 *
 * 1. SUSPENSION LIFT — SH_CFG.hrrAltMax/-1 and outsSusp/true are runtime config the
 *    engine reads at analyze time; both generators override them after boot (the cfSel
 *    module proved this exact pattern). Every H+R+RBI line and pitcher_outs return to
 *    the ticket candidate pool.
 *
 * 2. LEDGER EPOCH — "clear" cannot be a plain delete: the sync merge is append-only by
 *    design, so any device would push the old season straight back. Epoch 2 = the paper
 *    era. The server archives the epoch-1 blob (SET NX — first archive wins, re-runs
 *    can't clobber) then resets; clients that see a newer epoch archive their local
 *    copy and adopt; PUTs carrying an older epoch (stale bundles) are answered, never
 *    merged. Nothing is destroyed — everything is archived.
 *
 * 3. PAPER DEPLOYMENT — the disciplined ev_gated allocation runs FIRST at $150 (that is
 *    the calibrated system the record tracks); whatever the gate leaves unstaked is
 *    forced onto the remaining leg-disjoint pool via the legacy caesars_ev allocator
 *    (no EV gate, exact-sum). Forced tickets carry forced:true so gated performance and
 *    forced deployment can always be split. $25 fun via the engine's own shFunPick,
 *    once per day. Every paper ticket: paper:true, placed:false (Josh's standing word —
 *    he takes none), actualStake:0. discipline() excludes paper entries — hypothetical
 *    stakes must never pollute the real-money discipline record.
 */

describe("the paper constants are Josh's numbers, verbatim", () => {
  it("$150 core + $25 fun since 2026-08-15; $2,500 paper bankroll since 2026-09-08 (INSTRUCTION 46b)", () => {
    /* PIN UPDATED 2026-09-08 (INSTRUCTION 46b, Josh's word, verbatim: "How do we increase the
       size of kelly? this is all hypothetical so cash flow can be much higher"): the server
       lock priced Kelly off the legacy $750 default (empty in-memory storage), capping every
       ticket at 8% = $60 while the browser's managed bankroll initialises at BANK_BASE $2,500.
       OBSERVED RED against the three-key PAPER before this update. */
    expect(PAPER).toEqual({ since: "2026-08-15", daily: 150, fun: 25, bankroll: 2500 });
    expect(PAPER.bankroll).toBe(BANK_BASE);
  });
  it("3-5 tickets for the $150 per day — DERIVED from Josh's shape menu since 2026-09-08 (was the pinned 3-7 of 2026-08-22)", () => {
    /* PIN UPDATED 2026-09-08 (INSTRUCTION 46, "Parlay Lab Baseball 1"): the ticket count
       is no longer a rule of its own — the day runs one of the six CORE_SHAPES and the
       count IS the slot count. min/max are read off the menu (SHAPE_TICKETS); the pin
       below is the menu's fewest (E: 3 slots) and most (A/B/C/D: 5 slots) so a menu edit
       moving the count is visible here. OBSERVED RED against the 2026-08-22 {3,7} pin. */
    expect(PAPER_TICKETS).toEqual({ min: 3, max: 5 });
    expect(PAPER_TICKETS).toEqual({ min: SHAPE_TICKETS.min, max: SHAPE_TICKETS.max });
    expect(SHAPE_TOTAL, "the shape total and the paper daily must be the same $150").toBe(PAPER.daily);
  });
  it("the day-share count window pro-rates the derived 3..5 (values re-pinned 2026-09-08; lock-card now fills by slot, the window stays for its other readers)", () => {
    // single block, empty day so far
    expect(ticketWindow(150, 0)).toEqual({ maxNew: 5, minNew: 3 });
    // Sunday-shaped budgets $110/$25/$15 pro-rate to 4/1/0 under the 5-ceiling
    const a = ticketWindow(110, 0);
    expect(a).toEqual({ maxNew: 4, minNew: 3 });
    const b = ticketWindow(25, 4); // block A locked 4 tickets
    expect(b.maxNew).toBe(1);
    expect(b.minNew).toBe(1);
    const c = ticketWindow(15, 6); // over-full day: nothing more
    expect(c.maxNew).toBe(0);
    expect(c.minNew).toBe(0);
    // the ceiling is HARD: a full day admits nothing more
    expect(ticketWindow(50, 5)).toEqual({ maxNew: 0, minNew: 0 });
    expect(ticketWindow(50, 12)).toEqual({ maxNew: 0, minNew: 0 }); // over-full never goes negative
  });
  it("the lift opens every HRR line and pitcher_outs", () => {
    expect(SUSPENSIONS_LIFTED.hrrAltMax).toBeGreaterThan(10); // every real alt line is below this
    expect(SUSPENSIONS_LIFTED.outsSusp).toBe(false);
    expect(SUSPENSIONS_LIFTED.since).toBe("2026-08-15");
  });
  it("applySuspensionLift mutates a live cfg and is null-safe", () => {
    const cfg: Record<string, unknown> = { hrrAltMax: -1, outsSusp: true };
    applySuspensionLift(cfg);
    expect(cfg.hrrAltMax).toBe(SUSPENSIONS_LIFTED.hrrAltMax);
    expect(cfg.outsSusp).toBe(false);
    expect(() => applySuspensionLift(null)).not.toThrow();
  });
});

describe("ledger epoch — the clear that cannot resurrect", () => {
  it("epoch-1 blob with entries → migrate AND archive; empty → migrate without archive; current → untouched", () => {
    expect(decideEpochMigration({ ledger: [{ date: "2026-08-01" }] })).toEqual({ migrate: true, archive: true });
    expect(decideEpochMigration({ epoch: 1, ledger: [] })).toEqual({ migrate: true, archive: false });
    expect(decideEpochMigration(null)).toEqual({ migrate: true, archive: false });
    expect(decideEpochMigration({ epoch: LEDGER_EPOCH, ledger: [{ date: "x" }] })).toEqual({ migrate: false, archive: false });
    expect(decideEpochMigration({ epoch: LEDGER_EPOCH + 1, ledger: [] })).toEqual({ migrate: false, archive: false });
  });
  it("RESURRECTION PLANT: a stale-bundle PUT (no epoch) and an epoch-1 PUT are both refused a merge", () => {
    expect(mergeAllowed(undefined)).toBe(false); // the deployed-yesterday client
    expect(mergeAllowed(1)).toBe(false);
    expect(mergeAllowed(LEDGER_EPOCH)).toBe(true);
    expect(mergeAllowed(LEDGER_EPOCH + 1)).toBe(true);
    expect(mergeAllowed("not-a-number")).toBe(false);
  });
});

describe("discipline() — hypothetical money never pollutes the real-money record", () => {
  const paperEntry: SyncEntry = {
    date: "2026-08-16",
    locked: true,
    paper: true,
    core: [{ id: "t1", stake: 150, placed: false, actualStake: 0 }],
    grading: { done: true, tickets: { t1: { result: "won", payout: 300 } }, legs: {} },
  } as unknown as SyncEntry;
  const realEntry: SyncEntry = {
    date: "2026-08-01",
    locked: true,
    core: [{ id: "r1", stake: 20 }],
    grading: { done: true, tickets: { r1: { result: "lost", payout: 0 } }, legs: {} },
  } as unknown as SyncEntry;
  it("a settled paper day adds NOTHING to the gated line; the real day still counts", () => {
    const d = discipline([paperEntry, realEntry], {} as NoPlayLog, "2026-08-20");
    expect(d.lifetime.gated.staked).toBe(20); // the real $20, not 20 + the paper 150
  });
});

describe("wired — source scans, comment-stripped", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (p: string) => strip(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

  it("both generators lift the suspension after boot — server cron and browser engine", () => {
    expect(read("app/api/generate/route.ts")).toMatch(/applySuspensionLift\(cfg\)/);
    expect(read("src/lib/engine-client.ts")).toMatch(/applySuspensionLift\(cfg\)/);
  });

  it("lock-card deploys PAPER.daily with a caesars_ev top-up, forced-flagged, and stakes PAPER.fun via shFunPick", () => {
    const src = read("src/lib/server/lock-card.ts");
    expect(src).toMatch(/PAPER\.daily/);
    /* INSTRUCTION 18 (2026-09-03): the forced top-up now selects by TRUE PROBABILITY
       (CORE_RULES.forcedSelMode = "probability") — the $915 caesars_ev forced pass ran
       −27% over the 19 paper days. Pin updated, not deleted. */
    /* PIN UPDATED 2026-09-08 (INSTRUCTION 46): the forced pass is now the per-slot
       fallback — its mode is handed to the slot cfg builder as slotCfg(CORE_RULES.forcedSelMode, …) */
    expect(src).toMatch(/slotCfg\(CORE_RULES\.forcedSelMode/);
    expect(src).not.toMatch(/selMode:\s*"caesars_ev"/);
    expect(src).toMatch(/forced/);
    expect(src).toMatch(/buildFunHrTickets/); // fun reshaped 2026-08-15: HR-longshot composer (see tests/fun-hr.test.ts)
    expect(src).toMatch(/PAPER\.fun/);
    expect(src).toMatch(/paper:\s*true/);
    expect(src).toMatch(/placed:\s*false/); // Josh's standing word: he places none of these
    expect(src).not.toMatch(/capFrac \* bankroll/); // the old bankroll-derived ceiling is gone
  });

  it("SLOT FILLING (2026-09-08, INSTRUCTION 46): every slot of the day's shape is filled ONE ticket at a time, gated then forced, at the slot's stake — the count window no longer caps the passes", () => {
    const src = read("src/lib/server/lock-card.ts");
    /* HISTORY: 2026-08-19 widened the forced ceiling to the day allowance; 2026-08-21
       made it per-world; 2026-08-22 count-capped BOTH passes by ticketWindow and rode
       the leftover budget on the best ticket as a topUp; 2026-09-03 capped every ticket
       at $25 and stamped the rest capResidue. 2026-09-08 (Josh's word, verbatim: "Should
       consider doing some higher $ 2 team parlays … 2 $60 2 leg parlays one day w/ 3
       $10 3-4 leg parlays") replaced the count window and the $25 cap with SLOTS: the
       gated pass asks the allocator for ONE ticket per slot at the slot's stake
       (maxCoreTickets 1, perParlayCap 1, coreMaxLegs = the slot's max), the forced pass
       takes the slot when the gate cannot, and what no slot could seat is capResidue.
       The 08-22/09-03 source pins are RETIRED here, not deleted — replaced by the slot
       pins. ticketWindow leaves lock-card (its other readers keep it in paper-mode). */
    expect(src).not.toMatch(/ticketWindow\(/);
    expect(src).not.toMatch(/const gatedCap = /);
    expect(src).toMatch(/shapeForDay\(/);
    expect(src).toMatch(/shapeById\(/);
    expect(src).toMatch(/maxCoreTickets: 1,\s*minCoreTickets: 1,\s*coreMaxLegs: slot\.legs\.max/s);
    expect(src).toMatch(/perParlayCap: 1/);
    expect(src).toMatch(/slotCfg\(mode, gCeil\)/);
    expect(src).toMatch(/slotCfg\(CORE_RULES\.forcedSelMode, fCeil\)/);
    expect(src).toMatch(/slotMaxDec\(slot\.legs, "gated"\)/);
    expect(src).toMatch(/slotMaxDec\(slot\.legs, "forced"\)/);
    expect(src).toMatch(/shapeSlot: s\.slot/);
    expect(src).toMatch(/coreShape: shapeRecord/);
    expect(src).toMatch(/slotsUnfilled/);
    expect(src).toMatch(/capResidue/);
    expect(src).toMatch(/topUpSum/);
    /* the two impossible branches this ship adds: a pick over its slot, and a day over $150 */
    expect(src).toMatch(/a ticket may never carry more than its slot/);
    expect(src).toMatch(/OVER THE DAY/);
  });
  it("the generate route prices every fire off PAPER.daily via the deficit-carrying budget (2026-08-19), not a re-derived bankroll cap", () => {
    const src = read("app/api/generate/route.ts");
    expect(src).toMatch(/effectiveBlockBudget\(\{ daily: PAPER\.daily/);
    // the static splitBudget share is gone from the route — an under-deploying fire's
    // money must flow forward, never strand (the 08-19 $49-of-$150 day)
    expect(src).not.toMatch(/splitBudget\(PAPER\.daily/);
    expect(src).not.toMatch(/capFrac \* bankB/);
  });

  it("every writer of pl:ledger:v1 carries the epoch through — a lock or CLV write must not drop it", () => {
    for (const f of ["src/lib/server/lock-card.ts", "app/api/clv/route.ts", "app/api/ledger/route.ts"]) {
      expect(read(f), `${f} rewrites the ledger blob without preserving epoch`).toMatch(/epoch/);
    }
  });

  it("the ledger route migrates lazily and gates stale-epoch merges; the scheduler migrates on every poke", () => {
    const route = read("app/api/ledger/route.ts");
    expect(route).toMatch(/ensureLedgerEpoch/);
    expect(route).toMatch(/mergeAllowed/);
    expect(read("app/api/scheduler/route.ts")).toMatch(/ensureLedgerEpoch/);
  });

  it("the client adopts a newer epoch by ARCHIVING local first, and stamps its epoch on every push", () => {
    const src = read("src/lib/ledgerSync.ts");
    expect(src).toMatch(/LOCAL_ARCHIVE_KEY/); // first archive wins, nothing destroyed
    expect(src).toMatch(/LOCAL_EPOCH_KEY/);
    expect(src).toMatch(/adoptEpoch\(/); // runs BEFORE readLocal in syncNow
    expect(src).toMatch(/epoch:\s*LEDGER_EPOCH/); // PUT body carries it
    // and the literals themselves are pinned where they live
    const lib = read("src/lib/ledger-epoch.ts");
    expect(lib).toMatch(/pl_ledger_archive_e1/);
    expect(lib).toMatch(/pl_ledger_epoch/);
  });

  it("the surfaces say PAPER — the ledger and builder both banner the hypothetical regime", () => {
    expect(read("app/ledger/page.tsx")).toMatch(/PaperBanner/);
    expect(read("app/builder/page.tsx")).toMatch(/PaperBanner/);
  });
});
