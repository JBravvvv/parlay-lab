import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripComments } from "./helpers/source";
import type { PropBoardGame } from "@/engine";
import { GEN_MARKETS } from "@/components/props/mlb-gen-pool";
import { hitLogKey, hitPlayersOf } from "@/lib/mlb/hit-players";
import { buildIndex, parseBoardLabel, propRowLabel, type IndexEntry } from "@/lib/player-card";
import { hitKey, type PlayerLog } from "@/lib/prop-hit-rate";

/**
 * THE HIT-RATE CHIP FOR A TEAM-LESS PLAYER (2026-09-28). Josh: "fix the hit-rate chip for
 * team-less players too".
 *
 * The Board asked the free game-log read (useHitRates → /api/mlb/hit-rates) only about its STAMPED
 * picks, and only the ones whose label parsed with a team. A team-less player — the book's spelling
 * is missing from the engine's stats pull, so his label is the bare name — was never asked about,
 * and on the ALL view nobody outside the engine's selection pool (top 50 per market, the only rows
 * with a model %) was either. The Board now asks about every player on the whole prop board, exactly
 * as the Props page always has, with the stamped picks appended. A team-less player is asked for by
 * name alone, and the route answers only when exactly one player carries that name.
 *
 * Every board row and pick label below is real engine output (the 2026-07-09 fixture day); the
 * player index is synthetic, built with the collisions the resolver must survive. No price is
 * read or asserted anywhere in this file.
 */

const idx = vi.hoisted(() => ({ index: [] as unknown[] }));
vi.mock("@/lib/mlb/player-index", async (orig) => ({
  ...(await orig<typeof import("@/lib/mlb/player-index")>()),
  loadPlayerIndex: async () => idx.index,
}));
import { POST } from "../app/api/mlb/hit-rates/route";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const readSrc = (p: string) => stripComments(read(p));

const BOARD = (JSON.parse(read("tests/fixtures/gen-pool.json")) as { propBoard: PropBoardGame[] }).propBoard;
/* the same day's engine categories — the selection pool the day's stamped picks are drawn from; a row is [label, …] */
const CATS = (JSON.parse(read("tests/fixtures/baseline-armed-v1.json")) as { categories: Record<string, [string, ...unknown[]][]> }).categories;
const STAMPED = Object.fromEntries(Object.entries(CATS).map(([k, rows]) => [k, rows.map((r) => ({ player: r[0] }))]));

/* the markets the Board walks: its own MARKET_SHORT, read from the page */
const BOARD_SRC = readSrc("app/board/page.tsx");
const MARKET_BLOCK = BOARD_SRC.match(/const MARKET_SHORT: Record<string, string> = \{([\s\S]*?)\};/);
const BOARD_MARKETS = [...(MARKET_BLOCK?.[1] ?? "").matchAll(/(\w+):/g)].map((m) => m[1]);

const rowsOf = (board: readonly PropBoardGame[]) =>
  board.flatMap((g) => BOARD_MARKETS.flatMap((m) => g.markets?.[m] ?? []));
/* what the ALL scope prints: every row with a settle-book OVER price */
const allScopeRows = (board: readonly PropBoardGame[]) => rowsOf(board).filter((r) => r.cz?.o != null);
const teamless = (board: readonly PropBoardGame[]): PropBoardGame[] =>
  board.map((g) => ({ ...g, markets: Object.fromEntries(Object.entries(g.markets).map(([m, rs]) => [m, rs.map((r) => ({ ...r, tm: null }))])) }));

