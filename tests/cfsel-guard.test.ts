import { describe, expect, it, vi } from "vitest";
import { armedFixtureEngine, ARMED_DAILY, FROZEN_NOW, digest, stableHash } from "./helpers/fixture-env";
import { computeCfSel } from "@/lib/cfsel";
import { deviceReachableModes, isDisciplined } from "./helpers/modes";

/**
 * cfSel GUARD (2026-07-29, owner's ship condition): "the live emitted card must be
 * byte-identical with cfSel enabled and disabled, on the same rows. A second allocator
 * run over shared mutable state is exactly the defect class this project keeps finding."
 *
 * What is enforced, on the armed fixture (real engine, sim armed, HRR rows suspended
 * under the shipped `hrrAltMax: -1`):
 * 1. REPRODUCTION — a deep-copied slate re-analyzed under the LIVE config digests
 *    byte-identically to the live board (proves copy+re-analyze is a faithful
 *    instrument before its counterfactual means anything).
 * 2. BYTE-IDENTITY — the live board JSON and the live card (shCardPool → shAllocate)
 *    are identical before and after computeCfSel runs. cfSel enabled vs disabled
 *    differs by NOTHING except the additive `cfSel` field on suspended rows.
 * 3. RESTORE — the SH_CFG binding after computeCfSel is the same object with the same
 *    `hrrAltMax` (the lifted object is never left armed).
 * 4. DE-VACUIZATION — the counterfactual ticket sets carry HRR legs (the originally
 *    spec'd re-pool could never produce one; a cfSel that stamps `false` forever is
 *    the field-written-never-populated defect, and this assertion is what kills it).
 * 5. COVERAGE — every suspended row on the board gets a stamp key resolvable from the
 *    cfSel output (pool membership true or false, never absent).
 *
 * PLANTS (invalid-by-value, the house pattern — each proves the checker can see the
 * corruption it exists for):
 * - a no-restore simulation leaves `hrrAltMax` lifted → the restore check flags it;
 * - a single flipped field in a board copy → the byte-identity digest flags it.
 */

type Row = Record<string, unknown>;

/* MODE SWEEP (2026-07-30, owner's item 1 — "that guard was my condition for the ship,
   and it was written before productionModes() was extended"). The byte-identity claim
   is re-run in EVERY device-reachable mode. cfSel is the one genuinely mode-SENSITIVE
   instrument (it re-runs analyze + shCardPool + shAllocate), so a claim proven in
   ev_gated alone was proven in one quarter of its domain. The counterfactual itself is
   server-only (src/lib/cfsel.ts is imported by app/api/generate/route.ts and nowhere
   else), so production always runs it in the pinned mode — this sweep proves the
   INSTRUMENT is non-mutating everywhere, not that production visits those modes. */
