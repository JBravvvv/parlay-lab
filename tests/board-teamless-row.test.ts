import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripComments } from "./helpers/source";
import {
  CZ_NULL_TEAM,
  CZ_PRUNE_MS,
  mergeCzHidden,
  migrateCzHidden,
  pruneCzHidden,
  validateCzHidden,
  type CzHiddenMap,
} from "@/lib/cz-hidden-merge";
import { parseBoardLabel, propRowLabel } from "@/lib/player-card";
import { labelLineupStatus, shapeLineups, type ScheduleWithLineups } from "@/lib/lineup-check";
import type { PropBoardGame } from "@/engine";
import { LEGACY_SRC } from "@/engine/legacy-src.gen";

/**
 * THE TEAM-LESS ALL-SCOPE ROW (2026-09-28). Found during the player-positions review and left alone
 * then on purpose: the Board's ALL scope built every prop row's player string as `${r.p} (${r.tm})`,
 * and the engine sets `tm` null whenever the book's spelling is missing from the stats pull
 * (`tm: lookupTeam[pnorm(row.p)] || null` — accents, "Jr.", bench bats). So those rows read
 * "Name (null)", and:
 *   • `parseBoardLabel` needs a 2–3 letter team, so the lineup check normalized "name null", never
 *     found him in a posted nine, and judged the row OUT — dimmed and hidden unless "show scratched";
 *   • the hit-rate lookup keyed on the broken string;
 *   • the position tag only survived through a display-only strip of " (null)".
 *
 * The row is now the engine's own label (`propRowLabel`): the bare name when there is no team. The
 * player string is also the player segment of the ⓘ sportsbook-hide key, which is stored and synced
 * across Josh's devices, so every stored " (null)|" key is migrated to the bare form at every door.
 *
 * Every lineup, name and key below is real fixture data or an obviously synthetic key; no price is
 * involved anywhere in this file.
 */

const sync = vi.hoisted(() => ({ key: "" }));
vi.mock("@/lib/ledgerSync", () => ({ getSyncKey: () => sync.key }));
const store = vi.hoisted(() => ({ value: null as string | null, sets: 0 }));
vi.mock("@/lib/server/store", () => ({
  syncConfigMissing: () => [],
  syncAuthed: () => true,
  redisGetJson: async () => (store.value == null ? null : JSON.parse(store.value)),
  redis: async (cmd: unknown[]) => {
    if (cmd[0] === "SET") {
      store.value = String(cmd[2]);
      store.sets++;
    }
    return "OK";
  },
}));

import { loadCzHidden, pullMergeCzHidden } from "@/lib/cz-offered";
import { GET, PUT } from "../app/api/prefs/route";

const root = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const readSrc = (p: string) => stripComments(read(p));

/** [hidden, at] per key, like tests/cz-sync.test.ts */
const M = (o: Record<string, [boolean, number]>): CzHiddenMap =>
  Object.fromEntries(Object.entries(o).map(([k, [hidden, at]]) => [k, { hidden, at }]));
const hiddenCount = (m: CzHiddenMap) => Object.values(m).filter((e) => e.hidden).length;

/* ------------------------------------------------------------------ the label */