describe("hitPlayersOf — every player on the prop board, a team-less one by his name alone", () => {
  it("the Board walks the Props page's markets, in the Props page's order", () => {
    expect(BOARD_MARKETS).toEqual([...GEN_MARKETS]);
  });

  it("on the real fixture board: one entry per player the board names, in board order, with the engine's team", () => {
    const list = hitPlayersOf(BOARD, BOARD_MARKETS);
    const first = new Map<string, string | null>();
    for (const r of rowsOf(BOARD)) if (!first.has(r.p)) first.set(r.p, r.tm ?? null);
    expect(list.map((p) => p.name)).toEqual([...first.keys()]);
    expect(list.every((p) => p.team === first.get(p.name))).toBe(true);
    expect(list.length).toBe(110);
  });

  it("a team-less board is asked for in full, each player by his bare name with no team", () => {
    const list = hitPlayersOf(teamless(BOARD), BOARD_MARKETS);
    expect(list.map((p) => p.name)).toEqual(hitPlayersOf(BOARD, BOARD_MARKETS).map((p) => p.name));
    expect(list.every((p) => p.team === null)).toBe(true);
  });

  it("every ALL-scope row reads its log under a key the request carries — with a team or without", () => {
    for (const board of [BOARD, teamless(BOARD)]) {
      const asked = new Set(hitPlayersOf(board, BOARD_MARKETS).map((p) => hitKey(p.name)));
      const rows = allScopeRows(board);
      expect(rows.length).toBe(202);
      for (const r of rows) {
        const key = hitLogKey(propRowLabel(r));
        expect(key, r.p).toBe(hitKey(r.p));
        expect(asked.has(key), r.p).toBe(true);
      }
    }
    expect(hitLogKey("Aaron Judge (NYY)")).toBe("aaronjudge");
    expect(hitLogKey("Luis García Jr.")).toBe("luisgarciajr");
  });

  it("the stamped picks are appended after the board and never duplicated; a club or a total is not a player", () => {
    const board: PropBoardGame[] = [
      {
        game: "NYY @ DET", gkey: "g1", start: null, live: false,
        markets: {
          batter_hits: [
            { p: "Aaron Judge", tm: "NYY", ln: 0.5, lkey: "aaronjudge|batter_hits|0.5", o: null, oBook: null, u: null, uBook: null, cz: null, pO: null, fO: null, books: 0 },
            { p: "Luis Garcia", tm: null, ln: 0.5, lkey: "luisgarcia|batter_hits|0.5", o: null, oBook: null, u: null, uBook: null, cz: null, pO: null, fO: null, books: 0 },
          ],
        },
      },
    ];
    const stamped = {
      batter_hits: [{ player: "Aaron Judge (NYY)" }, { player: "Bench Bat" }, { player: null }],
      pitcher_strikeouts: [{ player: "Tarik Skubal (DET)" }],
      ml: [{ player: "Detroit Tigers" }],
      rl: [{ player: "Tigers RL +1.5" }],
      all: [{ player: "Aaron Judge (NYY)" }, { player: "Over 8.5" }],
    };
    expect(hitPlayersOf(board, BOARD_MARKETS, stamped)).toEqual([
      { name: "Aaron Judge", team: "NYY" },
      { name: "Luis Garcia", team: null },
      { name: "Bench Bat", team: null },
      { name: "Tarik Skubal", team: "DET" },
    ]);
    expect(hitPlayersOf([], BOARD_MARKETS, null)).toEqual([]);
  });

  it("on the fixture day the engine's selection pool leaves ALL-scope players out; the board list leaves none, and is the Props page's list", () => {
    const pool = new Set<string>();
    for (const list of Object.values(STAMPED)) for (const p of list) {
      const parsed = parseBoardLabel(p.player);
      if (parsed) pool.add(parsed.name);
    }
    const shown = new Set(allScopeRows(BOARD).map((r) => r.p));
    /* the magnitude of the gap on this day: 18 of the 99 players the ALL scope prints are outside the pool */
    expect(pool.size).toBe(88);
    expect(shown.size).toBe(99);
    expect([...shown].filter((n) => !pool.has(n)).length).toBe(18);

    const list = hitPlayersOf(BOARD, BOARD_MARKETS, STAMPED);
    const asked = new Set(list.map((p) => p.name));
    for (const n of shown) expect(asked.has(n), n).toBe(true);
    for (const n of pool) expect(asked.has(n), n).toBe(true);
    /* every stamped player is on this board, so the Board asks for exactly what the Props page asks for */
    expect(list).toEqual(hitPlayersOf(BOARD, GEN_MARKETS));
  });
});

/* a synthetic index with the collisions the resolver has to survive (tests/pick-positions.test.ts's shape) */
const DOC = {
  people: [
    { id: 1, fullName: "Aaron Judge", currentTeam: { id: 147 }, primaryPosition: { abbreviation: "RF" } },
    { id: 2, fullName: "José Ramírez", currentTeam: { id: 114 }, primaryPosition: { abbreviation: "3B" } },
    { id: 4, fullName: "Luis García", currentTeam: { id: 120 }, primaryPosition: { abbreviation: "2B" } },
    { id: 5, fullName: "Luis Garcia", currentTeam: { id: 135 }, primaryPosition: { abbreviation: "P" } },
    { id: 10, fullName: "Tarik Skubal", currentTeam: { id: 116 }, primaryPosition: { abbreviation: "P" } },
    { id: 12, fullName: "Nick Gonzales", currentTeam: { id: 134 }, primaryPosition: { abbreviation: "2B" } },
  ],
};
const INDEX: IndexEntry[] = buildIndex(DOC);