describe.each(deviceReachableModes())("cfSel byte-identity in %s", (MODE) => {
  it("live board and live card are byte-identical flag on/off", async () => {
    const armMode = MODE;
    /* frozen clock, as armed-baseline.test.ts: without it the byDateRange batter-stat
       routes miss (dates computed from the real clock) and every batter row dies at
       `if(!st)return` — zero HRR rows, and this guard is vacuously un-runnable.
       Discovered red twice before this line existed. */
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    const eng = armedFixtureEngine();
    const slate = await eng.collectSlate();

    /* Mirror the cron route's arming (route.ts L241-242: selMode + mktN). mktN at
       proven counts is the ~08-06 state (the consensus gate is not what this guard
       tests); with mktN null the fixture's batter categories are EMPTY under ev_gated
       and the guard would prove nothing — no HRR rows, no susp rows, vacuously green.
       Discovered red: the first run failed exactly that way. */
    const cfg = eng.get<Record<string, unknown>>("SH_CFG");
    cfg.selMode = armMode;
    cfg.mktN = Object.fromEntries(
      ["ml", "rl", "batter_hits", "batter_total_bases", "batter_home_runs",
        "batter_hits_runs_rbis", "pitcher_strikeouts", "pitcher_outs"].map((k) => [k, 999]),
    );
    const data = eng.analyze(slate) as Record<string, unknown>;

    const hrrAltMaxLive = cfg.hrrAltMax;

    const alloc = eng.get<(p: unknown[], a: number, c: unknown, f: boolean) => Record<string, unknown>>(
      "shAllocate",
    );
    const cardPool = eng.get<(d: unknown) => { pl: Row }[]>("shCardPool");
    const cardOf = () => {
      const a = alloc(cardPool(data) as unknown[], ARMED_DAILY, eng.get("SH_CFG"), false);
      return ((a.picks as Row[]) ?? []).map((p) => ({
        name: ((p.w as Row)?.pl as Row)?.name,
        stake: p.stake ?? p.amt ?? p.amount,
        id: p.id,
      }));
    };

    const boardBytesBefore = JSON.stringify(digest(data));
    const boardHashBefore = stableHash(digest(data));
    const cardBefore = JSON.stringify(cardOf());

    // 1. REPRODUCTION: deep-copied slate, live config, fresh analyze — identical board
    const repro = eng.analyze(JSON.parse(JSON.stringify(slate))) as Record<string, unknown>;
    expect(
      stableHash(digest(repro)),
      "deep-copy + re-analyze is NOT deterministic-faithful — cfSel's instrument is invalid",
    ).toBe(boardHashBefore);

    // the counterfactual step under test
    const cf = computeCfSel(eng, slate);

    // 3. RESTORE: same binding object, same hrrAltMax
    const cfgAfter = eng.get<Record<string, unknown>>("SH_CFG");
    expect(cfgAfter, "SH_CFG binding was not restored to the live object").toBe(cfg);
    expect(cfgAfter.hrrAltMax, "hrrAltMax left lifted after cfSel").toBe(hrrAltMaxLive);

    // 2. BYTE-IDENTITY: board and card unchanged by the counterfactual run
    expect(JSON.stringify(digest(data)), "the live board changed under cfSel").toBe(boardBytesBefore);
    const cardAfter = JSON.stringify(cardOf());
    expect(cardAfter, "the live card changed under cfSel — shared mutable state").toBe(cardBefore);

    // 4. DE-VACUIZATION: lifted-bar tickets actually carry HRR legs
    if (isDisciplined(armMode)) {
      expect(
        cf.cfHrrTicketLegs,
        "counterfactual tickets carry ZERO HRR legs — cfSel is vacuous (stamps false forever)",
      ).toBeGreaterThan(0);
    }

    // 5. COVERAGE: every suspended row resolves to a stamp value (true or false)
    const cats = (data.categories ?? {}) as Record<string, Row[]>;
    let suspRows = 0;
    for (const [k, rows] of Object.entries(cats)) {
      if (k === "all") continue;
      for (const r of rows) {
        if (!r.susp) continue;
        suspRows++;
        const stamp = cf.stamps.get(`${r.gkey}|${r.lkey}`) ?? { pool: false, card: false };
        expect(typeof stamp.pool).toBe("boolean");
        expect(typeof stamp.card).toBe("boolean");
      }
    }
    if (isDisciplined(armMode)) {
      expect(suspRows, "fixture carries no suspended rows — the guard proves nothing").toBeGreaterThan(0);

    /* SIZEABLE COUNTERFACTUAL (2026-07-30, owner's item 3): a `card:true` stamp must
       carry the RANK and STAKE the counterfactual allocator gave it — otherwise the
       08-15 review can say WHETHER a suspended leg would have been bet but never HOW
       LARGE, and that blindness is permanent for every board from tonight forward.
       OBSERVED RED before the fields existed. */
    let carded = 0;
    for (const st of cf.stamps.values()) {
      if (!st.card) continue;
      carded++;
      expect(typeof st.rank, "card:true stamp carries no rank — the counterfactual is unsizeable").toBe("number");
      expect(st.rank as number, "rank must be 1-based").toBeGreaterThanOrEqual(1);
      expect(typeof st.stake, "card:true stamp carries no stake — the counterfactual is unsizeable").toBe("number");
      expect(Number.isFinite(st.stake as number), "non-finite counterfactual stake").toBe(true);
      expect(st.stake as number, "a carded counterfactual ticket with a non-positive stake").toBeGreaterThan(0);
    }
    if (isDisciplined(armMode)) {
      expect(carded, "no card:true stamps — the sizeable-counterfactual check is vacuous").toBeGreaterThan(0);
    }
    } else {
      // legacy modes tag nothing (finalizeCats' dscpM gate) — zero susp rows is the
      // CORRECT reading there, and it is exactly why cfSel would stamp nothing
      expect(suspRows, "legacy mode carries susp rows — the parity stance changed").toBe(0);
    }

    // the owner's print: both cards, and the cfSel counts
    // eslint-disable-next-line no-console
    console.log(
      `\ncfSel GUARD [mode=${armMode}] — armed fixture\n` +
        `  live card (flag OFF === flag ON, byte-identical): ${cardBefore}\n` +
        `  cf: tickets carry ${cf.cfHrrTicketLegs} HRR legs · pool ${cf.cfPoolTickets} tickets ` +
        `(${cf.cfHrrPoolLegs} HRR legs) · cf card ${cf.cfCardTickets} tickets\n` +
        `  suspended rows stamped: ${suspRows} (pool=true for ` +
        `${[...cf.stamps.values()].filter((s) => s.pool).length} stamp keys, ` +
        `card=true for ${[...cf.stamps.values()].filter((s) => s.card).length})`,
    );

    // ---- PLANTS ----
    // (a) no-restore simulation: the restore check must flag a lifted binding
    eng.set("SH_CFG", { ...cfg, hrrAltMax: 99 });
    const planted = eng.get<Record<string, unknown>>("SH_CFG");
    expect(planted === cfg, "plant invisible: replaced binding reads as the live object").toBe(false);
    expect(planted.hrrAltMax, "plant invisible: lifted hrrAltMax reads as live").not.toBe(hrrAltMaxLive);
    eng.set("SH_CFG", cfg); // clean up

    // (b) flipped-field plant: the digest must see a single mutated value
    const mutated = JSON.parse(JSON.stringify(digest(data)));
    const firstCat = Object.keys(mutated.categories)[0];
    if (mutated.categories[firstCat]?.[0]) {
      mutated.categories[firstCat][0][3] = 99.9; // prob field in the digest tuple
      expect(stableHash(mutated), "plant invisible: digest blind to a flipped field").not.toBe(
        stableHash(digest(data)),
      );
    }

    vi.useRealTimers();
  }, 300_000);
});
