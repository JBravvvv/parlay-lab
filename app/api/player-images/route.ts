import { NextRequest, NextResponse } from "next/server";
import { imageCatalog } from "@/lib/server/player-images";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const league=req.nextUrl.searchParams.get("league");
  const ids=[...new Set((req.nextUrl.searchParams.get("teams") ?? "").split(",").filter(Boolean))].sort();
  if (!(league==="mlb" || league==="nfl" || league==="cfb") || ids.length>32 || ids.some(id=>!/^\d{1,6}$/.test(id)) || (league==="cfb" && !ids.length)) return NextResponse.json({error:"Choose a league and valid team IDs."},{status:400});
  try { return NextResponse.json({players:await imageCatalog(league,ids.join(","))},{headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=300"}}); }
  catch { return NextResponse.json({players:[],error:"Player images temporarily unavailable"},{status:503,headers:{"Cache-Control":"no-store"}}); }
}
