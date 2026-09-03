/**
 * PITCHER VS TEAM — pure shaping tests (2026-09-03).
 *
 * Operator Josh, verbatim: "On the stats tab, there should be a button called
 * pitcher vs team where you can select a pitcher as well as a separate MLB team
 * and it shows every active hitter on the roster with their career stats against
 * that pitcher. That way I can see who is hot against each pitcher or if a pitcher
 * is great against a team etc."
 *
 * Covers src/lib/pvt.ts (roster -> hitters, vsPlayer split -> row, totals
 * recompute, sort order, empty-history case) with small inline fixtures shaped
 * like the live statsapi.mlb.com responses, plus a source check that the Stats
 * page mounts <PitcherVsTeam and the /api/pvt route only talks to statsapi.mlb.com.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TEAM_ABBR,
  hittersFromRoster,
  pitchersFromRoster,
  rowFromVsPlayer,
  pvtTotals,
  sortRows,
  isIntId,
  type PvtRow,
} from "@/lib/pvt";

const roster = {
  roster: [
    { person: { id: 1, fullName: "Zed Hitter" }, position: { abbreviation: "1B", type: "Infielder" } },
    { person: { id: 2, fullName: "Arm Guy" }, position: { abbreviation: "P", type: "Pitcher" } },
    { person: { id: 3, fullName: "Two Way" }, position: { abbreviation: "TWP", type: "Two-Way Player" } },
    { person: { id: 4, fullName: "Abe Catcher" }, position: { abbreviation: "C", type: "Catcher" } },
  ],
};

const judgeVsDegrom = {
  stats: [
    {
      type: { displayName: "vsPlayerTotal" },
      splits: [{ stat: {
        gamesPlayed: 5, atBats: 13, plateAppearances: 17, hits: 3, doubles: 2, triples: 0, homeRuns: 0,
        rbi: 1, baseOnBalls: 3, strikeOuts: 5, totalBases: 5, hitByPitch: 0, sacFlies: 1,
        avg: ".231", obp: ".353", slg: ".385", ops: ".738",
      } }],
    },
    { type: { displayName: "vsPlayer" }, splits: [{ stat: { atBats: 3, ops: "1.167" } }] },
  ],
};
const noHistory = { stats: [{ type: { displayName: "vsPlayerTotal" }, splits: [] }, { type: { displayName: "vsPlayer" }, splits: [] }] };

describe("pvt: roster shaping", () => {
  it("keeps non-pitchers (two-way players count as hitters) and drops pitchers", () => {
    const h = hittersFromRoster(roster);
    expect(h.map((x) => x.id)).toEqual([1, 3, 4]);
    expect(h[0]).toEqual({ id: 1, name: "Zed Hitter", pos: "1B" });
  });
  it("pitcher picker keeps only pitchers with the team abbreviation", () => {
    expect(pitchersFromRoster(roster, 147)).toEqual([{ id: 2, name: "Arm Guy", team: "NYY" }]);
  });
  it("TEAM_ABBR has all 30 clubs", () => {
    expect(Object.keys(TEAM_ABBR)).toHaveLength(30);
    expect(TEAM_ABBR[147]).toBe("NYY");
  });
});

describe("pvt: split -> row", () => {
  it("uses the vsPlayerTotal (career across teams) split, not the per-team one", () => {
    const r = rowFromVsPlayer({ id: 592450, name: "Aaron Judge", pos: "RF" }, judgeVsDegrom);
    expect(r.ab).toBe(13);
    expect(r.pa).toBe(17);
    expect(r.g).toBe(5);
    expect(r.h).toBe(3); expect(r.d2).toBe(2); expect(r.bb).toBe(3); expect(r.k).toBe(5); expect(r.tb).toBe(5);
    expect(r.avg).toBeCloseTo(0.231, 3);
    expect(r.ops).toBeCloseTo(0.738, 3);
  });
  it("no history -> pa 0 and null rates", () => {
    const r = rowFromVsPlayer({ id: 9, name: "Rookie", pos: "SS" }, noHistory);
    expect(r.pa).toBe(0); expect(r.ab).toBe(0); expect(r.h).toBe(0);
    expect(r.avg).toBeNull(); expect(r.obp).toBeNull(); expect(r.slg).toBeNull(); expect(r.ops).toBeNull();
  });
  it("garbage upstream -> treated as no history, never throws", () => {
    expect(rowFromVsPlayer({ id: 9, name: "X", pos: "C" }, null).pa).toBe(0);
    expect(rowFromVsPlayer({ id: 9, name: "X", pos: "C" }, { stats: "nope" }).pa).toBe(0);
  });
});

const row = (p: Partial<PvtRow> & { id: number; name: string }): PvtRow => ({
  pos: "1B", g: 0, pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, rbi: 0, bb: 0, k: 0, tb: 0, hbp: 0, sf: 0,
  avg: null, obp: null, slg: null, ops: null, ...p,
});

describe("pvt: totals", () => {
  it("sums counting stats over pa>0 rows and recomputes rates from the sums", () => {
    const rows = [
      row({ id: 1, name: "A", pa: 10, ab: 8, h: 4, bb: 2, tb: 7, hr: 1, k: 3, g: 3, avg: 0.5, ops: 9 }),
      row({ id: 2, name: "B", pa: 5, ab: 4, h: 0, bb: 0, hbp: 1, tb: 0, k: 2, g: 2, avg: 0, ops: 0.2 }),
      row({ id: 3, name: "C" }), // no history — excluded from the "faced" count
    ];
    const t = pvtTotals(rows);
    expect(t.faced).toBe(2);
    expect(t.hitters).toBe(3);
    expect(t.pa).toBe(15); expect(t.ab).toBe(12); expect(t.h).toBe(4); expect(t.bb).toBe(2); expect(t.tb).toBe(7);
    expect(t.hr).toBe(1); expect(t.k).toBe(5); expect(t.g).toBe(5);
    expect(t.avg).toBeCloseTo(4 / 12, 6);
    // OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
    expect(t.obp).toBeCloseTo((4 + 2 + 1) / (12 + 2 + 1 + 0), 6);
    expect(t.slg).toBeCloseTo(7 / 12, 6);
    expect(t.ops).toBeCloseTo(4 / 12 + 7 / 12 + (7 / 15 - 4 / 12), 6);
    expect(t.ops).toBeCloseTo(t.obp! + t.slg!, 9);
  });
  it("no history at all -> zero counts, null rates", () => {
    const t = pvtTotals([row({ id: 1, name: "A" })]);
    expect(t.faced).toBe(0); expect(t.pa).toBe(0);
    expect(t.avg).toBeNull(); expect(t.ops).toBeNull();
  });
});

describe("pvt: sort", () => {
  it("history rows first by OPS desc, then no-history alphabetically", () => {
    const rows = [
      row({ id: 1, name: "Zeta" }),
      row({ id: 2, name: "Low", pa: 4, ops: 0.4 }),
      row({ id: 3, name: "Alpha" }),
      row({ id: 4, name: "High", pa: 4, ops: 1.1 }),
      row({ id: 5, name: "Mid", pa: 4, ops: 0.7 }),
    ];
    expect(sortRows(rows).map((r) => r.name)).toEqual(["High", "Mid", "Low", "Alpha", "Zeta"]);
  });
});

describe("pvt: id validation", () => {
  it("accepts positive integers only", () => {
    expect(isIntId("592450")).toBe(true);
    expect(isIntId("12.5")).toBe(false);
    expect(isIntId("-1")).toBe(false);
    expect(isIntId("abc")).toBe(false);
    expect(isIntId(null)).toBe(false);
    expect(isIntId("")).toBe(false);
  });
});

describe("pvt: wiring", () => {
  const root = path.resolve(__dirname, "..");
  it("Stats page mounts <PitcherVsTeam", () => {
    const src = fs.readFileSync(path.join(root, "app/stats/page.tsx"), "utf8");
    expect(src).toMatch(/<PitcherVsTeam\b/);
    expect(src).toMatch(/import \{ PitcherVsTeam \} from "@\/components\/stats\/PitcherVsTeam"/);
  });
  it("/api/pvt route exists and only calls statsapi.mlb.com", () => {
    const p = path.join(root, "app/api/pvt/route.ts");
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, "utf8") + fs.readFileSync(path.join(root, "src/lib/pvt.ts"), "utf8");
    const hosts = Array.from(src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)).map((m) => m[1].toLowerCase());
    expect(hosts.length).toBeGreaterThan(0);
    expect(new Set(hosts)).toEqual(new Set(["statsapi.mlb.com"]));
  });
});
