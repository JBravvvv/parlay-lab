import {describe,it,expect} from "vitest";
import {CFB_PROPS} from "@/lib/cfb/rules";
import {NFL_PROPS} from "@/lib/nfl/rules";
import {MLB_LIVE_PROPS} from "@/lib/mlb/live-props-rules";
import {MLB_LIVE_CLIENT} from "@/lib/mlb/live-client";
import {affordableEvents} from "@/lib/cfb/props-store";
import {mlbAffordableEvents} from "@/lib/mlb/live-props-store";
describe("100k monthly plan: no application daily caps",()=>{
 it("all active sport daily limits are unlimited",()=>{
  for(const c of [CFB_PROPS,NFL_PROPS,MLB_LIVE_PROPS,MLB_LIVE_CLIENT])expect(c.dailyBudget).toBe(Infinity);
 });
 it("previous spend cannot strand live or pregame events",()=>{
  for(const spent of [600,1000,2500,100000]){
   for(const c of [CFB_PROPS,NFL_PROPS])expect(affordableEvents(24,spent,c.dailyBudget,c.measuredCreditsPerEvent)).toBe(24);
   expect(mlbAffordableEvents(12,spent,2)).toBe(12);
  }
 });
});
