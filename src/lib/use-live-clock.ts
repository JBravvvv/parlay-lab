"use client";
import {useSyncExternalStore} from "react";
let now=0;let timer:ReturnType<typeof setInterval>|undefined;const listeners=new Set<()=>void>();
function subscribe(listener:()=>void){listeners.add(listener);if(!timer){now=Date.now();timer=setInterval(()=>{now=Date.now();listeners.forEach(f=>f());},30_000);}return()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=undefined;}};}
export function useLiveClock(){return useSyncExternalStore(subscribe,()=>now,()=>0);}
