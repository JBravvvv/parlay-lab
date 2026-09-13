"use client";
import {useEffect,useState} from "react";
import {matchPlayerImage,type ImageLeague,type PlayerImage} from "./player-images";
const requests = new Map<string,{at:number;promise:Promise<PlayerImage[]>}>();
/** Every mounted mark shares one catalog request per league/team scope. No per-player requests. */
function catalog(key:string) {
  const cached=requests.get(key);
  if(cached && Date.now()-cached.at<3_600_000) return cached.promise;
  const promise=fetch(`/api/player-images?${key}`).then(async r=>{if(!r.ok)throw new Error("images");return (await r.json()).players as PlayerImage[];}).catch(()=>{requests.delete(key);return [];});
  requests.set(key,{at:Date.now(),promise});
  return promise;
}
export function usePlayerImage(league:ImageLeague,name:string|null|undefined,team?:string|null,teamIds:readonly string[]=[]) {
  const [resolved,setResolved]=useState<{key:string;value:PlayerImage|null}|null>(null);
  const ids=[...new Set(teamIds)].sort().join(",");
  const identity=JSON.stringify([league,name,team,ids]);
  useEffect(()=>{
    if(!name || (league==="cfb" && !ids)) return;
    let active=true;
    const query=new URLSearchParams({league,...(league==="cfb"?{teams:ids}:{})}).toString();
    catalog(query).then(players=>{if(active)setResolved({key:identity,value:matchPlayerImage(players,name,team,ids?ids.split(","):[])});});
    return ()=>{active=false;};
  },[identity,league,name,team,ids]);
  return resolved?.key===identity?resolved.value:null;
}
