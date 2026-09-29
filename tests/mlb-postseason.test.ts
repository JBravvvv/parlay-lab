import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { shapeGame, inSeasonWindow, type ApiGame } from "@/lib/games";
import { priceMlbMoneylines } from "@/lib/sportsbook/mlb";
import type { BoardData } from "@/engine";
import fixture from "./fixtures/mlb/postseason-2026.json";
import { GET as calendar } from "../app/api/games/calendar/route";
import { GET as games } from "../app/api/games/route";
vi.mock("@/lib/server/store",()=>({storeEnv:()=>false,redis:vi.fn()}));
afterEach(()=>vi.unstubAllGlobals());
describe("MLB postseason",()=>{
 it("keeps official rounds and placeholder teams without false odds, records, or start times",()=>{
  for(const raw of fixture){
   const g=shapeGame(raw as ApiGame,{},[]);
   expect(inSeasonWindow(raw.officialDate)).toBe(true);
   expect(g.postseason?.round).toBe(raw.seriesDescription);
   expect(g.postseason?.game).toBe(raw.seriesGameNumber);
   expect(g.startTimeTBD).toBe(raw.status.startTimeTBD);
   if(raw.gameType!=="F"){expect(g.away.placeholder).toBe(true);expect(g.away.record).toBe("—");expect(g.away.ml).toBeNull();}
  }
  expect(shapeGame(fixture[3] as ApiGame,{},[]).postseason?.ifNecessary).toBe(true);
 });
 it("accepts October Games requests and returns the real placeholder",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({dates:[{games:[fixture[1]]}]}))));
  const res=await games(new NextRequest("http://localhost/api/games?date=2026-10-03"));
  expect(res.status).toBe(200);const body=await res.json();
  expect(body.games[0]).toMatchObject({pk:fixture[1].gamePk,startTimeTBD:true,away:{placeholder:true}});
 });
 it("builds round shortcuts from official dates, not synthetic midnight timestamps",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({dates:fixture.map(g=>({date:g.officialDate,games:[g]}))}))));
  expect(await (await calendar()).json()).toEqual({rounds:[{name:"Wild Card",date:"2026-09-29"},{name:"Division Series",date:"2026-10-03"},{name:"Championship Series",date:"2026-10-11"},{name:"World Series",date:"2026-10-31"}]});
 });
 it("shows both posted selected-book moneylines even when the ranked board chose one side",()=>{
  const data={categories:{ml:[{gkey:"a@b",lkey:"ml_away",label:"A ML",prob:55}]},gameInfo:{"a@b":{away:"A",home:"B"}},bookQuotes:{"a@b|ml_away|o":{draftkings:{am:-120}},"a@b|ml_home|o":{draftkings:{am:105}}}} as unknown as BoardData;
  const rows=priceMlbMoneylines(data,"draftkings");expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({label:"B ML",odds:105,book:"DraftKings"});expect(rows[1].prob).toBeUndefined();
  expect(priceMlbMoneylines(data,"fanduel")).toHaveLength(1);
 });
});
