import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * THE CONFIGURED CRON HOUR IS NEVER THE OBSERVED HOUR. ENFORCED, NOT REMEMBERED.
 *
 * Measured 2026-07-27 across all six scheduled workflows via the Actions API, `event: schedule`
 * only, 14+ days. **Zero exceptions**, and two distinct failure modes:
 *
 *   LOW-FREQUENCY (2 crons/day) — fires every tick, but LATE
 *     props-history  `0 17` -> 20:08-20:55Z (+3.1 to +3.9h) · `45 22` -> 07:27-07:58Z NEXT DAY
 *     context        `0 17` -> 20:08-20:55Z             · `30 22` -> 06:19-08:30Z NEXT DAY
 *     model          `30 9` -> 12:09-17:24Z (+2.6 to +7.9h, median +5.7h)
 *     hr-overround   `0 15 * * 0` -> 18:16Z (+3.3h, n=1)
 *
 *   HIGH-FREQUENCY (hourly) — ticks are DROPPED, not delayed
 *     line-history   `12 * * * *` (24/day) -> **3-5 runs/day, ~17% of ticks**, minute ignored
 *
 * This has now silently broken three things: the umpire shadow log (a +8h run overwriting a
 * good file), Series B's Sunday population (a "close" firing after the slate started), and the
 * props archive cadence (fifteen days of a sweep landing nine hours late, unnoticed).
 *
 * THE RULE: a scheduled workflow whose VALUE depends on when it ran must guard itself against a
 * real clock — first pitch, or a day boundary — and never against the cron hour. Every workflow
 * declares which it is, in the file, and this test fails the build if one does not.
 *
 * A new scheduled workflow fails here until it is classified. That is the point: the fifteen-day
 * miss happened because nobody was asked the question.
 */

const DIR = path.join(__dirname, "..", ".github", "workflows");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".yml"));

/** guards that a SENSITIVE workflow may name, and where each must actually exist */
const GUARDS: Record<string, { file: string; symbol: string; how: string }> = {
  _snapshot_kind: {
    file: "tools/snapshot_props.py",
    symbol: "def _snapshot_kind(",
    how: "decides close-vs-pre from the next unstarted first pitch",
  },
  merge_prior: {
    file: "tools/build_context.py",
    symbol: "def merge_prior(",
    how: "makes lateness harmless: a run that resolves nothing preserves the prior file",
  },
  WINDOW_DAYS: {
    file: "tools/archive_boards.py",
    // the trailing "(" / "=" matters: without it a RENAME still substring-matches. Found by
    // testing this test — renaming _snapshot_kind to _snapshot_kind_RENAMED passed cleanly.
    symbol: "WINDOW_DAYS = ",
    how: "targets a multi-day window, so any fire inside the TTL captures the date",
  },
};

type Row = { file: string; scheduled: boolean; sensitive: boolean | null; guard: string | null; reason: string };

// the scanner, named so the teeth test can attack it with an INVALID VALUE (2026-07-27):
// the enum is closed but absence-of-match FIRES (reported as "missing marker"), so an
// invalid value is visible — the safe shape. The plant below pins that property.
const TIMING_RE = /#\s*TIMING:\s*(SENSITIVE|INSENSITIVE)\s*[—-]\s*(.*)/;

function classify(f: string): Row {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  const scheduled = /^\s*schedule:/m.test(src) && /^\s*- cron:/m.test(src);
  const m = TIMING_RE.exec(src);
  if (!m) return { file: f, scheduled, sensitive: null, guard: null, reason: "" };
  const sensitive = m[1] === "SENSITIVE";
  const g = /guard:\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(m[2]);
  return { file: f, scheduled, sensitive, guard: g ? g[1] : null, reason: m[2] };
}

const rows = files.map(classify);

