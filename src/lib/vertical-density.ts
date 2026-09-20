"use client";
import {useEffect,useState} from "react";
export type DensityMode="compact"|"half"|"full";
const KEY="pl:vertical-density",EVENT="pl:density-change";
const valid=(s:unknown):s is DensityMode=>s==="compact"||s==="half"||s==="full";
export function useVerticalDensity(){
 const [mode,setMode]=useState<DensityMode>("compact");
 useEffect(()=>{
  const read=()=>{try{const s=localStorage.getItem(KEY);setMode(valid(s)?s:"compact");}catch{}};
  const local=(event:Event)=>{const value=(event as CustomEvent).detail;if(valid(value))setMode(value);};
  read();window.addEventListener(EVENT,local);window.addEventListener("storage",read);
  return()=>{window.removeEventListener(EVENT,local);window.removeEventListener("storage",read);};
 },[]);
 const choose=(value:string)=>{if(!valid(value))return;setMode(value);try{localStorage.setItem(KEY,value);}catch{}window.dispatchEvent(new CustomEvent(EVENT,{detail:value}));};
 return [mode,choose] as const;
}
