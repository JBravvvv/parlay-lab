import { afterEach, describe, expect, it, vi } from "vitest";
import { pacificDate, relevantSport, type SportSchedule } from "@/lib/relevant-sport";
import { GET } from "../app/api/relevant-sport/route";
const games:SportSchedule={nfl:1,cfb:3,mlb:2,mlbPlayoffs:2};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("fresh-launch sport priority",()=>{
 it.each([["2026-10-04","nfl"],["2026-10-03","cfb"],["2026-10-05","nfl"],["2026-10-06","mlb"],["2026-10-08","nfl"]])("selects %s => %s",(date,sport)=>expect(relevantSport(date,games)).toBe(sport));
 it("prioritizes Tuesday postseason baseball over weekday college games",()=>expect(relevantSport("2026-10-06",{...games,nfl:0})).toBe("mlb"));
 it("uses college football when it is the only weekday schedule",()=>expect(relevantSport("2026-10-06",{nfl:0,cfb:2,mlb:0,mlbPlayoffs:0})).toBe("cfb"));
 it("uses MLB on Monday when NFL is confirmed off",()=>expect(relevantSport("2026-10-05",{...games,nfl:0})).toBe("mlb"));
 it("keeps Monday NFL priority when that provider fails",()=>expect(relevantSport("2026-10-05",{...games,nfl:null})).toBe("nfl"));
 it("uses Pacific day boundaries",()=>{expect(pacificDate(new Date("2026-10-04T06:59:00Z"))).toBe("2026-10-03");expect(pacificDate(new Date("2026-10-04T07:01:00Z"))).toBe("2026-10-04");});
 it("does not fetch schedules on the explicit weekend priorities",async()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-04T20:00:00Z"));const fetch=vi.fn();vi.stubGlobal("fetch",fetch);expect((await(await GET()).json()).sport).toBe("nfl");expect(fetch).not.toHaveBeenCalled();});
 it("uses real schedule shape and excludes cancelled or postponed games",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-06T20:00:00Z"));
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes("statsapi")?{dates:[{games:[{gameType:"D",status:{detailedState:"Scheduled"}},{gameType:"W",status:{detailedState:"Postponed"}}]}]}:url.includes("college")?{events:[{status:{type:{name:"STATUS_SCHEDULED"}}}]}:{events:[{status:{type:{name:"STATUS_CANCELED"}}}]}})));
  expect(await(await GET()).json()).toMatchObject({date:"2026-10-06",sport:"mlb",games:{nfl:0,cfb:1,mlb:1,mlbPlayoffs:1}});
 });
 it("falls back without manufacturing games when providers fail",async()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-06T20:00:00Z"));vi.stubGlobal("fetch",vi.fn().mockRejectedValue(Error("offline")));expect(await(await GET()).json()).toMatchObject({sport:"mlb",games:{nfl:null,cfb:null,mlb:null,mlbPlayoffs:null}});});
});
