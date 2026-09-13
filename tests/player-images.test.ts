import {describe,it,expect,vi} from "vitest";
import {addSleeperFallback,matchPlayerImage,parseImageRoster,type ImageTeam} from "@/lib/player-images";
const team:ImageTeam={id:"2",abbr:"BUF",name:"Buffalo Bills",logo:"https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",color:null,rank:null};
const roster={team:{id:"2"},athletes:[{items:[{id:"3918298",displayName:"Josh Allen",position:{abbreviation:"QB"}}]}]};
describe("Roster Lab image identity",()=>{
 it("uses verified ESPN roster IDs for ESPN photos, not a different provider's ID",()=>{
  const players=parseImageRoster(roster,team,"nfl");
  expect(players[0].srcs[0]).toContain("nfl/players/full/3918298.png");
  expect(matchPlayerImage(players,"Josh Allen","BUF")).toBe(players[0]);
  expect(parseImageRoster(roster,{...team,id:"3"},"nfl")).toEqual([]);
  expect(matchPlayerImage(players,"Josh Allen","DAL")).toBeNull();
 });
 it("uses the same ESPN MLB portrait source as Roster Lab and supports flat rosters",()=>{
  const flat={...roster,athletes:roster.athletes[0].items};
  expect(parseImageRoster(flat,team,"mlb")[0].srcs[0]).toContain("headshots/mlb/players/full/3918298.png");
 });
 it("rejects ambiguous names, including two current teams, and accepts scoped identity",()=>{
  const first=parseImageRoster(roster,team,"nfl")[0];
  const players=[first,{...first,id:"999",team:{...team,id:"3",abbr:"DAL"}}];
  expect(matchPlayerImage(players,"Josh Allen")).toBeNull();
  expect(matchPlayerImage(players,"Josh Allen",null,["2"])).toBe(first);
 });
 it("joins Sleeper fallback by name, team and position, ignoring misleading espn_id",()=>{
  const players=parseImageRoster(roster,team,"nfl");
  const data={"4984":{full_name:"Josh Allen",team:"BUF",position:"QB",espn_id:123},"99":{full_name:"Josh Allen",team:"DAL",position:"QB"}};
  const joined=addSleeperFallback(players,data);
  expect(joined[0].srcs).toEqual([players[0].srcs[0],"https://sleepercdn.com/content/nfl/players/4984.jpg"]);
  expect(addSleeperFallback(players,{...data,"123":data["4984"]})[0].srcs).toHaveLength(1);
 });
});
vi.mock("@/lib/server/player-images",()=>({imageCatalog:vi.fn(async()=>[])}));
import {GET} from "../app/api/player-images/route";
import {NextRequest} from "next/server";
import {imageCatalog} from "@/lib/server/player-images";
it("rejects unbounded or malformed roster requests before reaching providers",async()=>{
 for(const query of ["league=bad","league=cfb","league=nfl&teams=../1",`league=cfb&teams=${Array.from({length:33},(_,i)=>i+1).join(",")}`]) expect((await GET(new NextRequest(`https://test.local/api/player-images?${query}`))).status).toBe(400);
 expect(imageCatalog).not.toHaveBeenCalled();
});
it("caches successful public catalogs and never caches failures as an empty roster",async()=>{
 const good=await GET(new NextRequest("https://test.local/api/player-images?league=nfl"));
 expect(good.status).toBe(200);
 expect(good.headers.get("Cache-Control")).toContain("s-maxage=3600");
 vi.mocked(imageCatalog).mockRejectedValueOnce(new Error("offline"));
 const bad=await GET(new NextRequest("https://test.local/api/player-images?league=nfl"));
 expect(bad.status).toBe(503);
 expect(bad.headers.get("Cache-Control")).toBe("no-store");
});
