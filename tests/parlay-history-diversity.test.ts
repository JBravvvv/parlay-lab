import { describe, it, expect } from "vitest";
import { moveParlayHistory } from "@/lib/parlay-history";
import { exposureSpread } from "@/lib/cfb/picks";
import { rosterLookup, rosterPositions } from "@/lib/football/positions";

describe("generated ticket history", () => {
  it("restores exact snapshots back 20 times and forward 20 times, preserving quotes and filters", () => {
    const tickets = Array.from({length:21}, (_, i) => ({key:String(i), odds:100+i, positions:[i%2 ? "WR" : "RB"]}));
    const past = tickets.slice(0,20); const future: typeof tickets = [];
    let current = tickets[20];
    for (let i=19;i>=0;i--) {current = moveParlayHistory(past,future,current)!; expect(current).toBe(tickets[i]);}
    expect(moveParlayHistory(past,future,current)).toBeNull();
    for (let i=1;i<=20;i++) {current = moveParlayHistory(future,past,current)!; expect(current).toBe(tickets[i]);}
    expect(moveParlayHistory(future,past,current)).toBeNull();
  });
});
describe("Board player exposure", () => {
  const draft = (key: string, names: string[]) => ({key,legs:names.map(player=>({player,rowKey:`${key}:${player}`}))});
  it("does not repeat one highly ranked player across all six longshots, including different markets", () => {
    const repeated = Array.from({length:20},(_,i)=>draft(`top-${i}`,["Zonovan Knight",`Other ${i}`]));
    const alternatives = Array.from({length:20},(_,i)=>draft(`alt-${i}`,[`Fresh ${i}`,`Partner ${i}`]));
    const selected = exposureSpread([...repeated,...alternatives],6);
    expect(selected).toHaveLength(6);
    expect(selected.filter(d=>d.legs.some(l=>l.player==="Zonovan Knight")).length).toBeLessThanOrEqual(2);
    expect(new Set(selected.flatMap(d=>d.legs.map(l=>l.player))).size).toBeGreaterThanOrEqual(10);
  });
  it("returns fewer tickets when diversity is unavailable instead of relaxing the cap", () => {
    const selected=exposureSpread(Array.from({length:12},(_,i)=>draft(String(i),["Zonovan Knight",`Other ${i}`])),6);
    expect(selected).toHaveLength(2);
  });
  it("resolves a headshot and team only from an unambiguous game roster", () => {
    const players = rosterPositions({team:{id:"1"},athletes:[{items:[{id:"22",displayName:"Test Player",position:{abbreviation:"RB"},headshot:{href:"https://a.espncdn.com/i/headshots/nfl/players/full/22.png"}}]}]},"1");
    expect(rosterLookup(players)("Test Player",["1","2"])).toMatchObject({teamId:"1",headshot:expect.stringContaining("22.png")});
    expect(rosterLookup(players)("Test Player",["3","4"])).toBeNull();
    expect(rosterLookup([...players, {...players[0], teamId:"2"}])("Test Player",["1","2"])).toBeNull();
  });
});
