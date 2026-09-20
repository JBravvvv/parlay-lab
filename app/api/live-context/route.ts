import { NextRequest,NextResponse } from "next/server";
import { footballContext,mlbContext } from "@/lib/pick-progress";
export async function GET(req:NextRequest){const sport=req.nextUrl.searchParams.get("sport"),game=req.nextUrl.searchParams.get("game");
 if(!["mlb","nfl","cfb"].includes(sport??"")||!/^\d{5,12}$/.test(game??""))return NextResponse.json({error:"Invalid game"},{status:400});
 const url=sport==="mlb"?`https://statsapi.mlb.com/api/v1.1/game/${game}/feed/live`:`https://site.api.espn.com/apis/site/v2/sports/football/${sport==="nfl"?"nfl":"college-football"}/summary?event=${game}`;
 try{const r=await fetch(url,{next:{revalidate:30},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error("Feed unavailable");const j=await r.json();return NextResponse.json((sport==="mlb"?mlbContext:footballContext)(j,new Date().toISOString()),{headers:{"Cache-Control":"public, max-age=20"}});}catch{return NextResponse.json({error:"Live stats unavailable"},{status:502});}}
