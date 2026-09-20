"use client";
import {useState} from "react";
import type {CrossLeg} from "@/lib/cross-sport";
export function CrossMark({leg}:{leg:CrossLeg}){
 const [failed,setFailed]=useState<Set<string>>(()=>new Set());
 const fail=(src:string)=>setFailed(old=>new Set([...old,src]));
 const src=[leg.headshot,leg.logo].find((s):s is string=>!!s&&!failed.has(s));
 return <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-[10px] font-bold">
 {src?<img data-portrait-zoom={src === leg.headshot ? "in" : undefined} src={src} alt="" onError={()=>fail(src)} className="h-full w-full object-contain"/>:leg.label.split(" ").map(s=>s[0]).slice(0,2).join("")}
 {leg.logo&&src!==leg.logo&&!failed.has(leg.logo)&&<img src={leg.logo} alt="" onError={()=>fail(leg.logo!)} className="absolute left-0 top-0 h-3 w-3 object-contain"/>}
 <span className="absolute -bottom-1 text-[7px] uppercase text-muted">{leg.sport}</span></span>;
}
