import { describe, expect, it, vi } from "vitest";
import { WorkspaceSession, WORKSPACE_KEY, CLOSED_TTL } from "@/lib/workspace-session";
import { holdTicket, movedLegs } from "@/lib/parlay-hold";
import { emptyPool, type GenResult } from "@/lib/parlay-gen";
function fixture() {
  let now = 1_800_000_000_000;
  const values = new Map<string,string>([["pl_ledger", "permanent-ledger"], ["pl_pass", "permanent-setting"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { values, storage, advance: (ms:number) => {now += ms;}, start: () => new WorkspaceSession(storage, () => now) };
}
describe("temporary app workspace", () => {
  it("restores independent page/sport filters, pins, drafts and undo after closing", () => {
    const f=fixture(), first=f.start();
    const draft={spec:{legs:4,pinned:["player-1"],markets:["anytime_td"]},slip:[{label:"Player 1",am:225}],history:["ticket-1"]};
    first.write("/props:nfl:draft",draft); first.write("/board:nfl:filter","spread"); first.write("/props:mlb:draft",{legs:2}); first.close();
    f.advance(CLOSED_TTL-1); const resumed=f.start();
    expect(resumed.restored).toBe(true); expect(resumed.read("/props:nfl:draft",()=>null)).toEqual(draft);
    expect(resumed.read("/board:nfl:filter",()=>null)).toBe("spread"); expect(resumed.read("/props:mlb:draft",()=>null)).toEqual({legs:2});
  });
  it.each([CLOSED_TTL,CLOSED_TTL+1,24*60*60_000])("starts fresh after %i ms closed without erasing permanent records", ms => {
    const f=fixture(), first=f.start(); first.write("draft","old"); first.write("sport","mlb"); first.close(); f.advance(ms);
    const fresh=f.start(); expect(fresh.restored).toBe(false); expect(fresh.read("draft",()=>null)).toBeNull(); expect(fresh.read("sport",()=>null)).toBeNull();
    expect(f.values.get("pl_ledger")).toBe("permanent-ledger"); expect(f.values.get("pl_pass")).toBe("permanent-setting");
  });
  it("does not expire a still-running background document, even after several hours", () => {
    const f=fixture(), running=f.start(); running.write("ticket","held"); running.flush(); f.advance(8*60*60_000); running.resume();
    expect(running.read("ticket",()=>null)).toBe("held"); running.close(); f.advance(60_000); expect(f.start().read("ticket",()=>null)).toBe("held");
  });
  it("uses the last checkpoint when a mobile OS kills the process without pagehide", () => {
    const f=fixture(), first=f.start(); first.write("draft",42); first.flush(); f.advance(CLOSED_TTL-1); expect(f.start().read("draft",()=>null)).toBe(42);
    f.advance(CLOSED_TTL); expect(f.start().restored).toBe(false);
  });
  it("round trips Set, Map and unbounded filters", () => {
    const f=fixture(), first=f.start(); const value={open:new Set(["game-1"]),prices:new Map([["player",225]]),range:{min:-Infinity,max:Infinity}};
    first.write("controls",value); first.close(); expect(f.start().read("controls",()=>null)).toEqual(value);
  });
  it.each(["not json",JSON.stringify({version:1,updatedAt:1,closedAt:"bad",values:{}}),JSON.stringify({version:999,values:{}})])("recovers corrupt storage: %s",raw => {
    const f=fixture(); f.values.set(WORKSPACE_KEY,raw); expect(f.start().restored).toBe(false);
  });
  it("continues in memory if browser storage is unavailable", () => {
    const session=new WorkspaceSession({getItem(){throw Error("denied");},setItem(){throw Error("full");}}); session.write("draft",[1,2]); session.flush(); expect(session.read("draft",()=>[])).toEqual([1,2]);
  });
  it("restored held tickets do not redraw while the board reloads, and absent quotes remain ineligible", () => {
    const f=fixture(), first=f.start();
    const result={ok:true,ticket:{key:"ticket",legs:[{id:"player-1",am:225,prob:.4,book:"DK",leg:{label:"Player 1"}}]}} as GenResult<unknown>;
    first.write("held",holdTicket(null,"request",true,()=>result).held); first.close();
    const saved=f.start().read("held",()=>null); const draw=vi.fn(()=>({ok:false,fail:{code:"no-rows"}} as GenResult<unknown>));
    const restored=holdTicket(saved,"request",false,draw);
    expect(restored.result).toEqual(result); expect(draw).not.toHaveBeenCalled();
    if(restored.result.ok) expect(movedLegs(restored.result.ticket.legs,emptyPool())).toBe(1);
  });
});