describe("every scheduled workflow declares whether its value depends on WHEN it ran", () => {
  it("PLANT: an invalid classification value is visible to the scanner", () => {
    // "# TIMING: BANANA" must not parse — and a non-parse is reported as MISSING, which fails
    expect(TIMING_RE.exec("# TIMING: BANANA — some reason")).toBeNull();
    expect(TIMING_RE.exec("# TIMING: SENSITIVE — guard: x")).not.toBeNull();
  });
  it("there is at least one scheduled workflow to check", () => {
    expect(rows.filter((r) => r.scheduled).length).toBeGreaterThanOrEqual(6);
  });

  it("EVERY scheduled workflow carries a TIMING classification", () => {
    // guarded IN PLACE, not by a sibling test: an empty `rows` would pass this loop silently
    expect(rows.filter((r) => r.scheduled).length, "no scheduled workflow found — scan broken").toBeGreaterThanOrEqual(6);
    for (const r of rows) {
      if (!r.scheduled) continue;
      expect(
        r.sensitive,
        `${r.file} is scheduled but has no "# TIMING: SENSITIVE|INSENSITIVE" line. ` +
          `Cron hours on this account run +3 to +10h late and hourly ticks are dropped — ` +
          `say which this job is, and if SENSITIVE name a guard.`,
      ).not.toBeNull();
    }
  });

  it("a SENSITIVE workflow names a guard, and the guard exists in the file it claims", () => {
    for (const r of rows) {
      if (!r.scheduled || r.sensitive !== true) continue;
      expect(r.guard, `${r.file}: TIMING: SENSITIVE with no "guard: <symbol>"`).not.toBeNull();
      const g = GUARDS[r.guard!];
      expect(g, `${r.file}: unknown guard "${r.guard}" — add it to GUARDS with where it lives`).toBeTruthy();
      const src = fs.readFileSync(path.join(__dirname, "..", g.file), "utf8");
      expect(
        src.includes(g.symbol),
        `${r.file} names guard "${r.guard}" but ${g.file} no longer contains \`${g.symbol}\` — ` +
          `the guard was removed or renamed and the workflow now relies on the cron hour.`,
      ).toBe(true);
    }
  });

  it("an INSENSITIVE workflow states WHY, at length — an unexplained claim is not a classification", () => {
    for (const r of rows) {
      if (!r.scheduled || r.sensitive !== false) continue;
      expect(r.reason.length, `${r.file}: TIMING: INSENSITIVE with no reason`).toBeGreaterThan(40);
    }
  });

  it("the classification is complete and the two SENSITIVE guards are the ones expected", () => {
    const sens = rows.filter((r) => r.scheduled && r.sensitive).map((r) => r.file).sort();
    // board-archive is SENSITIVE-with-a-window rather than INSENSITIVE: it does have a timing
    // requirement (after the day, before the 3-day TTL), it is simply guarded by construction.
    expect(sens).toEqual(["board-archive.yml", "context.yml", "props-history.yml"]);
    const insens = rows.filter((r) => r.scheduled && r.sensitive === false).map((r) => r.file).sort();
    /* line-history.yml LEFT this list 2026-07-31 — not reclassified, DISABLED: its
       schedule block is commented out (owner's cadence ration; nothing reads its output,
       invariant in tests/line-history-consumers.test.ts). It reappears here the moment
       the schedule is uncommented, which is the intended coupling. NOTE: model.yml is
       still counted here even though the 07-29 bot pause commented ITS schedule out —
       the two disables use different comment styles and this parser only stops seeing
       the one that removes the `schedule:` key itself. That asymmetry is recorded rather
       than smoothed: it means "scheduled" in this guard means "declares a schedule the
       parser can see", not "will fire". */
    expect(insens).toEqual(["hr-overround.yml", "model.yml", "ufc.yml"]);
  });

  it("no workflow claims a self-pacing guard it does not use", () => {
    // the inverse check: a script that HAS a guard should be referenced by the workflow that
    // needs it, or the guard is dead code nobody is protected by
    for (const [name, g] of Object.entries(GUARDS)) {
      const claimed = rows.some((r) => r.guard === name);
      expect(claimed, `${g.file} defines guard \`${name}\` but no workflow declares it`).toBe(true);
    }
  });
});
