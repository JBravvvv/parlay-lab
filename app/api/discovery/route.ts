import { NextRequest, NextResponse } from "next/server";
import { ptToday } from "@/lib/server/pt-date";
import { redis, redisGetJson, storeEnv } from "@/lib/server/store";
import { BOARD_KEY, decodeBoard } from "@/lib/server/board-store";
import { propsStore } from "@/lib/cfb/props-store";
export const dynamic="force-dynamic";
/** Public market snapshots only. Never invokes an odds feed or a ledger. */
export async function GET(req:NextRequest){
 const date=req.nextUrl.searchParams.get("date")||ptToday();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:"Invalid date"},{status:400});
 const sports=[...new Set((req.nextUrl.searchParams.get("sports")||"mlb,nfl,cfb").split(",").filter(s=>["mlb","nfl","cfb"].includes(s)))];
 const data:Record<string,unknown>={};
 if(storeEnv())await Promise.all(sports.map(async sport=>{try{
 if(sport==="mlb"){
 const b=decodeBoard(await redis(["GET",BOARD_KEY(date)]) as string|null);
 data.mlb=b?{date:b.date,at:b.at,data:{settlementBook:b.data.settlementBook,gameInfo:b.data.gameInfo,propBoard:b.data.propBoard,categories:{ml:b.data.categories?.ml??[],rl:b.data.categories?.rl??[]},bookQuotes:Object.fromEntries(Object.entries(b.data.bookQuotes??{}).filter(([key])=>/\|(?:ml|rl)_/.test(key))),parlays:[],parlaysMixed:[],parlaysLive:[]}}:null;
}
 else {const [props,slate]=await Promise.all([propsStore({board:`pl:${sport}:props:v1:`,spend:`pl:${sport}:props:spend:v1:`})?.readBoard(date),redisGetJson(`pl:discovery:${sport}:${date}`)]);data[sport]={props:props?{rows:props.rows,pricedAt:props.pricedAt}:null,slate};}
 }catch{data[sport]=null;}}));
 return NextResponse.json({date,data},{headers:{"Cache-Control":"private, max-age=30"}});
}
