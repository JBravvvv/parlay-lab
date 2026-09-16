import { describe, expect, it } from "vitest";
import fx from "./fixtures/gen-pool.json";
import { buildPool } from "@/components/props/mlb-gen-pool";
import { excludePlayers, exclusionFilterKey, exclusionKey } from "@/lib/parlay-exclusions";
import { generate, poolOf, type GenSpec } from "@/lib/parlay-gen";
import type { PropBoardGame } from "@/engine";
const spec: GenSpec = {market:"batter_hits_runs_rbis", legs:2, legMinAm:-1000, legMaxAm:1000, payout:null, sides:"both", onePerGame:false, czOnly:false, includeStarted:true, modelOnly:false, pinned:[null,null]};
const pool = buildPool(fx.propBoard as unknown as PropBoardGame[], spec, 0);
describe("temporary player exclusions", () => {
  it("removes all lines and sides of a player from legs and the pin lookup without mutating the board", () => {
    const target = pool.legs[0];
    const filtered = excludePlayers(pool, new Set([exclusionKey(target)]));
    expect(filtered.legs.length).toBeLessThan(pool.legs.length);
    expect(filtered.legs.every(l => exclusionKey(l) !== exclusionKey(target))).toBe(true);
    expect(filtered.byId.has(target.id)).toBe(false);
    expect(pool.byId.has(target.id)).toBe(true);
    expect(generate(filtered, {...spec, pinned:[target.id,null]}, 1).ok).toBe(false);
    for (let seed=0;seed<30;seed++) {
      const result=generate(filtered,spec,seed);
      expect(result.ok).toBe(true);
      if(result.ok) expect(result.ticket.legs.every(l=>exclusionKey(l)!==exclusionKey(target))).toBe(true);
    }
  });
  it("covers football's game-prefixed player identities across games", () => {
    const original=pool.legs[0];
    const first={...original,id:"one",playerKey:"game1|same-player"};
    const second={...original,id:"two",playerKey:"game2|same-player"};
    const football=poolOf([first,second],pool);
    expect(excludePlayers(football,new Set([exclusionKey(first)])).legs).toHaveLength(0);
  });
  it("reset identity changes for filters but not pins, and an empty exclusion set restores the pool", () => {
    expect(exclusionFilterKey({...spec,pinned:["kept",null]})).toBe(exclusionFilterKey(spec));
    for(const patch of [{market:"batter_hits"},{positions:["WR"]},{phase:"live" as const},{legMinAm:-230},{style:"safer" as const},{legs:4}]) {
      expect(exclusionFilterKey({...spec,...patch})).not.toBe(exclusionFilterKey(spec));
    }
    expect(excludePlayers(pool,new Set())).toBe(pool);
  });
});
