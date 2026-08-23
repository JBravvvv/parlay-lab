import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PAPER, PAPER_TICKETS, SUSPENSIONS_LIFTED, applySuspensionLift, ticketWindow } from "@/lib/paper-mode";
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
  it("$150 core + $25 fun since 2026-08-15", () => {
    expect(PAPER).toEqual({ since: "2026-08-15", daily: 150, fun: 25 });
  });
  it("3-7 tickets for the $150 per day (Josh 2026-08-15: 3-10; RESHAPED 2026-08-22: 'a max of 7 tickets … anywhere from 3-7')", () => {
    /* OBSERVED RED on the 08-22 reshape (was {3,10}) — the pin exists so the ceiling
       never moves silently. */
    expect(PAPER_TICKETS).toEqual({ min: 3, max: 7 });
  });
  it("the day-share count window: single-block gets 3..7; a Sunday split pro-rates and every block keeps >=1", () => {
    // single block, empty day so far
    expect(ticketWindow(150, 0)).toEqual({ maxNew: 7, minNew: 3 });
    // Sunday-shaped budgets $110/$25/$15 pro-rate to 5/1/1 under the 7-ceiling
    const a = ticketWindow(110, 0);
    expect(a).toEqual({ maxNew: 5, minNew: 3 });
    const b = ticketWindow(25, 4); // block A locked 4 tickets
    expect(b.maxNew).toBe(1);
    expect(b.minNew).toBe(1);
    const c = ticketWindow(15, 6);
    expect(c.maxNew).toBe(1);
    expect(c.minNew).toBe(1);
    // the ceiling is HARD: a full day admits nothing more
    expect(ticketWindow(50, 7)).toEqual({ maxNew: 0, minNew: 0 });
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
    expect(src).toMatch(/"caesars_ev"/); // the no-gate exact-sum top-up mode
    expect(src).toMatch(/forced/);
    expect(src).toMatch(/buildFunHrTickets/); // fun reshaped 2026-08-15: HR-longshot composer (see tests/fun-hr.test.ts)
    expect(src).toMatch(/PAPER\.fun/);
    expect(src).toMatch(/paper:\s*true/);
    expect(src).toMatch(/placed:\s*false/); // Josh's standing word: he places none of these
    expect(src).not.toMatch(/capFrac \* bankroll/); // the old bankroll-derived ceiling is gone
  });

  it("the window caps BOTH passes of a fire (2026-08-22), and leftover budget rides the fire's best ticket as a stamped top-up", () => {
    const src = read("src/lib/server/lock-card.ts");
    expect(src).toMatch(/ticketWindow\(/);
    /* HISTORY: 2026-08-19 widened the forced ceiling to the day allowance because a $10
       block's window of 1 zeroed the top-up; 2026-08-21 made it per-world. 2026-08-22
       the 14-ticket card showed the other half of the hole: the GATED pass was never
       count-capped at all, so four fires stacked 14 and the last fire had no seats. Now
       BOTH passes honor the fire's window (gated capped to its share, forced gets the
       seats the gated pass left), and the money that seats cannot carry rides the best
       new ticket as `topUp` — "$150 every single day no matter what" no longer depends
       on seat arithmetic. */
    expect(src).toMatch(/const gatedCap = Math\.min\(Number\(cfg\.maxCoreTickets \?\? PAPER_TICKETS\.max\), w\.maxNew\)/);
    expect(src).toMatch(/selMode: mode,\s*maxCoreTickets: gatedCap/s);
    expect(src).toMatch(/selMode:\s*"caesars_ev",\s*maxCoreTickets/s);
    expect(src).toMatch(/const fMax = Math\.max\(0, w\.maxNew - a\.picks\.length\)/);
    expect(src).toMatch(/const residue = daily - a\.sum - f\.sum/);
    expect(src).toMatch(/topUp: tu\.amount/);
    expect(src).toMatch(/topUpSum/);
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
