"use client";
import {useEffect} from "react";
import {setSport} from "@/lib/sport";
import {LeagueProvider} from "@/components/football/LeagueContext";
import {NFL_DESK} from "@/lib/nfl/desk";
import {CfbPicksBoard} from "@/components/cfb/CfbPicksBoard";
export default function FirstSundaySixPage(){
 useEffect(()=>setSport("nfl"),[]);
 return <LeagueProvider desk={NFL_DESK}><CfbPicksBoard promotionOnly /></LeagueProvider>;
}
