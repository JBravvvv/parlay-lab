"use client";
import { useLayoutEffect,useRef,useState,type ReactNode } from "react";
import {useVerticalDensity} from "@/lib/vertical-density";
/** Literal vertical-only 50% presentation requested by the owner. Width, source layout,
 * calculation, DOM order and keyboard semantics stay unchanged. Fixed slips use portals.
 * ResizeObserver keeps flow height matched to dynamic/filter-expanded content. */
export function VerticalDensity({children,enabled,toolbar}:{children:ReactNode;enabled:boolean;toolbar?:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);const [height,setHeight]=useState<number>();const [mode]=useVerticalDensity();
 const scale=enabled && mode==="half" ? 0.5 : 1;
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;const measure=()=>setHeight(el.offsetHeight);measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect();},[]);
 return <><div className="mb-2 flex items-center gap-2">{toolbar&&<div className="min-w-0 flex-1">{toolbar}</div>}</div><div data-density-scale={scale} className={enabled&&mode==="compact"?"density-compact":undefined} style={{height:scale===1||height==null?undefined:height*scale,overflow:scale===1?"visible":"clip"}}><div ref={ref} style={{transform:scale===1?undefined:`scaleY(${scale})`,transformOrigin:"top center",display:"flow-root"}}>{children}</div></div></>;
}
