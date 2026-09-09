import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./helpers/source";

/**
 * DESK SEPARATION — the NFL tree and the CFB tree may not name each other's money
 * (2026-09-08, the NFL build). The sibling of tests/cfb-separation.test.ts, on the other side.
 *
 * Every literal below is a KEY — a localStorage key, a Redis key, an Odds API sport key, an ESPN
 * path, a route — and a key that crosses desks is a ledger that crosses desks. The scan is over
 * COMMENT-STRIPPED source, so a docblock that names a sibling desk to say "DISTINCT from …" is
 * allowed; a string literal is not. Directories that do not exist yet are skipped, so the guard
 * arms itself as builders land src/components/nfl, app/api/nfl and app/nfl.
 */
const root = process.cwd();
const NFL_TREE = ["src/lib/nfl", "src/components/nfl", "app/api/nfl", "app/nfl"];
const CFB_TREE = ["src/lib/cfb", "src/components/cfb", "app/api/cfb", "app/cfb"];
const SOURCE = /\.(ts|tsx)$/;

function walk(dir: string): string[] {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(rel));
    else if (SOURCE.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) out.push(rel);
  }
  return out;
}

const filesOf = (tree: string[]) => tree.flatMap(walk);
const offenders = (files: string[], literals: string[]) =>
  files.flatMap((f) => {
    const src = stripComments(fs.readFileSync(path.join(root, f), "utf8"));
    return literals.filter((lit) => src.includes(lit)).map((lit) => `${f}: ${lit}`);
  });

const CFB_LITERALS = ["pl_cfb", "pl:cfb", "americanfootball_ncaaf", "college-football", '"/api/cfb'];
const NFL_LITERALS = ["pl_nfl", "pl:nfl", '"/api/nfl'];
const MLB_LITERALS = ["pl_ledger", "pl_bank2", "pl_noplay", "pl:ledger:v1", "pl:bank:v1", "baseball_mlb"];

describe("the NFL tree never names CFB money", () => {
  const files = filesOf(NFL_TREE);
  it("scans a real tree (src/lib/nfl exists today)", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain(path.join("src/lib/nfl", "rules.ts"));
  });
  it("contains no CFB key, sport key, ESPN path or route", () => {
    expect(offenders(files, CFB_LITERALS)).toEqual([]);
  });
  it("contains no MLB key or sport key either", () => {
    expect(offenders(files, MLB_LITERALS)).toEqual([]);
  });
});

describe("the CFB tree never names NFL money", () => {
  const files = filesOf(CFB_TREE);
  it("scans a real tree", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain(path.join("src/lib/cfb", "rules.ts"));
  });
  it("contains no NFL key or route", () => {
    expect(offenders(files, NFL_LITERALS)).toEqual([]);
  });
  it("contains no MLB key or sport key either", () => {
    expect(offenders(files, MLB_LITERALS)).toEqual([]);
  });
});

describe("the two configs are two objects", () => {
  it("NFL_LEAGUE and CFB_LEAGUE share no key, redis key, event, trigger or route", async () => {
    const { NFL_LEAGUE } = await import("@/lib/nfl/rules");
    const { CFB_LEAGUE } = await import("@/lib/cfb/rules");
    const flatten = (o: unknown): string[] =>
      typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o as Record<string, unknown>).flatMap(flatten) : [];
    const nfl = new Set([...flatten(NFL_LEAGUE.keys), ...flatten(NFL_LEAGUE.redis), ...flatten(NFL_LEAGUE.events), ...flatten(NFL_LEAGUE.triggers), ...flatten(NFL_LEAGUE.routes)]);
    const cfb = [...flatten(CFB_LEAGUE.keys), ...flatten(CFB_LEAGUE.redis), ...flatten(CFB_LEAGUE.events), ...flatten(CFB_LEAGUE.triggers), ...flatten(CFB_LEAGUE.routes)];
    for (const k of cfb) expect(nfl.has(k), `${k} is shared by both desks`).toBe(false);
    expect(NFL_LEAGUE.feeds.oddsSportKey).not.toBe(CFB_LEAGUE.feeds.oddsSportKey);
    expect(NFL_LEAGUE.feeds.espnScoreboard).not.toBe(CFB_LEAGUE.feeds.espnScoreboard);
  });
});