describe("/api/mlb/hit-rates answers a team-less name only when exactly one player carries it", () => {
  afterEach(() => vi.unstubAllGlobals());

  /* statsapi stand-in: one hitting game per asked id, and the ids every call asked for */
  function stubStatsapi() {
    const asked: number[][] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const ids = (String(url).match(/personIds=([\d,]+)/)?.[1] ?? "").split(",").filter(Boolean).map(Number);
      asked.push(ids);
      const people = ids.map((id) => ({
        id,
        primaryPosition: { abbreviation: INDEX.find((e) => e.id === id)?.pos ?? null },
        stats: [{ group: { displayName: "hitting" }, splits: [{ date: "2026-09-27", stat: { hits: 1, runs: 0, rbi: 0, homeRuns: 0, totalBases: 1, atBats: 4 } }] }],
      }));
      return new Response(JSON.stringify({ people }), { status: 200, headers: { "content-type": "application/json" } });
    });
    return asked;
  }
  const post = (players: { name: string; team: string | null }[]) =>
    POST(new NextRequest("http://localhost/api/mlb/hit-rates", { method: "POST", body: JSON.stringify({ players }), headers: { "content-type": "application/json" } }));

  it("a team-less bench bat and an accent-folded name resolve; the two Luis Garcias do not, so neither one's games are shown", async () => {
    idx.index = INDEX;
    const asked = stubStatsapi();
    const res = await post([
      { name: "Nick Gonzales", team: null },
      { name: "Jose Ramirez", team: null },
      { name: "Luis Garcia", team: null },
      { name: "Aaron Judge", team: "NYY" },
    ]);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { players: Record<string, PlayerLog> };
    expect(Object.keys(doc.players).sort()).toEqual(["aaronjudge", "joseramirez", "nickgonzales"]);
    expect(doc.players.nickgonzales.id).toBe(12);
    expect(doc.players.joseramirez.id).toBe(2);
    expect(asked.flat().sort((a, b) => a - b)).toEqual([1, 2, 12]); // neither Luis Garcia was ever fetched
  });

  it("the team is what breaks that tie: the same name with the Board's team resolves to that one player", async () => {
    idx.index = INDEX;
    stubStatsapi();
    const wsh = INDEX.find((e) => e.id === 4)!.team;
    expect(wsh).toBeTruthy();
    const doc = (await (await post([{ name: "Luis Garcia", team: wsh }])).json()) as { players: Record<string, PlayerLog> };
    expect(doc.players.luisgarcia?.id).toBe(4);
  });
});

describe("the Board asks for the whole board and reads each row's log through hitLogKey (source, comment-stripped)", () => {
  it("the list is hitPlayersOf over the board the ALL scope reads, every Board market, plus the stamped picks", () => {
    expect(BOARD_SRC).toMatch(
      /const pickPlayers = useMemo\(\s*\(\) => hitPlayersOf\(browseProps\.rows\.length \? browseProps\.rows : \(\(d\?\.propBoard \?\? \[\]\) as PropBoardGame\[\]\), Object\.keys\(MARKET_SHORT\), picksData\?\.picks\),\s*\[browseProps\.rows, d, picksData\],\s*\);/,
    );
    expect(BOARD_SRC).toContain("const pickHits = useHitRates(pickPlayers, pickPlayers.length > 0);");
    expect(BOARD_SRC).toContain("const pb = browseProps.rows.length ? browseProps.rows : (d?.propBoard ?? []) as PropBoardGame[];");
    expect(BOARD_SRC).toContain("stat={hitRate(pickHits.logs.get(hitLogKey(p.player)), p.market ?? cat, p.line, p.side, hitWindow)}");
  });

  it("the stamped-only, team-only list and its inline key are gone (each pattern first shown to match the old line)", () => {
    const OLD_PARSE = /const parsed = p\.player \? parseBoardLabel\(p\.player\) : null;/;
    const OLD_KEY = /pickHits\.logs\.get\(hitKey\(parseBoardLabel\(p\.player\)\?\.name \?\? p\.player\)\)/;
    expect("      const parsed = p.player ? parseBoardLabel(p.player) : null;").toMatch(OLD_PARSE);
    expect("stat={hitRate(pickHits.logs.get(hitKey(parseBoardLabel(p.player)?.name ?? p.player)), p.market ?? cat,").toMatch(OLD_KEY);
    expect(BOARD_SRC).not.toMatch(OLD_PARSE);
    expect(BOARD_SRC).not.toMatch(OLD_KEY);
  });

  it("the Props page builds its list with the same loop over the same rows, so the two pages share one request", () => {
    const props = readSrc("app/props/page.tsx");
    const helper = readSrc("src/lib/mlb/hit-players.ts");
    expect(props).toContain("const propBoard = browseProps.rows;");
    expect(props).toContain("for (const g of propBoard) for (const m of GEN_MARKETS) for (const r of g.markets?.[m] ?? []) {");
    expect(helper).toContain("for (const g of board) for (const m of markets) for (const r of g.markets?.[m] ?? []) {");
    const add = "if (!seen.has(r.p)) seen.set(r.p, { name: r.p, team: r.tm ?? null });";
    expect(props).toContain(add);
    expect(helper).toContain(add);
    expect(props).toContain("const hitRates = useHitRates(boardPlayers, boardPlayers.length > 0);");
  });
});