describe("the ALL-scope player string is the engine's own pick label", () => {
  it("'Name (TEAM)' with a team, the bare name without one — never '(null)'", () => {
    expect(propRowLabel({ p: "Aaron Judge", tm: "NYY" })).toBe("Aaron Judge (NYY)");
    for (const tm of [null, undefined, ""]) {
      const label = propRowLabel({ p: "Luis Garcia", tm });
      expect(label, String(tm)).toBe("Luis Garcia");
      expect(label).not.toMatch(/null|undefined|\(/);
    }
    /* the inverse the Board's readers use: a team label parses, a bare one is the name itself */
    expect(parseBoardLabel(propRowLabel({ p: "Aaron Judge", tm: "NYY" }))).toEqual({ name: "Aaron Judge", team: "NYY" });
    expect(parseBoardLabel(propRowLabel({ p: "Luis Garcia", tm: null }))).toBeNull();
  });

  it("the engine prints exactly this: its pick label and the prop row's `tm` read the same lookup", () => {
    /* the source file, and the string the app actually runs (the .gen.ts literal escapes its quotes) */
    for (const [file, src] of [["legacy/index.html", read("legacy/index.html")], ["LEGACY_SRC", LEGACY_SRC]] as const) {
      expect(src, file).toContain('var tmAb=lookupTeam[pnorm(row.p)];');
      expect(src, file).toContain('label:row.p+(tmAb?" ("+tmAb+")":"")');
      expect(src, file).toContain("tm:lookupTeam[pnorm(row.p)]||null");
    }
  });

  it("on a real stored prop board every row's label reads back as its own player, with or without his team", () => {
    const fx = JSON.parse(read("tests/fixtures/gen-pool.json")) as { propBoard: PropBoardGame[] };
    let rows = 0;
    for (const g of fx.propBoard) for (const rs of Object.values(g.markets ?? {})) for (const r of rs) {
      rows++;
      for (const row of [r, { ...r, tm: null }]) {
        const label = propRowLabel(row);
        /* exactly what labelLineupStatus reads out of a label */
        expect(parseBoardLabel(label)?.name ?? label).toBe(r.p);
        expect(label).not.toContain("(null)");
      }
    }
    expect(rows).toBeGreaterThan(250);
  });
});

/* ------------------------------------------------------------------ the lineup check */

describe("a team-less batter who is in the posted lineup is no longer judged OUT", () => {
  /* the real statsapi schedule?hydrate=lineups read of 2026-09-04 (see tests/lineup-check.test.ts):
     NYY@SD pk 823256 with both nines posted, DET@CLE gm2 pk 824387 with its lineups stripped */
  const FX = JSON.parse(read("tests/fixtures/lineups-2026-09-04.json")) as ScheduleWithLineups & {
    dates: { games: { gamePk: number; lineups?: { awayPlayers?: { fullName: string }[]; homePlayers?: { fullName: string }[] } }[] }[];
  };
  const L = shapeLineups(FX);
  const game = FX.dates[0].games.find((g) => g.gamePk === 823256)!;
  const NINES = [...(game.lineups?.awayPlayers ?? []), ...(game.lineups?.homePlayers ?? [])].map((p) => p.fullName);

  it("THE CASE: the feed's 'Luis García Jr.' is the book's 'Luis Garcia' — OUT under the old label, IN under the new", () => {
    expect(NINES).toContain("Luis García Jr.");
    const row = { p: "Luis Garcia", tm: null };
    /* the pre-fix flatten, reproduced through the Board's own read */
    expect(labelLineupStatus(`${row.p} (${row.tm})`, "batter_total_bases", 823256, L)).toBe("out");
    expect(labelLineupStatus(propRowLabel(row), "batter_total_bases", 823256, L)).toBe("in");
  });

  it("all eighteen posted batters: IN as a bare team-less label, OUT as 'Name (null)', IN with a team", () => {
    expect(NINES).toHaveLength(18);
    for (const name of NINES) {
      expect(labelLineupStatus(propRowLabel({ p: name, tm: null }), "batter_hits", 823256, L), name).toBe("in");
      expect(labelLineupStatus(`${name} (null)`, "batter_hits", 823256, L), name).toBe("out");
      expect(labelLineupStatus(propRowLabel({ p: name, tm: "NYY" }), "batter_hits", 823256, L), name).toBe("in");
    }
  });

  it("the rule still bites: a team-less batter missing from the posted nine is OUT; a pitcher or an unposted game is never judged", () => {
    expect(labelLineupStatus(propRowLabel({ p: "Jose Caballero", tm: null }), "batter_hits_runs_rbis", 823256, L)).toBe("out");
    expect(labelLineupStatus(propRowLabel({ p: "Max Fried", tm: null }), "pitcher_strikeouts", 823256, L)).toBe("unknown");
    expect(labelLineupStatus(propRowLabel({ p: "Luis Garcia", tm: null }), "batter_hits", 824387, L)).toBe("unknown");
    expect(labelLineupStatus(null, "batter_hits", 823256, L)).toBe("unknown");
  });

  it("the Board builds the row with propRowLabel and judges every row through labelLineupStatus (source, comment-stripped)", () => {
    const page = readSrc("app/board/page.tsx");
    expect(page).toMatch(/rank: 0, player: propRowLabel\(r\), side: "o",/);
    expect(page).toMatch(/labelLineupStatus\(label, market, pkOf\(gkey\), lineups\.data\) === "out"/);
    expect(page).toMatch(/const pickOut = useCallback\(\(p: ApiPick\) => isOut\(p\.player, p\.market \?\? cat, p\.gkey\), \[isOut, cat\]\);/);
    /* the label is drawn as it is on the Board and in the My parlay bar */
    expect(page).toMatch(/\{p\.player \? <BoardLabel label=\{p\.player\} market=\{p\.market \?\? cat\} \/> : null\}/);
    const bar = readSrc("src/components/mlb/MyParlayBar.tsx");
    expect(bar).toMatch(/<BoardLabel label=\{l\.label\} market=\{l\.market\} \/>/);
    /* …and the old template and both display strips are gone. Each negative pattern is first shown to
       match the pre-fix line it stands for, so it cannot pass by matching nothing. */
    const TEMPLATE = /\(\$\{r\.tm\}\)/;
    const STRIP = /\.replace\(\/ \\\(null\\\)\$\/, ""\)/;
    expect("rank: 0, player: `${r.p} (${r.tm})`, side: \"o\",").toMatch(TEMPLATE);
    expect('<BoardLabel label={p.player.replace(/ \\(null\\)$/, "")} market={p.market ?? cat} />').toMatch(STRIP);
    expect(page).not.toMatch(TEMPLATE);
    expect(page).not.toMatch(STRIP);
    expect(bar).not.toMatch(STRIP);
  });
});

/* ------------------------------------------------------------------ the key migration */

const OLD = "batter_hits|Luis Garcia (null)|0.5|o";
const BARE = "batter_hits|Luis Garcia|0.5|o";

describe("migrateCzHidden — a stored team-less key becomes the bare key the row now carries", () => {
  it("rewrites every ' (null)|' key, book-scoped ones included, and leaves every other key exactly as it was", () => {
    const m = M({
      [OLD]: [true, 100],
      "book:draftkings:batter_total_bases|Luis Garcia (null)|1.5|o": [true, 110],
      "batter_hits|Aaron Judge (NYY)|0.5|o": [true, 120],
      "Aaron Judge (NYY)|Hits O 0.5": [false, 130],
      "ml|NYY": [true, 140],
    });
    const out = migrateCzHidden(m);
    expect(out).toEqual(
      M({
        [BARE]: [true, 100],
        "book:draftkings:batter_total_bases|Luis Garcia|1.5|o": [true, 110],
        "batter_hits|Aaron Judge (NYY)|0.5|o": [true, 120],
        "Aaron Judge (NYY)|Hits O 0.5": [false, 130],
        "ml|NYY": [true, 140],
      }),
    );
    expect(Object.keys(out).some((k) => k.includes(CZ_NULL_TEAM))).toBe(false);
    expect(Object.keys(out)).toEqual(Object.keys(out).slice().sort()); /* sorted, like the merge */
    expect(validateCzHidden(out).ok).toBe(true);
  });

  it("a map with nothing to rewrite comes back as the same object — the device copy is saved once, never on every load", () => {
    const clean = M({ [BARE]: [true, 100], "ml|NYY": [false, 5] });
    expect(migrateCzHidden(clean)).toBe(clean);
    const empty: CzHiddenMap = {};
    expect(migrateCzHidden(empty)).toBe(empty);
  });

  it("a collision keeps the newer `at` — from either key, whichever was stored first", () => {
    const cases: [[boolean, number], [boolean, number], { hidden: boolean; at: number }][] = [
      [[true, 200], [false, 100], { hidden: true, at: 200 }], /* hid on the old label after an unhide */
      [[false, 300], [true, 100], { hidden: false, at: 300 }], /* unhid on the old label (an older bundle) */
      [[true, 100], [true, 300], { hidden: true, at: 300 }],
      [[true, 100], [false, 300], { hidden: false, at: 300 }], /* unhid on the new label */
    ];
    for (const [oldE, bareE, want] of cases) {
      const oldFirst = migrateCzHidden(M({ [OLD]: oldE, [BARE]: bareE }));
      const bareFirst = migrateCzHidden(M({ [BARE]: bareE, [OLD]: oldE }));
      expect(oldFirst, JSON.stringify([oldE, bareE])).toEqual({ [BARE]: want });
      expect(bareFirst).toEqual({ [BARE]: want });
    }
  });

  it("an equal-`at` collision goes to hidden, exactly as the merge decides the same pair", () => {
    for (const [oldE, bareE] of [
      [[false, 100], [true, 100]],
      [[true, 100], [false, 100]],
    ] as [[boolean, number], [boolean, number]][]) {
      const migrated = migrateCzHidden(M({ [OLD]: oldE, [BARE]: bareE }))[BARE];
      expect(migrated).toEqual({ hidden: true, at: 100 });
      expect(migrated).toEqual(mergeCzHidden(M({ [BARE]: oldE }), M({ [BARE]: bareE }))[BARE]);
    }
  });

  it("tombstones are respected: carried as tombstones, out-voting older hides, and still pruned by age — after migrating", () => {
    const NOW = 1_000_000_000_000;
    /* a lone unhide on the old label moves as an unhide — never dropped, never turned into a hide */
    expect(migrateCzHidden(M({ [OLD]: [false, 400] }))).toEqual(M({ [BARE]: [false, 400] }));
    /* a fresh tombstone that out-voted an older hide survives the prune */
    const fresh = M({ [OLD]: [false, NOW - 60_000], [BARE]: [true, NOW - 120_000] });
    expect(pruneCzHidden(migrateCzHidden(fresh), NOW)).toEqual(M({ [BARE]: [false, NOW - 60_000] }));
    /* an expired tombstone that out-voted an older hide: migrating FIRST keeps the pick visible (the unhide
       was the last word); pruning first would drop the tombstone and resurrect the hide — which is why every
       door migrates before it prunes */
    const aged = M({ [OLD]: [false, NOW - CZ_PRUNE_MS - 2], [BARE]: [true, NOW - CZ_PRUNE_MS - 5] });
    expect(pruneCzHidden(migrateCzHidden(aged), NOW)).toEqual({});
    expect(migrateCzHidden(pruneCzHidden(aged, NOW))).toEqual(M({ [BARE]: [true, NOW - CZ_PRUNE_MS - 5] }));
  });

  it("no orphan keeps counting: the hidden total becomes the number of distinct picks hidden", () => {
    const m = M({
      [OLD]: [true, 100], /* pick A, hidden on the old label… */
      [BARE]: [true, 200], /* …and again on the new one: one pick, counted twice */
      "batter_runs_scored|Nick Gonzales (null)|0.5|o": [true, 100], /* pick B — never matched by any row again */
      "pitcher_outs|Luis Garcia (null)|15.5|o": [false, 300], /* pick C, unhid on the old label… */
      "pitcher_outs|Luis Garcia|15.5|o": [true, 50], /* …after an older hide */
    });
    expect(hiddenCount(m)).toBe(4);
    const out = migrateCzHidden(m);
    expect(hiddenCount(out)).toBe(2);
    expect(Object.keys(out)).toEqual([BARE, "batter_runs_scored|Nick Gonzales|0.5|o", "pitcher_outs|Luis Garcia|15.5|o"]);
    expect(out["pitcher_outs|Luis Garcia|15.5|o"]).toEqual({ hidden: false, at: 300 });
  });

  it("idempotent, and it commutes with the merge — two devices converge whichever copy migrates first (seeded, 500 draws)", () => {
    let s = 0x5eed2826;
    const rnd = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const players = ["Luis Garcia", "Nick Gonzales", "Ronald Acuna"];
    const forms = (p: string) => [
      `batter_hits|${p} (null)|0.5|o`,
      `batter_hits|${p}|0.5|o`,
      `book:draftkings:batter_hits|${p} (null)|0.5|o`,
      `book:draftkings:batter_hits|${p}|0.5|o`,
    ];
    const universe = players.flatMap(forms);
    const draw = (): CzHiddenMap => {
      const m: CzHiddenMap = {};
      for (const k of universe) if (rnd() < 0.45) m[k] = { hidden: rnd() < 0.5, at: 1 + Math.floor(rnd() * 4) };
      return m;
    };
    let collisions = 0;
    for (let i = 0; i < 500; i++) {
      const a = draw();
      const b = draw();
      const ma = migrateCzHidden(a);
      if (Object.keys(ma).length < Object.keys(a).length) collisions++;
      expect(JSON.stringify(migrateCzHidden(ma))).toBe(JSON.stringify(ma));
      expect(Object.keys(ma).some((k) => k.includes(CZ_NULL_TEAM))).toBe(false);
      expect(JSON.stringify(migrateCzHidden(mergeCzHidden(a, b)))).toBe(JSON.stringify(mergeCzHidden(ma, migrateCzHidden(b))));
    }
    expect(collisions).toBeGreaterThan(100); /* the property was exercised on real collisions, not vacuously */
  });
});

/* ------------------------------------------------------------------ every door */

describe("every door migrates: the device copy, every pull, and both /api/prefs verbs", () => {
  const KEY = "pl_cz_hidden_v2";
  const KEY_V1 = "pl_cz_hidden_v1";
  let ls: Map<string, string>;
  let writes: string[];
  beforeEach(() => {
    ls = new Map();
    writes = [];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writes.push(k);
        ls.set(k, v);
      },
      removeItem: (k: string) => void ls.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sync.key = "";
  });

  it("the device copy: rewritten on the first load and saved back once; a clean copy is never re-saved", () => {
    ls.set(KEY, JSON.stringify(M({ [OLD]: [true, 100], [BARE]: [false, 50], "ml|NYY": [true, 7] })));
    const first = loadCzHidden();
    expect(first).toEqual(M({ [BARE]: [true, 100], "ml|NYY": [true, 7] }));
    expect(writes).toEqual([KEY]);
    expect(JSON.parse(ls.get(KEY)!)).toEqual(first);
    expect(loadCzHidden()).toEqual(first);
    expect(writes).toEqual([KEY]); /* the second load found nothing to rewrite */
  });

  it("the device copy, from v1: the one-way v1 conversion comes out migrated, and v1 stays in place for a stale bundle", () => {
    ls.set(KEY_V1, JSON.stringify({ [OLD]: true, "ml|NYY": true }));
    const out = loadCzHidden();
    expect(Object.keys(out)).toEqual([BARE, "ml|NYY"]);
    expect(out[BARE].hidden).toBe(true);
    expect(ls.has(KEY_V1)).toBe(true);
  });

  it("every pull: a cloud copy still holding team-less keys is migrated before the merge, and the push carries only bare keys", async () => {
    const NOW = Date.parse("2026-09-28T20:00:00Z");
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    sync.key = "test-phrase"; /* a test double for getSyncKey — never a real phrase */
    const puts: CzHiddenMap[] = [];
    /* timestamps inside the 45-day tombstone window, so the pull's prune keeps the unhide below */
    const [HID, NICK, UNHID] = [NOW - 86_400_000, NOW - 90_000_000, NOW - 3_600_000];
    const remote = M({ [OLD]: [true, HID], "batter_runs_scored|Nick Gonzales (null)|0.5|o": [true, NICK] });
    vi.stubGlobal("fetch", async (_url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "PUT") {
        puts.push((JSON.parse(init.body!) as { czHidden: CzHiddenMap }).czHidden);
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => ({ czHidden: remote }) };
    });
    /* this device unhid Luis Garcia on the new label AFTER the phone hid him on the old one */
    const local = M({ [BARE]: [false, UNHID] });
    const merged = await pullMergeCzHidden(local);
    expect(merged).toEqual(M({ [BARE]: [false, UNHID], "batter_runs_scored|Nick Gonzales|0.5|o": [true, NICK] }));
    expect(hiddenCount(merged!)).toBe(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toEqual(merged);
    expect(Object.keys(puts[0]).some((k) => k.includes(CZ_NULL_TEAM))).toBe(false);
  });

  it("/api/prefs: GET serves the stored copy migrated; PUT migrates what an older bundle sends and writes the bare form back", async () => {
    /* real clock here (PUT prunes against Date.now()), so the timestamps sit inside the tombstone window */
    const T = Date.now();
    store.value = JSON.stringify({ czHidden: M({ [OLD]: [true, T - 86_400_000], "ml|NYY": [true, 5] }), at: 1 });
    store.sets = 0;
    const get = await GET(new NextRequest("http://localhost/api/prefs", { headers: { "x-pl-sync": "t" } }));
    expect(get.status).toBe(200);
    expect(((await get.json()) as { czHidden: CzHiddenMap }).czHidden).toEqual(M({ [BARE]: [true, T - 86_400_000], "ml|NYY": [true, 5] }));
    expect(store.sets).toBe(0); /* a read never writes */

    /* an older bundle still keys the pick on the old label; its unhide is the newest word */
    const put = await PUT(
      new NextRequest("http://localhost/api/prefs", {
        method: "PUT",
        headers: { "x-pl-sync": "t", "content-type": "application/json" },
        body: JSON.stringify({ czHidden: M({ [OLD]: [false, T - 1_000] }) }),
      }),
    );
    expect(put.status).toBe(200);
    expect(store.sets).toBe(1);
    const stored = (JSON.parse(store.value!) as { czHidden: CzHiddenMap }).czHidden;
    expect(stored).toEqual(M({ [BARE]: [false, T - 1_000], "ml|NYY": [true, 5] }));
    expect(store.value).not.toContain("(null)");
  });

  it("the doors migrate before they prune (source, comment-stripped)", () => {
    const client = readSrc("src/lib/cz-offered.ts");
    expect(client).toMatch(/const map = migrateCzHidden\(v\.map\);\s*if \(map !== v\.map\) save\(map\);\s*return map;/);
    expect(client).toMatch(/return migrateCzHidden\(map\);/);
    expect(client).toMatch(/const remote = v\?\.ok \? migrateCzHidden\(v\.map\) : \{\};\s*const merged = pruneCzHidden\(mergeCzHidden\(local, remote\), Date\.now\(\)\);/);
    const route = readSrc("app/api/prefs/route.ts");
    expect(route).toMatch(/return v\.ok \? \{ czHidden: migrateCzHidden\(v\.map\), at: s\.at \} : null;/);
    expect(route).toMatch(/pruneCzHidden\(mergeCzHidden\(cur\?\.czHidden \?\? \{\}, migrateCzHidden\(v\.map\)\), Date\.now\(\)\)/);
  });
});
